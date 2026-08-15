import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..bandlock import skill_band_allowed
from ..config import settings
from ..db import get_db
from ..deps import get_current_profile, org_scoped, resolve_org_id
from ..models import AccelerationLog, ConfigEntry, Kid, KidSettings, LearningStory, ProgressEvent, Profile, SkillMastery
from ..ratelimit import rate_limit
from ..schemas import AccelerationIn, AccelerationOut, KidSnapshotOut, LearningStoryIn, LearningStoryOut, MasteryOut, ProgressBatchIn, StoryStatsOut
from ..scrub import redact_context
from ..seed import SKILLS_SEED

# #274 — write endpoints are the abuse surface (bulk story/progress replay). The
# limiter keys on account+IP and is far above real sync cadence (see ratelimit.py).
WRITE_RATE_LIMIT = rate_limit()

# #834 — bulk story/acceleration endpoints take a raw list body, so the schema
# has no place to cap length. The client documents ~40 per sync; 100 keeps >2x
# headroom while stopping unbounded batch replay.
MAX_BATCH_SIZE = 100

# #275 — age-appropriate band lock (SERVER side). The client already locks worlds
# above the parent's `max_band`; this is the enforcement layer so a tampered or
# buggy client can NEVER persist progress/stories for content beyond the cap.
# skill_id → band, from the seed (the same catalog the client ships — the audit
# gate keeps them in sync).
SKILL_BANDS: dict[str, int] = {row[0]: row[1] for row in SKILLS_SEED}


async def _load_band_caps(db: AsyncSession, kid_ids: set[uuid.UUID]) -> dict[uuid.UUID, int | None]:
    """Load each kid's configured max_band (None = no cap). One query per batch."""
    if not kid_ids:
        return {}
    rows = await db.execute(
        select(KidSettings.kid_id, KidSettings.max_band).where(KidSettings.kid_id.in_(kid_ids))
    )
    return {kid_id: max_band for kid_id, max_band in rows.all()}


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


async def _get_owned_kid(
    kid_id: uuid.UUID,
    profile: Profile,
    db: AsyncSession,
    org_id: uuid.UUID | None = None,
) -> Kid:
    """#962 — resolve a kid the caller owns, scoped to profile and optionally org."""
    stmt = select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id)
    stmt = org_scoped(stmt, org_id)
    kid = await db.scalar(stmt)
    if not kid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    return kid


# #853 — this handler is fully synchronous and commits before returning, so the
# response is the imperative result (200), not a queued acknowledgement (202).
@router.post("/progress", status_code=status.HTTP_200_OK)
async def record_progress(
    body: ProgressBatchIn,
    profile: Profile = Depends(WRITE_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    params = await _adaptive_params(db)
    kid_ids = {e.kid_id for e in body.events}
    for kid_id in kid_ids:
        owned = await _get_owned_kid(kid_id, profile, db)
        if not owned:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Kid {kid_id} not found")

    # #275 — band lock: drop events for skills beyond the kid's max_band (or any
    # skill we can't verify when a cap is set). Never lets a capped kid persist
    # out-of-band progress, even from a tampered client.
    # #1026 — report the dropped uids so the client can REQUEUE (not clear) the
    # band-skipped rounds: a stale catalog / parent-lowered-cap must surface as a
    # stuck outbox, never silent permanent loss.
    caps = await _load_band_caps(db, kid_ids)
    events = []
    band_skipped_uids: list[str] = []
    for e in body.events:
        if skill_band_allowed(e.skill_id, SKILL_BANDS, caps.get(e.kid_id)):
            events.append(e)
        elif e.uid is not None:
            band_skipped_uids.append(e.uid)
    band_skipped = len(body.events) - len(events)

    duplicates_skipped = 0
    if events:
        rows = [
            {
                "kid_id": e.kid_id,
                # #1023 — the client's durable-outbox uid. A None uid defeats
                # Postgres unique-constraint dedup (NULLs are distinct), so
                # synthesize one server-side (#942 pattern) — dedup must hold
                # for EVERY row.
                "uid": e.uid if e.uid is not None else str(uuid.uuid4()),
                "skill_id": e.skill_id,
                "game_id": e.game_id,
                "correct": e.correct,
                "response_ms": e.response_ms,
                "difficulty": e.difficulty,
                # #1024 — preserve the client round timestamp (was dropped).
                "timestamp": e.timestamp,
            }
            for e in events
        ]
        stmt = pg_insert(ProgressEvent).values(rows)
        stmt = stmt.on_conflict_do_nothing(index_elements=["kid_id", "uid"]).returning(
            ProgressEvent.kid_id, ProgressEvent.skill_id, ProgressEvent.correct
        )
        result = await db.execute(stmt)
        inserted = result.all()
        duplicates_skipped = len(events) - len(inserted)

        # BKT mastery update runs ONLY for genuinely-new events — a replayed
        # batch (lost ACK → same uid re-posted) is a silent no-op here, so
        # mastery is never double-counted.
        for kid_id, skill_id, correct in inserted:
            sm = await db.get(SkillMastery, (kid_id, skill_id))
            if sm is None:
                sm = SkillMastery(
                    kid_id=kid_id,
                    skill_id=skill_id,
                    mastery=0.0,
                    correct=0,
                    attempts=0,
                    streak=0,
                )
                db.add(sm)
            prev_mastery = sm.mastery
            sm.mastery = _bkt_update(sm.mastery, correct, **params)
            sm.correct = sm.correct + (1 if correct else 0)
            sm.attempts = sm.attempts + 1
            sm.streak = sm.streak + 1 if correct else 0
            sm.last_practice = datetime.now(timezone.utc)
            sm.last_decay = datetime.now(timezone.utc)
            # #79 — stamp the FIRST crossing of ≥80% once (never overwritten). The
            # parent portal's mastery timeline sorts skills by this moment.
            if sm.mastered_at is None and prev_mastery < 0.8 and sm.mastery >= 0.8:
                sm.mastered_at = datetime.now(timezone.utc)

    # #9 — multi-device sync: newest-wins coin wallet. The server keeps the max
    # coin balance ever reported per kid (aggregate only — no voice/face).
    # #911 — the old read-then-write (`get`, compare, assign) could lose a
    # concurrent update; GREATEST is evaluated atomically in Postgres.
    if body.coins:
        for kid_id in kid_ids:
            coin = body.coins.get(str(kid_id))
            if coin is None:
                continue
            await db.execute(
                update(Kid)
                .where(Kid.id == kid_id, Kid.profile_id == profile.id)
                .values(coins=func.greatest(func.coalesce(Kid.coins, 0), coin))
            )

    await db.commit()
    return {
        "recorded": len(events) - duplicates_skipped,
        "duplicates_skipped": duplicates_skipped,
        "band_skipped": band_skipped,
        # #1026 — uids the client must keep queued (band-locked, never recorded).
        "band_skipped_uids": band_skipped_uids,
    }


@router.get("/kids/{kid_id}/mastery", response_model=list[MasteryOut])
async def get_mastery(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    owned = await _get_owned_kid(kid_id, profile, db)
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
            mastered_at=m.mastered_at,
            last_practice=m.last_practice,
            last_decay=m.last_decay,
        )
        for m in result
    ]


@router.get("/kids/{kid_id}/snapshot", response_model=KidSnapshotOut)
async def get_kid_snapshot(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """#9 — multi-device sync: the aggregate profile a SECOND device restores a
    kid from after the parent signs in. E2E-friendly by construction — mastery
    + coins only, never voice/face/raw answers. Conflict resolution is
    newest-wins on the client (more accumulated corrects / higher coins win)."""
    owned = await _get_owned_kid(kid_id, profile, db)
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    mastery = await db.scalars(
        select(SkillMastery).where(SkillMastery.kid_id == kid_id).order_by(SkillMastery.skill_id)
    )
    return KidSnapshotOut(
        kid_id=kid_id,
        name=owned.name,
        avatar=owned.avatar,
        coins=owned.coins or 0,
        mastery=[
            MasteryOut(
                skill_id=m.skill_id,
                mastery=round(_clamp01(m.mastery), 4),
                correct=m.correct,
                attempts=m.attempts,
                streak=m.streak,
                mastered_at=m.mastered_at,
                last_practice=m.last_practice,
                last_decay=m.last_decay,
            )
            for m in mastery
        ],
    )


# ── KOTHA (কথা) — RAG knowledge lake ──────────────────────────────────────────

# #853 — same synchronous-commit contract as /progress: 200, not 202 — the body
# is the imperative result.
@router.post("/stories", status_code=status.HTTP_200_OK)
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
    if len(body) > MAX_BATCH_SIZE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Too many stories in batch (max {MAX_BATCH_SIZE})",
        )
    kid_ids = {s.kid_id for s in body}
    for kid_id in kid_ids:
        owned = await _get_owned_kid(kid_id, profile, db)
        if not owned:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Kid {kid_id} not found")

    # #275 — band lock on stories too: a capped kid must not accumulate learning
    # moments for out-of-band skills (same rule as /progress).
    # #1026 — report the dropped uids so the client requeues (never clears).
    caps = await _load_band_caps(db, kid_ids)
    stories = []
    band_skipped_uids: list[str] = []
    for s in body:
        if skill_band_allowed(s.skill_id, SKILL_BANDS, caps.get(s.kid_id)):
            stories.append(s)
        elif s.uid is not None:
            band_skipped_uids.append(s.uid)
    band_skipped = len(body) - len(stories)

    # #950 — server-side per-kid backlog cap. If any kid already has >=
    # kotha_max_stories_per_kid stories, reject the entire batch (the client
    # must wait for a prune run before storing more). This prevents an
    # adversarial or buggy client from flooding the table past the configured
    # cap even when the per-hour rate limit hasn't tripped.
    cap = settings.kotha_max_stories_per_kid
    for kid_id in kid_ids:
        current_count = await db.scalar(
            select(func.count()).select_from(LearningStory).where(LearningStory.kid_id == kid_id)
        )
        if current_count is not None and current_count >= cap:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Kid {kid_id} already has {current_count} stories "
                f"(max {cap}). Prune before adding more.",
            )

    rows = [
        {
            "kid_id": s.kid_id,
            # #942 — a None uid defeats Postgres unique-constraint dedup
            # (NULLs are treated as distinct). Server-generate a synthetic uid
            # for every story that arrives without one so dedup works for all rows.
            "uid": s.uid if s.uid is not None else str(uuid.uuid4()),
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
        for s in stories
    ]
    stmt = pg_insert(LearningStory).values(rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=["kid_id", "uid"])
    result = await db.execute(stmt)
    await db.commit()
    inserted = result.rowcount if result.rowcount is not None else len(rows)
    return {
        "recorded": inserted,
        "duplicates_skipped": len(rows) - inserted,
        "band_skipped": band_skipped,
        # #1026 — uids the client must keep queued (band-locked, never recorded).
        "band_skipped_uids": band_skipped_uids,
    }


# #853 — same synchronous-commit contract as /progress: 200, not 202 — the body
# is the imperative result.
@router.post("/acceleration", status_code=status.HTTP_200_OK)
async def record_acceleration(
    body: list[AccelerationIn],
    profile: Profile = Depends(WRITE_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    """🚀 #249 — persist a kid's "skipped ahead" entries (the acceleration plan).

    Fire-and-forget from the kid app, same contract as /stories: ownership
    checked per kid, band-lock applied, and dedup on the client's durable-outbox
    uid so a replayed batch (lost ACK) is a silent no-op."""
    if len(body) > MAX_BATCH_SIZE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Too many acceleration entries in batch (max {MAX_BATCH_SIZE})",
        )
    kid_ids = {a.kid_id for a in body}
    for kid_id in kid_ids:
        owned = await _get_owned_kid(kid_id, profile, db)
        if not owned:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Kid {kid_id} not found")

    # #275 — band lock: a capped kid can't log skips beyond their max_band either.
    caps = await _load_band_caps(db, kid_ids)
    rows = [
        {
            "kid_id": a.kid_id,
            "uid": a.uid,
            "skill_id": a.skill_id,
            "reason": a.reason,
            "band_from": a.band_from,
            "band_to": a.band_to,
        }
        for a in body
        if skill_band_allowed(a.skill_id, SKILL_BANDS, caps.get(a.kid_id))
    ]
    band_skipped = len(body) - len(rows)
    if rows:
        stmt = pg_insert(AccelerationLog).values(rows)
        stmt = stmt.on_conflict_do_nothing(index_elements=["kid_id", "uid"])
        result = await db.execute(stmt)
        await db.commit()
        inserted = result.rowcount if result.rowcount is not None else len(rows)
    else:
        inserted = 0
    return {"recorded": inserted, "duplicates_skipped": len(rows) - inserted, "band_skipped": band_skipped}


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
    owned = await _get_owned_kid(kid_id, profile, db)
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    limit = min(max(limit, 1), 500)
    offset = max(offset, 0)
    q = _story_filters(kid_id, skill_id, error_kind, action, misconception_code)
    result = await db.scalars(q.order_by(LearningStory.created_at.desc()).limit(limit).offset(offset))
    return list(result)


# #860 — sibling routes grouped: /kids/{kid_id}/stories/stats lives right after
# /kids/{kid_id}/stories (the parent list), before /acceleration.
# #858 — response_model keeps the counts shape stable instead of an ad-hoc dict.
@router.get("/kids/{kid_id}/stories/stats", response_model=StoryStatsOut)
async def story_stats(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Kotha counts — the shape of a kid's learning. Returns total stories plus
    counts grouped by skill, error kind and misconception code, so the app can
    surface "this kid keeps confusing tens and ones" without paging through rows."""
    owned = await _get_owned_kid(kid_id, profile, db)
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
    return StoryStatsOut(
        total=total or 0,
        by_skill={r[0]: r[1] for r in by_skill.all()},
        by_error_kind={r[0]: r[1] for r in by_error.all()},
        by_misconception={r[0]: r[1] for r in by_mis.all()},
    )


@router.get("/kids/{kid_id}/acceleration", response_model=list[AccelerationOut])
async def get_acceleration(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """🚀 #249 — the kid's acceleration plan: every "skipped ahead" entry (newest
    first), with the reason and the band jump. The parent portal renders this
    card offline from the already-fetched payload."""
    owned = await _get_owned_kid(kid_id, profile, db)
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    result = await db.scalars(select(AccelerationLog).where(AccelerationLog.kid_id == kid_id).order_by(AccelerationLog.created_at.desc()))
    return list(result)


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
