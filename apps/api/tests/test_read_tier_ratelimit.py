#!/usr/bin/env python3
"""#1764 — read-tier rate limit: separate, higher budget for expensive reads.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_read_tier_ratelimit.py

Asserts:
  ① read_rate_limit's dep allows READ_REQUESTS_PER_MIN (600) requests, then the
     601st raises HTTPException(429) — the unit-level equivalent of the issue's
     "1000/min loop starts returning 429".
  ② read_rate_limit's key carries a `:read` suffix and differs from rate_limit's
     key for the same account+IP+endpoint; the write-tier key has NO `:read`.
  ③ a read-tier 429 emits a WARNING with a REDACTED key on the "numberverse"
     logger.
  ④ READ_REQUESTS_PER_MIN is distinct from (and higher than) the write-tier
     _REQUESTS_PER_MIN.
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


def _profile():
    return SimpleNamespace(id="p123")


async def _call_read_limit_n(n):
    """Call read_rate_limit's dep n times with a counter that mirrors the real
    `_allow_fixed_window` (count <= limit). Returns the number of passes — the
    first READ_REQUESTS_PER_MIN calls pass, the extra one is rejected."""
    count = {"value": 0}

    async def fake_allow(db, key, limit, window_seconds):
        count["value"] += 1
        return count["value"] <= limit

    orig = rl._allow_fixed_window
    rl._allow_fixed_window = fake_allow
    try:
        dep = rl.read_rate_limit()
        passed = 0
        for _ in range(n):
            try:
                await dep(req(), _profile(), SimpleNamespace())
                passed += 1
            except HTTPException as e:
                if e.status_code != 429:
                    raise
        return passed
    finally:
        rl._allow_fixed_window = orig


async def _capture_read_and_write_keys():
    """Call both deps with the same request/profile; return the captured keys."""
    captured = []

    async def fake_allow(db, key, limit, window_seconds):
        captured.append(key)
        return True

    orig = rl._allow_fixed_window
    rl._allow_fixed_window = fake_allow
    try:
        await rl.read_rate_limit()(req(), _profile(), SimpleNamespace())
        await rl.rate_limit()(req(), _profile(), SimpleNamespace())
        return captured
    finally:
        rl._allow_fixed_window = orig


async def _call_read_limit_429():
    """Trigger a read-tier 429; return (captured_key, status_code)."""
    captured = {}

    async def fake_allow(db, key, limit, window_seconds):
        captured["key"] = key
        return False

    orig = rl._allow_fixed_window
    rl._allow_fixed_window = fake_allow
    try:
        dep = rl.read_rate_limit(limit=30)
        try:
            await dep(req(), _profile(), SimpleNamespace())
            return captured, None
        except HTTPException as e:
            return captured, e.status_code
    finally:
        rl._allow_fixed_window = orig


def _run():
    print("①  read_rate_limit — READ_REQUESTS_PER_MIN passes, the extra call → 429…")
    passed = asyncio.run(_call_read_limit_n(rl.READ_REQUESTS_PER_MIN + 1))
    check("first 600 pass (601st rejected)", passed, rl.READ_REQUESTS_PER_MIN)

    print("②  key namespace — :read suffix, distinct from the write-tier key…")
    keys = asyncio.run(_capture_read_and_write_keys())
    # #3110 — rate_limit now checks TWO independent buckets (account-only +
    # per-IP flood) under separate key namespaces, while read_rate_limit still
    # keys one :read bucket. So one read dep + one write dep = 3 captured keys.
    read_keys = [k for k in keys if k.endswith(":read")]
    write_keys = [k for k in keys if not k.endswith(":read")]
    check("read key carries the :read suffix", len(read_keys), 1)
    check("write dep emits two buckets (#3110: acct + wip)", len(write_keys), 2)
    check("read key differs from write key for the same request", len(set(keys)), 3)
    check("read key shape", read_keys[0], "p123:1.2.3.4:export:read")
    check("write acct key shape", "acct:p123:export" in write_keys, True)
    check("write wip key shape", "wip:export:1.2.3.4" in write_keys, True)

    print("③  read-tier 429 → WARNING with a REDACTED key (#1751 pattern)…")
    rl._logged_throttle_windows.clear()
    cap = _Capture()
    logger = logging.getLogger("numberverse")
    logger.addHandler(cap)
    try:
        captured, status = asyncio.run(_call_read_limit_429())
        check("429 raised", status, 429)
    finally:
        logger.removeHandler(cap)
    check("key includes :read suffix", captured.get("key"), "p123:1.2.3.4:export:read")
    warns = [r for r in cap.records if r.levelno >= logging.WARNING]
    check("WARNING emitted", len(warns) >= 1, True)
    msg = warns[0].getMessage() if warns else ""
    check("kind=read in log", "kind=read" in msg, True)
    check("raw profile id not in log", "p123" in msg, False)
    check("raw ip not in log", "1.2.3.4" in msg, False)
    check("limit in log", "limit=30" in msg, True)
    check("window in log", "window=60s" in msg, True)
    check("redacted key is a sha256 prefix", re.search(r"key=[0-9a-f]{12}", msg) is not None, True)

    print("④  budget constants — read tier is distinct and higher…")
    check("READ_REQUESTS_PER_MIN != _REQUESTS_PER_MIN",
          rl.READ_REQUESTS_PER_MIN != rl._REQUESTS_PER_MIN, True)
    check("READ_REQUESTS_PER_MIN > _REQUESTS_PER_MIN",
          rl.READ_REQUESTS_PER_MIN > rl._REQUESTS_PER_MIN, True)
    check("read budget is 600", rl.READ_REQUESTS_PER_MIN, 600)

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES")
        sys.exit(1)
    print("✓ read-tier rate-limit contract holds")


if __name__ == "__main__":
    _run()
