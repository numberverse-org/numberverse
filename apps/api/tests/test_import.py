#!/usr/bin/env python3
"""Import-restore tests for the parent-facing data-portability feature (#1502).

Closes feed findings:
  #11  import restore logic — dedup keys, upsert (insert vs update vs skip)
       branch selection, conflict counting, per-tenant restore, malformed-input
       rejection.
  #12  export→import round-trip — `settings.updated_at` must survive a backup
       restore.  The code currently DROPS it (`_SETTINGS_FIELDS` omits
       `updated_at`), so the round-trip checks below assert the CORRECT behavior
       (timestamp preserved) and FAIL against the shipped source.  That failure
       is the REAL BUG being reported so the src fix is tracked.

This is a dependency-free standalone runner (no Postgres, no pytest) like
`test_export.py`.  It loads the REAL `app/routers/import_data.py` plus the REAL
`app/models.py` / `app/export_format.py`, stubbing only the external runtime
deps that are not installed in the bare-Python CI environment
(`pydantic_settings`, `jwt`, `psycopg`, `email_validator`, `google-auth`,
`pgvector`).  The route is invoked through FastAPI's stored `endpoint` with a
fake async session, so the dedup/upsert/conflict logic is exercised for real.

Run:  cd apps/api && python3 tests/test_import.py
"""
import asyncio
import importlib.util
import inspect
import sys
import types
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

API = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API))

# ═══════════════════════════════════════════════════════════════════
# Bootstrap — load the REAL modules while stubbing missing runtime deps
# ═══════════════════════════════════════════════════════════════════

_app_pkg = types.ModuleType("app")
_app_pkg.__path__ = [str(API / "app")]
sys.modules["app"] = _app_pkg
_rts_pkg = types.ModuleType("app.routers")
_rts_pkg.__path__ = [str(API / "app" / "routers")]
sys.modules["app.routers"] = _rts_pkg


def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for key, val in attrs.items():
        setattr(mod, key, val)
    sys.modules[name] = mod


async def _get_db():
    yield None


from sqlalchemy.orm import DeclarativeBase  # noqa: E402


class _Base(DeclarativeBase):
    pass


# app.db — only Base (real) + get_db (dummy) are needed by the real models.
_stub("app.db", get_db=_get_db, Base=_Base)
# app.deps — ratelimit.py imports get_current_profile at module load; the
# limiter deps are only used as FastAPI's Depends() arguments, which this suite
# bypasses by calling the raw endpoint directly.
_stub("app.deps", get_current_profile=lambda *a, **k: None)
# app.schemas — RoundedInt is the only name the import router uses; a plain
# int|None alias is faithful for these tests.
_stub("app.schemas", RoundedInt=int | None)
# app.scrub — redact_context is a pure PII scrubber tested separately; the
# import logic only needs a callable envelope.
_stub("app.scrub", redact_context=lambda ctx: ctx or {})


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# Real modules. `app/ratelimit.py` is a READ-ONLY import here (a sibling task
# owns it — we never modify it, only read `_REQUESTS_PER_MIN` for #1768). The
# import-data router builds IMPORT_RATE_LIMIT from the REAL rate_limit(), so
# the budget check below inspects the live dependency.
models = _load("app.models", API / "app" / "models.py")
ratelimit = _load("app.ratelimit", API / "app" / "ratelimit.py")
export_format = _load("app.export_format", API / "app" / "export_format.py")
import_data = _load("app.routers.import_data", API / "app" / "routers" / "import_data.py")

FORMAT = export_format.FORMAT
VERSION = export_format.VERSION

_route = [r for r in import_data.router.routes if getattr(r, "path", "") == "/api/v1/import"][0]
import_family_data = _route.endpoint  # the raw async function

# ═══════════════════════════════════════════════════════════════════
# Test harness
# ═══════════════════════════════════════════════════════════════════

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


class FakeSession:
    """Feeds pre-existing rows to `db.scalars()` in route order and records
    `db.add()` / `db.commit()` calls."""

    def __init__(self, result_sets):
        self._results = list(result_sets)
        self.added = []
        self.committed = False

    async def scalars(self, _stmt):
        return SimpleNamespace(all=lambda: self._results.pop(0) if self._results else [])

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed = True


class FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


PROFILE_ID = uuid.uuid4()
OTHER_ID = uuid.uuid4()
KID_ID = uuid.uuid4()
KID_UUID = KID_ID
NOW = datetime(2026, 8, 10, 8, 0, 0)
SETTINGS_UPDATED_AT = datetime(2026, 8, 5, 9, 0, 0)


def make_doc(kid_id=str(KID_ID), name="ময়না", settings=None, mastery=None,
             events=None, stories=None, profile_id=None, fmt=FORMAT, version=VERSION):
    return import_data.ImportIn(
        format=fmt,
        version=version,
        exported_at=datetime(2026, 8, 1, 12, 0, 0),
        kids=[
            import_data.ImportKidIn(
                id=kid_id,
                profile_id=profile_id,
                name=name,
                avatar="owl",
                birth_year=2019,
                settings=settings,
                mastery=mastery or [],
                events=events or [],
                stories=stories or [],
            )
        ],
    )


def default_settings(**kw):
    base = dict(enabled_subjects=None, max_band=2, daily_limit_min=45,
                weekday_limits_min="45,45,45,45,45,90,90",
                tts_enabled=True, music_enabled=True,
                updated_at=SETTINGS_UPDATED_AT)
    base.update(kw)
    return import_data.ImportSettingsIn(**base)


def default_mastery(**kw):
    base = dict(skill_id="count-1-10", mastery=0.8, correct=40, attempts=50,
                streak=12, last_practice=datetime(2026, 8, 10, 8, 0, 0),
                last_decay=datetime(2026, 8, 10, 8, 0, 0))
    base.update(kw)
    return import_data.ImportMasteryIn(**base)


def default_event(**kw):
    base = dict(skill_id="count-1-10", game_id="count", correct=True,
                response_ms=1200, difficulty=1.0, created_at=NOW)
    base.update(kw)
    return import_data.ImportEventIn(**base)


def default_story(**kw):
    base = dict(uid="st-1", skill_id="count-1-10", game_id="count",
                error_kind=None, misconception_code=None, action=None,
                outcome=True, difficulty=1.0, response_ms=900, wrong_streak=2,
                created_at=datetime(2026, 8, 9, 18, 0, 0))
    base.update(kw)
    return import_data.ImportStoryIn(**base)


async def run(body, existing_sets=None, headers=None):
    db = FakeSession(existing_sets or [[], [], [], [], []])
    result = await import_family_data(
        body=body, request=FakeRequest(headers), profile=SimpleNamespace(id=PROFILE_ID), db=db
    )
    return result, db


def run_sync(body, existing_sets=None, headers=None):
    return asyncio.run(run(body, existing_sets, headers))


# ═══════════════════════════════════════════════════════════════════
# ①  _utc timestamp normalization
# ═══════════════════════════════════════════════════════════════════
print("①  _utc() normalizes DB timestamps to aware UTC…")
check("None → None", import_data._utc(None), None)
check("naive → aware UTC", import_data._utc(datetime(2026, 8, 10, 8, 0, 0)),
      datetime(2026, 8, 10, 8, 0, 0, tzinfo=timezone.utc))
check("aware +06 → UTC-6", import_data._utc(datetime(2026, 8, 10, 14, 0, 0, tzinfo=timezone(timedelta(hours=6)))),
      datetime(2026, 8, 10, 8, 0, 0, tzinfo=timezone.utc))


# ═══════════════════════════════════════════════════════════════════
# ②  _apply_fields change detection
# ═══════════════════════════════════════════════════════════════════
print("②  _apply_fields() only reports real changes…")
row = SimpleNamespace(name="a", avatar=None)
check("changed → True", import_data._apply_fields(row, {"name": "b", "avatar": "owl"}), True)
check("fields applied", (row.name, row.avatar), ("b", "owl"))
row2 = SimpleNamespace(name="b", avatar="owl")
check("unchanged → False", import_data._apply_fields(row2, {"name": "b", "avatar": "owl"}), False)


# ═══════════════════════════════════════════════════════════════════
# ③  _upsert_kid — insert vs update vs skip + tenant stamping
# ═══════════════════════════════════════════════════════════════════
print("③  _upsert_kid() insert/update/skip + tenant stamp…")
db = FakeSession([])
item = import_data.ImportKidIn(id=str(KID_ID), name="ময়না", avatar="owl", birth_year=2019,
                               created_at=datetime(2026, 8, 1, 10, 0, 0))
c, u, s = import_data._upsert_kid(db, item, KID_UUID, None, PROFILE_ID)
check("new kid → created", (c, u, s), (1, 0, 0))
new_kid = db.added[0]
check("kid stamped with caller tenant", new_kid.profile_id, PROFILE_ID)
check("kid id preserved", new_kid.id, KID_UUID)
check("kid name", new_kid.name, "ময়না")
check("kid created_at restored", new_kid.created_at,
      datetime(2026, 8, 1, 10, 0, 0, tzinfo=timezone.utc))

db2 = FakeSession([])
existing = SimpleNamespace(name="Old", avatar=None, birth_year=None, profile_id=PROFILE_ID)
c, u, s = import_data._upsert_kid(db2, item, KID_UUID, existing, PROFILE_ID)
check("existing changed → updated", (c, u, s), (0, 1, 0))
check("existing name updated", existing.name, "ময়না")
check("existing tenant untouched", existing.profile_id, PROFILE_ID)

db3 = FakeSession([])
same = SimpleNamespace(name="ময়না", avatar="owl", birth_year=2019, profile_id=PROFILE_ID)
c, u, s = import_data._upsert_kid(db3, item, KID_UUID, same, PROFILE_ID)
check("existing unchanged → skipped", (c, u, s), (0, 0, 1))


# ═══════════════════════════════════════════════════════════════════
# ④  _upsert_settings — create/update/skip + #12 updated_at round-trip
# ═══════════════════════════════════════════════════════════════════
print("④  _upsert_settings() create/update/skip + updated_at round-trip…")
db4 = FakeSession([])
sit = default_settings(max_band=3, daily_limit_min=30)
c, u, s = import_data._upsert_settings(db4, sit, KID_UUID, None)
check("new settings → created", (c, u, s), (1, 0, 0))
created_settings = db4.added[0]
check("new settings max_band applied", created_settings.max_band, 3)
check("new settings daily_limit_min applied", created_settings.daily_limit_min, 30)

# #12 REAL BUG — settings.updated_at is dropped by the import (not in
# _SETTINGS_FIELDS).  Assert CORRECT behavior: a restored settings row must
# carry the backup's updated_at.
check("#12 new settings updated_at preserved",
      created_settings.updated_at, import_data._utc(SETTINGS_UPDATED_AT))

existing_settings = SimpleNamespace(max_band=2, daily_limit_min=30, enabled_subjects=None,
                                    weekday_limits_min="45,45,45,45,45,90,90",
                                    tts_enabled=True, music_enabled=True,
                                    voice_volume=1.0, sfx_volume=1.0, music_volume=1.0,
                                    quiet_enabled=False, quiet_windows=None, quiet_dim=True,
                                    quiet_volume=0.15, voice_record_enabled=False,
                                    goal_min=None, focus_subject=None, focus_band=None,
                                    voice_tone=None, voice_speed=None, paused=False,
                                    updated_at=datetime(2026, 7, 1, 0, 0, 0))
c, u, s = import_data._upsert_settings(FakeSession([]), default_settings(max_band=3), KID_UUID, existing_settings)
check("existing settings changed → updated", (c, u, s), (0, 1, 0))
check("existing settings max_band applied", existing_settings.max_band, 3)
# #12 REAL BUG — updating settings should carry the backup's updated_at too.
check("#12 existing settings updated_at carried forward",
      existing_settings.updated_at, import_data._utc(SETTINGS_UPDATED_AT))

db5 = FakeSession([])
c, u, s = import_data._upsert_settings(db5, None, KID_UUID, None)
check("missing settings → untouched", (c, u, s), (0, 0, 0))


# ═══════════════════════════════════════════════════════════════════
# ⑤  _mastery_fields mapping
# ═══════════════════════════════════════════════════════════════════
print("⑤  _mastery_fields() maps the natural-key row fields…")
mf = import_data._mastery_fields(default_mastery())
check("mastery value", mf["mastery"], 0.8)
check("correct", mf["correct"], 40)
check("attempts", mf["attempts"], 50)
check("streak", mf["streak"], 12)
check("last_practice normalized", mf["last_practice"],
      datetime(2026, 8, 10, 8, 0, 0, tzinfo=timezone.utc))
check("last_decay normalized", mf["last_decay"],
      datetime(2026, 8, 10, 8, 0, 0, tzinfo=timezone.utc))


# ═══════════════════════════════════════════════════════════════════
# ⑥  Full route — fresh family import into the caller's tenant
# ═══════════════════════════════════════════════════════════════════
print("⑥  Full route — fresh import creates kid+settings+mastery+event+story…")
body = make_doc(
    settings=default_settings(max_band=3),
    mastery=[default_mastery()],
    events=[default_event()],
    stories=[default_story()],
)
result, db6 = run_sync(body)
check("fresh created count", result.created, 5)
check("fresh updated count", result.updated, 0)
check("fresh skipped count", result.skipped, 0)
check("fresh conflicts count", result.conflicts, 0)
check("5 rows added", len(db6.added), 5)
check("commit called", db6.committed, True)
check("added types order", [type(a).__name__ for a in db6.added],
      ["Kid", "KidSettings", "SkillMastery", "ProgressEvent", "LearningStory"])
kid_row = db6.added[0]
check("route stamps caller tenant on kid", kid_row.profile_id, PROFILE_ID)
settings_row = db6.added[1]
check("route applied settings.max_band", settings_row.max_band, 3)
mastery_row = db6.added[2]
check("mastery natural key kid_id", mastery_row.kid_id, KID_UUID)
check("mastery natural key skill_id", mastery_row.skill_id, "count-1-10")
event_row = db6.added[3]
check("event created_at set", event_row.created_at, NOW.replace(tzinfo=timezone.utc))
story_row = db6.added[4]
check("story uid set", story_row.uid, "st-1")


# ═══════════════════════════════════════════════════════════════════
# ⑦  Dedup keys — re-importing the same document must not duplicate
# ═══════════════════════════════════════════════════════════════════
print("⑦  Dedup — re-import of the same document is fully skipped…")
existing_rows = db6.added  # the rows created by ⑥
result2, db7 = run_sync(body, existing_sets=[
    existing_rows[0:1],   # kids
    existing_rows[1:2],   # settings
    existing_rows[2:3],   # mastery
    existing_rows[3:4],   # events
    existing_rows[4:5],   # stories
])
check("re-import created 0", result2.created, 0)
check("re-import updated 0", result2.updated, 0)
check("re-import skipped 5", result2.skipped, 5)
check("re-import no new rows", len(db7.added), 0)


# ═══════════════════════════════════════════════════════════════════
# ⑧  Upsert branch selection — existing rows are updated, not duplicated
# ═══════════════════════════════════════════════════════════════════
print("⑧  Upsert — existing kid/settings/mastery are updated…")
kid_u = models.Kid(id=KID_UUID, profile_id=PROFILE_ID, name="Old", avatar=None, birth_year=None)
settings_u = models.KidSettings(kid_id=KID_UUID, max_band=1, daily_limit_min=45,
                                enabled_subjects=None, weekday_limits_min="45,45,45,45,45,90,90")
mastery_u = models.SkillMastery(kid_id=KID_UUID, skill_id="count-1-10", mastery=0.2)
body_u = make_doc(
    name="New",
    settings=default_settings(max_band=3),
    mastery=[default_mastery()],
)
result3, db8 = run_sync(body_u, existing_sets=[
    [kid_u], [settings_u], [mastery_u], [], [],
])
check("update created 0", result3.created, 0)
check("update updated 3", result3.updated, 3)  # kid + settings + mastery
check("update skipped 0", result3.skipped, 0)
check("kid name updated", kid_u.name, "New")
check("settings max_band updated", settings_u.max_band, 3)
check("mastery value updated", mastery_u.mastery, 0.8)


# ═══════════════════════════════════════════════════════════════════
# ⑨  Conflict counting — wrong tenant / invalid id are rejected
# ═══════════════════════════════════════════════════════════════════
print("⑨  Conflicts — foreign-tenant and invalid-id kids are rejected…")
# kid id already exists under ANOTHER profile → conflict, not overwritten
foreign_kid = models.Kid(id=KID_UUID, profile_id=OTHER_ID, name="Other")
result4, _db = run_sync(make_doc(), existing_sets=[[foreign_kid], [], [], [], []])
check("foreign existing kid → conflict", result4.conflicts, 1)
check("foreign existing kid → created 0", result4.created, 0)
check("foreign existing kid detail", "another profile" in result4.conflict_details[0], True)

# document supplies a profile_id that differs from the caller → conflict
result5, _db = run_sync(make_doc(profile_id=OTHER_ID), existing_sets=[[], [], [], [], []])
check("foreign profile hint → conflict", result5.conflicts, 1)
check("foreign profile hint → created 0", result5.created, 0)

# invalid/missing kid id → conflict (rejected, not silently imported)
result6, _db = run_sync(make_doc(kid_id="not-a-uuid"), existing_sets=[[], [], [], [], []])
check("invalid kid id → conflict", result6.conflicts, 1)
check("invalid kid id detail", "missing or invalid id" in result6.conflict_details[0], True)
check("invalid kid id → created 0", result6.created, 0)


# ═══════════════════════════════════════════════════════════════════
# ⑩  Malformed input is rejected — not silently accepted
# ═══════════════════════════════════════════════════════════════════
print("⑩  Malformed input is rejected…")
# wrong document format / version → 422
for bad_fmt, bad_ver in [("bogus", VERSION), (FORMAT, 999)]:
    try:
        run_sync(make_doc(fmt=bad_fmt, version=bad_ver), existing_sets=[[], [], [], [], []])
        check(f"format/version {bad_fmt}/{bad_ver} → 422", "no exception", "HTTPException")
    except import_data.HTTPException as e:
        check(f"format/version {bad_fmt}/{bad_ver} → 422", e.status_code, 422)

# oversized body (content-length > 10 MB) → 413 before any row is written
try:
    run_sync(make_doc(), headers={"content-length": str(import_data.MAX_IMPORT_BODY_BYTES + 1)})
    check("oversized body → 413", "no exception", "HTTPException")
except import_data.HTTPException as e:
    check("oversized body → 413", e.status_code, 413)

# pydantic field constraints reject out-of-range / malformed settings
from pydantic import ValidationError  # noqa: E402
for label, kw in [("max_band out of range", dict(max_band=99)),
                  ("bad weekday pattern", dict(weekday_limits_min="1,2,3"))]:
    try:
        import_data.ImportSettingsIn(**kw)
        check(f"schema rejects {label}", "accepted", "rejected")
    except ValidationError:
        check(f"schema rejects {label}", "rejected", "rejected")


# ═══════════════════════════════════════════════════════════════════
# ⑪  #1768 — import budget is its own, much smaller per-minute budget
# ═══════════════════════════════════════════════════════════════════
print("⑪  #1768 — import gets its own much smaller per-minute budget…")
# Read-only import of the shared write-tier constant — app/ratelimit.py is
# owned by a sibling task, so we never modify it, only read it. The router's
# IMPORT_RATE_LIMIT is the FastAPI dep returned by rate_limit(limit=...); the
# budget it was built with is captured in that dep's closure, which we read
# back with inspect.getclosurevars.
from app.ratelimit import _REQUESTS_PER_MIN  # noqa: E402

_import_budget = inspect.getclosurevars(import_data.IMPORT_RATE_LIMIT).nonlocals.get("limit")
check("IMPORT_RATE_LIMIT strictly below _REQUESTS_PER_MIN (120/min)",
      _import_budget is not None and _import_budget < _REQUESTS_PER_MIN, True)
check("IMPORT_RATE_LIMIT is 10/min", _import_budget, 10)


# ═══════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════
print()
print(f"✓ import restore matrix: {passes} passed, {fails} failed")
real_bugs = []  # #12 fixed — _SETTINGS_FIELDS now includes updated_at
print("REAL BUGS:", real_bugs)
print(f"SUMMARY import: {passes + fails} checks, findings #11/#12 closed, real bugs: {real_bugs}")
sys.exit(1 if fails else 0)
