import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_profile
from ..models import ConfigEntry, Kid, LearningStory, ProgressEvent, Profile, SkillMastery
from ..ratelimit import rate_limit
from ..schemas import LearningStoryIn, LearningStoryOut, MasteryOut, ProgressBatchIn
from ..scrub import redact_context

# #274 — write endpoints are the abuse surface (bulk story/progress replay). The
# limiter keys on account+IP and is far above real sync cadence (see ratelimit.py).
WRITE_RATE_LIMIT = rate_limit()


def _bkt_update(mastery: float, correct: bool, p_learn=0.10, p_guess=0.15, p_slip=0.10) -> float:
    p = mastery
    p_correct = p * (1 - p_slip) + (1 - p) * p_guess
    if p_correct <= 0:
        return p
    p_given = (p * (1 - p_slip)) / p_correct if correct else (p * p_slip) / (1 - p_correct)
    p_given = min(1.0, max(0.0, p_given))
    return min(1.0, p_given + (1 - p_given) * p_learn)


def _clamp01(n: float) -> float:
    return min(1.0, max(0.0, n))


async def _adaptive_params(db: AsyncSession) -> dict:
    cfg = await db.get(ConfigEntry, "adaptive")
    if cfg:
        v = cfg.value
        return {
            "p_learn": v.get("pLearn", 0.10),
            "p_guess": v.get("pGuess", 0.15),
            "p_slip": v.get("pSlip", 0.10),
        }
    return {"p_learn": 0.10, "p_guess": 0.15, "p_slip": 0.10}


router = APIRouter(prefix="/api/v1", tags=["progress"])


@router.post("/progress", status_code=status.HTTP_202_ACCEPTED)
async def record_progress(
    body: ProgressBatchIn,
    profile: Profile = Depends(WRITE_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    params = await _adaptive_params(db)
    kid_ids = {e.kid_id for e in body.events}
    for kid_id in kid_ids:
        owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
        if not owned:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Kid {kid_id} not found")

    for e in body.events:
        db.add(
            ProgressEvent(
                kid_id=e.kid_id,
                skill_id=e.skill_id,
                game_id=e.game_id,
                correct=e.correct,
                response_ms=e.response_ms,
                difficulty=e.difficulty,
            )
        )
        # Upsert + BKT update mastery
        sm = await db.get(SkillMastery, (e.kid_id, e.skill_id))
        if sm is None:
            sm = SkillMastery(
                kid_id=e.kid_id,
                skill_id=e.skill_id,
                mastery=0.0,
                correct=0,
                attempts=0,
                streak=0,
            )
            db.add(sm)
        sm.mastery = _bkt_update(sm.mastery, e.correct, **params)
        sm.correct = sm.correct + (1 if e.correct else 0)
        sm.attempts = sm.attempts + 1
        sm.streak = sm.streak + 1 if e.correct else 0
        sm.last_practice = datetime.now(timezone.utc)
        sm.last_decay = datetime.now(timezone.utc)

    await db.commit()
    return {"recorded": len(body.events)}


@router.get("/kids/{kid_id}/mastery", response_model=list[MasteryOut])
async def get_mastery(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    result = await db.scalars(select(SkillMastery).where(SkillMastery.kid_id == kid_id).order_by(SkillMastery.skill_id))
    return [
        MasteryOut(
            skill_id=m.skill_id,
            mastery=round(_clamp01(m.mastery), 4),
            correct=m.correct,
            attempts=m.attempts,
            streak=m.streak,
        )
        for m in result
    ]


# ── KOTHA (কথা) — RAG knowledge lake ──────────────────────────────────────────

@router.post("/stories", status_code=status.HTTP_202_ACCEPTED)
async def record_stories(
    body: list[LearningStoryIn],
    profile: Profile = Depends(WRITE_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    """Persist learning moments as Kotha stories (including Moni's diagnoses).

    Fire-and-forget from the kid app: the client sends a small batch of stories
    each sync, we verify ownership, store them, and return the count.

    Dedup (#331): every story carries the client's durable-outbox `uid`. We
    INSERT ... ON CONFLICT DO NOTHING on (kid_id, uid), so a replayed batch
    (lost ACK → same uid re-posted) is a silent no-op instead of a duplicate.
    The response reports how many were actually new vs skipped as duplicates."""
    kid_ids = {s.kid_id for s in body}
    for kid_id in kid_ids:
        owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
        if not owned:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Kid {kid_id} not found")

    rows = [
        {
            "kid_id": s.kid_id,
            "uid": s.uid,
            "skill_id": s.skill_id,
            "game_id": s.game_id,
            "error_kind": s.error_kind,
            "misconception_code": s.misconception_code,
            "action": s.action,
            "outcome": s.outcome,
            "difficulty": s.difficulty,
            "response_ms": s.response_ms,
            "wrong_streak": s.wrong_streak,
            # #270 — redact PII-shaped strings in the context envelope BEFORE storage.
            "context": redact_context(s.context),
        }
        for s in body
    ]
    stmt = pg_insert(LearningStory).values(rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=["kid_id", "uid"])
    result = await db.execute(stmt)
    await db.commit()
    inserted = result.rowcount if result.rowcount is not None else len(body)
    return {"recorded": inserted, "duplicates_skipped": len(body) - inserted}


def _story_filters(kid_id: uuid.UUID, skill_id: str | None, error_kind: str | None, action: str | None, misconception_code: str | None):
    """Shared WHERE clause for Kotha story search — filter by skill, error kind,
    action or misconception code. None = no filter on that axis."""
    q = select(LearningStory).where(LearningStory.kid_id == kid_id)
    if skill_id:
        q = q.where(LearningStory.skill_id == skill_id)
    if error_kind:
        q = q.where(LearningStory.error_kind == error_kind)
    if action:
        q = q.where(LearningStory.action == action)
    if misconception_code:
        q = q.where(LearningStory.misconception_code == misconception_code)
    return q


@router.get("/kids/{kid_id}/stories", response_model=list[LearningStoryOut])
async def get_stories(
    kid_id: uuid.UUID,
    skill_id: str | None = None,
    error_kind: str | None = None,
    action: str | None = None,
    misconception_code: str | None = None,
    limit: int = 100,
    offset: int = 0,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Read a kid's Kotha stories (newest first). Filterable by skill, error
    kind, action and misconception code — the RAG search hook. Pass
    `skill_id` + `error_kind` to find a kid's recurring mistakes on a skill."""
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    limit = min(max(limit, 1), 500)
    offset = max(offset, 0)
    q = _story_filters(kid_id, skill_id, error_kind, action, misconception_code)
    result = await db.scalars(q.order_by(LearningStory.created_at.desc()).limit(limit).offset(offset))
    return list(result)


@router.get("/kids/{kid_id}/stories/stats")
async def story_stats(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Kotha counts — the shape of a kid's learning. Returns total stories plus
    counts grouped by skill, error kind and misconception code, so the app can
    surface "this kid keeps confusing tens and ones" without paging through rows."""
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")

    total = await db.scalar(select(func.count()).select_from(LearningStory).where(LearningStory.kid_id == kid_id))
    by_skill = await db.execute(
        select(LearningStory.skill_id, func.count()).where(LearningStory.kid_id == kid_id).group_by(LearningStory.skill_id)
    )
    by_error = await db.execute(
        select(LearningStory.error_kind, func.count())
        .where(LearningStory.kid_id == kid_id, LearningStory.error_kind.is_not(None))
        .group_by(LearningStory.error_kind)
    )
    by_mis = await db.execute(
        select(LearningStory.misconception_code, func.count())
        .where(LearningStory.kid_id == kid_id, LearningStory.misconception_code.is_not(None))
        .group_by(LearningStory.misconception_code)
    )
    return {
        "total": total or 0,
        "by_skill": {r[0]: r[1] for r in by_skill.all()},
        "by_error_kind": {r[0]: r[1] for r in by_error.all()},
        "by_misconception": {r[0]: r[1] for r in by_mis.all()},
    }


@router.get("/stories/aggregates")
async def story_aggregates(
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """📚 KOTHA cross-kid aggregates (#330) — 'what's everyone getting stuck on'.

    Built ONLY from stories of kids whose parent opted in (`aggregate_opt_in`),
    and the response carries ZERO kid identity: no names, no kid ids, no emails
    — just counts and rates. Give-to-get: a parent must be opted in to read.

    403 when the caller hasn't opted in (privacy wall, not an error)."""
    if not profile.aggregate_opt_in:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Enable 'share anonymized insights' to view class-level insights",
        )

    opted_kids = (
        select(Kid.id)
        .where(Kid.profile_id.in_(select(Profile.id).where(Profile.aggregate_opt_in.is_(True))))
        .scalar_subquery()
    )
    base = LearningStory.kid_id.in_(opted_kids)

    total = (await db.scalar(select(func.count()).select_from(LearningStory).where(base))) or 0
    contributing_kids = (
        await db.scalar(select(func.count(func.distinct(LearningStory.kid_id))).where(base))
    ) or 0
    correct = (await db.scalar(select(func.count()).select_from(LearningStory).where(base, LearningStory.outcome.is_(True)))) or 0

    mis_raw = await db.execute(
        select(LearningStory.misconception_code, func.count())
        .where(base, LearningStory.misconception_code.is_not(None))
        .group_by(LearningStory.misconception_code)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_misconceptions = [{"code": c, "count": n} for c, n in mis_raw.all()]

    err_raw = await db.execute(
        select(LearningStory.error_kind, func.count())
        .where(base, LearningStory.error_kind.is_not(None))
        .group_by(LearningStory.error_kind)
        .order_by(func.count().desc())
    )
    error_kind_distribution = [{"error_kind": e, "count": n} for e, n in err_raw.all()]

    skill_raw = await db.execute(
        select(LearningStory.skill_id, func.count())
        .where(base, LearningStory.outcome.is_(False))
        .group_by(LearningStory.skill_id)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_struggle_skills = [{"skill_id": s, "count": n} for s, n in skill_raw.all()]

    return {
        "contributing_kids": contributing_kids,
        "total_stories": total,
        "success_rate": round(correct / total, 4) if total else 0.0,
        "top_misconceptions": top_misconceptions,
        "error_kind_distribution": error_kind_distribution,
        "top_struggle_skills": top_struggle_skills,
        "note": "Aggregated from opted-in families only — no kid identity included.",
    }
