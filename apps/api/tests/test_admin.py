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

  #1765 admin semantic-search / embed rate budget:
        · POST /admin/stories/search and /admin/stories/embed declare a keyword
          `_limiter` param defaulting to None (FastAPI injects the limiter);
        · ADMIN_SEARCH_RATE_LIMIT (20/min) and ADMIN_EMBED_RATE_LIMIT (10/min)
          are both stricter than the 120/min parent write tier.

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
import inspect
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
from sqlalchemy.exc import IntegrityError  # noqa: E402

from app.main import (  # noqa: E402
    MAX_REQUEST_BODY_BYTES,
    RequestBodySizeLimitMiddleware,
)
from app.models import (  # noqa: E402
    AdminAudit,
    ContentItem,
    Kid,
    Profile,
    RateLimitBucket,
    Session,
    Subscription,
)
from app.ratelimit import (  # noqa: E402
    _REQUESTS_PER_MIN,
    AuthAttemptGuard,
    _allow_fixed_window,
    ip_rate_limit,
    rate_limit,
)
from app.routers import admin as admin_router  # noqa: E402
from app.security import hash_password, verify_password  # noqa: E402

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
        self.rollbacks = 0
        self.added = []
        self.deleted = []
        self.crud_rows = {}   # str(pk) -> model row, for db.get
        self.list_rows = []   # rows returned by db.scalars
        self.last_stmts = []  # every stmt handed to scalars (compile-assertable)
        self._bucket_objs = {}  # key -> RateLimitBucket identity-map object
        # #1625 — when True, commit() raises IntegrityError so the admin CRUD
        # path's 409 handling can be asserted without Postgres.
        self.raise_on_commit = False

    # ── rate-limit first-use guard (INSERT ... ON CONFLICT DO NOTHING) ──
    async def execute(self, stmt):
        params = stmt.compile().params
        key = params.get("key")
        if key is None:  # not a bucket upsert
            return _FakeResult(scalar=0)
        # #3114 — ensure the row exists (as the real ON CONFLICT DO NOTHING does);
        # the increment itself now happens in the SELECT FOR UPDATE Python path,
        # so this must NOT bump the count (that would double-count).
        if key not in self.storage.buckets:
            self.storage.buckets[key] = {
                "count": 0,
                "window_start": params.get("window_start"),
                "prev_count": 0,
                "locked_until": None,
            }
        return _FakeResult(scalar=0)

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
                    prev_count=b.get("prev_count"),
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
        self.last_stmts.append(stmt)
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
        if self.raise_on_commit:
            # Simulate a Postgres unique/FK/CHECK violation surfacing as a
            # sqlalchemy IntegrityError (the generic admin 409 path).
            raise IntegrityError(
                "INSERT INTO resource (...) VALUES (...)",
                {},
                Exception('duplicate key value violates unique constraint "uq"'),
            )
        self.commits += 1
        for key, obj in self._bucket_objs.items():
            self.storage.buckets[key] = {
                "count": obj.count,
                "window_start": obj.window_start,
                "prev_count": getattr(obj, "prev_count", None),
                "locked_until": obj.locked_until,
            }

    async def rollback(self):
        self.rollbacks += 1

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


def _request_with_org(org_id):
    """Request carrying an X-Org-ID header (state.org_id still unset)."""
    return SimpleNamespace(
        state=SimpleNamespace(org_id=None),
        headers={"X-Org-ID": str(org_id)},
    )


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

    # #1647/#1801 — an IN-clause value list is bounded like the other guards
    st, _ = await aexc_status(admin_router.list_resource(
        "content_items", _request(), None, None,
        json.dumps({"id": ["x"] * (admin_router.MAX_FILTER_LIST_LEN + 1)}), prof, db))
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

    # malformed UUID on a UUID model → 400, not 500 (#854/#1627 — ONE 400
    # contract for every malformed client-supplied identifier; 422 is reserved
    # for schema-level body validation only)
    st, dt = await aexc_status(admin_router.get_resource(
        "kids", "not-a-uuid", _request(), prof, db))
    check("get malformed UUID → 400 Invalid id", (st, dt), (400, "Invalid id"))

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
# ④b  #1799 — `~` filters escape SQL wildcards: a literal %/_ is matched
#       literally, never as an ILIKE pattern
# ══════════════════════════════════════════════════════════════════════════

def _compile_last_list_stmt(db):
    """Compile the last stmt list_resource handed to scalars → (sql, params)."""
    compiled = db.last_stmts[-1].compile()
    return str(compiled), dict(compiled.params)


async def _run_admin_wildcard_escape():
    print("④b  #1799 — `~` filter wildcards are escaped (%% / _ matched literally)…")
    prof = _profile()

    # Pure helper: % → \%, _ → \_, and the escape char itself is escaped FIRST.
    check("_escape_like_literal escapes a literal percent",
          admin_router._escape_like_literal("50%"), "50\\%")
    check("_escape_like_literal escapes a literal underscore",
          admin_router._escape_like_literal("a_b"), "a\\_b")
    check("_escape_like_literal escapes the escape char first",
          admin_router._escape_like_literal("back\\slash"), "back\\\\slash")
    check("_escape_like_literal double-escapes a backslash before %",
          admin_router._escape_like_literal("\\%"), "\\\\\\%")

    # A `~%` filter must bind the ESCAPED pattern so it matches a literal `%`
    # instead of every row: pattern is %\%% (needs a real `%` char), not %%%.
    db = _FakeDB()
    await admin_router.list_resource("content_items", _request(), None, None,
                                     '{"title":"~%"}', prof, db)
    sql, params = _compile_last_list_stmt(db)
    check("list ~%% filter carries the ILIKE ESCAPE clause", "ESCAPE" in sql, True)
    check("list ~%% filter binds the escaped literal %% pattern",
          "%\\%%" in params.values(), True)
    check("list ~%% filter does NOT bind a match-everything %%%",
          "%%%" in params.values(), False)

    # A literal `%` inside a longer value is searchable too (e.g. a title "50%").
    db = _FakeDB()
    await admin_router.list_resource("content_items", _request(), None, None,
                                     '{"title":"~50%"}', prof, db)
    _, params = _compile_last_list_stmt(db)
    check("list ~50%% binds the literal percent inside the value",
          "%50\\%%" in params.values(), True)

    # A literal `_` is searchable: pattern is %a\_b%, so `axb` would NOT match.
    db = _FakeDB()
    await admin_router.list_resource("content_items", _request(), None, None,
                                     '{"title":"~a_b"}', prof, db)
    _, params = _compile_last_list_stmt(db)
    check("list ~a_b escapes the underscore (literal _ search)",
          "%a\\_b%" in params.values(), True)

    # Escaping must not disturb the surrounding %-wildcards of the `~` contains
    # semantics — the term is still wrapped in %...% on BOTH sides.
    db = _FakeDB()
    await admin_router.list_resource("content_items", _request(), None, None,
                                     '{"title":"~on"}', prof, db)
    _, params = _compile_last_list_stmt(db)
    check("list ~on still wraps the term in contains %...%",
          "%on%" in params.values(), True)


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

    # per-ACCOUNT isolation (#3110): the account-only bucket is keyed on the
    # profile, so a DIFFERENT IP on the SAME account no longer gets a fresh
    # window — the per-account budget is the point. A different ACCOUNT does.
    db2 = _FakeDB()
    dep2 = rate_limit(limit=1)
    req_a = SimpleNamespace(client=SimpleNamespace(host="10.0.0.1"))
    req_b = SimpleNamespace(client=SimpleNamespace(host="10.0.0.2"))
    prof2 = _profile()
    await dep2(request=req_a, profile=prof, db=db2)
    # #3110 — same account, different IP → NOT allowed (per-account bucket shared).
    check("rate_limit NOT isolated per IP (account bucket shared, #3110)",
          await _rate_dep_allowed(dep2, req_b, prof, db2), False)
    # A DIFFERENT account on a fresh db is allowed (per-account isolation holds).
    db2b = _FakeDB()
    dep2b = rate_limit(limit=1)
    await dep2b(request=req_a, profile=prof, db=db2b)
    req_c = SimpleNamespace(client=SimpleNamespace(host="10.0.0.3"))
    check("rate_limit isolated per ACCOUNT (different profile allowed)",
          await _rate_dep_allowed(dep2b, req_c, prof2, db2b), True)
    try:
        await dep2(request=req_a, profile=prof, db=db2)
        check("rate_limit blocks same account again", "no-429", "429")
    except HTTPException as exc:
        check("rate_limit blocks same account again", exc.status_code, 429)

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

    # #1763 — tagged ip_rate_limit buckets are independent per surface: burning
    # tag "a" to its limit must NOT affect tag "b" on the SAME IP.
    db4 = _FakeDB()
    dep_tag_a = ip_rate_limit(limit=1, tag="a")
    dep_tag_b = ip_rate_limit(limit=1, tag="b")
    req_tag = SimpleNamespace(client=SimpleNamespace(host="10.0.0.9"))
    await dep_tag_a(request=req_tag, db=db4)  # burn bucket "a" to its limit
    try:
        await dep_tag_a(request=req_tag, db=db4)
        check("tagged ip_rate_limit bucket a blocks over threshold", "no-429", "429")
    except HTTPException as exc:
        check("tagged ip_rate_limit bucket a blocks over threshold", exc.status_code, 429)
    # Bucket "b" is a separate key — the same IP still passes through it.
    try:
        await dep_tag_b(request=req_tag, db=db4)
        check("ip_rate_limit tag b is independent of tag a", True, True)
    except HTTPException:
        check("ip_rate_limit tag b is independent of tag a", False, True)


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
# ⑪  #1765 — admin semantic-search / embed endpoints get a strict rate budget
# ══════════════════════════════════════════════════════════════════════════

def test_search_embed_rate_limits():
    print("⑪  #1765 — search/embed rate-limit params and budgets…")

    # (a) both handlers declare a KEYWORD `_limiter` param defaulting to None.
    #     FastAPI injects the limiter dependency at request time; the None
    #     default keeps direct positional calls working in these unit tests.
    for name in ("search_stories", "embed_stories_now"):
        sig = inspect.signature(getattr(admin_router, name))
        param = sig.parameters.get("_limiter")
        check(f"{name} declares _limiter", param is not None, True)
        check(
            f"{name} _limiter is a keyword param",
            param is not None and param.kind
            in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY),
            True,
        )
        check(
            f"{name} _limiter defaults to None",
            None if param is None else param.default,
            None,
        )

    # (b) the strict admin budgets sit far below the 120/min parent write tier.
    search_limit = inspect.getclosurevars(admin_router.ADMIN_SEARCH_RATE_LIMIT).nonlocals["limit"]
    embed_limit = inspect.getclosurevars(admin_router.ADMIN_EMBED_RATE_LIMIT).nonlocals["limit"]
    check("ADMIN_SEARCH_RATE_LIMIT < _REQUESTS_PER_MIN", search_limit < _REQUESTS_PER_MIN, True)
    check("ADMIN_EMBED_RATE_LIMIT < _REQUESTS_PER_MIN", embed_limit < _REQUESTS_PER_MIN, True)


async def _run_search_embed_direct_calls():
    print("⑫  #1765 — search/embed direct positional calls still work…")

    db = _FakeDB()
    prof = _profile()

    # embed: positional (profile, db). The ML stack is absent in this test
    # environment, so the job reports `skipped` — the point is the call itself
    # still resolves with the new `_limiter` param defaulting to None.
    result = await admin_router.embed_stories_now(prof, db)
    check("embed_stories_now direct call runs", isinstance(result, dict), True)
    check("embed direct call reports skipped (no ML stack)", result.get("status"), "skipped")

    # search: positional (body, profile, db). The embedding model is missing, so
    # the route reports a clean 503 exactly as before the limiter was added.
    body = SimpleNamespace(query="a fraction with fifths", top_k=3)
    st, _ = await aexc_status(admin_router.search_stories(body, prof, db))
    check("search_stories direct call runs (503, no ML stack)", st, 503)


# ══════════════════════════════════════════════════════════════════════════
# ⑬  #1586 — admin-only parent-password reset (operator-assisted recovery)
# ══════════════════════════════════════════════════════════════════════════

async def _run_admin_reset_password():
    print("⑬  #1586 — admin reset-parent-password (operator-assisted recovery)…")

    # ── authz: only admin/super_admin may reset a parent's password
    try:
        await admin_router.require_admin(_profile(role="user", is_admin=False))
        check("reset as plain user → 403", "no-403", 403)
    except HTTPException as exc:
        check("reset as plain user → 403", exc.status_code, 403)
    got = await admin_router.require_admin(_profile(role="admin", is_admin=False))
    check("reset as admin allowed", got.role, "admin")

    # ── happy path: new hash, flips auth_provider, revokes sessions, audits
    parent = Profile(
        id=uuid.uuid4(),
        email="locked@example.com",
        password_hash=hash_password("oldpass123"),
        auth_provider="google",
        display_name="Locked Parent",
        is_admin=False,
        role="user",
        legacy_sessions_revoked_at=None,
    )
    old_session = Session(
        id=uuid.uuid4(),
        profile_id=parent.id,
        token_hash="stale-hash",
        revoked_at=None,
        user_agent=None,
        ip=None,
        last_seen_at=None,
        created_at=datetime(2026, 8, 1, 12, 0, 0),
    )
    db = _FakeDB()
    db.crud_rows[str(parent.id)] = parent
    db.list_rows = [old_session]
    await admin_router.reset_parent_password(
        parent.id, SimpleNamespace(new_password="newpass123"), _profile(), db
    )
    check("reset sets a working password hash", verify_password("newpass123", parent.password_hash), True)
    check("reset flips auth_provider to local", parent.auth_provider, "local")
    check("reset revokes the active session", old_session.revoked_at is not None, True)
    check("reset stamps the legacy-token cutoff", parent.legacy_sessions_revoked_at is not None, True)
    check("reset writes an audit row", any(
        isinstance(a, AdminAudit) and a.action == "reset-password" for a in db.added
    ), True)

    # ── unknown parent → 404 (never 500)
    st, _ = await aexc_status(admin_router.reset_parent_password(
        uuid.uuid4(), SimpleNamespace(new_password="newpass123"), _profile(), _FakeDB()
    ))
    check("reset missing parent → 404", st, 404)

    # ── #1675 — byte-too-long password → 422 (25 emojis = 100 bytes > 72)
    st, dt = await aexc_status(admin_router.reset_parent_password(
        parent.id, SimpleNamespace(new_password="👍" * 25), _profile(), db
    ))
    check("reset over-72-byte password → 422", (st, "too long" in (dt or "").lower()), (422, True))


# ══════════════════════════════════════════════════════════════════════════
# ⑭  #1622/#1623 — org-scoped admin CRUD: force-bind, 403 on cross-org,
#     malformed body org_id 400 (never 500)
# ══════════════════════════════════════════════════════════════════════════

async def _run_admin_org_crud():
    print("⑭  Org-scoped admin CRUD — force-bind, cross-org 403, malformed body 400…")
    prof = _profile()
    org_a = uuid.uuid4()
    org_b = uuid.uuid4()

    def _sub(org=None):
        return Subscription(
            id=uuid.uuid4(), profile_id=uuid.uuid4(), plan="premium", status="active",
            org_id=org, seats=None, store=None, store_ref=None, current_period_end=None,
            created_at=datetime(2026, 8, 1, 12, 0, 0),
        )

    # ── GET an org-scoped resource with an X-Org-ID → 200 (not 500)
    sub = _sub(org=org_a)
    db = _FakeDB()
    db.crud_rows[str(sub.id)] = sub
    got = await admin_router.get_resource("subscriptions", str(sub.id), _request_with_org(org_a), prof, db)
    check("get org-scoped resource with X-Org-ID returns the row", str(got["org_id"]), str(org_a))

    # ── GET a missing org-scoped id → clean 404, never 500
    db2 = _FakeDB()
    st, _ = await aexc_status(admin_router.get_resource(
        "subscriptions", str(uuid.uuid4()), _request_with_org(org_a), prof, db2))
    check("get org-scoped missing id → 404, never 500", st, 404)

    # ── POST org-scoped with a valid X-Org-ID → 201, org_id force-bound
    db3 = _FakeDB()
    created = await admin_router.create_resource(
        "subscriptions", {"profile_id": str(uuid.uuid4()), "plan": "premium"},
        _request_with_org(org_a), prof, db3,
    )
    check("create org-scoped POST force-binds org_id", str(created["org_id"]), str(org_a))
    check("create org-scoped writes an audit row", any(
        isinstance(a, AdminAudit) and a.action == "create" for a in db3.added), True)

    # ── POST with a mismatched body org_id → 403, never 500
    db4 = _FakeDB()
    st, _ = await aexc_status(admin_router.create_resource(
        "subscriptions",
        {"profile_id": str(uuid.uuid4()), "plan": "premium", "org_id": str(org_b)},
        _request_with_org(org_a), prof, db4,
    ))
    check("create org-scoped mismatched body org_id → 403", st, 403)

    # ── POST with a malformed body org_id → 400 (#1624/#1627), never 500
    db5 = _FakeDB()
    st, dt = await aexc_status(admin_router.create_resource(
        "subscriptions",
        {"profile_id": str(uuid.uuid4()), "plan": "premium", "org_id": "not-a-uuid"},
        _request_with_org(org_a), prof, db5,
    ))
    check("create malformed body org_id → 400 Invalid org_id", (st, dt), (400, "Invalid org_id"))

    # ── PUT with a mismatched body org_id → 403 (#1624 on the update path)
    sub_upd = _sub(org=org_a)
    db6 = _FakeDB()
    db6.crud_rows[str(sub_upd.id)] = sub_upd
    st, _ = await aexc_status(admin_router.update_resource(
        "subscriptions", str(sub_upd.id), {"org_id": str(org_b)},
        _request_with_org(org_a), prof, db6,
    ))
    check("update org-scoped mismatched body org_id → 403", st, 403)


# ══════════════════════════════════════════════════════════════════════════
# ⑮  #1637 — kids writable allow-list: profile_id immutable, coins ge=0
# ══════════════════════════════════════════════════════════════════════════

async def _run_admin_kids_guard():
    print("⑮  Kids guard — profile_id not writable, coins constrained ge=0…")
    prof = _profile()

    check("kids WRITABLE_FIELDS no longer contains profile_id",
          "profile_id" in admin_router.WRITABLE_FIELDS["kids"], False)

    kid = Kid(
        id=uuid.uuid4(), profile_id=uuid.uuid4(), name="Moyna", avatar="owl",
        birth_year=2019, coins=10, org_id=None,
        created_at=datetime(2026, 8, 1, 12, 0, 0),
    )
    db = _FakeDB()
    db.crud_rows[str(kid.id)] = kid

    # PUT with a profile_id in the body → mass-assignment guard drops it
    updated = await admin_router.update_resource(
        "kids", str(kid.id), {"profile_id": str(uuid.uuid4()), "name": "Rumi"},
        _request(), prof, db,
    )
    check("kid PUT ignores profile_id (ownership immutable)", str(updated["profile_id"]), str(kid.profile_id))
    check("kid PUT still writes writable fields", updated["name"], "Rumi")

    # negative coins → 400 on both create and update
    db2 = _FakeDB()
    st, _ = await aexc_status(admin_router.create_resource(
        "kids", {"name": "N", "coins": -5}, _request(), prof, db2))
    check("create kid with negative coins → 400", st, 400)

    st, dt = await aexc_status(admin_router.update_resource(
        "kids", str(kid.id), {"coins": -1}, _request(), prof, db))
    check("update kid with negative coins → 400", (st, "coins" in (dt or "")), (400, True))

    # zero/positive coins still accepted
    db3 = _FakeDB()
    created = await admin_router.create_resource(
        "kids", {"name": "N", "coins": 0}, _request(), prof, db3)
    check("create kid with zero coins ok", created.get("coins"), 0)


# ══════════════════════════════════════════════════════════════════════════
# ⑯  #1625 — IntegrityError → 409 Conflict on create/update (never 500)
# ══════════════════════════════════════════════════════════════════════════

async def _run_admin_integrity():
    print("⑯  IntegrityError → 409 on create/update (rollback + generic message)…")
    prof = _profile()

    # create: commit raises IntegrityError → 409, not 500
    db = _FakeDB()
    db.raise_on_commit = True
    st, dt = await aexc_status(admin_router.create_resource(
        "content_items", {"id": "c1", "kind": "game", "title": "Dup"},
        _request(), prof, db,
    ))
    check("create IntegrityError → 409 Conflict", st, 409)
    check("create 409 message is generic (no constraint name)",
          "constraint" not in (dt or "").lower() and "unique" not in (dt or "").lower(), True)
    check("create IntegrityError rolled back", db.rollbacks, 1)

    # update: commit raises IntegrityError → 409, not 500
    kid = Kid(
        id=uuid.uuid4(), profile_id=uuid.uuid4(), name="Moyna", coins=5,
        created_at=datetime(2026, 8, 1, 12, 0, 0),
    )
    db2 = _FakeDB()
    db2.crud_rows[str(kid.id)] = kid
    db2.raise_on_commit = True
    st, dt = await aexc_status(admin_router.update_resource(
        "kids", str(kid.id), {"name": "Rumi"}, _request(), prof, db2))
    check("update IntegrityError → 409 Conflict", st, 409)
    check("update 409 message is generic", dt, "Resource already exists")
    check("update IntegrityError rolled back", db2.rollbacks, 1)


# ══════════════════════════════════════════════════════════════════════════

def _run():
    test_mass_assignment_guard()
    test_config_validation()
    test_whitelist_coverage()
    asyncio.run(_run_admin_crud())
    asyncio.run(_run_admin_wildcard_escape())
    asyncio.run(_run_admin_guards())
    asyncio.run(_run_admin_create())
    asyncio.run(_run_admin_org_crud())
    asyncio.run(_run_admin_kids_guard())
    asyncio.run(_run_admin_integrity())
    asyncio.run(_run_rate_limit_window())
    asyncio.run(_run_rate_limit_deps())
    asyncio.run(_run_auth_attempt_guard())
    asyncio.run(_run_middleware())
    test_search_embed_rate_limits()
    asyncio.run(_run_search_embed_direct_calls())
    asyncio.run(_run_admin_reset_password())

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
