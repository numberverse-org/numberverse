import json
import logging
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import require_admin, require_super_admin
from ..models import (
    AdminAudit,
    ConfigEntry,
    ContentItem,
    Kid,
    KidSettings,
    LearningStory,
    Profile,
    ProgressEvent,
    Session,
    Skill,
    SkillMastery,
    Subscription,
)
from ..schemas import StorySearchIn, StorySearchOut
from ..story_embedding_model import HAVE_VECTOR, StoryEmbedding

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

log = logging.getLogger("numberverse.admin")

# react-admin resources → model. Keys are the REST resource names.
WHITELIST: dict[str, type] = {
    "profiles": Profile,
    "kids": Kid,
    "kid_settings": KidSettings,
    "skills": Skill,
    "content_items": ContentItem,
    "config": ConfigEntry,
    "subscriptions": Subscription,
}

UUID_MODELS = {Profile, Kid, Subscription, KidSettings}

# #846 — deletions that are tenant-wide / product-wide and therefore need the
# super_admin role (or a legacy is_admin profile). Catalog rows (skills,
# content_items) and per-kid settings stay at the normal admin boundary.
SUPER_ADMIN_DELETES = {"profiles", "kids", "subscriptions", "config"}

# Per-resource writable fields for the generic admin CRUD below. POST/PUT
# bodies may contain anything; only these keys are accepted. This keeps every
# legitimately-editable react-admin field working while making it impossible
# for an admin REST call to mass-assign server-managed or security-sensitive
# columns (ids, timestamps, is_admin, password_hash, app-minted tokens).
WRITABLE_FIELDS: dict[str, set[str]] = {
    "profiles": {
        "email",
        "display_name",
        "aggregate_opt_in",
    },
    "kids": {
        "profile_id",
        "name",
        "avatar",
        "birth_year",
        "coins",
    },
    "kid_settings": {
        "kid_id",
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
    },
    "skills": {
        "band",
        "subject",
        "title",
        "title_bn",
        "description",
        "common_core",
        "nctb_code",
        "class_number",
        "sort_order",
    },
    "content_items": {
        "kind",
        "title",
        "config",
        "band",
        "enabled",
    },
    "config": {
        "key",
        "value",
    },
    "subscriptions": {
        "profile_id",
        "plan",
        "store",
        "store_ref",
        "status",
        "current_period_end",
    },
}

# Never writable through this router, even if a future edit accidentally adds
# them to WRITABLE_FIELDS. `id` is set by the DB/URL; `is_admin` and `role`
# (#846) are authz flags; `password_hash` is credential material. Those may
# only change through the auth flows.
DENIED_WRITE_FIELDS = {"id", "is_admin", "role", "password_hash"}


# #847 — the config resource is a JSONB key/value store; the only key the
# product reads today is `adaptive` (progress._adaptive_params). Each known key
# documents its allowed value shape here so a typo can't silently break every
# learning round. This is deliberately NOT a generic JSON-schema engine — just
# the shapes we actually serve.
CONFIG_SCHEMAS: dict[str, dict] = {
    "adaptive": {
        "type": "object",
        "required": ["pLearn", "pGuess", "pSlip"],
        "properties": {
            "pLearn": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "pGuess": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "pSlip": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        },
    },
}


def _validate_config(key: str, value: Any) -> dict:
    """#847 — explicit per-key shape check for config values.

    Unknown keys and malformed shapes are a 422 so the product config can only
    ever be changed into a state the consumer already understands."""
    if not key:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Config key is required")
    schema = CONFIG_SCHEMAS.get(key)
    if schema is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown config key")
    if schema.get("type") == "object":
        if not isinstance(value, dict):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"Config '{key}' must be an object"
            )
        for field in schema.get("required", []):
            if field not in value:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"Config '{key}' missing required field: {field}",
                )
        for field, prop in schema.get("properties", {}).items():
            if field not in value:
                continue
            v = value[field]
            if prop.get("type") == "number":
                if isinstance(v, bool) or not isinstance(v, (int, float)):
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        f"Config '{key}.{field}' must be a number",
                    )
                if "minimum" in prop and v < prop["minimum"]:
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        f"Config '{key}.{field}' must be >= {prop['minimum']}",
                    )
                if "maximum" in prop and v > prop["maximum"]:
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        f"Config '{key}.{field}' must be <= {prop['maximum']}",
                    )
    return value


def _jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (uuid.UUID,)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    return value


# Secret-ish columns that must never be serialized in admin responses, even
# for an authenticated admin. `password_hash` is the #864 leak; `token_hash`
# (sessions) and `share_token` (kids) are bearer/token material that the admin
# CRUD never needs to read back.
SENSITIVE_COLUMNS = {"password_hash", "token_hash", "share_token"}


def _row_to_dict(obj: Any) -> dict:
    data: dict = {}
    for col in obj.__table__.columns:
        if col.name in SENSITIVE_COLUMNS:
            continue
        data[col.name] = _jsonable(getattr(obj, col.name))
    return data


def _writable_payload(resource: str, body: dict) -> dict:
    """Mass-assignment guard (#862, #863).

    Return only the body keys present in the per-resource WRITABLE_FIELDS
    allow-list. Unknown keys and DENIED_WRITE_FIELDS (`id`, `is_admin`,
    `role`, `password_hash`) are never passed through to the ORM model.
    """
    allowed = WRITABLE_FIELDS.get(resource, set())
    return {k: v for k, v in body.items() if k in allowed and k not in DENIED_WRITE_FIELDS}


def _pk_value(model: type, raw: str) -> Any:
    # #854 — UUID models receive the id as a plain path str; a malformed UUID
    # must be a 422 ("Invalid id"), not an unhandled ValueError → 500.
    if model in UUID_MODELS:
        try:
            return uuid.UUID(raw)
        except ValueError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid id") from None
    return raw


def _obj_pk(obj: Any) -> Any:
    """Single-column primary key value of a created row (for the audit trail)."""
    pk_cols = list(obj.__table__.primary_key.columns)
    if len(pk_cols) == 1:
        return getattr(obj, pk_cols[0].name)
    return None


def _write_audit(
    db: AsyncSession,
    profile: Profile,
    action: str,
    resource: str,
    item_id: Any = None,
    detail: Any = None,
) -> None:
    """#846 — append an admin audit row. Always called, never gated.

    `detail` only ever carries allow-listed change shape (field names, config
    values) — credential columns such as password_hash are never included."""
    db.add(
        AdminAudit(
            admin_id=profile.id,
            action=action,
            resource=resource,
            item_id=str(item_id) if item_id is not None else None,
            detail=_jsonable(detail),
        )
    )


@router.get("/stats")
async def stats(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    async def count(model) -> int:
        return (await db.scalar(select(func.count()).select_from(model))) or 0

    recent = await db.scalars(
        select(ProgressEvent).order_by(ProgressEvent.id.desc()).limit(10)
    )
    return {
        "profiles": await count(Profile),
        "kids": await count(Kid),
        "skills": await count(Skill),
        "content_items": await count(ContentItem),
        "progress_events": await count(ProgressEvent),
        "subscriptions": await count(Subscription),
        "recent_events": [_row_to_dict(e) for e in recent],
    }


# ── 📚 KOTHA story health dashboard (#336) ────────────────────────────────
# One admin view over the learning-story lake: counts + breakdown + sanity.
# Charts are deliberately PII-free (anonymous rank buckets, skill/error kinds).
# The only kid-identifiable rows are the rate-limit flags, which admin needs
# to act on — never mixed into the chart payloads.

# How fast a single kid can LEGITIMATELY generate stories. A real session tops
# out far below this; crossing it in the last hour means a runaway sync loop,
# a duplicated outbox replay, or a bot. The dashboard flags those kids.
STORY_RATE_LIMIT_PER_HOUR = 200
STORY_HEALTH_DAYS = 14


@router.get("/stories/health")
async def stories_health(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    total = (await db.scalar(select(func.count()).select_from(LearningStory))) or 0

    # Breakdown by kid → ANONYMOUS buckets for the chart (rank only, no UUID).
    by_kid_raw = await db.execute(
        select(LearningStory.kid_id, func.count().label("n"))
        .group_by(LearningStory.kid_id)
        .order_by(func.count().desc())
        .limit(10)
    )
    by_kid = [
        {"rank": i + 1, "label": f"Kid #{i + 1}", "stories": n}
        for i, (_kid_id, n) in enumerate(by_kid_raw.all())
    ]

    # Breakdown by skill (skill ids are curriculum, not kid data).
    by_skill_raw = await db.execute(
        select(LearningStory.skill_id, func.count().label("n"))
        .group_by(LearningStory.skill_id)
        .order_by(func.count().desc())
        .limit(10)
    )
    by_skill = [{"skill_id": sid, "stories": n} for sid, n in by_skill_raw.all()]

    # Breakdown by Moni error kind (fatigue|misconception|gap|guessing|slip).
    by_error_raw = await db.execute(
        select(LearningStory.error_kind, func.count().label("n"))
        .where(LearningStory.error_kind.is_not(None))
        .group_by(LearningStory.error_kind)
        .order_by(func.count().desc())
    )
    by_error = [{"error_kind": e or "unknown", "stories": n} for e, n in by_error_raw.all()]

    # Breakdown by plan action.
    by_action_raw = await db.execute(
        select(LearningStory.action, func.count().label("n"))
        .where(LearningStory.action.is_not(None))
        .group_by(LearningStory.action)
        .order_by(func.count().desc())
    )
    by_action = [{"action": a or "none", "stories": n} for a, n in by_action_raw.all()]

    # 14-day ingest trend (for a line chart) — date-only buckets, no kids.
    # #906 — timestamp columns are timezone-aware UTC; bucket on the UTC date so
    # a non-UTC server session can't shift the trend's calendar day.
    since = datetime.now(timezone.utc) - timedelta(days=STORY_HEALTH_DAYS)
    day_expr = func.date(func.timezone("UTC", LearningStory.created_at))
    by_day_raw = await db.execute(
        select(day_expr.label("d"), func.count().label("n"))
        .where(LearningStory.created_at >= since)
        .group_by(day_expr)
        .order_by(day_expr)
    )
    by_day = [{"date": d.isoformat() if hasattr(d, "isoformat") else str(d), "stories": n} for d, n in by_day_raw.all()]

    # Rate-limit-aware flags: kids whose story volume in the last 60 min
    # breached the per-hour budget → likely a runaway replay, needs a look.
    hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    hot_raw = await db.execute(
        select(LearningStory.kid_id, func.count().label("n"))
        .where(LearningStory.created_at >= hour_ago)
        .group_by(LearningStory.kid_id)
        .having(func.count() > STORY_RATE_LIMIT_PER_HOUR)
        .order_by(func.count().desc())
    )
    high_velocity = [
        {"kid_id": str(kid_id), "last_hour": n, "over_budget_by": n - STORY_RATE_LIMIT_PER_HOUR}
        for kid_id, n in hot_raw.all()
    ]

    # Sanity check — the dashboard's verdict.
    warnings: list[str] = []
    if total == 0:
        warnings.append("Kotha lake is empty — is the client syncing?")
    if not by_kid:
        warnings.append("No per-kid story data yet.")
    elif by_kid and by_kid[0]["stories"] > STORY_RATE_LIMIT_PER_HOUR * 24:
        warnings.append("A single kid owns the lake — check for a sync loop.")
    if high_velocity:
        warnings.append(f"{len(high_velocity)} kid(s) breached the {STORY_RATE_LIMIT_PER_HOUR}-stories/hour budget in the last hour.")

    return {
        "total": total,
        "charts": {
            "by_kid": by_kid,       # anonymous rank buckets — no kid PII
            "by_skill": by_skill,
            "by_error_kind": by_error,
            "by_action": by_action,
            "by_day": by_day,
        },
        "rate_limit_per_hour": STORY_RATE_LIMIT_PER_HOUR,
        "high_velocity_kids": high_velocity,
        "sanity": {"ok": not warnings, "warnings": warnings},
    }


@router.post("/stories/embed")
async def embed_stories_now(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """📚 KOTHA embed job (#329) — manual trigger of the scheduled batch-embed.
    Idempotent (only unembedded stories are picked; ON CONFLICT no-op). Reports
    `skipped` instead of failing when the model/pgvector stack is absent."""
    from ..embeddings import embed_stories

    return await embed_stories(db)


@router.post("/stories/search", response_model=StorySearchOut)
async def search_stories(
    body: StorySearchIn,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """📚 KOTHA semantic retrieval (#323) — 'find learning moments like this one'.

    Embeds the query with the same gte-small encoder the embed job uses, then
    does a top-K vector similarity search over `story_embeddings` (cosine
    distance, `<=>`). The response is PRIVACY-SCRUBBED by construction: only
    the story's context envelope (question / wrong answer / Moni reason) plus
    skill, game, error kind, and misconception code — never kid ids, names, or
    uids. Admin-only: it's a system capability for future tools.

    503 when the pgvector/model stack is absent — the search simply isn't
    available, exactly like the embed job's `skipped` (never a crash)."""
    if not HAVE_VECTOR or StoryEmbedding is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "semantic search unavailable: pgvector not installed")

    from ..embeddings import embed_text  # lazy — keeps the route fast to boot

    vector = embed_text(body.query)
    if vector is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "semantic search unavailable: embedding model not installed")

    # Top-K by cosine distance over the vector column (gte-small embeddings are
    # L2-normalized at encode time, so cosine ≈ the canonical `<=>` operator).
    dist_col = StoryEmbedding.embedding.cosine_distance(vector).label("dist")
    raw = (
        await db.execute(
            select(StoryEmbedding.story_id, dist_col).order_by(dist_col).limit(body.top_k)
        )
    ).all()
    if not raw:
        return StorySearchOut(query=body.query, hits=[])

    story_ids = [r[0] for r in raw]
    dists = [r[1] for r in raw]
    stories = await db.scalars(select(LearningStory).where(LearningStory.id.in_(story_ids)))
    by_id = {s.id: s for s in stories}
    hits = []
    for sid, dist in zip(story_ids, dists):
        s = by_id.get(sid)
        if not s:
            continue
        hits.append(
            StorySearchHit(
                similarity=round(1.0 - float(dist), 4),
                skill_id=s.skill_id,
                game_id=s.game_id,
                outcome=s.outcome,
                error_kind=s.error_kind,
                misconception_code=s.misconception_code,
                action=s.action,
                context=s.context or {},
                created_at=s.created_at,
            )
        )
    return StorySearchOut(query=body.query, hits=hits)


@router.post("/stories/prune")
async def prune_stories(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """📚 KOTHA retention job (#331) — idempotent, admin-only.

    Policy (from settings):
      - Drop stories older than `kotha_retention_days` (default 90d) — EXCEPT
        stories from skills practiced in the last `kotha_active_skill_days`
        (7d): active skills keep their full story history, so we never lose
        the evolution of what the kid is currently working on.
      - Then, as a volume guard, trim every kid to its most recent
        `kotha_max_stories_per_kid` (default 1000) stories — the active tail
        is always the most recent, so active learning is never the overflow.
    """
    # #906 — timezone-aware UTC now, matching the timezone-aware `created_at` column.
    now = datetime.now(timezone.utc)
    retention = timedelta(days=settings.kotha_retention_days)
    active_window = timedelta(days=settings.kotha_active_skill_days)
    cap = settings.kotha_max_stories_per_kid

    # 1) Age prune — but protect active skills (any skill touched recently).
    active_skills = (
        select(LearningStory.skill_id)
        .where(LearningStory.created_at >= now - active_window)
        .distinct()
        .scalar_subquery()
    )
    age_cutoff = now - retention
    age_result = await db.execute(
        delete(LearningStory)
        .where(LearningStory.created_at < age_cutoff)
        .where(LearningStory.skill_id.not_in(active_skills))
    )
    age_pruned = age_result.rowcount or 0

    # 2) Volume guard — keep only the most recent `cap` stories per kid.
    ranked = (
        select(
            LearningStory.id,
            func.row_number().over(
                partition_by=LearningStory.kid_id,
                order_by=LearningStory.created_at.desc(),
            ).label("rn"),
        ).subquery()
    )
    over_cap = (
        select(LearningStory.id)
        .join(ranked, ranked.c.id == LearningStory.id)
        .where(ranked.c.rn > cap)
    )
    cap_result = await db.execute(delete(LearningStory).where(LearningStory.id.in_(over_cap)))
    cap_pruned = cap_result.rowcount or 0

    await db.commit()
    return {
        "pruned": age_pruned + cap_pruned,
        "age_pruned": age_pruned,
        "cap_pruned": cap_pruned,
        "retention_days": settings.kotha_retention_days,
        "active_skill_days": settings.kotha_active_skill_days,
        "max_stories_per_kid": cap,
    }


@router.post("/progress/prune")
async def prune_progress_events(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """#983 — retention job for progress_events. Mirrors the prune_stories
    policy: drop rows older than `progress_retention_days`, then trim every
    kid to its most recent `max_progress_events_per_kid` events."""
    now = datetime.now(timezone.utc)
    retention = timedelta(days=settings.progress_retention_days)
    cap = settings.max_progress_events_per_kid
    age_cutoff = now - retention

    # 1) Age prune
    age_result = await db.execute(
        delete(ProgressEvent).where(ProgressEvent.created_at < age_cutoff)
    )
    age_pruned = age_result.rowcount or 0

    # 2) Volume guard per kid
    ranked = (
        select(
            ProgressEvent.id,
            func.row_number().over(
                partition_by=ProgressEvent.kid_id,
                order_by=ProgressEvent.id.desc(),
            ).label("rn"),
        ).subquery()
    )
    over_cap = (
        select(ProgressEvent.id)
        .join(ranked, ranked.c.id == ProgressEvent.id)
        .where(ranked.c.rn > cap)
    )
    cap_result = await db.execute(delete(ProgressEvent).where(ProgressEvent.id.in_(over_cap)))
    cap_pruned = cap_result.rowcount or 0

    await db.commit()
    return {
        "pruned": age_pruned + cap_pruned,
        "age_pruned": age_pruned,
        "cap_pruned": cap_pruned,
        "retention_days": settings.progress_retention_days,
        "max_events_per_kid": cap,
    }


# #984 — purge revoked sessions older than N days. Session rows carry ip +
# user_agent (the two fields PRIVACY.md flags as 'nice-to-have PII'), so they
# must not accumulate forever once revocation removes their purpose.
@router.post("/sessions/purge-revoked")
async def purge_revoked_sessions(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """#984 — hard-delete Session rows that were revoked more than N days ago.
    Default 30 days: stale IP/UA PII is gone once revocation is settled."""
    from ..config import settings as app_settings

    cutoff = datetime.now(timezone.utc) - timedelta(days=getattr(app_settings, "session_purge_days", 30))
    result = await db.execute(
        delete(Session).where(
            Session.revoked_at.is_not(None),
            Session.revoked_at < cutoff,
        )
    )
    purged = result.rowcount or 0
    await db.commit()
    return {"purged": purged, "cutoff": cutoff.isoformat()}


# #840 — caps for the generic admin list_resource. react-admin sends
# `?filter`, `?sort` and `?range` as JSON query params; without limits a
# crafted `?range=[0,999999]` (or an arbitrarily deep filter) could force
# unbounded work / a full-table pull.
MAX_RANGE_ROWS = 500
MAX_FILTER_KEYS = 10
MAX_SORT_COLUMNS = 1


@router.get("/{resource}")
async def list_resource(
    resource: str,
    sort: str = None,
    range: str = None,
    filter: str = None,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")

    # #840 / #848 — parse react-admin's JSON query params up-front so a
    # malformed payload is a 400 (with the swallowed exception logged) instead
    # of silently falling back to the full dataset. Absent/empty params stay
    # "no filter / no sort / no pagination".
    filter_dict: dict = {}
    if filter:
        try:
            filter_dict = json.loads(filter)
        except json.JSONDecodeError as exc:
            log.warning("admin list_resource invalid filter: %r", exc)
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid filter") from exc
        if not isinstance(filter_dict, dict):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid filter")

    sort_pairs: list[tuple[str, str]] = []
    if sort:
        try:
            sort_raw = json.loads(sort)
        except json.JSONDecodeError as exc:
            log.warning("admin list_resource invalid sort: %r", exc)
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid sort") from exc
        if not isinstance(sort_raw, list):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid sort")
        # react-admin's single-column sort is `["field", "DIR"]`; a multi-column
        # sort is a list of those pairs. Normalize both to a list of pairs.
        if len(sort_raw) == 2 and isinstance(sort_raw[0], str):
            sort_raw = [sort_raw]
        if len(sort_raw) > MAX_SORT_COLUMNS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Too many sort columns (max {MAX_SORT_COLUMNS})",
            )
        for entry in sort_raw:
            if (
                not isinstance(entry, list)
                or len(entry) != 2
                or not isinstance(entry[0], str)
                or not isinstance(entry[1], str)
            ):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid sort")
            sort_pairs.append((entry[0], entry[1]))

    start = end = None
    if range:
        try:
            range_raw = json.loads(range)
        except json.JSONDecodeError as exc:
            log.warning("admin list_resource invalid range: %r", exc)
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid range") from exc
        if (
            not isinstance(range_raw, list)
            or len(range_raw) != 2
            or not isinstance(range_raw[0], int)
            or not isinstance(range_raw[1], int)
        ):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid range")
        start, end = range_raw
        if start < 0 or end < start:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid range")
        # #840 — cap the window so `?range=[0,999999]` can't pull the whole table.
        if end - start + 1 > MAX_RANGE_ROWS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Range too large (max {MAX_RANGE_ROWS} rows)",
            )

    stmt = select(model)
    table_columns = model.__table__.columns

    # #840 — cap filter breadth/depth; unknown columns are a 400, not a skip.
    if len(filter_dict) > MAX_FILTER_KEYS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Too many filter keys (max {MAX_FILTER_KEYS})",
        )
    for key, val in filter_dict.items():
        if isinstance(val, dict) or (
            isinstance(val, list) and any(isinstance(v, (dict, list)) for v in val)
        ):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Nested filter payloads are not allowed",
            )
        if key not in table_columns.keys():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown filter column: {key}")
        col = table_columns[key]
        if isinstance(val, str) and val.startswith("~"):
            stmt = stmt.where(col.ilike(f"%{val[1:]}%"))
        elif isinstance(val, list):
            stmt = stmt.where(col.in_(val))
        else:
            stmt = stmt.where(col == val)

    # #848 — unknown sort columns are a 400, not a skip (#840 caps the count).
    for field, direction in sort_pairs:
        if field not in table_columns.keys():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown sort column: {field}")
        col = table_columns[field]
        stmt = stmt.order_by(col.asc() if direction.upper() == "ASC" else col.desc())

    # Pagination (react-admin sends range=[start,end]).
    total = (await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0
    if start is not None:
        stmt = stmt.offset(start).limit(end - start + 1)

    result = await db.scalars(stmt)
    rows = [_row_to_dict(r) for r in result]
    if start is not None:
        total_header = str(total)
        content_range = f"{resource} {start}-{start + len(rows) - 1}/{total}"
        return Response(
            content=json.dumps(rows),
            media_type="application/json",
            headers={"Content-Range": content_range, "X-Total-Count": total_header},
        )
    return rows


@router.get("/{resource}/{item_id}")
async def get_resource(
    resource: str,
    item_id: str,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    obj = await db.get(model, _pk_value(model, item_id))
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return _row_to_dict(obj)


@router.post("/{resource}", status_code=status.HTTP_201_CREATED)
async def create_resource(
    resource: str,
    body: dict,
    profile: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")

    # #846 — config writes are product-wide: a typo breaks every learning round.
    # #847 — validate the value against the known key shape before it persists.
    if resource == "config":
        await require_super_admin(profile)
        payload = _writable_payload(resource, body)
        key = payload.get("key")
        value = payload.get("value")
        _validate_config(key, value)
        obj = model(key=key, value=value)
        db.add(obj)
        await db.flush()
        _write_audit(db, profile, "create", "config", key, {"value": _jsonable(value)})
        await db.commit()
        await db.refresh(obj)
        return _row_to_dict(obj)

    payload = _writable_payload(resource, body)
    obj = model(**payload)
    db.add(obj)
    await db.flush()  # populate server-assigned PKs (UUID) before auditing
    _write_audit(db, profile, "create", resource, _obj_pk(obj), {"fields": sorted(payload)})
    await db.commit()
    await db.refresh(obj)
    return _row_to_dict(obj)


@router.put("/{resource}/{item_id}")
async def update_resource(
    resource: str,
    item_id: str,
    body: dict,
    profile: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    obj = await db.get(model, _pk_value(model, item_id))
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    # #846 — config writes are product-wide and need super_admin.
    # #847 — validate the incoming value against the key's known shape, and
    # record the previous value in the audit trail before it is overwritten.
    if resource == "config":
        await require_super_admin(profile)
        payload = _writable_payload(resource, body)
        previous = _jsonable(obj.value)
        new_key = payload.get("key", obj.key)
        new_value = payload.get("value", obj.value)
        if "key" in payload or "value" in payload:
            _validate_config(new_key, new_value)
        if "key" in payload:
            obj.key = payload["key"]
        if "value" in payload:
            obj.value = payload["value"]
        detail = {"previous": previous}
        if "value" in payload:
            detail["value"] = _jsonable(new_value)
        if "key" in payload and payload["key"] != item_id:
            detail["key"] = payload["key"]
        _write_audit(db, profile, "update", "config", item_id, detail)
        await db.commit()
        await db.refresh(obj)
        return _row_to_dict(obj)

    payload = _writable_payload(resource, body)
    for key, val in payload.items():
        setattr(obj, key, val)
    _write_audit(db, profile, "update", resource, item_id, {"fields": sorted(payload)})
    await db.commit()
    await db.refresh(obj)
    return _row_to_dict(obj)


@router.delete("/{resource}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource: str,
    item_id: str,
    profile: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    # #846 — tenant-wide / product-wide deletions need the top role. Catalog
    # rows and per-kid settings stay at the normal admin boundary.
    if resource in SUPER_ADMIN_DELETES:
        await require_super_admin(profile)
    obj = await db.get(model, _pk_value(model, item_id))
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    await db.delete(obj)
    _write_audit(db, profile, "delete", resource, item_id, {"id": item_id})
    await db.commit()
