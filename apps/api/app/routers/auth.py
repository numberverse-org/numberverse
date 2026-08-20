import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import get_current_profile, resolve_plan
from ..models import Profile, Session
from ..ratelimit import AuthAttemptGuard, _request_ip, ip_rate_limit, redact_key
from ..deps import MAX_ACTIVE_SESSIONS_PER_PROFILE, _cap_active_sessions
from ..schemas import (
    ChangePasswordIn,
    DeleteAccountIn,
    GoogleAuthIn,
    LoginIn,
    ProfileOut,
    ProfileUpdateIn,
    RefreshOut,
    SessionOut,
    SetPasswordIn,
    SignupIn,
    TokenOut,
    VerifyPasswordIn,
)
from ..security import (
    REFRESH_COOKIE_NAME,
    clear_refresh_cookie,
    create_access_token,
    generate_refresh_token,
    hash_password,
    password_bytes_ok,
    set_refresh_cookie,
    sha256_token,
    verify_password,
)
from ..session_guard import revoke_other_sessions  # #265 — password change kills every OTHER session

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

logger = logging.getLogger("numberverse")


async def _profile_out(db: AsyncSession, profile: Profile) -> ProfileOut:
    """ProfileOut enriched with the resolved billing entitlement."""
    out = ProfileOut.model_validate(profile)
    plan, expires = await resolve_plan(db, profile)
    out.plan = plan
    out.plan_expires_at = expires
    return out

# #1489 — credential endpoints get their own failure-aware limiter (exponential
# lockout) rather than the throughput-oriented fixed window used by the write
# routers. Login keys on email+IP; change-password keys on profile+IP.
_LOGIN_GUARD = AuthAttemptGuard()
_PASSWORD_GUARD = AuthAttemptGuard()
# #771 — signup has no secret to fail on, so it gets a hard per-IP request cap
# (rather than the failure-aware guard above) to stop email enumeration and
# mass account creation. Signup is a rare one-time action; 10/min is generous.
# #3117 — the budget is deployment-configurable (`settings.signup_ip_per_minute`)
# because the kid app auto-creates one anonymous device account per install and
# share cards open on classroom Wi-Fi: many distinct families sit behind ONE
# shared public IP (CGNAT), so a hard-coded 10/min would false-positive 429 a
# whole classroom. Schools/Wi-Fi-heavy rollouts raise the value in env without
# a code change; account-creation volume is still independently bounded by the
# device-derived per-install id + the email-unique constraint.
_SIGNUP_RATE_LIMIT = ip_rate_limit(limit=settings.signup_ip_per_minute, tag="signup")
# #1773 — refresh-rotation is an unauthenticated endpoint (the cookie is the
# credential), so it gets a throughput cap per IP to stop cookie-replay brute
# force and endpoint abuse. 60/min is far above a real browser's refresh cadence.
_REFRESH_RATE_LIMIT = ip_rate_limit(limit=60, tag="refresh")
# #1669 / #3109 — /auth/google verifies a Google ID token on EVERY call (a
# server-side network+CPU round-trip to Google's certificate endpoint) and, on
# a FIRST login for a new email, AUTO-CREATES a Profile — the same mass-account-
# creation path signup exposes. It must therefore be throttled at the same 10/min
# per-IP budget as signup (#3109), not the looser 20/min it previously had. The
# dep rides the route, not the shared _verify_google_token helper (#1669).
_GOOGLE_RATE_LIMIT = ip_rate_limit(limit=10, tag="google")
# #1676 — /auth/set-password is the password-RECOVERY path: a Google-only
# account proves it still owns the Google account with a fresh ID token, then
# sets a real password. Recovery must be locked down HARDER than login — a
# handful of legit calls per account is normal, so 10/min per IP stops
# token-replay / verification abuse without touching the AuthAttemptGuard
# semantics on login/change-password (guard untouched, #1676).
_SET_PASSWORD_RATE_LIMIT = ip_rate_limit(limit=10, tag="set-password")
# #3119 — successful logins were throughput-unlimited: a compromised credential
# could mint unbounded Session rows (each lingering until the 30-day purge) and
# drive bcrypt cost without limit. A per-IP throughput cap stops the bcrypt/session
# mint flood. 20/min is generous for a real parent signing in on a couple of
# devices.
_LOGIN_RATE_LIMIT = ip_rate_limit(limit=20, tag="login")
# #3108 — DELETE /auth/me is a destructive WRITE that also performs a bcrypt
# password verification. It previously had NO throughput limiter, so an attacker
# holding a token could hammer the password check. 10/min per IP matches the
# retry budget a legitimate user needs while bounding the brute-force surface.
_DELETE_ACCOUNT_RATE_LIMIT = ip_rate_limit(limit=10, tag="delete-account")
# #3112 — the most distinct victim accounts a single IP may lock out per hour
# (each lockout = 5 wrong-password requests). Attacker who knows N emails can
# otherwise knock each one offline forever.
_MAX_LOCKOUTS_PER_IP_PER_HOUR = 3


def _check_password_bytes(password: str) -> None:
    """#1675 — reject a password that exceeds bcrypt's 72-BYTE window with a
    clear 422 BEFORE any bcrypt work.

    `len()` counts characters; bcrypt reads bytes. A 72-char emoji password is
    288 bytes and would otherwise be silently truncated to its first 72 bytes —
    letting two visually-different long passphrases authenticate as the same
    one. The schemas already cap at 72 CHARACTERS; this closes the byte gap."""
    if not password_bytes_ok(password):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Password too long (max 72 bytes)",
        )


def _verify_google_token(id_token: str) -> dict:
    """Verify a Google ID token server-side and return its decoded claims.

    Shared by /google (login/signup) and /set-password (recovery). A missing
    NV_GOOGLE_CLIENT_ID is a 501 so the kid app can hide the button instead of
    surfacing a dead-end error (#382).

    #801 — the audience is pinned EXPLICITLY to our OAuth client id so a token
    minted for a different Google client can never authenticate, and
    `email_verified` must be true — Google only sets it for a confirmed
    account email, so an unverified address cannot sign up / recover / log in.
    """
    client_id = settings.google_client_id
    if not client_id:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google sign-in not configured")
    try:
        from google.auth.exceptions import GoogleAuthError
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        info = google_id_token.verify_oauth2_token(
            id_token, google_requests.Request(), audience=[client_id]
        )
    except ImportError as e:
        # #1853 — google-auth is a lazy, optional dependency (the `from`
        # sits inside the try so an env without `google-auth` still boots).
        # A missing client library is a server capability gap, not the
        # client's fault: surface the same "not configured" body the unset
        # NV_GOOGLE_CLIENT_ID path returns (#382), as a 503, instead of
        # leaking an unhandled ImportError as a 500. This clause MUST precede
        # the 401 clause below: when the import failed, the name
        # GoogleAuthError is UNBOUND, and merely evaluating that clause's
        # tuple would itself raise and mask the real cause.
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in not configured"
        ) from e
    except (ValueError, GoogleAuthError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google credential") from e
    # #801 — absent/false `email_verified` is a rejected auth (401), never a 500.
    if not info.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google email not verified")
    return info


def _google_email(info: dict) -> str:
    email = (info.get("email") or "").lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google account has no email")
    return email


async def _issue_session(profile: Profile, request: Request, db: AsyncSession) -> tuple[str, str]:
    """Mint a signed short-lived access token + its revocable sessions row AND
    an opaque rotating refresh token. The access JWT carries `sid` + `role`; the
    refresh token's SHA-256 fingerprint lives in the same row (rotation swaps it
    in place). logout/revocation kill the row, which kills both credentials."""
    sid = uuid.uuid4()
    # #868 — mint the role claim (not the legacy is_admin flag). `require_role`
    # still re-checks the DB via `get_current_profile`, so the claim is
    # informational/forward-compatible only.
    token = create_access_token(str(profile.id), profile.role, session_id=str(sid))
    refresh_token = generate_refresh_token()
    db.add(
        Session(
            id=sid,
            profile_id=profile.id,
            token_hash=sha256_token(token),
            refresh_hash=sha256_token(refresh_token),
            refresh_expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_days),
            user_agent=(request.headers.get("user-agent") or "")[:200] or None,
            ip=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return token, refresh_token


async def _rotate_refresh_session(db: AsyncSession, refresh_token: str) -> tuple[str, str]:
    """#1773 — validate the refresh cookie and ROTATE: mint a new short-lived
    access token, swap the stored refresh hash (the OLD refresh dies
    immediately — it can no longer match any row), extend the refresh expiry.
    The new access token's `sid` still names the same row, and its fingerprint
    replaces the row's stored one (#773), so the token /refresh just issued is
    the valid bearer for this session's short remaining lifetime."""
    now = datetime.now(timezone.utc)
    h = sha256_token(refresh_token)
    row = await db.scalar(select(Session).where(Session.refresh_hash == h))
    if row is None or row.revoked_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    if row.refresh_expires_at is None or row.refresh_expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    profile = await db.scalar(select(Profile).where(Profile.id == row.profile_id))
    if profile is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Profile not found")
    new_access = create_access_token(str(profile.id), profile.role, session_id=str(row.id))
    new_refresh = generate_refresh_token()
    row.refresh_hash = sha256_token(new_refresh)
    # #773 — the row's fingerprint tracks the access token the server MOST
    # recently issued for this session. Rotation issues a NEW access token
    # (fresh iat/exp ⇒ a fresh fingerprint), so it must be stored in place:
    # deps.py rejects a bearer whose sha256 does not match the row, and an
    # un-rotated hash would 401 the very token /refresh just minted.
    row.token_hash = sha256_token(new_access)
    row.refresh_expires_at = now + timedelta(days=settings.jwt_refresh_days)
    row.last_seen_at = now
    await db.commit()
    return new_access, new_refresh


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _signup_limit: None = Depends(_SIGNUP_RATE_LIMIT),
    response: Annotated[Response, "response"] = None,  # #1773 — injected by FastAPI; None in direct unit calls
):
    _check_password_bytes(body.password)  # #1675 — reject before bcrypt
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
    try:
        # #1852 — the email unique constraint is the source of truth: two
        # CONCURRENT signups for the same email can both clear the lookup
        # above, and only the DB can arbitrate the race. Roll back and surface
        # the winner's IntegrityError (at flush or the session-issue commit)
        # as a clean 409 instead of an unhandled 500.
        await db.flush()  # assign profile.id before minting its session
        token, refresh_token = await _issue_session(profile, request, db)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered") from None
    if response is not None:
        set_refresh_cookie(response, request, refresh_token)
    await db.refresh(profile)
    return TokenOut(token=token, profile=await _profile_out(db, profile))


@router.post("/login", response_model=TokenOut)
async def login(
    body: LoginIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    response: Annotated[Response, "response"] = None,  # #1773 — injected by FastAPI; None in direct unit calls
    _login_limit: None = Depends(_LOGIN_RATE_LIMIT),  # #3119 — per-IP cap on successful + failed logins
):
    email = body.email.lower()
    ip = _request_ip(request)
    # #1489 — fail fast on a locked account/IP BEFORE the profile lookup and bcrypt.
    await _LOGIN_GUARD.raise_if_locked(db, f"login:email:{email}", f"login:ip:{ip}")
    profile = await db.scalar(select(Profile).where(Profile.email == email))
    if not profile or not verify_password(body.password, profile.password_hash):
        # #3112 — cap how many DISTINCT account lockouts this one IP may arm
        # (3/hour), so a single attacker can't lock out a list of known victims
        # indefinitely.
        await _LOGIN_GUARD.record_failure(
            db,
            f"login:email:{email}",
            f"login:ip:{ip}",
            ip=ip,
            max_distinct_lockouts=_MAX_LOCKOUTS_PER_IP_PER_HOUR,
        )
        # #1751 — credential-stuffing must leave a trace. Hash the email, never
        # log the raw address (the ip is redacted too).
        logger.warning(
            "auth 401 route=login account_key=login:email:%s ip=%s",
            redact_key(email), redact_key(ip),
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    await _LOGIN_GUARD.reset(db, f"login:email:{email}", f"login:ip:{ip}")
    # #3119 — bound a profile's active sessions before minting a new row, so a
    # compromised credential cannot mint unbounded Session rows.
    await _cap_active_sessions(db, profile.id)
    token, refresh_token = await _issue_session(profile, request, db)
    if response is not None:
        set_refresh_cookie(response, request, refresh_token)
    return TokenOut(token=token, profile=await _profile_out(db, profile))


@router.get("/google/status")
async def google_status():
    """Public: whether Google sign-in is configured on THIS server. The kid
    app checks this before showing its Google button — a frontend baked with
    VITE_GOOGLE_CLIENT_ID but a backend whose env lacks NV_GOOGLE_CLIENT_ID
    would otherwise render a button that 501s on every tap (#382)."""
    return {"enabled": bool(settings.google_client_id)}


@router.post("/google", response_model=TokenOut)
async def google_auth(
    body: GoogleAuthIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _google_limit: None = Depends(_GOOGLE_RATE_LIMIT),  # #1669 — per-IP cap on Google verification
    response: Annotated[Response, "response"] = None,  # #1773 — injected by FastAPI; None in direct unit calls
):
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
    token, refresh_token = await _issue_session(profile, request, db)
    if response is not None:
        set_refresh_cookie(response, request, refresh_token)
    return TokenOut(token=token, profile=await _profile_out(db, profile))


@router.get("/me", response_model=ProfileOut)
async def me(
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    return await _profile_out(db, profile)


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


@router.post("/refresh", response_model=RefreshOut)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _limiter: None = Depends(_REFRESH_RATE_LIMIT),
):
    """#1773 — rotate the httpOnly refresh cookie into a fresh short-lived
    access token. The cookie is the credential (no bearer token required). Each
    call issues a NEW refresh cookie and revokes the old one, so a stolen cookie
    is one-shot. A missing/invalid/expired refresh is a 401 → the client falls
    back to a full sign-in."""
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh session")
    access, new_refresh = await _rotate_refresh_session(db, token)
    set_refresh_cookie(response, request, new_refresh)
    return RefreshOut(access_token=access)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
    response: Annotated[Response, "response"] = None,  # #1773 — injected by FastAPI; None in direct unit calls
):
    """Revoke THIS session — the exact token that called. A stateless JWT can't
    be killed on its own; the sessions row is the kill-switch. Legacy no-sid
    tokens are materialized into a row by auth, so they are revocable here too.
    Also clears the httpOnly refresh cookie (when running as a real route)."""
    session: Session | None = getattr(request.state, "session", None)
    if session is not None and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
    if response is not None:
        clear_refresh_cookie(response, request)


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
async def set_password(
    body: SetPasswordIn,
    db: AsyncSession = Depends(get_db),
    _set_password_limit: None = Depends(_SET_PASSWORD_RATE_LIMIT),  # #1676 — recovery path locked down harder than login
):
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
    _check_password_bytes(body.new_password)  # #1675 — reject before bcrypt (and before Google verify)
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
    # #1675 — both the old secret being bcrypt-CHECKED and the new secret being
    # bcrypt-HASHED must fit bcrypt's 72-byte window; reject before the guard
    # and before any bcrypt work.
    _check_password_bytes(body.current_password)
    _check_password_bytes(body.new_password)
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


# #3004 — parent-gated re-confirm. The parent portal shows a "confirm your
# password before enabling notifications" prompt; this endpoint is what the
# UI calls to actually PROVE the parent (not a child/leaked-token holder) is
# at the keyboard. It mirrors change-password's verify_password path and
# reuses the SAME `_PASSWORD_GUARD` credential lockout (the pw: namespace is
# shared across change-password/delete-account/verify, so a token-holder
# brute-forcing one burns the same lockout budget as the others).
@router.post("/verify", response_model=dict, status_code=status.HTTP_200_OK)
async def verify_password_reconfirm(
    body: VerifyPasswordIn,
    request: Request,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Re-prove the parent's password (bearer token alone is NOT enough).

    A Google-only account has no password the parent knows (its hash is a
    random, un-knowable value) and must not be gated on a typed password — it
    falls through to its own confirmation contract, so attempt no bcrypt there
    (mirrors the #1487 change-password routing).
    """
    if profile.auth_provider == "google":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Google accounts have no password to verify — set one first",
        )
    _check_password_bytes(body.password)
    ip = _request_ip(request)
    await _PASSWORD_GUARD.raise_if_locked(db, f"pw:profile:{profile.id}", f"pw:ip:{ip}")
    if not verify_password(body.password, profile.password_hash):
        await _PASSWORD_GUARD.record_failure(db, f"pw:profile:{profile.id}", f"pw:ip:{ip}")
        logger.warning(
            "auth 401 route=verify-password account_key=pw:profile:%s ip=%s",
            redact_key(str(profile.id)), redact_key(ip),
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Password is incorrect")
    await _PASSWORD_GUARD.reset(db, f"pw:profile:{profile.id}", f"pw:ip:{ip}")
    return {"verified": True}


# #980 — right-to-erasure: DELETE /api/v1/auth/me removes the parent's
# entire account and all associated data (kids, mastery, sessions, events,
# stories, acceleration logs, settings) through the DB's CASCADE FKs.
@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_account(
    body: DeleteAccountIn,
    request: Request,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
    _delete_limit: None = Depends(_DELETE_ACCOUNT_RATE_LIMIT),  # #3108 — per-IP cap on the destructive endpoint
):
    """Permanently delete the parent account and ALL associated data.

    A local account confirms by re-entering its password (bcrypt-checked here).
    #1685 — a Google-only account has no password they know (its hash is a
    random, un-knowable value), so a typed phrase alone is NOT credential
    proof: a fresh Google ID token must ALSO be re-verified (mirroring
    /auth/set-password) and must match this account's email.

    Returns an ENUMERATED summary of what was deleted plus the retention
    exceptions. #980 — satisfies GDPR Art.17 right-to-erasure / COPPA 16 CFR
    312.6 deletion."""
    from ..models import (
        AccelerationLog,
        AdminAudit,
        Kid,
        LearningStory,
        ProgressEvent,
        SkillMastery,
    )
    from ..ratelimit import delete_profile_rate_limit_buckets
    from ..story_embedding_model import HAVE_VECTOR, StoryEmbedding

    # ── credential re-proof ──────────────────────────────────────────────
    if profile.auth_provider == "google":
        # #1685 — a fresh Google id_token is the CANARY proof of ownership.
        if body.confirmation.strip().lower() != "delete my account":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Type 'delete my account' to confirm",
            )
        id_token = (request.headers.get("X-Google-ID-Token") or "").strip()
        if not id_token:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Missing Google credential — provide a fresh ID token to delete this account",
            )
        info = _verify_google_token(id_token)
        if _google_email(info) != profile.email:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Google credential does not match this account",
            )
    else:
        # #1675 — the confirming password is bcrypt-CHECKED below and must fit
        # bcrypt's 72-byte window; reject before any bcrypt work.
        _check_password_bytes(body.password)
        ip = _request_ip(request)
        # #3108 — the confirming password is a credential gate with NO failure
        # guard historically: a token-holder could brute-force the parent
        # password at full bcrypt speed and the first correct guess deleted the
        # entire account. Arm the SAME credential lockout login/change-password
        # use — raise_if_locked BEFORE bcrypt, record_failure/reset after —
        # keyed on pw:profile + pw:ip (the pw: namespace is already shared, so a
        # token-holder running out of wrong guesses here also burns the
        # change-password lockout budget and vice-versa).
        await _PASSWORD_GUARD.raise_if_locked(db, f"pw:profile:{profile.id}", f"pw:ip:{ip}")
        if not verify_password(body.password, profile.password_hash):
            await _PASSWORD_GUARD.record_failure(db, f"pw:profile:{profile.id}", f"pw:ip:{ip}")
            logger.warning(
                "auth 401 route=delete-account account_key=pw:profile:%s ip=%s",
                redact_key(str(profile.id)), redact_key(ip),
            )
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Password is incorrect")
        await _PASSWORD_GUARD.reset(db, f"pw:profile:{profile.id}", f"pw:ip:{ip}")

    # ── enumerate summary quantities BEFORE deletion ─────────────────────
    kids = (await db.scalars(select(Kid).where(Kid.profile_id == profile.id))).all()
    kid_ids = [k.id for k in kids]
    kid_count = len(kids)
    session_count = (
        await db.scalar(
            select(func.count()).select_from(Session).where(Session.profile_id == profile.id)
        )
    ) or 0
    event_count = 0
    story_count = 0
    mastery_count = 0
    accel_count = 0
    if kid_ids:
        event_count = (
            await db.scalar(
                select(func.count()).select_from(ProgressEvent)
                .where(ProgressEvent.kid_id.in_(kid_ids))
            )
        ) or 0
        story_count = (
            await db.scalar(
                select(func.count()).select_from(LearningStory)
                .where(LearningStory.kid_id.in_(kid_ids))
            )
        ) or 0
        mastery_count = (
            await db.scalar(
                select(func.count()).select_from(SkillMastery)
                .where(SkillMastery.kid_id.in_(kid_ids))
            )
        ) or 0
        accel_count = (
            await db.scalar(
                select(func.count()).select_from(AccelerationLog)
                .where(AccelerationLog.kid_id.in_(kid_ids))
            )
        ) or 0

    # #1680 — the durable rate limiter keys by profile/email/IP and would keep
    # referencing the deleted account forever; remove NOW and surface the count.
    bucket_count = await delete_profile_rate_limit_buckets(
        db, profile.id, email=profile.email
    )

    # #1688 — AdminAudit is append-only by design (no FK), so it survives the
    # delete. Rotate every row's admin_id to an unlinkable random UUID so the
    # compliance paper trail no longer identifies the deleted account. (It is
    # a documented retention exception — see the note — not a deletion.)
    audit_rows = (
        await db.scalars(select(AdminAudit).where(AdminAudit.admin_id == profile.id))
    ).all()
    for row in audit_rows:
        row.admin_id = uuid.uuid4()

    # Delete the profile → CASCADE removes kids, sessions, subscriptions,
    # push_subscriptions, org_members, and every kid-chained row. The shared
    # org curriculum (subjects/skills/content/config tenant rows) is DISOWNED
    # — SET NULL per #1686 — never cascade-deleted.
    await db.delete(profile)
    await db.commit()

    # #1682 — kids/story rows are gone, but story_embeddings can survive where
    # its FK was migrated without ON DELETE CASCADE (#943): sweep orphans.
    embed_pruned = 0
    if HAVE_VECTOR and StoryEmbedding is not None and kid_count:
        embed_result = await db.execute(
            text(
                "DELETE FROM story_embeddings "
                "WHERE story_id NOT IN (SELECT id FROM learning_stories)"
            )
        )
        embed_pruned = getattr(embed_result, "rowcount", None) or 0
        await db.commit()

    return {
        "deleted": True,
        "profile_id": str(profile.id),
        "kids_removed": kid_count,
        "sessions_removed": session_count,
        "mastery_removed": mastery_count,
        "events_removed": event_count,
        "stories_removed": story_count,
        "acceleration_removed": accel_count,
        "rate_limit_buckets_removed": bucket_count,
        "story_embeddings_pruned": embed_pruned,
        # #1684 — enumerate what was ACTUALLY deleted and call out the explicit
        # retention exceptions instead of overstating "All associated data …
        # removed via cascade."
        "note": (
            "Profile, kids, per-kid settings, sessions, subscriptions, web-push "
            f"subscriptions and org memberships deleted. Kid pedagogy: mastery "
            f"({mastery_count}), progress events ({event_count}), learning "
            f"stories ({story_count}), acceleration log ({accel_count}), and "
            f"orphaned story vectors ({embed_pruned}) removed. Durable "
            f"rate-limit buckets ({bucket_count}) cleared. ORGANIZATION "
            "retention: deleting an org owner PROFILE does not delete the "
            "organization or its shared curriculum — tenant-scoped subjects, "
            "skills, content and config are disowned (SET NULL), never "
            "cascaded. EXCEPTION (retained, not editable here): the append-only "
            "AdminAudit compliance trail survives but its admin id is rotated "
            "so it no longer identifies this account. EXCEPTION (retained): "
            "server log files under data/error.log are PII-redacted and rotate "
            "at 1 MiB × 3 (see errorlog.py); they are not rewritten on "
            "deletion. EXCEPTION (outside server reach): on-device app caches "
            "are cleared by the client and expire within its normal refresh "
            "cycle."
        ),
    }
