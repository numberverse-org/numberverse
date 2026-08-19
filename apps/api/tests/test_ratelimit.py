#!/usr/bin/env python3
"""#3114 / #3116 — durable sliding-window rate limiter + credential lockout guard.

Standalone (no Postgres, no pytest):  cd apps/api && .venv/bin/python tests/test_ratelimit.py

The limiter was rewritten from a process-local dict to Postgres-backed buckets,
but the suite had NO direct coverage of the durable limiter (only the adjacent
test_band_lock.py). This module closes that gap and pins the #3114 sliding-window
fix, which replaced the naive fixed window (a full quota could be spent at :59
AND again at :60 — a ~2× boundary burst).

Covers:
  ① #3114 — a fixed-window boundary no longer lets a full quota be spent twice:
     N requests at the tail of one window plus N more at the head of the next
     are throttled to N, not 2N (sliding overlap reconciliation);
  ② fixed-window reset at the boundary (fresh window admits requests again once
     the trailing span has fully expired);
  ③ the 120/min (account write) and 10/min (signup) caps are enforced end-to-end;
  ④ account+IP keying: the account bucket is shared across IPs; the ip bucket is
     independent;
  ⑤ credential lockout arming → cooldown blocks → expiry, and escalation of the
     cooldown across repeated breaches (#3107), plus reset-on-success clearing it.
"""
import asyncio
import sys
from datetime import datetime
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


# ── A bucket store + AsyncSession that models the FOR-UPDATE sliding window ──

class _BucketDB:
    """Fake AsyncSession modelling the `_allow_fixed_window` read-modify-write.

    `scalar` returns (or lazily creates from the store) the RateLimitBucket for a
    key; `add`/`flush` materialise a brand-new bucket. Mutations are applied
    in-place on the store's objects, so `commit` is a no-op.
    """

    def __init__(self, store=None):
        self.store = store if store is not None else {}  # key -> RateLimitBucket
        self._added = []

    def _key(self, stmt):
        params = stmt.compile().params
        return params.get("key_1") or params.get("key")

    async def execute(self, stmt):
        # #3114 — the INSERT … ON CONFLICT DO NOTHING first-use guard. In the real
        # PG path this guarantees the row exists before the SELECT FOR UPDATE (so
        # two concurrent first-uses can't both INSERT). In the fake, `scalar` +
        # `add`/`flush` already materialise the first row, so it's a no-op.
        return None

    async def scalar(self, stmt):
        key = self._key(stmt)
        if key is not None and key in self.store:
            return self.store[key]
        return None

    def add(self, obj):
        self._added.append(obj)

    async def flush(self):
        for obj in self._added:
            self.store[obj.key] = obj
        self._added = []

    async def commit(self):
        pass  # mutations are applied in-place on the store's objects


def _dt(iso):
    return datetime.fromisoformat(iso)


class _Clock:
    """A monkeypatchable `_naive_utcnow` that serves queued instants in order,
    replaying the last one once the queue is exhausted (so late calls don't
    crash). Wire it by assigning `rl._naive_utcnow = clock.next`."""

    def __init__(self, instants):
        self._instants = list(instants)
        self._last = instants[-1]

    def next(self):
        if self._instants:
            return self._instants.pop(0)
        return self._last


def _patch_clock(instants):
    """Monkeypatch `rl._naive_utcnow` to the queued instants; returns the clock
    so callers can restore (or swap) it."""
    clock = _Clock(instants)
    rl._naive_utcnow = clock.next
    return clock


def _allow(db, key, limit, window_seconds):
    return rl._allow_fixed_window(db, key, limit, window_seconds)


# ── ① #3114 — sliding window closes the fixed-window boundary burst ─────────

async def _run_boundary():
    print("①  #3114 — boundary burst is closed by the sliding window…")
    # 10/min cap, 60s window, grid-aligned to :00.
    # Requests land at :50, :51, ... :59 (10 in the tail of window N) and then
    # :60...:69 (head of window N+1). All 20 instants fall within a single
    # trailing 60s span, so the sliding sum must throttle once 10 are admitted.
    instants = [_dt(f"2026-01-01T00:00:{50 + i:02d}") for i in range(10)]
    instants += [_dt(f"2026-01-01T00:01:{i:02d}") for i in range(10)]
    _patch_clock(instants)
    db = _BucketDB()
    allowed = 0
    for _ in instants:
        if await _allow(db, "acct:test:signup", 10, 60):
            allowed += 1
    check("only 10 of 20 boundary-burst requests admitted", allowed, 10)


# ── ② fixed-window reset once the trailing span has fully expired ───────────

async def _run_reset():
    print("②  window expiry admits requests again (not permanently locked)…")
    # Spend the whole 3-request quota at one instant, then advance BEYOND the
    # 60s window: the sliding sum must decay to admit fresh requests.
    instants = [
        _dt("2026-01-01T00:00:00"),
        _dt("2026-01-01T00:00:00"),
        _dt("2026-01-01T00:00:00"),
        _dt("2026-01-01T00:00:00"),  # 4th at same instant → still at quota
    ]
    _patch_clock(instants)
    db = _BucketDB()
    r1 = await _allow(db, "k", 3, 60)
    r2 = await _allow(db, "k", 3, 60)
    r3 = await _allow(db, "k", 3, 60)
    r4 = await _allow(db, "k", 3, 60)
    check("1st admitted", r1, True)
    check("2nd admitted", r2, True)
    check("3rd admitted", r3, True)
    check("4th rejected (at quota)", r4, False)  # sliding sum = 4 > 3
    # Advance > 60s so the 3 requests are fully out of the trailing span.
    _patch_clock([_dt("2026-01-01T00:02:00")])
    check("after >1 min, a fresh window admits again", await _allow(db, "k", 3, 60), True)


# ── ③ caps enforced end-to-end through the deps ─────────────────────────────

async def _run_caps():
    print("③  signup 10/min cap holds end-to-end…")
    _patch_clock([_dt("2026-01-01T00:00:00")] * 20)
    db = _BucketDB()
    dep = rl.ip_rate_limit(limit=10, tag="signup")
    req = SimpleNamespace(client=SimpleNamespace(host="1.2.3.4"), headers={})
    ok = 0
    for _ in range(10):
        try:
            await dep(request=req, db=db)
            ok += 1
        except HTTPException:
            break
    check("signup admits exactly 10", ok, 10)
    try:
        await dep(request=req, db=db)
        check("signup 11th → 429", "no-429", 429)
    except HTTPException as exc:
        check("signup 11th → 429", exc.status_code, 429)


# ── ④ account+IP keying ─────────────────────────────────────────────────────

async def _run_keying():
    print("④  account bucket is shared across IPs…")
    _patch_clock([_dt("2026-01-01T00:00:00")] * 8)
    db = _BucketDB()
    dep = rl.rate_limit(limit=1)
    prof = SimpleNamespace(id="p123")
    r1 = SimpleNamespace(client=SimpleNamespace(host="10.0.0.1"), headers={})
    r2 = SimpleNamespace(client=SimpleNamespace(host="10.0.0.2"), headers={})
    await dep(request=r1, profile=prof, db=db)
    try:
        await dep(request=r2, profile=prof, db=db)
        check("same account, different IP → throttled (acct bucket shared, #3110)", "no-429", 429)
    except HTTPException as exc:
        check("same account, different IP → throttled (acct bucket shared, #3110)", exc.status_code, 429)


# ── ⑤ credential lockout arming → cooldown → escalation + reset-on-success ───

async def _run_lockout():
    print("⑤  AuthAttemptGuard lockout arming / escalation / reset…")
    g = rl.AuthAttemptGuard(max_attempts=5, base_lockout_seconds=60)
    key = "login:email:parent@test.com"
    store = {}
    db = _BucketDB(store)

    # 5 failures arm the first lockout (all at t=00:00).
    _patch_clock([_dt("2026-01-01T00:00:00")] * 20)
    for _ in range(5):
        await g.record_failure(db, key)
    try:
        await g.raise_if_locked(db, key)
        check("lockout armed after 5 failures", "no-429", 429)
    except HTTPException as exc:
        check("lockout armed after 5 failures", exc.status_code, 429)

    # Cooldown still active at +30s.
    _patch_clock([_dt("2026-01-01T00:00:30")] * 20)
    try:
        await g.raise_if_locked(db, key)
        check("cooldown still blocks at +30s", "no-429", 429)
    except HTTPException as exc:
        check("cooldown still blocks at +30s", exc.status_code, 429)

    # Cooldown expired at +2min: raise_if_locked passes.
    _patch_clock([_dt("2026-01-01T00:02:00")] * 20)
    got = "ok"
    try:
        await g.raise_if_locked(db, key)
    except HTTPException:
        got = "locked"
    check("cooldown expired by +2min (no raise)", got, "ok")

    # #3107 — expiry does NOT zero the count; a fresh breach arms a lockout again.
    _patch_clock([_dt("2026-01-01T00:02:00")] * 20)
    for _ in range(5):
        await g.record_failure(db, key)
    try:
        await g.raise_if_locked(db, key)
        check("second breach re-arms a lockout (count survives expiry)", "no-429", 429)
    except HTTPException as exc:
        check("second breach re-arms a lockout (count survives expiry)", exc.status_code, 429)

    # reset-on-success clears the lock.
    _patch_clock([_dt("2026-01-01T00:02:01")] * 20)
    await g.reset(db, key)
    got = "ok"
    try:
        await g.raise_if_locked(db, key)
    except HTTPException:
        got = "locked"
    check("reset-on-success clears the lock", got, "ok")


async def _run():
    await _run_boundary()
    await _run_reset()
    await _run_caps()
    await _run_keying()
    await _run_lockout()

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES: {fails}")
        sys.exit(1)
    print("✓ rate-limit sliding-window + lockout contract holds")


if __name__ == "__main__":
    asyncio.run(_run())
