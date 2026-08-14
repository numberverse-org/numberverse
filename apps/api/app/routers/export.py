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
    profile_meta,
    round_rows,
    serialize_kid,
    to_csv,
)
from ..models import (
    Kid,
    KidSettings,
    LearningStory,
    Profile,
    ProgressEvent,
    SkillMastery,
)

router = APIRouter(prefix="/api/v1", tags=["export"])

# #838 — exports stream a family's entire history, so bound how often a
# (possibly breached) token may pull a heavy full export. Reuses the same
# account+IP sliding-window limiter as the write endpoints.
EXPORT_RATE_LIMIT = rate_limit()

CSV_FIELDS = ["kid", "kid_id", "date", "skill_id", "game_id", "correct", "response_ms", "difficulty"]


def _attachment(filename: str) -> str:
    return f'attachment; filename="{filename}"'


async def _owned_kids(db: AsyncSession, profile: Profile) -> list[Kid]:
    return (await db.scalars(select(Kid).where(Kid.profile_id == profile.id).order_by(Kid.created_at))).all()


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

    payload = {
        "format": FORMAT,
        "version": VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "profile": profile_meta(profile),
        "kids": [
            serialize_kid(k, settings.get(k.id), mastery_by[k.id], events_by[k.id], stories_by[k.id])
            for k in kids
        ],
    }
    data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
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
    data = to_csv(round_rows(kids, events), CSV_FIELDS)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": _attachment(f'numberverse-export-{datetime.now(timezone.utc).strftime("%Y-%m-%d")}.csv')},
    )
