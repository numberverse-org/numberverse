#!/usr/bin/env python3
"""#1760/#1761/#1762/#1751 — rate-limit key hardening + lockout logging.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_ratelimit_keys.py

Asserts:
  (a) rate_limit keys carry an endpoint/route-group tag so one heavy endpoint
      can't starve the others (#1762);
  (b) _request_ip returns the RIGHTMOST trusted XFF hop, never the leftmost
      attacker-supplied value (#1760/#1761);
  (c) a 429 raises HTTPException AND emits a WARNING with a REDACTED key
      (#1751);
  (d) the auth wrong-password 401 path emits a WARNING with a hashed account
      key (#1751).
"""
import asyncio
import logging
import re
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

from app import ratelimit as rl  # noqa: E402
from app.routers import auth  # noqa: E402
from app.schemas import LoginIn  # noqa: E402

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def req(path="/api/v1/export", ip="172.18.0.5", xff="1.2.3.4"):
    headers = {}
    if xff is not None:
        headers["x-forwarded-for"] = xff
    return SimpleNamespace(
        client=SimpleNamespace(host=ip),
        headers=headers,
        url=SimpleNamespace(path=path),
        state=SimpleNamespace(session=None),
    )


class _Capture(logging.Handler):
    """Collects WARNING+ records emitted on the "numberverse" logger."""

    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.records = []

    def emit(self, record):
        self.records.append(record)


class _FakeGuard:
    """Spy for AuthAttemptGuard — no Postgres needed for the 401 path."""

    def __init__(self):
        self.locked = False
        self.recorded = None

    async def raise_if_locked(self, db, *keys):
        if self.locked:
            raise HTTPException(429, "Too many attempts — try again in 1 minutes")

    async def record_failure(self, db, *keys):
        self.recorded = keys

    async def reset(self, db, *keys):
        pass


class _FakeProfileDB:
    """Returns a fixed profile from db.scalar (login profile lookup)."""

    def __init__(self, profile):
        self._profile = profile

    async def scalar(self, stmt):
        return self._profile


def _profile():
    # A non-bcrypt hash makes verify_password raise ValueError → return False fast.
    return SimpleNamespace(id="p123", password_hash="not-a-real-bcrypt-hash")


async def _call_rate_limit_429():
    """Run rate_limit's dep with a profile + always-over-limit bucket.

    Returns (captured_keys, status_code) — the 429 HTTPException is swallowed
    so the caller can inspect both the key the limiter used AND the status.
    """
    captured = {}

    async def fake_allow(db, key, limit, window_seconds):
        captured["key"] = key
        return False

    orig = rl._allow_fixed_window
    rl._allow_fixed_window = fake_allow
    try:
        dep = rl.rate_limit(limit=30)
        try:
            await dep(req(), SimpleNamespace(id="p123"), SimpleNamespace())
            return captured, None
        except HTTPException as e:
            return captured, e.status_code
    finally:
        rl._allow_fixed_window = orig


async def _call_login_401():
    """Wrong-password login against a real (fake-DB) handler → 401 + WARNING.

    Returns the 401 status code (the HTTPException is swallowed so the caller
    can also inspect the captured log records).
    """
    orig_guard = auth._LOGIN_GUARD
    auth._LOGIN_GUARD = _FakeGuard()
    try:
        db = _FakeProfileDB(_profile())
        try:
            await auth.login(LoginIn(email="parent@test.com", password="wrongpass"), req(), db)
            return None
        except HTTPException as e:
            return e.status_code
    finally:
        auth._LOGIN_GUARD = orig_guard


def _run():
    print("①  _request_ip — rightmost TRUSTED XFF hop, never leftmost (#1760/#1761)…")
    check("trusted peer + chain → rightmost hop", rl._request_ip(req(xff="6.6.6.6, 1.2.3.4")), "1.2.3.4")
    check("trusted peer + single hop → that hop", rl._request_ip(req(xff="1.2.3.4")), "1.2.3.4")
    check("no XFF → socket peer", rl._request_ip(req(xff=None, ip="5.5.5.5")), "5.5.5.5")
    check("public peer + XFF → XFF ignored", rl._request_ip(req(ip="8.8.8.8", xff="6.6.6.6")), "8.8.8.8")
    no_client = SimpleNamespace(client=None, headers={}, url=SimpleNamespace(path="/"))
    check("no client → unknown", rl._request_ip(no_client), "unknown")

    print("②  _endpoint_tag — stable route group (#1762)…")
    check("export → export", rl._endpoint_tag(req(path="/api/v1/export")), "export")
    check("export.csv → export (shared budget)", rl._endpoint_tag(req(path="/api/v1/export.csv")), "export")
    check("kids/{id}/settings → kids", rl._endpoint_tag(req(path="/api/v1/kids/abc/settings")), "kids")
    check("content/subjects → content", rl._endpoint_tag(req(path="/api/v1/content/subjects")), "content")
    check("auth/login → auth", rl._endpoint_tag(req(path="/api/v1/auth/login")), "auth")

    print("③  rate_limit 429 → HTTPException + redacted WARNING (#1762+#1751)…")
    # Reset the module-level 429 dedup so a re-run in the same coarse window
    # still emits the WARNING this test asserts on.
    rl._logged_throttle_windows.clear()
    cap = _Capture()
    logger = logging.getLogger("numberverse")
    logger.addHandler(cap)
    try:
        captured_keys, status = asyncio.run(_call_rate_limit_429())
        check("429 raised", status, 429)
    finally:
        logger.removeHandler(cap)

    check("key includes endpoint tag", captured_keys.get("key"), "p123:1.2.3.4:export")
    warns = [r for r in cap.records if r.levelno >= logging.WARNING]
    check("WARNING emitted", len(warns) >= 1, True)
    msg = warns[0].getMessage() if warns else ""
    check("raw profile id not in log", "p123" in msg, False)
    check("raw ip not in log", "1.2.3.4" in msg, False)
    check("limit in log", "limit=30" in msg, True)
    check("window in log", "window=60s" in msg, True)
    check("redacted key is a sha256 prefix", re.search(r"key=[0-9a-f]{12}", msg) is not None, True)

    print("④  auth login 401 → WARNING with hashed account key (#1751)…")
    cap2 = _Capture()
    logger.addHandler(cap2)
    try:
        status2 = asyncio.run(_call_login_401())
        check("401 status", status2, 401)
    finally:
        logger.removeHandler(cap2)

    warns2 = [r for r in cap2.records if r.levelno >= logging.WARNING]
    check("auth WARNING emitted", len(warns2) >= 1, True)
    msg2 = warns2[0].getMessage() if warns2 else ""
    check("raw email not in log", "parent@test.com" in msg2, False)
    check("account_key prefix present", "account_key=login:email:" in msg2, True)
    check("hashed email is a sha256 prefix", re.search(r"login:email:[0-9a-f]{12}", msg2) is not None, True)

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES")
        sys.exit(1)
    print("✓ rate-limit key + lockout-logging contract holds")


if __name__ == "__main__":
    _run()
