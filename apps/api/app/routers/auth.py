import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import get_current_profile
from ..models import Profile, Session
from ..schemas import (
    ChangePasswordIn,
    GoogleAuthIn,
    LoginIn,
    ProfileOut,
    ProfileUpdateIn,
    SessionOut,
    SignupIn,
    TokenOut,
)
from ..security import create_access_token, hash_password, sha256_token, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


async def _issue_session(profile: Profile, request: Request, db: AsyncSession) -> str:
    """Mint a signed token + its revocable sessions row. The JWT carries `sid`;
    logout/revocation kill the row, which kills the token server-side."""
    sid = uuid.uuid4()
    token = create_access_token(str(profile.id), profile.is_admin, session_id=str(sid))
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
async def signup(body: SignupIn, request: Request, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(Profile).where(Profile.email == body.email.lower()))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    profile = Profile(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(profile)
    await db.flush()  # assign profile.id before minting its session
    token = await _issue_session(profile, request, db)
    await db.refresh(profile)
    return TokenOut(token=token, profile=ProfileOut.model_validate(profile))


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    profile = await db.scalar(select(Profile).where(Profile.email == body.email.lower()))
    if not profile or not verify_password(body.password, profile.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    token = await _issue_session(profile, request, db)
    return TokenOut(token=token, profile=ProfileOut.model_validate(profile))


@router.post("/google", response_model=TokenOut)
async def google_auth(body: GoogleAuthIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Sign in / create an account with a Google ID token (Google Identity
    Services, client-side). The ID token is verified server-side against the
    configured OAuth client id — the client is never trusted. An email that
    already exists (password-created) is simply logged in: proving you own the
    Google account for that email is proof enough. Requires
    NV_GOOGLE_CLIENT_ID in the API env (501 when unset → the kid app hides the
    Google button rather than surfacing an error)."""
    client_id = settings.google_client_id
    if not client_id:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google sign-in not configured")
    try:
        from google.auth.exceptions import GoogleAuthError
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        info = id_token.verify_oauth2_token(body.id_token, google_requests.Request(), client_id)
    except (ValueError, GoogleAuthError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google credential") from e
    email = (info.get("email") or "").lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google account has no email")
    profile = await db.scalar(select(Profile).where(Profile.email == email))
    if not profile:
        profile = Profile(
            email=email,
            # Google-only account: a random password nobody knows. The parent
            # keeps signing in with Google (the `login` route needs the real
            # password, which only they could set by signing up with it).
            password_hash=hash_password(secrets.token_urlsafe(24)),
            display_name=info.get("name") or info.get("given_name"),
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
    """Update the parent's display name (shown across the portal + kid app)."""
    if body.display_name is not None and body.display_name.strip():
        profile.display_name = body.display_name.strip()[:80]
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
    be killed on its own; the sessions row is the kill-switch. (Legacy tokens
    without a session row get a no-op here — their expiry is the only limit.)"""
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
    for s in sessions:
        s.revoked_at = now
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


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordIn,
    request: Request,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Change the account password. Revokes every OTHER session so a leaked
    password's logins die immediately — only the device you're on stays in."""
    if not verify_password(body.current_password, profile.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")
    profile.password_hash = hash_password(body.new_password)
    now = datetime.now(timezone.utc)
    current = getattr(request.state, "session", None)
    sessions = (
        await db.scalars(
            select(Session).where(Session.profile_id == profile.id, Session.revoked_at.is_(None))
        )
    ).all()
    for s in sessions:
        if current is None or s.id != current.id:
            s.revoked_at = now
    await db.commit()
