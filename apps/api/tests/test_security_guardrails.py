#!/usr/bin/env python3
"""Security-guardrail hardening wave (#3107 #3108 #3109 #3110 #3111 #3112 #3115 #3119).

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_security_guardrails.py

Covers the credential-lockout / brute-force / write-limiter guardrails:
  ① #3107 — lockout escalation: the failure count is NOT zeroed on cooldown
     expiry, so a second breach arms a LONGER lockout (>=120s, not a repeat 60s);
  ② #3108 — DELETE /auth/me now arms the SAME password guard as change-password
     (raise_if_locked before bcrypt, record_failure/reset after) so 6 wrong
     passwords from one IP yield a 429 on the 7th instead of 401 forever;
  ③ #3110 — rate_limit enforces a hard ACCOUNT-ONLY bucket (acct:) independent
     of the client IP, so rotating XFF values can no longer reset a per-account
     window;
  ④ #3111 — RequestRateLimitMiddleware returns 429 on a raw request flood before
     routing/auth (bogus Authorization header still 429s at the middleware);
  ⑤ #3112 — a single IP is capped at 3 distinct account lockouts per hour; the
     4th victim's lockout arming is refused with 429;
  ⑥ #3115 — raise_if_locked takes the same FOR UPDATE lock as record_failure;
  ⑦ #3119 — /login is under a per-IP throughput cap and a per-account
     active-session cap.

Run as a plain script; every check is a printed ✓/✖ and the process exits
non-zero on any failure.
"""
import asyncio
import inspect
import logging
import sys
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

from app import ratelimit as rl  # noqa: E402
from app.main import RequestRateLimitMiddleware  # noqa: E402
from app.routers import auth  # noqa: E402
from app.schemas import LoginIn  # noqa: E402

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


# ═════════════════════════════════════════════════════════════════════════
# Fake AsyncSession + bucket store (mirrors test_ratelimit_keys._SharedStoreDB)
# ═════════════════════════════════════════════════════════════════════════

def _bucket_key(stmt):
    wc = stmt.whereclause
    clauses = list(wc.clauses) if hasattr(wc, "clauses") else [wc]
    for c in clauses:
        left = getattr(c, "left", None)
        right = getattr(c, "right", None)
        if getattr(left, "key", None) == "key":
            return getattr(right, "value", None)
    return None


def _stmt_has_for_update(stmt):
    """True when a select statement carries `.with_for_update()` (#3115)."""
    return bool(getattr(stmt, "_for_update_arg", None)) and stmt._for_update_arg is not None


class _Store:
    """Shared rate_limit_buckets store: {key: RateLimitBucket-ish row}."""

    def __init__(self):
        self.data = {}
        self._for_update_seen = []

    def row(self, key):
        return self.data.get(key)


class _StoreDB:
    """Fake AsyncSession over a shared store; records whether scalar SELECTs
    were FOR UPDATE (#3115)."""

    def __init__(self, store, *, allow_fixed=None):
        self.store = store
        self._pending = []
        self.allow_fixed = allow_fixed  # optional override for _allow_fixed_window

    async def scalar(self, stmt):
        if getattr(stmt, "_for_update_arg", None) is not None:
            self.store._for_update_seen.append(stmt._for_update_arg)
        return self.store.data.get(_bucket_key(stmt))

    async def scalars(self, stmt):
        return []

    def add(self, obj):
        self._pending.append(obj)

    async def flush(self):
        for obj in self._pending:
            self.store.data[obj.key] = obj
        self._pending = []

    async def commit(self):
        pass

    async def execute(self, stmt):
        # Model the INSERT ... ON CONFLICT DO NOTHING first-use guard that
        # _allow_fixed_window and AuthAttemptGuard._load_for_update issue
        # (#3114/#3098): materialise a bucket row only when the key is absent.
        params = stmt.compile().params
        key = params.get("key") or params.get("key_1")
        if key is None:
            return _Result()
        if key not in self.store.data:
            self.store.data[key] = SimpleNamespace(
                window_start=params.get("window_start"),
                count=params.get("count", 0),
                prev_count=params.get("prev_count", 0),
                locked_until=params.get("locked_until"),
            )
        return _Result()


class _Result:
    def scalar_one(self):
        return 1

    def scalar_one_or_none(self):
        return None

    def all(self):
        return []


def _guard(store, max_attempts=5, base=60.0):
    return rl.AuthAttemptGuard(max_attempts=max_attempts, base_lockout_seconds=base)


# ═════════════════════════════════════════════════════════════════════════
# ① #3107 — lockout ESCALATES (count survives cooldown expiry)
# ═════════════════════════════════════════════════════════════════════════

async def _test_3107():
    print("① #3107 lockout escalation (count not zeroed on expiry)…")
    g = rl.AuthAttemptGuard(max_attempts=5)
    store = _Store()
    db = _StoreDB(store)
    key = "login:email:parent@test.com"

    # First breach: 5 failures arming a 60s lockout.
    for _ in range(5):
        await g.record_failure(db, key)
    row = store.data[key]
    check("first lockout armed at base 60s",
          round((row.locked_until - row.window_start).total_seconds()), 60)
    first_locked_until = row.locked_until

    # Simulate the cooldown expiring: advance time past locked_until.
    real = rl._naive_utcnow

    def fake_now():
        return first_locked_until + timedelta(seconds=61)

    rl._naive_utcnow = fake_now
    try:
        # 5 more failures after expiry → second lockout must be >= 120s.
        for _ in range(5):
            await g.record_failure(db, key)
    finally:
        rl._naive_utcnow = real

    row = store.data[key]
    second = round((row.locked_until - fake_now()).total_seconds())
    # With count carried forward (count=6..10 → excess 1..5), _lockout_seconds
    # doubles at least once (2 * 60 = 120), plus a further doubling per extra
    # failure. Assert >= 120 (issue's acceptance) and strictly larger than the
    # first 60s lockout.
    check("second lockout >= 120s (escalated, never pinned at 60s)", second >= 120, True)
    check("second lockout strictly larger than first", second > 60, True)


# ═════════════════════════════════════════════════════════════════════════
# ② #3108 — DELETE /auth/me arms the password guard
# ═════════════════════════════════════════════════════════════════════════

def _del_req(ip="1.2.3.4"):
    return SimpleNamespace(
        client=SimpleNamespace(host=ip),
        headers={},
        state=SimpleNamespace(session=SimpleNamespace(id="sess-1")),
    )


class _DelDB:
    """Fake for the local-account branch of delete_account (a wrong password)."""

    def __init__(self, profile):
        self._profile = profile

    async def scalar(self, stmt):
        # only reached by the guard; profile lookups not reached in this branch
        return None

    async def scalars(self, stmt):
        return []

    async def execute(self, stmt):
        return _Result()

    async def commit(self):
        pass

    async def flush(self):
        pass

    def add(self, obj):
        pass

    async def delete(self, obj):
        pass

    async def refresh(self, obj):
        pass


class _FakePasswordGuard:
    """Spy for the password guard — records the key ORDER the route calls in."""

    def __init__(self):
        self.locked = False
        self.events = []

    async def raise_if_locked(self, db, *keys):
        self.events.append(("raise", keys))
        if self.locked:
            raise HTTPException(429, "Too many attempts - try again later")

    async def record_failure(self, db, *keys):
        self.events.append(("record", keys))

    async def reset(self, db, *keys):
        self.events.append(("reset", keys))


async def _test_3108():
    print("② #3108 DELETE /auth/me password guard (no unbounded brute-force)…")
    from app.schemas import DeleteAccountIn

    # The route's dep `_delete_limit` references a real ip_rate_limit; bypass it
    # by calling the function directly with _delete_limit=None.
    sig = inspect.signature(auth.delete_account)
    check("delete_account carries _delete_limit dep", "_delete_limit" in sig.parameters, True)

    profile = SimpleNamespace(id="p123", auth_provider="local", password_hash="not-a-real-hash")
    body = DeleteAccountIn(confirmation="delete my account", password="wrongpass")

    spy = _FakePasswordGuard()
    orig = auth._PASSWORD_GUARD
    auth._PASSWORD_GUARD = spy
    try:
        try:
            await auth.delete_account(body, _del_req(), profile, _DelDB(profile), _delete_limit=None)
            raised = None
        except HTTPException as e:
            raised = e
        check("wrong password → 401 (guard ran, not 500)", raised.status_code, 401)
    finally:
        auth._PASSWORD_GUARD = orig

    kinds = [e[0] for e in spy.events]
    check("guard was raised BEFORE bcrypt", kinds[0], "raise")
    check("failure recorded AFTER wrong password", "record" in kinds, True)
    # Key shape must match change_password: pw:profile + pw:ip.
    record_keys = spy.events[kinds.index("record")][1]
    check("record keyed on pw:profile:<id> + pw:ip:<ip>",
          tuple(record_keys), (f"pw:profile:{profile.id}", "pw:ip:1.2.3.4"))

    # Now verify the 7-attempt → 429 acceptance at the GUARD level: 6 wrong
    # passwords, then raise_if_locked must 429 on the 7th.
    g = rl.AuthAttemptGuard(max_attempts=5)
    store = _Store()
    db = _StoreDB(store)
    for _ in range(6):
        await g.record_failure(db, "pw:profile:p123", "pw:ip:1.2.3.4")
    try:
        await g.raise_if_locked(db, "pw:profile:p123", "pw:ip:1.2.3.4")
        status = None
    except HTTPException as e:
        status = e.status_code
    check("6 wrong passwords → 7th attempt is 429 (not 401)", status, 429)


# ═════════════════════════════════════════════════════════════════════════
# ③ #3110 — account-only bucket independent of rotating IP
# ═════════════════════════════════════════════════════════════════════════

def _rl_req(ip):
    return SimpleNamespace(
        client=SimpleNamespace(host=ip),
        headers={},
        url=SimpleNamespace(path="/api/v1/progress"),
        state=SimpleNamespace(session=None),
    )


async def _test_3110():
    print("③ #3110 per-account bucket survives IP rotation…")
    # Drive rate_limit with 5 distinct client IPs; the acct-only bucket key must
    # be IDENTICAL across all of them while the per-IP flood keys differ.
    acct_keys = set()
    ip_keys = set()

    async def fake_allow(db, key, limit, window_seconds):
        if key.startswith("acct:"):
            acct_keys.add(key)
        else:
            ip_keys.add(key)
        return True

    orig = rl._allow_fixed_window
    rl._allow_fixed_window = fake_allow
    try:
        dep = rl.rate_limit()
        for ip in ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4", "5.5.5.5"]:
            await dep(_rl_req(ip), SimpleNamespace(id="p123"), SimpleNamespace())
    finally:
        rl._allow_fixed_window = orig

    check("one account-only key regardless of IP", acct_keys, {"acct:p123:progress"})
    check("per-IP flood keys differ across the 5 IPs", len(ip_keys), 5)
    check("account key has no IP component", any("1.1.1.1" in k for k in acct_keys), False)


# ═════════════════════════════════════════════════════════════════════════
# ④ #3111 — middleware-level per-IP request cap
# ═════════════════════════════════════════════════════════════════════════

class _OKApp:
    async def __call__(self, scope, receive, send):
        body = b'{"ok":true}'
        await send({"type": "http.response.start", "status": 200,
                    "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": body})


class _Resp:
    def __init__(self):
        self.status_code = 0
        self.body = b""

    def json(self):
        import json as _j
        return _j.loads(self.body.decode("utf-8"))


async def _test_3111():
    print("④ #3111 RequestRateLimitMiddleware per-IP cap (bogus auth still 429s)…")
    allowed = {"n": 0}

    # Monkeypatch _allow_fixed_window so the middleware's bucket logic is
    # deterministic without a DB; and stub SessionLocal so the middleware opens
    # a no-op "session".
    import app.main as mainmod

    class _NoopSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    real_allow = rl._allow_fixed_window
    # IMPORTANT: main.py does `from .ratelimit import _allow_fixed_window`, so its
    # binding is a distinct module-level name — patch BOTH (the middleware reads
    # mainmod._allow_fixed_window).
    real_main_allow = mainmod._allow_fixed_window
    real_session = mainmod.SessionLocal

    async def _fake_allow(db, key, limit, window_seconds):
        allowed["n"] += 1
        return allowed["n"] <= 2  # allow 2, reject the 3rd

    rl._allow_fixed_window = _fake_allow
    mainmod._allow_fixed_window = _fake_allow
    mainmod.SessionLocal = lambda: _NoopSession()
    try:
        mw = RequestRateLimitMiddleware(_OKApp())
        # Drive each request through ASGI from INSIDE the current loop (the
        # middleware `__call__` is awaited directly, not via asyncio.run).
        async def _drive(path, headers):
            return await _raw_request(mw, path, headers)

        await _drive("/api/v1/progress", {"Authorization": "Bearer bogus"})
        await _drive("/api/v1/progress", {"Authorization": "Bearer bogus"})
        r3 = await _drive("/api/v1/progress", {"Authorization": "Bearer bogus"})
    finally:
        rl._allow_fixed_window = real_allow
        mainmod._allow_fixed_window = real_main_allow
        mainmod.SessionLocal = real_session

    check("third bogus-auth request is 429 at the middleware (before auth)", r3.status_code, 429)
    check("429 body carries a generic detail", "Too many requests" in r3.json().get("detail", ""), True)


async def _raw_request(app, path, headers):
    """Drive one ASGI request inside the CURRENT event loop and return a _Resp."""
    hdrs = [(k.lower().encode(), v.encode("latin-1")) for k, v in (headers or {}).items()]
    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1", "method": "POST", "scheme": "http",
        "path": path, "raw_path": path.encode("latin-1"), "query_string": b"",
        "root_path": "", "headers": hdrs,
        "client": ("testclient", 50000), "server": ("test", 80),
    }
    resp = _Resp()
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": b"", "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        if message["type"] == "http.response.start":
            resp.status_code = message["status"]
        elif message["type"] == "http.response.body":
            resp.body += message.get("body", b"")

    await app(scope, receive, send)
    return resp


# ═════════════════════════════════════════════════════════════════════════
# ⑤ #3112 — one IP capped at 3 distinct account lockouts/hour
# ═════════════════════════════════════════════════════════════════════════

async def _test_3112():
    print("⑤ #3112 one IP limited to 3 distinct lockouts per hour…")
    g = rl.AuthAttemptGuard(max_attempts=5)
    store = _Store()
    db = _StoreDB(store)
    ip = "6.6.6.6"
    max_distinct = 3

    # Monkeypatch _allow_fixed_window so the per-IP lockout-armed counter is a
    # deterministic in-memory fixed window (count <= max_distinct allowed).
    lockout_count = {"n": 0}
    real_allow = rl._allow_fixed_window

    async def _fake_allow(d, key, limit, window_seconds):
        if key == f"lockout-armed:{ip}":
            lockout_count["n"] += 1
            return lockout_count["n"] <= max_distinct
        return True

    rl._allow_fixed_window = _fake_allow
    try:
        # Arm a lockout on 3 distinct victim emails → all succeed.
        armed = 0
        for victim in ["a@test.com", "b@test.com", "c@test.com"]:
            try:
                for _ in range(5):
                    await g.record_failure(
                        db, f"login:email:{victim}", f"login:ip:{ip}",
                        ip=ip, max_distinct_lockouts=max_distinct,
                    )
                armed += 1
            except HTTPException:
                break
        check("first 3 distinct victims lock (within budget)", armed, 3)

        # A 4th victim must be refused (429) when arming its lockout.
        try:
            for _ in range(5):
                await g.record_failure(
                    db, "login:email:d@test.com", f"login:ip:{ip}",
                    ip=ip, max_distinct_lockouts=max_distinct,
                )
            status = None
        except HTTPException as e:
            status = e.status_code
        check("4th victim's lockout arming is refused (429)", status, 429)
    finally:
        rl._allow_fixed_window = real_allow

    # Generic message — lockout state not advertised.
    try:
        await g.raise_if_locked(db, "login:email:a@test.com")
    except HTTPException as e:
        check("lockout message is generic (no minute countdown)", "minutes" in e.detail, False)


# ═════════════════════════════════════════════════════════════════════════
# ⑥ #3115 — raise_if_locked takes FOR UPDATE
# ═════════════════════════════════════════════════════════════════════════

async def _test_3115():
    print("⑥ #3115 raise_if_locked uses a FOR UPDATE lock…")
    g = rl.AuthAttemptGuard(max_attempts=5)
    store = _Store()
    db = _StoreDB(store)
    await g.raise_if_locked(db, "login:email:x@test.com", "login:ip:1.2.3.4")
    # _StoreDB.scalar records every statement that carries _for_update_arg.
    check("raise_if_locked issued FOR UPDATE selects",
          len(store._for_update_seen), 2)
    check("both keys were locked", all(v is not None for v in store._for_update_seen), True)


# ═════════════════════════════════════════════════════════════════════════
# ⑦ #3119 — /login throughput cap + per-account session cap
# ═════════════════════════════════════════════════════════════════════════

async def _test_3119():
    print("⑦ #3119 /login throughput cap + active-session cap…")
    sig = inspect.signature(auth.login)
    check("login carries _login_limit dep", "_login_limit" in sig.parameters, True)

    # Active-session cap: verify _issue_session path caps active sessions.
    from app.deps import MAX_ACTIVE_SESSIONS_PER_PROFILE, _cap_active_sessions

    check("per-account active-session cap constant exists",
          MAX_ACTIVE_SESSIONS_PER_PROFILE > 0, True)

    class _ScalarResult:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    class _CapDB:
        def __init__(self, rows):
            self._rows = rows

        async def scalars(self, stmt):
            return _ScalarResult(self._rows)

    sessions = [SimpleNamespace(id=f"s{i}", revoked_at=None, last_seen_at=None) for i in range(30)]
    db = _CapDB(sessions)
    await _cap_active_sessions(db, SimpleNamespace())
    revoked = sum(1 for s in sessions if s.revoked_at is not None)
    check("sessions over the cap are revoked", revoked, 30 - (MAX_ACTIVE_SESSIONS_PER_PROFILE - 1))


# ═════════════════════════════════════════════════════════════════════════

def _run():
    asyncio.run(_test_3107())
    asyncio.run(_test_3108())
    asyncio.run(_test_3110())
    asyncio.run(_test_3111())
    asyncio.run(_test_3112())
    asyncio.run(_test_3115())
    asyncio.run(_test_3119())
    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES: {fails}")
        sys.exit(1)
    print("✓ all security-guardrail checks passed")


if __name__ == "__main__":
    _run()
