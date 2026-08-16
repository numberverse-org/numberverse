import logging
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import get_current_profile
from ..models import Profile, Session
from ..ratelimit import AuthAttemptGuard, _request_ip, ip_rate_limit, redact_key
from ..schemas import (
    ChangePasswordIn,
    DeleteAccountIn,
    GoogleAuthIn,
    LoginIn,
    ProfileOut,
    ProfileUpdateIn,
    SessionOut,
    SetPasswordIn,
    SignupIn,
    TokenOut,
)
from ..security import create_access_token, hash_password, sha256_token, verify_password
from ..session_guard import revoke_other_sessions  # #265 — password change kills every OTHER session

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

logger = logging.getLogger("numberverse")

# #1489 — credential endpoints get their own failure-aware limiter (exponential
# lockout) rather than the throughput-oriented fixed window used by the write
# routers. Login keys on email+IP; change-password keys on profile+IP.
_LOGIN_GUARD = AuthAttemptGuard()
_PASSWORD_GUARD = AuthAttemptGuard()
# #771 — signup has no secret to fail on, so it gets a hard per-IP request cap
# (rather than the failure-aware guard above) to stop email enumeration and
# mass account creation. Signup is a rare one-time action; 10/min is generous.
_SIGNUP_RATE_LIMIT = ip_rate_limit(limit=10)


def _verify_google_token(id_token: str) -> dict:
    """Verify a Google ID token server-side and return its decoded claims.

    Shared by /google (login/signup) and /set-password (recovery). A missing
    NV_GOOGLE_CLIENT_ID is a 501 so the kid app can hide the button instead of
    surfacing a dead-end error (#382)."""
    client_id = settings.google_client_id
    if not client_id:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google sign-in not configured")
    try:
        from google.auth.exceptions import GoogleAuthError
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        return google_id_token.verify_oauth2_token(id_token, google_requests.Request(), client_id)
    except (ValueError, GoogleAuthError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google credential") from e


def _google_email(info: dict) -> str:
    email = (info.get("email") or "").lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google account has no email")
    return email


async def _issue_session(profile: Profile, request: Request, db: AsyncSession) -> str:
    """Mint a signed token + its revocable sessions row. The JWT carries `sid`
    and `role`; logout/revocation kill the row, which kills the token
    server-side."""
    sid = uuid.uuid4()
    # #868 — mint the role claim (not the legacy is_admin flag). `require_role`
    # still re-checks the DB via `get_current_profile`, so the claim is
    # informational/forward-compatible only.
    token = create_access_token(str(profile.id), profile.role, session_id=str(sid))
    db.add(
        Session(
            id=sid,
            profile_id=profile.id,
            token_hash=sha256_token(token),
            user_agent=(request.headers.get("user-agent") or "")[:200] or None,
            ip=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return token


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _signup_limit: None = Depends(_SIGNUP_RATE_LIMIT),
):
    existing = await db.scalar(select(Profile).where(Profile.email == body.email.lower()))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    profile = Profile(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        auth_provider="local",
        # #985 — stamp verifiable-parental-consent at signup
        consent_version="1.0",
        consent_at=datetime.now(timezone.utc),
        consent_method="signup",
    )
    db.add(profile)
    await db.flush()  # assign profile.id before minting its session
    token = await _issue_session(profile, request, db)
    await db.refresh(profile)
    return TokenOut(token=token, profile=ProfileOut.model_validate(profile))


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    ip = _request_ip(request)
    # #1489 — fail fast on a locked account/IP BEFORE the profile lookup and bcrypt.
    await _LOGIN_GUARD.raise_if_locked(db, f"login:email:{email}", f"login:ip:{ip}")
    profile = await db.scalar(select(Profile).where(Profile.email == email))
    if not profile or not verify_password(body.password, profile.password_hash):
        await _LOGIN_GUARD.record_failure(db, f"login:email:{email}", f"login:ip:{ip}")
        # #1751 — credential-stuffing must leave a trace. Hash the email, never
        # log the raw address (the ip is redacted too).
        logger.warning(
            "auth 401 route=login account_key=login:email:%s ip=%s",
            redact_key(email), redact_key(ip),
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    await _LOGIN_GUARD.reset(db, f"login:email:{email}", f"login:ip:{ip}")
    token = await _issue_session(profile, request, db)
    return TokenOut(token=token, profile=ProfileOut.model_validate(profile))


@router.get("/google/status")
async def google_status():
    """Public: whether Google sign-in is configured on THIS server. The kid
    app checks this before showing its Google button — a frontend baked with
    VITE_GOOGLE_CLIENT_ID but a backend whose env lacks NV_GOOGLE_CLIENT_ID
    would otherwise render a button that 501s on every tap (#382)."""
    return {"enabled": bool(settings.google_client_id)}


@router.post("/google", response_model=TokenOut)
async def google_auth(body: GoogleAuthIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Sign in / create an account with a Google ID token (Google Identity
    Services, client-side). The ID token is verified server-side against the
    configured OAuth client id — the client is never trusted. An email that
    already exists (password-created) is simply logged in: proving you own the
    Google account for that email is proof enough. Requires
    NV_GOOGLE_CLIENT_ID in the API env (501 when unset → the kid app hides the
    Google button rather than surfacing an error)."""
    info = _verify_google_token(body.id_token)
    email = _google_email(info)
    profile = await db.scalar(select(Profile).where(Profile.email == email))
    if not profile:
        profile = Profile(
            email=email,
            # Google-only account: a random password nobody knows. The parent
            # keeps signing in with Google (the `login` route needs the real
            # password, which only they could set by signing up with it).
            # `auth_provider="google"` is the signal #1487 exposes so the portal
            # routes these parents to /set-password instead of the dead-end
            # change-password form.
            password_hash=hash_password(secrets.token_urlsafe(24)),
            display_name=info.get("name") or info.get("given_name"),
            auth_provider="google",
            # #985 — consent also stamped for Google signups
            consent_version="1.0",
            consent_at=datetime.now(timezone.utc),
            consent_method="google_signup",
        )
        db.add(profile)
        await db.flush()  # assign profile.id before minting its session
    token = await _issue_session(profile, request, db)
    return TokenOut(token=token, profile=ProfileOut.model_validate(profile))


@router.get("/me", response_model=ProfileOut)
async def me(profile: Profile = Depends(get_current_profile)):
    return profile


@router.patch("/me", response_model=ProfileOut)
async def update_me(
    body: ProfileUpdateIn,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Update the parent's display name (shown across the portal + kid app) and
    the #330 aggregate privacy opt-in."""
    changed = False
    if body.display_name is not None and body.display_name.strip():
        profile.display_name = body.display_name.strip()[:80]
        changed = True
    if body.aggregate_opt_in is not None:
        profile.aggregate_opt_in = body.aggregate_opt_in
        changed = True
    if changed:
        await db.commit()
        await db.refresh(profile)
    return profile


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Revoke THIS session — the exact token that called. A stateless JWT can't
    be killed on its own; the sessions row is the kill-switch. Legacy no-sid
    tokens are materialized into a row by auth, so they are revocable here too."""
    session: Session | None = getattr(request.state, "session", None)
    if session is not None and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Revoke EVERY session on this account, including the caller's. Use for
    "sign out on all devices" or "I think my password leaked"."""
    now = datetime.now(timezone.utc)
    sessions = (
        await db.scalars(
            select(Session).where(Session.profile_id == profile.id, Session.revoked_at.is_(None))
        )
    ).all()
    revoke_other_sessions(sessions, None, now)  # #265 — sign out everywhere, caller included
    # #865 — legacy no-sid tokens have no row to revoke; stamp the cutoff so any
    # such token minted before this logout is rejected on its next request.
    profile.legacy_sessions_revoked_at = now
    await db.commit()


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    request: Request,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Active logins on this account, newest first, with the caller flagged."""
    rows = (
        await db.scalars(
            select(Session)
            .where(Session.profile_id == profile.id, Session.revoked_at.is_(None))
            .order_by(Session.created_at.desc())
        )
    ).all()
    current_sid = getattr(getattr(request.state, "session", None), "id", None)
    return [
        SessionOut(
            id=s.id,
            created_at=s.created_at,
            last_seen_at=s.last_seen_at,
            user_agent=s.user_agent,
            ip=s.ip,
            current=s.id == current_sid,
        )
        for s in rows
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Revoke one specific session (e.g. an old phone still logged in)."""
    s = await db.scalar(
        select(Session).where(
            Session.id == session_id,
            Session.profile_id == profile.id,
            Session.revoked_at.is_(None),
        )
    )
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    s.revoked_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/set-password", status_code=status.HTTP_204_NO_CONTENT)
async def set_password(body: SetPasswordIn, db: AsyncSession = Depends(get_db)):
    """#1488 — password recovery for a Google-only account.

    A parent who previously only signed in with Google can prove they still own
    the Google account with a fresh ID token and then set a real password. The
    account is flipped to `local` so email/password login works from then on.
    There is intentionally NO forgot-password/email-reset endpoint yet: this
    service has no email-sending infrastructure, so the Google-token-backed
    set-password is the minimum viable recovery path.

    Credential material is never exposed: a token whose email has no matching
    Google-only profile gets the same generic 400 as an already-local account.
    All existing sessions are revoked — the old random-hash credential era is
    over and any leaked tokens die with it."""
    info = _verify_google_token(body.id_token)
    email = _google_email(info)
    profile = await db.scalar(select(Profile).where(Profile.email == email))
    if not profile or profile.auth_provider != "google":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Google account not recognized or password already set",
        )
    profile.password_hash = hash_password(body.new_password)
    profile.auth_provider = "local"
    now = datetime.now(timezone.utc)
    sessions = (
        await db.scalars(
            select(Session).where(Session.profile_id == profile.id, Session.revoked_at.is_(None))
        )
    ).all()
    revoke_other_sessions(sessions, None, now)
    # #865 — legacy no-sid tokens are unreachable through `sessions`; kill them
    # with the profile cutoff instead.
    profile.legacy_sessions_revoked_at = now
    await db.commit()


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordIn,
    request: Request,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Change the account password. Revokes every OTHER session so a leaked
    password's logins die immediately — only the device you're on stays in."""
    # #1487 — a Google-only account has no current password to verify (the hash
    # is a random, unknowable value). Route it to /set-password instead of the
    # old silent 401 loop.
    if profile.auth_provider == "google":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Google accounts can't change a password here — set a password first",
        )
    ip = _request_ip(request)
    # #1489 — fail fast when this profile or IP is locked, BEFORE bcrypt.
    await _PASSWORD_GUARD.raise_if_locked(db, f"pw:profile:{profile.id}", f"pw:ip:{ip}")
    if not verify_password(body.current_password, profile.password_hash):
        await _PASSWORD_GUARD.record_failure(db, f"pw:profile:{profile.id}", f"pw:ip:{ip}")
        # #1751 — wrong-password 401s must leave a trace. Hash the profile id
        # (the raw id and ip never reach the log).
        logger.warning(
            "auth 401 route=change-password account_key=pw:profile:%s ip=%s",
            redact_key(str(profile.id)), redact_key(ip),
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")
    await _PASSWORD_GUARD.reset(db, f"pw:profile:{profile.id}", f"pw:ip:{ip}")
    profile.password_hash = hash_password(body.new_password)
    now = datetime.now(timezone.utc)
    current = getattr(request.state, "session", None)
    sessions = (
        await db.scalars(
            select(Session).where(Session.profile_id == profile.id, Session.revoked_at.is_(None))
        )
    ).all()
    # #265 — the security contract: every OTHER session dies NOW; the device
    # doing the change stays signed in. A leaked token stops working immediately.
    revoke_other_sessions(sessions, current.id if current else None, now)
    # #865 — legacy no-sid tokens have no `sessions` row; the cutoff rejects any
    # such token minted on or before this password change. The current legacy
    # token (if any) was materialized by get_current_profile and is kept by
    # revoke_other_sessions above.
    profile.legacy_sessions_revoked_at = now
    await db.commit()


# #980 — right-to-erasure: DELETE /api/v1/auth/me removes the parent's
# entire account and all associated data (kids, mastery, sessions, events,
# stories, acceleration logs, settings) through the DB's CASCADE FKs.
@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_account(
    body: DeleteAccountIn,
    request: Request,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete the parent account and ALL associated data. The parent
    must confirm by sending their password. Returns a summary of what was deleted.
    #980 — satisfies GDPR Art.17 right-to-erasure / COPPA 16 CFR 312.6 deletion."""
    from ..models import Kid

    # Google-only accounts can't provide a password they set — require the typed
    # confirmation string as the safeguard instead.
    if profile.auth_provider == "google":
        if body.confirmation.strip().lower() != "delete my account":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Type 'delete my account' to confirm",
            )
    else:
        if not verify_password(body.password, profile.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Password is incorrect")
    # Gather summary quantities before deletion
    kids = (await db.scalars(select(Kid).where(Kid.profile_id == profile.id))).all()
    kid_count = len(kids)
    session_count = (
        await db.scalar(
            select(func.count()).select_from(Session).where(Session.profile_id == profile.id)
        )
    ) or 0
    # Delete the profile → CASCADE removes kids, sessions, and all FK-chained rows
    await db.delete(profile)
    await db.commit()
    return {
        "deleted": True,
        "profile_id": str(profile.id),
        "kids_removed": kid_count,
        "sessions_removed": session_count,
        "note": "All associated data (mastery, progress events, learning stories, acceleration logs, settings) removed via cascade.",
    }
