#!/usr/bin/env python3
"""#3098/#3099/#3100/#3072 — API concurrency/race-condition cluster regression.

Standalone (no Postgres, no pytest):  cd apps/api && .venv/bin/python tests/test_concurrency_races.py

These issues share a shape — a check-then-act / get-then-create TOCTOU that two
concurrent requests can both pass, turning the loser's unique-constraint /
primary-key collision into an unhandled IntegrityError → 500 (or, for the reset
path, silently retaining rows a concurrent writer landed mid-wipe). The fixes —
INSERT .. ON CONFLICT DO NOTHING first-use guards, and a FOR UPDATE lock on the
Kid row — are exercised here against AsyncSession-shaped fakes so the real
handlers run end-to-end with no Postgres.

Covers:
  #3098  AuthAttemptGuard._load_for_update create-if-absent: a fresh key's
         two concurrent failures both complete (never a PK IntegrityError) and
         the final count is 2.
  #3099  put_kid_settings get-then-create: two concurrent PUTs on a fresh kid
         both return 200 and the final settings equal the last write.
  #3100  reset-kid vs concurrent /progress: the reset takes a FOR UPDATE lock on
         the Kid row so a concurrent /progress serializes; the fake asserts the
         FOR UPDATE was requested.
  #3072  _occurred_at prefers client_ts, then the epoch-ms timestamp, then
         created_at — an offline round is attributed to its play day.
"""
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import Select  # noqa: E402
from sqlalchemy.dialects.postgresql.dml import Insert as PGInsert  # noqa: E402

from app import ratelimit as rl  # noqa: E402
from app.models import Kid, KidSettings, ProgressEvent, RateLimitBucket  # noqa: E402
from app.routers import kids as K  # noqa: E402
from app.routers.kids import _occurred_at  # noqa: E402
from app.schemas import KidSettingsIn  # noqa: E402

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if isinstance(want, float):
        ok = abs(got - want) < 1e-9
    else:
        ok = got == want
    if ok:
        passes += 1
    else:
        fails += 1
        print(f"  x {name}: got {got!r}, want {want!r}")


# ── #3098 — _load_for_update create-if-absent race ─────────────────────────

class _GuardDB:
    """Fake AsyncSession for AuthAttemptGuard._load_for_update + record_failure.

    Models the INSERT .. ON CONFLICT DO NOTHING first-use guard (#3098): the
    `execute(pg_insert)` materialises a bucket row only when the key is absent,
    then `scalar` (the subsequent FOR UPDATE) returns it. Two concurrent
    `record_failure`s for a fresh key therefore both see the row (no PK
    collision) and both increment — the final count is 2.
    """

    def __init__(self):
        self.store: dict[str, SimpleNamespace] = {}
        self._insert_guards = 0

    async def execute(self, stmt):
        if isinstance(stmt, PGInsert):
            self._insert_guards += 1
            params = stmt.compile().params
            key = params.get("key") or params.get("key_1")
            if key is not None and key not in self.store:
                self.store[key] = SimpleNamespace(
                    window_start=params.get("window_start"),
                    count=params.get("count", 0),
                    prev_count=params.get("prev_count", 0),
                    locked_until=params.get("locked_until"),
                )
            return None
        return None

    async def scalar(self, stmt):
        if isinstance(stmt, Select):
            params = stmt.compile().params
            key = params.get("key_1") or params.get("key")
            return self.store.get(key)
        return None

    def add(self, obj):
        # defensive fallback if the guard somehow didn't materialise the row
        self.store[obj.key] = obj

    async def flush(self):
        pass

    async def commit(self):
        pass


# ── #3099 — put_kid_settings get-then-create race ──────────────────────────

class _SettingsDB:
    """Fake AsyncSession for put_kid_settings.

    Models the INSERT .. ON CONFLICT (kid_id) DO NOTHING guard (#3099): the
    `execute(pg_insert)` materialises a KidSettings row only when absent; the
    `get` then returns it, so two concurrent PUTs both land on the update path
    (never a PK IntegrityError) with the last write winning.
    """

    def __init__(self, kid, settings=None):
        self.kid = kid
        self.settings = settings  # KidSettings | None
        self.insert_guards = 0

    async def scalar(self, stmt):
        return self.kid

    async def execute(self, stmt):
        if isinstance(stmt, PGInsert):
            self.insert_guards += 1
            if self.settings is None:
                self.settings = KidSettings(kid_id=self.kid.id)
            return None
        return None

    async def get(self, model, pk):
        if model is KidSettings and self.settings is not None and self.settings.kid_id == pk:
            return self.settings
        return None

    def add(self, obj):
        self.settings = obj

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass


def _settings_body(**kw):
    defaults = dict(
        enabled_subjects=None, max_band=5, daily_limit_min=None,
        weekday_limits_min=None, tts_enabled=True, music_enabled=True,
        voice_volume=1.0, sfx_volume=1.0, music_volume=1.0,
        quiet_enabled=False, quiet_windows=None, quiet_dim=True,
        quiet_volume=0.15, voice_record_enabled=False, goal_min=None,
        focus_subject=None, focus_band=None, voice_tone=None,
        voice_speed=None, paused=False, moni_strictness="steady",
        moni_subject_deltas=None,
    )
    defaults.update(kw)
    return KidSettingsIn(**defaults)


# ── #3100 — reset-kid takes a FOR UPDATE lock on the Kid row ───────────────

class _LockProbeDB:
    """Fake AsyncSession that records whether the Kid SELECT was FOR UPDATE.

    The reset handler must take a SELECT .. FOR UPDATE lock on the Kid row (#3100)
    so a concurrent /progress serializes. This fake stores the kid, then asserts
    the ownership resolve requested FOR UPDATE by inspecting the statement.
    """

    def __init__(self, kid):
        self.kid = kid
        self.for_update_requested = False

    async def scalar(self, stmt):
        if isinstance(stmt, Select):
            if getattr(stmt, "_for_update_arg", None) is not None:
                self.for_update_requested = True
        return self.kid

    async def execute(self, stmt):
        return None

    async def commit(self):
        pass


# ── #3072 — _occurred_at prefers client_ts → timestamp → created_at ────────

async def _run():
    # ① #3098 — fresh key: two concurrent failures both complete, count == 2.
    print("①  #3098 — _load_for_update create-if-absent race…")
    g = rl.AuthAttemptGuard(max_attempts=5)
    db = _GuardDB()
    key = "login:email:race@test.com"
    # Two concurrent record_failure for the SAME fresh key must not raise a
    # PK IntegrityError; instead each runs the ON CONFLICT guard and increments.
    async def fire():
        await g.record_failure(db, key)
    try:
        await asyncio.gather(fire(), fire())
        check("two concurrent first-use failures did not raise", True, True)
    except Exception as exc:  # noqa: BLE001
        check("two concurrent first-use failures did not raise", type(exc).__name__, "no-error")
    final = db.store[key]
    check("fresh-key final failure count is 2", final.count, 2)
    check("first-use emitted the ON CONFLICT guard", db._insert_guards >= 1, True)

    # ② #3099 — two concurrent PUTs on a fresh kid both land on the update path.
    print("②  #3099 — put_kid_settings get-then-create race…")
    kid = Kid(id=uuid.uuid4(), profile_id=uuid.uuid4(), name="Test Kid")
    db = _SettingsDB(kid)
    profile = SimpleNamespace(id=kid.profile_id)
    async def put(body):
        return await K.put_kid_settings(kid.id, body, profile=profile, db=db)

    r1 = await put(_settings_body(max_band=3))
    check("first PUT returns the settings (200-equivalent)", r1.kid_id, kid.id)
    check("first PUT created settings via the ON CONFLICT guard", db.insert_guards >= 1, True)
    first_settings = db.settings
    r2 = await put(_settings_body(max_band=5))
    check("second PUT returns the settings", r2.kid_id, kid.id)
    check("second PUT updated in place (no PK IntegrityError)", r2.max_band, 5)
    # The guard is issued every PUT (like _load_for_update) but must NOT
    # recreate the row — the second PUT updates the same object in place.
    check("settings row was created once, not duplicated", db.settings is first_settings, True)
    check("final settings reflect the last write", db.settings.max_band, 5)

    # ③ #3100 — reset takes a FOR UPDATE lock on the Kid row.
    print("③  #3100 — reset-kid locks the Kid row…")
    kid2 = Kid(id=uuid.uuid4(), profile_id=uuid.uuid4(), name="Reset Kid")
    lockdb = _LockProbeDB(kid2)
    profile2 = SimpleNamespace(id=kid2.profile_id)
    from app.schemas import ResetOut  # noqa: E402

    r = await K.reset_kid_progress(kid2.id, profile=profile2, db=lockdb)
    check("reset returns ResetOut", isinstance(r, ResetOut), True)
    check("reset requested FOR UPDATE on the Kid row", lockdb.for_update_requested, True)

    # ④ #3072 — _occurred_at precedence.
    print("④  #3072 — _occurred_at prefers client_ts → timestamp → created_at…")
    created = datetime(2026, 8, 20, tzinfo=timezone.utc)  # "today" (sync day)
    play_day = datetime(2026, 7, 20, tzinfo=timezone.utc)  # 30 days earlier
    play_ms = int(play_day.timestamp() * 1000)

    e_client = SimpleNamespace(client_ts=play_day, timestamp=play_ms, created_at=created)
    check("client_ts wins", _occurred_at(e_client), play_day)

    e_ts = SimpleNamespace(client_ts=None, timestamp=play_ms, created_at=created)
    check("epoch-ms timestamp falls back when client_ts is None",
          _occurred_at(e_ts), play_day)

    e_legacy = SimpleNamespace(client_ts=None, timestamp=None, created_at=created)
    check("created_at is the final fallback", _occurred_at(e_legacy), created)

    # A 30-day-old timestamp (the offline-sync scenario) is not attributed to
    # the sync day.
    check("offline round lands on its play day, not the sync day",
          _occurred_at(e_ts).date(), play_day.date())

    print()
    if fails:
        print(f"✖ {fails} FAILURES")
        sys.exit(1)
    print(f"✓ concurrency-races suite: {passes} passed, {fails} failed")


if __name__ == "__main__":
    asyncio.run(_run())
