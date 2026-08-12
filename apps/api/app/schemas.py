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

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    token: str
    profile: ProfileOut


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ProfileUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)


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
class KidSettingsIn(BaseModel):
    enabled_subjects: list[str] | None = None  # None = all
    max_band: int | None = Field(default=None, ge=1, le=5)
    daily_limit_min: int | None = Field(default=None, ge=1, le=600)
    tts_enabled: bool = True
    music_enabled: bool = True


class KidSettingsOut(BaseModel):
    enabled_subjects: list[str] | None = None
    max_band: int | None = None
    daily_limit_min: int | None = None
    tts_enabled: bool = True
    music_enabled: bool = True
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
    top_game: str | None          # most-played game this week


class ProgressBatchIn(BaseModel):
    events: list[ProgressEventIn]


# ── Kotha (কথা) — RAG knowledge lake ──
class LearningStoryIn(BaseModel):
    kid_id: uuid.UUID
    skill_id: str
    game_id: str
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
