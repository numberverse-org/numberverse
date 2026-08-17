#!/usr/bin/env python3
"""#1803 + #1804 — BKT mastery atomicity + wallet last-write-wins spend sync.

#1803  advisory-lock serialization of the BKT read-modify-write per (kid, skill).
       Two sequential /progress batches on the same skill accumulate attempts to
       their sum; every unique (kid, skill) in the inserted rows is locked.

#1804  wallet LWW via a monotonic wallet_seq counter. A spend (LOWER coins but a
       HIGHER seq) overwrites the server; a stale seq is ignored, so the old
       GREATEST can never resurrect a pre-spend balance.

Runs the REAL record_progress + get_kid_snapshot handlers against an in-memory
FakeSession (no Postgres) — same standalone check()/passes/fails pattern as
test_progress.py.

Run:  cd apps/api && python3 tests/test_progress_sync.py
"""
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import Select, Table, Update
from sqlalchemy.dialects.postgresql.dml import Insert as PGInsert

from app.models import Kid, KidSettings, SkillMastery, Subscription
from app.routers import progress as P
from app.routers.progress import _lock_mastery_keys
from app.schemas import ProgressBatchIn, ProgressEventIn

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


def _extract_insert_rows(stmt):
    """Pull the parameter dicts out of an INSERT ... VALUES (...) statement."""
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
    """In-memory AsyncSession shaped for the #1803/#1804 handlers.

    Simulates, in order:
      · _get_owned_kid  → scalar(Select) returns the stored kid (ownership ok)
      · _load_band_caps → execute(Select) returns (kid_id, max_band) rows
      · progress insert → execute(PGInsert) applies the (kid_id, uid) dedup the
        real uq_progress_events_kid_uid constraint gives ON CONFLICT DO NOTHING
      · #1803 lock      → execute(text(...pg_advisory_xact_lock...)) records the
        advisory-lock call in `advisory_locks` (hashed-pair assertions)
      · coins/wallet    → execute(Update on kids) applies coins + wallet_seq
      · SkillMastery    → get/add keeps an in-memory map (upsert contract)
    """

    def __init__(self):
        self.kids: dict[uuid.UUID, Kid] = {}
        self.settings: dict[uuid.UUID, KidSettings] = {}
        self.skill_mastery: dict[tuple, SkillMastery] = {}
        self.committed = False
        self._inserted_uid_keys: set[tuple] = set()
        self.last_insert_rows: list[dict] | None = None
        # #1803 — every advisory-lock key the handler requested.
        self.advisory_locks: list[str] = []

    def add_kid(self, *, max_band: int | None = None, wallet_seq: int = 0) -> Kid:
        kid = Kid(id=uuid.uuid4(), profile_id=uuid.uuid4(), name="Test Kid", wallet_seq=wallet_seq)
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

    async def execute(self, stmt, params=None):
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
        if isinstance(stmt, Update):
            table = stmt.table
            if isinstance(table, Table) and table.name == "kids":
                # #1804 — respect the Last-Write-Wins gate: only apply when the
                # kid's CURRENT wallet_seq is strictly less than the incoming
                # seq (the real DB enforces this in the WHERE clause). This is
                # what prevents a stale/equal seq from resurrecting coins.
                values = {
                    col.key: (val.value if hasattr(val, "value") else val)
                    for col, val in stmt._values.items()
                }
                seq = values.get("wallet_seq")
                for kid in self.kids.values():
                    if seq is None or (kid.wallet_seq or 0) < seq:
                        for k, v in values.items():
                            setattr(kid, k, v)
            return FakeResult([])
        # #1803 — advisory lock (raw text). Capture the key the handler passed.
        raw = str(stmt)
        if "pg_advisory_xact_lock" in raw:
            for _, bp in getattr(stmt, "_bindparams", {}).items():
                self.advisory_locks.append(str(bp.value))
        return FakeResult([])

    async def get(self, model, pk):
        return self.skill_mastery.get(tuple(pk))

    async def scalars(self, stmt):
        if isinstance(stmt, Select):
            # Snapshot route orders SkillMastery by skill_id — return them all.
            return list(self.skill_mastery.values())
        return []

    def add(self, obj):
        if isinstance(obj, SkillMastery):
            self.skill_mastery[(obj.kid_id, obj.skill_id)] = obj

    async def commit(self):
        self.committed = True

    async def flush(self):
        pass


class _FakeProfile:
    id = uuid.uuid4()


async def post_progress(fake, kid_id, events, coins=None, wallet_seq=None):
    body = ProgressBatchIn(events=events, coins=coins, wallet_seq=wallet_seq)
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
    print("①  #1804 — wallet LWW: spend + stale-seq semantics on one atomic UPDATE…")

    # Grant (seq 1) raises coins; the server adopts coins AND seq.
    fake = FakeSession()
    kid = fake.add_kid(wallet_seq=0)
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", uid="w1")],
                        coins={str(kid.id): 10}, wallet_seq={str(kid.id): 1})
    check("grant: wallet_seq adopted", kid.wallet_seq, 1)
    check("grant: coins adopted", kid.coins, 10)

    # Spend (LOWER coins=5 but HIGHER seq=2) MUST win — the old GREATEST would
    # refuse the lower balance and resurrect the pre-spend 10.
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", uid="w2")],
                        coins={str(kid.id): 5}, wallet_seq={str(kid.id): 2})
    check("spend: wallet_seq adopted", kid.wallet_seq, 2)
    check("spend: lower coins accepted via LWW (no resurrection)", kid.coins, 5)

    # A STALE seq (1 of 999) must be ignored entirely — old write never resurrects.
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", uid="w3")],
                        coins={str(kid.id): 999}, wallet_seq={str(kid.id): 1})
    check("stale seq: wallet_seq unchanged", kid.wallet_seq, 2)
    check("stale seq: coins unchanged", kid.coins, 5)

    # An EQUAL seq (2) with a NEWER coins value is a strict-greater no-op on the
    # server (only a strictly-greater seq writes) — coins stay as stored.
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", uid="w4")],
                        coins={str(kid.id): 8}, wallet_seq={str(kid.id): 2})
    check("equal seq: not written server-side", kid.wallet_seq, 2)
    check("equal seq: server coins unchanged", kid.coins, 5)

    # No wallet_seq in the body → no wallet write at all.
    await post_progress(fake, kid.id, [ev(kid.id, "count-1-10", uid="w5")])
    check("no wallet_seq body: wallet_seq unchanged", kid.wallet_seq, 2)
    check("no wallet_seq body: coins unchanged", kid.coins, 5)

    # #1804 — snapshot surfaces the wallet_seq for the client's restore merge.
    fake = FakeSession()
    kid = fake.add_kid(wallet_seq=3)
    snap = await P.get_kid_snapshot(kid.id, profile=_FakeProfile(), db=fake)
    check("snapshot includes wallet_seq", snap.wallet_seq, 3)
    check("snapshot coins default 0", snap.coins, 0)

    print("②  #1803 — sequential batches accumulate attempts; advisory lock per (kid, skill)…")

    # (a) Two sequential batches on the SAME skill accumulate to the sum.
    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid="a1")])
    await post_progress(fake, kid.id, [ev(kid.id, "count-to-50", correct=True, uid="a2")])
    sm = fake.skill_mastery[(kid.id, "count-to-50")]
    check("two sequential batches: attempts sum to 2", sm.attempts, 2)
    check("two sequential batches: correct sum to 2", sm.correct, 2)

    # (b) The advisory-lock helper is invoked for EVERY unique (kid, skill) in
    # the inserted rows — and the pair is a stable "kid:skill" key.
    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    await post_progress(fake, kid.id, [
        ev(kid.id, "count-to-50", correct=True, uid="b1"),
        ev(kid.id, "count-1-10", correct=True, uid="b2"),
    ])
    check("two unique skills are both locked", len(fake.advisory_locks), 2)
    check("advisory lock key is kid:skill", f"{kid.id}:count-to-50" in fake.advisory_locks, True)
    check("advisory lock key is kid:skill (2nd)", f"{kid.id}:count-1-10" in fake.advisory_locks, True)
    # both skills' BKT ran (each had exactly one inserted row)
    check("first skill processed", fake.skill_mastery[(kid.id, "count-to-50")].attempts, 1)
    check("second skill processed", fake.skill_mastery[(kid.id, "count-1-10")].attempts, 1)

    # A duplicate uid is deduped by the insert, so it contributes NO extra lock
    # and NO extra attempt — one unique (kid, skill) pair ⇒ one lock.
    fake = FakeSession()
    kid = fake.add_kid(max_band=5)
    await post_progress(fake, kid.id, [
        ev(kid.id, "count-to-50", correct=True, uid="c1"),
        ev(kid.id, "count-to-50", correct=True, uid="c1"),  # replay → dedup
    ])
    check("deduped replay: exactly one advisory lock", len(fake.advisory_locks), 1)
    check("deduped replay: attempts stay 1", fake.skill_mastery[(kid.id, "count-to-50")].attempts, 1)

    # The lock helper is a pure unit too — zero pairs ⇒ zero locks.
    fake = FakeSession()
    await _lock_mastery_keys(fake, {})
    check("empty pair set → zero locks", len(fake.advisory_locks), 0)


asyncio.run(main())

print()
print(f"✓ progress sync suite: {passes} passed, {fails} failed")
print(f"SUMMARY: {passes + fails} checks, #1803/#1804 covered, {fails} failed")
sys.exit(1 if fails else 0)
