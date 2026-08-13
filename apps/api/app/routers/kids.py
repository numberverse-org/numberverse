import uuid
from collections import Counter
from datetime import date, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_profile
from ..models import Kid, KidSettings, Profile, ProgressEvent, Skill, SkillMastery
from ..schemas import (
    ActivityOut,
    KidIn,
    KidOut,
    KidSettingsIn,
    KidSettingsOut,
    KidUpdateIn,
    WeakSkillOut,
    WeeklyDayOut,
    WeeklyOut,
)

router = APIRouter(prefix="/api/v1/kids", tags=["kids"])


async def _get_owned_kid(kid_id: uuid.UUID, profile: Profile, db: AsyncSession) -> Kid:
    kid = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not kid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    return kid


@router.post("", response_model=KidOut, status_code=status.HTTP_201_CREATED)
async def create_kid(body: KidIn, profile: Profile = Depends(get_current_profile), db: AsyncSession = Depends(get_db)):
    kid = Kid(profile_id=profile.id, name=body.name, avatar=body.avatar, birth_year=body.birth_year)
    db.add(kid)
    await db.commit()
    await db.refresh(kid)
    return kid


@router.get("", response_model=list[KidOut])
async def list_kids(profile: Profile = Depends(get_current_profile), db: AsyncSession = Depends(get_db)):
    result = await db.scalars(select(Kid).where(Kid.profile_id == profile.id).order_by(Kid.created_at))
    return list(result)


@router.get("/{kid_id}", response_model=KidOut)
async def get_kid(kid_id: uuid.UUID, profile: Profile = Depends(get_current_profile), db: AsyncSession = Depends(get_db)):
    return await _get_owned_kid(kid_id, profile, db)


@router.patch("/{kid_id}", response_model=KidOut)
async def update_kid(
    kid_id: uuid.UUID,
    body: KidUpdateIn,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    kid = await _get_owned_kid(kid_id, profile, db)
    for field, val in {"name": body.name, "avatar": body.avatar, "birth_year": body.birth_year}.items():
        if val is not None:
            setattr(kid, field, val)
    await db.commit()
    await db.refresh(kid)
    return kid


@router.delete("/{kid_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kid(kid_id: uuid.UUID, profile: Profile = Depends(get_current_profile), db: AsyncSession = Depends(get_db)):
    kid = await _get_owned_kid(kid_id, profile, db)
    await db.delete(kid)
    await db.commit()


# ── Per-kid parent controls ────────────────────────────────────────────

@router.get("/{kid_id}/settings", response_model=KidSettingsOut)
async def get_kid_settings(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_kid(kid_id, profile, db)
    s = await db.get(KidSettings, kid_id)
    return s or KidSettingsOut()


@router.put("/{kid_id}/settings", response_model=KidSettingsOut)
async def put_kid_settings(
    kid_id: uuid.UUID,
    body: KidSettingsIn,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_kid(kid_id, profile, db)
    s = await db.get(KidSettings, kid_id)
    if s is None:
        s = KidSettings(kid_id=kid_id)
        db.add(s)
    s.enabled_subjects = body.enabled_subjects
    s.max_band = body.max_band
    s.daily_limit_min = body.daily_limit_min
    s.weekday_limits_min = body.weekday_limits_min  # #6 per-weekday caps
    s.tts_enabled = body.tts_enabled
    s.music_enabled = body.music_enabled
    # #243 — per-kid volume balance (0..1).
    s.voice_volume = body.voice_volume
    s.sfx_volume = body.sfx_volume
    s.music_volume = body.music_volume
    s.voice_record_enabled = body.voice_record_enabled  # #138
    await db.commit()
    await db.refresh(s)
    return s


@router.get("/{kid_id}/weak-skills", response_model=list[WeakSkillOut])
async def get_kid_weak_skills(
    kid_id: uuid.UUID,
    threshold: float = 0.7,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Skills the kid hasn't mastered yet (mastery < threshold), weakest first,
    joined with the catalog titles — powers the printable worksheet generator
    (#132). Parents get a "what to practice" sheet, offline-printable."""
    await _get_owned_kid(kid_id, profile, db)
    rows = (
        await db.execute(
            select(SkillMastery, Skill)
            .join(Skill, Skill.id == SkillMastery.skill_id)
            .where(SkillMastery.kid_id == kid_id, SkillMastery.mastery < threshold)
            .order_by(SkillMastery.mastery.asc())
        )
    ).all()
    return [
        WeakSkillOut(
            skill_id=sm.skill_id,
            band=sk.band,
            subject=sk.subject,
            title=sk.title,
            title_bn=sk.title_bn,
            description=sk.description,
            mastery=sm.mastery,
            attempts=sm.attempts,
            correct=sm.correct,
        )
        for sm, sk in rows
    ]


@router.get("/{kid_id}/activity", response_model=list[ActivityOut])
async def get_kid_activity(
    kid_id: uuid.UUID,
    limit: int = 50,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Recent rounds for a kid — newest first. The parent portal renders this
    as an activity feed ("played Fruit Tree, got it right")."""
    await _get_owned_kid(kid_id, profile, db)
    limit = max(1, min(limit, 200))
    result = await db.scalars(
        select(ProgressEvent)
        .where(ProgressEvent.kid_id == kid_id)
        .order_by(ProgressEvent.id.desc())
        .limit(limit)
    )
    return list(result)


@router.get("/{kid_id}/weekly", response_model=WeeklyOut)
async def get_kid_weekly(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """7-day learning report for a parent — the "show me my kid actually
    learned this week" card. Aggregates round events + mastery crossings.
    Times are UTC (events are stamped server-side), dates are calendar days."""
    await _get_owned_kid(kid_id, profile, db)
    now = date.today()
    start = now - timedelta(days=6)

    events = (
        await db.scalars(
            select(ProgressEvent).where(
                ProgressEvent.kid_id == kid_id,
                ProgressEvent.created_at >= start,
            )
        )
    ).all()

    rounds = len(events)
    correct = sum(1 for e in events if e.correct)
    minutes = round(sum(e.response_ms or 0 for e in events) / 60000.0, 1)
    by_day: dict[date, list[ProgressEvent]] = {}
    for e in events:
        d = e.created_at.date()
        by_day.setdefault(d, []).append(e)
    days = []
    for i in range(7):
        d = start + timedelta(days=i)
        ev = by_day.get(d, [])
        days.append(
            WeeklyDayOut(
                date=d.isoformat(),
                rounds=len(ev),
                minutes=round(sum(x.response_ms or 0 for x in ev) / 60000.0, 1),
            )
        )
    active_days = sum(1 for ev in by_day.values() if ev)
    games = Counter(e.game_id for e in events)
    top_game = games.most_common(1)[0][0] if games else None

    # "mastered this week" = currently ≥80% AND last practiced inside the window
    mastered = (
        await db.scalars(
            select(SkillMastery).where(
                SkillMastery.kid_id == kid_id,
                SkillMastery.mastery >= 0.8,
                SkillMastery.last_practice >= start,
            )
        )
    ).all()
    mastered_ids = sorted(m.skill_id for m in mastered)

    return WeeklyOut(
        days=days,
        rounds=rounds,
        correct_pct=round(100 * correct / rounds) if rounds else 0,
        minutes=minutes,
        active_days=active_days,
        mastered_this_week=mastered_ids,
        top_game=top_game,
    )


@router.post("/{kid_id}/reset", status_code=status.HTTP_200_OK)
async def reset_kid_progress(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Wipe a kid's mastery + round history — "start fresh". Does NOT delete
    the kid or their settings."""
    await _get_owned_kid(kid_id, profile, db)
    await db.execute(delete(SkillMastery).where(SkillMastery.kid_id == kid_id))
    await db.execute(delete(ProgressEvent).where(ProgressEvent.kid_id == kid_id))
    await db.commit()
    return {"reset": True, "kid_id": str(kid_id)}
