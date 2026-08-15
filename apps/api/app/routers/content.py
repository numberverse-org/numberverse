from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import ContentItem, Profile, Skill, Subject
from ..ratelimit import rate_limit
from ..schemas import GameOut, SkillOut, SubjectOut

router = APIRouter(prefix="/api/v1/content", tags=["content"])

# #855 — the catalog is an "own-API only" surface, so it must not be public.
# Every route authenticates via get_current_profile (through rate_limit) and
# rate-limits on account+IP, exactly like the rest of the authenticated API.
CONTENT_RATE_LIMIT = rate_limit()


@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(
    _profile: Profile = Depends(CONTENT_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    # #913 — the public catalog serves only global rows (tenant_id NULL);
    # tenant-scoped rows are invisible to auth-free callers.
    result = await db.scalars(select(Subject).where(Subject.tenant_id.is_(None)).order_by(Subject.sort_order))
    return list(result)


@router.get("/skills", response_model=list[SkillOut])
async def list_skills(
    _profile: Profile = Depends(CONTENT_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    # #913 — public catalog: global rows only.
    result = await db.scalars(select(Skill).where(Skill.tenant_id.is_(None)).order_by(Skill.sort_order))
    return list(result)


@router.get("/games", response_model=list[GameOut])
async def list_games(
    _profile: Profile = Depends(CONTENT_RATE_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    # #913 — public catalog: global rows only.
    result = await db.scalars(
        select(ContentItem).where(
            ContentItem.kind == "game",
            ContentItem.enabled.is_(True),
            ContentItem.tenant_id.is_(None),
        )
    )
    return list(result)
