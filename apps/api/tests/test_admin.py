#!/usr/bin/env python3
"""Admin CRUD + durable rate limiter + RequestBodySizeLimitMiddleware (#2/#5/#6).

Standalone (no Postgres, no pytest):  python3 apps/api/tests/test_admin.py

Covers the test-coverage-api feed:

  #2  admin generic CRUD:
        · mass-assignment guard rejects non-whitelisted / DENIED_WRITE_FIELDS;
        · config validation rejects out-of-range / bad-typed config rows;
        · list/get/update/delete flows work for a representative model;
        · WRITABLE_FIELDS covers every column the update path accepts.

  #5  durable rate limiter (app/ratelimit.py):
        · fixed-window limiter records attempts and blocks after the threshold;
        · per-key isolation (different keys never share a bucket);
        · AuthAttemptGuard locks after N consecutive failures and resets on
          success;
        · state is DB-backed and survives a worker restart (new limiter, new
          session, same storage → the count/lockout is still there).

  #6  RequestBodySizeLimitMiddleware (1 MiB):
        · a body under the limit passes through untouched;
        · Content-Length over budget is rejected with the documented 413;
        · the chunked / unknown-length path is ALSO rejected once it streams
          past the budget.

KNOWN REAL BUGS (reported, asserted as correct behavior — these checks fail on
the current source and are listed in the SUMMARY):
  · create_resource / get_resource reference `request` without declaring it, so
    EVERY create/get of an org-scoped whitelist model (kids, subscriptions,
    organizations, org_members, tenant_config, org_syllabus, classrooms) raises
    NameError("name 'request' is not defined").
  · create_resource strips the client-supplied primary key for string-PK models
    (content_items, skills), so the generic create persists a row with id=None
    (a real Postgres NOT NULL violation on flush).
"""
import asyncio
import json
import sys
import uuid
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import Boolean, Float, Integer  # noqa: E402
from sqlalchemy.dialects.postgresql import ARRAY, JSONB  # noqa: E402

from app.main import (  # noqa: E402
    MAX_REQUEST_BODY_BYTES,
    RequestBodySizeLimitMiddleware,
)
from app.models import (  # noqa: E402
    AdminAudit,
    ContentItem,
    Kid,
    RateLimitBucket,
    Subscription,
)
from app.ratelimit import (  # noqa: E402
    AuthAttemptGuard,
    _allow_fixed_window,
    ip_rate_limit,
    rate_limit,
)
from app.routers import admin as admin_router  # noqa: E402

passes = 0
fails = 0
known_bugs = []  # real bugs — reported, do not block the exit code


def check(name, got, want):
    """Standard check — a mismatch is a FAILURE that exits non-zero."""
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def check_bug(name, got, want):
    """Check that documents a REAL bug — printed as a known-bug, not a failure."""
    global passes
    known_bugs.append(name)
    if got == want:
        passes += 1
        print(f"  ⚠ {name}: PASS (bug fixed?)")
    else:
        print(f"  ⚠ {name} [KNOWN BUG]: got {got!r}, want {want!r}")


def exc_status(fn):
    """Run fn, returning (status_code, detail) if it raises HTTPException."""
    try:
        fn()
    except HTTPException as exc:
        return exc.status_code, exc.detail
    return None, None


async def aexc_status(coro):
    """Await coro, returning (status_code, detail) if it raises HTTPException."""
    try:
        await coro
    except HTTPException as exc:
        return exc.status_code, exc.detail
    return None, None


# ══════════════════════════════════════════════════════════════════════════
# Fake AsyncSession / ASGI doubles (no Postgres)
# ══════════════════════════════════════════════════════════════════════════

class _FakeResult:
    def __init__(self, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = rows or []

    def scalar_one(self):
        return self._scalar

    def scalar_one_or_none(self):
        return self._scalar

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None

    def scalars(self):
        return self

    def __iter__(self):
        return iter(self._rows)


class _Storage:
    """Simulated Postgres `rate_limit_buckets` table (shared across workers)."""

    def __init__(self):
        self.buckets = {}  # key -> dict(count, window_start, locked_until)


class _FakeDB:
    """Minimal AsyncSession stand-in for standalone admin/rate-limit tests.

    Implements the exact AsyncSession surface the admin router and the
    rate limiter touch: execute (fixed-window upsert), scalar (AuthAttemptGuard
    selects + list count), scalars (list rows), get/add/flush/commit/refresh/
    delete (CRUD).
    """

    def __init__(self, storage=None):
        self.storage = storage if storage is not None else _Storage()
        self.commits = 0
        self.flushes = 0
        self.added = []
        self.deleted = []
        self.crud_rows = {}   # str(pk) -> model row, for db.get
        self.list_rows = []   # rows returned by db.scalars
        self._bucket_objs = {}  # key -> RateLimitBucket identity-map object

    # ── rate-limit fixed-window upsert (INSERT ... ON CONFLICT) ──
    async def execute(self, stmt):
        params = stmt.compile().params
        key = params.get("key")
        if key is None:  # not a bucket upsert
            return _FakeResult(scalar=0)
        now = params.get("window_start")
        bucket = self.storage.buckets.get(key)
        if bucket is None:
            bucket = {"count": 0, "window_start": now, "locked_until": None}
            self.storage.buckets[key] = bucket
        bucket["count"] += 1
        return _FakeResult(scalar=bucket["count"])

    # ── AuthAttemptGuard selects + admin list count + org-scoped fetches ──
    async def scalar(self, stmt):
        params = stmt.compile().params
        key = params.get("key_1") or params.get("key")
        if key is not None and key in self.storage.buckets:
            if key not in self._bucket_objs:
                b = self.storage.buckets[key]
                self._bucket_objs[key] = RateLimitBucket(
                    key=key,
                    window_start=b["window_start"],
                    count=b["count"],
                    locked_until=b["locked_until"],
                )
            return self._bucket_objs[key]
        # org-scoped fetch: the WHERE clause references a stored PK
        for value in params.values():
            if str(value) in self.crud_rows:
                return self.crud_rows[str(value)]
        if "count(*)" in str(stmt.compile()):
            return len(self.list_rows)
        return None

    # ── admin CRUD ──
    async def get(self, model, pk):
        return self.crud_rows.get(str(pk))

    async def scalars(self, stmt):
        return _FakeResult(rows=list(self.list_rows))

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, RateLimitBucket):
            self._bucket_objs[obj.key] = obj
        pk_cols = list(obj.__table__.primary_key.columns)
        if len(pk_cols) == 1:
            pk_val = getattr(obj, pk_cols[0].name, None)
            if pk_val is not None:
                self.crud_rows[str(pk_val)] = obj

    async def flush(self):
        self.flushes += 1
        for obj in self.added:
            for col in obj.__table__.columns:
                if (
                    getattr(obj, col.name, None) is None
                    and col.default is not None
                    and col.default.arg is not None
                ):
                    arg = col.default.arg
                    try:
                        setattr(obj, col.name, arg() if callable(arg) else arg)
                    except Exception:
                        pass
            pk_cols = list(obj.__table__.primary_key.columns)
            if len(pk_cols) == 1:
                pk_val = getattr(obj, pk_cols[0].name, None)
                if pk_val is not None:
                    self.crud_rows[str(pk_val)] = obj

    async def commit(self):
        self.commits += 1
        for key, obj in self._bucket_objs.items():
            self.storage.buckets[key] = {
                "count": obj.count,
                "window_start": obj.window_start,
                "locked_until": obj.locked_until,
            }

    async def refresh(self, obj):
        for col in obj.__table__.columns:
            try:
                getattr(obj, col.name)
            except AttributeError:
                if isinstance(col.type, Boolean):
                    setattr(obj, col.name, False)
                elif isinstance(col.type, Integer):
                    setattr(obj, col.name, 0)
                elif isinstance(col.type, Float):
                    setattr(obj, col.name, 0.0)
                elif isinstance(col.type, JSONB):
                    setattr(obj, col.name, {})
                elif isinstance(col.type, ARRAY):
                    setattr(obj, col.name, [])
                else:
                    setattr(obj, col.name, None)

    async def delete(self, obj):
        self.deleted.append(obj)


def _profile(role="admin", is_admin=False):
    return SimpleNamespace(id=uuid.uuid4(), role=role, is_admin=is_admin)


def _request():
    return SimpleNamespace(state=SimpleNamespace(org_id=None), headers={})


def _content_row(cid, title, *, enabled=True, band=1):
    return ContentItem(
        id=cid,
        kind="game",
        title=title,
        config={},
        band=band,
        enabled=enabled,
        tenant_id=None,
        created_at=datetime(2026, 8, 1, 12, 0, 0),
        updated_at=datetime(2026, 8, 1, 12, 0, 0),
    )


def _admin_db(*rows):
    db = _FakeDB()
    db.list_rows = list(rows)
    db.crud_rows = {str(r.id): r for r in rows}
    return db


# ══════════════════════════════════════════════════════════════════════════
# ①  Admin CRUD — mass-assignment guard (#862/#863)
# ══════════════════════════════════════════════════════════════════════════

def test_mass_assignment_guard():
    print("①  Mass-assignment guard — only WRITABLE_FIELDS pass, DENIED never…")

    p = admin_router._writable_payload(
        "profiles",
        {
            "email": "a@b.com",
            "display_name": "A",
            "aggregate_opt_in": True,
            "is_admin": True,
            "role": "super_admin",
            "password_hash": "hunter2",
            "id": "steal-this",
        },
    )
    check("profiles keeps email", p.get("email"), "a@b.com")
    check("profiles keeps display_name", p.get("display_name"), "A")
    check("profiles keeps aggregate_opt_in", p.get("aggregate_opt_in"), True)
    check("profiles drops is_admin", "is_admin" in p, False)
    check("profiles drops role", "role" in p, False)
    check("profiles drops password_hash", "password_hash" in p, False)
    check("profiles drops id", "id" in p, False)

    k = admin_router._writable_payload(
        "kids",
        {"name": "Moyna", "coins": 5, "share_token": "tok", "is_admin": True},
    )
    check("kids keeps name/coins", (k.get("name"), k.get("coins")), ("Moyna", 5))
    check("kids drops share_token", "share_token" in k, False)
    check("kids drops is_admin", "is_admin" in k, False)

    org_id = str(uuid.uuid4())
    prof_id = str(uuid.uuid4())
    o = admin_router._writable_payload(
        "org_members",
        {"org_id": org_id, "profile_id": prof_id, "role": "owner"},
    )
    check("org_members keeps org_id/profile_id", (o.get("org_id"), o.get("profile_id")), (org_id, prof_id))
    check("org_members role is DENIED even though whitelisted", "role" in o, False)

    check("unknown resource → empty", admin_router._writable_payload("nope", {"a": 1}), {})
    check(
        "role is the ONLY DENIED_WRITE_FIELDS entry ever whitelisted (org_members)",
        {
            r for r in admin_router.WHITELIST
            if admin_router.WRITABLE_FIELDS.get(r, set()) & admin_router.DENIED_WRITE_FIELDS
        },
        {"org_members"},
    )


# ══════════════════════════════════════════════════════════════════════════
# ②  Admin CRUD — config validation (#847)
# ══════════════════════════════════════════════════════════════════════════

def test_config_validation():
    print("②  Config validation — out-of-range / bad-typed rows are 422…")

    good = {"pLearn": 0.2, "pGuess": 0.3, "pSlip": 0.3, "decayPerDay": 0.02, "masteryThreshold": 0.8}
    check("valid adaptive object passes", admin_router._validate_config("adaptive", good), good)

    st, dt = exc_status(lambda: admin_router._validate_config("adaptive", {"pLearn": 0.2}))
    check("missing required field → 422", (st, "field" in (dt or "")), (422, True))

    st, dt = exc_status(lambda: admin_router._validate_config("adaptive", "not-an-object"))
    check("non-object value → 422", st, 422)

    st, dt = exc_status(
        lambda: admin_router._validate_config("adaptive", {**good, "pLearn": "high"})
    )
    check("string where number expected → 422", st, 422)

    st, dt = exc_status(
        lambda: admin_router._validate_config("adaptive", {**good, "pGuess": True})
    )
    check("bool is not a number → 422", st, 422)

    st, dt = exc_status(
        lambda: admin_router._validate_config("adaptive", {**good, "pSlip": -0.01})
    )
    check("number below minimum → 422", st, 422)

    st, dt = exc_status(
        lambda: admin_router._validate_config("adaptive", {**good, "pLearn": 1.01})
    )
    check("number above maximum → 422", st, 422)

    st, dt = exc_status(lambda: admin_router._validate_config("unknown_key", good))
    check("unknown config key → 422", st, 422)

    st, dt = exc_status(lambda: admin_router._validate_config("", good))
    check("empty key → 422", st, 422)


# ══════════════════════════════════════════════════════════════════════════
# ③  Admin CRUD — whitelist covers every column the update path accepts
# ══════════════════════════════════════════════════════════════════════════

def test_whitelist_coverage():
    print("③  Whitelist covers every update-path column…")

    bad = []
    for resource, model in admin_router.WHITELIST.items():
        cols = {c.name for c in model.__table__.columns}
        unknown = admin_router.WRITABLE_FIELDS.get(resource, set()) - cols
        if unknown:
            bad.append((resource, sorted(unknown)))
    check("every WRITABLE_FIELDS entry is a real column", bad, [])

    missing = [r for r in admin_router.WHITELIST if r not in admin_router.WRITABLE_FIELDS]
    check("every WHITELIST resource has a WRITABLE_FIELDS entry", missing, [])

    check(
        "no resource whitelists a SENSITIVE_COLUMNS field",
        all(
            admin_router.WRITABLE_FIELDS.get(r, set()) & admin_router.SENSITIVE_COLUMNS
            == set()
            for r in admin_router.WHITELIST
        ),
        True,
    )

    # _row_to_dict must never serialize secret-ish columns.
    kid = Kid(
        id=uuid.uuid4(),
        profile_id=uuid.uuid4(),
        name="Moyna",
        avatar="owl",
        birth_year=2019,
        coins=10,
        share_token="super-secret-token",
        consent_version=None,
        consent_at=None,
        consent_method=None,
        org_id=None,
        created_at=datetime(2026, 8, 1, 12, 0, 0),
    )
    d = admin_router._row_to_dict(kid)
    check("share_token never serialized", "share_token" in d, False)
    check("share_token omitted from admin responses", d.get("share_token"), None)


# ══════════════════════════════════════════════════════════════════════════
# ④  Admin CRUD — list/get/update/delete flows (representative model)
# ══════════════════════════════════════════════════════════════════════════

async def _run_admin_crud():
    print("④  Generic CRUD — list/get/update/delete for content_items…")

    r1 = _content_row("c1", "One", enabled=True)
    r2 = _content_row("c2", "Two", enabled=False, band=2)
    db = _admin_db(r1, r2)
    prof = _profile()

    # ── list ──
    rows = await admin_router.list_resource("content_items", _request(), None, None, None, prof, db)
    check("list returns rows", [r["id"] for r in rows], ["c1", "c2"])

    resp = await admin_router.list_resource("content_items", _request(), None, "[0,1]", None, prof, db)
    check("list with range returns a Response", type(resp).__name__, "Response")
    check("list Content-Range header", resp.headers.get("Content-Range"), "content_items 0-1/2")
    check("list X-Total-Count header", resp.headers.get("X-Total-Count"), "2")

    st, _ = await aexc_status(admin_router.list_resource(
        "content_items", _request(), None, None, "not-json", prof, db))
    check("list malformed filter → 400", st, 400)

    st, _ = await aexc_status(admin_router.list_resource(
        "content_items", _request(), None, None, '{"nope":"v"}', prof, db))
    check("list unknown filter column → 400", st, 400)

    st, _ = await aexc_status(admin_router.list_resource(
        "content_items", _request(), None, None, '{"title":{"x":1}}', prof, db))
    check("list nested filter payload → 400", st, 400)

    # #1801 — an IN-clause value list is bounded like the other guards
    st, _ = await aexc_status(admin_router.list_resource(
        "content_items", _request(), None, None,
        json.dumps({"id": ["x"] * 201}), prof, db))
    check("list oversized IN-list filter → 400", st, 400)

    ok = await admin_router.list_resource(
        "content_items", _request(), None, None,
        json.dumps({"id": ["c1", "c2"]}), prof, db)
    check("list short IN-list filter accepted", [r["id"] for r in ok], ["c1", "c2"])

    st, _ = await aexc_status(admin_router.list_resource(
        "content_items", _request(), None, "[0,999]", None, prof, db))
    check("list oversized range → 400", st, 400)

    st, _ = await aexc_status(admin_router.list_resource(
        "content_items", _request(), '"bad-sort"', None, None, prof, db))
    check("list malformed sort → 400", st, 400)

    st, _ = await aexc_status(admin_router.list_resource(
        "ghost", _request(), None, None, None, prof, db))
    check("list unknown resource → 404", st, 404)

    # valid filter (~ ilike) is accepted
    filtered = await admin_router.list_resource(
        "content_items", _request(), None, None, '{"title":"~on"}', prof, db)
    check("list valid ~ filter accepted", [r["id"] for r in filtered], ["c1", "c2"])

    # ── get ──
    got = await admin_router.get_resource("content_items", "c1", _request(), prof, db)
    check("get returns the row", (got["id"], got["title"]), ("c1", "One"))

    st, _ = await aexc_status(admin_router.get_resource(
        "content_items", "missing", _request(), prof, db))
    check("get missing row → 404", st, 404)

    # malformed UUID on a UUID model → 422, not 500 (#854)
    st, dt = await aexc_status(admin_router.get_resource(
        "kids", "not-a-uuid", _request(), prof, db))
    check("get malformed UUID → 422 Invalid id", (st, dt), (422, "Invalid id"))

    # ── update ──
    upd = await admin_router.update_resource(
        "content_items", "c1",
        {"title": "Updated", "enabled": False, "id": "hack", "password_hash": "x"},
        _request(), prof, db,
    )
    check("update changes writable field", (upd["title"], upd["enabled"]), ("Updated", False))
    check("update ignores denied/non-writable fields", (upd["id"], upd.get("password_hash")), ("c1", None))
    check("update writes audit row", any(
        isinstance(a, AdminAudit) and a.action == "update" for a in db.added), True)

    st, _ = await aexc_status(admin_router.update_resource(
        "content_items", "missing", {"title": "X"}, _request(), prof, db))
    check("update missing row → 404", st, 404)

    # ── delete ──
    db.deleted = []
    db.added = []
    await admin_router.delete_resource("content_items", "c2", _request(), prof, db)
    check("delete removes the row", [x.id for x in db.deleted], ["c2"])
    check("delete writes audit row", any(
        isinstance(a, AdminAudit) and a.action == "delete" for a in db.added), True)

    st, _ = await aexc_status(admin_router.delete_resource(
        "content_items", "missing", _request(), prof, db))
    check("delete missing row → 404", st, 404)


# ══════════════════════════════════════════════════════════════════════════
# ⑤  Admin CRUD — config create + super-admin delete guard (#846)
# ══════════════════════════════════════════════════════════════════════════

async def _run_admin_guards():
    print("⑤  Super-admin guards — config writes and tenant-wide deletes…")

    good = {"pLearn": 0.2, "pGuess": 0.3, "pSlip": 0.3, "decayPerDay": 0.02, "masteryThreshold": 0.8}
    normal = _profile(role="admin", is_admin=False)
    super_admin = _profile(role="super_admin", is_admin=True)

    # config create requires super_admin
    db = _FakeDB()
    st, _ = await aexc_status(admin_router.create_resource(
        "config", {"key": "adaptive", "value": good}, _request(), normal, db))
    check("config create as admin → 403", st, 403)

    db = _FakeDB()
    created = await admin_router.create_resource(
        "config", {"key": "adaptive", "value": good}, _request(), super_admin, db)
    check("config create as super_admin works", created.get("key"), "adaptive")
    check("config create stores value", created.get("value"), good)

    db = _FakeDB()
    st, _ = await aexc_status(admin_router.create_resource(
        "config",
        {"key": "adaptive", "value": {**good, "pLearn": 9.9}},
        _request(), super_admin, db,
    ))
    check("config create with out-of-range value → 422", st, 422)

    # tenant-wide delete (subscriptions) requires super_admin
    db = _admin_db()
    st, _ = await aexc_status(admin_router.delete_resource(
        "subscriptions", str(uuid.uuid4()), _request(), normal, db))
    check("delete subscriptions as admin → 403", st, 403)

    # org-scoped update blocks moving a resource to a different org (#968)
    org_a = str(uuid.uuid4())
    sub = Subscription(
        id=uuid.uuid4(), profile_id=uuid.uuid4(), plan="premium", status="active",
        org_id=uuid.UUID(org_a), seats=None, store=None, store_ref=None,
        current_period_end=None, created_at=datetime(2026, 8, 1, 12, 0, 0),
    )
    db = _FakeDB()
    db.crud_rows[str(sub.id)] = sub
    req = SimpleNamespace(state=SimpleNamespace(org_id=org_a), headers={})
    st, _ = await aexc_status(admin_router.update_resource(
        "subscriptions", str(sub.id),
        {"org_id": str(uuid.uuid4())},
        req, super_admin, db,
    ))
    check("update cannot move resource to a different org → 403", st, 403)


# ══════════════════════════════════════════════════════════════════════════
# ⑥  Admin CRUD — create flow (correct behavior asserted; real bugs reported)
# ══════════════════════════════════════════════════════════════════════════

async def _run_admin_create():
    print("⑥  Create flow — mass-assignment on create + known-bug assertions…")

    # create for a string-PK model strips non-writable fields (the guard works)
    db = _FakeDB()
    prof = _profile()
    created = await admin_router.create_resource(
        "content_items",
        {"id": "new-game-1", "kind": "game", "title": "New", "enabled": True, "password_hash": "x"},
        _request(), prof, db,
    )
    check("create keeps writable fields", (created.get("kind"), created.get("title"), created.get("enabled")),
          ("game", "New", True))
    check("create drops non-writable fields", created.get("password_hash"), None)

    # ── REAL BUG #1 (FIXED): string-PK resources (skills, content_items) carry a
    # client-supplied natural key; the mass-assignment guard strips `id`, so the
    # create path restores it (anything not in UUID_MODELS) before building the
    # model. Assert the client PK survives the round-trip.
    db2 = _FakeDB()
    created2 = await admin_router.create_resource(
        "content_items",
        {"id": "new-game-1", "kind": "game", "title": "New", "enabled": True},
        _request(), prof, db2,
    )
    check("create string-PK resource preserves client id", created2.get("id"), "new-game-1")

    # ── REAL BUG #2 (FIXED): create_resource referenced `request` without
    # declaring it — creating ANY org-scoped whitelist model raised NameError.
    # The handler now declares `request: Request`; assert the org-scoped create
    # resolves the request context (X-Org-ID absent → no org, no NameError).
    sub_profile = str(uuid.uuid4())
    db3 = _FakeDB()
    created3 = await admin_router.create_resource(
        "subscriptions", {"profile_id": sub_profile, "plan": "premium"}, _request(), prof, db3)
    check("create org-scoped model works (no NameError)", created3.get("plan"), "premium")

    # ── REAL BUG #3 (FIXED): get_resource also referenced `request` without
    # declaring it — fetching ANY org-scoped whitelist model raised NameError.
    # Now resolves the request context; unknown id → clean 404, not NameError.
    db4 = _FakeDB()
    st, _ = await aexc_status(admin_router.get_resource("kids", str(uuid.uuid4()), _request(), prof, db4))
    check("get org-scoped model works (no NameError)", st, 404)


# ══════════════════════════════════════════════════════════════════════════
# ⑦  Rate limiter — durable fixed-window bucket (#772)
# ══════════════════════════════════════════════════════════════════════════

async def _run_rate_limit_window():
    print("⑦  Durable rate limiter — fixed-window buckets…")

    db = _FakeDB()
    check("first request allowed", await _allow_fixed_window(db, "acct:1.1.1.1", 2, 60), True)
    check("second request allowed (== threshold)", await _allow_fixed_window(db, "acct:1.1.1.1", 2, 60), True)
    check("third request BLOCKED (> threshold)", await _allow_fixed_window(db, "acct:1.1.1.1", 2, 60), False)
    check("upsert commits", db.commits >= 1, True)

    # per-key isolation
    db2 = _FakeDB()
    await _allow_fixed_window(db2, "keyA", 2, 60)
    await _allow_fixed_window(db2, "keyA", 2, 60)
    check("keyB first request not affected by keyA", await _allow_fixed_window(db2, "keyB", 2, 60), True)
    check("keyA still blocked", await _allow_fixed_window(db2, "keyA", 2, 60), False)

    # durable storage survives a "restart" (new session, same Postgres)
    storage = _Storage()
    db3 = _FakeDB(storage)
    await _allow_fixed_window(db3, "durable", 2, 60)
    await _allow_fixed_window(db3, "durable", 2, 60)
    db4 = _FakeDB(storage)  # new worker / restarted process
    check("count persisted across restart → blocked", await _allow_fixed_window(db4, "durable", 2, 60), False)


# ══════════════════════════════════════════════════════════════════════════
# ⑧  Rate limiter — rate_limit / ip_rate_limit dependencies
# ══════════════════════════════════════════════════════════════════════════

async def _run_rate_limit_deps():
    print("⑧  rate_limit / ip_rate_limit dependency behavior…")

    # rate_limit: account+IP key, returns the profile
    db = _FakeDB()
    dep = rate_limit(limit=2)
    req = SimpleNamespace(client=SimpleNamespace(host="10.0.0.1"))
    prof = _profile()
    got = await dep(request=req, profile=prof, db=db)
    check("rate_limit passes through the profile", got.id, prof.id)
    await dep(request=req, profile=prof, db=db)
    try:
        await dep(request=req, profile=prof, db=db)
        check("rate_limit blocks over threshold", "no-429", "429")
    except HTTPException as exc:
        check("rate_limit blocks over threshold", exc.status_code, 429)

    # per-key isolation across different IPs
    db2 = _FakeDB()
    dep2 = rate_limit(limit=1)
    req_a = SimpleNamespace(client=SimpleNamespace(host="10.0.0.1"))
    req_b = SimpleNamespace(client=SimpleNamespace(host="10.0.0.2"))
    await dep2(request=req_a, profile=prof, db=db2)
    check("rate_limit isolated per IP", await _rate_dep_allowed(dep2, req_b, prof, db2), True)
    try:
        await dep2(request=req_a, profile=prof, db=db2)
        check("rate_limit blocks same IP again", "no-429", "429")
    except HTTPException as exc:
        check("rate_limit blocks same IP again", exc.status_code, 429)

    # ip_rate_limit: IP-only key for public reads
    db3 = _FakeDB()
    dep3 = ip_rate_limit(limit=1)
    req_pub = SimpleNamespace(client=SimpleNamespace(host="10.0.0.9"))
    await dep3(request=req_pub, db=db3)
    try:
        await dep3(request=req_pub, db=db3)
        check("ip_rate_limit blocks over threshold", "no-429", "429")
    except HTTPException as exc:
        check("ip_rate_limit blocks over threshold", exc.status_code, 429)


async def _rate_dep_allowed(dep, request, profile, db):
    try:
        await dep(request=request, profile=profile, db=db)
        return True
    except HTTPException:
        return False


# ══════════════════════════════════════════════════════════════════════════
# ⑨  Rate limiter — AuthAttemptGuard (#1489)
# ══════════════════════════════════════════════════════════════════════════

async def _run_auth_attempt_guard():
    print("⑨  AuthAttemptGuard — failure-aware lockout + reset…")

    guard = AuthAttemptGuard(max_attempts=5, base_lockout_seconds=60, max_lockout_seconds=1800)
    check("lockout 60s at threshold", guard._lockout_seconds(5), 60.0)
    check("lockout doubles (2 min)", guard._lockout_seconds(6), 120.0)
    check("lockout caps at 30 min", guard._lockout_seconds(100), 1800.0)

    storage = _Storage()
    db = _FakeDB(storage)
    g = AuthAttemptGuard(max_attempts=2, base_lockout_seconds=60, max_lockout_seconds=1800)
    await g.record_failure(db, "login:a@b.com")
    await g.record_failure(db, "login:a@b.com")

    # after N consecutive failures the key is locked
    try:
        await g.raise_if_locked(db, "login:a@b.com")
        check("locked after N failures → 429", "no-429", "429")
    except HTTPException as exc:
        check("locked after N failures → 429", exc.status_code, 429)

    # a different key is not affected (per-key isolation)
    try:
        await g.raise_if_locked(db, "login:other@x.com")
        check("unrelated key not locked", True, True)
    except HTTPException:
        check("unrelated key not locked", False, True)

    # lockout is durable across a worker restart
    db_restart = _FakeDB(storage)
    g_restart = AuthAttemptGuard(max_attempts=2)
    try:
        await g_restart.raise_if_locked(db_restart, "login:a@b.com")
        check("lockout survives restart → 429", "no-429", "429")
    except HTTPException as exc:
        check("lockout survives restart → 429", exc.status_code, 429)

    # success resets the key
    await g.reset(db, "login:a@b.com")
    try:
        await g.raise_if_locked(db, "login:a@b.com")
        check("reset on success clears the lock", True, True)
    except HTTPException:
        check("reset on success clears the lock", False, True)


# ══════════════════════════════════════════════════════════════════════════
# ⑩  RequestBodySizeLimitMiddleware (#836)
# ══════════════════════════════════════════════════════════════════════════

def _http_scope(headers=None):
    return {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/progress",
        "headers": headers or [],
        "query_string": b"",
        "server": None,
        "client": None,
        "scheme": "http",
    }


async def _run_middleware():
    print("⑩  RequestBodySizeLimitMiddleware — 1 MiB guard…")

    # under-limit body passes through
    seen = {}
    async def app_under(scope, receive, send):
        seen["called"] = True
        body = b""
        while True:
            msg = await receive()
            if msg["type"] == "http.disconnect":
                break
            body += msg.get("body", b"")
            if not msg.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok:" + body})

    sent = []

    async def send(msg):
        sent.append(msg)

    mw = RequestBodySizeLimitMiddleware(app_under, MAX_REQUEST_BODY_BYTES)
    scope = _http_scope([(b"content-length", b"5")])
    queue = [{"type": "http.request", "body": b"hello", "more_body": False}]

    async def receive():
        return queue.pop(0) if queue else {"type": "http.request", "body": b"", "more_body": False}

    await mw(scope, receive, send)
    check("under-limit: app is called", seen.get("called"), True)
    check("under-limit: response is the app's", sent[0]["status"], 200)
    check("under-limit: body delivered intact", sent[1]["body"], b"ok:hello")

    # Content-Length over budget → immediate 413, app never invoked
    seen2 = {}

    async def app_bad(scope, receive, send):
        seen2["called"] = True

    sent2 = []

    async def send2(msg):
        sent2.append(msg)

    mw2 = RequestBodySizeLimitMiddleware(app_bad, MAX_REQUEST_BODY_BYTES)
    scope2 = _http_scope([(b"content-length", str(MAX_REQUEST_BODY_BYTES + 1).encode())])

    async def receive2():
        return {"type": "http.request", "body": b"", "more_body": False}

    await mw2(scope2, receive2, send2)
    check("content-length over: app NOT called", seen2.get("called"), None)
    check("content-length over: 413 status", sent2[0]["status"], 413)
    check("content-length over: documented body",
          sent2[1]["body"], b'{"detail":"Request body too large"}')

    # chunked / unknown-length body over budget → also 413 (streamed count)
    seen3 = {}

    async def app_stream(scope, receive, send):
        seen3["called"] = True
        while True:
            msg = await receive()
            if msg["type"] == "http.disconnect":
                break
            if not msg.get("more_body", False):
                break
        # a rejected downstream response must be suppressed
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"should-not-arrive"})

    sent3 = []

    async def send3(msg):
        sent3.append(msg)

    mw3 = RequestBodySizeLimitMiddleware(app_stream, MAX_REQUEST_BODY_BYTES)
    scope3 = _http_scope([])  # no Content-Length → chunked/unknown path
    queue3 = [
        {"type": "http.request", "body": b"x" * (MAX_REQUEST_BODY_BYTES + 10), "more_body": True},
        {"type": "http.request", "body": b"", "more_body": False},
    ]

    async def receive3():
        return queue3.pop(0) if queue3 else {"type": "http.request", "body": b"", "more_body": False}

    await mw3(scope3, receive3, send3)
    check("chunked over: 413 status", sent3[0]["status"], 413)
    check("chunked over: documented body", sent3[1]["body"], b'{"detail":"Request body too large"}')
    check("chunked over: downstream 200 suppressed", any(m.get("status") == 200 for m in sent3), False)

    # non-HTTP scope passes through untouched
    seen4 = {}

    async def app_ws(scope, receive, send):
        seen4["called"] = True

    mw4 = RequestBodySizeLimitMiddleware(app_ws, MAX_REQUEST_BODY_BYTES)
    await mw4({"type": "websocket"}, None, None)
    check("non-http scope passes through", seen4.get("called"), True)


# ══════════════════════════════════════════════════════════════════════════

def _run():
    test_mass_assignment_guard()
    test_config_validation()
    test_whitelist_coverage()
    asyncio.run(_run_admin_crud())
    asyncio.run(_run_admin_guards())
    asyncio.run(_run_admin_create())
    asyncio.run(_run_rate_limit_window())
    asyncio.run(_run_rate_limit_deps())
    asyncio.run(_run_auth_attempt_guard())
    asyncio.run(_run_middleware())

    print()
    if fails:
        print(f"✖ {fails} FAILURES")
        sys.exit(1)
    if known_bugs:
        print(f"⚠ {len(known_bugs)} KNOWN-BUG assertion(s) documented (not counted as failures):")
        for b in known_bugs:
            print(f"    · {b}")
    print(f"✓ {passes} checks passed")
    if known_bugs:
        print("Real bugs reported — see SUMMARY line.")
    else:
        print("SUMMARY admin: real bugs: none — all coverage-wave findings fixed (#2/#5/#6 + request NameError + string-PK id)")
    sys.exit(0)


if __name__ == "__main__":
    _run()
