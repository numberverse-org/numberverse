#!/usr/bin/env python3
"""#1852 — check-then-insert races surface as clean 409s, not unhandled 500s.

Both `auth.signup` and `push.subscribe` do a non-atomic SELECT-then-INSERT:
two CONCURRENT requests for the same unique key (profile email / push
endpoint) can both clear the lookup and race to the INSERT, where Postgres'
unique constraint fires. Without handling, that IntegrityError escapes as a
500. Both handlers now catch it, roll back, and return a 409.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_concurrent_signup.py
"""
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402

from app.routers import auth, push  # noqa: E402
from app.schemas import SignupIn  # noqa: E402

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


async def expect_http(name, coro, status_code):
    try:
        await coro
    except HTTPException as e:
        check(name, e.status_code, status_code)
        return e
    except Exception as e:  # noqa: BLE001
        check(name, type(e).__name__, f"HTTPException({status_code})")
        return None
    check(name, "no error", f"HTTPException({status_code})")
    return None


def req():
    return SimpleNamespace(
        client=SimpleNamespace(host="1.2.3.4"),
        headers={"user-agent": "test"},
        state=SimpleNamespace(session=None),
    )


# ── Signup fake session: can make the flush hit the unique constraint ───────

class SignupFakeDB:
    """AsyncSession-shaped fake for `auth.signup`.

    `dup_on_flush` simulates the concurrent-race IntegrityError Postgres raises
    on the profiles.email unique constraint; normal flushes assign a profile id.
    """

    def __init__(self, *, dup_on_flush=False):
        self.added = []
        self.dup_on_flush = dup_on_flush
        self.rollback_called = False
        self.commits = 0

    def _apply_defaults(self, obj):
        """Apply SQLAlchemy column defaults so the response serialization
        (ProfileOut) sees the same fields Postgres' INSERT defaults would
        populate. Mirrors tests/test_auth.py's FakeDB."""
        from datetime import datetime, timezone

        from sqlalchemy import DateTime as _DT

        for col in obj.__table__.columns:
            name = col.name
            if getattr(obj, name, None) is not None:
                continue
            if col.default is not None:
                d = col.default
                if d.is_callable:
                    try:
                        val = d.arg(None)
                    except TypeError:
                        val = d.arg()
                elif d.is_scalar:
                    val = d.arg
                else:
                    val = None
                if val is not None:
                    setattr(obj, name, val)
                    continue
            if col.server_default is not None and isinstance(col.type, _DT):
                setattr(obj, name, datetime.now(timezone.utc))

    def add(self, obj):
        self.added.append(obj)
        self._apply_defaults(obj)

    async def flush(self):
        if self.dup_on_flush:
            raise IntegrityError("INSERT INTO profiles", {}, Exception("duplicate key (email)"))
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()  # mirror Postgres RETURNING id
            self._apply_defaults(obj)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollback_called = True

    async def refresh(self, obj):
        pass

    async def scalar(self, stmt):
        return None  # no pre-existing row → the lookup passes (the race)


# ── Push subscribe fake session: first commit can hit the unique constraint ─

class PushRaceFakeDB:
    """AsyncSession-shaped fake for `push.subscribe`.

    The FIRST commit raises the endpoint-unique IntegrityError (the race); the
    re-select then returns `post_race_row` so the handler's recovery branch is
    exercised. `post_race_row=None` simulates the row vanishing → also 409.
    """

    def __init__(self, post_race_row):
        self._first_commit = True
        self._scalar_calls = 0
        self.post_race_row = post_race_row
        self.rollback_called = False
        self.commits = 0
        self.refreshed = None
        self.updated = None

    async def scalar(self, stmt):
        self._scalar_calls += 1
        if self._scalar_calls == 1:
            return None  # the pre-insert lookup → no existing row
        return self.post_race_row  # the post-IntegrityError re-select

    def add(self, obj):
        self.updated = obj

    async def commit(self):
        if self._first_commit:
            self._first_commit = False
            raise IntegrityError("INSERT INTO push_subscriptions", {}, Exception("duplicate key (endpoint)"))
        self.commits += 1

    async def rollback(self):
        self.rollback_called = True

    async def refresh(self, obj):
        self.refreshed = obj


def make_sub(profile_id="p123"):
    return SimpleNamespace(
        profile_id=profile_id,
        endpoint="https://example.com/push/abc",
        p256dh="old-key",
        auth="old-secret",
    )


def _body():
    return push.PushSubscribeIn(
        endpoint="https://example.com/push/abc",
        p256dh="new-key",
        auth="new-secret",
    )


async def _run():
    print("①  auth.signup — IntegrityError on the email constraint → 409 (+ rollback)…")
    db = SignupFakeDB(dup_on_flush=True)
    e = await expect_http(
        "signup race → 409",
        auth.signup(SignupIn(email="race@test.com", password="Password1!", display_name="P"),
                    req(), db, _signup_limit=None),
        409,
    )
    check("signup 409 is generic (no 'registered')", e is not None and "registered" not in e.detail.lower(), True)
    check("signup rolled back the transaction", db.rollback_called, True)

    # The happy path (no race) must be untouched: no rollback, a session minted.
    ok = SignupFakeDB(dup_on_flush=False)
    out = await auth.signup(SignupIn(email="ok@test.com", password="Password1!", display_name="P"),
                            req(), ok, _signup_limit=None)
    check("signup success still returns a token", isinstance(out.token, str) and len(out.token) > 20, True)
    check("signup success commits", ok.commits >= 1, True)
    check("signup success does NOT roll back", ok.rollback_called, False)

    print("②  push.subscribe — IntegrityError on the endpoint constraint…")
    # The winner was ANOTHER account → 409, rollback happened.
    db_other = PushRaceFakeDB(post_race_row=make_sub(profile_id="other-profile"))
    e2 = await expect_http(
        "push subscribe race (other account won) → 409",
        push.subscribe(_body(), SimpleNamespace(id="p123"), db_other, _limiter=None),
        409,
    )
    check("push 409 mentions another account",
          e2 is not None and "another account" in e2.detail.lower(), True)
    check("push rolled back the transaction", db_other.rollback_called, True)

    # The winner was THIS account → recovery updates the row in place.
    db_same = PushRaceFakeDB(post_race_row=make_sub(profile_id="p123"))
    out2 = await push.subscribe(_body(), SimpleNamespace(id="p123"), db_same, _limiter=None)
    check("push race (same account) returns the existing row", out2 is db_same.post_race_row, True)
    check("push race re-keyed p256dh in place", db_same.post_race_row.p256dh, "new-key")
    check("push race re-keyed auth in place", db_same.post_race_row.auth, "new-secret")
    check("push race rolled back", db_same.rollback_called, True)
    check("push race re-committed the recovery write", db_same.commits, 1)

    # Post-race re-select returning nothing at all → still a 409 (can't adopt).
    db_none = PushRaceFakeDB(post_race_row=None)
    e3 = await expect_http(
        "push race with vanished row → 409",
        push.subscribe(_body(), SimpleNamespace(id="p123"), db_none, _limiter=None),
        409,
    )
    check("push vanished-row 409 raised", e3 is not None, True)

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES: {fails}")
        sys.exit(1)
    print("✓ all #1852 concurrent-signup/subscribe checks passed")


if __name__ == "__main__":
    import asyncio

    asyncio.run(_run())
