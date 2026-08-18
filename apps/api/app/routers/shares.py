"""Share-card deep links (#245).

A parent can mint an unguessable per-kid share token and drop a link into the
weekly WhatsApp share-card. Opening the link hits a PUBLIC, auth-free endpoint
that returns ONLY anonymized aggregates — no name, avatar, kid id, email or
skill ids — so a friend/relative sees the week's numbers and nothing personal.
The public page makes one fetch and no tracking pixels: zero analytics.

Four routes:
  · GET    /kids/{kid_id}/share-token          (auth) — mint (or return) the opaque token
  · POST   /kids/{kid_id}/share-token/rotate   (auth) — regenerate the token, killing old links
  · DELETE /kids/{kid_id}/share-token          (auth) — revoke the link (token is nulled)
  · GET    /share/{token}                      (public) — the anonymized weekly snapshot
"""
import asyncio
import hashlib
import secrets
import uuid
from collections import Counter
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_profile
from ..models import ContentItem, Kid, KidSettings, Profile, ProgressEvent, SkillMastery
from ..ratelimit import ip_rate_limit, read_rate_limit

router = APIRouter(prefix="/api/v1", tags=["share"])

# #832 — /share/{token} is auth-free, so rate-limit by client IP only (there is
# no account to key on). 30 req/min is far more than a shared link gets opened
# while still blunting token-guessing hammering.
SHARE_SNAPSHOT_RATE_LIMIT = ip_rate_limit(limit=30, tag="share")

# #1764 — the authenticated share-token GET joins the read tier: minting/reading
# the opaque token is a read (no DB write), so it shares the higher read budget
# rather than the 120/min write budget.
SHARE_READ_RATE_LIMIT = read_rate_limit()

# Small fixed floor for public 404s so a guessed link isn't distinguishable from
# a valid-but-paused link by response time alone (approximate, not exact).
_SHARE_404_DELAY_SECONDS = 0.02

# #1800 — the mint/rotate audit timestamps live in migrations-owned columns
# (`share_token_created_at` / `share_token_revoked_at`) that are deliberately
# kept OFF the ORM model (models.py owns that addition), so the three write
# paths share ONE named SQL constant instead of three hand-written UPDATE
# strings that could silently drift from the column's migration.
_SHARE_TOKEN_MINT_SQL = text(
    "UPDATE kids SET share_token_created_at = now(), "
    "share_token_revoked_at = NULL WHERE id = CAST(:kid_id AS uuid)"
)


async def _share_not_found() -> None:
    await asyncio.sleep(_SHARE_404_DELAY_SECONDS)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")


def _share_token_hash(token: str) -> str:
    """#1777 — one-way fingerprint of a share token. The DB stores only this;
    the url-safe token lives solely in the minting response."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _is_legacy_raw(v: str | None) -> bool:
    """#1777 — legacy-plaintext detection. Before the hash migration, rows
    stored `secrets.token_urlsafe(24)` VERBATIM: exactly 32 url-safe chars. The
    new form is a 64-char lowercase sha256 hex digest, so any 32-char value is
    a legacy raw token; None/short/64-hex values are not."""
    return bool(v) and len(v) == 32


def resolve_share_token(stored: str | None, inbound: str) -> tuple[str | None, bool]:
    """#1777 — pure matcher for the public share-link lookup.

    Given what the DB stores (`stored` — either the new sha256 fingerprint or a
    legacy plaintext url-safe token) and the inbound link token, return
    `(matching_stored_value, needs_migration)`: the stored value that matches
    the inbound token, or `(None, False)` when nothing does. `needs_migration`
    is True only for a legacy plaintext row that the caller should lazily
    rewrite to its sha256 fingerprint (Done-when #2: old links keep resolving).
    """
    if not stored:
        return None, False
    if stored == _share_token_hash(inbound):
        return stored, False
    if _is_legacy_raw(stored) and stored == inbound:
        return stored, True
    return None, False


# #1552 — ProgressEvent has no session/duration column; `response_ms` is
# per-answer latency (models.py:265), NOT play time. The best available timing
# data is `created_at`, so cluster event stamps into play sessions (a gap over
# 5 minutes starts a new session) and sum each session's elapsed span. This is
# still an estimate (server-stamped batches share one transaction timestamp),
# so the public payload sets `minutes_approx: true`.
_SESSION_GAP_SECONDS = 5 * 60


def _session_span_minutes(events: list[ProgressEvent]) -> float:
    """Best-available play-time estimate for a set of progress events."""
    stamps = sorted({e.created_at for e in events if e.created_at is not None})
    if not stamps:
        return 0.0
    total = 0.0
    session_start = stamps[0]
    prev = stamps[0]
    for stamp in stamps[1:]:
        if (stamp - prev).total_seconds() > _SESSION_GAP_SECONDS:
            total += (prev - session_start).total_seconds() / 60.0
            session_start = stamp
        prev = stamp
    total += (prev - session_start).total_seconds() / 60.0
    return round(total, 1)


def _humanize_game_id(game_id: str) -> str:
    """Fallback display label: strip the internal 'game-' prefix and title-case
    the hyphen-separated slug (e.g. 'game-fruit-tree' → 'Fruit Tree')."""
    cleaned = game_id[5:] if game_id.startswith("game-") else game_id
    return cleaned.replace("-", " ").title() or game_id


class ShareTokenOut(BaseModel):
    token: str


class ShareSnapshotOut(BaseModel):
    """Aggregates only — deliberately carries ZERO identity. `week_of` is the
    calendar day the window ends on; top_game is a display label (never the raw
    internal game id); minutes_by_day is the 7-day minute curve (just floats —
    no dates). #867 — the live wallet balance is intentionally NOT included on
    the public card."""
    rounds: int
    # #1552 — `minutes` is a timestamp-derived session-span ESTIMATE, not a
    # measured session duration. The payload flags that with `minutes_approx`.
    minutes: float
    minutes_approx: bool = True
    correct_pct: int  # intentional rounded int: round(100 * correct / rounds)
    active_days: int
    mastered_count: int
    top_game: str | None
    week_of: str
    minutes_by_day: list[float] = []


# #852 — `kid_id` is typed as a UUID so malformed path params 422 before the
# ownership query, matching the other kid routes (kids.py pattern).
@router.get("/kids/{kid_id}/share-token", response_model=ShareTokenOut)
async def get_share_token(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
    _rl: Profile = Depends(SHARE_READ_RATE_LIMIT),
):
    """Mint (or return) the kid's share token. Auth-protected + ownership-checked:
    only the parent can read their own kid's token, so the unguessable string
    never leaks through a guessed URL.

    #1777 — the DB stores ONLY the sha256 fingerprint of the url-safe token;
    the raw token lives solely in this response. A pre-migration plaintext row
    is migrated in place so the parent keeps the SAME link. A row that already
    stores only a hash cannot recover the raw token, so re-reading it re-mints
    (rotates) a fresh link — the same semantics as an explicit /rotate. The
    parent portal calls this only on a user "share" tap, so this is safe."""
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    if not owned.share_token:
        # Fresh mint: persist only the fingerprint.
        raw = secrets.token_urlsafe(24)
        owned.share_token = _share_token_hash(raw)
        # #1550 — audit when this token was minted (stored via migrations.py;
        # kept off the ORM model so another wave can own the column addition).
        await db.execute(_SHARE_TOKEN_MINT_SQL, {"kid_id": str(kid_id)})
        await db.commit()
        await db.refresh(owned)
    elif _is_legacy_raw(owned.share_token):
        # #1777 — pre-migration plaintext row: migrate it in place and hand back
        # the SAME raw token, so the previously-minted link keeps resolving.
        raw = owned.share_token
        owned.share_token = _share_token_hash(raw)
        await db.commit()
    else:
        # #1777 — only a hash is stored; the raw is unrecoverable, so re-reading
        # re-mints (rotates) exactly like the /rotate endpoint.
        raw = secrets.token_urlsafe(24)
        owned.share_token = _share_token_hash(raw)
        await db.execute(_SHARE_TOKEN_MINT_SQL, {"kid_id": str(kid_id)})
        await db.commit()
        await db.refresh(owned)
    return ShareTokenOut(token=raw)


# #1550 — rotate a leaked/outdated share link: regenerate the token so every
# previously-shared URL stops resolving immediately. Auth + ownership-checked
# exactly like GET /share-token.
@router.post("/kids/{kid_id}/share-token/rotate", response_model=ShareTokenOut)
async def rotate_share_token(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    raw = secrets.token_urlsafe(24)
    # #1777 — the DB stores only the sha256 fingerprint; the raw token is
    # returned exactly once, in this response.
    owned.share_token = _share_token_hash(raw)
    await db.execute(
        text(
            "UPDATE kids SET share_token_created_at = now(), "
            "share_token_revoked_at = NULL WHERE id = CAST(:kid_id AS uuid)"
        ),
        {"kid_id": str(kid_id)},
    )
    await db.commit()
    await db.refresh(owned)
    return ShareTokenOut(token=raw)


# #852 — same UUID path-param typing as GET above: malformed ids 422 before the
# ownership query, never a DB-level UUID error.
@router.delete("/kids/{kid_id}/share-token", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_token(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """#866 — revoke a kid's share link. Nulls the opaque token so the public
    snapshot stops resolving immediately. The next mint (GET) rotates a fresh
    token, so the parent can share again without ever reusing a dead link."""
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    owned.share_token = None
    # #1550 — audit when this token was revoked (migrations.py column).
    await db.execute(
        text("UPDATE kids SET share_token_revoked_at = now() WHERE id = CAST(:kid_id AS uuid)"),
        {"kid_id": str(kid_id)},
    )
    await db.commit()


@router.get(
    "/share/{token}",
    response_model=ShareSnapshotOut,
    dependencies=[Depends(SHARE_SNAPSHOT_RATE_LIMIT)],
)
async def get_share_snapshot(
    # #1645 — tokens are `token_urlsafe(24)` (~32 chars); a 64-char cap rejects
    # oversized/megabyte tokens at the framework boundary (422) before they ever
    # reach the DB equality lookup. The route is IP-rate-limited, but a single
    # request should still not be able to push a huge string into the query.
    token: str = Path(max_length=64),
    db: AsyncSession = Depends(get_db),
):
    """Public weekly snapshot for a share card. NO auth: the token IS the key.
    Unknown/revoked/paused tokens → 404 (a guessed link finds nothing)."""
    if not token:
        await _share_not_found()
    # #1777 — new-form lookup: the DB stores only the sha256 fingerprint, so
    # hash the inbound token before comparing.
    token_hash = _share_token_hash(token)
    kid = await db.scalar(select(Kid).where(Kid.share_token == token_hash))
    if not kid:
        # #1777 — legacy fallback: a pre-migration row stores the url-safe raw
        # verbatim. Match it directly and lazily migrate it to the fingerprint
        # so previously-minted plaintext links keep resolving (Done-when #2).
        legacy = await db.scalar(select(Kid).where(Kid.share_token == token))
        if legacy:
            _, needs_migration = resolve_share_token(legacy.share_token, token)
            if needs_migration:
                kid = legacy
                legacy.share_token = token_hash
                await db.commit()
    if not kid:
        await _share_not_found()

    # #867 — the parent's pause kill-switch also gates the public card: while a
    # kid is paused, their share link stops resolving. A missing settings row
    # means defaults (not paused), so legacy kids keep sharing.
    settings = await db.get(KidSettings, kid.id)
    if settings is not None and settings.paused:
        await _share_not_found()

    # #1646 — events are stamped `datetime.now(timezone.utc)` server-side, so the
    # week window and `week_of` must derive from UTC too (mirrors kids.py weekly,
    # #857). A naive `date.today()` on a non-UTC host would shift the card's
    # 7-day window / active_days / minutes_by_day a day off from the in-app view.
    now = datetime.now(timezone.utc).date()
    start = now - timedelta(days=6)
    # Bind the window as an aware UTC midnight (same pattern as kids.py weekly) so
    # the timestamptz comparison doesn't depend on the Postgres session TimeZone.
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    events = (
        await db.scalars(
            select(ProgressEvent).where(
                ProgressEvent.kid_id == kid.id,
                ProgressEvent.created_at >= start_dt,
            )
        )
    ).all()
    rounds = len(events)
    correct = sum(1 for e in events if e.correct)
    # #1552 — minutes is a timestamp-derived session-span estimate, NOT Σ
    # response_ms (which is per-answer latency, not play time).
    minutes = _session_span_minutes(events)
    active_days = len({e.created_at.date() for e in events})
    games = Counter(e.game_id for e in events)
    top_game_id = games.most_common(1)[0][0] if games else None
    top_game = None
    if top_game_id:
        # #1551 — resolve the raw game id to its catalog title so the public
        # snapshot never leaks an internal machine id. Unknown/legacy ids fall
        # back to a humanized slug.
        title = await db.scalar(
            select(ContentItem.title).where(
                ContentItem.id == top_game_id,
                ContentItem.kind == "game",
            )
        )
        top_game = title or _humanize_game_id(top_game_id)

    mastered_rows = (
        await db.scalars(
            select(SkillMastery.skill_id).where(
                SkillMastery.kid_id == kid.id,
                SkillMastery.mastery >= 0.8,
            )
        )
    ).all()
    mastered_count = len(mastered_rows)

    # #8 — per-day minute curve (oldest → newest, zero-filled) so the share
    # card can draw 7-day bars. No dates, just floats — stays zero-identity.
    # #1552 — same session-span estimate as the total (never response_ms).
    min_by_day: list[float] = []
    for i in range(7):
        d = start + timedelta(days=i)
        min_by_day.append(_session_span_minutes([x for x in events if x.created_at.date() == d]))

    return ShareSnapshotOut(
        rounds=rounds,
        minutes=minutes,
        minutes_approx=True,
        correct_pct=round(100 * correct / rounds) if rounds else 0,
        active_days=active_days,
        mastered_count=mastered_count,
        top_game=top_game,
        week_of=now.isoformat(),
        minutes_by_day=min_by_day,
    )
