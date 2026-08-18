#!/usr/bin/env python3
"""#1855 — progress router error-message standardization.

① Every "kid" 404 is the SAME static detail `"Kid not found"` — the old
   f-strings that echoed the raw kid id (`f"Kid {kid_id} not found"`) are gone
   from /progress, /stories and /acceleration.
② The story-backlog 429 is a STATIC detail (no live story-count/cap leak) —
   the numbers move to a server-side WARNING only.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_progress_contract.py
"""
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import Select  # noqa: E402
from sqlalchemy.sql.expression import TextClause  # noqa: E402

from app.models import Kid, Subscription  # noqa: E402
from app.routers import progress as P  # noqa: E402
from app.schemas import (  # noqa: E402
    AccelerationIn,
    LearningStoryIn,
    ProgressBatchIn,
    ProgressEventIn,
)

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


async def expect_detail(name, coro, status_code, want_detail):
    try:
        await coro
    except HTTPException as e:
        check(f"{name} status", e.status_code, status_code)
        check(f"{name} detail", e.detail, want_detail)
        return e
    check(f"{name} status", "no error", status_code)
    return None


# ── Fake dB: not findings a kid → the ownership/404 path everywhere ─────────

class NoKidDB:
    async def scalar(self, stmt):
        return None


# ── Fake dB: kid owned + at the story cap → exercises the static 429 ────────

class _EmptyResult:
    def all(self):
        return []


class CapDB:
    def __init__(self, cap):
        self.kid = Kid(id=uuid.uuid4(), profile_id=uuid.uuid4(), name="Cap Kid")
        self.cap = cap

    async def scalar(self, stmt):
        if hasattr(stmt, "column_descriptions"):
            ent = stmt.column_descriptions[0].get("entity")
            if ent is Kid:
                return self.kid
            if ent is Subscription:
                return None  # free plan → premium gate passes for band-1
        if "count(*)" in str(stmt.compile()):
            return self.cap
        return None

    async def execute(self, stmt):
        return _EmptyResult()

    async def commit(self):
        pass


class _FakeProfile:
    id = uuid.uuid4()


def ev(kid_id):
    return ProgressEventIn(kid_id=kid_id, skill_id="count-1-10", game_id="tower-tap", correct=True)


def story(kid_id):
    return LearningStoryIn(kid_id=kid_id, skill_id="count-1-10", game_id="count-1-10-game", outcome=True)


def accel(kid_id):
    return AccelerationIn(kid_id=kid_id, skill_id="count-1-10", reason="easy", band_from=1, band_to=2)


async def _run():
    print("①  #1855 — every kid 404 is the static 'Kid not found'…")
    db = NoKidDB()
    who = uuid.uuid4()

    e = await expect_detail(
        "record_progress missing kid",
        P.record_progress(ProgressBatchIn(events=[ev(who)]), profile=_FakeProfile(), db=db),
        404, "Kid not found",
    )
    check("record_progress 404 raised", e is not None, True)

    e = await expect_detail(
        "record_stories missing kid",
        P.record_stories([story(who)], profile=_FakeProfile(), db=db),
        404, "Kid not found",
    )
    check("record_stories 404 raised", e is not None, True)

    e = await expect_detail(
        "record_acceleration missing kid",
        P.record_acceleration([accel(who)], profile=_FakeProfile(), db=db),
        404, "Kid not found",
    )
    check("record_acceleration 404 raised", e is not None, True)

    # The read endpoints all resolve through the same _get_owned_kid helper.
    e = await expect_detail(
        "get_mastery missing kid",
        P.get_mastery(who, _FakeProfile(), db, _rl=None),
        404, "Kid not found",
    )
    e = await expect_detail(
        "get_kid_snapshot missing kid",
        P.get_kid_snapshot(who, _FakeProfile(), db, _rl=None),
        404, "Kid not found",
    )
    e = await expect_detail(
        "get_stories missing kid",
        P.get_stories(who, profile=_FakeProfile(), db=db, _rl=None),
        404, "Kid not found",
    )
    e = await expect_detail(
        "story_stats missing kid",
        P.story_stats(who, _FakeProfile(), db, _rl=None),
        404, "Kid not found",
    )
    e = await expect_detail(
        "get_acceleration missing kid",
        P.get_acceleration(who, _FakeProfile(), db, _rl=None),
        404, "Kid not found",
    )

    print("②  #1855 — story-cap 429 is STATIC (no count/cap leak in the body)…")
    cap_db = CapDB(cap=1000)
    e = await expect_detail(
        "at-cap batch → 429",
        P.record_stories([story(cap_db.kid.id)], profile=_FakeProfile(), db=cap_db),
        429, "Story cap reached — prune before adding more",
    )
    check("429 body does NOT leak the live count", e is not None and "1000" not in str(e.detail), True)
    check("429 body does NOT leak the kid id", e is not None and str(cap_db.kid.id) not in str(e.detail), True)

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES: {fails}")
        sys.exit(1)
    print("✓ all #1855 progress error-message checks passed")


if __name__ == "__main__":
    import asyncio

    asyncio.run(_run())