import hashlib
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
    payload: dict[str, Any] = {
        "sub": str(subject),
        # #868 — role claim (informational/forward-compatible). `require_role`
        # always re-checks the DB via `get_current_profile`, so this claim is
        # never trusted alone; it just lets a future stateless consumer see the
        # subject's role without a DB hit. `role` supersedes the legacy
        # `is_admin` flag, which is intentionally NOT minted anymore.
        "role": role,
        "iat": now.timestamp(),
        "exp": (now + timedelta(minutes=settings.jwt_expires_minutes)).timestamp(),
    }
    # `sid` links this token to a sessions row → server-side revocation on
    # logout. Tokens minted without a session id (pre-upgrade) are accepted
    # until expiry so nobody is force-logged-out by the deploy.
    if session_id:
        payload["sid"] = str(session_id)
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
