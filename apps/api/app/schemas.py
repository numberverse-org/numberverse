import json
import math
import re
import unicodedata
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, EmailStr, Field, field_validator


# #696 — the kid app times rounds with Phaser's high-res clock, so a serialized
# `response_ms` can carry a fraction (e.g. 1234.456). Pydantic v2 rejects
# float→int even in lax mode, which 422s the WHOLE /progress or /stories batch
# and wedges the client's durable outbox. Round to whole ms before the int
# check — this also un-sticks events queued BEFORE the client-side rounding fix.
def _round_int(v: int | float | str | None) -> int | float | str | None:
    if isinstance(v, float):
        # #3083 — `round(float('inf'))` / `round(float('-inf'))` raise
        # OverflowError (→ 500) and `round(float('nan'))` yields a float that
        # trips the int conversion with a confusing error. Return non-finite
        # floats unchanged so the downstream int coercion rejects them as a
        # clean 422 instead of a 500.
        if not math.isfinite(v):
            return v
        return round(v)
    return v


RoundedInt = Annotated[int | None, BeforeValidator(_round_int)]
RoundedIntRequired = Annotated[int, BeforeValidator(_round_int)]


# #3083 — difficulty/response_ms are client-reported numeric fields that used to
# pass any float/negative through (and Python's json.loads accepts the bare NaN
# literal, which then serializes back out as invalid RFC-7159 JSON). `ge=0` +
# `allow_inf_nan=False` together reject negatives, NaN AND ±inf at the boundary,
# so a tampered client can never persist nonsense into the activity feed, weekly
# report, or export.
_NONNEG_FINITE_FLOAT = Annotated[float, Field(ge=0, allow_inf_nan=False)]


# ── Auth ──
# bcrypt only reads the first 72 bytes of a password; silently accepting
# anything longer would let visually-different passphrases authenticate as the
# same one (#1490). Every password field on this API is capped at 72 chars.
BCRYPT_MAX_PASSWORD_LENGTH = 72


# ── Name/avatar charset (#1824/#1828) ─────────────────────────────────────
# Kid names + parent display_names flow into NON-HTML sinks — the share-card
# canvas (apps/kid/src/game/shareImage.ts), TTS, download filenames, CSV
# export — so they must reject characters that corrupt or exploit those sinks:
# control chars (incl. \n \r \t), bidi overrides/embeddings, and angle
# brackets. Avatars get a length cap (a multi-char / very long avatar breaks
# the circular badge) + control-char STRIPPING (not rejection) so legacy
# emoji/short-label payloads survive, + an HTML-ish rejection.
PARENT_NAME_MAX_LENGTH = 80
KID_NAME_MAX_LENGTH = 40
AVATAR_MAX_LENGTH = 32

# ASCII C0 controls + DEL + C1 controls, plus Unicode bidi/format controls
# (U+200E LRM, U+200F RLM, U+202A-U+202E bidi embedding/override/pop,
# U+2066-U+2069 bidi isolates).
_CONTROL_OR_BIDI = re.compile(r"[\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]")
# Angle brackets — the only HTML-ish signal that matters for canvas/TTS/CSV.
_ANGLE_BRACKETS = re.compile(r"[<>]")

# Defense-in-depth charset for REQUIRED name Fields (KidIn.name): any char
# EXCEPT the forbidden set passes the pattern; the field_validator below then
# enforces the strict Unicode-letter/digit/mark charset (a regex pattern alone
# can't express Unicode marks like Bengali vowel signs — `\w` misses them).
NAME_PATTERN = r"^[^\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069<>]+$"
# Optional name/display_name fields use `*` so the validator can normalize an
# empty/whitespace string to None (matches the routers' `.strip()` no-op
# semantics) instead of 422-ing a `+`-empty pattern.
OPTIONAL_NAME_PATTERN = r"^[^\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069<>]*$"


def _name_charset_ok(value: str) -> bool:
    """True when every char is a Unicode letter, digit, combining mark, or the
    small safe punctuation set (space, hyphen, apostrophe, period)."""
    for ch in value:
        if ch in " .'-":
            continue
        if unicodedata.category(ch)[0] not in "LNM":
            return False
    return True


def _validate_name(value: str) -> str:
    """Strip + strictly validate a kid/parent name (raises on bad charset)."""
    v = value.strip()
    if not v:
        raise ValueError("name must not be empty")
    if _CONTROL_OR_BIDI.search(v) or _ANGLE_BRACKETS.search(v):
        raise ValueError("name contains unsupported characters")
    if not _name_charset_ok(v):
        raise ValueError("name contains unsupported characters")
    if not any(unicodedata.category(ch)[0] in "LN" for ch in v):
        raise ValueError("name must contain at least one letter or digit")
    return v


def _clean_optional_name(value: str | None) -> str | None:
    """For optional name/display_name fields. Empty/whitespace → None (matches
    the routers' `if ... .strip()` no-op semantics); otherwise strict-validate."""
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    return _validate_name(v)


def _validate_avatar(value: str | None) -> str | None:
    """Strip control chars + validate an avatar (max length, no HTML-ish)."""
    if value is None:
        return None
    v = _CONTROL_OR_BIDI.sub("", value).strip()
    if _ANGLE_BRACKETS.search(v):
        raise ValueError("avatar must not contain HTML")
    if len(v) > AVATAR_MAX_LENGTH:
        raise ValueError(f"avatar must be at most {AVATAR_MAX_LENGTH} characters")
    return v


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=BCRYPT_MAX_PASSWORD_LENGTH)
    display_name: str | None = Field(default=None, max_length=PARENT_NAME_MAX_LENGTH, pattern=OPTIONAL_NAME_PATTERN)

    @field_validator("display_name")
    @classmethod
    def _signup_display_name(cls, v: str | None) -> str | None:
        return _clean_optional_name(v)


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
    # Billing entitlement — "free" (Worlds 1–2) | "plus". The server is the
    # source of truth; the kid app caches this with a 30-day offline grace.
    plan: str = "free"
    plan_expires_at: datetime | None = None

    model_config = {"from_attributes": True}

    @field_validator("display_name")
    @classmethod
    def _profile_out_display_name(cls, v: str | None) -> str | None:
        return _clean_optional_name(v)


class TokenOut(BaseModel):
    token: str
    profile: ProfileOut


class RefreshOut(BaseModel):
    """#1773 — POST /auth/refresh rotates the httpOnly refresh cookie into a
    fresh short-lived access token. The new refresh cookie rides the same
    response; the old refresh dies the moment this one is issued."""

    access_token: str
    token_type: str = "bearer"


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=BCRYPT_MAX_PASSWORD_LENGTH)


class VerifyPasswordIn(BaseModel):
    """#3004 — parent-gated re-confirm. The parent's password is re-entered
    (and bcrypt-checked server-side) before a privileged action proceeds (e.g.
    enabling Web Push). A Google-only account has NO password the parent knows,
    so the same no-local-password contract as change-password/delete-account
    applies."""

    password: str = Field(max_length=BCRYPT_MAX_PASSWORD_LENGTH)


class ProfileUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=PARENT_NAME_MAX_LENGTH, pattern=OPTIONAL_NAME_PATTERN)
    aggregate_opt_in: bool | None = None  # #330 parent privacy opt-in

    @field_validator("display_name")
    @classmethod
    def _profile_update_display_name(cls, v: str | None) -> str | None:
        return _clean_optional_name(v)


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
    name: str = Field(min_length=1, max_length=KID_NAME_MAX_LENGTH, pattern=NAME_PATTERN)
    avatar: str | None = None
    birth_year: int | None = Field(default=None, ge=2010, le=2030)

    @field_validator("name")
    @classmethod
    def _kid_name(cls, v: str) -> str:
        return _validate_name(v)

    @field_validator("avatar")
    @classmethod
    def _kid_avatar(cls, v: str | None) -> str | None:
        return _validate_avatar(v)


class KidUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=KID_NAME_MAX_LENGTH, pattern=OPTIONAL_NAME_PATTERN)
    avatar: str | None = None
    birth_year: int | None = Field(default=None, ge=2010, le=2030)

    @field_validator("name")
    @classmethod
    def _kid_update_name(cls, v: str | None) -> str | None:
        return _clean_optional_name(v)

    @field_validator("avatar")
    @classmethod
    def _kid_update_avatar(cls, v: str | None) -> str | None:
        return _validate_avatar(v)


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
    # #1804 — monotonic wallet version (last-write-wins spend sync).
    wallet_seq: int = 0

    model_config = {"from_attributes": True}

    @field_validator("name")
    @classmethod
    def _kid_out_name(cls, v: str) -> str:
        return _validate_name(v)

    @field_validator("avatar")
    @classmethod
    def _kid_out_avatar(cls, v: str | None) -> str | None:
        return _validate_avatar(v)


# ── Per-kid parent controls ──
# #6 — weekday_limits_min is a comma-joined 7-int string "45,45,45,45,45,90,90"
# (Mon..Sun; 0 = unlimited that day), or None to fall back to daily_limit_min /
# the kid-app defaults (45 school, 90 weekend).
class KidSettingsIn(BaseModel):
    # #1643 — the one unbounded surface on the settings model. Cap the LIST (32
    # subjects — the curriculum catalog ships 6, so this is generous) and each
    # ITEM (16 chars — the longest subject id in the catalog is 7) so a tampered
    # client can't store thousands of arbitrary-length strings that ride every
    # settings fetch and band-lock check.
    enabled_subjects: list[str] | None = Field(default=None, max_length=32)
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
    # #1041/#1042 — parent-adjustable MONI STRICTNESS: the difficulty knob.
    # gentle/steady/challenging = how hard Moni pushes this kid. #1050: None =
    # no parent choice → Moni uses its own automatic read (NOT pinned steady).
    # Literal rejects anything else at the boundary so the DB constraint can
    # never trip on a bad write.
    moni_strictness: Literal["gentle", "steady", "challenging"] | None = None
    # #1044 — per-subject difficulty deltas (subject id → signed level offset,
    # clamped ±2). A parent's per-subject stepper tunes ONE area without
    # pushing the whole kid; the kid app expands each subject onto its skills
    # and folds them into moni.plan()'s perSkillDeltas. None = no choice.
    moni_subject_deltas: dict[str, int] | None = None

    @field_validator("moni_subject_deltas")
    @classmethod
    def _clamp_subject_deltas(cls, v: dict[str, int] | None) -> dict[str, int] | None:
        if v is None:
            return None
        return {k: max(-2, min(2, int(x))) for k, x in v.items()}

    # #1643 — cap each enabled_subjects item. The sibling fields (focus_subject,
    # voice_tone) are length/enum-bounded; this list was the one unbounded
    # surface. There is no subject-catalog constant in this file, so the cap is
    # a generous length bound (16 chars ≫ the 7-char longest catalog id) rather
    # than a membership check.
    @field_validator("enabled_subjects")
    @classmethod
    def _cap_enabled_subjects(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        for item in v:
            if len(item) > 16:
                raise ValueError("enabled_subjects items must be at most 16 characters")
        return v


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
    # #1050 — NULL = no parent choice → Moni auto tone (never pinned steady).
    moni_strictness: str | None = None
    # #1044 — per-subject difficulty deltas (subject id → signed ±2 offset).
    moni_subject_deltas: dict[str, int] | None = None
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
    # #1611 — the client-observed occurred_at instant (nullable for legacy rows
    # that predate the column). The parent feed keeps rendering `created_at`
    # (server-stamp) for legacy; new rows carry the real round time here.
    client_ts: datetime | None = None
    # #3029 — the client's raw round timestamp (epoch ms, #1024). The portal's
    # session timeline splits offline play into real sessions using THIS when
    # present (an offline-first kid playing 30 min then syncing once would
    # otherwise collapse to one ~0-duration session built from sync time).
    timestamp: int | None = None
    # #1616 — event kind (round|coins|quest|garden|challenge|session-*). The
    # parent feed can filter engagement rows out of the "rounds" list if it
    # wants; rounds-only clients can ignore the new field.
    kind: str = "round"
    # #1616 — small engagement payload (amount, reason, minutes…).
    meta: dict | None = None

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
# #1616 — the engagement/telemetry event kinds the kid app can emit alongside
# completed practice rounds. "round" (None/absent → "round") drives BKT mastery;
# every other kind is a small telemetry row (coins awarded, daily-quest outcome,
# garden growth, challenge reward, session-start, session-minutes) that reflects
# activity WITHOUT moving mastery. Kept in sync with apps/kid/src/store.ts.
PROGRESS_EVENT_KINDS = frozenset(
    {
        "round",
        "wrong",
        "coins",
        "quest",
        "garden",
        "challenge",
        "session-start",
        "session-minutes",
        "round-abandoned",
    }
)


def _validate_kind(v: str | None) -> str | None:
    if v is None:
        return None
    if v not in PROGRESS_EVENT_KINDS:
        raise ValueError(f"unknown event kind: {v!r}")
    return v


# #1614 — the SAME enum sets the client emits (packages/core/src/moni/*.ts).
# error_kind: ErrorKind = slip | gap | misconception | fatigue | guessing.
# action: ActionType = slow-down | reteach | contrast | easier | challenge |
#          break | celebrate.
# misconception_code: the fingerprint codes (moni/fingerprint.ts) + the generic
# "repeated-error" profile fallback. Anything else is free text → 422.
ERROR_KINDS = frozenset({"slip", "gap", "misconception", "fatigue", "guessing"})
STORY_ACTIONS = frozenset(
    {"slow-down", "reteach", "contrast", "easier", "challenge", "break", "celebrate"}
)
MISCONCEPTION_CODES = frozenset(
    {
        "overcount-1",
        "undercount-1",
        "off-by-ten",
        "off-by-hundred",
        "double",
        "half",
        "reversal",
        "repeated-error",
    }
)


class ProgressEventIn(BaseModel):
    kid_id: uuid.UUID
    # #1642 — both ids were unbounded strings at the boundary. skill_id is
    # FK-bounded by skills.id but a tampered client can still send a
    # megabyte-long free string; game_id has NO FK and an unbounded column, so a
    # 200-event batch of oversized ids would pass validation and persist. Cap
    # both at the catalog id format.
    skill_id: str = Field(max_length=64)
    game_id: str = Field(max_length=64)
    correct: bool
    response_ms: RoundedInt = Field(default=None, ge=0, allow_inf_nan=False)
    difficulty: _NONNEG_FINITE_FLOAT | None = None
    # #1023 — durable-outbox uid for dedup + BKT replay protection. Optional so
    # pre-dedup clients still post; the server synthesizes one when absent.
    uid: str | None = None
    # #1024 — client round timestamp (epoch ms), preserved instead of dropped.
    timestamp: RoundedInt = None
    # #1611 — the client-observed occurred_at instant (ISO-8601). When present it
    # wins over the integer `timestamp` for the new client_ts column.
    client_ts: datetime | None = None
    # #1616 — engagement/telemetry kind (round|coins|quest|garden|challenge|
    # session-start|session-minutes). None/absent = a normal practice round.
    kind: str | None = None
    # #1616 — small engagement payload (amount, reason, minutes…). Opaque but
    # size-capped so it can't become a storage-abuse surface.
    meta: dict | None = None

    @field_validator("kind")
    @classmethod
    def _progress_kind(cls, v: str | None) -> str | None:
        return _validate_kind(v)

    @field_validator("meta")
    @classmethod
    def _progress_meta_budget(cls, v: dict | None) -> dict | None:
        if not v:
            return None
        size = len(json.dumps(v, separators=(",", ":"), default=str))
        if size > 1024:
            raise ValueError("meta too large (max 1024 bytes)")
        return v


# ── Weekly report (parent-facing "show me my kid learned this week") ──
class WeeklyDayOut(BaseModel):
    date: str  # YYYY-MM-DD
    rounds: int
    minutes: float  # #1618 — SESSION minutes (Σ session-minutes events), NOT response-time proxy


class WeeklyOut(BaseModel):
    days: list[WeeklyDayOut]      # last 7 days, oldest → newest
    rounds: int                   # completed practice rounds played this week (kind=round)
    correct_pct: int              # 0–100 accuracy over completed rounds — intentionally rounded to int (#859)
    minutes: float                # #1618 — SESSION minutes: Σ session-minutes event meta.minutes in the
                                  # window; falls back to the legacy Σ response_ms proxy when the client
                                  # hasn't shipped session-minutes events yet.
    active_days: int              # distinct days with at least one progress event (rounds + engagement)
    mastered_this_week: list[str]  # skill ids now ≥80% + last practiced this week
    mastered_today: list[str] = []  # #244 — ≥80% + last practiced today
    top_game: str | None          # most-played game this week
    streak: int = 0               # #4 — consecutive active days (ending today/yesterday)
    coins: int = 0                # #8 — current Nova wallet balance (share caption)
    trigger: str = "weekly-summary"  # #1536 — "weekly-summary" | "milestone" | "reminder"


# #1649 — bound each reported coin balance. The server keeps the max ever
# reported (newest-wins) and multi-device sync propagates it, so an absurd value
# (e.g. 2**53) would persist as a wallet balance and fan out to every device.
# 0..1_000_000 is far above any real wallet while still generous.
CoinBalance = Annotated[int, Field(ge=0, le=1_000_000)]


class ProgressBatchIn(BaseModel):
    # #833 — cap the batch so record_progress can't be used as a bulk-row/
    # mastery-lookup amplifier. 200 is far above the documented ~40-per-sync.
    events: list[ProgressEventIn] = Field(max_length=200)
    # #9 — multi-device sync: the client's current coin balance per kid
    # ("<kid_id>": int). The server keeps the max ever reported (newest-wins),
    # so a kid's Nova wallet follows them across devices.
    # #1649 — each value is range-bounded (0..1_000_000) so a tampered report
    # can't persist an absurd wallet value; out-of-range → 422.
    coins: dict[str, CoinBalance] | None = None
    # #1804 — per-kid monotonic wallet version ("<kid_id>": int). The server
    # only accepts a coins+wallet_seq update when the incoming seq is strictly
    # greater than the stored value (last-write-wins — a spend lowers both, so
    # the old GREATEST never resurrects a pre-spend balance).
    wallet_seq: dict[str, int] | None = None


class KidSnapshotOut(BaseModel):
    """#9 — the E2E-friendly aggregate profile a second device can restore from.
    Only mastery + coins — never voice, face, or raw answers."""

    kid_id: uuid.UUID
    name: str
    avatar: str | None = None
    coins: int = 0
    # #1804 — monotonic wallet version (last-write-wins spend sync).
    wallet_seq: int = 0
    mastery: list[MasteryOut]

    @field_validator("name")
    @classmethod
    def _snapshot_name(cls, v: str) -> str:
        return _validate_name(v)

    @field_validator("avatar")
    @classmethod
    def _snapshot_avatar(cls, v: str | None) -> str | None:
        return _validate_avatar(v)


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

# #947 — the size/depth shaping helpers live in scrub.py (dependency-free) so
# the API's self-contained CI tests exercise the same code the validator uses.
from .scrub import clamp_context_strings, context_depth  # noqa: E402


class LearningStoryIn(BaseModel):
    kid_id: uuid.UUID
    skill_id: str
    # #1641 — game_id is NOT FK-bounded (unlike skill_id): it is a bare string
    # column, so a tampered client can POST a megabyte-long id that persists and
    # widens every story query/group-by. Cap at the game catalog id format.
    game_id: str = Field(max_length=64)
    # Client durable-outbox uid — the dedup key (#331). Re-posting the same uid
    # is a no-op server-side, so a lost ACK can't create duplicate stories.
    uid: str | None = None
    outcome: bool
    # #1641 — the Moni vocab fields already reject anything outside their enum
    # sets (#1614); these max_length caps add a storage budget (defense-in-depth)
    # in case the catalog vocabularies ever grow or a client drifts.
    error_kind: str | None = Field(default=None, max_length=24)
    misconception_code: str | None = Field(default=None, max_length=64)
    action: str | None = Field(default=None, max_length=24)
    difficulty: _NONNEG_FINITE_FLOAT | None = None
    response_ms: RoundedInt = Field(default=None, ge=0, allow_inf_nan=False)
    wrong_streak: RoundedInt = None
    context: dict = Field(default_factory=dict)

    # #1614 — validate Moni's enums at the boundary instead of storing free text:
    # the client emits these EXACT values (packages/core/src/moni/*.ts), so a
    # drifted/wrong value is a bug or an abuse attempt → 422 the whole batch
    # (same behaviour as any other Pydantic Literal violation).
    @field_validator("error_kind")
    @classmethod
    def _story_error_kind(cls, v: str | None) -> str | None:
        if v is not None and v not in ERROR_KINDS:
            raise ValueError(f"unknown error_kind: {v!r}")
        return v

    @field_validator("action")
    @classmethod
    def _story_action(cls, v: str | None) -> str | None:
        if v is not None and v not in STORY_ACTIONS:
            raise ValueError(f"unknown action: {v!r}")
        return v

    @field_validator("misconception_code")
    @classmethod
    def _story_misconception_code(cls, v: str | None) -> str | None:
        if v is not None and v not in MISCONCEPTION_CODES:
            raise ValueError(f"unknown misconception_code: {v!r}")
        return v

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
        clamped = clamp_context_strings(v, _MAX_STRING_LEN)
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
        if context_depth(v) > 10:
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
    # #1642 — same catalog-id cap as ProgressEventIn.skill_id (FK-bounded, but
    # there is no reason to accept an arbitrary-length string at the boundary).
    skill_id: str = Field(max_length=64)
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
