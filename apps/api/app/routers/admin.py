import json
import logging
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import (
    org_scoped,
    parse_org_id_header,
    parse_uuid,
    require_admin,
    require_super_admin,
    resolve_org_id,
)
from ..security import hash_password, password_bytes_ok
from ..models import (
    AdminAudit,
    Classroom,
    ConfigEntry,
    ContentItem,
    Kid,
    KidSettings,
    LearningStory,
    Organization,
    OrgMember,
    OrgSyllabus,
    Profile,
    ProgressEvent,
    Session,
    ShareToken,
    Skill,
    SkillMastery,
    Subscription,
    TenantConfig,
)
from ..ratelimit import rate_limit, read_rate_limit
from ..schemas import StorySearchIn, StorySearchOut
from ..story_embedding_model import HAVE_VECTOR, StoryEmbedding

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

log = logging.getLogger("numberverse.admin")

# #3118 — the generic admin CRUD routes previously depended on require_admin
# ALONE (no rate_limit at all), so a compromised/misused admin token could issue
# unbounded lists and writes. Admin is the most expensive endpoint class (every
# list ran a full-table COUNT(*)) yet had the least protection. Add the same
# account+IP write budget every other write surface carries, plus a read-tier
# budget for the list/get reads. The limiter deps resolve `get_current_profile`
# (cached per request) independently of `require_admin`'s role gate, so both the
# 403 role check AND the 429 budget apply.
ADMIN_WRITE_RATE_LIMIT = rate_limit()
ADMIN_READ_RATE_LIMIT = read_rate_limit()

# react-admin resources → model. Keys are the REST resource names.
WHITELIST: dict[str, type] = {
    "profiles": Profile,
    "kids": Kid,
    "kid_settings": KidSettings,
    "skills": Skill,
    "content_items": ContentItem,
    "config": ConfigEntry,
    "subscriptions": Subscription,
    # Multi-tenancy models (#961-#969)
    "organizations": Organization,
    "org_members": OrgMember,
    "tenant_config": TenantConfig,
    "org_syllabus": OrgSyllabus,
    "classrooms": Classroom,
    }

UUID_MODELS = {
    Profile, Kid, Subscription, KidSettings,
    Organization, OrgMember, TenantConfig, Classroom,
}

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
        # #1637 — profile_id deliberately ABSENT: ownership is set at creation
        # and must be immutable through this router (an org-admin must never be
        # able to reassign a child to a different family via PUT). coins stays
        # writable but is gated ge=0 in _validate_kids_payload.
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
        "org_id",
        "seats",
    },
    "organizations": {
        "name",
        "display_name",
        "slug",
        "is_active",
    },
    "org_members": {
        "org_id",
        "profile_id",
        "role",
    },
    "tenant_config": {
        "org_id",
        "brand_name",
        "logo_url",
        "primary_color",
        "accent_color",
        "domains",
        "default_locale",
        "feature_flags",
    },
    "org_syllabus": {
        "org_id",
        "skill_id",
        "subject_label",
        "grade_label",
        "sort_order",
        "enabled",
        "difficulty",
    },
    "classrooms": {
        "org_id",
        "name",
        "teacher_id",
        "is_active",
    },
}

# Never writable through this router, even if a future edit accidentally adds
# them to WRITABLE_FIELDS. `id` is set by the DB/URL; `is_admin` and `role`
# (#846) are authz flags; `password_hash` is credential material. Those may
# only change through the auth flows.
DENIED_WRITE_FIELDS = {"id", "is_admin", "role", "password_hash"}

# Models that carry an org_id column — these are automatically scoped to the
# caller's org context in generic CRUD operations (#968).  ClassroomKid is a
# composite-PK join table and is intentionally NOT in the admin WHITELIST
# (it is managed through the Classroom resource), so it is absent here too.
ORG_SCOPED_MODELS = {Organization, OrgMember, TenantConfig, OrgSyllabus, Classroom, Kid, Subscription}


# #847 — the config resource is a JSONB key/value store; the only key the
# product reads today is `adaptive` (progress._adaptive_params). Each known key
# documents its allowed value shape here so a typo can't silently break every
# learning round. This is deliberately NOT a generic JSON-schema engine — just
# the shapes we actually serve.
#
# NOTE: progress.py uses the COMPILED-IN DEFAULT_PARAMS (mirroring the offline
# kid app) and does NOT read this row — an admin tuning the parent-facing model
# without reaching the device would desync the two BKT estimates (#2). The full
# 5-param shape is still accepted so a future client-sync can carry it without a
# schema migration, but today it is reserved/archival.
CONFIG_SCHEMAS: dict[str, dict] = {
    "adaptive": {
        "type": "object",
        "required": ["pLearn", "pGuess", "pSlip", "decayPerDay", "masteryThreshold"],
        "properties": {
            "pLearn": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "pGuess": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "pSlip": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "decayPerDay": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "masteryThreshold": {"type": "number", "minimum": 0.0, "maximum": 1.0},
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


def _validate_kids_payload(payload: dict) -> None:
    """#1637 — kids-specific shape checks the generic allow-list can't express.

    `coins` is the kid's aggregate Nova wallet balance; it must never go
    negative through the admin console. The kid app's last-write-wins sync uses
    a monotonic wallet_seq, so an admin writing a negative floor would corrupt
    the wallet math and let a spend resurrect unlimited coins."""
    coins = payload.get("coins")
    if coins is None:
        return
    if isinstance(coins, bool) or not isinstance(coins, (int, float)) or coins < 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "coins must be >= 0")


def _pk_value(model: type, raw: str) -> Any:
    # #854 — UUID models receive the id as a plain path str; a malformed UUID
    # must never be an unhandled ValueError → 500. #1627 — the shared helper
    # enforces ONE 400 contract for every malformed client-supplied identifier
    # (path param, header, body); 422 stays reserved for schema-level body
    # validation only.
    if model in UUID_MODELS:
        return parse_uuid(raw, what="id")
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

# #1765 — semantic search runs an embedding model + pgvector scan per call,
# and /stories/embed runs the full batch encoder: both get a strict admin
# budget far below the 120/min parent write tier.
ADMIN_SEARCH_RATE_LIMIT = rate_limit(limit=20)   # 20/min — each call embeds + scans
ADMIN_EMBED_RATE_LIMIT = rate_limit(limit=10)    # 10/min — batch encode, heavy


@router.get("/stories/health")
async def stories_health(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    total = (await db.scalar(select(func.count()).select_from(LearningStory))) or 0

    # #944 — embedding backlog: stories NOT yet embedded (only meaningful when
    # pgvector is installed; otherwise report "N/A" so the operator sees the
    # gap instead of a misleading zero).
    if HAVE_VECTOR and StoryEmbedding is not None:
        embedded_ids = select(StoryEmbedding.story_id)
        backlog = (
            await db.scalar(
                select(func.count())
                .select_from(LearningStory)
                .where(LearningStory.id.not_in(embedded_ids))
            )
        ) or 0
    else:
        backlog = -1  # marker: pgvector not available

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
    # #944 — surface embedding backlog so an operator sees the lag even when
    # the embed job is silently skipping.
    if backlog == -1:
        warnings.append("pgvector not installed — embedding unavailable; all stories lack vectors.")
    elif backlog > 0:
        warnings.append(f"Embedding backlog: {backlog} stories pending (pgvector ready but unembedded).")

    return {
        "total": total,
        "embedding_backlog": backlog,
        "embedding_backlog_note": "pgvector not available" if backlog == -1 else "stories pending embedding",
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
async def embed_stories_now(
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _limiter: Annotated[Profile, Depends(ADMIN_EMBED_RATE_LIMIT)] = None,
):
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
    _limiter: Annotated[Profile, Depends(ADMIN_SEARCH_RATE_LIMIT)] = None,
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

    # #949 — define the allowlist of context keys that are safe to return in
    # semantic search results. Everything else in the stored JSONB envelope is
    # excluded by construction — no regex, no best-effort redaction.
    _CONTEXT_ALLOWLIST = frozenset({
        "question", "wrongAnswer", "correctAnswer", "reason", "message",
        "skill", "misconception", "planAction", "gameState",
    })

    story_ids = [r[0] for r in raw]
    dists = [r[1] for r in raw]
    stories = await db.scalars(select(LearningStory).where(LearningStory.id.in_(story_ids)))
    by_id = {s.id: s for s in stories}
    hits = []
    for sid, dist in zip(story_ids, dists):
        s = by_id.get(sid)
        if not s:
            continue
        raw_context = s.context or {}
        safe_context = {k: raw_context[k] for k in _CONTEXT_ALLOWLIST if k in raw_context}
        hits.append(
            StorySearchHit(
                similarity=round(1.0 - float(dist), 4),
                skill_id=s.skill_id,
                game_id=s.game_id,
                outcome=s.outcome,
                error_kind=s.error_kind,
                misconception_code=s.misconception_code,
                action=s.action,
                context=safe_context,
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
    pruned_total = await _prune_stories(db)
    return {
        "pruned": pruned_total,
        "retention_days": settings.kotha_retention_days,
        "active_skill_days": settings.kotha_active_skill_days,
        "max_stories_per_kid": settings.kotha_max_stories_per_kid,
    }


async def _prune_stories(db: AsyncSession) -> int:
    """#950 — shared prune logic used by the admin endpoint and the scheduled
    embed-loop prune. Returns total number of stories pruned."""
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

    # #943 — orphan story_embeddings sweep: when the FK cascade is absent (e.g.
    # the story_embeddings table was migrated without the ON DELETE CASCADE
    # declaration), pruning a story leaves orphan vector rows that waste storage
    # and produce phantom top-K hits. This explicit sweep is idempotent — it only
    # deletes embedding rows whose parent story no longer exists.
    if HAVE_VECTOR and StoryEmbedding is not None:
        orphan_result = await db.execute(
            text(
                "DELETE FROM story_embeddings "
                "WHERE story_id NOT IN (SELECT id FROM learning_stories)"
            )
        )
        orphan_pruned = orphan_result.rowcount or 0
        if orphan_pruned:
            log.warning("prune orphan sweep: removed %d stray story_embeddings rows", orphan_pruned)
    else:
        orphan_pruned = 0

    await db.commit()
    return age_pruned + cap_pruned


async def _prune_progress_events(db: AsyncSession) -> int:
    """#983 — shared prune logic used by the admin endpoint and the scheduled
    embed-loop prune. Mirrors the prune_stories policy: drop rows older than
    `progress_retention_days`, then trim every kid to its most recent
    `max_progress_events_per_kid` events. Commits; returns total pruned."""
    now = datetime.now(timezone.utc)
    retention = timedelta(days=settings.progress_retention_days)
    cap = settings.max_progress_events_per_kid
    age_cutoff = now - retention

    # #3074 — rank and age-prune by the round's ACTUAL play time, not insertion
    # order. Events synced from a long offline backlog are INSERTed with the
    # highest `id`s even though they are the OLDEST by round time; ranking by
    # `id DESC` would keep those stale rows and evict genuinely-fresher rounds
    # that happened to be inserted earlier. Coalesce client_ts → epoch-ms
    # timestamp → created_at (the same precedence the read paths use) so the
    # cap keeps the most-recent BY PLAY TIME and the 90-day window drops the
    # oldest-by-round-time events, not the oldest-by-sync-time ones.
    occurred = func.coalesce(
        ProgressEvent.client_ts,
        func.to_timestamp(ProgressEvent.timestamp / 1000.0),
        ProgressEvent.created_at,
    )

    # 1) Age prune
    age_result = await db.execute(
        delete(ProgressEvent).where(occurred < age_cutoff)
    )
    age_pruned = age_result.rowcount or 0

    # 2) Volume guard per kid
    ranked = (
        select(
            ProgressEvent.id,
            func.row_number().over(
                partition_by=ProgressEvent.kid_id,
                order_by=(occurred.desc(), ProgressEvent.id.desc()),
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
    return age_pruned + cap_pruned


@router.post("/progress/prune")
async def prune_progress_events(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """#983 — retention job for progress_events (shared logic in
    `_prune_progress_events`)."""
    pruned = await _prune_progress_events(db)
    return {
        "pruned": pruned,
        "retention_days": settings.progress_retention_days,
        "max_events_per_kid": settings.max_progress_events_per_kid,
    }


# #984 — purge revoked sessions older than N days. Session rows carry ip +
# user_agent (the two fields PRIVACY.md flags as 'nice-to-have PII'), so they
# must not accumulate forever once revocation removes their purpose.
async def _purge_revoked_sessions(db: AsyncSession) -> int:
    """#984 — shared purge logic used by the admin endpoint and the scheduled
    embed-loop prune. Hard-deletes Session rows revoked more than
    `session_purge_days` ago (default 30d) so stale IP/UA PII is gone once
    revocation is settled. Commits; returns rows purged."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.session_purge_days)
    result = await db.execute(
        delete(Session).where(
            Session.revoked_at.is_not(None),
            Session.revoked_at < cutoff,
        )
    )
    purged = result.rowcount or 0
    await db.commit()
    return purged


@router.post("/sessions/purge-revoked")
async def purge_revoked_sessions(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """#984 — hard-delete Session rows that were revoked more than N days ago.
    Default 30 days: stale IP/UA PII is gone once revocation is settled."""
    purged = await _purge_revoked_sessions(db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.session_purge_days)
    return {"purged": purged, "cutoff": cutoff.isoformat()}


# #3057 — share links expire: prune share_tokens whose `created_at` is older than
# `share_token_ttl_days`, OR whose `revoked_at` is older than the same TTL. The
# read path already 404s expired tokens; this sweep removes the rows so they
# never accumulate while the scheduled job runs unattended.
async def _prune_share_tokens(db: AsyncSession) -> int:
    """#3057 — shared prune logic used by the admin endpoint and the scheduled
    embed-loop prune. Deletes share_tokens past the TTL (expired or long-revoked).
    Commits; returns rows pruned."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.share_token_ttl_days)
    result = await db.execute(
        delete(ShareToken).where(
            ShareToken.created_at < cutoff
        )
    )
    pruned = result.rowcount or 0
    await db.commit()
    return pruned


@router.post("/share-tokens/prune")
async def prune_share_tokens(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """#3057 — manual trigger for the share-token expiry sweep (shared logic in
    `_prune_share_tokens`)."""
    pruned = await _prune_share_tokens(db)
    return {"pruned": pruned, "ttl_days": settings.share_token_ttl_days}


# #840 — caps for the generic admin list_resource. react-admin sends
# `?filter`, `?sort` and `?range` as JSON query params; without limits a
# crafted `?range=[0,999999]` (or an arbitrarily deep filter) could force
# unbounded work / a full-table pull.
MAX_RANGE_ROWS = 500
MAX_FILTER_KEYS = 10
MAX_FILTER_LIST_LEN = 100  # #1647/#1801 — an IN-clause value list is bounded too
MAX_SORT_COLUMNS = 1


def _escape_like_literal(term: str) -> str:
    """#1799 — escape SQL LIKE/ILIKE wildcards so a `~` filter matches user
    input LITERALLY instead of as a pattern.

    A `~` filter becomes `col.ilike(f"%{value}%")`; if the value contains a
    Postgres wildcard (`%` or `_`) it is interpreted as a pattern, so a `~%`
    filter matches EVERY row. Escape `%`, `_`, and the escape char itself with
    the ESCAPE clause's `\\`, so user input is matched literally."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/{resource}")
async def list_resource(
    resource: str,
    request: Request,
    sort: str = None,
    range: str = None,
    filter: str = None,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _rl: Profile = Depends(ADMIN_READ_RATE_LIMIT),
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
    # #968 — auto-scope org-tenant models: if the model has an org_id column,
    # apply the current request's org context (from X-Org-ID header or resolved
    # org membership).  Global admins (profile.is_admin) with NO X-Org-ID see
    # all rows across all orgs; otherwise the filter is applied automatically.
    org_id = getattr(request.state, "org_id", None)
    if org_id is None and model in ORG_SCOPED_MODELS:
        org_id = parse_org_id_header(request)  # #1628 — one parser for X-Org-ID
    if org_id is not None:
        if model is Organization:
            # Organization has no org_id column — its PK *is* the tenant id.
            # An org-scoped caller only ever sees their own org row.
            stmt = stmt.where(Organization.id == org_id)
        else:
            stmt = org_scoped(stmt, org_id)
        # Harden: reject filters that try to set a different org_id.
        if "org_id" in filter_dict and filter_dict["org_id"] != str(org_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot filter by a different org_id")
        # Remove org_id from filter_dict so it doesn't double-apply.
        filter_dict.pop("org_id", None)

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
            # #1799 — escape `%`/`_`/`\` in the filter value so the ILIKE treats
            # them literally; the ESCAPE clause makes the backslash the escape
            # char. Without this a `~%` filter (react-admin "contains" on a
            # literal percent) matches EVERY row.
            stmt = stmt.where(col.ilike(f"%{_escape_like_literal(val[1:])}%", escape="\\"))
        elif isinstance(val, list):
            # #1801 — an arbitrary-length list becomes an unbounded parameterized
            # IN clause; cap it like the other resource-exhaustion guards.
            if len(val) > MAX_FILTER_LIST_LEN:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"Filter list too long (max {MAX_FILTER_LIST_LEN} values)",
                )
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
    # #3118 — the full-table COUNT(*) total used to run on EVERY list call even
    # when the client sent no `range` (no Content-Range header requested), so a
    # paged list of profiles/skills forced a repeated full-table scan for a total
    # it never surfaced. Only compute the total when the caller actually asked
    # for a range; a range-less list skips it entirely.
    if start is not None:
        total = (await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0
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
    request: Request,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _rl: Profile = Depends(ADMIN_READ_RATE_LIMIT),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    # #968 — org-scoped fetch: if the model carries org_id, scope the PK lookup.
    if model in ORG_SCOPED_MODELS:
        pk_cols = list(model.__table__.primary_key.columns)
        pk = _pk_value(model, item_id)
        # #1622 regression — the PK lookup must reference the COLUMN, not its
        # name string (`.keys()[0]` is a str, so `'id' == pk` compiled to
        # `WHERE false` and every org-scoped GET 404'd).
        stmt = select(model).where(pk_cols[0] == pk)
        org_id = getattr(request.state, "org_id", None)
        if org_id is None:
            org_id = parse_org_id_header(request)  # #1628 — one parser for X-Org-ID
        if org_id is not None:
            if model is Organization:
                stmt = stmt.where(Organization.id == org_id)
            else:
                stmt = org_scoped(stmt, org_id)
        obj = await db.scalar(stmt)
    else:
        obj = await db.get(model, _pk_value(model, item_id))
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return _row_to_dict(obj)


@router.post("/{resource}", status_code=status.HTTP_201_CREATED)
async def create_resource(
    resource: str,
    body: dict,
    request: Request,
    profile: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _rl: Profile = Depends(ADMIN_WRITE_RATE_LIMIT),
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
        try:
            await db.flush()
            _write_audit(db, profile, "create", "config", key, {"value": _jsonable(value)})
            await db.commit()
        except IntegrityError:
            # #1625 — same 409 contract as the generic create path.
            await db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Resource already exists") from None
        await db.refresh(obj)
        return _row_to_dict(obj)

    payload = _writable_payload(resource, body)
    # #967 — string-PK catalog rows (skills, content_items) carry a
    # CLIENT-supplied natural key: `id` is the catalog id, not a server-assigned
    # surrogate. `_writable_payload`'s mass-assignment guard strips `id`, so
    # restore it here for models whose PK is a client string (anything not in
    # UUID_MODELS) — otherwise every create would flush a NULL PK and fail.
    if model not in UUID_MODELS and body.get("id") is not None:
        payload["id"] = body["id"]
    # #968 — org-scoped create: for ORG_SCOPED_MODELS, force-bind org_id from
    # the request context and reject a caller-supplied org_id that differs.
    if model in ORG_SCOPED_MODELS:
        if model is Organization:
            # Organizations are created by global admins, never "within" an org.
            # If an org context is present, reject the create outright.
            org_ctx = getattr(request.state, "org_id", None) or request.headers.get("X-Org-ID")
            if org_ctx:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "Organizations can only be created by a global admin",
                )
        else:
            org_id = getattr(request.state, "org_id", None)
            if org_id is None:
                org_id = parse_org_id_header(request)  # #1628 — one parser for X-Org-ID
            if org_id is not None:
                if "org_id" in payload and payload["org_id"] is not None:
                    # #1624/#1627 — a malformed caller-supplied body org_id is a
                    # 400 (shared helper), never an unhandled ValueError → 500.
                    if parse_uuid(payload["org_id"], what="org_id") != org_id:
                        raise HTTPException(
                            status.HTTP_403_FORBIDDEN,
                            "Cannot create resource for a different organization",
                        )
                payload["org_id"] = org_id

    if resource == "kids":
        _validate_kids_payload(payload)

    obj = model(**payload)
    db.add(obj)
    try:
        await db.flush()  # populate server-assigned PKs (UUID) before auditing
        _write_audit(db, profile, "create", resource, _obj_pk(obj), {"fields": sorted(payload)})
        await db.commit()
    except IntegrityError:
        # #1625 — a duplicate unique key / FK / CHECK violation is a clean 409
        # Conflict (mirroring /auth/signup), never a bare 500. The constraint
        # name is deliberately NOT echoed — no internal schema leaks.
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Resource already exists") from None
    await db.refresh(obj)
    return _row_to_dict(obj)


async def _org_scoped_get(
    model: type,
    item_id: str,
    request: Request,
    db: AsyncSession,
) -> Any:
    """#968 — fetch an org-scoped row with automatic tenant filter.

    Used by update_resource and delete_resource to ensure cross-org access
    is prevented.  For single-column PK models, the org filter is applied
    via ``org_scoped``.  For composite PK models (e.g. ClassroomKid), falls
    back to ``db.get()`` since the item_id in the URL is a single value.
    """
    pk_cols = list(model.__table__.primary_key.columns)
    if len(pk_cols) == 1:
        pk = _pk_value(model, item_id)
        stmt = select(model).where(pk_cols[0] == pk)
        org_id = getattr(request.state, "org_id", None)
        if org_id is None:
            org_id = parse_org_id_header(request)  # #1628 — one parser for X-Org-ID
        if org_id is not None:
            if model is Organization:
                stmt = stmt.where(Organization.id == org_id)
            else:
                stmt = org_scoped(stmt, org_id)
        return await db.scalar(stmt)
    # Composite PK: fall back to plain db.get (no org scoping on the PK
    # lookup, but the model's org_id column will be validated by the caller).
    return await db.get(model, _pk_value(model, item_id))


@router.put("/{resource}/{item_id}")
async def update_resource(
    resource: str,
    item_id: str,
    body: dict,
    request: Request,
    profile: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _rl: Profile = Depends(ADMIN_WRITE_RATE_LIMIT),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    # #968 — org-scoped fetch for tenant models.
    if model in ORG_SCOPED_MODELS:
        obj = await _org_scoped_get(model, item_id, request, db)
    else:
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
        try:
            await db.commit()
        except IntegrityError:
            # #1625 — same 409 contract as the generic update path.
            await db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Resource already exists") from None
        await db.refresh(obj)
        return _row_to_dict(obj)

    payload = _writable_payload(resource, body)
    if resource == "kids":
        _validate_kids_payload(payload)
    # #968 — org-scoped update: prevent overwriting org_id to a different value.
    # #1627/#1628 — a malformed body/header org_id is a 400 via the shared
    # parsers, never an unhandled ValueError → 500.
    if model in ORG_SCOPED_MODELS and "org_id" in payload and payload["org_id"] is not None:
        org_id = getattr(request.state, "org_id", None)
        if org_id is None:
            org_id = parse_org_id_header(request)
        if org_id is not None and parse_uuid(payload["org_id"], what="org_id") != org_id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Cannot move resource to a different organization",
            )
    for key, val in payload.items():
        setattr(obj, key, val)
    try:
        _write_audit(db, profile, "update", resource, item_id, {"fields": sorted(payload)})
        await db.commit()
    except IntegrityError:
        # #1625 — a duplicate unique key / FK / CHECK violation is a clean 409
        # Conflict (mirroring /auth/signup), never a bare 500.
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Resource already exists") from None
    await db.refresh(obj)
    return _row_to_dict(obj)


@router.delete("/{resource}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource: str,
    item_id: str,
    request: Request,
    profile: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _rl: Profile = Depends(ADMIN_WRITE_RATE_LIMIT),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    # #846 — tenant-wide / product-wide deletions need the top role. Catalog
    # rows and per-kid settings stay at the normal admin boundary.
    if resource in SUPER_ADMIN_DELETES:
        await require_super_admin(profile)
    # #968 — org-scoped fetch for tenant models.
    if model in ORG_SCOPED_MODELS:
        obj = await _org_scoped_get(model, item_id, request, db)
    else:
        obj = await db.get(model, _pk_value(model, item_id))
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    await db.delete(obj)
    _write_audit(db, profile, "delete", resource, item_id, {"id": item_id})
    await db.commit()


class AdminResetPasswordIn(BaseModel):
    """#1586 — operator-assisted parent password recovery.

    This box has NO SMTP, so a locked-out parent cannot self-serve an email
    reset. An admin resets the password here and relays the new secret to the
    parent out-of-band. Same 8..72 password policy as every other auth flow."""

    new_password: str = Field(min_length=8, max_length=72)


@router.post(
    "/parents/{parent_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def reset_parent_password(
    parent_id: uuid.UUID,
    body: AdminResetPasswordIn,
    profile: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """#1586 — ADMIN-ONLY parent-password recovery (operator-assisted).

    The service cannot send email, so there is deliberately no self-serve
    forgot-password. An authenticated admin (or super-admin) resets a locked-out
    parent's password; the operator relays the temporary secret out-of-band.
    The parent's existing sessions are revoked so a stale/leaked token dies at
    once, and the row is flipped to `local` so a Google-only account can log in
    with the new password too. Credential material is never returned or
    audited — `_write_audit` never receives the hash or the plaintext."""
    if not password_bytes_ok(body.new_password):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Password too long (max 72 bytes)",
        )
    target = await db.get(Profile, parent_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent not found")
    target.password_hash = hash_password(body.new_password)
    # #1487 — a Google-created parent has an un-knowable random hash; a real
    # password makes email/password login work from now on.
    target.auth_provider = "local"
    now = datetime.now(timezone.utc)
    sessions = (
        await db.scalars(
            select(Session).where(
                Session.profile_id == target.id,
                Session.revoked_at.is_(None),
            )
        )
    ).all()
    for s in sessions:
        s.revoked_at = now
    # #865 — legacy no-sid tokens have no sessions row; stamp the cutoff so any
    # token minted on or before this reset is rejected on its next request.
    target.legacy_sessions_revoked_at = now
    _write_audit(db, profile, "reset-password", "profiles", target.id)
    await db.commit()
