#!/usr/bin/env python3
"""#3002/#3003/#3004 — push delivery path + VAPID validation + password re-confirm.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_push_delivery.py

Asserts:
  ① #3003 (API half) — VAPID key handling: an unconfigured keypair yields an
     explicit "not configured" result (never a crash); a CONFIGURED keypair
     derives its public key and mints a well-formed `vapid t=,k=` authorization
     header; a MALFORMED key is treated as unusable.
  ② #3002 — the delivery module actually SENDS: `send_notification` posts a
     payload to a (fake) endpoint via HTTPX, returns "sent" on 2xx and skips
     cleanly ("not_configured") when VAPID is absent, and isolates a failing
     endpoint (returns "failed", never raises).
  ③ #3004 — `POST /auth/verify` re-checks the parent's password: wrong password
     → 401 + a recorded failure on the shared `_PASSWORD_GUARD`; correct → 200
     `{"verified": True}`; a Google-only account → 400 (no password to verify).
"""
import asyncio
import base64
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

from app import security  # noqa: E402
from app.config import settings  # noqa: E402
from app.push_delivery import (  # noqa: E402
    build_vapid_authorization,
    build_weekly_payload,
    derive_public_key_b64url,
    send_notification,
)
from app.routers import auth  # noqa: E402
from app.schemas import VerifyPasswordIn  # noqa: E402

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


# ── test keypair (generated here, used across sections) ────────────────────

def _make_keypair():
    from cryptography.hazmat.primitives.asymmetric import ec

    priv = ec.generate_private_key(ec.SECP256R1())
    raw = priv.private_numbers().private_value.to_bytes(32, "big")
    b64 = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    return b64


# ── HTTPX transport fakes ──────────────────────────────────────────────────

class _FakeResp:
    def __init__(self, status):
        self.status_code = status


class _FakeAsyncClient:
    def __init__(self, status, raise_on_post=False):
        self._status = status
        self._raise = raise_on_post
        self.posts = []

    async def post(self, url, *, content=None, headers=None):
        self.posts.append((url, content, headers))
        if self._raise:
            raise RuntimeError("boom")
        return _FakeResp(self._status)

    async def aclose(self):
        pass


# ── Fake auth guard (spy) ──────────────────────────────────────────────────

class _FakeGuard:
    def __init__(self):
        self.locked = False
        self.failures = []
        self.resets = []
        self.logged = []

    async def raise_if_locked(self, db, *keys):
        if self.locked:
            raise HTTPException(429, "locked")

    async def record_failure(self, db, *keys, **kw):
        self.failures.append(keys)

    async def reset(self, db, *keys):
        self.resets.append(keys)


def _req(ip="1.2.3.4"):
    return SimpleNamespace(client=SimpleNamespace(host=ip), headers={})


async def _verify(profile, password, db):
    """Call the REAL auth.verify_password_reconfirm with the guard swapped in."""
    return await auth.verify_password_reconfirm(
        VerifyPasswordIn(password=password), _req(), profile, db
    )


# ── the run ────────────────────────────────────────────────────────────────

def _run():
    print("①  #3003 — VAPID key validation / derivation…")
    good = _make_keypair()
    pub = derive_public_key_b64url(good)
    check("public key derived from private scalar", pub is not None and len(pub) > 20, True)
    check("malformed private key → None", derive_public_key_b64url("!!!not-base64"), None)
    check("wrong-length private key → None",
          derive_public_key_b64url(base64.urlsafe_b64encode(b"x" * 16).decode()), None)

    auth_header = build_vapid_authorization(good, "https://fcm.googleapis.com")
    check("configured key mints authorization pair", auth_header is not None, True)
    if auth_header:
        authz, crypto_key = auth_header
        check("authorization starts with 'vapid t='", authz.startswith("vapid t="), True)
        check("Crypto-Key names the derived public key", crypto_key == pub, True)
        check("JWT has 3 segments", authz.split("t=")[1].count("."), 2)
    check("malformed key → no authorization",
          build_vapid_authorization("bad-key", "https://fcm.googleapis.com"), None)

    print("②  #3002 — payload shaping (deterministic)…")
    check("reminder payload", build_weekly_payload("Ali", trigger="reminder", rounds=0, streak=0)[2],
          "reminder")
    check("milestone payload", build_weekly_payload("Ali", trigger="milestone", rounds=10, streak=7)[2],
          "milestone")
    check("weekly-summary payload", build_weekly_payload("Ali", trigger="weekly-summary", rounds=5, streak=2)[2],
          "weekly-summary")

    print("③  #3002 — send_notification delivery path…")
    # Unconfigured VAPID → explicit skip, no HTTP call, no crash.
    old_pub, old_priv = settings.vapid_public_key, settings.vapid_private_key
    settings.vapid_public_key = ""
    settings.vapid_private_key = ""
    try:
        sent_fake = _FakeAsyncClient(200)
        r = asyncio.run(send_notification(
            db=None, endpoint="https://fcm.example/push", title="t", body="b", tag="x",
            httpx_client=sent_fake,
        ))
        check("unconfigured VAPID → not_configured", r, "not_configured")
        check("unconfigured VAPID → no HTTP POST", len(sent_fake.posts), 0)

        # Configured VAPID but no valid key delivery → still "no send" flag check
        # (the real wire call is exercised separately below).
    finally:
        settings.vapid_public_key = old_pub
        settings.vapid_private_key = old_priv

    # Direct low-level send with a configured VAPID pair: exercises the actual
    # HTTPX POST and its per-subscription isolation.
    settings.vapid_private_key = good
    settings.vapid_public_key = pub
    try:
        ok_fake = _FakeAsyncClient(201)
        r = asyncio.run(send_notification(
            db=None, endpoint="https://fcm.example/push", title="t", body="b", tag="x",
            httpx_client=ok_fake,
        ))
        check("configured VAPID + 201 → sent", r, "sent")
        check("one POST issued", len(ok_fake.posts), 1)
        posted = ok_fake.posts[0]
        check("Authorization header set on POST", posted[2].get("Authorization", "").startswith("vapid t="), True)

        # A raising endpoint is isolated → "failed", never raises.
        bad_fake = _FakeAsyncClient(500, raise_on_post=True)
        r = asyncio.run(send_notification(
            db=None, endpoint="https://fcm.example/push", title="t", body="b", tag="x",
            httpx_client=bad_fake,
        ))
        check("raising endpoint → failed (isolated)", r, "failed")
    finally:
        settings.vapid_private_key = old_priv
        settings.vapid_public_key = old_pub

    print("④  #3004 — POST /auth/verify password re-confirm…")
    pw_guard = _FakeGuard()
    auth._PASSWORD_GUARD = pw_guard
    hashed = security.hash_password("correct-horse")

    local_profile = SimpleNamespace(
        id="p1", auth_provider="local", password_hash=hashed
    )
    google_profile = SimpleNamespace(
        id="p2", auth_provider="google", password_hash=security.hash_password("nobody-knows")
    )

    async def _wrong():
        try:
            await _verify(local_profile, "wrong-password", SimpleNamespace())
            return "no-error"
        except HTTPException as e:
            return e.status_code

    async def _right():
        return await _verify(local_profile, "correct-horse", SimpleNamespace())

    async def _google():
        try:
            await _verify(google_profile, "whatever", SimpleNamespace())
            return "no-error"
        except HTTPException as e:
            return e.status_code

    check("wrong password → 401", asyncio.run(_wrong()), 401)
    check("wrong password recorded a failure", len(pw_guard.failures), 1)
    check("failure keyed pw:profile:p1", "pw:profile:p1" in pw_guard.failures[0], True)

    ok = asyncio.run(_right())
    check("correct password → verified True", ok, {"verified": True})
    check("correct password resets the guard", len(pw_guard.resets), 1)

    check("google account → 400 (no password)", asyncio.run(_google()), 400)

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES")
        sys.exit(1)
    print("✓ all push-delivery / VAPID / password-reconfirm checks passed")


if __name__ == "__main__":
    _run()
