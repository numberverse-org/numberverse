#!/usr/bin/env python3
"""#1774 — JWT signing-key rotation: kid claim + dual-key grace window.

Standalone (no pytest, no Postgres):  cd apps/api && python3 tests/test_jwt_rotation.py

Asserts:
  ① create_access_token mints `kid == settings.jwt_kid`; the payload round-trips
    sub/role/sid and FLOAT iat/exp through decode_token;
  ② simulating a rotation (jwt_secret → jwt_secret_old with its old kid, new
    secret → jwt_secret with a new kid) lets a PRE-rotation token STILL decode
    during the grace window, while a POST-rotation token decodes with the new
    key;
  ③ a token carrying an unknown kid is rejected;
  ④ a token with a KNOWN kid but a WRONG signature is rejected;
  ⑤ once jwt_secret_old is cleared, the pre-rotation token fails (window closed).

All monkeypatched settings are restored afterwards.
"""
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import jwt as pyjwt  # noqa: E402

from app.config import settings  # noqa: E402
from app.security import create_access_token, decode_token  # noqa: E402

fails = []
_count = 0


def check(name, got, want):
    global _count
    _count += 1
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def _now_claims(subject, kid, role="user"):
    now = datetime.now(timezone.utc)
    return {
        "kid": kid,
        "sub": str(subject),
        "role": role,
        "iat": now.timestamp(),
        "exp": (now + timedelta(minutes=15)).timestamp(),
    }


async def main():
    global _count, fails
    fails = []
    _count = 0

    # Save originals so every path restores the module settings.
    orig = {
        "secret": settings.jwt_secret,
        "kid": settings.jwt_kid,
        "secret_old": settings.jwt_secret_old,
        "kid_old": settings.jwt_kid_old,
    }

    try:
        print("①  current key — kid claim + sub/role/sid/iat/exp round-trip…")
        sid = uuid.uuid4()
        tok = create_access_token("parent1", "user", session_id=str(sid))
        payload = decode_token(tok)
        check("payload carries kid == settings.jwt_kid", payload["kid"], settings.jwt_kid)
        check("sub round-trips", payload["sub"], "parent1")
        check("role round-trips", payload["role"], "user")
        check("sid round-trips", payload["sid"], str(sid))
        check("iat is float (#865)", isinstance(payload["iat"], float), True)
        check("exp is float (#865)", isinstance(payload["exp"], float), True)

        print("②  rotation — pre-rotation token decodes in the grace window, new key decodes too…")
        old_secret = settings.jwt_secret
        old_kid = settings.jwt_kid
        pre_rotation = create_access_token("parent1", "user", session_id=str(sid))

        # Swap: old key → jwt_secret_old/jwt_kid_old, brand-new key becomes current.
        new_secret = secrets.token_hex(32)  # 64 hex chars, comfortably ≥32 bytes
        settings.jwt_secret_old = old_secret
        settings.jwt_kid_old = old_kid
        settings.jwt_secret = new_secret
        settings.jwt_kid = "v2"

        old_payload = decode_token(pre_rotation)
        check("pre-rotation token STILL decodes (grace window)", old_payload["sub"], "parent1")
        check("pre-rotation payload keeps the OLD kid", old_payload["kid"], old_kid)

        post_rotation = create_access_token("admin1", "admin", session_id=str(sid))
        new_payload = decode_token(post_rotation)
        check("post-rotation token decodes with the new key", new_payload["sub"], "admin1")
        check("post-rotation payload carries the NEW kid", new_payload["kid"], "v2")

        print("③  unknown kid → rejected…")
        unknown = pyjwt.encode(_now_claims("x1", "zzz"), new_secret, algorithm="HS256")
        try:
            decode_token(unknown)
            check("unknown kid raises", "no error", "InvalidTokenError")
        except pyjwt.InvalidTokenError as e:
            check("unknown kid raises", type(e).__name__, "InvalidTokenError")

        print("④  known kid + WRONG signature → rejected…")
        wrong_sig = pyjwt.encode(
            _now_claims("x2", "v2"), "a" * 48, algorithm="HS256"
        )
        try:
            decode_token(wrong_sig)
            check("wrong signature raises", "no error", "InvalidSignatureError")
        except pyjwt.InvalidSignatureError as e:
            check("wrong signature raises", type(e).__name__, "InvalidSignatureError")

        print("⑤  old key cleared → pre-rotation token fails (window closed)…")
        settings.jwt_secret_old = None
        try:
            decode_token(pre_rotation)
            check("pre-rotation token fails after grace window closes", "no error", "InvalidTokenError")
        except pyjwt.InvalidTokenError as e:
            check("pre-rotation token fails after grace window closes", type(e).__name__, "InvalidTokenError")
    finally:
        settings.jwt_secret = orig["secret"]
        settings.jwt_kid = orig["kid"]
        settings.jwt_secret_old = orig["secret_old"]
        settings.jwt_kid_old = orig["kid_old"]

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES")
        sys.exit(1)
    print(f"✓ all {_count} checks passed")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
