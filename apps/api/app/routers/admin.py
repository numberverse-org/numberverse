import json
import uuid
from datetime import datetime, date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import require_admin
from ..models import (
    ConfigEntry,
    ContentItem,
    Kid,
    KidSettings,
    Profile,
    ProgressEvent,
    Skill,
    SkillMastery,
    Subscription,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# react-admin resources → model. Keys are the REST resource names.
WHITELIST: dict[str, type] = {
    "profiles": Profile,
    "kids": Kid,
    "kid_settings": KidSettings,
    "skills": Skill,
    "content_items": ContentItem,
    "config": ConfigEntry,
    "subscriptions": Subscription,
}

UUID_MODELS = {Profile, Kid, Subscription, KidSettings}


def _jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (uuid.UUID,)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    return value


def _row_to_dict(obj: Any) -> dict:
    data: dict = {}
    for col in obj.__table__.columns:
        data[col.name] = _jsonable(getattr(obj, col.name))
    return data


def _pk_value(model: type, raw: str) -> Any:
    if model in UUID_MODELS:
        return uuid.UUID(raw)
    return raw


@router.get("/stats")
async def stats(_: Profile = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    async def count(model) -> int:
        return (await db.scalar(select(func.count()).select_from(model))) or 0

    recent = await db.scalars(
        select(ProgressEvent).order_by(ProgressEvent.id.desc()).limit(10)
    )
    return {
        "profiles": await count(Profile),
        "kids": await count(Kid),
        "skills": await count(Skill),
        "content_items": await count(ContentItem),
        "progress_events": await count(ProgressEvent),
        "subscriptions": await count(Subscription),
        "recent_events": [_row_to_dict(e) for e in recent],
    }


@router.get("/{resource}")
async def list_resource(
    resource: str,
    sort: str = None,
    range: str = None,
    filter: str = None,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")

    stmt = select(model)
    if filter:
        try:
            f = json.loads(filter)
        except json.JSONDecodeError:
            f = {}
        for key, val in f.items():
            col = getattr(model, key, None)
            if col is not None:
                if isinstance(val, str) and val.startswith("~"):
                    stmt = stmt.where(col.ilike(f"%{val[1:]}%"))
                elif isinstance(val, list):
                    stmt = stmt.where(col.in_(val))
                else:
                    stmt = stmt.where(col == val)

    if sort:
        try:
            field, direction = json.loads(sort)
            col = getattr(model, field, None)
            if col is not None:
                stmt = stmt.order_by(col.asc() if direction.upper() == "ASC" else col.desc())
        except Exception:
            pass

    # Pagination (react-admin sends range=[start,end])
    total = (await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0
    if range:
        try:
            start, end = json.loads(range)
            stmt = stmt.offset(start).limit(end - start + 1)
        except Exception:
            pass

    result = await db.scalars(stmt)
    rows = [_row_to_dict(r) for r in result]
    if range:
        try:
            start, _ = json.loads(range)
            total_header = str(total)
            content_range = f"{resource} {start}-{start + len(rows) - 1}/{total}"
            return Response(
                content=json.dumps(rows),
                media_type="application/json",
                headers={"Content-Range": content_range, "X-Total-Count": total_header},
            )
        except Exception:
            pass
    return rows


@router.get("/{resource}/{item_id}")
async def get_resource(
    resource: str,
    item_id: str,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    obj = await db.get(model, _pk_value(model, item_id))
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return _row_to_dict(obj)


@router.post("/{resource}", status_code=status.HTTP_201_CREATED)
async def create_resource(
    resource: str,
    body: dict,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    obj = model(**{k: v for k, v in body.items() if hasattr(model, k)})
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _row_to_dict(obj)


@router.put("/{resource}/{item_id}")
async def update_resource(
    resource: str,
    item_id: str,
    body: dict,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    obj = await db.get(model, _pk_value(model, item_id))
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    for key, val in body.items():
        if key == "id" or not hasattr(model, key):
            continue
        setattr(obj, key, val)
    await db.commit()
    await db.refresh(obj)
    return _row_to_dict(obj)


@router.delete("/{resource}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource: str,
    item_id: str,
    _: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    model = WHITELIST.get(resource)
    if not model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown resource")
    obj = await db.get(model, _pk_value(model, item_id))
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    await db.delete(obj)
    await db.commit()
