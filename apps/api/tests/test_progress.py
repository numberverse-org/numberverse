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

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import Select, UniqueConstraint
from sqlalchemy.dialects.postgresql.dml import Insert as PGInsert
from sqlalchemy.sql.expression import TextClause  # noqa: E402

from app.bandlock import skill_band_allowed
from app.config import settings  # noqa: E402
from app.models import Kid, KidSettings, ProgressEvent, SkillMastery, Subscription
from app.routers import progress as P
from app.routers.progress import (  # noqa: E402
    DEFAULT_PARAMS,
    SKILL_BANDS,
    _adaptive_params,
    _bkt_update,
    _decay,
    _lock_story_cap_keys,
    _next_mastered_at,
)
from app.schemas import (  # noqa: E402
    AccelerationIn,
    LearningStoryIn,
    ProgressBatchIn,
    ProgressEventIn,
)

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
                    continue  # ON CONFLICT DO NOTHING → not returned, not re-counted
                self._inserted_uid_keys.add(key)
                # #1616 — the returning() clause now also surfaces the event
                # kind so the handler can split BKT rounds from engagement rows.
                inserted.append((r["kid_id"], r["skill_id"], r["correct"], r.get("kind") or "round"))
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


class FakeAccelSession:
    """In-memory AsyncSession shaped for `record_acceleration` (#1640).

    Simulates the pieces the /acceleration handler touches:
      · _get_owned_kid  → scalar(Select) returns the stored kid (ownership ok)
      · _load_band_caps → execute(Select) returns (kid_id, max_band) rows
      · accel insert    → execute(PGInsert) applies the (kid_id, uid) dedup the
        real uq_accel_kid_uid constraint gives ON CONFLICT DO NOTHING, and
        records each stored row so the test can assert ROW COUNT stability.
    """

    def __init__(self):
        self.kids: dict[uuid.UUID, Kid] = {}
        self.settings: dict[uuid.UUID, KidSettings] = {}
        self.rows: list[dict] = []  # stored acceleration rows (deduped)
        self._seen_uids: set[tuple] = set()
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
                if key in self._seen_uids:
                    continue  # ON CONFLICT DO NOTHING → not re-counted
                self._seen_uids.add(key)
                self.rows.append(r)
                inserted.append(r)
            return FakeResult(inserted)  # rowcount == number actually inserted
        return FakeResult([])

    async def commit(self):
        self.committed = True


class FakeStorySession:
    """In-memory AsyncSession shaped exactly for `record_stories` (#1808).

    Simulates the pieces the /stories handler touches, in order:
      · _get_owned_kid  → scalar(Select) returns the stored kid (ownership ok)
      · _load_band_caps → execute(Select) returns (kid_id, max_band) rows
      · resolve_plan    → scalar(Select) on Subscription returns None (free)
      · advisory lock   → execute(TextClause) acquires a per-key asyncio.Lock
        (released on commit, mirroring pg_advisory_xact_lock's transaction
        scope); an optional barrier forces two CONCURRENT calls to reach the
        lock together so the count+insert race is actually exercised.
      · stories count   → scalar(count(*)) returns the committed story count
      · stories insert  → execute(PGInsert) applies the (kid_id, uid) dedup the
        real uq_learning_stories_kid_uid constraint gives ON CONFLICT DO
        NOTHING; the count bumps only at commit (READ COMMITTED semantics).
    """

    def __init__(self, lock_barrier=None):
        self.kids: dict[uuid.UUID, Kid] = {}
        self.settings: dict[uuid.UUID, KidSettings] = {}
        self.story_count = 0
        self.story_store: list[dict] = []
        self._seen_uids: set[tuple] = set()
        self.advisory_locks: list[str] = []
        self._tx_locks: dict[str, asyncio.Lock] = {}
        self._held: asyncio.Lock | None = None
        self.lock_barrier = lock_barrier  # optional asyncio.Barrier (race test)
        self.committed = False
        self.op_log: list[tuple] = []

    def add_kid(self, *, max_band: int | None = None) -> Kid:
        kid = Kid(id=uuid.uuid4(), profile_id=uuid.uuid4(), name="Test Kid")
        self.kids[kid.id] = kid
        if max_band is not None:
            self.settings[kid.id] = KidSettings(kid_id=kid.id, max_band=max_band)
        return kid

    def seed_stories(self, kid_id: uuid.UUID, n: int) -> None:
        """Pre-fill `n` stored stories (e.g. cap - 1) so the handler sees a
        near-full backlog; the count query reflects these."""
        for i in range(n):
            key = (kid_id, f"seed-{i}")
            self._seen_uids.add(key)
            self.story_store.append({"kid_id": kid_id, "uid": f"seed-{i}"})
        self.story_count = len(self.story_store)

    async def scalar(self, stmt):
        if isinstance(stmt, Select):
            entity = stmt.column_descriptions[0].get("entity")
            if entity is Kid:
                return next(iter(self.kids.values()), None)
            if entity is Subscription:
                return None  # free plan
        if "count(*)" in str(stmt.compile()):
            self.op_log.append(("count", self.story_count))
            return self.story_count
        return None

    async def execute(self, stmt):
        if isinstance(stmt, Select):
            rows = [(kid_id, ks.max_band) for kid_id, ks in self.settings.items()]
            return FakeResult(rows)
        if isinstance(stmt, TextClause):
            key = stmt.compile().params.get("key")
            self.advisory_locks.append(key)
            self.op_log.append(("lock", key))
            if self.lock_barrier is not None:
                await self.lock_barrier.wait()  # both racers reach the lock
            lock = self._tx_locks.setdefault(key, asyncio.Lock())
            await lock.acquire()
            self._held = lock
            return FakeResult([])
        if isinstance(stmt, PGInsert):
            rows = _extract_insert_rows(stmt)
            # #3114 — a RateLimitBucket insert (key column) is the rate-limit
            # first-use guard, not a story/progress event; it's a no-op in the
            # fake (the bucket FOR-UPDATE read-modify-write is exercised by the
            # dedicated test_ratelimit.py, not here).
            if rows and "key" in rows[0] and "kid_id" not in rows[0]:
                return FakeResult([])
            self.op_log.append(("insert", len(rows)))
            inserted = []
            for r in rows:
                key = (r["kid_id"], r["uid"])
                if key in self._seen_uids:
                    continue  # ON CONFLICT DO NOTHING → not re-counted
                self._seen_uids.add(key)
                self.story_store.append(r)
                inserted.append(r)
            return FakeResult(inserted)
        return FakeResult([])

    async def commit(self):
        self.committed = True
        self.story_count = len(self.story_store)
        self.op_log.append(("commit", self.story_count))
        if self._held is not None:
            self._held.release()
            self._held = None

    # #3113 — record_stories mints a kid-scoped throughput bucket via
    # _allow_fixed_window (a FOR-UPDATE read-modify-write) BEFORE the cap check.
    # The RateLimitBucket select falls through scalar() as None (not Kid/
    # Subscription/count), so _allow_fixed_window issues add()+flush(); accept
    # the row as a no-op so the cap tests below still exercise the ORIGINAL
    # story-cap path untouched.
    def add(self, obj):
        pass

    async def flush(self):
        pass


def story(kid_id, skill_id, *, uid=None, outcome=True):
    return LearningStoryIn(
        kid_id=kid_id,
        skill_id=skill_id,
        game_id="count-1-10-game",
        outcome=outcome,
        uid=uid,
    )


def accel(kid_id, skill_id, *, reason="easy", band_from=1, band_to=2, uid=None):
    return AccelerationIn(
        kid_id=kid_id,
        skill_id=skill_id,
        reason=reason,
        band_from=band_from,
        band_to=band_to,
        uid=uid,
    )


async def post_acceleration(fake, entries):
    return await P.record_acceleration(entries, profile=_FakeProfile(), db=fake)


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

    print("④  #1640 — acceleration: uid-less rows get a synthetic uid; durable-outbox replay stays idempotent…")

    # #1640 — /acceleration stored a.uid VERBATIM. A None uid (legacy client)
    # defeated the (kid_id, uid) ON CONFLICT dedup because Postgres treats NULLs
    # as distinct, so a lost-ACK re-post created duplicate skip entries. Mirror
    # the stories/progress fix: synthesize a server-side uid for every entry
    # that arrives without one, so the unique key NEVER sees a NULL.
    fake = FakeAccelSession()
    kid = fake.add_kid(max_band=5)
    r1 = await post_acceleration(fake, [accel(kid.id, "count-to-50", uid=None)])
    check("uid-less acceleration entry records", r1["recorded"], 1)
    check("server synthesized a non-NULL uid for dedup", fake.last_insert_rows[0]["uid"] is not None, True)
    check("synthesized uid is a UUID string", isinstance(fake.last_insert_rows[0]["uid"], str), True)
    stable_uid = fake.last_insert_rows[0]["uid"]

    # A replayed durable-outbox batch (now carrying the stable uid) is a silent
    # no-op — the SAME (kid_id, uid) that Postgres would conflict on.
    r2 = await post_acceleration(fake, [accel(kid.id, "count-to-50", uid=stable_uid)])
    check("replayed acceleration entry records 0", r2["recorded"], 0)
    check("replay counted as duplicate", r2["duplicates_skipped"], 1)
    check("acceleration row count stays 1 after replay", len(fake.rows), 1)

    await _run_story_cap()


async def _run_story_cap():
    print("⑤  #1808 — story cap: per-kid advisory lock serializes count+insert…")

    # Mechanism: a fresh batch acquires the kid's advisory lock BEFORE any cap
    # count, and the key is namespaced so it can't collide with mastery locks.
    fake = FakeStorySession()
    kid = fake.add_kid(max_band=5)
    r = await P.record_stories([story(kid.id, "count-1-10", uid="s1")],
                               profile=_FakeProfile(), db=fake)
    check("fresh kid story records", r["recorded"], 1)
    check("one advisory lock acquired for the batch", len(fake.advisory_locks), 1)
    check("lock key is kid-scoped and namespaced (storycap: prefix)",
          fake.advisory_locks[0].startswith("storycap:"), True)
    ops = [op for op, *_ in fake.op_log]
    check("advisory lock precedes the cap count",
          ops.index("lock") < ops.index("count"), True)

    # Every kid in a multi-kid batch is locked before ANY cap count runs.
    fake = FakeStorySession()
    kid_a = fake.add_kid(max_band=5)
    kid_b = fake.add_kid(max_band=5)
    await P.record_stories([story(kid_a.id, "count-1-10", uid="a1"),
                            story(kid_b.id, "count-1-10", uid="b1")],
                           profile=_FakeProfile(), db=fake)
    check("one advisory lock per kid in the batch", len(fake.advisory_locks), 2)
    ops = [op for op, *_ in fake.op_log]
    check("all locks are acquired before the first cap count",
          max(i for i, op in enumerate(ops) if op == "lock")
          < min(i for i, op in enumerate(ops) if op == "count"), True)

    # Cap enforcement: an at-cap batch is rejected 429 and stores nothing.
    cap = settings.kotha_max_stories_per_kid
    fake = FakeStorySession()
    kid = fake.add_kid(max_band=5)
    fake.seed_stories(kid.id, cap)
    try:
        await P.record_stories([story(kid.id, "count-1-10", uid="over")],
                               profile=_FakeProfile(), db=fake)
        check("at-cap batch is rejected", "no-429", 429)
    except HTTPException as exc:
        check("at-cap batch is rejected (429)", exc.status_code, 429)
    check("nothing stored past the cap", fake.story_count, cap)

    # cap - 1 → exactly one more story is accepted, then the cap holds.
    fake = FakeStorySession()
    kid = fake.add_kid(max_band=5)
    fake.seed_stories(kid.id, cap - 1)
    r = await P.record_stories([story(kid.id, "count-1-10", uid="ok")],
                               profile=_FakeProfile(), db=fake)
    check("cap-1 batch records exactly one", r["recorded"], 1)
    check("store now sits exactly at the cap", fake.story_count, cap)

    # Concurrency race: two simultaneous batches for a near-full kid are forced
    # to reach the advisory lock together (barrier). The lock serializes the
    # count+insert, so at most ONE records — the cap is never exceeded even
    # though both batches start before either commits.
    fake = FakeStorySession(lock_barrier=asyncio.Barrier(2))
    kid = fake.add_kid(max_band=5)
    fake.seed_stories(kid.id, cap - 1)
    res = await asyncio.gather(
        P.record_stories([story(kid.id, "count-1-10", uid="race-1")],
                         profile=_FakeProfile(), db=fake),
        P.record_stories([story(kid.id, "count-1-10", uid="race-2")],
                         profile=_FakeProfile(), db=fake),
        return_exceptions=True,
    )
    recorded = sum(r["recorded"] for r in res if isinstance(r, dict))
    rejected = sum(
        1 for r in res
        if isinstance(r, HTTPException) and r.status_code == 429
    )
    check("race: exactly one of the two batches records", recorded, 1)
    check("race: the other batch is rejected 429", rejected, 1)
    check("race: story count never exceeds the cap", fake.story_count, cap)


asyncio.run(main())


# ⑧  #1900/#1902 — typed schema + route registration: /stories/stats must be its
#     OWN registered route (never shadowed by /stories) and declare the
#     StoryStatsOut response_model; the schema shape stays stable.
from app.schemas import StoryStatsOut  # noqa: E402

_stats_path = "/api/v1/kids/{kid_id}/stories/stats"
_list_path = "/api/v1/kids/{kid_id}/stories"
stats_routes = [r for r in P.router.routes if getattr(r, "path", "") == _stats_path]
list_routes = [r for r in P.router.routes if getattr(r, "path", "") == _list_path]
check("stories list route is registered", len(list_routes) == 1, True)
check("stories/stats is its own registered route (not swallowed)", len(stats_routes) == 1, True)
if stats_routes:
    check("stories/stats is a GET route", "GET" in getattr(stats_routes[0], "methods", set()), True)
    check("stories/stats declares StoryStatsOut response_model",
          getattr(stats_routes[0], "response_model", None) is StoryStatsOut, True)
_stats = StoryStatsOut(total=3, by_skill={"count-1-10": 2}, by_error_kind={}, by_misconception={"dec": 1})
check("StoryStatsOut constructs — typed dict shape (total/by_skill/by_error_kind/by_misconception)",
      _stats.total == 3 and _stats.by_skill["count-1-10"] == 2 and _stats.by_misconception["dec"] == 1, True)

print()
print(f"✓ progress suite: {passes} passed, {fails} failed")
print(f"SUMMARY progress: {passes + fails} checks, findings #7/#8 closed, real bugs: none")
sys.exit(1 if fails else 0)
