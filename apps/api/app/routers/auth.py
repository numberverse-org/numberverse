import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import get_current_profile
from ..models import Profile
from ..schemas import GoogleAuthIn, LoginIn, ProfileOut, SignupIn, TokenOut
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


@router.post("/google", response_model=TokenOut)
async def google_auth(body: GoogleAuthIn, db: AsyncSession = Depends(get_db)):
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
        await db.commit()
        await db.refresh(profile)
    token = create_access_token(str(profile.id), profile.is_admin)
    return TokenOut(token=token, profile=ProfileOut.model_validate(profile))


@router.get("/me", response_model=ProfileOut)
async def me(profile: Profile = Depends(get_current_profile)):
    return profile
