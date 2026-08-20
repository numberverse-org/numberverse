"""Privacy: parent-facing data export (#273).

A parent can download everything the API holds about their own family — kid
profiles, settings, mastery, every round, every learning story — as a readable
JSON document or a CSV of round history. Auth-protected exactly like every
other parent route (`get_current_profile`), ownership-checked at the query
level, and the response is a download attachment so nothing lands in browser
memory.

The serialization lives in `app/export_format.py` (dependency-free, CI-tested).
This router only wires the DB reads + download responses around it."""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..ratelimit import rate_limit
from ..export_format import (
    FORMAT,
    VERSION,
    iso,
    profile_meta,
    round_rows,
    serialize_kid,
    to_csv,
)
from ..models import (
    AccelerationLog,
    Kid,
    KidSettings,
    LearningStory,
    ParentEvent,
    Profile,
    ProgressEvent,
    SkillMastery,
)
from .import_data import router as import_data_router

router = APIRouter(prefix="/api/v1", tags=["export"])

# #838 — exports stream a family's entire history, so bound how often a
# (possibly breached) token may pull a heavy full export. Reuses the same
# account+IP durable fixed-window limiter as the write endpoints.
# #1768 — export/import get their OWN much smaller per-minute budgets. A full
# family history per request is the heaviest surface in the API, yet it used to
# cost the same single unit as a one-row kid read; now 10 full-family exports
# per minute per account+IP.
EXPORT_RATE_LIMIT = rate_limit(limit=10)

CSV_FIELDS = ["kid", "kid_id", "date", "skill_id", "game_id", "correct", "response_ms", "difficulty"]


def _attachment(filename: str) -> str:
    return f'attachment; filename="{filename}"'


def _safe_json_dumps(obj: dict) -> str:
    """#3083 — serialize export payloads as STRICT RFC-7159 JSON.

    `json.dumps` emits bare `NaN`/`Infinity` tokens by default (invalid JSON for
    strict consumers). The input schemas now reject them at the boundary, but a
    legacy row could still carry a non-finite float into the export; `allow_nan=
    False` makes that a hard error rather than emitting invalid JSON.
    """
    return json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False)


async def _owned_kids(db: AsyncSession, profile: Profile) -> list[Kid]:
    return (await db.scalars(select(Kid).where(Kid.profile_id == profile.id).order_by(Kid.created_at))).all()


# #1503 — the JSON export is the complete backup. `serialize_kid` covers the
# original settings columns, mastery, events and stories; the three helpers
# below add the settings columns shipped after the export format was first
# written (volume, quiet hours, voice recording, goal, focus pin, voice tone,
# pause), the `mastered_at` mastery timestamp, and the (already server-redacted)
# story context envelope — so a restore round-trips everything the API holds.
_SETTINGS_FIELDS = (
    "enabled_subjects",
    "max_band",
    "daily_limit_min",
    "weekday_limits_min",
    "tts_enabled",
    "music_enabled",
    "voice_volume",
    "sfx_volume",
    "music_volume",
    "quiet_enabled",
    "quiet_windows",
    "quiet_dim",
    "quiet_volume",
    "voice_record_enabled",
    "goal_min",
    "focus_subject",
    "focus_band",
    "voice_tone",
    "voice_speed",
    "paused",
)


def _serialize_settings(s: KidSettings | None) -> dict | None:
    """Full parent-controls row (never the `kid_id` FK — kids are nested)."""
    if s is None:
        return None
    out = {field: getattr(s, field) for field in _SETTINGS_FIELDS}
    out["updated_at"] = iso(s.updated_at)
    return out


def _serialize_stories(stories: list[LearningStory]) -> list[dict]:
    """Kotha stories including their (already redacted) context envelope."""
    return [
        {
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
            "context": s.context or {},
            "created_at": iso(s.created_at),
        }
        for s in sorted(stories, key=lambda s: s.created_at or datetime.min)
    ]


def _with_mastered_at(serialized_mastery: list[dict], mastery_rows: list[SkillMastery]) -> list[dict]:
    """Add `mastered_at` (#79) to each mastery entry, matched by skill_id."""
    by_skill = {m.skill_id: m for m in mastery_rows}
    for item in serialized_mastery:
        row = by_skill.get(item["skill_id"])
        if row is not None:
            item["mastered_at"] = iso(row.mastered_at)
    return serialized_mastery


@router.get("/export", response_class=Response)
async def export_json(
    profile: Profile = Depends(EXPORT_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Full family export as a downloadable, readable JSON document."""
    kids = await _owned_kids(db, profile)
    kid_ids = [k.id for k in kids]

    settings = {s.kid_id: s for s in (await db.scalars(select(KidSettings).where(KidSettings.kid_id.in_(kid_ids)))).all()}
    mastery_by: dict = {kid_id: [] for kid_id in kid_ids}
    for m in (await db.scalars(select(SkillMastery).where(SkillMastery.kid_id.in_(kid_ids)))).all():
        mastery_by[m.kid_id].append(m)
    events_by: dict = {kid_id: [] for kid_id in kid_ids}
    for e in (await db.scalars(select(ProgressEvent).where(ProgressEvent.kid_id.in_(kid_ids)))).all():
        events_by[e.kid_id].append(e)
    stories_by: dict = {kid_id: [] for kid_id in kid_ids}
    for s in (await db.scalars(select(LearningStory).where(LearningStory.kid_id.in_(kid_ids)))).all():
        stories_by[s.kid_id].append(s)

    # #987 — include acceleration_log entries in the export (previously missing)
    accel_by: dict = {kid_id: [] for kid_id in kid_ids}
    for a in (await db.scalars(select(AccelerationLog).where(AccelerationLog.kid_id.in_(kid_ids)))).all():
        accel_by[a.kid_id].append(a)

    kids_out = []
    for k in kids:
        item = serialize_kid(k, settings.get(k.id), mastery_by[k.id], events_by[k.id], stories_by[k.id], acceleration=accel_by[k.id])
        item["settings"] = _serialize_settings(settings.get(k.id))
        item["mastery"] = _with_mastered_at(item["mastery"], mastery_by[k.id])
        item["stories"] = _serialize_stories(stories_by[k.id])
        kids_out.append(item)

    payload = {
        "format": FORMAT,
        "version": VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "profile": profile_meta(profile),
        "kids": kids_out,
    }
    # #1843 — audit the export on the parent's account (a family export is the
    # heaviest privacy surface; the parent should see when one was pulled).
    db.add(ParentEvent(profile_id=profile.id, action="export_json", event_type="export", target="all"))
    await db.commit()
    data = _safe_json_dumps(payload).encode("utf-8")
    return Response(
        content=data,
        media_type="application/json",
        headers={"Content-Disposition": _attachment(f'numberverse-export-{datetime.now(timezone.utc).strftime("%Y-%m-%d")}.json')},
    )


@router.get("/export.csv", response_class=Response)
async def export_csv(
    profile: Profile = Depends(EXPORT_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Family round history as a spreadsheet-friendly CSV (one row per round).

    Column `kid` carries the display name so a parent can filter by child in
    Excel/Numbers. Bangla names survive via a UTF-8 BOM."""
    kids = await _owned_kids(db, profile)
    kid_ids = [k.id for k in kids]
    events = (await db.scalars(select(ProgressEvent).where(ProgressEvent.kid_id.in_(kid_ids)))).all() if kid_ids else []
    # #1843 — audit the CSV export on the parent's account (same privacy surface
    # as the JSON export).
    db.add(ParentEvent(profile_id=profile.id, action="export_csv", event_type="export", target="all"))
    await db.commit()
    data = to_csv(round_rows(kids, events), CSV_FIELDS)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": _attachment(f'numberverse-export-{datetime.now(timezone.utc).strftime("%Y-%m-%d")}.csv')},
    )


# #1502 — the restore half of data portability. main.py already includes this
# router; importing the import router here and folding it in keeps the new
# POST /api/v1/import registered without touching main.py.
router.include_router(import_data_router)
