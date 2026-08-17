"""📚 KOTHA — pgvector story-embedding model (#329).

Kept in its OWN module (not models.py) so the API always boots even where
`pgvector` isn't installed: this module degrades to `HAVE_VECTOR = False` and
`StoryEmbedding = None`, and every consumer checks the flag before touching the
table. When the package IS present the model maps `story_embeddings` — one row
per story, gte-small vector, unique story_id (which is what makes the embed
job idempotent).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, MetaData, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, declarative_base, mapped_column, relationship

try:
    from pgvector.sqlalchemy import Vector

    HAVE_VECTOR = True
except ImportError:  # pragma: no cover — exercised only on minimal installs
    HAVE_VECTOR = False
    Vector = None  # type: ignore[assignment]


# The `story_embeddings` table lives on its OWN metadata (not Base.metadata)
# so the startup `Base.metadata.create_all` never tries to CREATE it. The
# Postgres `vector` extension is a server-side requirement that postgres:16
# -alpine does NOT ship, so a DB without it would otherwise crash the whole
# API boot with `type "vector" does not exist` — even though the embed job
# (which also needs the optional sentence-transformers ML stack) is gracefully
# disabled anyway. The embed job creates this table LAZILY, only after it has
# confirmed `CREATE EXTENSION IF NOT EXISTS vector` succeeded.
embed_metadata = MetaData()
EmbedBase = declarative_base(metadata=embed_metadata)


if HAVE_VECTOR:
    from .config import settings  # noqa: E402 — lazy, only when pgvector exists
    from .models import LearningStory  # noqa: E402  (lazy, only when pgvector exists)

    # #948 — these defaults match the centralized values in config.py so an
    # encoder upgrade never silently drifts from the DB column definition.
    _MODEL_DEFAULT = settings.kotha_embed_model
    _DIM_DEFAULT = settings.kotha_embed_dim

    class StoryEmbedding(EmbedBase):
        """A gte-small vector for one story — derived data, rebuildable.
        `story_id` is unique, so re-running the embed job is always a no-op."""

        __tablename__ = "story_embeddings"

        id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        story_id: Mapped[uuid.UUID] = mapped_column(
            ForeignKey("learning_stories.id", ondelete="CASCADE"), unique=True, index=True
        )
        model: Mapped[str] = mapped_column(String, default=_MODEL_DEFAULT, server_default=_MODEL_DEFAULT)
        dim: Mapped[int] = mapped_column(Integer, default=_DIM_DEFAULT, server_default=str(_DIM_DEFAULT))
        embedding: Mapped[list[float]] = mapped_column(Vector(_DIM_DEFAULT))
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

        story: Mapped[LearningStory] = relationship()
else:  # pragma: no cover
    StoryEmbedding = None  # type: ignore[assignment]
