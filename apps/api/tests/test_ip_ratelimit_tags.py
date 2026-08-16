#!/usr/bin/env python3
"""#1763 — ip_rate_limit per-surface tags: independent per-IP buckets.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_ip_ratelimit_tags.py

The three PUBLIC surfaces that call `ip_rate_limit` — signup (10/min),
refresh (60/min) and the share snapshot (30/min) — previously all shared the
SAME `ip:{ip}` bucket, so opening 10 share links burned the signup allowance
and each configured limit never applied independently. This test asserts the
new optional `tag` splits them into separate buckets while `tag=None` keeps
the exact legacy `ip:{ip}` key for non-opted-in callers.
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

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
        print(f"  ✓ {name}")
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


# ── Fake AsyncSession (mirrors test_admin.py's _FakeDB) ────────────────────

class _FakeResult:
    def __init__(self, scalar=None):
        self._scalar = scalar

    def scalar_one(self):
        return self._scalar

    def scalar_one_or_none(self):
        return self._scalar

    def all(self):
        return []


class _FakeDB:
    """Minimal AsyncSession stand-in for the ip_rate_limit upsert path.

    execute() extracts the bucket key from the compiled statement and returns
    the incremented per-key count — exactly the surface the limiter touches.
    """

    def __init__(self):
        self.storage = {}  # key -> count

    async def execute(self, stmt):
        params = stmt.compile().params
        key = params.get("key")
        self.storage[key] = self.storage.get(key, 0) + 1
        return _FakeResult(scalar=self.storage[key])

    async def commit(self):
        pass


def _req(ip="1.2.3.4"):
    return SimpleNamespace(client=SimpleNamespace(host=ip), headers={})


def _keys(db):
    return set(db.storage.keys())


async def _allowed(dep, request, db):
    """True when the dep lets the request through (no HTTPException)."""
    try:
        await dep(request=request, db=db)
        return True
    except HTTPException:
        return False


class _Capture(logging.Handler):
    """Collects WARNING+ records emitted on the "numberverse" logger."""

    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.records = []

    def emit(self, record):
        self.records.append(record)


async def _run():
    print("①  tag=signup / tag=share / tag=refresh — distinct per-IP buckets…")
    db = _FakeDB()
    await rl.ip_rate_limit(limit=10, tag="signup")(_req(), db)
    await rl.ip_rate_limit(limit=30, tag="share")(_req(), db)
    await rl.ip_rate_limit(limit=60, tag="refresh")(_req(), db)
    keys = _keys(db)
    check("signup-tagged key", "ip:signup:1.2.3.4" in keys, True)
    check("share-tagged key", "ip:share:1.2.3.4" in keys, True)
    check("refresh-tagged key", "ip:refresh:1.2.3.4" in keys, True)
    check("signup and share are separate buckets", "ip:signup:1.2.3.4" in keys and "ip:share:1.2.3.4" in keys, True)
    check("refresh and signup are separate buckets", "ip:refresh:1.2.3.4" in keys and "ip:signup:1.2.3.4" in keys, True)

    print("②  tag=None keeps the exact legacy ip:{ip} key…")
    db2 = _FakeDB()
    await rl.ip_rate_limit(limit=1)(_req(), db2)
    check("legacy key ip:1.2.3.4", _keys(db2), {"ip:1.2.3.4"})

    print("③  no cross-talk: signup budget exhausted → share bucket still passes…")
    db3 = _FakeDB()
    signup_dep = rl.ip_rate_limit(limit=10, tag="signup")
    share_dep = rl.ip_rate_limit(limit=30, tag="share")
    # Burn the 10/min signup budget (calls 1..10 are allowed; the next one 429s).
    for i in range(10):
        ok = await _allowed(signup_dep, _req(), db3)
        check(f"signup call {i + 1} within 10/min budget", ok, True)
        if not ok:
            break
    try:
        await signup_dep(request=_req(), db=db3)
        check("signup over 10/min → 429", "no-429", "429")
    except HTTPException as exc:
        check("signup over 10/min → 429", exc.status_code, 429)
    # The same IP can still open share links: the share bucket is independent.
    ok = True
    for _ in range(11):
        if not await _allowed(share_dep, _req(), db3):
            ok = False
            break
    check("11th share call at 30/min on same IP → NOT 429", ok, True)

    print("④  429 emits a WARNING with kind=ip and a REDACTED key…")
    # Reset the module-level 429 dedup so a re-run in the same coarse window
    # still emits the WARNING this test asserts on.
    rl._logged_throttle_windows.clear()
    db4 = _FakeDB()
    dep429 = rl.ip_rate_limit(limit=1, tag="signup")
    await _allowed(dep429, _req(), db4)  # first call: allowed (count=1)
    cap = _Capture()
    logger = logging.getLogger("numberverse")
    logger.addHandler(cap)
    try:
        try:
            await dep429(request=_req(), db=db4)
            check("429 raised", "no-429", "429")
        except HTTPException as exc:
            check("429 raised", exc.status_code, 429)
    finally:
        logger.removeHandler(cap)

    warns = [r for r in cap.records if r.levelno >= logging.WARNING]
    check("WARNING emitted", len(warns) >= 1, True)
    msg = warns[0].getMessage() if warns else ""
    check("kind=ip in warning", "kind=ip" in msg, True)
    check("raw ip not in warning", "1.2.3.4" in msg, False)
    check("redacted key is a sha256 prefix", re.search(r"key=[0-9a-f]{12}", msg) is not None, True)
    check("limit in warning", "limit=1" in msg, True)
    check("window in warning", "window=60s" in msg, True)

    print()
    if fails:
        print(f"✖ {fails} FAILURES")
        sys.exit(1)
    print(f"✓ {passes} checks passed — ip_rate_limit tags are independent")


if __name__ == "__main__":
    asyncio.run(_run())
