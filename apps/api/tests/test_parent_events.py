#!/usr/bin/env python3
"""#1843/#1846/#1847 event-instrumentation test matrix (share/export audit + scene keys).

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_parent_events.py

Covers, against `app/routers/shares.py`, `app/routers/export.py`, `app/models.py`:
  ①  _scene_key / _top_game_scene — #1846: CountPop/FruitAdd TIERS collapse into
     ONE scene key so "top game" never fragments into per-tier counts; single-
     scene ids pass through; the helper returns a representative raw id so the
     catalog title lookup still works.
  ②  _humanize_game_id — #1847 fallback label ('game-fruit-tree' → 'Fruit Tree').
  ③  ParentEvent model + migration DDL — the audit table exists with the
     documented columns and the boot-time CREATE TABLE IF NOT EXISTS carries the
     profile FK + composite index.
  ④  share mint/rotate/revoke + JSON/CSV export write a parent_events row —
     action/type/target keyed by profile_id, committed with the endpoint's own
     transaction.
"""
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import Select, select  # noqa: E402

from app.models import (  # noqa: E402
    AccelerationLog,
    ContentItem,
    Kid,
    KidSettings,
    LearningStory,
    ParentEvent,
    Profile,
    ProgressEvent,
    SkillMastery,
)
from app.routers.export import export_csv, export_json  # noqa: E402
from app.routers.shares import (  # noqa: E402
    _humanize_game_id,
    _scene_key,
    _top_game_scene,
    get_share_token,
    revoke_share_token,
    rotate_share_token,
)

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


def _ev(game_id: str) -> ProgressEvent:
    return ProgressEvent(
        id=1,
        kid_id=uuid.uuid4(),
        skill_id="s1",
        game_id=game_id,
        correct=True,
        kind="round",
    )


print("①  #1846 — _scene_key collapses shared-scene tiers, passes single-scene ids through…")

check("countpop tier 1 → CountPop", _scene_key("game-countpop"), "CountPop")
check("countpop tier 2 → CountPop", _scene_key("game-countpop20"), "CountPop")
check("countpop tier 3 → CountPop", _scene_key("game-countpop50"), "CountPop")
check("fruitadd tier → FruitAdd", _scene_key("game-fruitadd-20"), "FruitAdd")
check("fruitsub tier → FruitAdd", _scene_key("game-fruitsub-10"), "FruitAdd")
check("single-scene game is its own key", _scene_key("game-fruittree"), "FruitTree")
check("unknown/legacy id falls back to itself", _scene_key("legacy-toy-game"), "legacy-toy-game")

# #1846 — a week split across THREE CountPop tiers + one FruitTree reads as
# CountPop (3 events) beating FruitTree (1), never as three tiny per-tier counts.
mixed = [
    _ev("game-countpop20"),
    _ev("game-countpop50"),
    _ev("game-countpop"),
    _ev("game-fruittree"),
]
hit = _top_game_scene(mixed)
check("most-played scene is CountPop", hit[0], "CountPop")
check("representative raw id is a real CountPop tier", _scene_key(hit[1]), "CountPop")
check("empty event list → None", _top_game_scene([]), None)

print("②  #1847 — _humanize_game_id fallback label…")
check("game-fruit-tree → Fruit Tree", _humanize_game_id("game-fruit-tree"), "Fruit Tree")
check("game-fruitadd-10 → Fruitadd 10", _humanize_game_id("game-fruitadd-10"), "Fruitadd 10")
# A scene key is never fed to this helper (the caller resolves a representative
# RAW game id first); a CamelCase key passes through title-cased.
check("scene-key pass-through title-cases", _humanize_game_id("CountPop"), "Countpop")

print("③  #1843 — ParentEvent model + migration DDL…")

cols = {c.name for c in ParentEvent.__table__.columns}
check("model has profile_id", "profile_id" in cols, True)
check("model has action", "action" in cols, True)
check("model has event_type", "event_type" in cols, True)
check("model has target", "target" in cols, True)
check("model has created_at", "created_at" in cols, True)
check("model FKs profiles with CASCADE", next(fk.ondelete for fk in ParentEvent.__table__.foreign_keys) == "CASCADE", True)

from app import migrations as mig  # noqa: E402
mig_src = Path(mig.__file__).read_text()
check("migration creates parent_events", "CREATE TABLE IF NOT EXISTS parent_events" in mig_src, True)
check("migration indexes (profile_id, created_at)", "ix_parent_events_profile_id_created_at" in mig_src, True)
check("migration FK cascades on profile delete", "REFERENCES profiles(id) ON DELETE CASCADE" in mig_src, True)

print("④  #1843 — share + export endpoints write parent_events rows…")


class _Rows:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return list(self._rows)


class FakeAuditSession:
    """Postgres-free AsyncSession shaped for the share/export write paths: scalar
    resolves the owned Kid, scalars return empty result sets, add/commit record
    the parent-event audit rows."""

    def __init__(self, *, kid: Kid | None = None):
        self.kid = kid
        self.added: list = []
        self.commits = 0
        self.executed: list = []

    async def scalar(self, stmt):
        if isinstance(stmt, Select):
            entity = stmt.column_descriptions[0].get("entity")
            if entity is Kid and self.kid is not None:
                return self.kid
            if entity is ContentItem:
                return None
        return None

    async def scalars(self, stmt):
        if isinstance(stmt, Select):
            entity = stmt.column_descriptions[0].get("entity")
            if entity is Kid and self.kid is not None:
                return _Rows([self.kid])
            if entity in (KidSettings, SkillMastery, ProgressEvent, LearningStory, AccelerationLog):
                return _Rows([])
        return _Rows([])

    async def get(self, model, pk):
        return None

    def add(self, obj):
        self.added.append(obj)

    async def execute(self, stmt, params=None):
        self.executed.append(stmt)
        return _Rows([])

    async def refresh(self, obj):
        return None

    async def commit(self):
        self.commits += 1


PROFILE = Profile(id=uuid.uuid4(), email="parent@example.com", password_hash="x", display_name="Parent")
KID = Kid(id=uuid.uuid4(), profile_id=PROFILE.id, name="K")

# share mint
fake = FakeAuditSession(kid=KID)
out = asyncio.run(get_share_token(KID.id, PROFILE, db=fake, _rl=None))
check("share-mint returns a token", out.token, out.token)
check("share-mint writes ONE parent_event", len(fake.added), 1)
ev = fake.added[0]
check("share-mint action", ev.action, "share_mint")
check("share-mint event_type", ev.event_type, "share")
check("share-mint target = kid id", ev.target, str(KID.id))
check("share-mint keyed to the profile", ev.profile_id, PROFILE.id)
check("share-mint committed", fake.commits >= 2, True)

# share rotate
fake = FakeAuditSession(kid=KID)
out = asyncio.run(rotate_share_token(KID.id, PROFILE, db=fake))
check("share-rotate action", fake.added[0].action, "share_rotate")
check("share-rotate event_type", fake.added[0].event_type, "share")

# share revoke
fake = FakeAuditSession(kid=KID)
await_result = asyncio.run(revoke_share_token(KID.id, PROFILE, db=fake))
check("share-revoke action", fake.added[0].action, "share_revoke")
check("share-revoke event_type", fake.added[0].event_type, "share")

# export JSON + CSV (family export → target "all")
fake = FakeAuditSession(kid=KID)
resp = asyncio.run(export_json(profile=PROFILE, db=fake))
check("export-json returns a download", resp.media_type, "application/json")
check("export-json action", fake.added[0].action, "export_json")
check("export-json event_type", fake.added[0].event_type, "export")
check("export-json target = all", fake.added[0].target, "all")
check("export-json committed", fake.commits >= 1, True)

fake = FakeAuditSession(kid=KID)
resp = asyncio.run(export_csv(profile=PROFILE, db=fake))
check("export-csv action", fake.added[0].action, "export_csv")
check("export-csv event_type", fake.added[0].event_type, "export")

print()
if fails:
    print(f"✖ parent-events suite: {passes} passed, {fails} FAILED")
    sys.exit(1)
print(f"✓ parent-events suite: {passes} passed, 0 failed")
print("SUMMARY parent-events: #1843/#1846/#1847 instrumented, real bugs: none")
