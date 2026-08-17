"""📚 KOTHA embed job (#329) — batch-embed new stories with gte-small.

Design:
  - Idempotent: only stories WITHOUT an embedding row are picked, and we
    INSERT … ON CONFLICT (story_id) DO NOTHING. Re-running is always a no-op.
  - Self-healing: gte-small is loaded lazily via sentence-transformers (an
    opt-in extra — `pip install "numberverse-api[embeddings]"`), and the model
    module degrades when `pgvector` is absent. If the model, the Python package
    OR the Postgres `vector` extension is missing, the job reports `skipped`
    instead of failing — the API never crashes on a missing ML stack.
  - PII-safe text: we embed the story's CONTEXT envelope (question, the kid's
    wrong answer, Moni's reason) plus skill/game ids — never names, never kid
    ids. The corpus exists for retrieval, not identification.
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.schema import CreateTable

from .config import settings
from .models import LearningStory
from .story_embedding_model import HAVE_VECTOR, StoryEmbedding

log = logging.getLogger("numberverse.embed")

# #948 — EMBED_MODEL and EMBED_DIM are sourced from settings so the encoder
# can be changed in one place (config.py / NV_KOTHA_EMBED_MODEL env var)
# without silent drift between the embed job and the DB column.
EMBED_MODEL = settings.kotha_embed_model
EMBED_DIM = settings.kotha_embed_dim
EMBED_BATCH = 32
# How many unembedded stories a single job run may process (keeps the loop
# short and the DB happy; the scheduler just runs again).
EMBED_MAX_PER_RUN = 200

_encoder: object | None = None  # lazy singleton — keeps boot fast


def _load_encoder():
    """Load the gte-small encoder once. Raises when the ML stack is missing."""
    global _encoder
    if _encoder is None:
        from sentence_transformers import SentenceTransformer  # heavy — lazy

        _encoder = SentenceTransformer(EMBED_MODEL)
    return _encoder


def _story_text(story: LearningStory) -> str:
    """A retrieval-friendly text for one story — context, not identity."""
    ctx = story.context or {}
    parts: list[str] = []
    if story.skill_id:
        parts.append(f"skill {story.skill_id}")
    if story.game_id:
        parts.append(f"game {story.game_id}")
    question = ctx.get("question")
    if isinstance(question, str) and question:
        parts.append(question)
    wrong = ctx.get("wrongAnswer")
    if wrong is not None:
        parts.append(f"answer: {wrong}")
    reason = ctx.get("reason") or ctx.get("message")
    if isinstance(reason, str) and reason:
        parts.append(reason)
    return " · ".join(parts)


def embed_text(text: str) -> list[float] | None:
    """Embed ONE query text for semantic retrieval (#323). Returns the vector,
    or None when the ML stack is missing — callers report a clear error."""
    try:
        encoder = _load_encoder()
    except Exception as exc:  # noqa: BLE001 — a missing ML stack must not crash
        log.warning("embed model unavailable for search: %s", exc)
        return None
    vec = encoder.encode(  # type: ignore[union-attr]  # encoder is not None here
        [text], normalize_embeddings=True, show_progress_bar=False
    )
    return vec[0].tolist()


async def embed_stories(db: AsyncSession, limit: int = EMBED_MAX_PER_RUN) -> dict:
    """Embed the newest unembedded stories. Idempotent; returns a summary."""
    if not HAVE_VECTOR or StoryEmbedding is None:
        return {"status": "skipped", "reason": "pgvector package not installed"}
    try:
        encoder = _load_encoder()
    except Exception as exc:  # noqa: BLE001 — a missing ML stack must not crash
        log.warning("embed model unavailable: %s", exc)
        return {"status": "skipped", "reason": f"embedding model unavailable ({EMBED_MODEL})"}

    # The Postgres vector extension is a server-side requirement — ensure it
    # best-effort; a DB without it must not take the API down.
    try:
        await db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception as exc:  # noqa: BLE001
        log.warning("pgvector extension unavailable: %s", exc)
        return {"status": "skipped", "reason": "pgvector extension unavailable in database"}

    # The story_embeddings table is NOT part of Base.metadata (it lives on its
    # own embed_metadata), so startup create_all never touches it. Create it
    # here, lazily, now that the extension is confirmed present.
    try:
        await db.execute(CreateTable(StoryEmbedding.__table__, if_not_exists=True))
    except Exception as exc:  # noqa: BLE001
        log.warning("story_embeddings table unavailable: %s", exc)
        return {"status": "skipped", "reason": "story_embeddings table unavailable"}

    embedded_ids = select(StoryEmbedding.story_id)
    pending_q = (
        select(LearningStory)
        .where(LearningStory.id.not_in(embedded_ids))
        # #945 — FIFO: oldest stories first so no story is stuck behind a
        # never-ending stream of new ones (DESC let new stories jump the
        # queue and old stories could be pruned before they were ever embedded).
        .order_by(LearningStory.created_at.asc())
        .limit(limit)
    )
    pending = (await db.scalars(pending_q)).all()
    if not pending:
        return {"status": "ok", "embedded": 0, "pending": 0}

    # #945 — warn when the total backlog exceeds a significant multiple of
    # the per-run cap so an operator sees the gap growing.
    total_pending = (
        await db.scalar(
            select(func.count())
            .select_from(LearningStory)
            .where(LearningStory.id.not_in(embedded_ids))
        )
    ) or 0
    if total_pending > limit * 3:
        log.warning(
            "Kotha embed backlog: %d stories pending (per-run cap %d). "
            "The corpus may never catch up — consider increasing EMBED_MAX_PER_RUN "
            "or shortening the embed interval.",
            total_pending, limit,
        )

    vectors = encoder.encode(  # type: ignore[union-attr]  # encoder is not None here
        [_story_text(s) for s in pending],
        batch_size=EMBED_BATCH,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    # #948 — assert every returned vector matches the declared dimension so
    # an encoder upgrade that changes dimensionality is caught at insert time
    # (PG would throw a type mismatch anyway, but earlier = better).
    for v in vectors:
        if len(v) != EMBED_DIM:
            log.error(
                "Encoder output dim %d != expected EMBED_DIM %d. "
                "The embedding model (%s) produces vectors that don't match "
                "the Vector(%d) column. Aborting this tick "
                "to avoid silent data corruption.",
                len(v), EMBED_DIM, EMBED_MODEL, EMBED_DIM,
            )
            return {"status": "skipped", "reason": f"encoder dim mismatch: got {len(v)}, expected {EMBED_DIM}"}
    rows = [
        {"story_id": s.id, "model": EMBED_MODEL, "dim": EMBED_DIM, "embedding": v.tolist()}
        for s, v in zip(pending, vectors)
    ]
    stmt = pg_insert(StoryEmbedding).values(rows).on_conflict_do_nothing(index_elements=["story_id"])
    result = await db.execute(stmt)
    await db.commit()
    embedded = result.rowcount or 0
    log.info("Kotha embed job: %d new, %d already present", embedded, len(pending) - embedded)
    return {"status": "ok", "embedded": embedded, "pending": len(pending) - embedded}
