import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import Profile, Session
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


async def get_current_profile(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Profile:
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = decode_token(cred.credentials)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    # Revocable session — tokens minted after sessions shipped carry `sid`. The
    # row must exist and not be revoked, else the token is dead even if the JWT
    # itself hasn't expired. Legacy tokens (no sid) are accepted until expiry so
    # the deploy doesn't force-log-out in-flight parent + device sessions.
    sid = payload.get("sid")
    if sid:
        try:
            session_id = uuid.UUID(str(sid))
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
        session = await db.scalar(select(Session).where(Session.id == session_id))
        if session is None or session.revoked_at is not None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked — sign in again")
        # Throttled touch: a fresh last_seen for the "active logins" list without
        # a write on every request. Postgres returns naive TIMESTAMP columns, so
        # compare with a naive UTC "now" (aware would TypeError on the subtract).
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if not session.last_seen_at or (now - session.last_seen_at).total_seconds() > 300:
            session.last_seen_at = now
            await db.commit()
        request.state.session = session

    try:
        profile_id = uuid.UUID(payload.get("sub", ""))
    except (ValueError, AttributeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token subject")
    profile = await db.scalar(select(Profile).where(Profile.id == profile_id))
    if not profile:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Profile not found")
    return profile


async def require_admin(profile: Profile = Depends(get_current_profile)) -> Profile:
    # #846 — role boundary. "admin" and "super_admin" are the real roles now;
    # legacy is_admin=True rows (pre-role) still pass until the console moves.
    if profile.role not in {"admin", "super_admin"} and not profile.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required")
    return profile


async def require_super_admin(profile: Profile = Depends(get_current_profile)) -> Profile:
    # #846 — destructive / tenant-wide operations need the top role. The legacy
    # is_admin flag is accepted as super_admin-equivalent for backward compat.
    if profile.role != "super_admin" and not profile.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super admin privileges required")
    return profile
