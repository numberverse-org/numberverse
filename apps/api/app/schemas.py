import json
import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, EmailStr, Field, field_validator


# #696 — the kid app times rounds with Phaser's high-res clock, so a serialized
# `response_ms` can carry a fraction (e.g. 1234.456). Pydantic v2 rejects
# float→int even in lax mode, which 422s the WHOLE /progress or /stories batch
# and wedges the client's durable outbox. Round to whole ms before the int
# check — this also un-sticks events queued BEFORE the client-side rounding fix.
def _round_int(v: int | float | str | None) -> int | float | str | None:
    if isinstance(v, float):
        return round(v)
    return v


RoundedInt = Annotated[int | None, BeforeValidator(_round_int)]
RoundedIntRequired = Annotated[int, BeforeValidator(_round_int)]


# ── Auth ──
# bcrypt only reads the first 72 bytes of a password; silently accepting
# anything longer would let visually-different passphrases authenticate as the
# same one (#1490). Every password field on this API is capped at 72 chars.
BCRYPT_MAX_PASSWORD_LENGTH = 72


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=BCRYPT_MAX_PASSWORD_LENGTH)
    display_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=BCRYPT_MAX_PASSWORD_LENGTH)


class GoogleAuthIn(BaseModel):
    """Client-supplied Google ID token (verified server-side)."""

    id_token: str = Field(min_length=10)


class SetPasswordIn(BaseModel):
    """#1488 — Google-token-backed recovery for a Google-only account. A parent
    who has been signing in with Google proves they still own the Google account
    (fresh ID token), then picks a real password and becomes email/password
    login-capable. Follows the same 8..72 char password policy as every other
    password field."""

    id_token: str = Field(min_length=10)
    new_password: str = Field(min_length=8, max_length=BCRYPT_MAX_PASSWORD_LENGTH)


class ProfileOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str | None = None
    is_admin: bool = False
    role: str = "user"  # #846 — "user" | "admin" | "super_admin"
    aggregate_opt_in: bool = False  # #330 parent privacy opt-in
    # #1487 — "google" | "local" | None. None = legacy/local (Google-only rows
    # created before this column existed can't be identified, so they keep local
    # semantics). The parent portal uses this to hide/route the change-password
    # form for Google-only accounts.
    auth_provider: str | None = None
    # #985 — VPC consent audit trail surfaced in API responses + export
    consent_version: str | None = None
    consent_at: datetime | None = None
    consent_method: str | None = None

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    token: str
    profile: ProfileOut


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=BCRYPT_MAX_PASSWORD_LENGTH)


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


class DeleteAccountIn(BaseModel):
    """#980 — parent must confirm by re-entering their password (or typed
    confirmation string) before account deletion proceeds."""
    confirmation: str = Field(min_length=1, max_length=100)
    password: str = Field(max_length=BCRYPT_MAX_PASSWORD_LENGTH)


class KidOut(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    name: str
    avatar: str | None = None
    birth_year: int | None = None
    created_at: datetime
    coins: int = 0  # #987 — wallet balance surfaced in API

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
    mastered_at: datetime | None = None  # #79 — when the skill first hit ≥80%
    last_practice: datetime | None = None  # #1524 — last progress event for this skill
    last_decay: datetime | None = None  # #1524 — last decay stamp (staleness signal)


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
    response_ms: RoundedInt = None
    difficulty: float | None = None
    timestamp: RoundedInt = None


# ── Weekly report (parent-facing "show me my kid learned this week") ──
class WeeklyDayOut(BaseModel):
    date: str  # YYYY-MM-DD
    rounds: int
    minutes: float  # #859 — response-time proxy (Σ response_ms/60000), NOT session time


class WeeklyOut(BaseModel):
    days: list[WeeklyDayOut]      # last 7 days, oldest → newest
    rounds: int                   # rounds played this week
    correct_pct: int              # 0–100 accuracy — intentionally rounded to int (#859)
    minutes: float                # #859 — response-time proxy (Σ response_ms), NOT session duration
    active_days: int              # distinct days with at least one round
    mastered_this_week: list[str]  # skill ids now ≥80% + last practiced this week
    mastered_today: list[str] = []  # #244 — ≥80% + last practiced today
    top_game: str | None          # most-played game this week
    streak: int = 0               # #4 — consecutive active days (ending today/yesterday)
    coins: int = 0                # #8 — current Nova wallet balance (share caption)
    trigger: str = "weekly-summary"  # #1536 — "weekly-summary" | "milestone" | "reminder"


class ProgressBatchIn(BaseModel):
    # #833 — cap the batch so record_progress can't be used as a bulk-row/
    # mastery-lookup amplifier. 200 is far above the documented ~40-per-sync.
    events: list[ProgressEventIn] = Field(max_length=200)
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


# #858 — explicit response shape for POST /kids/{kid_id}/reset (was an ad-hoc
# dict). `kid_id` is the echoed string id the client passed back in.
class ResetOut(BaseModel):
    reset: bool
    kid_id: str


# ── Kotha (কথা) — RAG knowledge lake ──
# #835 — hard ceiling for one story's context envelope (~16 KiB). It is far
# above real learning-moment payloads while still stopping JSONB-storage and
# recursive-scrub abuse before the handler walks it.
CONTEXT_MAX_BYTES = 16 * 1024


# #947 — helpers for context size / depth validation
def _clamp_context_strings(v: dict, max_len: int) -> dict:
    """Recursively clamp every string leaf in a dict to `max_len` characters."""
    out: dict = {}
    for k, val in v.items():
        if isinstance(val, str):
            out[k] = val[:max_len]
        elif isinstance(val, dict):
            out[k] = _clamp_context_strings(val, max_len)
        elif isinstance(val, list):
            out[k] = [
                item[:max_len] if isinstance(item, str)
                else _clamp_context_strings(item, max_len) if isinstance(item, dict)
                else item
                for item in val
            ]
        else:
            out[k] = val
    return out


def _depth(v: dict) -> int:
    """Return the max nesting depth of a dict (1 = flat dict)."""
    if not isinstance(v, dict):
        return 0
    if not v:
        return 1
    return 1 + max(
        _depth(val) if isinstance(val, dict) else 0
        for val in v.values()
    )


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
    response_ms: RoundedInt = None
    wrong_streak: RoundedInt = None
    context: dict = Field(default_factory=dict)

    @field_validator("context")
    @classmethod
    def _context_byte_budget(cls, v: dict) -> dict:
        """#835/#947 — the context envelope is stored as JSONB and walked
        recursively by scrub.redact_context before insert. Bound its serialized
        size up front so a giant/deep envelope fails validation (422) instead
        of becoming a storage + CPU abuse surface. Also clamp per-field string
        length so one oversized value (e.g. a future TTS transcript) can't
        consume the whole budget."""
        if not v:
            return v
        # #947 — clamp individual string values to 4 KiB each.
        _MAX_STRING_LEN = 4096
        clamped = _clamp_context_strings(v, _MAX_STRING_LEN)
        try:
            size = len(json.dumps(clamped, separators=(",", ":"), default=str))
        except (TypeError, ValueError, RecursionError):
            raise ValueError("context must be JSON-serializable") from None
        if size > CONTEXT_MAX_BYTES:
            raise ValueError(f"context too large (max {CONTEXT_MAX_BYTES} bytes)")
        return clamped

    @field_validator("context")
    @classmethod
    def _context_no_deep_nesting(cls, v: dict) -> dict:
        """#947 — reject context with nesting deeper than 10 levels (well within
        the 20-level redact walk cap) so adversarially nested payloads are
        rejected at the schema boundary."""
        if not v:
            return v
        if _depth(v) > 10:
            raise ValueError("context nesting too deep (max 10 levels)")
        return v


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


# #858 — explicit response shape for GET /kids/{kid_id}/stories/stats (was an
# ad-hoc dict). Each dict is skill/error/misconception → count.
class StoryStatsOut(BaseModel):
    total: int
    by_skill: dict[str, int]
    by_error_kind: dict[str, int]
    by_misconception: dict[str, int]


# ── 🚀 Acceleration plan (#249) ──
class AccelerationIn(BaseModel):
    """One "skipped ahead" entry. `uid` is the client's durable-outbox key —
    re-posting the same uid is a no-op (same dedup as stories)."""
    kid_id: uuid.UUID
    skill_id: str
    # easy | know | moving-on | parent — why this skill was skipped.
    reason: str = Field(pattern=r"^(easy|know|moving-on|parent)$")
    band_from: RoundedIntRequired = Field(ge=1, le=5)
    band_to: RoundedIntRequired = Field(ge=1, le=5)
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
