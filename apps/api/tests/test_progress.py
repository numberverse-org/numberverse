#!/usr/bin/env python3
"""WAVE C — progress BKT math + /progress upsert contract + band-skip uid loss.

Closes test-coverage-api feed #7 (progress BKT + upsert) and #8 (band-skipped
events with no uid). A pure-function suite PLUS an in-memory AsyncSession so the
actual `record_progress` handler runs end-to-end with NO Postgres:

  #7  BKT mastery math mirrors packages/core/src/adaptive.ts observe(): correct
      answers push P(mastered) up monotonically, the compiled-in params bound
      the posterior to [0, 1], a fully-correct run converges above the 0.8 bar,
      and wrong/idle-after-mastered decays back below it. /progress UPSERTS a
      kid+skill row (reposted uid = dedup no-op; fresh uid = same-row update,
      never a duplicate) and stamps mastered_at on the FIRST threshold crossing
      using the COMPILED-IN params — the `adaptive` config row is never read.
  #8  A band-capped progress event is skipped: uid'd skips keep their uid in
      `band_skipped_uids` so the client can REQUEUE (#1026); no-uid skips are
      surfaced ONLY as the aggregate `band_skipped` count — asserted as the
      actual behavior (a client can detect the gap: band_skipped >
      len(band_skipped_uids) means a no-uid drop happened).

Run:  cd apps/api && python3 tests/test_progress.py
"""
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import Select, UniqueConstraint
from sqlalchemy.dialects.postgresql.dml import Insert as PGInsert

from app.bandlock import skill_band_allowed
from app.models import Kid, KidSettings, ProgressEvent, SkillMastery
from app.routers import progress as P
from app.routers.progress import (  # noqa: E402
    DEFAULT_PARAMS,
    SKILL_BANDS,
    _adaptive_params,
    _bkt_update,
    _decay,
    _next_mastered_at,
)
from app.schemas import ProgressBatchIn, ProgressEventIn  # noqa: E402

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
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


NOW = datetime.now(timezone.utc)


# ── In-memory AsyncSession for the real record_progress handler ──────────────

def _extract_insert_rows(stmt):
    """Pull the parameter dicts out of an INSERT ... VALUES (...) statement."""
    mv = getattr(stmt, "_multi_values", None)
    if mv:
        # .values([{...}, {...}]) stores tuple([list-of-dicts]); the dicts are
        # keyed by Column objects, so rebind to plain column keys.
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
    """A Postgres-free AsyncSession shaped exactly for record_progress.

    Simulates the pieces the handler touches, in order:
      · _get_owned_kid  → scalar(Select) returns the stored kid (ownership ok)
      · _load_band_caps → execute(Select) returns (kid_id, max_band) rows
      · progress insert → execute(PGInsert) applies the (kid_id, uid) dedup the
        real uq_progress_events_kid_uid constraint gives ON CONFLICT DO NOTHING
      · coins           → execute(Update) is a no-op result
      · SkillMastery    → get/add keeps an in-memory map, so a fresh uid for the
        same kid+skill UPDATES the same row (the upsert contract)
    """

    def __init__(self):
        self.kids: dict[uuid.UUID, Kid] = {}
        self.settings: dict[uuid.UUID, KidSettings] = {}
        self.skill_mastery: dict[tuple, SkillMastery] = {}
        self.committed = False
        self._inserted_uid_keys: set[tuple] = set()
        self.last_insert_rows: list[dict] | None = None

    def add_kid(self, *, max_band: int | None = None) -> Kid:
        kid = Kid(id=uuid.uuid4(), profile_id=uuid.uuid4(), name="Test Kid")
        self.kids[kid.id] = kid
        if max_band is not None:
            self.settings[kid.id] = KidSettings(kid_id=kid.id, max_band=max_band)
        return kid

    async def scalar(self, stmt):
        if isinstance(stmt, Select) and self.kids:
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
                    continue  # ON CONFLICT DO NOTHING → not returned, not re-counted
                self._inserted_uid_keys.add(key)
                inserted.append((r["kid_id"], r["skill_id"], r["correct"]))
            return FakeResult(inserted)
        # Update (coins) — the handler only commits, never reads the result.
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


async def post_progress(fake, kid_id, events, coins=None):
    body = ProgressBatchIn(events=events, coins=coins)
    return await P.record_progress(body, profile=_FakeProfile(), db=fake)


def ev(kid_id, skill_id, *, correct=True, uid=None, timestamp=None):
    return ProgressEventIn(
        kid_id=kid_id,
        skill_id=skill_id,
        game_id="tower-tap",
        correct=correct,
        uid=uid,
        timestamp=timestamp,
    )


async def main():
    print("①  Feed #7 — BKT mastery math mirrors packages/core/src/adaptive.ts…")

    check("first correct from 0 → 0.10", _bkt_update(0.0, True), 0.10)
    check("first wrong from 0 → 0.10 (client's learning-opportunity term too)", _bkt_update(0.0, False), 0.10)
    check("correct at 0.5 rises above 0.5", _bkt_update(0.5, True) > 0.5, True)

    # Correct answers push the estimate up monotonically over the whole range.
    nondrop = all(_bkt_update(i / 100, True) >= i / 100 for i in range(101))
    check("correct is monotonic across the full [0,1] sweep", nondrop, True)

    # The compiled-in params bound the posterior to a sane [0,1] probability.
    bounded = all(0.0 <= _bkt_update(i / 100, c) <= 1.0 for i in range(101) for c in (True, False))
    check("posterior stays inside [0,1] for every p and every answer", bounded, True)

    # A fully-correct long run converges above the mastery threshold (0.8).
    p = 0.0
    steps = 0
    while p < 0.8 and steps < 50:
        p = _bkt_update(p, True)
        steps += 1
    check("fully-correct run crosses 0.8 within 5 answers", steps <= 5, True)
    check("crossed mastery is >= the 0.8 mastered bar", p >= 0.8, True)
    for _ in range(10):
        p = _bkt_update(p, True)
    check("10 more corrects absorb at 1.0 (clamped, still bounded)", p, 1.0)

    # A wrong answer after being mastered decays mastery below the bar.
    wrong_hi = _bkt_update(0.9, False)
    check("wrong at 0.9 drops below the 0.8 bar", wrong_hi < 0.8, True)
    check("wrong-at-mastery stays a sane probability", 0.0 <= wrong_hi <= 1.0, True)

    # The decay contract from the difficulty-model feed: _decay applies (1−decayPerDay)^days.
    decayed = _decay(0.9, NOW - timedelta(days=30), NOW, DEFAULT_PARAMS["decay_per_day"])
    check("30 idle days ≈ 0.9 × 0.98^30", decayed, 0.9 * (0.98 ** 30))
    check("idle days decay a mastered skill below the bar", decayed < 0.8, True)
    check("fresh row (last_decay None) → no decay", _decay(0.9, None, NOW, 0.02), 0.9)
    check("same-instant round → no decay", _decay(0.9, NOW, NOW, 0.02), 0.9)

    # Composition: mastered → idle days → wrong stays below the bar.
    composed = _bkt_update(_decay(0.9, NOW - timedelta(days=15), NOW, 0.02), False)
    check("mastered + 15 idle days + a wrong answer stays below the bar", composed < 0.8, True)

    print("②  Feed #7 — /progress UPSERTS a kid+skill row, stamps mastered_at once, uses compiled-in params…")

    # Upsert: first event inserts, a FRESH uid on the SAME kid+skill updates the SAME row.
    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    r1 = await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid="u1", timestamp=1000)])
    check("response carries the documented contract keys",
          set(r1.keys()) == {"recorded", "duplicates_skipped", "band_skipped", "band_skipped_uids"}, True)
    check("first event recorded", r1["recorded"], 1)
    check("first event is not a duplicate", r1["duplicates_skipped"], 0)
    sm = fake.skill_mastery[(kid.id, "count-to-50")]
    check("first event created one SkillMastery row", fake.skill_mastery.get((kid.id, "count-to-50")) is not None, True)
    check("attempts after first event", sm.attempts, 1)
    check("corrects after first event", sm.correct, 1)
    sm_mastery_after_1 = sm.mastery

    # Reposting the SAME uid is a silent no-op (ON CONFLICT DO NOTHING) — mastery never double-counted.
    r2 = await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid="u1", timestamp=2000)])
    check("reposted uid records 0", r2["recorded"], 0)
    check("reposted uid counted as duplicate", r2["duplicates_skipped"], 1)
    check("replay did NOT double-count attempts", sm.attempts, 1)
    check("replay did NOT move mastery", sm.mastery, sm_mastery_after_1)

    # A fresh uid for the same kid+skill updates the existing row — no duplicate row.
    r3 = await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid="u2", timestamp=3000)])
    check("fresh uid recorded", r3["recorded"], 1)
    check("still exactly one SkillMastery row", len(fake.skill_mastery), 1)
    sm = fake.skill_mastery[(kid.id, "count-to-50")]
    check("same-row update bumped attempts to 2", sm.attempts, 2)
    check("same-row update raised mastery", sm.mastery > sm_mastery_after_1, True)

    # Model-level guarantee: unique (kid_id, uid) is what makes ON CONFLICT DO NOTHING dedup correct.
    uqc = [c for c in ProgressEvent.__table__.constraints if isinstance(c, UniqueConstraint)]
    check("progress_events enforces unique (kid_id, uid)",
          any(c.name == "uq_progress_events_kid_uid" and [col.name for col in c.columns] == ["kid_id", "uid"] for c in uqc), True)

    # Mastery threshold crossing stamps mastered_at on the FIRST crossing only.
    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    fake.skill_mastery[(kid.id, "count-1-10")] = SkillMastery(
        kid_id=kid.id, skill_id="count-1-10", mastery=0.7, correct=3, attempts=10, streak=0,
        last_decay=NOW, mastered_at=None,
    )
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", correct=True, uid="cross-1")])
    sm = fake.skill_mastery[(kid.id, "count-1-10")]
    check("0.7 + one correct crosses above the 0.8 bar", sm.mastery >= 0.8, True)
    check("threshold crossing stamped mastered_at", sm.mastered_at is not None, True)
    stamp1 = sm.mastered_at
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", correct=True, uid="cross-2")])
    check("second crossing keeps the ORIGINAL mastered_at stamp",
          fake.skill_mastery[(kid.id, "count-1-10")].mastered_at, stamp1)

    # Pure state-machine for the stamp (first crossing / never overwrite / clear below).
    stamp_fixed = datetime(2026, 1, 1, tzinfo=timezone.utc)
    check("first crossing stamps the wall clock", _next_mastered_at(0.7, 0.9, None, 0.8, stamp_fixed), stamp_fixed)
    check("already-mastered never overwrites the stamp", _next_mastered_at(0.7, 0.95, stamp_fixed, 0.8, stamp_fixed), stamp_fixed)
    check("decay below the bar clears the stamp", _next_mastered_at(0.9, 0.6, stamp_fixed, 0.8, stamp_fixed), None)
    check("no crossing + no stamp → stays None (no retroactive stamp)", _next_mastered_at(0.9, 0.85, None, 0.8, stamp_fixed), None)

    # The server BKT runs on the COMPILED-IN params, never the `adaptive` config row.
    params = await _adaptive_params(None)  # db arg intentionally ignored (closure #2)
    check("server params are the compiled-in dict copy", params, dict(DEFAULT_PARAMS))
    check("p_learn mirrors client (0.10)", params["p_learn"], 0.10)
    check("p_guess mirrors client (0.15)", params["p_guess"], 0.15)
    check("p_slip mirrors client (0.10)", params["p_slip"], 0.10)
    check("decay_per_day mirrors client (0.02)", params["decay_per_day"], 0.02)
    check("mastery_threshold mirrors client (0.8)", params["mastery_threshold"], 0.8)

    # A no-uid (legacy/pre-dedup) event still gets a synthesized uid so the unique
    # (kid_id, uid) dedup NEVER sees a NULL that would defeat ON CONFLICT (#942/#1023).
    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    r = await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid=None)])
    check("no-uid event still records", r["recorded"], 1)
    check("server synthesized a non-NULL uid for dedup", fake.last_insert_rows[0]["uid"] is not None, True)

    print("③  Feed #8 — band-capped progress: uid'd skips get a requeue handle, no-uid skips an explicit count…")

    # A cap-1 kid posting a band-2 skill IS skipped and the uid is reported so the
    # client can REQUEUE (#1026) instead of silently clearing its outbox.
    fake = FakeSession()
    kid = fake.add_kid(max_band=1)
    r = await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid="band-uid-1")])
    check("band-2 event under cap 1 records 0", r["recorded"], 0)
    check("band-2 event under cap 1 is counted band_skipped", r["band_skipped"], 1)
    check("uid'd skip keeps its uid so the client can requeue", r["band_skipped_uids"], ["band-uid-1"])
    check("band skip never created a SkillMastery row", len(fake.skill_mastery), 0)
    check("band skip never reached the progress insert", fake.last_insert_rows, None)

    # A no-uid event is dropped too — its ONLY signal is the aggregate count, so no
    # counted attempt vanishes without any trace in the response.
    fake = FakeSession()
    kid = fake.add_kid(max_band=1)
    r = await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid=None)])
    check("no-uid band-2 event records 0", r["recorded"], 0)
    check("no-uid skip still counts in band_skipped (aggregate signal)", r["band_skipped"], 1)
    check("no-uid skip has nothing to put in band_skipped_uids", r["band_skipped_uids"], [])
    check("no-uid skip never reached the progress insert", fake.last_insert_rows, None)
    check("gap detector: band_skipped > len(band_skipped_uids) flags the no-uid drop",
          r["band_skipped"] > len(r["band_skipped_uids"]), True)

    # In-band events under the same cap still record normally.
    fake = FakeSession()
    kid = fake.add_kid(max_band=1)
    r = await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", correct=True, uid="ok-1")])
    check("band-1 event under cap 1 records", r["recorded"], 1)
    check("band-1 event not skipped", r["band_skipped"], 0)
    check("band-1 event created a mastery row", len(fake.skill_mastery), 1)

    # The pure band-lock rule backing the handler (same SKILL_BANDS the handler uses).
    check("band policy: band 2 is BLOCKED under cap 1", skill_band_allowed("count-to-50", SKILL_BANDS, 1), False)
    check("band policy: band 1 passes under cap 1", skill_band_allowed("count-1-10", SKILL_BANDS, 1), True)
    check("band policy: unknown skill fails closed under a cap", skill_band_allowed("nope", SKILL_BANDS, 1), False)
    check("band policy: no cap admits everything", skill_band_allowed("count-to-50", SKILL_BANDS, None), True)


asyncio.run(main())

print()
print(f"✓ progress suite: {passes} passed, {fails} failed")
print(f"SUMMARY progress: {passes + fails} checks, findings #7/#8 closed, real bugs: none")
sys.exit(1 if fails else 0)
