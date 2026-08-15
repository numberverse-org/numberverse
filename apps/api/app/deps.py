import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import Profile, Session
from .security import decode_token

# #868 — authorization-model guardrail. Kid-app devices are parent-credentialed
# TODAY: they authenticate with the parent's token, so they currently inherit
# full parent privileges (settings, reset, export, coins). A future direct-kid-
# auth MUST mint a role="kid" token, and every route must declare its allowed
# roles via `require_role` explicitly. The kid role must NEVER pass
# `require_parent` / `require_admin` / `require_super_admin`.

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


def require_role(*roles: str):
    """#868 — single role-checking path for every protected route.

    Resolves `get_current_profile`, then allows the request only when
    `profile.role` is one of `roles`. Legacy pre-role rows (`is_admin=True`)
    still pass ANY role check, so existing admin accounts never get locked out
    while the console migrates (#846).

    Today the kid app is parent-credentialed: it reuses the parent's token, so
    its traffic carries the parent's role and currently passes parent routes.
    This factory is the scaffold for direct kid auth — once kids get their own
    tokens, a kid token will carry `role="kid"`, and any route that does not
    explicitly allow "kid" rejects it.
    """
    allowed = set(roles)

    async def _require_role(profile: Profile = Depends(get_current_profile)) -> Profile:
        if profile.role not in allowed and not profile.is_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient privileges")
        return profile

    return _require_role


# #868 — parent routes are role-gated at the "user" boundary. This explicit
# alias documents that kid-role tokens are NOT allowed on parent routes; a
# future role="kid" credential can never silently inherit settings/reset/
# export/coins access.
require_parent = require_role("user", "admin", "super_admin")

# #846 — "admin" and "super_admin" are the real roles; require_admin accepts both.
require_admin = require_role("admin", "super_admin")

# #846 — destructive / tenant-wide operations need the top role.
require_super_admin = require_role("super_admin")
