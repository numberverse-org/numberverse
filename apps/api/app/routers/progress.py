import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_profile
from ..models import ConfigEntry, Kid, LearningStory, ProgressEvent, Profile, SkillMastery
from ..schemas import LearningStoryIn, LearningStoryOut, MasteryOut, ProgressBatchIn


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
    profile: Profile = Depends(get_current_profile),
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
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Persist learning moments as Kotha stories (including Moni's diagnoses).

    Fire-and-forget from the kid app: the client sends a small batch of stories
    each sync, we verify ownership, store them, and return the count."""
    kid_ids = {s.kid_id for s in body}
    for kid_id in kid_ids:
        owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
        if not owned:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Kid {kid_id} not found")

    for s in body:
        db.add(
            LearningStory(
                kid_id=s.kid_id,
                skill_id=s.skill_id,
                game_id=s.game_id,
                error_kind=s.error_kind,
                misconception_code=s.misconception_code,
                action=s.action,
                outcome=s.outcome,
                difficulty=s.difficulty,
                response_ms=s.response_ms,
                wrong_streak=s.wrong_streak,
                context=s.context,
            )
        )
    await db.commit()
    return {"recorded": len(body)}


@router.get("/kids/{kid_id}/stories", response_model=list[LearningStoryOut])
async def get_stories(
    kid_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Read a kid's Kotha stories (newest first). This is the retrieval hook —
    the future RAG pipeline reads from here."""
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    limit = min(max(limit, 1), 500)
    offset = max(offset, 0)
    result = await db.scalars(
        select(LearningStory)
        .where(LearningStory.kid_id == kid_id)
        .order_by(LearningStory.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result)
