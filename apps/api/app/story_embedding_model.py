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

from sqlalchemy import ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

try:
    from pgvector.sqlalchemy import Vector

    HAVE_VECTOR = True
except ImportError:  # pragma: no cover — exercised only on minimal installs
    HAVE_VECTOR = False
    Vector = None  # type: ignore[assignment]


if HAVE_VECTOR:
    from .models import LearningStory  # noqa: E402  (lazy, only when pgvector exists)

    class StoryEmbedding(Base):
        """A gte-small vector for one story — derived data, rebuildable.
        `story_id` is unique, so re-running the embed job is always a no-op."""

        __tablename__ = "story_embeddings"

        id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        story_id: Mapped[uuid.UUID] = mapped_column(
            ForeignKey("learning_stories.id", ondelete="CASCADE"), unique=True, index=True
        )
        model: Mapped[str] = mapped_column(String, default="thenlper/gte-small", server_default="thenlper/gte-small")
        dim: Mapped[int] = mapped_column(Integer, default=384, server_default="384")
        embedding: Mapped[list[float]] = mapped_column(Vector(384))
        created_at: Mapped[datetime] = mapped_column(server_default=func.now())

        story: Mapped[LearningStory] = relationship()
else:  # pragma: no cover
    StoryEmbedding = None  # type: ignore[assignment]
