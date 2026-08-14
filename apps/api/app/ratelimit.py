"""#274 — lightweight in-memory rate limiter for write endpoints.

A per-process sliding-window limiter keyed on the authenticated account + client
IP. No Redis/DB — the API runs as a single container, so a plain in-memory dict
is correct and dependency-free.

Real traffic is far under the limit: the kid app syncs at most every 30s
(startAutoSync) with ≤40 events per POST. 120 requests/min per account is
>10× headroom for legit devices while still blocking scripted bulk uploads
(e.g. an attacker replaying story/progress batches with a stolen token).
"""

import time
from collections import defaultdict, deque
from typing import Callable

from fastapi import Depends, HTTPException, Request, status

from .deps import get_current_profile
from .models import Profile

_WINDOW_SECONDS = 60
_REQUESTS_PER_MIN = 120
_MAX_KEYS = 10_000

# key → deque of recent request timestamps (monotonic)
_buckets: dict[str, deque[float]] = defaultdict(deque)
_last_purge: dict[str, float] = {}


def _sliding_allow(key: str, limit: int, now: float) -> bool:
    dq = _buckets[key]
    cutoff = now - _WINDOW_SECONDS
    while dq and dq[0] <= cutoff:
        dq.popleft()
    if len(dq) >= limit:
        return False
    dq.append(now)
    return True


def _sweep(now: float) -> None:
    """Drop keys with no requests in the window so the map can't grow forever."""
    if len(_buckets) <= _MAX_KEYS:
        return
    for key, dq in list(_buckets.items()):
        if not dq or dq[-1] <= now - _WINDOW_SECONDS:
            del _buckets[key]
            _last_purge.pop(key, None)


def rate_limit(limit: int = _REQUESTS_PER_MIN) -> Callable:
    """FastAPI dependency enforcing `limit` requests/minute per account+IP.

    Depends on get_current_profile (cached per request by FastAPI), so auth
    runs exactly once per request. Returns the profile for the endpoint to
    use as-is. A breached key gets HTTP 429.
    """

    async def dep(
        request: Request,
        profile: Profile = Depends(get_current_profile),
    ) -> Profile:
        now = time.monotonic()
        ip = request.client.host if request.client else "unknown"
        key = f"{profile.id}:{ip}"
        if not _sliding_allow(key, limit, now):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests — try again in a moment",
            )
        _last_purge[key] = now
        _sweep(now)
        return profile

    return dep


def ip_rate_limit(limit: int = _REQUESTS_PER_MIN) -> Callable:
    """FastAPI dependency enforcing `limit` requests/minute per client IP.

    Variant for PUBLIC endpoints with no account to key on (e.g. a share link).
    Uses the same in-memory sliding window, with an `ip:` key prefix so buckets
    can never collide with the account+IP buckets from `rate_limit`. Returns
    None; the route only needs the dependency to run before it.
    """

    async def dep(request: Request) -> None:
        now = time.monotonic()
        ip = request.client.host if request.client else "unknown"
        key = f"ip:{ip}"
        if not _sliding_allow(key, limit, now):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests — try again in a moment",
            )
        _last_purge[key] = now
        _sweep(now)

    return dep
