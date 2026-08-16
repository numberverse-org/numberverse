#!/usr/bin/env python3
"""#1766 — push subscribe/unsubscribe write endpoints are rate limited.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_push.py

Asserts:
  ① POST /subscribe and POST /unsubscribe carry the new `_limiter` dependency
     (a `rate_limit()`-produced budget) while keeping their existing
     `get_current_profile` lookup — and both handlers still run when the limiter
     is passed as None (existing direct-call signatures keep working).
  ② PUSH_WRITE_RATE_LIMIT enforces the default 120/min account+IP budget:
     monkeypatch `rl._allow_fixed_window` with a counting stub → the first 120
     dep calls pass, the 121st raises HTTPException(429).
  ③ the push limiter key keeps the same account+IP+endpoint shape as every
     other write surface (`…:push` endpoint tag), limit=120, window=60s.
"""
import asyncio
import inspect
import logging
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

from app import ratelimit as rl  # noqa: E402
from app.routers import push  # noqa: E402

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def req(path="/api/v1/push/subscribe", ip="172.18.0.5", xff="1.2.3.4"):
    headers = {}
    if xff is not None:
        headers["x-forwarded-for"] = xff
    return SimpleNamespace(
        client=SimpleNamespace(host=ip),
        headers=headers,
        url=SimpleNamespace(path=path),
        state=SimpleNamespace(session=None),
    )


def _profile():
    return SimpleNamespace(id="p123")


class _FakeDB:
    """Fake AsyncSession: returns a fixed scalar result, records side effects.

    No Postgres, no SQLAlchemy machinery — just enough surface for a direct call
    to the real handlers to exercise their unchanged bodies.
    """

    def __init__(self, scalar_result=None):
        self._scalar_result = scalar_result
        self.scalar_calls = 0
        self.added = None
        self.deleted = None
        self.commits = 0
        self.refreshed = None

    async def scalar(self, stmt):
        self.scalar_calls += 1
        return self._scalar_result

    def add(self, obj):
        self.added = obj

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        self.refreshed = obj

    async def delete(self, obj):
        self.deleted = obj


def _subscribe_body():
    return push.PushSubscribeIn(
        endpoint="https://example.com/push/abc123",
        p256dh="cDI1NmRoLWtleS1tYXRlcmlhbA==",
        auth="YXV0aC1zZWNyZXQ=",
    )


async def _direct_call_handlers():
    """Call both handlers with _limiter=None — proves the new dependency position
    is optional for callers that already pass profile/db explicitly."""
    results = {}

    # subscribe: no existing row → creates a new subscription row.
    db = _FakeDB()
    sub = await push.subscribe(_subscribe_body(), _profile(), db, _limiter=None)
    results["subscribe_ran"] = sub is not None
    results["subscribe_endpoint"] = sub.endpoint if sub is not None else None
    results["subscribe_committed"] = db.commits
    results["subscribe_refreshed"] = db.refreshed is sub

    # subscribe: existing row for the SAME profile → in-place key rotation.
    existing = SimpleNamespace(
        profile_id="p123",
        endpoint="https://example.com/push/abc123",
        p256dh="old-key",
        auth="old-secret",
    )
    db2 = _FakeDB(scalar_result=existing)
    updated = await push.subscribe(_subscribe_body(), _profile(), db2, _limiter=None)
    results["subscribe_updated_same_profile"] = (
        existing.p256dh == "cDI1NmRoLWtleS1tYXRlcmlhbA=="
        and existing.auth == "YXV0aC1zZWNyZXQ="
        and updated is existing
    )

    # unsubscribe: no existing row → idempotent no-op, still returns None.
    db3 = _FakeDB()
    unsub = await push.unsubscribe(
        push.PushUnsubscribeIn(endpoint="https://example.com/push/abc123"),
        _profile(),
        db3,
        _limiter=None,
    )
    results["unsubscribe_ran_idempotent"] = unsub is None and db3.scalar_calls == 1

    # unsubscribe: existing row → delete + commit path.
    existing2 = SimpleNamespace(
        profile_id="p123", endpoint="https://example.com/push/abc123"
    )
    db4 = _FakeDB(scalar_result=existing2)
    await push.unsubscribe(
        push.PushUnsubscribeIn(endpoint="https://example.com/push/abc123"),
        _profile(),
        db4,
        _limiter=None,
    )
    results["unsubscribe_deleted"] = db4.deleted is existing2 and db4.commits == 1

    return results


async def _call_push_limit_n(n):
    """Call PUSH_WRITE_RATE_LIMIT's dep n times with a counting _allow_fixed_window.

    Mirrors the real limiter: `count <= limit` passes, the extra call raises
    429. Returns (passed_count, captured_bucket_params, first_429_status).
    """
    count = {"value": 0}
    captured = {"limit": None, "key": None, "window": None}
    status_429 = {"value": None}

    async def fake_allow(db, key, limit, window_seconds):
        count["value"] += 1
        if captured["limit"] is None:
            captured["limit"] = limit
            captured["key"] = key
            captured["window"] = window_seconds
        return count["value"] <= limit

    orig = rl._allow_fixed_window
    rl._allow_fixed_window = fake_allow
    try:
        passed = 0
        for _ in range(n):
            try:
                await push.PUSH_WRITE_RATE_LIMIT(req(), _profile(), SimpleNamespace())
                passed += 1
            except HTTPException as e:
                if e.status_code != 429:
                    raise
                if status_429["value"] is None:
                    status_429["value"] = e.status_code
        return passed, captured, status_429["value"]
    finally:
        rl._allow_fixed_window = orig


def _run():
    print("①  handlers — _limiter dependency present, direct calls still work…")
    sig_sub = inspect.signature(push.subscribe)
    sig_unsub = inspect.signature(push.unsubscribe)
    check("subscribe has a _limiter param", "_limiter" in sig_sub.parameters, True)
    check("unsubscribe has a _limiter param", "_limiter" in sig_unsub.parameters, True)
    check("subscribe keeps get_current_profile lookup",
          "profile" in sig_sub.parameters, True)
    check("unsubscribe keeps get_current_profile lookup",
          "profile" in sig_unsub.parameters, True)

    results = asyncio.run(_direct_call_handlers())
    check("subscribe ran with _limiter=None", results["subscribe_ran"], True)
    check("subscribe saved the endpoint", results["subscribe_endpoint"],
          "https://example.com/push/abc123")
    check("subscribe committed + refreshed", results["subscribe_committed"] == 1
          and results["subscribe_refreshed"], True)
    check("subscribe re-keyed an existing same-profile row",
          results["subscribe_updated_same_profile"], True)
    check("unsubscribe ran idempotent with _limiter=None",
          results["unsubscribe_ran_idempotent"], True)
    check("unsubscribe deleted an existing row", results["unsubscribe_deleted"], True)

    print("②  PUSH_WRITE_RATE_LIMIT — rate_limit()-produced 120/min budget…")
    # Suppress the (expected) 429 WARNING from the 121st call; also reset the
    # module-level 429 dedup so the record doesn't leak between re-runs.
    logger = logging.getLogger("numberverse")
    null = logging.NullHandler()
    logger.addHandler(null)
    try:
        rl._logged_throttle_windows.clear()
        passed, captured, status = asyncio.run(_call_push_limit_n(121))
    finally:
        logger.removeHandler(null)

    check("first 120 dep calls pass", passed, 120)
    check("121st dep call raises 429", status, 429)
    check("budget is the default 120/min", captured["limit"], rl._REQUESTS_PER_MIN)
    check("window is 60s", captured["window"], rl._WINDOW_SECONDS)

    print("③  key shape — same account+IP+endpoint contract as other writes…")
    check("push key carries the endpoint tag",
          captured["key"], "p123:1.2.3.4:push")

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES")
        sys.exit(1)
    print("✓ all push rate-limit checks passed")


if __name__ == "__main__":
    _run()
