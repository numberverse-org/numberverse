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
import secrets
import uuid
from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
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
SHARE_SNAPSHOT_RATE_LIMIT = ip_rate_limit(limit=30)

# #1764 — the authenticated share-token GET joins the read tier: minting/reading
# the opaque token is a read (no DB write), so it shares the higher read budget
# rather than the 120/min write budget.
SHARE_READ_RATE_LIMIT = read_rate_limit()

# Small fixed floor for public 404s so a guessed link isn't distinguishable from
# a valid-but-paused link by response time alone (approximate, not exact).
_SHARE_404_DELAY_SECONDS = 0.02


async def _share_not_found() -> None:
    await asyncio.sleep(_SHARE_404_DELAY_SECONDS)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")


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
    never leaks through a guessed URL."""
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    if not owned.share_token:
        owned.share_token = secrets.token_urlsafe(24)
        # #1550 — audit when this token was minted (stored via migrations.py;
        # kept off the ORM model so another wave can own the column addition).
        await db.execute(
            text(
                "UPDATE kids SET share_token_created_at = now(), "
                "share_token_revoked_at = NULL WHERE id = CAST(:kid_id AS uuid)"
            ),
            {"kid_id": str(kid_id)},
        )
        await db.commit()
        await db.refresh(owned)
    return ShareTokenOut(token=owned.share_token)


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
    owned.share_token = secrets.token_urlsafe(24)
    await db.execute(
        text(
            "UPDATE kids SET share_token_created_at = now(), "
            "share_token_revoked_at = NULL WHERE id = CAST(:kid_id AS uuid)"
        ),
        {"kid_id": str(kid_id)},
    )
    await db.commit()
    await db.refresh(owned)
    return ShareTokenOut(token=owned.share_token)


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
async def get_share_snapshot(token: str, db: AsyncSession = Depends(get_db)):
    """Public weekly snapshot for a share card. NO auth: the token IS the key.
    Unknown/revoked/paused tokens → 404 (a guessed link finds nothing)."""
    if not token:
        await _share_not_found()
    kid = await db.scalar(select(Kid).where(Kid.share_token == token))
    if not kid:
        await _share_not_found()

    # #867 — the parent's pause kill-switch also gates the public card: while a
    # kid is paused, their share link stops resolving. A missing settings row
    # means defaults (not paused), so legacy kids keep sharing.
    settings = await db.get(KidSettings, kid.id)
    if settings is not None and settings.paused:
        await _share_not_found()

    now = date.today()
    start = now - timedelta(days=6)
    events = (
        await db.scalars(
            select(ProgressEvent).where(
                ProgressEvent.kid_id == kid.id,
                ProgressEvent.created_at >= start,
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
