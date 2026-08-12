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

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .models import LearningStory
from .story_embedding_model import HAVE_VECTOR, StoryEmbedding

log = logging.getLogger("numberverse.embed")

EMBED_MODEL = "thenlper/gte-small"
EMBED_DIM = 384
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

    embedded_ids = select(StoryEmbedding.story_id)
    pending = (
        await db.scalars(
            select(LearningStory)
            .where(LearningStory.id.not_in(embedded_ids))
            .order_by(LearningStory.created_at.desc())
            .limit(limit)
        )
    ).all()
    if not pending:
        return {"status": "ok", "embedded": 0, "pending": 0}

    vectors = encoder.encode(  # type: ignore[union-attr]  # encoder is not None here
        [_story_text(s) for s in pending],
        batch_size=EMBED_BATCH,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
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
