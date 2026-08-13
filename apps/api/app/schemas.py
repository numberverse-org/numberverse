import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ── Auth ──
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthIn(BaseModel):
    """Client-supplied Google ID token (verified server-side)."""

    id_token: str = Field(min_length=10)


class ProfileOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str | None = None
    is_admin: bool = False
    aggregate_opt_in: bool = False  # #330 parent privacy opt-in

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    token: str
    profile: ProfileOut


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ProfileUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    aggregate_opt_in: bool | None = None  # #330 parent privacy opt-in


class SessionOut(BaseModel):
    """One active login on the account (for the "manage my devices" screen)."""

    id: uuid.UUID
    created_at: datetime
    last_seen_at: datetime
    user_agent: str | None = None
    ip: str | None = None
    current: bool = False  # is this the session that called /auth/sessions?

    model_config = {"from_attributes": True}


# ── Kids ──
class KidIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    avatar: str | None = None
    birth_year: int | None = Field(default=None, ge=2010, le=2030)


class KidUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    avatar: str | None = None
    birth_year: int | None = Field(default=None, ge=2010, le=2030)


class KidOut(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    name: str
    avatar: str | None = None
    birth_year: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Per-kid parent controls ──
# #6 — weekday_limits_min is a comma-joined 7-int string "45,45,45,45,45,90,90"
# (Mon..Sun; 0 = unlimited that day), or None to fall back to daily_limit_min /
# the kid-app defaults (45 school, 90 weekend).
class KidSettingsIn(BaseModel):
    enabled_subjects: list[str] | None = None  # None = all
    max_band: int | None = Field(default=None, ge=1, le=5)
    daily_limit_min: int | None = Field(default=None, ge=1, le=600)
    weekday_limits_min: str | None = Field(default=None, pattern=r"^(\d{1,3},){6}\d{1,3}$")
    tts_enabled: bool = True
    music_enabled: bool = True
    # #243 — per-kid volume balance, 0..1 (1.0 = full).
    voice_volume: float = Field(default=1.0, ge=0.0, le=1.0)
    sfx_volume: float = Field(default=1.0, ge=0.0, le=1.0)
    music_volume: float = Field(default=1.0, ge=0.0, le=1.0)
    # #248 — quiet hours (auto-soften, never block). `quiet_windows` is 7
    # comma-joined "HH:MM-HH:MM" (Mon..Sun; "-" = off that day; start>end =
    # overnight). `quiet_volume` 0.05..1, `quiet_dim` toggles gentle dimming.
    quiet_enabled: bool = False
    quiet_windows: str | None = Field(
        default=None,
        pattern=r"^(?:-|\d{1,2}:\d{2}-\d{1,2}:\d{2})(?:,(?:-|\d{1,2}:\d{2}-\d{1,2}:\d{2})){6}$",
    )
    quiet_dim: bool = True
    quiet_volume: float = Field(default=0.15, ge=0.05, le=1.0)
    # #138 — voice recording is parent-gated, off by default.
    voice_record_enabled: bool = False
    # #256 — gentle daily playtime goal (minutes); the router clamps it to the
    # day's cap. 0/None = no goal.
    goal_min: int | None = Field(default=None, ge=1, le=600)
    # #257 — curriculum focus pin (subject + world band). Both-or-neither; a
    # lone half clears the pin. Band 1..7.
    focus_subject: str | None = Field(default=None, max_length=16)
    focus_band: int | None = Field(default=None, ge=1, le=7)
    # #258 — per-kid VOICE preference: stable tone handle ("female"|"kid"|"soft"|
    # "warm") + Web-Speech rate multiplier (1.0 = normal). null = kid app default.
    voice_tone: str | None = Field(default=None, max_length=8)
    voice_speed: float | None = Field(default=None, ge=0.5, le=2.0)
    # #272 — SAFETY: parent kill-switch. True = this kid's games are paused
    # until a parent resumes (one-tap, kid-safe message, survives reload).
    paused: bool = False


class KidSettingsOut(BaseModel):
    enabled_subjects: list[str] | None = None
    max_band: int | None = None
    daily_limit_min: int | None = None
    weekday_limits_min: str | None = None
    tts_enabled: bool = True
    music_enabled: bool = True
    # #243 — per-kid volume balance, 0..1 (1.0 = full).
    voice_volume: float = 1.0
    sfx_volume: float = 1.0
    music_volume: float = 1.0
    # #248 — quiet hours.
    quiet_enabled: bool = False
    quiet_windows: str | None = None
    quiet_dim: bool = True
    quiet_volume: float = 0.15
    voice_record_enabled: bool = False
    goal_min: int | None = None
    focus_subject: str | None = None
    focus_band: int | None = None
    voice_tone: str | None = None
    voice_speed: float | None = None
    paused: bool = False
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# ── Activity feed ──
class ActivityOut(BaseModel):
    id: int
    game_id: str
    skill_id: str
    correct: bool
    response_ms: int | None = None
    difficulty: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Mastery ──
class MasteryOut(BaseModel):
    skill_id: str
    mastery: float
    correct: int
    attempts: int
    streak: int


class WeakSkillOut(BaseModel):
    """A skill the kid hasn't mastered yet (< threshold) — feeds the printable
    worksheet generator (#132). Titles come from the catalog (en + bn)."""

    skill_id: str
    band: int
    subject: str
    title: str
    title_bn: str | None = None
    description: str | None = None
    mastery: float
    attempts: int
    correct: int


# ── Progress ──
class ProgressEventIn(BaseModel):
    kid_id: uuid.UUID
    skill_id: str
    game_id: str
    correct: bool
    response_ms: int | None = None
    difficulty: float | None = None
    timestamp: int | None = None


# ── Weekly report (parent-facing "show me my kid learned this week") ──
class WeeklyDayOut(BaseModel):
    date: str  # YYYY-MM-DD
    rounds: int
    minutes: float


class WeeklyOut(BaseModel):
    days: list[WeeklyDayOut]      # last 7 days, oldest → newest
    rounds: int                   # rounds played this week
    correct_pct: int              # 0–100 first-try/round accuracy
    minutes: float                # active learning minutes (≈ Σ response_ms)
    active_days: int              # distinct days with at least one round
    mastered_this_week: list[str]  # skill ids now ≥80% + last practiced this week
    mastered_today: list[str] = []  # #244 — ≥80% + last practiced today
    top_game: str | None          # most-played game this week
    streak: int = 0               # #4 — consecutive active days (ending today/yesterday)


class ProgressBatchIn(BaseModel):
    events: list[ProgressEventIn]
    # #9 — multi-device sync: the client's current coin balance per kid
    # ("<kid_id>": int). The server keeps the max ever reported (newest-wins),
    # so a kid's Nova wallet follows them across devices.
    coins: dict[str, int] | None = None


class KidSnapshotOut(BaseModel):
    """#9 — the E2E-friendly aggregate profile a second device can restore from.
    Only mastery + coins — never voice, face, or raw answers."""

    kid_id: uuid.UUID
    name: str
    avatar: str | None = None
    coins: int = 0
    mastery: list[MasteryOut]


# ── Kotha (কথা) — RAG knowledge lake ──
class LearningStoryIn(BaseModel):
    kid_id: uuid.UUID
    skill_id: str
    game_id: str
    # Client durable-outbox uid — the dedup key (#331). Re-posting the same uid
    # is a no-op server-side, so a lost ACK can't create duplicate stories.
    uid: str | None = None
    outcome: bool
    error_kind: str | None = None
    misconception_code: str | None = None
    action: str | None = None
    difficulty: float | None = None
    response_ms: int | None = None
    wrong_streak: int | None = None
    context: dict = Field(default_factory=dict)


class LearningStoryOut(BaseModel):
    id: uuid.UUID
    kid_id: uuid.UUID
    skill_id: str
    game_id: str
    outcome: bool
    error_kind: str | None
    misconception_code: str | None
    action: str | None
    difficulty: float | None
    response_ms: int | None
    wrong_streak: int | None
    context: dict
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 🚀 Acceleration plan (#249) ──
class AccelerationIn(BaseModel):
    """One "skipped ahead" entry. `uid` is the client's durable-outbox key —
    re-posting the same uid is a no-op (same dedup as stories)."""
    kid_id: uuid.UUID
    skill_id: str
    # easy | know | moving-on | parent — why this skill was skipped.
    reason: str = Field(pattern=r"^(easy|know|moving-on|parent)$")
    band_from: int = Field(ge=1, le=5)
    band_to: int = Field(ge=1, le=5)
    uid: str | None = None


class AccelerationOut(BaseModel):
    id: uuid.UUID
    kid_id: uuid.UUID
    skill_id: str
    reason: str
    band_from: int
    band_to: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Kotha semantic retrieval (#323) ──
class StorySearchIn(BaseModel):
    """A natural-language query for similar learning moments. The response is
    privacy-scrubbed by construction — context envelope only, never kid ids."""

    query: str = Field(min_length=2, max_length=300)
    top_k: int = Field(default=5, ge=1, le=20)


class StorySearchHit(BaseModel):
    """One semantic match — the story's learning-moment envelope, ZERO kid
    identity (no kid_id, no names, no uids). `similarity` is 1 − cosine
    distance (higher = closer)."""

    similarity: float
    skill_id: str | None
    game_id: str | None
    outcome: bool | None
    error_kind: str | None
    misconception_code: str | None
    action: str | None
    context: dict
    created_at: datetime | None


class StorySearchOut(BaseModel):
    query: str
    hits: list[StorySearchHit]
    note: str = "Privacy-scrubbed: context envelope only — no kid identity included."


# ── Content ──
class SubjectOut(BaseModel):
    id: str
    title_en: str
    title_bn: str
    sort_order: int = 0

    model_config = {"from_attributes": True}


class SkillOut(BaseModel):
    id: str
    band: int
    subject: str
    title: str
    title_bn: str | None = None
    description: str | None = None
    common_core: list[str] | None = None
    nctb_code: str | None = None
    class_number: int | None = None
    sort_order: int = 0

    model_config = {"from_attributes": True}


class GameOut(BaseModel):
    id: str
    kind: str
    title: str
    config: dict
    band: int | None = None
    enabled: bool = True

    model_config = {"from_attributes": True}


# ── Admin generic resources ──
class ResourceOut(BaseModel):
    id: str
