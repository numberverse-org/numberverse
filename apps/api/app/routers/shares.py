"""Share-card deep links (#245).

A parent can mint an unguessable per-kid share token and drop a link into the
weekly WhatsApp share-card. Opening the link hits a PUBLIC, auth-free endpoint
that returns ONLY anonymized aggregates — no name, avatar, kid id, email or
skill ids — so a friend/relative sees the week's numbers and nothing personal.
The public page makes one fetch and no tracking pixels: zero analytics.

Three routes:
  · GET    /kids/{kid_id}/share-token  (auth) — mint (or return) the opaque token
  · DELETE /kids/{kid_id}/share-token  (auth) — revoke the link (token is nulled)
  · GET    /share/{token}              (public) — the anonymized weekly snapshot
"""
import asyncio
import secrets
from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_profile
from ..models import Kid, KidSettings, Profile, ProgressEvent, SkillMastery
from ..ratelimit import ip_rate_limit

router = APIRouter(prefix="/api/v1", tags=["share"])

# #832 — /share/{token} is auth-free, so rate-limit by client IP only (there is
# no account to key on). 30 req/min is far more than a shared link gets opened
# while still blunting token-guessing hammering.
SHARE_SNAPSHOT_RATE_LIMIT = ip_rate_limit(limit=30)

# Small fixed floor for public 404s so a guessed link isn't distinguishable from
# a valid-but-paused link by response time alone (approximate, not exact).
_SHARE_404_DELAY_SECONDS = 0.02


async def _share_not_found() -> None:
    await asyncio.sleep(_SHARE_404_DELAY_SECONDS)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")


class ShareTokenOut(BaseModel):
    token: str


class ShareSnapshotOut(BaseModel):
    """Aggregates only — deliberately carries ZERO identity. `week_of` is the
    calendar day the window ends on; top_game is an opaque game id (no PII);
    minutes_by_day is the 7-day minute curve (just floats — no dates). #867 —
    the live wallet balance is intentionally NOT included on the public card."""
    rounds: int
    minutes: float
    correct_pct: int
    active_days: int
    mastered_count: int
    top_game: str | None
    week_of: str
    minutes_by_day: list[float] = []


@router.get("/kids/{kid_id}/share-token", response_model=ShareTokenOut)
async def get_share_token(
    kid_id,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Mint (or return) the kid's share token. Auth-protected + ownership-checked:
    only the parent can read their own kid's token, so the unguessable string
    never leaks through a guessed URL."""
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    if not owned.share_token:
        owned.share_token = secrets.token_urlsafe(24)
        await db.commit()
        await db.refresh(owned)
    return ShareTokenOut(token=owned.share_token)


@router.delete("/kids/{kid_id}/share-token", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_token(
    kid_id,
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
    minutes = round(sum(e.response_ms or 0 for e in events) / 60000.0, 1)
    active_days = len({e.created_at.date() for e in events})
    games = Counter(e.game_id for e in events)
    top_game = games.most_common(1)[0][0] if games else None

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
    min_by_day: list[float] = []
    for i in range(7):
        d = start + timedelta(days=i)
        min_by_day.append(round(sum(x.response_ms or 0 for x in events if x.created_at.date() == d) / 60000.0, 1))

    return ShareSnapshotOut(
        rounds=rounds,
        minutes=minutes,
        correct_pct=round(100 * correct / rounds) if rounds else 0,
        active_days=active_days,
        mastered_count=mastered_count,
        top_game=top_game,
        week_of=now.isoformat(),
        minutes_by_day=min_by_day,
    )
