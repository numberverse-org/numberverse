import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from .config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def sha256_token(token: str) -> str:
    """One-way fingerprint of a signed token — used to look up (and revoke) a
    session without ever storing the raw JWT."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(subject: str, role: str = "user", session_id: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    # #865 — emit iat/exp as FLOAT unix timestamps, not datetime objects.
    # PyJWT's datetime encoder (calendar.timegm) truncates to WHOLE seconds, so
    # a legacy no-sid token minted a microsecond after a logout-all/password-
    # change cutoff would carry iat == floor(cutoff) and be falsely rejected by
    # deps.get_current_profile's `iat <= marker_ts` check. Float timestamps keep
    # sub-second precision; deps.py already accepts int|float.
    # #1773 — short-lived access token: 15 min for parent/device, 10 min for
    # admin. The week-long credential is now the rotating httpOnly refresh cookie.
    lifetime_min = settings.admin_access_minutes if role in ("admin", "super_admin") else settings.jwt_access_minutes
    payload: dict[str, Any] = {
        "sub": str(subject),
        # #868 — role claim (informational/forward-compatible). `require_role`
        # always re-checks the DB via `get_current_profile`, so this claim is
        # never trusted alone; it just lets a future stateless consumer see the
        # subject's role without a DB hit. `role` supersedes the legacy
        # `is_admin` flag, which is intentionally NOT minted anymore.
        "role": role,
        "iat": now.timestamp(),
        "exp": (now + timedelta(minutes=lifetime_min)).timestamp(),
    }
    # `sid` links this token to a sessions row → server-side revocation on
    # logout. Tokens minted without a session id (pre-upgrade) are accepted
    # until expiry so nobody is force-logged-out by the deploy.
    if session_id:
        payload["sid"] = str(session_id)
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


# #1773 — rotating refresh cookie. The raw refresh token is NEVER stored or
# sent anywhere except this httpOnly cookie; the DB only keeps its SHA-256
# fingerprint (rotation swaps the hash in place, so a replayed old refresh
# dies immediately).
REFRESH_COOKIE_NAME = "nv_refresh"
_REFRESH_COOKIE_PATH = "/api/v1/auth"


def generate_refresh_token() -> str:
    """#1773 — opaque 48-byte URL-safe refresh token. The client only ever sees
    it inside the httpOnly cookie; the server stores `sha256_token(...)`."""
    return secrets.token_urlsafe(48)


def _is_https_request(request) -> bool:
    """#1773 — behind nginx the scheme is http but X-Forwarded-Proto is https."""
    proto = (request.headers.get("x-forwarded-proto") or "") if request.headers else ""
    return "https" in proto.lower() or getattr(request.url, "scheme", "") == "https"


def set_refresh_cookie(response, request, token: str) -> None:
    """#1773 — issue the rotating refresh token as an httpOnly + Secure +
    SameSite=strict session cookie scoped to /api/v1/auth. secure=True over
    https (prod/tunnel); secure=False only for plain-http LAN dev so the LAN
    portal flow keeps working."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=_is_https_request(request),
        samesite="strict",
        path=_REFRESH_COOKIE_PATH,
        max_age=settings.jwt_refresh_days * 86400,
    )


def clear_refresh_cookie(response, request) -> None:
    """#1773 — delete the refresh cookie on logout. Mirrors the same flags so
    browsers will actually drop it (a cookie set with Secure/Path/SameSite must
    be cleared with the matching attributes)."""
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path=_REFRESH_COOKIE_PATH,
        secure=_is_https_request(request),
        samesite="strict",
    )
