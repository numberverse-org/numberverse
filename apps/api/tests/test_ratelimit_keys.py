#!/usr/bin/env python3
"""#1760/#1761/#1762/#1751/#1769/#1770 — rate-limit key hardening + lockout logging.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_ratelimit_keys.py

Asserts:
  (a) rate_limit keys carry an endpoint/route-group tag so one heavy endpoint
      can't starve the others (#1762);
  (b) _request_ip returns the RIGHTMOST trusted XFF hop, never the leftmost
      attacker-supplied value (#1760/#1761);
  (c) a 429 raises HTTPException AND emits a WARNING with a REDACTED key
      (#1751);
  (d) the auth wrong-password 401 path emits a WARNING with a hashed account
      key (#1751);
  (e) the pre-committed increment is bounded to its OWN endpoint bucket, so a
      422/413-flood on /progress can never burn the /export bucket (#1770);
  (f) when request.client is None, rate_limit/read_rate_limit drop the ip
      component (per-account granularity) and ip_rate_limit falls back to the
      rightmost XFF hop, so no-IP clients no longer share one bucket (#1769);
  (g) #772 — two limiter instances sharing one bucket store (the DB-backed
      contract behind every limit) enforce a SINGLE bucket: a lockout armed by
      one instance is seen by the other, and a reset via one clears it for both.
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
            raise HTTPException(429, "Too many attempts — try again later")

    async def record_failure(self, db, *keys, **kwargs):
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


async def _call_burn_isolation():
    """#1770 — two requests with different endpoint tags produce distinct keys."""
    captured = []

    async def fake_allow(db, key, limit, window_seconds):
        captured.append(key)
        return True

    orig = rl._allow_fixed_window
    rl._allow_fixed_window = fake_allow
    try:
        dep = rl.rate_limit(limit=30)
        await dep(req(path="/api/v1/progress"), SimpleNamespace(id="p123"), SimpleNamespace())
        await dep(req(path="/api/v1/export"), SimpleNamespace(id="p123"), SimpleNamespace())
    finally:
        rl._allow_fixed_window = orig
    return captured


async def _call_no_ip_fallback():
    """#1769 — no-IP fallback granularity: drop ip component, fall back to XFF."""
    captured = []

    async def fake_allow(db, key, limit, window_seconds):
        captured.append(key)
        return True

    orig = rl._allow_fixed_window
    rl._allow_fixed_window = fake_allow
    try:
        no_client = SimpleNamespace(
            client=None, headers={}, url=SimpleNamespace(path="/api/v1/progress")
        )
        await rl.rate_limit()(no_client, SimpleNamespace(id="p123"), SimpleNamespace())
        await rl.read_rate_limit()(no_client, SimpleNamespace(id="p123"), SimpleNamespace())
        no_client_xff = SimpleNamespace(
            client=None, headers={"x-forwarded-for": "1.2.3.4"}, url=SimpleNamespace(path="/")
        )
        await rl.ip_rate_limit()(no_client_xff, SimpleNamespace())
        no_client_plain = SimpleNamespace(
            client=None, headers={}, url=SimpleNamespace(path="/")
        )
        await rl.ip_rate_limit()(no_client_plain, SimpleNamespace())
    finally:
        rl._allow_fixed_window = orig
    return captured


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


# ── #772 — a SHARED bucket store (two limiter instances, one bucket) ───────

def _bucket_key(stmt):
    """Pull the key out of select(RateLimitBucket).where(key == <param>)."""
    wc = stmt.whereclause
    clauses = list(wc.clauses) if hasattr(wc, "clauses") else [wc]
    for c in clauses:
        left = getattr(c, "left", None)
        right = getattr(c, "right", None)
        if getattr(left, "key", None) == "key":
            return getattr(right, "value", None)
    return None


class _SharedStoreDB:
    """Fake AsyncSession whose buckets live in ONE caller-owned dict.

    Two independent limiter instances (`AuthAttemptGuard`s) driven against the
    SAME store through this fake behave exactly like two uvicorn workers
    sharing one Postgres `rate_limit_buckets` table (#772): the lockout written
    by one must be seen and enforced by the other.
    """

    def __init__(self, store):
        self._store = store  # {bucket_key: RateLimitBucket}
        self._pending = []

    async def execute(self, stmt):
        # #3098 — the INSERT ... ON CONFLICT DO NOTHING first-use guard. The
        # `scalar` + `add`/`flush` path below already materialises the first
        # row, so this is a benign no-op (mirrors test_ratelimit._BucketDB).
        return None

    async def scalar(self, stmt):
        return self._store.get(_bucket_key(stmt))

    def add(self, obj):
        self._pending.append(obj)

    async def flush(self):
        for obj in self._pending:
            self._store[obj.key] = obj
        self._pending = []

    async def commit(self):
        pass


def _guard(store, max_attempts=5):
    """One limiter instance over a shared store — `rl.AuthAttemptGuard` is the
    same class the auth routes use for login/change-password lockout."""
    return rl.AuthAttemptGuard(max_attempts=max_attempts), _SharedStoreDB(store)


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

    check("key includes endpoint tag (account-only key, #3110)", captured_keys.get("key"), "acct:p123:export")
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

    print("⑤  burn isolation — a flood on one endpoint can't burn another (#1770)…")
    captured = asyncio.run(_call_burn_isolation())
    # #3110 — each rate_limit call now checks TWO keys (acct + wip), so two
    # endpoints produce four bucket keys. The endpoint tag still isolates them:
    # /progress and /export never share a bucket.
    check("two distinct endpoints → four bucket keys (2 buckets each, #3110)",
          len(set(captured)), 4)
    check("progress acct bucket", "acct:p123:progress" in captured, True)
    check("progress wip bucket", "wip:progress:1.2.3.4" in captured, True)
    check("export acct bucket", "acct:p123:export" in captured, True)
    check("export wip bucket", "wip:export:1.2.3.4" in captured, True)

    print("⑥  no-IP fallback granularity (#1769/#3110)…")
    captured = asyncio.run(_call_no_ip_fallback())
    # With no client socket, rate_limit keys account-only (no ip half to drop),
    # read_rate_limit keeps its :read suffix, and ip_rate_limit still falls back
    # to the rightmost XFF hop.
    check("rate_limit no-ip key = account-only (no ip component)", captured[0], "acct:p123:progress")
    check("read_rate_limit no-ip key keeps :read", captured[1], "p123:progress:read")
    check("ip_rate_limit no-ip + XFF → rightmost hop", captured[2], "ip:1.2.3.4")
    check("ip_rate_limit no-ip, no XFF → ip:unknown residual", captured[3], "ip:unknown")

    print("⑦  #772 — two limiter instances sharing a store key enforce ONE bucket…")
    store = {}
    g1, db1 = _guard(store)
    g2, db2 = _guard(store)  # a DIFFERENT instance over the SAME store

    async def _drive_lockout():
        # g1 (worker 1) records 5 failures against the shared key → arms lockout.
        for _ in range(5):
            await g1.record_failure(db1, "login:email:parent@test.com")
        # g2 (worker 2) must SEE that lockout — it cannot replay from a fresh
        # per-process slate (#772).
        try:
            await g2.raise_if_locked(db2, "login:email:parent@test.com")
            return None
        except HTTPException as e:
            return e.status_code

    locked = asyncio.run(_drive_lockout())
    check("g2 sees g1's lockout (shared store)", locked, 429)
    check("bucket lives in the shared store", store.get("login:email:parent@test.com") is not None, True)

    async def _drive_reset():
        # Resetting through g1 must clear g2's view too — same underlying bucket.
        await g1.reset(db1, "login:email:parent@test.com")
        try:
            await g2.raise_if_locked(db2, "login:email:parent@test.com")
            return "ok"
        except HTTPException:
            return "locked"

    check("reset via g1 clears g2's view", asyncio.run(_drive_reset()), "ok")

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES")
        sys.exit(1)
    print("✓ rate-limit key + lockout-logging contract holds")


if __name__ == "__main__":
    _run()
