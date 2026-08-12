import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .db import Base


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    kids: Mapped[list["Kid"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    sessions: Mapped[list["Session"]] = relationship(back_populates="profile", cascade="all, delete-orphan")


class Kid(Base):
    __tablename__ = "kids"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String)
    avatar: Mapped[str | None] = mapped_column(String, nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    profile: Mapped[Profile] = relationship(back_populates="kids")
    mastery: Mapped[list["SkillMastery"]] = relationship(back_populates="kid", cascade="all, delete-orphan")
    settings: Mapped["KidSettings | None"] = relationship(back_populates="kid", cascade="all, delete-orphan")


class KidSettings(Base):
    """Per-kid parent controls — the single source of truth for what a kid
    can play and how long. A missing row means defaults (everything on,
    no limit)."""

    __tablename__ = "kid_settings"

    kid_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kids.id", ondelete="CASCADE"), primary_key=True)
    # None = all subjects enabled. A list hides every skill outside it.
    enabled_subjects: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    # None = no cap. 1..5 = hardest world a kid can reach (progress stays, UI hides above).
    max_band: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # None = no daily limit (minutes). Kid app gates play after the cap.
    daily_limit_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tts_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    music_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    kid: Mapped[Kid] = relationship(back_populates="settings")


class Session(Base):
    """A revocable login. The JWT carries `sid`; every authenticated request
    checks this row is still alive (revoked_at IS NULL), so "Sign out" and
    "Sign out all devices" actually kill tokens server-side — a leaked token
    dies the moment the parent revokes it, no waiting for JWT expiry."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    # SHA-256 of the signed token — the raw JWT is never stored, only a
    # one-way fingerprint so a DB leak can't be replayed as credentials.
    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True)
    user_agent: Mapped[str | None] = mapped_column(String, nullable=True)
    ip: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)

    profile: Mapped[Profile] = relationship(back_populates="sessions")


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title_en: Mapped[str] = mapped_column(String)
    title_bn: Mapped[str] = mapped_column(String)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    band: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str] = mapped_column(ForeignKey("subjects.id"))
    title: Mapped[str] = mapped_column(String)
    title_bn: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    common_core: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    nctb_code: Mapped[str | None] = mapped_column(String, nullable=True)
    class_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class SkillMastery(Base):
    __tablename__ = "skill_mastery"
    __table_args__ = (UniqueConstraint("kid_id", "skill_id", name="uq_kid_skill"),)

    kid_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kids.id", ondelete="CASCADE"), primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True)
    mastery: Mapped[float] = mapped_column(Float, default=0.0)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    last_practice: Mapped[datetime | None] = mapped_column(nullable=True)
    last_decay: Mapped[datetime] = mapped_column(server_default=func.now())

    kid: Mapped[Kid] = relationship(back_populates="mastery")


class LearningStory(Base):
    """📚 KOTHA (কথা — "the stories") — the RAG knowledge lake.

    Every meaningful learning moment is stored as a story: what the kid faced,
    how Moni diagnosed it, what we tried, and how it landed. Today it feeds
    Moni's per-kid plans; later it becomes the retrieval corpus for the big
    move (semantic search over thousands of real learning moments).

    `context` is a free JSONB envelope so we can grow the payload without
    migrations: the question text, the kid's answer, reaction timings, TTS,
    the exact Moni plan that ran, etc."""

    __tablename__ = "learning_stories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kid_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kids.id", ondelete="CASCADE"), index=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), index=True)
    game_id: Mapped[str] = mapped_column(String)
    # Moni's classification of a wrong round (fatigue|misconception|gap|guessing|slip)
    # or None when the round was correct.
    error_kind: Mapped[str | None] = mapped_column(String, nullable=True)
    misconception_code: Mapped[str | None] = mapped_column(String, nullable=True)
    # The Moni plan action taken this round (reteach|slow_down|break|encourage|...).
    action: Mapped[str | None] = mapped_column(String, nullable=True)
    outcome: Mapped[bool] = mapped_column(Boolean)  # correct this round
    difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wrong_streak: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Free envelope: question, kid's answer, reaction, tts, moni plan diff, ...
    context: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    kid: Mapped[Kid] = relationship()


class ProgressEvent(Base):
    __tablename__ = "progress_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kid_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kids.id", ondelete="CASCADE"), index=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    game_id: Mapped[str] = mapped_column(String)
    correct: Mapped[bool] = mapped_column(Boolean)
    response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    plan: Mapped[str] = mapped_column(String, default="free", server_default="free")
    store: Mapped[str | None] = mapped_column(String, nullable=True)
    store_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active", server_default="active")
    current_period_end: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    band: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class ConfigEntry(Base):
    __tablename__ = "config"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
