import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .db import Base


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    # #1487 — how this parent authenticates. "google" | "local" | None. NULL is
    # legacy/local behavior (pre-column rows are unknown, so they keep the old
    # password semantics). Google-created accounts get a random un-knowable
    # password_hash; this flag is how the portal avoids showing them a
    # change-password form that can never succeed.
    auth_provider: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # #846 — role boundary: "user" | "admin" | "super_admin". `is_admin` is kept
    # for backward compat while the console migrates to roles; a legacy is_admin
    # row still passes require_admin/require_super_admin.
    role: Mapped[str] = mapped_column(String(32), default="user", server_default="user")
    # #330 — parent opt-in: may this family's (anonymized) learning stories be
    # aggregated into cross-kid "classroom" insights? Default OFF. Aggregates
    # are computed only from opted-in families and carry zero kid identity.
    aggregate_opt_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # #906 — timestamps are timezone-aware UTC so app writes (aware) and the DB
    # never drift apart.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # #865 — kill switch for legacy pre-session ("no sid") tokens. Those tokens
    # have no sessions row to revoke, so logout-all / password change stamp this
    # cutoff instead. Any no-sid token minted on or before it is rejected on its
    # next request, even if it was never backfilled into the sessions table.
    legacy_sessions_revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # #985 — verifiable-parental-consent (VPC) audit trail: the version of the
    # consent presented, the moment it was given, and the method (e.g. "signup"
    # for click-through ToS at account creation, "create_kid" for child-specific
    # acknowledgement). No new PII — just an audit trail.
    consent_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_method: Mapped[str | None] = mapped_column(String(32), nullable=True)

    kids: Mapped[list["Kid"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    sessions: Mapped[list["Session"]] = relationship(back_populates="profile", cascade="all, delete-orphan")


class Kid(Base):
    __tablename__ = "kids"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String)
    avatar: Mapped[str | None] = mapped_column(String, nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # #9 — multi-device sync: the aggregate Nova coin balance (newest-wins max),
    # carried so a kid's wallet follows them across devices. Auto-migrated on
    # boot by migrations.py (server_default → populated rows get 0).
    coins: Mapped[int] = mapped_column(Integer, server_default="0", default=0)
    # #1804 — monotonic wallet version counter for last-write-wins spend sync.
    # Every coins mutation on the kid app bumps this; the server only accepts a
    # higher seq, so a spend (which lowers the balance) never resurrects.
    wallet_seq: Mapped[int] = mapped_column(Integer, server_default="0", default=0)
    # #245 — share-card deep link: a random opaque token minted on the parent's
    # first "share" (nullable until then). The token is UNGUESSABLE and only the
    # parent can request it; the public snapshot it unlocks carries NO identity.
    share_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    # #985 — per-kid consent acknowledgment. Separate from the parent's consent
    # so each child's record is independently auditable.
    consent_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_method: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # #961 — multi-tenancy: nullable FK so existing single-org rows keep working.
    # A NULL org_id means the kid belongs to a consumer (parent) profile only;
    # a non-NULL org_id ties the kid to a school/organization tenant.
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )

    profile: Mapped[Profile] = relationship(back_populates="kids")
    mastery: Mapped[list["SkillMastery"]] = relationship(back_populates="kid", cascade="all, delete-orphan")
    settings: Mapped["KidSettings | None"] = relationship(back_populates="kid", cascade="all, delete-orphan")


class KidSettings(Base):
    """Per-kid parent controls — the single source of truth for what a kid
    can play and how long. A missing row means defaults (everything on,
    no limit)."""

    __tablename__ = "kid_settings"
    # #915 — the 7-int and 7-window strings are Pydantic-validated at the API
    # boundary; these CHECK constraints mirror those shapes at the DB layer so
    # a direct row write (import, admin CRUD, future code paths) can't persist
    # a malformed value.
    __table_args__ = (
        CheckConstraint(
            "weekday_limits_min IS NULL OR weekday_limits_min ~ '^([0-9]{1,3},){6}[0-9]{1,3}$'",
            name="ck_kid_settings_weekday_limits_min",
        ),
        CheckConstraint(
            "quiet_windows IS NULL OR quiet_windows ~ "
            "'^(-|[0-9]{1,2}:[0-9]{2}-[0-9]{1,2}:[0-9]{2})"
            "(,(-|[0-9]{1,2}:[0-9]{2}-[0-9]{1,2}:[0-9]{2})){6}$'",
            name="ck_kid_settings_quiet_windows",
        ),
        CheckConstraint(
            "moni_strictness IS NULL OR moni_strictness IN ('gentle', 'steady', 'challenging')",
            name="ck_kid_settings_moni_strictness",
        ),
    )

    kid_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kids.id", ondelete="CASCADE"), primary_key=True)
    # None = all subjects enabled. A list hides every skill outside it.
    enabled_subjects: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    # None = no cap. 1..5 = hardest world a kid can reach (progress stays, UI hides above).
    max_band: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # None = no daily limit (minutes). Kid app gates play after the cap.
    daily_limit_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # #6 — per-day-of-week caps: comma-joined 7 ints "45,45,45,45,45,90,90"
    # (Mon..Sun; 0 = unlimited that day). None = fall back to daily_limit_min,
    # then to the kid-app defaults (45 school / 90 weekend). Auto-migrated by
    # #388 on an existing DB.
    weekday_limits_min: Mapped[str | None] = mapped_column(String, nullable=True)
    tts_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    music_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # #243 — per-kid volume balance (0..1). The parent portal sets these; the
    # kid app scales voice / sfx / music by them. Auto-migrated (server_default
    # "1" → existing rows get full volume, so nothing suddenly goes quiet).
    voice_volume: Mapped[float] = mapped_column(Float, default=1.0, server_default="1")
    sfx_volume: Mapped[float] = mapped_column(Float, default=1.0, server_default="1")
    music_volume: Mapped[float] = mapped_column(Float, default=1.0, server_default="1")
    # #248 — quiet hours: the app auto-lowers volume + gently dims during a
    # per-day schedule, NEVER hard-blocks play. `quiet_windows` is 7 comma-joined
    # "HH:MM-HH:MM" (Mon..Sun; "-" = no quiet time that day; start>end means
    # overnight, e.g. "20:00-07:00"). `quiet_volume` is the soft level (0.05..1),
    # `quiet_dim` toggles the gentle screen dim. Auto-migrated on boot.
    quiet_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    quiet_windows: Mapped[str | None] = mapped_column(String, nullable=True)
    quiet_dim: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    quiet_volume: Mapped[float] = mapped_column(Float, default=0.15, server_default="0.15")
    # #138 — kid voice recording (record own voice + replay). PARENT-gated,
    # privacy-first: off by default, on-device only (never synced).
    voice_record_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # #256 — gentle daily playtime GOAL (minutes), parent-set. Nova nudges the
    # kid toward it without pressure; the server clamps it to the day's cap so
    # a goal never exceeds the hard limit. null/0 = no goal. Auto-migrated.
    goal_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # #257 — curriculum focus pin: a subject + world band the parent wants the
    # journey to prioritize. Both-or-neither (the router clears a lone half);
    # null/null = normal journey order. Auto-migrated.
    focus_subject: Mapped[str | None] = mapped_column(String, nullable=True)
    focus_band: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # #258 — per-kid VOICE preference: which tone reads aloud + how fast.
    # `voice_tone` is a stable handle ("female"|"kid"|"soft"|"warm"; null = the
    # kid app's default warm-female). `voice_speed` is a Web-Speech rate
    # multiplier (0.8/1.0/1.2; null = normal — the neural Bangla voice's tempo
    # is baked into its model, so speed only scales the Web-Speech path).
    # Auto-migrated (both nullable → existing rows keep their defaults).
    voice_tone: Mapped[str | None] = mapped_column(String, nullable=True)
    voice_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    # #272 — SAFETY: parent kill-switch. One-tap instant pause of a kid's
    # games; the app shows a kid-safe "learning break" screen and blocks play
    # until the parent resumes. Survives reload (served with settings, cached
    # on-device). Auto-migrated (server_default "false" → existing kids run).
    paused: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # #1041/#1042/#1043 — parent-adjustable MONI STRICTNESS: the difficulty
    # knob. "gentle" | "steady" | "challenging" — how hard the adaptive tutor
    # pushes this kid (planner.ts shifts difficulty −1/+1 + tone). NULL = no
    # parent choice → Moni uses its OWN automatic read (fragile→gentle /
    # sharp→challenging / else steady). #1050: the old server_default "steady"
    # pinned EVERY fresh kid to steady and silently overrode the auto tone, so
    # a fragile kid was never gentled. Only an EXPLICIT parent choice pins the
    # tone now. SYNCED: the parent portal sets it, the kid app pulls it on
    # every settings fetch so the parent's choice applies on every device, and
    # the kid app's own parent area pushes it back up (device-local was the
    # #1043 bug). Legacy rows keep their stored value; new rows default NULL.
    moni_strictness: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # #1044 — per-subject difficulty deltas (subject id → signed ±2 level
    # offset) layered on top of Moni's global strictness. A JSON object the
    # parent portal stepper writes; the kid app expands each subject onto its
    # skills and folds them into moni.plan()'s perSkillDeltas. NULL = no
    # parent per-subject choice (skills keep Moni's automatic difficulty).
    moni_subject_deltas: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    profile: Mapped[Profile] = relationship(back_populates="sessions")


class RateLimitBucket(Base):
    """#772 — durable rate-limit state shared by every API worker.

    The original limiter lived in a per-process dict, so a restart or a
    second uvicorn worker silently reset every window and lockout. This table
    stores each key's fixed-window count and (for credential endpoints) its
    lockout expiry in Postgres so the limits survive restarts and are shared
    across workers. Fixed windows are deliberate: they are simpler to make
    atomic with an upsert and are more than strict enough for abuse control.
    """

    __tablename__ = "rate_limit_buckets"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    # #913 — global master lib rows have tenant_id NULL; tenant-owned rows are
    # scoped to a profile and cascade away with that profile.
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title_en: Mapped[str] = mapped_column(String)
    title_bn: Mapped[str] = mapped_column(String)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    # #913 — global master lib rows have tenant_id NULL; tenant-owned rows are
    # scoped to a profile and cascade away with that profile.
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True, index=True
    )
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
    last_practice: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_decay: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # #79 — the moment the skill FIRST crossed ≥80% mastery (set once, never
    # cleared). Feeds the parent's "mastery timeline" — when each skill was won.
    mastered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
    # Dedup key (#331): the client's durable-outbox uid for this story. Unique
    # per kid so a replayed batch (lost ACK → same uid re-posted) is a no-op.
    # NULL for pre-dedup rows — Postgres lets many NULLs coexist in a unique
    # constraint, so legacy rows never collide.
    __table_args__ = (
        UniqueConstraint("kid_id", "uid", name="uq_learning_story_kid_uid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    uid: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
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
    # #908 — indexed for time-window analytics / rate-limit / retention queries.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    kid: Mapped[Kid] = relationship()


class AccelerationLog(Base):
    """🚀 #249 — acceleration plan log: every skill a kid "skipped ahead" and WHY
    (already-knew-it / too-easy / moving-on). The parent portal renders these as
    the kid's acceleration plan so a grown-up can see (and trust) how far ahead
    the kid jumped. `band_from`/`band_to` show the jump across world bands.
    Dedup on the client's durable-outbox uid, exactly like learning_stories."""

    __tablename__ = "acceleration_log"
    __table_args__ = (
        UniqueConstraint("kid_id", "uid", name="uq_accel_kid_uid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    uid: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    kid_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kids.id", ondelete="CASCADE"), index=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), index=True)
    # easy | know | moving-on | parent — why the kid (or parent) skipped it.
    reason: Mapped[str] = mapped_column(String(32))
    band_from: Mapped[int] = mapped_column(Integer)
    band_to: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    kid: Mapped[Kid] = relationship()


class ProgressEvent(Base):
    __tablename__ = "progress_events"
    # #907 — the activity feed is "recent N events for one kid", ordered by
    # (created_at desc, id desc); (kid_id, id) lets the planner satisfy the
    # kid filter + the id tiebreaker in one scan.
    # #1023 — dedup key: the client's durable-outbox uid for this round. Unique
    # per kid so a replayed batch (lost ACK → same uid re-posted) is a no-op
    # instead of a duplicate row + double-counted BKT mastery. NULL for
    # pre-dedup rows — Postgres lets many NULLs coexist in a unique constraint.
    __table_args__ = (
        Index("ix_progress_events_kid_id_id", "kid_id", "id"),
        UniqueConstraint("kid_id", "uid", name="uq_progress_events_kid_uid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    uid: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    kid_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kids.id", ondelete="CASCADE"), index=True)
    # #914 — joined/filtered against skills (worksheets, analytics); keep an
    # index so those joins don't scan the whole event log.
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), index=True)
    game_id: Mapped[str] = mapped_column(String)
    correct: Mapped[bool] = mapped_column(Boolean)
    response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    # #1024 — the client's event timestamp (epoch ms). Was silently dropped
    # server-side; preserved here so the activity feed / weekly report can use
    # the round's real time. NULL for legacy rows (feed falls back to created_at).
    timestamp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Subscription(Base):
    __tablename__ = "subscriptions"
    # #909 — one billing subscription per profile. The seed used a Python-if
    # check, which two racing boots could both pass; the DB now enforces it.
    __table_args__ = (
        UniqueConstraint("profile_id", name="uq_subscriptions_profile_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    # #969 — B2B: org-level subscriptions (school/bulk license).  NULL means
    # this is a consumer subscription (profile-scoped).
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # #969 — seat count for org-level licenses (how many kids/profiles covered).
    seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    plan: Mapped[str] = mapped_column(String, default="free", server_default="free")
    store: Mapped[str | None] = mapped_column(String, nullable=True)
    store_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active", server_default="active")
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped[Profile] = relationship()


class PushSubscription(Base):
    """#1534 — Web Push subscriptions (the browser Push API endpoint + keys).

    Deliberately a SEPARATE table from the billing `Subscription` model above
    (`subscriptions`): that table is plan/store billing rows enumerated by the
    admin console, and a naive reuse would stuff browser endpoints into a plan
    count. `endpoint` is unique globally — each browser/device subscription can
    only belong to one parent profile; re-subscribing with the same endpoint
    updates its keys, while a different profile claiming it gets a 409.
    `p256dh`/`auth` are secret client keys and are never returned by list routes.
    """

    __tablename__ = "push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(Text)
    auth: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped[Profile] = relationship()


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    # #913 — global master lib rows have tenant_id NULL; tenant-owned rows are
    # scoped to a profile and cascade away with that profile.
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    band: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ConfigEntry(Base):
    """Global + per-tenant config store. A row with tenant_id=NULL is a global
    default; a row with tenant_id=<profile UUID> is a per-org override. The
    resolve_config(tenant_id) helper merges them: global defaults first, then
    per-tenant overrides layered on top, so a school can set its own default_locale
    ('bn'|'en'), teacher_view, offline flags, branding keys, etc. without touching
    the global config."""

    __tablename__ = "config"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    # NULL = global default; non-NULL = per-tenant override (cascades away with
    # the profile so org deletion cleans up its config).
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True, index=True
    )
    value: Mapped[dict] = mapped_column(JSONB)
    default_locale: Mapped[str | None] = mapped_column(String(8), nullable=True,
        comment="Per-org default locale override ('bn'|'en'); NULL = use global")
    feature_flags: Mapped[dict | None] = mapped_column(JSONB, nullable=True,
        comment="Per-org feature flag overrides (teacher_view, offline, etc.)")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def resolve_config(tenant_id: uuid.UUID | None, session) -> dict:
    """Merge global ConfigEntry defaults with per-tenant overrides.

    Returns a single dict: global keys first, then any per-tenant keys layered
    on top (tenant wins on conflict). Handles the common case where only global
    config exists (no per-tenant rows) for single-tenant deployments.
    """
    result: dict[str, object] = {}
    # 1. Gather all global entries (tenant_id IS NULL).
    global_rows = session.query(ConfigEntry).filter(
        ConfigEntry.tenant_id.is_(None)
    ).all()
    for row in global_rows:
        result[row.key] = row.value
        if row.default_locale:
            result.setdefault("default_locale", row.default_locale)
        if row.feature_flags:
            result.setdefault("feature_flags", row.feature_flags)
    # 2. Layer per-tenant overrides on top.
    if tenant_id is not None:
        tenant_rows = session.query(ConfigEntry).filter(
            ConfigEntry.tenant_id == tenant_id
        ).all()
        for row in tenant_rows:
            result[row.key] = row.value
            if row.default_locale:
                result["default_locale"] = row.default_locale
            if row.feature_flags:
                result["feature_flags"] = row.feature_flags
    return result


class AdminAudit(Base):
    """#846 — append-only audit trail for admin CRUD + config writes.

    One row per create/update/delete issued through the admin router. `admin_id`
    is deliberately a bare UUID (no FK) so deleting a profile never deletes the
    paper trail. `detail` carries the change shape (writable field names, config
    previous/new values) but never credential material (no password_hash)."""

    __tablename__ = "admin_audit"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    action: Mapped[str] = mapped_column(String(32))
    resource: Mapped[str] = mapped_column(String(64))
    item_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ═════════════════════════════════════════════════════════════════════════
# Multi-tenancy models (#961-#969)
# ═════════════════════════════════════════════════════════════════════════


class Organization(Base):
    """#961 — a tenant (school, district, tutoring org) in the B2B model.

    Every org-anchored entity (OrgMember, TenantConfig, OrgSyllabus, Classroom,
    ClassroomKid) FK's here.  An org is created by the control panel; a global
    admin or super-admin provisions it and assigns the first OrgOwner."""

    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # #965 — optional display name (defaults to name if unset).
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # #965 — the org's "slug" for subdomain-based routing (optional).
    slug: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OrgMember(Base):
    """#961, #964 — membership + role within an organization.

    A Profile may belong to zero, one, or many orgs.  Each membership carries
    a role that controls what the member can see/do within the org:
      - owner      — full org control (billing, settings, member management)
      - admin      — manage classrooms, syllabus, view all class progress
      - teacher    — manage own classrooms, view own class progress
    """

    __tablename__ = "org_members"
    __table_args__ = (
        UniqueConstraint("org_id", "profile_id", name="uq_org_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(32), default="teacher", server_default="teacher")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    org: Mapped[Organization] = relationship()
    profile: Mapped[Profile] = relationship()


class TenantConfig(Base):
    """#965 — per-org branding + feature flags, with a global-default row.

    The global default row has org_id=NULL and is unique-only-NULLS (Postgres
    allows many NULLs in a unique constraint — we enforce a single global row
    at the application layer).  When an org has no explicit TenantConfig row,
    every field falls back to the global row, then to hardcoded Numberverse
    defaults.

    Fields that are NULL on the org row inherit from the global row; fields
    that are NULL on the global row inherit hardcoded defaults.
    """

    __tablename__ = "tenant_config"
    # org_id is unique+nullable: at most one config per org, and at most one
    # global row (NULL).  Postgres allows many NULLs so we enforce the single
    # global row at the application layer.
    __table_args__ = (
        UniqueConstraint("org_id", name="uq_tenant_config_org"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, unique=True
    )
    # Branding — NULL means "inherit from global default".
    brand_name: Mapped[str | None] = mapped_column(String, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String, nullable=True)
    accent_color: Mapped[str | None] = mapped_column(String, nullable=True)
    # Domain/subdomain for automatic org resolution.
    domains: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    # Locale override (e.g. "bn-BD").
    default_locale: Mapped[str | None] = mapped_column(String, nullable=True)
    # Arbitrary feature flags as JSONB ({"disable_sound": true, ...}).
    feature_flags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    org: Mapped[Organization | None] = relationship()


class OrgSyllabus(Base):
    """#966 — per-org skill overrides: reorder / toggle / relabel / set difficulty.

    Each row maps one skill to an org-specific presentation.  If no row exists
    for an org+skill pair, the global Skill catalog is used as-is.  This table
    is how a school board (NCTB / Cambridge / Edexcel) maps its curriculum onto
    the Numberverse skill graph.
    """

    __tablename__ = "org_syllabus"
    __table_args__ = (
        UniqueConstraint("org_id", "skill_id", name="uq_org_syllabus_skill"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    skill_id: Mapped[str] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), index=True
    )
    # Override fields — NULL means "use the global Skill value".
    subject_label: Mapped[str | None] = mapped_column(String, nullable=True)
    grade_label: Mapped[str | None] = mapped_column(String, nullable=True)
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Difficulty multiplier or override JSON for the org's students.
    difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    org: Mapped[Organization] = relationship()


class Classroom(Base):
    """#967 — a teacher's classroom within an org.

    A classroom is the unit of rosters, assignments, and class-progress views.
    A teacher (org member with teacher+ role) creates classrooms and manages
    their kids' rosters via the join table below.
    """

    __tablename__ = "classrooms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    # The teacher who owns/created this classroom.  NULL when the teacher's
    # membership is deleted (SET NULL keeps the classroom rows intact).
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("org_members.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    org: Mapped[Organization] = relationship()


class ClassroomKid(Base):
    """#967 — roster join: which kids are in which classroom.

    A kid can be in multiple classrooms (e.g. math class + reading intervention).
    The composite PK prevents duplicate entries.
    """

    __tablename__ = "classroom_kids"
    __table_args__ = (
        UniqueConstraint("classroom_id", "kid_id", name="uq_classroom_kid"),
    )

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), primary_key=True
    )
    kid_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("kids.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
