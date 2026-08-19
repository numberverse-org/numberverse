"""Durable rate limiter (#772).

The original limiter was a per-process dict, so every worker restart (and every
extra uvicorn worker) silently reset the windows and lockouts. The API now keeps
each bucket in Postgres (`rate_limit_buckets`) so limits are shared across
workers and survive restarts.

#772 contract — this limiter does NOT depend on a single-worker deploy. Every
window count and lockout lives in the DB, so multiple uvicorn workers (or two
processes) sharing one Postgres all enforce ONE set of buckets, and a restart
never resets a window. The only process-local state in this module is
`_logged_throttle_windows` (a bounded dedup cache for 429 LOG lines); it is
redaction bookkeeping, never window/lockout state.

`rate_limit` keys on the authenticated account + client IP (write endpoints);
`ip_rate_limit` keys only on client IP for auth-free public reads. Both use a
fixed window — simpler to make atomic with an upsert than the old in-memory
sliding deque, and still strict enough for abuse control. `ip_rate_limit`
accepts an optional `tag` (#1763) so each public surface can hold its own
independent per-IP bucket.
"""

import hashlib
import logging
import math
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import case, delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .deps import get_current_profile
from .models import Profile, RateLimitBucket

_WINDOW_SECONDS = 60
_REQUESTS_PER_MIN = 120
# #1764 — expensive read/sync endpoints (snapshot, activity, weekly, stories,
# aggregates) get their OWN higher per-minute budget. Reads are more frequent
# than writes but must still be bounded so a breached/busy token can't hammer
# the DB pool. The `:read` key suffix keeps every read bucket distinct from the
# corresponding write bucket for the same account+IP+endpoint.
READ_REQUESTS_PER_MIN = 600

logger = logging.getLogger("numberverse")

# #1760/#1761 — trusted proxy address prefixes. In prod the API is only
# reachable through the nginx `web` container on the docker bridge, so a socket
# peer in these private ranges is one of OUR proxies (never an external client).
# Mirrors Dockerfile.api's --forwarded-allow-ips so _request_ip stays correct
# even when uvicorn is run without --proxy-headers (host dev).
_TRUSTED_PROXY_PREFIXES = (
    "10.", "127.",
    "172.16.", "172.17.", "172.18.", "172.19.",
    "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
    "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
    "172.30.", "172.31.", "192.168.",
)

# #1751 — 429 log-flood guard: (kind, key) -> coarse window id already logged.
# #772 — this is the ONLY in-process state in the limiter and it is pure log
# dedup (redaction bookkeeping), NEVER window/lockout state. The buckets live
# in `rate_limit_buckets` (Postgres), so a multi-worker or restarted API keeps
# its limits intact — no single-worker contract is being relied on.
_logged_throttle_windows: dict[tuple[str, str], int] = {}


def _naive_utcnow() -> datetime:
    """Postgres returns naive TIMESTAMP columns, so store naive UTC everywhere."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# #1767 — rate_limit_buckets is an unbounded append-only table: every key a
# client ever touched (including login-email probing and spoofed XFF IPs)
# leaves a row forever. The scheduled prune calls this ~hourly so the table
# stays bounded. Buckets are short-lived windows — anything untouched for
# 7 days is certainly dead.
BUCKET_PRUNE_OLDER_THAN_DAYS = 7


async def prune_rate_limit_buckets(db, older_than_days: int = BUCKET_PRUNE_OLDER_THAN_DAYS) -> int:
    """Delete rate_limit_buckets rows whose window_start is older than
    older_than_days. Returns the row count removed."""
    cutoff = _naive_utcnow() - timedelta(days=older_than_days)
    result = await db.execute(
        delete(RateLimitBucket).where(RateLimitBucket.window_start < cutoff)
    )
    await db.commit()
    return result.rowcount or 0


async def delete_profile_rate_limit_buckets(
    db: AsyncSession, profile_id: uuid.UUID, email: str | None = None
) -> int:
    """#1680 — hard-delete every rate_limit_buckets row that identifies this
    profile, so right-to-erasure cleans up the durable limiter state that would
    otherwise keep referencing a deleted account forever.

    The buckets are keyed by PREFIX — the exact shapes `rate_limit` /
    `read_rate_limit` / `AuthAttemptGuard` mint (see this module):

      ``login:email:{email}``        — login failure/lockout on the email;
      ``pw:profile:{profile_id}``    — change-password failure/lockout;
      ``{profile_id}:...``           — legacy account+IP write/read windows, incl.
                                       ``{profile_id}:{ip}:{endpoint}``,
                                       ``{profile_id}:{endpoint}`` and the
                                       ``:read`` variants.
      ``acct:{profile_id}:...``      — #3110 account-only write buckets.

    ``_``/``%`` in an email local-part are LIKE metacharacters; a match on a
    DIFFERENT (already-deleted) account's bucket is harmless, and no other
    account shares this profile's ``{profile_id}:`` prefix. Returns the number
    of rows removed. Does NOT commit — the caller commits with the deletion."""
    prefixes = [f"{profile_id}:", f"acct:{profile_id}:"]
    if email:
        prefixes.append(f"login:email:{email}")
    prefixes.append(f"pw:profile:{profile_id}")
    total = 0
    for prefix in prefixes:
        result = await db.execute(
            delete(RateLimitBucket).where(RateLimitBucket.key.like(prefix + "%"))
        )
        # `rowcount` is the live-DB row count; a fake/test session may expose a
        # different result shape, so default to 0 rather than crash.
        total += getattr(result, "rowcount", None) or 0
    return total


def redact_key(value: str) -> str:
    """Short sha256 prefix of a sensitive identifier.

    Enough to correlate log lines with a bucket key across a credential-stuffing
    run, without ever exposing the raw email / profile id / IP.
    """
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def _is_trusted_proxy(ip: str) -> bool:
    return any(ip.startswith(prefix) for prefix in _TRUSTED_PROXY_PREFIXES)


def _request_ip(request: Request) -> str:
    """Resolve the REAL client IP defensively (#1760/#1761).

    The leftmost X-Forwarded-For hop is attacker-supplied and MUST NOT be used.
    In prod nginx REPLACES XFF with ``$remote_addr`` (infra/deploy/nginx.conf),
    so the header carries exactly one hop: the real client IP. If a chain ever
    reaches the app, the RIGHTMOST hop is the one appended by the closest
    trusted proxy and is the real client as seen from our edge.

    When uvicorn runs with --proxy-headers and the peer is in
    --forwarded-allow-ips, it has ALREADY rewritten request.client.host to the
    trusted XFF value, so returning request.client.host is correct. When it runs
    without a proxy in front (host dev), request.client.host is the socket peer
    and any XFF is ignored UNLESS the socket peer is a known private/proxy
    address — a public peer can't be behind our proxy.
    """
    peer = request.client.host if request.client else "unknown"
    headers = getattr(request, "headers", None)
    xff = headers.get("x-forwarded-for") if headers is not None else None
    if xff and _is_trusted_proxy(peer):
        hops = [h.strip() for h in xff.split(",") if h.strip()]
        if hops:
            return hops[-1]
    return peer


def _endpoint_tag(request: Request) -> str:
    """Stable endpoint/route-group tag for rate-limit keys (#1762).

    Groups by the resource segment of /api/v1/<resource>/..., so catalog reads
    (content), progress sync (progress), kid writes (kids), export (export) and
    import (import) each get their OWN per-account+IP bucket instead of all
    starving on one shared 120/min key.
    """
    url = getattr(request, "url", None)
    path = (getattr(url, "path", "") or "").rstrip("/")
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 3 and parts[0] == "api":
        tag = parts[2]
    else:
        tag = parts[-1] if parts else "root"
    # Normalize a trailing file extension so /api/v1/export and
    # /api/v1/export.csv share a budget.
    return tag.split(".", 1)[0]


def _log_429(kind: str, key: str, limit: int, window_seconds: float) -> None:
    """#1751 — WARNING on each 429, deduped per kind+key+window to avoid flooding.

    The key is REDACTED (short sha256 prefix) — the raw profile id / ip / email
    never reach the log. `limit` and `window` are included for the operator.
    """
    window = int(time.time()) // max(1, int(window_seconds))
    dedup = (kind, key)
    if _logged_throttle_windows.get(dedup) == window:
        return
    _logged_throttle_windows[dedup] = window
    if len(_logged_throttle_windows) > 2048:
        for stale in [k for k, w in _logged_throttle_windows.items() if w != window]:
            _logged_throttle_windows.pop(stale, None)
    logger.warning(
        "rate_limit 429 kind=%s key=%s limit=%d window=%ds",
        kind, redact_key(key), limit, int(window_seconds),
    )


async def _allow_fixed_window(
    db: AsyncSession, key: str, limit: int, window_seconds: int
) -> bool:
    """Atomically increment a fixed-window bucket and return whether allowed.

    The `INSERT ... ON CONFLICT` increments the current window in one statement
    (resetting the window when it has expired), so two workers can't both pass
    a request on a stale count. The increment is committed immediately so a
    later route failure can't roll the limit back.

    #1770 — the pre-commit is intentional: the durable cross-worker count must
    survive a route that fails afterwards (422/413), or a second worker could
    replay a burnt window and pass. The residual blast radius is bounded by
    #1762's per-endpoint keys — a malformed-flood that exhausts this bucket can
    only burn ITS OWN endpoint's bucket (e.g. /progress), never the /export
    bucket, so one bad surface cannot starve another.
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
        ip = _request_ip(request)
        # #1762 — per-endpoint key: the same account+IP no longer shares one
        # 120/min bucket across catalog reads, progress sync, kid writes,
        # export and import; each route group gets its own budget.
        endpoint = _endpoint_tag(request)
        # #3110 — the old composite key f"{profile.id}:{ip}:{endpoint}" was a
        # per-(account, IP) cap, NOT a per-account cap: a breached token run
        # across a small botnet (or a legit multi-device account behind
        # rotating CGNAT) got a FRESH 120/min bucket per IP and could drive
        # arbitrary write volume on one account. Enforce TWO independent
        # buckets now — a hard account-only key for the strict per-account
        # budget, and an ip-only key for flood control — raising 429 if EITHER
        # is breached, exactly the way the credential guard's record_failure
        # already splits account-key and ip-key into two buckets.
        account_key = f"acct:{profile.id}:{endpoint}"
        if ip == "unknown":
            # #1769 — no client socket: there is no per-IP dimension at all, so
            # the account-only bucket alone carries the limit.
            keys = [account_key]
        else:
            # `wip:` namespaces the write-IP flood-control bucket apart from the
            # `ip:{tag}:...` public-surface buckets minted by ip_rate_limit, so a
            # write endpoint and a public surface can never share a budget.
            keys = [account_key, f"wip:{endpoint}:{ip}"]
        for key in keys:
            if not await _allow_fixed_window(db, key, limit, _WINDOW_SECONDS):
                _log_429("account", key, limit, _WINDOW_SECONDS)
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Too many requests — try again in a moment",
                )
        return profile

    return dep


def read_rate_limit(limit: int = READ_REQUESTS_PER_MIN) -> Callable:
    """#1764 — read-tier budget for expensive sync/read endpoints.

    Same durable fixed-window mechanism and same per-endpoint key shape as
    `rate_limit`, but under its own `:read` namespace and a higher budget —
    so a heavy reader (snapshot/activity/weekly/stories/aggregates) can never
    starve the write tier or the DB pool, while normal reads stay uncramped.
    """

    async def dep(
        request: Request,
        profile: Profile = Depends(get_current_profile),
        db: AsyncSession = Depends(get_db),
    ) -> Profile:
        ip = _request_ip(request)
        endpoint = _endpoint_tag(request)
        # #1769 — same no-IP fallback as `rate_limit`: with no client socket
        # the literal "unknown" would merge every no-IP client into one shared
        # {profile.id}:unknown:endpoint:read bucket, so drop the ip component
        # and key on the account alone.
        if ip == "unknown":
            key = f"{profile.id}:{endpoint}:read"
        else:
            key = f"{profile.id}:{ip}:{endpoint}:read"
        if not await _allow_fixed_window(db, key, limit, _WINDOW_SECONDS):
            _log_429("read", key, limit, _WINDOW_SECONDS)
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests — try again in a moment",
            )
        return profile

    return dep


def ip_rate_limit(limit: int = _REQUESTS_PER_MIN, *, tag: str | None = None) -> Callable:
    """FastAPI dependency enforcing `limit` requests/minute per client IP.

    Variant for PUBLIC endpoints with no account to key on (e.g. a share link,
    the content catalog). Uses the same durable fixed-window buckets, with an
    `ip:` key prefix so buckets can never collide with the account+IP buckets
    from `rate_limit`. Unlike `rate_limit`, it does not depend on
    `get_current_profile` — it protects surfaces reachable without a token.
    Returns None; the route only needs the dependency to run before it.

    #1763 — when `tag` is set, the key becomes ``f"ip:{tag}:{ip}"`` so each
    public surface (signup, refresh, share-snapshot) gets its own per-IP bucket
    and the configured limits apply independently. When `tag` is None, the
    legacy key ``f"ip:{ip}"`` is used so existing callers that do not opt in
    are unaffected.

    #1769 — when there is no client socket, `_request_ip` yields "unknown";
    this dep then falls back to the RIGHTMOST X-Forwarded-For hop (the value
    nearest our trusted edge) so a no-IP client that DID send XFF still gets
    its own bucket. A public client with neither a socket nor XFF has no
    identifier at all and genuinely shares the single `ip:unknown` bucket —
    a documented residual; such a client can't be told apart anyway.
    """

    async def dep(request: Request, db: AsyncSession = Depends(get_db)) -> None:
        ip = _request_ip(request)
        # #1769 — no-IP fallback granularity: keep every share/catalog surface
        # from collapsing into one shared "unknown" bucket. When the client
        # socket is missing, use the RIGHTMOST XFF hop if one exists (that is
        # the client as seen from our edge, appended by our own proxy); only a
        # client with genuinely no identifier stays "unknown".
        if ip == "unknown":
            headers = getattr(request, "headers", None)
            xff = headers.get("x-forwarded-for") if headers is not None else None
            if xff:
                candidate = xff.rsplit(",", 1)[-1].strip()
                if candidate:
                    ip = candidate
        # #1763 — optional tag gives each public surface its own bucket.
        if tag is not None:
            key = f"ip:{tag}:{ip}"
        else:
            key = f"ip:{ip}"
        if not await _allow_fixed_window(db, key, limit, _WINDOW_SECONDS):
            _log_429("ip", key, limit, _WINDOW_SECONDS)
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
            # #3107 — do NOT zero the failure count on cooldown expiry. The
            # escalation ladder (2x/4x/8x… up to 30 min) is driven by
            # `_lockout_seconds(count)`, which can only grow past the 60s base
            # if the count survives the cooldown. Carry the prior breach forward
            # (count = max(count, max_attempts)) so the NEXT arming doubles the
            # lockout; only the window clock resets here.
            row.locked_until = None
            row.count = max(row.count, self.max_attempts)
            row.window_start = now
        return row

    async def raise_if_locked(self, db: AsyncSession, *keys: str) -> None:
        """Raise 429 if ANY key is in its cooldown. Call before bcrypt."""
        now = _naive_utcnow()
        for key in keys:
            # #3115 — take the SAME FOR UPDATE row lock record_failure uses, so
            # the pre-bcrypt check and the post-bcrypt increment are one atomic
            # read-modify-write. A plain SELECT here let N concurrent attempts
            # all read an unlocked/expired row before any of them recorded a
            # failure, each then incrementing past max_attempts in a single
            # burst. With the lock, the failure counter stays monotonic and the
            # lockout arms exactly at max_attempts.
            row = await db.scalar(
                select(RateLimitBucket)
                .where(RateLimitBucket.key == key)
                .with_for_update()
            )
            if row is None or row.locked_until is None:
                continue
            if now < row.locked_until:
                # #1751 — log the lockout with the redacted key so credential-
                # stuffing leaves a trace. Dedup by kind+key+window.
                _log_429("lockout", key, self.max_attempts, self.window_seconds)
                # #3112 — return a GENERIC message so the lockout state is not
                # advertised to an attacker (the old "try again in N minutes"
                # body told them exactly when the cooldown would lapse and which
                # of their guesses weren't the target account).
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Too many attempts — try again later",
                )

    async def _record_ip_lockout(self, db: AsyncSession, ip: str, *, max_distinct: int) -> None:
        """#3112 — cap how many DISTINCT account lockouts a single IP may arm.

        Maintains a per-IP fixed-window counter (1 hour) of account-lockout arm
        events. This bounds the weaponization where one IP locks N known victim
        emails in a row (5 wrong-password requests each), holding every victim
        offline. When the budget is exhausted, raising here aborts BEFORE the
        account-key lockout is armed. Returns normally (and arms nothing of its
        own) once the counter is incremented within budget.
        """
        if not await _allow_fixed_window(db, f"lockout-armed:{ip}", max_distinct, 3600):
            _log_429("lockout-armed", ip, max_distinct, 3600)
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many attempts — try again later",
            )

    async def record_failure(
        self,
        db: AsyncSession,
        *keys: str,
        ip: str | None = None,
        max_distinct_lockouts: int | None = None,
    ) -> None:
        """Record a failed secret for every key and arm the next lockout.

        #3112 — when ``ip`` and ``max_distinct_lockouts`` are supplied, arming a
        NEW account-key lockout is gated so a single IP cannot weaponize the
        lockout against many distinct victim accounts (see
        ``_record_ip_lockout``). The first key in ``*keys`` is treated as the
        account key; the rest are presumed to be the ip/auxiliary keys.
        """
        now = _naive_utcnow()
        account_key = keys[0] if keys else None
        for i, key in enumerate(keys):
            row = await self._load_for_update(db, key, now)
            # Already locked (a previous attempt armed it): no new arming event,
            # and the failure record still increments nothing — the key is in its
            # cooldown. Just skip the increment; the caller already checks the
            # lock via raise_if_locked before bcrypt, so this is a re-entry guard.
            if row.locked_until is not None:
                continue
            row.count += 1
            if row.count < self.max_attempts:
                continue
            # About to arm a lockout. For the ACCOUNT key, enforce the per-IP
            # distinct-lockout budget first (#3112).
            if (
                i == 0
                and account_key is not None
                and ip is not None
                and max_distinct_lockouts is not None
            ):
                await self._record_ip_lockout(db, ip, max_distinct=max_distinct_lockouts)
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
