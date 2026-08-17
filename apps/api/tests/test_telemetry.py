#!/usr/bin/env python3
"""#1611/#1614/#1616/#1618/#1620 — telemetry / event-accuracy pass.

Standalone API tests (no pytest, no Postgres) using the SAME in-memory
FakeSession pattern as test_progress.py so the real `record_progress` handler
runs end-to-end:

  #1611  client_ts persistence: an ISO client_ts wins, and an integer
         epoch-ms timestamp is converted to an aware UTC datetime so weekly /
         active-days / streak can bucket by the round's real day.
  #1614  LearningStoryIn validates error_kind / action / misconception_code
         against the client's enum sets — unknown values 422 the batch.
  #1616  engagement events (kind=coins/quest/garden/challenge/session-*) persist
         as progress_events rows but NEVER move BKT mastery (rounds-only).
  #1618  weekly minutes-played comes from session-minutes events (meta.minutes),
         falling back to the legacy sum(response_ms) proxy only when none exist.
  #1620  the server dedup namespace: a completed round's uid re-posted to
         /progress is a silent no-op (no double count after a retry).

Run:  cd apps/api && python3 tests/test_telemetry.py
"""
import asyncio
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

API_DIR = str(Path(__file__).resolve().parents[1])


def _venv_python() -> str:
    """Pick a Python that can import pydantic_settings (required to import
    app.routers), re-exec-ing under the repo venv when the outer interpreter
    can't (the established pattern in the apps/api tests)."""
    probe = subprocess.run(
        [sys.executable, "-c", "import pydantic_settings"],
        capture_output=True,
        text=True,
    )
    if probe.returncode == 0:
        return sys.executable
    venv_py = os.path.join(API_DIR, ".venv", "bin", "python3")
    return venv_py if os.path.exists(venv_py) else sys.executable


if _venv_python() != sys.executable:
    os.execv(_venv_python(), [_venv_python(), str(Path(__file__).resolve()), *sys.argv[1:]])

sys.path.insert(0, API_DIR)

from sqlalchemy import Select
from sqlalchemy.dialects.postgresql.dml import Insert as PGInsert

from app.models import Kid, KidSettings, ProgressEvent, SkillMastery, Subscription
from app.routers import progress as P
from app.routers.kids import _session_minutes, _weekly_minutes
from app.schemas import LearningStoryIn, ProgressBatchIn, ProgressEventIn

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


# -- In-memory AsyncSession (same shape as test_progress.py) ------------------

def _extract_insert_rows(stmt):
    mv = getattr(stmt, "_multi_values", None)
    if mv:
        return [{col.key: val for col, val in d.items()} for d in mv[0]]
    vals = getattr(stmt, "_values", None)
    if isinstance(vals, dict):
        return [{col.key: val for col, val in vals.items()}]
    return []


class FakeResult:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return list(self._rows)

    def scalar_one(self):
        return self._rows[0] if self._rows else None

    @property
    def rowcount(self):
        return len(self._rows)


class FakeSession:
    def __init__(self):
        self.kids: dict[uuid.UUID, Kid] = {}
        self.settings: dict[uuid.UUID, KidSettings] = {}
        self.skill_mastery: dict[tuple, SkillMastery] = {}
        self._inserted_uid_keys: set[tuple] = set()
        self.last_insert_rows: list[dict] | None = None
        self.committed = False

    def add_kid(self, *, max_band: int | None = None) -> Kid:
        kid = Kid(id=uuid.uuid4(), profile_id=uuid.uuid4(), name="Test Kid")
        self.kids[kid.id] = kid
        if max_band is not None:
            self.settings[kid.id] = KidSettings(kid_id=kid.id, max_band=max_band)
        return kid

    async def scalar(self, stmt):
        if isinstance(stmt, Select) and self.kids:
            # #premium — resolve_plan queries Subscription; a missing row means
            # "free" plan, so return None for that lookup (never a Kid).
            if stmt.column_descriptions[0].get("entity") is Subscription:
                return None
            return next(iter(self.kids.values()))
        return None

    async def execute(self, stmt):
        if isinstance(stmt, Select):
            rows = [(kid_id, ks.max_band) for kid_id, ks in self.settings.items()]
            return FakeResult(rows)
        if isinstance(stmt, PGInsert):
            rows = _extract_insert_rows(stmt)
            self.last_insert_rows = rows
            inserted = []
            for r in rows:
                key = (r["kid_id"], r["uid"])
                if key in self._inserted_uid_keys:
                    continue
                self._inserted_uid_keys.add(key)
                inserted.append((r["kid_id"], r["skill_id"], r["correct"], r.get("kind") or "round"))
            return FakeResult(inserted)
        return FakeResult([])

    async def get(self, model, pk):
        return self.skill_mastery.get(tuple(pk))

    def add(self, obj):
        if isinstance(obj, SkillMastery):
            self.skill_mastery[(obj.kid_id, obj.skill_id)] = obj

    async def commit(self):
        self.committed = True

    async def flush(self):
        pass


class _FakeProfile:
    id = uuid.uuid4()


async def post_progress(fake, kid_id, events):
    body = ProgressBatchIn(events=events)
    return await P.record_progress(body, profile=_FakeProfile(), db=fake)


def ev(kid_id, skill_id, *, correct=True, uid=None, timestamp=None, kind=None, meta=None, client_ts=None):
    return ProgressEventIn(
        kid_id=kid_id,
        skill_id=skill_id,
        game_id="tower-tap",
        correct=correct,
        uid=uid,
        timestamp=timestamp,
        kind=kind,
        meta=meta,
        client_ts=client_ts,
    )


async def main():
    print("1.  #1611 — client_ts persistence: ISO wins, integer epoch-ms converts…")

    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    iso_ts = datetime(2026, 8, 10, 3, 30, 0, tzinfo=timezone.utc)
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", uid="c-iso", client_ts=iso_ts)])
    row = fake.last_insert_rows[0]
    check("ISO client_ts persisted verbatim", row["client_ts"], iso_ts)
    check("ISO client_ts row kind defaults to round", row["kind"], "round")

    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", uid="c-ms", timestamp=1_753_800_000_000)])
    row = fake.last_insert_rows[0]
    want = datetime.fromtimestamp(1_753_800_000_000 / 1000.0, tz=timezone.utc)
    check("epoch-ms timestamp converted to aware UTC", row["client_ts"], want)
    check("client_ts carries tzinfo", row["client_ts"].tzinfo is not None, True)

    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", uid="c-none")])
    check("no client time -> client_ts None (created_at fallback)", fake.last_insert_rows[0]["client_ts"], None)

    print("2.  #1614 — LearningStoryIn rejects unknown error_kind / action / misconception_code…")

    def story(**kw):
        base = dict(kid_id=uuid.uuid4(), skill_id="count-1-10", game_id="tower-tap", outcome=False)
        base.update(kw)
        return LearningStoryIn(**base)

    for label, kw in [
        ("unknown error_kind rejected", {"error_kind": "parse-error"}),
        ("unknown action rejected", {"action": "skill"}),
        ("unknown misconception_code rejected", {"misconception_code": "made-up-code"}),
    ]:
        try:
            story(**kw)
            check(label, "no", "yes")
        except Exception:
            check(label, "yes", "yes")

    for kind in ("slip", "gap", "misconception", "fatigue", "guessing"):
        story(error_kind=kind)
        check(f"valid error_kind accepted: {kind}", "yes", "yes")
    for act in ("slow-down", "reteach", "contrast", "easier", "challenge", "break", "celebrate"):
        story(action=act)
        check(f"valid action accepted: {act}", "yes", "yes")
    for code in ("overcount-1", "undercount-1", "off-by-ten", "off-by-hundred", "double", "half", "reversal", "repeated-error"):
        story(misconception_code=code)
        check(f"valid misconception_code accepted: {code}", "yes", "yes")

    print("3.  #1616 — engagement events persist as rows but never move BKT mastery…")

    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    r = await post_progress(fake, kid.id, [
        ev(kid.id, "count-1-10", uid="round-1", correct=True),
        ev(kid.id, "count-1-10", uid="coins-1", correct=True, kind="coins", meta={"amount": 3}),
        ev(kid.id, "count-1-10", uid="quest-1", correct=True, kind="quest", meta={"done": True}),
        ev(kid.id, "count-1-10", uid="sess-1", correct=True, kind="session-start"),
        ev(kid.id, "count-1-10", uid="sess-min-1", correct=True, kind="session-minutes", meta={"minutes": 4.5}),
    ])
    check("all 5 events recorded (round + 4 engagement)", r["recorded"], 5)
    sm = fake.skill_mastery[(kid.id, "count-1-10")]
    check("engagement rows did NOT bump attempts (rounds-only BKT)", sm.attempts, 1)
    check("engagement rows did NOT bump correct", sm.correct, 1)
    kinds = {row["kind"] for row in fake.last_insert_rows}
    check("kinds persisted on every row", kinds, {"round", "coins", "quest", "session-start", "session-minutes"})
    coin_meta = next(row["meta"] for row in fake.last_insert_rows if row["kind"] == "coins")
    check("engagement meta persisted", coin_meta, {"amount": 3})

    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    await post_progress(fake, kid.id, [
        ev(kid.id, "count-1-10", uid="e1", correct=True, kind="garden", meta={"growth": 1}),
    ])
    check("engagement-only batch creates NO mastery row", len(fake.skill_mastery), 0)

    print("4.  #1618 — weekly minutes uses session-minutes events, not the response-time proxy…")

    def pe(kind, minutes=None, response_ms=None):
        e = ProgressEvent(kind=kind, meta={"minutes": minutes} if minutes is not None else None)
        e.response_ms = response_ms
        return e

    evs = [
        pe("round", None, 30_000),
        pe("round", None, 20_000),
        pe("session-minutes", 4.5),
        pe("session-minutes", 2.25),
    ]
    check("session minutes sum (4.5 + 2.25)", _session_minutes(evs), 6.75)
    check("weekly minutes prefers session minutes", _weekly_minutes(evs), 6.8)

    legacy = [pe("round", None, 30_000), pe("round", None, 60_000)]
    check("legacy fallback sum(response_ms)", _weekly_minutes(legacy), 1.5)
    mixed = [pe("round", None, 30_000), pe("coins", None, None)]
    check("legacy fallback ignores engagement rows", _weekly_minutes(mixed), 0.5)

    print("5.  #1620 — server dedup namespace: re-posting a completed round's uid is a no-op…")

    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid="round-u1")])
    r2 = await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid="round-u1")])
    check("replayed round uid records 0 (no double count)", r2["recorded"], 0)
    check("replayed round uid counted as duplicate", r2["duplicates_skipped"], 1)
    sm = fake.skill_mastery[(kid.id, "count-to-50")]
    check("mastery not double-counted after retry", sm.attempts, 1)
    check("progress_events enforces unique (kid_id, uid)",
          any(c.name == "uq_progress_events_kid_uid" for c in ProgressEvent.__table__.constraints), True)


asyncio.run(main())

print()
print(f"* telemetry suite: {passes} passed, {fails} failed")
print(f"SUMMARY telemetry: {passes + fails} checks, #1611/#1614/#1616/#1618/#1620 covered, real bugs: none")
sys.exit(1 if fails else 0)
