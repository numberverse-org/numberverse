"""Parent Plus billing — bKash Tokenized Checkout (BD) rails.

The flow (parent portal → bKash → back to portal):
  1. POST /api/v1/billing/bkash/create  → backend creates the bKash payment and
     returns the `bkashURL` (and `paymentID`).
  2. The parent authorizes on bKash; bKash redirects to the callback URL.
  3. POST /api/v1/billing/bkash/execute → backend executes and, on success,
     activates the subscription (`plan="plus"`, 1 year).

The kid app never calls these — it only reads `plan` from /auth/me. Payment is
a parent-portal concern (bKash redirects are awkward on a kid's phone).

All routes are parent-gated via `get_current_profile`. When bKash credentials
are unset the routes return 501 (the portal hides the upgrade button, same
pattern as the disabled Google sign-in).
"""

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from ..bkash import BkashService, is_completed
from ..config import settings
from ..db import get_db
from ..deps import get_current_profile
from ..models import Profile, Subscription
from ..ratelimit import rate_limit

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

# bKash create/execute are rare, one-time parent actions; a hard per-account cap
# stops mass payment attempts / enumeration without a failure-aware guard.
_BILLING_RATE_LIMIT = rate_limit()

bkash = BkashService(settings)


class BkashCreateIn(BaseModel):
    callback_url: str = Field(min_length=8, max_length=500)
    # payerReference is a JSON-encoded envelope so the plan id can ride through
    # bKash untouched (mirrors newscards). Keep it tiny.
    payer_reference: str = Field(default="{}", max_length=200)


class BkashExecuteIn(BaseModel):
    payment_id: str = Field(min_length=8, max_length=64)


def _require_bkash() -> None:
    if not bkash.configured:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "bKash billing is not configured")


async def _activate_subscription(db: AsyncSession, profile: Profile, store_ref: str, days: int) -> None:
    """Upsert a "plus" subscription for the profile (one row per profile)."""
    from datetime import datetime, timezone

    end = datetime.now(timezone.utc) + timedelta(days=days)
    stmt = (
        pg_insert(Subscription)
        .values(
            profile_id=profile.id,
            plan="plus",
            store="bkash",
            store_ref=store_ref,
            status="active",
            current_period_end=end,
        )
        .on_conflict_do_update(
            index_elements=[Subscription.profile_id],
            set_={
                "plan": "plus",
                "store": "bkash",
                "store_ref": store_ref,
                "status": "active",
                "current_period_end": end,
            },
        )
    )
    await db.execute(stmt)
    await db.commit()


@router.post("/bkash/create")
async def bkash_create(
    body: BkashCreateIn,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
    _limit: None = Depends(_BILLING_RATE_LIMIT),
):
    _require_bkash()
    amount = settings.plus_annual_bdt
    invoice = f"nv-plus-{uuid.uuid4().hex[:16]}"
    data = await run_in_threadpool(
        bkash.create_payment,
        float(amount),
        body.callback_url,
        invoice,
        body.payer_reference,
    )
    return {
        "paymentID": data.get("paymentID"),
        "bkashURL": data.get("bkashURL"),
        "amount": amount,
        "currency": "BDT",
    }


@router.post("/bkash/execute")
async def bkash_execute(
    body: BkashExecuteIn,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
    _limit: None = Depends(_BILLING_RATE_LIMIT),
):
    _require_bkash()
    data = await run_in_threadpool(bkash.execute_payment, body.payment_id)
    if is_completed(data):
        await _activate_subscription(db, profile, body.payment_id, settings.plus_annual_days)
        return {"status": "completed", "plan": "plus"}
    return {"status": data.get("transactionStatus", "failed"), "plan": None}


@router.get("/bkash/query/{payment_id}")
async def bkash_query(
    payment_id: str,
    profile: Profile = Depends(get_current_profile),
    _limit: None = Depends(_BILLING_RATE_LIMIT),
):
    _require_bkash()
    return await run_in_threadpool(bkash.query_payment, payment_id)


@router.get("/bkash/status")
async def bkash_status():
    """Whether bKash billing is configured on THIS server (portal gates the
    upgrade button on it, mirroring /auth/google/status)."""
    return {"enabled": bkash.configured, "annual_bdt": settings.plus_annual_bdt}
