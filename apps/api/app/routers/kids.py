"""Kid routes — settings, activity feed, weak skills, weekly report.

#1536 notification taxonomy (the weekly payload's `trigger` field is one of
these, and notification senders key on it to choose a message kind):
  · weekly-summary — the default blended 7-day aggregate (rounds, accuracy,
    minutes, mastered count, coins).
  · milestone      — a discrete win: a new mastery today/this week, or a
    streak crossing a 7-day boundary.
  · reminder/alert — a nudge: zero play this week (or another low-activity
    state a parent should see). Aggregate-only; never raw answers.
"""

import logging
import uuid
from datetime import date, datetime, timedelta, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, delete, func, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_profile
from ..models import (
    AccelerationLog,
    ContentItem,
    Kid,
    KidSettings,
    LearningStory,
    Profile,
    ProgressEvent,
    Skill,
    SkillMastery,
)
from ..ratelimit import read_rate_limit, rate_limit
from ..schemas import (
    ActivityOut,
    KidIn,
    KidOut,
    KidSettingsIn,
    KidSettingsOut,
    KidUpdateIn,
    ResetOut,
    WeakSkillOut,
    WeeklyDayOut,
    WeeklyOut,
)
# #1846/#1847 — the scene-key + title-resolution helpers live in shares.py (the
# share card already humanizes top_game); kids.py reuses them so the weekly card
# and the public share card can never drift apart.
from .shares import _humanize_game_id, _top_game_scene

router = APIRouter(prefix="/api/v1/kids", tags=["kids"])


def _occurred_at(e: ProgressEvent) -> datetime:
    """#1611/#3072 — the effective occurred-at instant of a progress event.

    Bucketing (weekly days, active-days, streak, activity ordering) uses the
    client-observed ``client_ts`` when present — an offline-delayed round is
    attributed to the day it HAPPENED, not the day it synced. For a legacy row
    with neither client_ts nor a resolvable integer ``timestamp`` (epoch ms,
    #1024), fall back to the server-stamped ``created_at``."""
    if e.client_ts is not None:
        return e.client_ts
    ts = getattr(e, "timestamp", None)
    if ts is not None:
        try:
            return datetime.fromtimestamp(ts / 1000.0, tz=timezone.utc)
        except (ValueError, OverflowError, OSError):
            pass
    return e.created_at


def _occurred_expr():
    """#3072 — SQL coalesce for the effective occurred-at instant.

    Mirrors ``_occurred_at`` for the query paths (activity ordering, weekly
    window, streak): prefer the client-observed ``client_ts``, else the integer
    epoch-ms ``timestamp`` (#1024, converted to timestamptz), else the
    server-stamped ``created_at``. A legacy row written with #1024's ``timestamp``
    but before #1611 added ``client_ts`` is still bucketed by its real play time,
    not its sync time."""
    return func.coalesce(
        ProgressEvent.client_ts,
        func.to_timestamp(ProgressEvent.timestamp / 1000.0),
        ProgressEvent.created_at,
    )


def _is_round(e: ProgressEvent) -> bool:
    """#1616 — a completed practice round (drives the rounds count + top_game).
    Engagement/telemetry rows (coins/quest/garden/challenge/session-*) are
    activity, NOT a practice round, and never count toward accuracy."""
    return e.kind in (None, "round")


def _is_attempt(e: ProgressEvent) -> bool:
    """#1613 — accuracy-parity denominator: completed rounds PLUS mid-round
    wrong taps (kind='wrong'). Without the wrong taps, a kid who tapped 8 wrong
    answers before solving read as 100% accuracy — the wrongs now count."""
    return e.kind in (None, "round", "wrong")


def _session_minutes(evs: list[ProgressEvent]) -> float:
    """#1618 — SESSION minutes from the client's session-minutes events
    (meta.minutes = elapsed wall-clock per play session). 0 when the client
    hasn't shipped session-minutes events yet."""
    total = 0.0
    for e in evs:
        if e.kind == "session-minutes":
            total += float((e.meta or {}).get("minutes") or 0)
    return total


def _weekly_minutes(evs: list[ProgressEvent]) -> float:
    """#1618 — the week's minutes-played: session minutes when the client sends
    them (the honest session-boundary definition), else the legacy #859
    response-time proxy (Σ response_ms over completed rounds)."""
    sm = _session_minutes(evs)
    if sm > 0:
        return round(sm, 1)
    return round(
        sum(e.response_ms or 0 for e in evs if _is_round(e)) / 60000.0,
        1,
    )

# #837 — write/destructive kid routes carry the account+IP durable fixed-window
# limiter (same as progress/stories/acceleration), so a breached token can't
# script profile-mutating calls. Reads stay auth-only (get_current_profile).
KID_WRITE_RATE_LIMIT = rate_limit()

# #3026 — server-side family-size cap. The portal only shows a soft, confirm-
# behind blocking warning (page.tsx:914-916), which a scripted or leaked-token
# caller can bypass to grow the roster without bound (and the portal then renders
# every kid in full on each load). Enforce a documented ceiling here so a
# breached token can't mint an unbounded family.
MAX_KIDS_PER_ACCOUNT = 12

# #1764 — expensive read endpoints in this router (activity up to 2000 rows,
# weekly aggregates + streak walk) get their OWN read-tier budget so a heavy
# reader can't starve the write tier or the DB pool.
KID_READ_RATE_LIMIT = read_rate_limit()


async def _get_owned_kid(
    kid_id: uuid.UUID,
    profile: Profile,
    db: AsyncSession,
    *,
    for_update: bool = False,
) -> Kid:
    """Resolve a kid the caller owns (consumer/parent scope only).

    Scopes to ``Kid.profile_id == profile.id`` — a parent manages exactly their
    own kids.

    #2985 — the former ``org_id`` parameter and its ``org_scoped`` branch were
    DEAD CODE: no kids-router route ever resolved or passed an org_id (a caller's
    X-Org-ID header was silently ignored on every kid route), so the documented
    "teacher/org-admin" path was unreachable and misleading. Org-scoped kid
    management lives in the admin router (ORG_SCOPED_MODELS / _org_scoped_get),
    not here — this router is the consumer/family surface. Removing the branch
    keeps the intent honest instead of promising a scope that never runs.

    #3100 — when ``for_update``, take a Postgres ``FOR UPDATE`` row lock on the
    Kid so this handler serializes against other writers for the same kid (e.g.
    reset vs /progress). The lock is held until the handler's commit.
    """
    stmt = select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id)
    if for_update:
        stmt = stmt.with_for_update()
    kid = await db.scalar(stmt)
    if not kid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    return kid


def _age_band_cap(birth_year: int | None, birth_month: int | None = None, birth_day: int | None = None) -> int | None:
    """#986/#1044/#2981 — derive the default max_band from the kid's birth date.

    This must MIRROR the kid app's `bandForAge` (apps/kid/src/lib/journey.ts)
    exactly: the server uses max_band to flag band_skipped progress, so a cap
    set BELOW the band the device places the kid in silently drops legit
    progress. The old ladder (age ≤6 → 2, ≤8 → 3, 9+ → None) sat under the
    client's mapping at ages 6 and 8 (client says 3 and 4) — a 6-year-old's
    band-3 round was skipped server-side even though the app had placed them
    there. Mapping 1:1 onto bandForAge makes the default cap the ceiling of
    the age's own surface (parent can still widen it via settings).

      age < 4  → 1, <6 → 2, <8 → 3, <10 → 4, <13 → 5, <14 → 6, 14+ → 8
      (band 7 is deliberately skipped for age placement, matching the client —
       Summit Peaks band 8 is where the oldest cohort lands by age.)

    #2981 — age is now MONTH/DAY-aware when a birth_month AND birth_day are both
    present (mirroring the kid app's `kidBand`: a kid born Dec 2019 is still 6 on
    Jan 1 2026 until their birthday, not 7 the moment the year flips). A year-only
    profile keeps the legacy calendar-year calc; a missing/zero/future year (or a
    month/day combination that makes the adjusted age negative) is clamped to the
    youngest surface, exactly like the kid app's `age < 0 → 1` fallback.

    None birth_year returns None (parent can set manually)."""
    if birth_year is None:
        return None
    today = date.today()
    age = today.year - birth_year
    if birth_month is not None and birth_day is not None:
        before_birthday = (today.month, today.day) < (birth_month, birth_day)
        if before_birthday:
            age -= 1
    if age < 0:
        # A future birth_year (or a just-now invalid month/day) shouldn't yield a
        # negative age → the kid app's `kidBand` maps that to band 1.
        age = 0
    if age < 4:
        return 1
    if age < 6:
        return 2
    if age < 8:
        return 3
    if age < 10:
        return 4
    if age < 13:
        return 5
    if age < 14:
        return 6
    # 14+ → band 8 (Summit Peaks). Mirrors the client's `Math.min(8, BANDS.length)`
    # with the catalog's current 8-band ceiling.
    return 8


@router.post("", response_model=KidOut, status_code=status.HTTP_201_CREATED)
async def create_kid(body: KidIn, profile: Profile = Depends(KID_WRITE_RATE_LIMIT), db: AsyncSession = Depends(get_db)):
    # #3026 — enforce the family-size cap SERVER-side (the portal's 8-kid
    # warning is a soft client hint). A scripted/leaked-token caller would
    # otherwise grow the roster without bound; reject the 13th kid with a 409
    # the client can surface as "contact support".
    existing = await db.scalar(select(func.count()).select_from(Kid).where(Kid.profile_id == profile.id))
    if existing is not None and existing >= MAX_KIDS_PER_ACCOUNT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Account already has {MAX_KIDS_PER_ACCOUNT} kids (the family-size limit)",
        )
    kid = Kid(
        profile_id=profile.id,
        name=body.name,
        avatar=body.avatar,
        birth_year=body.birth_year,
        birth_month=body.birth_month,
        birth_day=body.birth_day,
    )
    # #985 — stamp per-kid consent acknowledgment at creation
    kid.consent_version = "1.0"
    kid.consent_at = datetime.now(timezone.utc)
    kid.consent_method = "create_kid"
    # #986 — wire birth_year into an age-appropriate default max_band (parent
    # can override via settings). If birth_year suggests a very young kid, cap
    # the band so they're not dropped into hard content.
    cap = _age_band_cap(body.birth_year, body.birth_month, body.birth_day)
    if cap is not None:
        ks = KidSettings(kid_id=kid.id, max_band=cap)
        db.add(ks)
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
    profile: Profile = Depends(KID_WRITE_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    kid = await _get_owned_kid(kid_id, profile, db)
    # #1648 — distinguish 'omitted' from 'explicitly sent as null'. Pydantic's
    # `model_fields_set` records which keys the payload actually carried, so a
    # parent can CLEAR avatar/birth_year by sending an explicit null (the old
    # `if val is not None` guard treated null exactly like an omitted key and
    # silently ignored it — those fields could never be cleared via PATCH).
    # `name` is NOT NULL in the DB, so a sent-as-null name must NOT reach the
    # column (skip None for name only; avatar/birth_year clear on null).
    for field in ("name", "avatar", "birth_year", "birth_month", "birth_day"):
        if field not in body.model_fields_set:
            continue
        val = getattr(body, field)
        if val is None and field == "name":
            continue
        setattr(kid, field, val)
    # #1044/#2981 — a birth_date edit changes the age-derived default max_band,
    # so recompute the cap from the month/day-aware age. A kid created capped at
    # band 2 who is now 9+ must be cleared/raised to the new age's surface —
    # otherwise their legit progress keeps getting band_skipped server-side. Only
    # overwrite when the cap CHANGES so a parent who hand-widened settings after
    # creation isn't clobbered back to a narrower default on an unrelated field
    # edit (name/avatar). Recompute when ANY birth field was touched (year OR
    # month/day), since a month/day edit alone can move a kid across a band
    # boundary exactly like a year edit does.
    _birth_touched = "birth_year" in body.model_fields_set or {
        "birth_month",
        "birth_day",
    } & body.model_fields_set
    if body.birth_year is not None and _birth_touched:
        new_cap = _age_band_cap(
            body.birth_year,
            getattr(kid, "birth_month", None),
            getattr(kid, "birth_day", None),
        )
        s = await db.get(KidSettings, kid_id)
        if new_cap is None and s is not None:
            s.max_band = None
        elif new_cap is not None:
            if s is None:
                s = KidSettings(kid_id=kid_id)
                db.add(s)
            if s.max_band is None or new_cap > s.max_band:
                s.max_band = new_cap
    await db.commit()
    await db.refresh(kid)
    return kid


@router.delete("/{kid_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kid(kid_id: uuid.UUID, profile: Profile = Depends(KID_WRITE_RATE_LIMIT), db: AsyncSession = Depends(get_db)):
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


def _clamp_goal(goal: int | None, daily_cap: int | None, weekday_caps: str | None) -> int | None:
    """#256 — a gentle goal never exceeds the day's hard cap. Clamp to the flat
    `daily_limit_min` when set, else to the highest per-weekday cap, else keep
    it as-is (no cap configured → the goal is the only rule). 0/None = no goal."""
    if not goal or goal <= 0:
        return None
    if daily_cap and daily_cap > 0:
        return min(goal, daily_cap)
    if weekday_caps:
        vals = [int(v) for v in weekday_caps.split(",") if v.strip().isdigit()]
        mx = max(vals, default=0)
        if mx > 0:
            return min(goal, mx)
    return goal


@router.put("/{kid_id}/settings", response_model=KidSettingsOut)
async def put_kid_settings(
    kid_id: uuid.UUID,
    body: KidSettingsIn,
    profile: Profile = Depends(KID_WRITE_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_kid(kid_id, profile, db)
    # #3099 — the get-then-create was a TOCTOU: two concurrent PUTs on a kid with
    # no settings row both saw `db.get(...) is None` and both INSERTed the same
    # primary key, so one commit raised IntegrityError → 500. Materialise the row
    # atomically first (INSERT ... ON CONFLICT DO NOTHING — one writer wins, the
    # other becomes a no-op), then read-and-mutate; the row ALWAYS exists after
    # the guard, so the `db.get` below can only hit the update path.
    await db.execute(
        pg_insert(KidSettings)
        .values(kid_id=kid_id)
        .on_conflict_do_nothing(index_elements=[KidSettings.kid_id])
    )
    s = await db.get(KidSettings, kid_id)
    if s is None:  # defensive — the insert above guarantees a row in real PG
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
    # #248 — quiet hours schedule + softness (auto-soften, never block).
    s.quiet_enabled = body.quiet_enabled
    s.quiet_windows = body.quiet_windows
    s.quiet_dim = body.quiet_dim
    s.quiet_volume = body.quiet_volume
    s.voice_record_enabled = body.voice_record_enabled  # #138
    # #256 — clamp the gentle daily goal to the day's cap ("respects caps").
    s.goal_min = _clamp_goal(body.goal_min, body.daily_limit_min, body.weekday_limits_min)
    # #257 — curriculum focus pin: both halves together; a lone value clears it
    # ("clear default" = send null/null).
    if body.focus_subject and body.focus_band:
        s.focus_subject = body.focus_subject
        s.focus_band = body.focus_band
    else:
        s.focus_subject = None
        s.focus_band = None
    # #258 — per-kid VOICE preference: a known tone handle (or null for the
    # kid app's default warm-female) + a Web-Speech rate multiplier.
    _VOICE_TONES = {"female", "kid", "soft", "warm"}
    s.voice_tone = body.voice_tone if body.voice_tone in _VOICE_TONES else None
    s.voice_speed = body.voice_speed
    # #272 — SAFETY: parent kill-switch. Instant pause / resume, per kid.
    s.paused = body.paused
    # #1041/#1042 — parent-adjustable Moni strictness (the difficulty knob).
    # The Literal in KidSettingsIn already rejects bad values at the boundary;
    # the extra guard keeps a future non-Literal caller from tripping the DB
    # CheckConstraint (models.py ck_kid_settings_moni_strictness).
    if body.moni_strictness in {"gentle", "steady", "challenging"}:
        s.moni_strictness = body.moni_strictness
    # #1044 — per-subject difficulty deltas. Pydantic's validator already
    # clamps each value to ±2; assign the (possibly empty) dict as-is. Empty
    # or None clears the parent's per-subject choices.
    s.moni_subject_deltas = body.moni_subject_deltas or None
    await db.commit()
    await db.refresh(s)
    return s


@router.get("/{kid_id}/weak-skills", response_model=list[WeakSkillOut])
async def get_kid_weak_skills(
    kid_id: uuid.UUID,
    # #1644 — threshold is a mastery probability: bound it to [0, 1] at the
    # framework boundary so a caller can't pass threshold=-5 (returns EVERY
    # skill, mastered ones included, as 'weak') or threshold=999 (returns
    # none) and silently produce a misleading printable worksheet.
    threshold: float = Query(default=0.7, ge=0.0, le=1.0),
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
    _rl: Profile = Depends(KID_READ_RATE_LIMIT),
):
    """Recent rounds for a kid — newest first. The parent portal renders this
    as an activity feed ("played Fruit Tree, got it right") and, with a large
    limit, as the raw material for the client-side 12-month archive (#251)."""
    await _get_owned_kid(kid_id, profile, db)
    # #251 — cap raised 200 → 2000 so one fetch covers a full year of rounds.
    limit = max(1, min(limit, 2000))
    # #1611 — order by the client-observed occurred_at (coalesced to created_at)
    # so an offline-delayed round sits where it HAPPENED, not where it synced.
    result = await db.scalars(
        select(ProgressEvent)
        .where(ProgressEvent.kid_id == kid_id)
        .order_by(
            _occurred_expr().desc(),
            ProgressEvent.id.desc(),
        )
        .limit(limit)
    )
    return list(result)


def _weekly_trigger(
    *,
    mastered_today: list[str],
    mastered_this_week: list[str],
    streak: int,
    rounds: int,
) -> str:
    """#1536 — pick the strongest notification signal for the weekly payload.

    The value is a machine-readable hint ("weekly-summary" | "milestone" |
    "reminder"), not a message. Senders can branch on it while the payload stays
    aggregate-only (no raw answers)."""
    if rounds == 0:
        return "reminder"
    if mastered_today or mastered_this_week or (streak > 0 and streak % 7 == 0):
        return "milestone"
    return "weekly-summary"


@router.get("/{kid_id}/weekly", response_model=WeeklyOut)
async def get_kid_weekly(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
    _rl: Profile = Depends(KID_READ_RATE_LIMIT),
):
    """7-day learning report for a parent — the "show me my kid actually
    learned this week" card. Aggregates round events + mastery crossings.
    Times are UTC; weekly bucketing uses the client-observed instant
    (client_ts, #1611) so an offline-delayed round counts on the day it was
    actually played, falling back to the server-stamped created_at."""
    owned = await _get_owned_kid(kid_id, profile, db)
    # #857 — events are stamped `datetime.now(timezone.utc)` server-side, so the
    # week window and "today" must derive from UTC too. A naive `date.today()`
    # would shift the 7-day window and "mastered today" on a non-UTC host.
    now = datetime.now(timezone.utc).date()
    start = now - timedelta(days=6)
    # #906 — timestamp columns are timezone-aware; bind the window as an aware
    # UTC datetime so the comparison matches the stored values.
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)

    events = (
        await db.scalars(
            select(ProgressEvent).where(
                ProgressEvent.kid_id == kid_id,
                # #1611/#3072 — window on the client-observed instant when
                # present (client_ts, else the epoch-ms timestamp) so a round
                # played Sunday but synced Tuesday lands in Sunday.
                _occurred_expr() >= start_dt,
            )
        )
    ).all()

    round_events = [e for e in events if _is_round(e)]
    # #1613 — accuracy denominator includes wrong-tap events (kind='wrong') so
    # the weekly accuracy reflects real struggle, not just solved rounds.
    attempt_events = [e for e in events if _is_attempt(e)]
    rounds = len(round_events)
    correct = sum(1 for e in round_events if e.correct)
    # #1618 — SESSION minutes (Σ session-minutes meta.minutes); legacy #859
    # response-time proxy only when the client hasn't shipped session events.
    minutes = _weekly_minutes(events)
    by_day: dict[date, list[ProgressEvent]] = {}
    for e in events:
        d = _occurred_at(e).date()
        by_day.setdefault(d, []).append(e)
    days = []
    for i in range(7):
        d = start + timedelta(days=i)
        ev = by_day.get(d, [])
        days.append(
            WeeklyDayOut(
                date=d.isoformat(),
                # #1616 — day rounds count completed practice rounds only.
                rounds=sum(1 for x in ev if _is_round(x)),
                # #1618 — same session-minutes definition per day.
                minutes=_weekly_minutes(ev),
            )
        )
    active_days = sum(1 for ev in by_day.values() if ev)
    # #1846 — aggregate by SCENE key so shared-scene tiers (CountPop/FruitAdd)
    # count as ONE favorite instead of fragmenting the week into per-tier counts.
    hit = _top_game_scene(round_events)
    top_game = None
    if hit:
        # #1847 — resolve the winning scene to a catalog TITLE (the weekly card
        # should read "Fruit Basket", not "game-fruitadd-10"). A representative
        # raw id inside the scene feeds the same ContentItem lookup + humanize
        # fallback the share card uses (shares.py), so both surfaces agree.
        _scene, rep_id = hit
        title = await db.scalar(
            select(ContentItem.title).where(
                ContentItem.id == rep_id,
                ContentItem.kind == "game",
            )
        )
        top_game = title or _humanize_game_id(rep_id)

    # #4 — 🔥 current streak: consecutive calendar days with ≥1 round, ending
    # today, or yesterday when today isn't played yet (the streak stays alive
    # until the day ends). Walks the FULL history (distinct dates only — cheap)
    # so streaks longer than the 7-day window still count.
    played_dates = set(
        (
            await db.execute(
                # #1611/#3072 — the streak counts the client-observed day
                # (coalesced client_ts → timestamp → created_at) so an
                # offline-delayed round keeps the streak alive on the day it was
                # actually played.
                select(
                    func.date(
                        func.timezone(
                            "UTC",
                            _occurred_expr(),
                        )
                    )
                )
                .where(ProgressEvent.kid_id == kid_id)
                .distinct()
            )
        ).scalars()
    )
    streak = 0
    cursor = now
    if cursor not in played_dates:
        cursor = now - timedelta(days=1)  # today quiet → streak can still be alive from yesterday
    while cursor in played_dates:
        streak += 1
        cursor -= timedelta(days=1)

    # #3034 — "mastered this week" = the FIRST crossing of ≥80% fell inside the
    # window (`mastered_at`, progress.py:229). A skill mastered months ago and
    # merely re-practiced this week must NOT read as "newly mastered" — its
    # mastered_at is old. Only for legacy rows with `mastered_at IS NULL` do we
    # fall back to the old "currently ≥80% AND last practiced this week" signal,
    # and only when that practice looked fresh enough to plausibly be a first
    # crossing (no stamp = we can't know, so keep the prior behavior).
    mastered = (
        await db.scalars(
            select(SkillMastery).where(
                SkillMastery.kid_id == kid_id,
                SkillMastery.mastery >= 0.8,
                or_(
                    SkillMastery.mastered_at >= start_dt,
                    and_(
                        SkillMastery.mastered_at.is_(None),
                        SkillMastery.last_practice >= start_dt,
                    ),
                ),
            )
        )
    ).all()
    mastered_ids = sorted(m.skill_id for m in mastered)

    # #244 — "mastered TODAY": ≥80% AND last practiced since UTC midnight.
    # Feeds the portal's daily play-summary headline without a second query
    # shape (the weekly fetch already carries it to the client). #857 — `now`
    # is the UTC calendar day, so this midnight matches the UTC-stamped events.
    today_start = datetime.combine(now, time.min, tzinfo=timezone.utc)
    mastered_today = (
        await db.scalars(
            select(SkillMastery).where(
                SkillMastery.kid_id == kid_id,
                SkillMastery.mastery >= 0.8,
                SkillMastery.last_practice >= today_start,
            )
        )
    ).all()
    mastered_today_ids = sorted(m.skill_id for m in mastered_today)

    trigger = _weekly_trigger(
        mastered_today=mastered_today_ids,
        mastered_this_week=mastered_ids,
        streak=streak,
        rounds=rounds,
    )

    # #3002 — consume the trigger: dispatch to this profile's stored push
    # subscriptions. Fire-safe and best-effort — a delivery failure (or an
    # entirely unconfigured VAPID) never affects the weekly response itself.
    try:
        await _dispatch_weekly_notifications(
            profile=profile,
            kid=owned,
            trigger=trigger,
            rounds=rounds,
            streak=streak,
            db=db,
        )
    except Exception as exc:  # never let a notification fail the report
        logging.getLogger("numberverse").warning(
            "weekly notification dispatch failed profile=%s error=%r",
            profile.id,
            exc,
        )

    return WeeklyOut(
        days=days,
        rounds=rounds,
        correct_pct=round(100 * correct / len(attempt_events)) if attempt_events else 0,
        minutes=minutes,
        active_days=active_days,
        mastered_this_week=mastered_ids,
        mastered_today=mastered_today_ids,
        top_game=top_game,
        streak=streak,
        coins=owned.coins or 0,
        trigger=trigger,
    )


# #3002 — the weekly `trigger` is the notification signal; this helper turns a
# freshly computed trigger into a per-subscription send so the stored push rows
# actually get consumed. It is best-effort and fire-safe: it never raises, logs
# per-endpoint failures, and returns a DeliverResult the caller (and tests) can
# inspect. See app/push_delivery.py.
async def _dispatch_weekly_notifications(
    *, profile: Profile, kid: Kid, trigger: str, rounds: int, streak: int, db: AsyncSession
):
    from ..models import PushSubscription
    from ..push_delivery import build_weekly_payload, send_notification

    subs = list(
        await db.scalars(
            select(PushSubscription).where(PushSubscription.profile_id == profile.id)
        )
    )
    if not subs:
        return None
    title, body, tag = build_weekly_payload(
        kid.display_name or "Your child", trigger=trigger, rounds=rounds, streak=streak
    )
    sent = 0
    failed = 0
    gone = 0
    not_configured = False
    for sub in subs:
        status = await send_notification(
            db=db,
            endpoint=sub.endpoint,
            title=title,
            body=body,
            tag=tag,
        )
        if status == "sent":
            sent += 1
        elif status == "gone":
            # #3012 — the push service answered 410/404: this subscription is
            # permanently dead (the browser dropped/rotated it). Stamp `gone_at`
            # so the scheduled stale-subscription sweep removes it; a future
            # sender stops re-failing on this endpoint.
            gone += 1
            sub.gone_at = datetime.now(timezone.utc)
        elif status == "failed":
            failed += 1
        else:  # not_configured (no VAPID) — nothing in flight
            not_configured = True
    if gone:
        await db.commit()
    return {"sent": sent, "failed": failed, "gone": gone, "not_configured": not_configured, "total": len(subs)}



# #858 — typed response model instead of an ad-hoc dict (schemas.ResetOut).
@router.post("/{kid_id}/reset", response_model=ResetOut, status_code=status.HTTP_200_OK)
async def reset_kid_progress(
    kid_id: uuid.UUID,
    profile: Profile = Depends(KID_WRITE_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    """Wipe a kid's mastery + round history + learning stories + acceleration
    log — "start fresh". Does NOT delete the kid or their settings.
    #981 — previously left LearningStory and AccelerationLog untouched,
    contradicting the 'start fresh' contract."""
    # #3100 — the four deletes below run in one transaction but previously did
    # NOT serialize against a concurrent /progress for the same kid, so a round
    # posted between the deletes and the commit survived, silently retaining
    # progress/events mid-reset. Take a FOR UPDATE lock on the Kid row first:
    # a concurrent /progress (which now also locks the Kid via _get_owned_kid
    # for_update) blocks until this reset commits, so the wipe is atomic vs
    # writers.
    await _get_owned_kid(kid_id, profile, db, for_update=True)
    await db.execute(delete(SkillMastery).where(SkillMastery.kid_id == kid_id))
    await db.execute(delete(ProgressEvent).where(ProgressEvent.kid_id == kid_id))
    await db.execute(delete(LearningStory).where(LearningStory.kid_id == kid_id))
    await db.execute(delete(AccelerationLog).where(AccelerationLog.kid_id == kid_id))
    # #1682 — story_embeddings rows key on story_id (no per-kid FK), so wiping
    # the learning_stories rows leaves orphan vectors unless swept. Same
    # idempotent orphan sweep the admin prune uses (#943).
    from ..story_embedding_model import HAVE_VECTOR, StoryEmbedding

    if HAVE_VECTOR and StoryEmbedding is not None:
        await db.execute(
            text(
                "DELETE FROM story_embeddings "
                "WHERE story_id NOT IN (SELECT id FROM learning_stories)"
            )
        )
    await db.commit()
    return ResetOut(reset=True, kid_id=str(kid_id))
