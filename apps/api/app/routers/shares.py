"""Share-card deep links (#245).

A parent can mint an unguessable per-kid share token and drop a link into the
weekly WhatsApp share-card. Opening the link hits a PUBLIC, auth-free endpoint
that returns ONLY anonymized aggregates — no name, avatar, kid id, email or
skill ids — so a friend/relative sees the week's numbers and nothing personal.
The public page makes one fetch and no tracking pixels: zero analytics.

Two routes:
  · GET /kids/{kid_id}/share-token  (auth) — mint (or return) the opaque token
  · GET /share/{token}              (public) — the anonymized weekly snapshot
"""
import secrets
from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_profile
from ..models import Kid, Profile, ProgressEvent, SkillMastery

router = APIRouter(prefix="/api/v1", tags=["share"])


class ShareTokenOut(BaseModel):
    token: str


class ShareSnapshotOut(BaseModel):
    """Aggregates only — deliberately carries ZERO identity. `week_of` is the
    calendar day the window ends on; top_game is an opaque game id (no PII);
    coins is the current wallet balance (a single number, no per-day history);
    minutes_by_day is the 7-day minute curve (just floats — no dates)."""
    rounds: int
    minutes: float
    correct_pct: int
    active_days: int
    mastered_count: int
    top_game: str | None
    week_of: str
    coins: int = 0
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


@router.get("/share/{token}", response_model=ShareSnapshotOut)
async def get_share_snapshot(token: str, db: AsyncSession = Depends(get_db)):
    """Public weekly snapshot for a share card. NO auth: the token IS the key.
    Unknown/revoked tokens → 404 (a guessed link finds nothing)."""
    if not token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")
    kid = await db.scalar(select(Kid).where(Kid.share_token == token))
    if not kid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")

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
        coins=kid.coins or 0,
        minutes_by_day=min_by_day,
    )
