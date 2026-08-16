"""Parent-facing data import (#1502) — the restore half of data portability.

POST /api/v1/import accepts the same JSON document produced by GET
/api/v1/export (`FORMAT="numberverse-family-export"`, `VERSION=1`) and upserts
kids/settings/mastery/events/stories for the calling profile only. It never
creates or updates rows for another profile: every kid row is assigned the
caller's `profile_id`, and any supplied kid id that already belongs to a
different profile is skipped (counted as a conflict), not overwritten.

Idempotency:
  * kids match on the exported kid `id`;
  * settings match on `kid_id`;
  * mastery matches on the natural `(kid_id, skill_id)` key;
  * events match on a stable `(kid_id, skill_id, game_id, correct,
    response_ms, difficulty, created_at)` key so re-importing the same
    document does not duplicate rounds;
  * stories match on `(kid_id, uid)` (or a fallback shape key for legacy
    stories without a uid).

The route is auth-protected exactly like the export route (account+IP rate
limiter over `get_current_profile`) and is bounded by the app's global request
body limit plus an explicit 10 MB route guard.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..export_format import FORMAT, VERSION
from ..models import Kid, KidSettings, LearningStory, Profile, ProgressEvent, SkillMastery
from ..ratelimit import rate_limit
from ..schemas import RoundedInt
from ..scrub import redact_context

router = APIRouter(prefix="/api/v1", tags=["import"])

# Same account+IP durable fixed-window limiter as every write endpoint. The
# import body is a whole family's history, so keep it on the same bounded budget
# as export (#838).
# #1768 — import/export get their OWN much smaller per-minute budgets: one
# request upserts a family's whole history; now 10 imports per minute per
# account+IP.
IMPORT_RATE_LIMIT = rate_limit(limit=10)

# Defense-in-depth on top of the app's global request-body guard (#836). The
# global middleware is stricter (1 MiB), but if it is ever relaxed this route
# still refuses absurd multi-megabyte documents before processing rows.
MAX_IMPORT_BODY_BYTES = 10 * 1024 * 1024


class ImportSettingsIn(BaseModel):
    """Per-kid parent controls as serialized by GET /api/v1/export."""

    enabled_subjects: list[str] | None = None
    max_band: int | None = Field(default=None, ge=1, le=5)
    daily_limit_min: int | None = Field(default=None, ge=1, le=600)
    weekday_limits_min: str | None = Field(default=None, pattern=r"^(\d{1,3},){6}\d{1,3}$")
    tts_enabled: bool = True
    music_enabled: bool = True
    voice_volume: float = Field(default=1.0, ge=0.0, le=1.0)
    sfx_volume: float = Field(default=1.0, ge=0.0, le=1.0)
    music_volume: float = Field(default=1.0, ge=0.0, le=1.0)
    quiet_enabled: bool = False
    quiet_windows: str | None = Field(
        default=None,
        pattern=r"^(?:-|\d{1,2}:\d{2}-\d{1,2}:\d{2})(?:,(?:-|\d{1,2}:\d{2}-\d{1,2}:\d{2})){6}$",
    )
    quiet_dim: bool = True
    quiet_volume: float = Field(default=0.15, ge=0.05, le=1.0)
    voice_record_enabled: bool = False
    goal_min: int | None = Field(default=None, ge=1, le=600)
    focus_subject: str | None = Field(default=None, max_length=16)
    focus_band: int | None = Field(default=None, ge=1, le=7)
    voice_tone: str | None = Field(default=None, max_length=8)
    voice_speed: float | None = Field(default=None, ge=0.5, le=2.0)
    paused: bool = False
    updated_at: datetime | None = None


class ImportMasteryIn(BaseModel):
    skill_id: str
    mastery: float = Field(default=0.0, ge=0.0, le=1.0)
    correct: int = Field(default=0, ge=0)
    attempts: int = Field(default=0, ge=0)
    streak: int = Field(default=0, ge=0)
    last_practice: datetime | None = None
    last_decay: datetime | None = None
    mastered_at: datetime | None = None


class ImportEventIn(BaseModel):
    id: int | None = None  # original event id — accepted for compatibility, not used for dedup
    skill_id: str
    game_id: str
    correct: bool
    response_ms: RoundedInt = None
    difficulty: float | None = None
    created_at: datetime | None = None


class ImportStoryIn(BaseModel):
    uid: str | None = None
    skill_id: str
    game_id: str
    error_kind: str | None = None
    misconception_code: str | None = None
    action: str | None = None
    outcome: bool
    difficulty: float | None = None
    response_ms: RoundedInt = None
    wrong_streak: RoundedInt = None
    context: dict = Field(default_factory=dict)
    created_at: datetime | None = None


class ImportKidIn(BaseModel):
    id: str | None = None  # exported kid id — the stable upsert key
    profile_id: uuid.UUID | None = None  # optional owner hint; skipped when it differs from the caller
    name: str = Field(min_length=1, max_length=40)
    avatar: str | None = None
    birth_year: int | None = Field(default=None, ge=2010, le=2030)
    created_at: datetime | None = None
    settings: ImportSettingsIn | None = None
    mastery: list[ImportMasteryIn] = Field(default_factory=list)
    events: list[ImportEventIn] = Field(default_factory=list)
    stories: list[ImportStoryIn] = Field(default_factory=list)


class ImportIn(BaseModel):
    format: str
    version: int
    exported_at: datetime | None = None
    profile: dict | None = None
    kids: list[ImportKidIn] = Field(default_factory=list)


class ImportOut(BaseModel):
    created: int
    updated: int
    skipped: int
    conflicts: int
    conflict_details: list[str] = []


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
    # #12 — a backup restore must carry the settings row's timestamp too,
    # otherwise the round-trip silently resets the parent-controls "last edit"
    # stamp to import-time. Export already ships it (export.py _SETTINGS_FIELDS
    # + _serialize_settings) — the import side now mirrors that.
    "updated_at",
)

_MASTERY_FIELDS = ("mastery", "correct", "attempts", "streak", "last_practice", "last_decay")


def _utc(dt: datetime | None) -> datetime | None:
    """Timestamp columns are timezone-aware; normalize parsed ISO values to
    aware UTC so imports match what /export produced and what Postgres stores."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _apply_fields(obj, fields: dict) -> bool:
    """Set `fields` on `obj`; return True when anything actually changed."""
    changed = False
    for name, value in fields.items():
        if getattr(obj, name) != value:
            setattr(obj, name, value)
            changed = True
    return changed


def _upsert_kid(db: AsyncSession, item: ImportKidIn, kid_uuid: uuid.UUID, existing: Kid | None, profile_id: uuid.UUID) -> tuple[int, int, int]:
    """Create or update one kid. Returns (created, updated, skipped)."""
    if existing is None:
        kid = Kid(id=kid_uuid, profile_id=profile_id, name=item.name, avatar=item.avatar, birth_year=item.birth_year)
        if item.created_at is not None:
            kid.created_at = _utc(item.created_at)
        db.add(kid)
        return 1, 0, 0
    if _apply_fields(existing, {"name": item.name, "avatar": item.avatar, "birth_year": item.birth_year}):
        return 0, 1, 0
    return 0, 0, 1


def _upsert_settings(db: AsyncSession, item: ImportSettingsIn | None, kid_uuid: uuid.UUID, existing: KidSettings | None) -> tuple[int, int, int]:
    """Create or update the per-kid parent-controls row. A missing settings
    object means "no settings in the backup" and is left untouched."""
    if item is None:
        return 0, 0, 0
    fields = {name: getattr(item, name) for name in _SETTINGS_FIELDS}
    # #12 — updated_at is a timezone-aware column; normalize the parsed ISO
    # value to aware UTC so the round-trip matches /export and Postgres
    # (mirrors _mastery_fields' handling of last_practice/last_decay).
    if fields.get("updated_at") is not None:
        fields["updated_at"] = _utc(fields["updated_at"])
    if existing is None:
        db.add(KidSettings(kid_id=kid_uuid, **fields))
        return 1, 0, 0
    if _apply_fields(existing, fields):
        return 0, 1, 0
    return 0, 0, 1


def _mastery_fields(item: ImportMasteryIn) -> dict:
    return {
        "mastery": item.mastery,
        "correct": item.correct,
        "attempts": item.attempts,
        "streak": item.streak,
        "last_practice": _utc(item.last_practice),
        "last_decay": _utc(item.last_decay),
    }


def _reject_oversized(request: Request) -> None:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_IMPORT_BODY_BYTES:
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    "Import document too large (max 10 MB)",
                )
        except ValueError:
            pass


@router.post("/import", response_model=ImportOut)
async def import_family_data(
    body: ImportIn,
    request: Request,
    profile: Profile = Depends(IMPORT_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> ImportOut:
    """Restore a family backup exported by GET /api/v1/export.

    Ownership is enforced twice: the caller's `profile_id` is stamped on every
    created kid, and a supplied kid id that already exists under a different
    profile is skipped (conflict) rather than touched.
    """
    _reject_oversized(request)

    if body.format != FORMAT or body.version != VERSION:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Unsupported export document: expected format {FORMAT!r}, version {VERSION}",
        )

    created = 0
    updated = 0
    skipped = 0
    conflicts = 0
    conflict_details: list[str] = []

    parsed: list[tuple[ImportKidIn, uuid.UUID | None]] = []
    for item in body.kids:
        kid_uuid: uuid.UUID | None = None
        if item.id:
            try:
                kid_uuid = uuid.UUID(item.id)
            except (ValueError, AttributeError, TypeError):
                kid_uuid = None
        parsed.append((item, kid_uuid))

    existing_kids: dict[uuid.UUID, Kid] = {}
    kid_ids = [kid_uuid for _item, kid_uuid in parsed if kid_uuid is not None]
    if kid_ids:
        existing_kids = {
            k.id: k
            for k in (await db.scalars(select(Kid).where(Kid.id.in_(kid_ids)))).all()
        }

    accepted: list[tuple[ImportKidIn, uuid.UUID, Kid | None]] = []
    for item, kid_uuid in parsed:
        if kid_uuid is None:
            conflicts += 1
            conflict_details.append("Kid skipped: missing or invalid id")
            continue
        if item.profile_id is not None and item.profile_id != profile.id:
            conflicts += 1
            conflict_details.append("Kid skipped: belongs to another profile")
            continue
        existing = existing_kids.get(kid_uuid)
        if existing is not None and existing.profile_id != profile.id:
            conflicts += 1
            conflict_details.append("Kid skipped: belongs to another profile")
            continue
        accepted.append((item, kid_uuid, existing))

    target_ids = [kid_uuid for _item, kid_uuid, _existing in accepted]
    if not target_ids:
        return ImportOut(
            created=created,
            updated=updated,
            skipped=skipped,
            conflicts=conflicts,
            conflict_details=conflict_details,
        )

    settings_by_kid = {
        s.kid_id: s
        for s in (await db.scalars(select(KidSettings).where(KidSettings.kid_id.in_(target_ids)))).all()
    }
    mastery_by_key = {
        (m.kid_id, m.skill_id): m
        for m in (await db.scalars(select(SkillMastery).where(SkillMastery.kid_id.in_(target_ids)))).all()
    }

    event_keys = {
        (e.kid_id, e.skill_id, e.game_id, e.correct, e.response_ms, e.difficulty, e.created_at)
        for e in (await db.scalars(select(ProgressEvent).where(ProgressEvent.kid_id.in_(target_ids)))).all()
    }

    story_uid_keys: set[tuple[uuid.UUID, str]] = set()
    story_fallback_keys: set[tuple] = set()
    for s in (await db.scalars(select(LearningStory).where(LearningStory.kid_id.in_(target_ids)))).all():
        if s.uid is not None:
            story_uid_keys.add((s.kid_id, s.uid))
        story_fallback_keys.add((s.kid_id, s.skill_id, s.game_id, s.outcome, s.created_at))

    for item, kid_uuid, existing_kid in accepted:
        c, u, s = _upsert_kid(db, item, kid_uuid, existing_kid, profile.id)
        created += c
        updated += u
        skipped += s

        c, u, s = _upsert_settings(db, item.settings, kid_uuid, settings_by_kid.get(kid_uuid))
        created += c
        updated += u
        skipped += s

        for mastery in item.mastery:
            fields = _mastery_fields(mastery)
            existing_mastery = mastery_by_key.get((kid_uuid, mastery.skill_id))
            if existing_mastery is None:
                row = SkillMastery(kid_id=kid_uuid, skill_id=mastery.skill_id, **fields)
                if "mastered_at" in mastery.model_fields_set:
                    row.mastered_at = _utc(mastery.mastered_at)
                db.add(row)
                mastery_by_key[(kid_uuid, mastery.skill_id)] = row
                created += 1
                continue
            changed = _apply_fields(existing_mastery, fields)
            if "mastered_at" in mastery.model_fields_set:
                mastered_at = _utc(mastery.mastered_at)
                if existing_mastery.mastered_at != mastered_at:
                    existing_mastery.mastered_at = mastered_at
                    changed = True
            if changed:
                updated += 1
            else:
                skipped += 1

        for event in item.events:
            if event.created_at is None:
                skipped += 1
                continue
            created_at = _utc(event.created_at)
            key = (kid_uuid, event.skill_id, event.game_id, event.correct, event.response_ms, event.difficulty, created_at)
            if key in event_keys:
                skipped += 1
                continue
            db.add(
                ProgressEvent(
                    kid_id=kid_uuid,
                    skill_id=event.skill_id,
                    game_id=event.game_id,
                    correct=event.correct,
                    response_ms=event.response_ms,
                    difficulty=event.difficulty,
                    created_at=created_at,
                )
            )
            event_keys.add(key)
            created += 1

        for story in item.stories:
            if story.uid is not None:
                uid_key = (kid_uuid, story.uid)
                if uid_key in story_uid_keys:
                    skipped += 1
                    continue
            else:
                if story.created_at is None:
                    skipped += 1
                    continue
                fallback_key = (kid_uuid, story.skill_id, story.game_id, story.outcome, _utc(story.created_at))
                if fallback_key in story_fallback_keys:
                    skipped += 1
                    continue

            story_row = LearningStory(
                kid_id=kid_uuid,
                uid=story.uid,
                skill_id=story.skill_id,
                game_id=story.game_id,
                error_kind=story.error_kind,
                misconception_code=story.misconception_code,
                action=story.action,
                outcome=story.outcome,
                difficulty=story.difficulty,
                response_ms=story.response_ms,
                wrong_streak=story.wrong_streak,
                context=redact_context(story.context) or {},
            )
            if story.created_at is not None:
                story_row.created_at = _utc(story.created_at)
            db.add(story_row)
            if story.uid is not None:
                story_uid_keys.add(uid_key)
            else:
                story_fallback_keys.add(fallback_key)
            created += 1

    await db.commit()
    return ImportOut(
        created=created,
        updated=updated,
        skipped=skipped,
        conflicts=conflicts,
        conflict_details=conflict_details,
    )
