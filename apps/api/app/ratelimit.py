"""Durable rate limiter (#772).

The original limiter was a per-process dict, so every worker restart (and every
extra uvicorn worker) silently reset the windows and lockouts. The API now keeps
each bucket in Postgres (`rate_limit_buckets`) so limits are shared across
workers and survive restarts.

`rate_limit` keys on the authenticated account + client IP (write endpoints);
`ip_rate_limit` keys only on client IP for auth-free public reads. Both use a
fixed window — simpler to make atomic with an upsert than the old in-memory
sliding deque, and still strict enough for abuse control.
"""

import math
from datetime import datetime, timedelta, timezone
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import case, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .deps import get_current_profile
from .models import Profile, RateLimitBucket

_WINDOW_SECONDS = 60
_REQUESTS_PER_MIN = 120


def _naive_utcnow() -> datetime:
    """Postgres returns naive TIMESTAMP columns, so store naive UTC everywhere."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _allow_fixed_window(
    db: AsyncSession, key: str, limit: int, window_seconds: int
) -> bool:
    """Atomically increment a fixed-window bucket and return whether allowed.

    The `INSERT ... ON CONFLICT` increments the current window in one statement
    (resetting the window when it has expired), so two workers can't both pass
    a request on a stale count. The increment is committed immediately so a
    later route failure can't roll the limit back.
    """
    now = _naive_utcnow()
    cutoff = now - timedelta(seconds=window_seconds)
    stmt = (
        pg_insert(RateLimitBucket)
        .values(key=key, window_start=now, count=1, locked_until=None)
        .on_conflict_do_update(
            index_elements=[RateLimitBucket.key],
            set_={
                "window_start": case(
                    (RateLimitBucket.window_start < cutoff, now),
                    else_=RateLimitBucket.window_start,
                ),
                "count": case(
                    (RateLimitBucket.window_start < cutoff, 1),
                    else_=RateLimitBucket.count + 1,
                ),
            },
        )
        .returning(RateLimitBucket.count)
    )
    count = (await db.execute(stmt)).scalar_one()
    await db.commit()
    return count <= limit


def rate_limit(limit: int = _REQUESTS_PER_MIN) -> Callable:
    """FastAPI dependency enforcing `limit` requests/minute per account+IP.

    Depends on get_current_profile (cached per request by FastAPI), so auth
    runs exactly once per request. Returns the profile for the endpoint to
    use as-is. A breached key gets HTTP 429.
    """

    async def dep(
        request: Request,
        profile: Profile = Depends(get_current_profile),
        db: AsyncSession = Depends(get_db),
    ) -> Profile:
        ip = request.client.host if request.client else "unknown"
        key = f"{profile.id}:{ip}"
        if not await _allow_fixed_window(db, key, limit, _WINDOW_SECONDS):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests — try again in a moment",
            )
        return profile

    return dep


def ip_rate_limit(limit: int = _REQUESTS_PER_MIN) -> Callable:
    """FastAPI dependency enforcing `limit` requests/minute per client IP.

    Variant for PUBLIC endpoints with no account to key on (e.g. a share link,
    the content catalog). Uses the same durable fixed-window buckets, with an
    `ip:` key prefix so buckets can never collide with the account+IP buckets
    from `rate_limit`. Unlike `rate_limit`, it does not depend on
    `get_current_profile` — it protects surfaces reachable without a token.
    Returns None; the route only needs the dependency to run before it.
    """

    async def dep(request: Request, db: AsyncSession = Depends(get_db)) -> None:
        ip = request.client.host if request.client else "unknown"
        key = f"ip:{ip}"
        if not await _allow_fixed_window(db, key, limit, _WINDOW_SECONDS):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests — try again in a moment",
            )

    return dep


class AuthAttemptGuard:
    """#1489 — credential-endpoint brute-force guard with exponential lockout.

    Complements `rate_limit` (a 120/min throughput cap). Login and
    change-password need a much stricter, failure-aware limiter: after a few
    wrong secrets a key is locked for a growing cooldown, and the route checks
    the lock BEFORE touching bcrypt so a locked account/ip costs no CPU.

    Two independent keys are checked and recorded per attempt:
      · account key (login email / profile id) — stops a targeted credential
        stuffing run across a botnet of IPs;
      · ip key — stops one IP from spraying many different accounts.

    #772 — state is stored in `rate_limit_buckets` (Postgres), not a
    per-process dict, so lockouts survive restarts and are shared by every
    worker.
    """

    def __init__(
        self,
        *,
        max_attempts: int = 5,
        window_seconds: float = 900.0,
        base_lockout_seconds: float = 60.0,
        max_lockout_seconds: float = 1800.0,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.base_lockout_seconds = base_lockout_seconds
        self.max_lockout_seconds = max_lockout_seconds

    def _lockout_seconds(self, failures: int) -> float:
        """1 min after the threshold, then 2, 4, 8, ... capped at 30 min."""
        excess = max(0, failures - self.max_attempts)
        return min(self.base_lockout_seconds * (2**excess), self.max_lockout_seconds)

    async def _load_for_update(
        self, db: AsyncSession, key: str, now: datetime
    ) -> RateLimitBucket:
        """Load (or create) one bucket and reset its window if it expired."""
        row = await db.scalar(
            select(RateLimitBucket)
            .where(RateLimitBucket.key == key)
            .with_for_update()
        )
        if row is None:
            row = RateLimitBucket(key=key, window_start=now, count=0, locked_until=None)
            db.add(row)
            await db.flush()
            return row

        cutoff = now - timedelta(seconds=self.window_seconds)
        if row.window_start < cutoff:
            row.count = 0
            row.window_start = now
        if row.locked_until is not None and now >= row.locked_until:
            row.locked_until = None
            row.count = 0
            row.window_start = now
        return row

    async def raise_if_locked(self, db: AsyncSession, *keys: str) -> None:
        """Raise 429 if ANY key is in its cooldown. Call before bcrypt."""
        now = _naive_utcnow()
        for key in keys:
            row = await db.scalar(
                select(RateLimitBucket).where(RateLimitBucket.key == key)
            )
            if row is None or row.locked_until is None:
                continue
            if now < row.locked_until:
                remaining = (row.locked_until - now).total_seconds()
                minutes = max(1, math.ceil(remaining / 60))
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    f"Too many attempts — try again in {minutes} minutes",
                )

    async def record_failure(self, db: AsyncSession, *keys: str) -> None:
        """Record a failed secret for every key and arm the next lockout."""
        now = _naive_utcnow()
        for key in keys:
            row = await self._load_for_update(db, key, now)
            row.count += 1
            if row.count >= self.max_attempts:
                row.locked_until = now + timedelta(
                    seconds=self._lockout_seconds(row.count)
                )
        await db.commit()

    async def reset(self, db: AsyncSession, *keys: str) -> None:
        """Clear state after a successful authentication."""
        now = _naive_utcnow()
        for key in keys:
            row = await db.scalar(
                select(RateLimitBucket)
                .where(RateLimitBucket.key == key)
                .with_for_update()
            )
            if row is None:
                continue
            row.count = 0
            row.window_start = now
            row.locked_until = None
        await db.commit()
