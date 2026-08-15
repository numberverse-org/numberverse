"""#1534/#1535 — Web Push subscription storage + parent-gated subscribe API.

A parent's browser registers a Web Push subscription with the three pieces the
Push API gives us: `endpoint`, `p256dh`, and `auth`. Those rows live in their
OWN `push_subscriptions` table (see models.PushSubscription) so they can never
collide with the billing `Subscription` model whose table is `subscriptions`.

#1535 parent-gating contract
----------------------------
"Parent-gated" currently means **token-required**. Every route here depends on
`get_current_profile`, so anon requests get a 401 and can never reach the
opt-in toggle's storage. The real PIN/password re-confirm is intentionally a UI
concern: the parent portal must ask for a fresh password/PIN confirmation
BEFORE calling `POST /subscribe` (and the API only ever sees the already
authenticated parent token). Until a real PIN system ships, this reauth-on-
toggle is the whole gate — the UI agent owns the confirmation step; this router
owns the server-side authentication boundary.

Secret handling: `p256dh` and `auth` are client key material. They are accepted
on subscribe and stored, but the list route never returns them back to the
client. All endpoints are bounded by the app's global request-body limit.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_profile
from ..models import Profile, PushSubscription

router = APIRouter(prefix="/api/v1/push", tags=["push"])

# Generous per-field ceilings. The real ceiling is main.py's 1 MiB global body
# limit; these just keep obviously-garbage payloads from reaching the DB layer.
ENDPOINT_MAX_LENGTH = 2048
P256DH_MAX_LENGTH = 2048
AUTH_MAX_LENGTH = 1024


class PushSubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=ENDPOINT_MAX_LENGTH)
    p256dh: str = Field(min_length=1, max_length=P256DH_MAX_LENGTH)
    auth: str = Field(min_length=1, max_length=AUTH_MAX_LENGTH)


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=ENDPOINT_MAX_LENGTH)


class PushSubscriptionOut(BaseModel):
    """The only shape ever returned to the client — never includes the secret
    `p256dh`/`auth` key material."""

    id: uuid.UUID
    endpoint: str
    created_at: datetime

    model_config = {"from_attributes": True}


# #1535 — the API half of parent-gating is token-required auth. The parent
# portal re-confirms the parent's password/PIN before calling this route; here
# we only ever trust the authenticated `get_current_profile` token.
@router.post("/subscribe", response_model=PushSubscriptionOut)
async def subscribe(
    body: PushSubscribeIn,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Upsert the caller's push subscription for `endpoint`.

    Re-subscribing the same endpoint updates the keys in place. If the endpoint
    is already registered to a DIFFERENT profile it is a 409 — a browser push
    subscription can only belong to one parent account.
    """
    existing = await db.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    if existing is not None:
        if existing.profile_id != profile.id:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This push subscription is already registered to another account",
            )
        existing.p256dh = body.p256dh
        existing.auth = body.auth
        await db.commit()
        await db.refresh(existing)
        return existing

    subscription = PushSubscription(
        profile_id=profile.id,
        endpoint=body.endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
    )
    db.add(subscription)
    await db.commit()
    await db.refresh(subscription)
    return subscription


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    body: PushUnsubscribeIn,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Delete the caller's push subscription for `endpoint`.

    Idempotent: a missing (or already-deleted) subscription is a no-op, never
    an error.
    """
    existing = await db.scalar(
        select(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.profile_id == profile.id,
        )
    )
    if existing is not None:
        await db.delete(existing)
        await db.commit()


@router.get("/subscriptions", response_model=list[PushSubscriptionOut])
async def list_subscriptions(
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """Return this profile's push endpoints, newest first.

    Keys are secret — the response is intentionally `id` + `endpoint` +
    `created_at` only, never `p256dh`/`auth`.
    """
    rows = await db.scalars(
        select(PushSubscription)
        .where(PushSubscription.profile_id == profile.id)
        .order_by(PushSubscription.created_at.desc())
    )
    return list(rows)
