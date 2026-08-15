"""Lightweight in-memory rate limiter.

A per-process sliding-window limiter. `rate_limit` keys on the authenticated
account + client IP (write endpoints); `ip_rate_limit` keys only on client IP
for auth-free public reads (the content catalog). No Redis/DB — the API runs as
a single container, so a plain in-memory dict is correct and dependency-free.

Real write traffic is far under the limit: the kid app syncs at most every 30s
(startAutoSync) with ≤40 events per POST. 120 requests/min per account is
>10× headroom for legit devices while still blocking scripted bulk uploads
(e.g. an attacker replaying story/progress batches with a stolen token).
"""

import math
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

    Variant for PUBLIC endpoints with no account to key on (e.g. a share link,
    the content catalog). Uses the same in-memory sliding window, with an `ip:`
    key prefix so buckets can never collide with the account+IP buckets from
    `rate_limit`. Unlike `rate_limit`, it does not depend on `get_current_profile`
    — it protects surfaces reachable without a token. Returns None; the route
    only needs the dependency to run before it.
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

    In-memory by design (same single-container assumption as `rate_limit`).
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
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._locked_until: dict[str, float] = {}

    def _prune(self, key: str, now: float) -> None:
        dq = self._failures.get(key)
        if not dq:
            return
        cutoff = now - self.window_seconds
        while dq and dq[0] <= cutoff:
            dq.popleft()
        if not dq:
            self._failures.pop(key, None)

    def _lockout_seconds(self, failures: int) -> float:
        """1 min after the threshold, then 2, 4, 8, ... capped at 30 min."""
        excess = max(0, failures - self.max_attempts)
        return min(self.base_lockout_seconds * (2**excess), self.max_lockout_seconds)

    def _remaining(self, key: str, now: float) -> float | None:
        until = self._locked_until.get(key)
        if until is None:
            return None
        if now >= until:
            self._locked_until.pop(key, None)
            return None
        return until - now

    def raise_if_locked(self, *keys: str) -> None:
        """Raise 429 if ANY key is in its cooldown. Call before bcrypt."""
        now = time.monotonic()
        for key in keys:
            remaining = self._remaining(key, now)
            if remaining is not None:
                minutes = max(1, math.ceil(remaining / 60))
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    f"Too many attempts — try again in {minutes} minutes",
                )
        self._sweep(now)

    def record_failure(self, *keys: str) -> None:
        """Record a failed secret for every key and arm the next lockout."""
        now = time.monotonic()
        for key in keys:
            self._prune(key, now)
            dq = self._failures[key]
            dq.append(now)
            if len(dq) >= self.max_attempts:
                self._locked_until[key] = now + self._lockout_seconds(len(dq))
        self._sweep(now)

    def reset(self, *keys: str) -> None:
        """Clear state after a successful authentication."""
        for key in keys:
            self._failures.pop(key, None)
            self._locked_until.pop(key, None)

    def _sweep(self, now: float) -> None:
        if len(self._failures) + len(self._locked_until) <= _MAX_KEYS:
            return
        for key in list(self._failures.keys()):
            self._prune(key, now)
        for key, until in list(self._locked_until.items()):
            if now >= until:
                self._locked_until.pop(key, None)
