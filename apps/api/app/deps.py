import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import Profile
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


async def get_current_profile(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Profile:
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = decode_token(cred.credentials)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    try:
        profile_id = uuid.UUID(payload.get("sub", ""))
    except (ValueError, AttributeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token subject")
    profile = await db.scalar(select(Profile).where(Profile.id == profile_id))
    if not profile:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Profile not found")
    return profile


async def require_admin(profile: Profile = Depends(get_current_profile)) -> Profile:
    if not profile.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required")
    return profile
