#!/usr/bin/env python3
"""#3011 — push router behavior coverage (the privacy-critical paths).

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_push_router.py

`test_push.py` already covers the subscribe/unsubscribe rate-limit wiring. This
module covers the ROUTER BEHAVIOR #3011 flagged as untested:

  ① subscribe upsert — a new endpoint inserts a row; re-subscribing the SAME
     endpoint (same profile) updates the keys in place (no duplicate row).
  ② cross-account 409 — subscribing an endpoint already registered to a
     DIFFERENT profile is a 409, and re-subscribe of a foreign endpoint never
     touches the other account's row.
  ③ unsubscribe idempotency — deleting a missing/already-deleted subscription is
     a no-op (never an error); deleting an existing row removes it.
  ④ list secret-redaction — the list response returns id+endpoint+created_at
     ONLY, never the p256dh/auth key material.

Runs against the real handlers (`subscribe`, `unsubscribe`, `list_subscriptions`)
through an in-memory AsyncSession-shaped fake.
"""
import asyncio
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import Select, select  # noqa: E402

from app.routers import push  # noqa: E402
from app.models import PushSubscription  # noqa: E402

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
        print(f"✓ {name}")
    else:
        fails += 1
        print(f"✖ {name}: got {got!r}, want {want!r}")


def _profile(pid="p123"):
    return SimpleNamespace(id=pid)


def _body(endpoint="https://example.com/push/abc123", p256dh="cDI1NmRoLWtleS1tYXRlcmlhbA==", auth="YXV0aC1zZWNyZXQ="):
    return push.PushSubscribeIn(endpoint=endpoint, p256dh=p256dh, auth=auth)


def _unsub_body(endpoint="https://example.com/push/abc123"):
    return push.PushUnsubscribeIn(endpoint=endpoint)


class _FakeDB:
    """In-memory push_subscriptions store with the ORM surface the handlers use."""

    def __init__(self):
        self.rows: list[PushSubscription] = []
        self.commits = 0
        self.refreshes = 0

    async def scalar(self, stmt):
        # resolve the WHERE `endpoint == <value>` (and profile_id when present).
        endpoint = None
        profile_id = None
        wc = getattr(stmt, "whereclause", None)
        # flatten simple AND / eq conditions
        for cond in self._flatten(wc):
            col, op, val = cond
            if col.endswith("endpoint") and op == "=":
                endpoint = val
            if col.endswith("profile_id") and op == "=":
                profile_id = val
        for row in self.rows:
            if endpoint is not None and row.endpoint != endpoint:
                continue
            if profile_id is not None and row.profile_id != profile_id:
                continue
            return row
        return None

    async def scalars(self, stmt):
        # list_subscriptions filters by profile_id, orders by created_at desc.
        profile_id = None
        wc = getattr(stmt, "whereclause", None)
        for cond in self._flatten(wc):
            col, op, val = cond
            if col.endswith("profile_id") and op == "=":
                profile_id = val
        out = [r for r in self.rows if r.profile_id == profile_id]
        return out

    async def get(self, model, pk):
        for r in self.rows:
            if getattr(r, "id", None) == pk:
                return r
        return None

    def add(self, obj):
        self.rows.append(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        self.refreshes += 1

    async def rollback(self):
        pass

    async def delete(self, obj):
        self.rows = [r for r in self.rows if r is not obj]

    def _flatten(self, clause):
        """Return [(col_name, op, value)] for a simple AND of eq conditions."""
        from sqlalchemy.sql.elements import BooleanClauseList

        if clause is None:
            return []
        if isinstance(clause, BooleanClauseList):
            out = []
            for c in clause.clauses:
                out.extend(self._flatten(c))
            return out
        # a single binary expression
        right = clause.right
        val = right.value if hasattr(right, "value") else right
        left = str(clause.left)
        col = left.split(".")[-1]
        op = "="
        return [(col, op, val)]


async def _status(coro):
    try:
        await coro
        return 200
    except HTTPException as e:
        return e.status_code


async def _run():
    # ── ① subscribe upsert ───────────────────────────────────────────────────────
    print("①  #3011 subscribe upsert — insert new, update in place on re-subscribe…")

    db = _FakeDB()
    sub = await push.subscribe(_body(), _profile(), db, _limiter=None)
    check("new endpoint inserts a row", len(db.rows), 1)
    check("new sub returns the endpoint", sub.endpoint, "https://example.com/push/abc123")

    # Re-subscribe the SAME endpoint (same profile) → update keys in place, no new row.
    re = await push.subscribe(_body(p256dh="bmV3LWtleQ==", auth="bmV3LWF1dGg="), _profile(), db, _limiter=None)
    check("re-subscribe does NOT add a second row", len(db.rows), 1)
    check("re-subscribe updates p256dh in place", db.rows[0].p256dh, "bmV3LWtleQ==")
    check("re-subscribe updates auth in place", db.rows[0].auth, "bmV3LWF1dGg=")
    check("re-subscribe returns the same row", re is db.rows[0], True)

    # ── ② cross-account 409 ──────────────────────────────────────────────────────
    print("②  #3011 cross-account 409 — a foreign endpoint is refused and untouched…")

    db = _FakeDB()
    owner = _profile("owner-1")
    await push.subscribe(_body(), owner, db, _limiter=None)
    other = _profile("owner-2")
    st = await _status(push.subscribe(_body(), other, db, _limiter=None))
    check("foreign re-subscribe → 409", st, 409)
    check("foreign re-subscribe left one row", len(db.rows), 1)
    check("the existing row still belongs to owner-1", db.rows[0].profile_id, "owner-1")
    check("the existing row's keys were NOT overwritten",
          db.rows[0].p256dh, "cDI1NmRoLWtleS1tYXRlcmlhbA==")

    # ── ③ unsubscribe idempotency ────────────────────────────────────────────────
    print("③  #3011 unsubscribe idempotency — missing is a no-op, existing deletes…")

    db = _FakeDB()
    # missing sub → no error, no rows
    st = await _status(push.unsubscribe(_unsub_body(), _profile(), db, _limiter=None))
    check("unsubscribe a missing sub → no error", st, 200)
    check("unsubscribe missing left zero rows", len(db.rows), 0)

    # a sub for a DIFFERENT profile under the same endpoint is NOT deleted
    await push.subscribe(_body(), _profile("owner-a"), db, _limiter=None)
    st = await _status(push.unsubscribe(_unsub_body(), _profile("owner-b"), db, _limiter=None))
    check("unsubscribe a different profile's sub → no-op (no error)", st, 200)
    check("the other profile's sub survives", len(db.rows), 1)

    # the owning profile can delete its own sub
    st = await _status(push.unsubscribe(_unsub_body(), _profile("owner-a"), db, _limiter=None))
    check("unsubscribe own sub → deletes it", len(db.rows), 0)

    # ── ④ list secret-redaction ──────────────────────────────────────────────────
    print("④  #3011 list secret-redaction — id+endpoint+created_at only, never keys…")

    db = _FakeDB()
    prof = _profile("owner-r")
    for ep in ("https://example.com/ep1", "https://example.com/ep2"):
        await push.subscribe(_body(endpoint=ep), prof, db, _limiter=None)
    # backfill id/created_at so the response-model serialization is deterministic
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    for r in db.rows:
        r.id = uuid.uuid4()
        r.created_at = now
    listing = await push.list_subscriptions(prof, db)
    check("list returns all of this profile's subs", len(listing), 2)

    # The route's response_model=list[PushSubscriptionOut] is what FastAPI
    # serializes with — so secret-redaction is enforced by OUT's field set. The
    # handler returns raw PushSubscription rows (which DO carry p256dh/auth in
    # the DB); the wire shape is id+endpoint+created_at only.
    out_fields = set(push.PushSubscriptionOut.model_fields.keys())
    check("PushSubscriptionOut carries only the non-secret fields",
          out_fields, {"id", "endpoint", "created_at"})
    for forbidden in ("p256dh", "auth"):
        check(f"PushSubscriptionOut never exposes {forbidden!r}", forbidden in out_fields, False)
    # Serialize a real row through the OUT model and confirm the secrets vanish.
    sample = push.PushSubscriptionOut.model_validate(db.rows[0], from_attributes=True)
    sample_d = sample.model_dump()
    for forbidden in ("p256dh", "auth"):
        check(f"serialized list item never returns {forbidden!r}", forbidden in sample_d, False)


asyncio.run(_run())

print()
if fails:
    print(f"✗ push-router suite: {passes} passed, {fails} FAILED")
    sys.exit(1)
print(f"✓ push-router suite: {passes} passed, 0 failed")
print("SUMMARY push-router: #3011 upsert + cross-account 409 + unsubscribe idempotency + secret redaction covered")
