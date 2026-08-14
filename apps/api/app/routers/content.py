from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import ContentItem, Skill, Subject
from ..ratelimit import ip_rate_limit
from ..schemas import GameOut, SkillOut, SubjectOut

router = APIRouter(prefix="/api/v1/content", tags=["content"])

# #839 — the catalog routes are public (no auth), so the limiter keys on client
# IP instead of account+IP to keep this surface from being scraped at will.
CONTENT_RATE_LIMIT = ip_rate_limit()


@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(
    _rate_limit: None = Depends(CONTENT_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    result = await db.scalars(select(Subject).order_by(Subject.sort_order))
    return list(result)


@router.get("/skills", response_model=list[SkillOut])
async def list_skills(
    _rate_limit: None = Depends(CONTENT_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    result = await db.scalars(select(Skill).order_by(Skill.sort_order))
    return list(result)


@router.get("/games", response_model=list[GameOut])
async def list_games(
    _rate_limit: None = Depends(CONTENT_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    result = await db.scalars(select(ContentItem).where(ContentItem.kind == "game", ContentItem.enabled.is_(True)))
    return list(result)
