from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_profile
from ..models import Profile
from ..schemas import LoginIn, ProfileOut, SignupIn, TokenOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupIn, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(Profile).where(Profile.email == body.email.lower()))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    profile = Profile(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    token = create_access_token(str(profile.id), profile.is_admin)
    return TokenOut(token=token, profile=ProfileOut.model_validate(profile))


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    profile = await db.scalar(select(Profile).where(Profile.email == body.email.lower()))
    if not profile or not verify_password(body.password, profile.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    token = create_access_token(str(profile.id), profile.is_admin)
    return TokenOut(token=token, profile=ProfileOut.model_validate(profile))


@router.get("/me", response_model=ProfileOut)
async def me(profile: Profile = Depends(get_current_profile)):
    return profile
