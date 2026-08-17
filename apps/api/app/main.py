import asyncio
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .accesslog import AccessLogMiddleware, install_access
from .config import settings
from .db import SessionLocal
from .embeddings import embed_stories
from .errorlog import install as install_errorlog, request_id_ctx
from .routers import admin, auth, content, export, kids, progress, shares
from .routers.import_data import MAX_IMPORT_BODY_BYTES
from .scrub import ScrubFilter
from .seed import create_tables, seed

logging.basicConfig(level=logging.INFO)
# #266 — every log line is scrubbed for PII before it's written.
for _h in logging.getLogger().handlers:
    _h.addFilter(ScrubFilter())
# #124 — WARNING+ records also land in a rotating, PII-redacted JSON-lines
# file (data/error.log) for local debugging. Zero analytics — nothing leaves
# the box. Attaches at most once (uvicorn reload, tests).
install_errorlog()
# #1754 — every HTTP request also lands as one JSON line in data/access.log
# (its own rotating file, same scrubber). Attaches at most once.
install_access()
log = logging.getLogger("numberverse")

# #1748 — the background embed/prune loop's liveness state, read by /health.
# `_embed_task` is the running asyncio task; `_embed_heartbeat` is a monotonic
# timestamp refreshed on every loop pass so /health can distinguish "alive and
# ticking" from "task alive but wedged inside a hang" (a task that is not done
# but stopped heartbeating is just as dead for ops purposes).
_embed_task: asyncio.Task | None = None
_embed_heartbeat: float = 0.0
# #1748 — /health treats the background loop as healthy only when its last
# heartbeat is younger than this many loop intervals (a stalled loop, or a DB
# outage that wedges the tick, must surface as degraded instead of "ok").
_EMBED_HEARTBEAT_TOLERANCE_MULTIPLIER = 3
# #1748 — the /health DB probe must never hang an LB/uptime monitor: bound the
# round-trip (the engine already uses pool_pre_ping, so a dead Postgres fails
# fast on checkout — this caps the pathological case).
_HEALTH_DB_PROBE_TIMEOUT_SECONDS = 2.0

# #836 — abuse guard: FastAPI/Starlette impose no global request-body cap, so a
# client can POST an arbitrarily large JSON document and force Pydantic to
# deserialize the whole thing (memory/CPU exhaustion). 1 MiB is far beyond any
# real Numberverse payload (auth, progress, content metadata, etc.).
#
# #1632 — ONE source of truth: the value lives in routers/import_data.py
# (`MAX_IMPORT_BODY_BYTES`) and is aliased here, so the import route's own
# guard and the outermost middleware can never drift apart (two disagreeing
# literals would leave a dead guard that can never fire).
MAX_REQUEST_BODY_BYTES = MAX_IMPORT_BODY_BYTES


class RequestBodySizeLimitMiddleware:
    """Pure-ASGI request-body size guard.

    Rejects Content-Length over budget with an immediate 413, and also counts
    chunked/unknown-length bodies as they stream in, rejecting once they cross
    the budget. Dependency-free so it runs before any framework machinery.
    """

    def __init__(self, app, max_body_bytes: int = MAX_REQUEST_BODY_BYTES):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length, malformed_content_length = self._content_length(scope)
        # #1633 — a present-but-non-numeric Content-Length is malformed HTTP.
        # Reject it with a hard 400 before any framework work instead of
        # silently forwarding the request to full body parsing.
        if malformed_content_length:
            await self._send_400(
                send,
                path=scope.get("path"),
                request_id=request_id_ctx.get(),
            )
            return
        if content_length is not None and content_length > self.max_body_bytes:
            await self._send_413(
                send,
                path=scope.get("path"),
                content_length=content_length,
                request_id=request_id_ctx.get(),
            )
            return

        state = {"received": 0, "response_started": False, "rejected": False}

        async def limited_receive():
            if state["rejected"]:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                state["received"] += len(message.get("body", b""))
                if state["received"] > self.max_body_bytes:
                    state["rejected"] = True
                    if not state["response_started"]:
                        # #1757 — log the rejection once, with the real path and
                        # request id, so oversized-body floods are debuggable.
                        await self._send_413(
                            send,
                            path=scope.get("path"),
                            content_length=self._content_length(scope)[0] or "chunked",
                            request_id=request_id_ctx.get(),
                        )
                    # Stop the downstream app from consuming the rest of the
                    # oversized stream; it would just waste CPU/network.
                    return {"type": "http.disconnect"}
            return message

        async def limited_send(message):
            if message["type"] == "http.response.start":
                state["response_started"] = True
            if state["rejected"]:
                return
            await send(message)

        try:
            await self.app(scope, limited_receive, limited_send)
        except Exception:
            # Once we've already emitted 413, swallowing downstream errors is
            # intentional — we are closing the exchange early.
            if state["rejected"]:
                return
            raise

    @staticmethod
    def _content_length(scope):
        """Return ``(length, malformed)`` from the request's Content-Length headers.

        ``length`` is the largest parsed numeric value (None when absent).
        ``malformed`` is True when a Content-Length header is present but not a
        plain number — callers reject that as a hard 400 (#1633) instead of
        silently forwarding the request to full body parsing.
        """
        lengths = []
        malformed = False
        for name, value in scope.get("headers", []):
            if name.lower() != b"content-length":
                continue
            try:
                lengths.append(int(value.decode("latin-1").strip()))
            except (ValueError, UnicodeDecodeError):
                malformed = True
        return (max(lengths) if lengths else None), malformed

    async def _send_413(self, send, path=None, content_length=None, request_id=None):
        # #1757 — oversized-body rejections were silent; surface them as a
        # WARNING (PII-scrubbed) before the 413 goes out. `content_length` is
        # the observed Content-Length header value, or "chunked" for streamed
        # bodies of unknown length.
        log.warning(
            "413 too large: path=%s content_length=%s request_id=%s",
            path, content_length, request_id,
        )
        body = b'{"detail":"Request body too large"}'
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def _send_400(self, send, path=None, request_id=None):
        # #1633 — a non-numeric Content-Length is malformed HTTP, not a body we
        # can size-check; reject it before any framework work. Log the rejection
        # once (like the 413 path, #1757) so malformed-header floods are
        # debuggable.
        log.warning(
            "400 malformed content-length: path=%s request_id=%s",
            path, request_id,
        )
        body = b'{"detail":"Invalid Content-Length header"}'
        await send(
            {
                "type": "http.response.start",
                "status": 400,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


# #1749 — request correlation ids. Header values are attacker-controlled, so we
# only ever echo back a sanitized fragment: printable ASCII excluding the
# control/whitespace range that could smuggle CR/LF header injection, capped at
# 64 chars. Anything else falls back to a minted uuid4 hex id.
_REQUEST_ID_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")
_REQUEST_ID_MAX_LEN = 64


def _sanitize_request_id(value: str | None) -> str | None:
    """Return a header-safe X-Request-ID fragment, or None if unusable."""
    if not value:
        return None
    cleaned = _REQUEST_ID_SAFE_RE.sub("", value.strip())[:_REQUEST_ID_MAX_LEN]
    return cleaned or None


def _first_header(scope, target: bytes) -> str | None:
    for name, value in scope.get("headers", []):
        if name.lower() == target:
            return value.decode("latin-1")
    return None


class RequestIDMiddleware:
    """Outermost ASGI middleware: mint/propagate a per-request X-Request-ID.

    Reads an incoming X-Request-ID header (sanitized to a safe charset, max
    64 chars), or mints ``uuid4().hex`` when absent; stores it in
    ``request_id_ctx`` for the lifetime of the request so the structured
    WARNING+ log can carry it on every record; and echoes the id back as an
    ``X-Request-ID`` response header — including on error paths, because the
    header is attached to the response before the downstream app dispatches.
    Non-HTTP scopes (lifespan, websockets) pass through untouched.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _sanitize_request_id(_first_header(scope, b"x-request-id"))
        if request_id is None:
            request_id = uuid.uuid4().hex

        token = request_id_ctx.set(request_id)

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                message = {
                    **message,
                    "headers": [
                        (name, value)
                        for name, value in message.get("headers", [])
                        if name.lower() != b"x-request-id"
                    ]
                    + [(b"x-request-id", request_id.encode("ascii"))],
                }
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            # Keep request_id_ctx set on the unhandled-exception path: FastAPI
            # routes an app.exception_handler(Exception) to Starlette's
            # ServerErrorMiddleware, which runs AFTER this middleware has already
            # unwound. If we reset here the 500 handler + structured formatter
            # would see "-" instead of the request id. The request is dying, so
            # the token is discarded when the task ends.
            raise
        else:
            request_id_ctx.reset(token)


# ═════════════════════════════════════════════════════════════════════════
# #1672 — CSRF defense-in-depth for state-changing /auth/ endpoints.
# The rotating refresh cookie is SameSite=strict (#1773) — the PRIMARY defense.
# This Origin check is the SECOND layer: when a browser sends an Origin header
# that is neither same-origin nor a configured CORS origin, the request is
# rejected with 403 BEFORE any auth state is touched. A request with NO Origin
# header (curl, native apps, most non-browser clients) passes through — only a
# PRESENT, mismatched Origin is rejected — so the LAN/dev CORS allow-list and
# localhost setups stay non-breaking.
# ═════════════════════════════════════════════════════════════════════════
_AUTH_STATE_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_AUTH_PATH_PREFIX = "/api/v1/auth"


def _host_origin(scope) -> str | None:
    """Reconstruct the request's own origin (``scheme://host[:port]``).

    Behind nginx the outer scheme is https via ``X-Forwarded-Proto`` even though
    the socket connection uvicorn sees is plain http; mirror ``_is_https_request``
    in security.py so a same-origin HTTPS page is not falsely rejected.
    """
    host = _first_header(scope, b"host")
    if not host:
        return None
    scheme = scope.get("scheme") or "http"
    proxy_proto = _first_header(scope, b"x-forwarded-proto")
    if proxy_proto:
        scheme = proxy_proto.split(",", 1)[0].strip().lower()
    return f"{scheme.rstrip(':')}://{host}".lower()


def _origin_ok(scope) -> bool:
    """True when the request should be allowed on Origin grounds.

    Absent Origin → allowed (browser CSRF always sends one; curl/native don't).
    Present Origin → must equal the request's own origin (same-origin) OR be a
    configured CORS origin (the LAN/dev allow-list). Any other present Origin is
    a cross-site request and is rejected.
    """
    origin = _first_header(scope, b"origin")
    if not origin:
        return True
    origin = origin.strip().rstrip("/").lower()
    if origin == "null":
        return False
    own = _host_origin(scope)
    if own and origin == own:
        return True
    return origin in {o.strip().rstrip("/").lower() for o in settings.origins}


class SameOriginAuthMiddleware:
    """#1672 — reject state-changing /api/v1/auth requests whose Origin header
    is neither same-origin nor a configured CORS origin.

    A pure middleware (not a per-route dependency) so every current and future
    state-changing auth route is covered by construction. GET/read endpoints are
    intentionally NOT checked (no state change → no CSRF risk — status/me/share
    reads stay unaffected), and OPTIONS preflights pass through to the CORS
    middleware unchanged. The rejection is a bare 403 JSON (no CORS headers: the
    request came from an origin we do not trust, so the cross-origin caller
    should not be able to read the response).
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (
            scope["type"] == "http"
            and scope.get("method") in _AUTH_STATE_MUTATING_METHODS
            and (scope.get("path") or "").startswith(_AUTH_PATH_PREFIX)
            and not _origin_ok(scope)
        ):
            body = b'{"detail":"Cross-origin request rejected"}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 403,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode("ascii")),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return
        await self.app(scope, receive, send)


async def _embed_loop():
    """📚 KOTHA background embed job (#329) — runs on schedule, never crashes.
    If the model/pgvector is missing it reports `skipped` and waits for the
    next tick; once the stack is present it quietly catches up on new stories."""
    interval = settings.kotha_embed_interval_minutes * 60
    # #944 — track consecutive skipped ticks so a deployment that forgot
    # `pip install numberverse-api[embeddings]` or lacks the pgvector extension
    # surfaces a clear signal instead of silence. #1758 — ANY consecutive
    # skipped tick counts, regardless of whether the reason alternates (two
    # alternating reasons previously pinned the count at 1 and the >=3 WARNING
    # never fired).
    _skip_reason: str | None = None
    _skip_count: int = 0
    # #950 — run the prune job once per hour (every N ticks at 15-min interval)
    _tick_count = 0
    _prune_every = max(1, 3600 // interval)  # ≈1 hour
    while True:
        # #1748 — heartbeat BEFORE the tick's work: a pass that then hangs in
        # embed_stories or the prune still leaves a stale heartbeat that /health
        # can see (the timestamp is refreshed on the NEXT pass if the loop
        # recovers). If the loop never reaches here again, /health degrades.
        global _embed_heartbeat
        _embed_heartbeat = time.monotonic()
        try:
            async with SessionLocal() as db:
                result = await embed_stories(db)
            status = result.get("status")
            if status == "ok":
                if result.get("embedded", 0) > 0:
                    log.info("Kotha embed tick: embedded %s", result["embedded"])
                _skip_reason = None
                _skip_count = 0
            elif status == "skipped":
                # #1758 — count ANY consecutive skipped tick; the reason is
                # carried for the WARNING message but does not reset the count.
                reason = result.get("reason", "unknown")
                _skip_reason = reason
                _skip_count += 1
                if _skip_count >= 3:
                    log.warning(
                        "Kotha embed tick skipped %d consecutive times: %s",
                        _skip_count, reason,
                    )
            else:
                _skip_reason = None
                _skip_count = 0

            # #950 — scheduled prune every ~1 hour so the story volume never
            # silently exceeds the configured cap (the admin-only manual prune
            # is insufficient for unattended operation). #983 + #984 ride the
            # same tick so progress_events stay bounded and revoked-session
            # PII (ip + user_agent) is purged without a human remembering to.
            _tick_count += 1
            if _tick_count >= _prune_every:
                _tick_count = 0
                try:
                    async with SessionLocal() as db:
                        from .ratelimit import prune_rate_limit_buckets
                        from .routers.admin import (
                            _prune_progress_events,
                            _prune_stories,
                            _purge_revoked_sessions,
                        )

                        stories = await _prune_stories(db)
                        progress = await _prune_progress_events(db)
                        sessions = await _purge_revoked_sessions(db)
                        # #1767 — rate_limit_buckets is otherwise append-only:
                        # every XFF-rotating IP / login-email probing key leaves
                        # a row forever. Same hourly tick keeps the table bounded.
                        buckets = await prune_rate_limit_buckets(db)
                    if stories:
                        log.info("Kotha scheduled prune: removed %d stories", stories)
                    if progress:
                        log.info("Progress-event scheduled prune: removed %d rows", progress)
                    if sessions:
                        log.info("Revoked-session scheduled purge: removed %d rows", sessions)
                    if buckets:
                        log.info("Rate-limit bucket prune: removed %d stale rows", buckets)
                except Exception as exc:  # noqa: BLE001
                    log.warning("Scheduled prune/purge failed: %s", exc)
        except Exception as exc:  # noqa: BLE001 — a scheduler must never die
            log.warning("Kotha embed tick failed: %s", exc)
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Creating tables…")
    await create_tables()
    log.info("Seeding…")
    await seed()
    log.info("API ready ✅")
    global _embed_task, _embed_heartbeat
    _embed_task = asyncio.create_task(_embed_loop())
    # #1748 — the task may not have taken its first pass yet; /health treats
    # "task started, heartbeat still zero" as starting (degraded if it never
    # produces a heartbeat within the tolerance window).
    _embed_heartbeat = time.monotonic()
    try:
        yield
    finally:
        _embed_task.cancel()
        try:
            await _embed_task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass


app = FastAPI(
    title="Numberverse API",
    version="0.1.0",
    description="Kids math playground backend — JWT auth, kids, progress, content, admin",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # DEV: bearer-token auth (no cookies) → permissive CORS so any LAN device
    # (phone/tablet on the same Wi-Fi) can reach the API on this machine.
    # Tighten to an explicit origin allow-list for production.
    allow_origins=settings.origins if settings.origins != ["*"] else ["*"],
    # #1773 — allow_credentials must be False when allow_origins is "*"
    # (browsers reject credentials+wildcard). When origins are explicit — the
    # dev default and prod — credentials ARE allowed so the LAN portal (:3000
    # → :8000) can send/receive the httpOnly refresh cookie cross-origin.
    allow_credentials=("*" not in settings.origins),
    # #1673 — the routers expose exactly GET/POST/PUT/PATCH/DELETE (+ OPTIONS
    # for browser preflight); tighten from the old wildcard "*". The frontend
    # fetch calls send exactly Content-Type + Authorization (+ the API's own
    # X-Request-ID correlation header and the optional X-Org-ID tenant header).
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID", "X-Org-ID"],
    expose_headers=["Content-Range", "X-Total-Count", "X-Request-ID"],
)

# Middleware stack — FastAPI inserts each add_middleware at the HEAD of its
# list, so the runtime stack (outermost → innermost) is the reverse of the
# declaration order below:
#
#   RequestID → RequestBodySizeLimit → AccessLog → SameOrigin → CORS → app
#
# RequestID stays OUTERMOST (#1749, added LAST) so request_id_ctx is set for
# every layer beneath it — including RequestBodySizeLimit's 413 rejection
# (#1757), the access log (#1754), and SameOriginAuthMiddleware's 403
# rejection (#1672). RequestBodySizeLimit rejects oversized bodies before any
# CORS/framework work. SameOriginAuthMiddleware (#1672) sits between AccessLog
# (so its 403 rejections are access-logged and carry request_id) and CORS (so a
# cross-origin auth POST is rejected with a CORS-free 403 before CORS context
# is added). AccessLog is INSIDE RequestID (so request_id is already set when
# it emits) and inside RequestBodySizeLimit (so it only sees requests that
# passed the body-size guard).

# #1672 — CSRF defense-in-depth origin check for state-changing /auth/ routes.
# Declared AFTER CORS (runtime: AccessLog → SameOrigin → CORS) so same-origin /
# configured-origin requests still flow through CORS unchanged. FastAPI's
# reverse-order wrap puts the LAST-declared user middleware outermost; see above.
app.add_middleware(SameOriginAuthMiddleware)

# #1754 — access timing log. Declared FIRST so it lands INNERMOST of the user
# middleware: inside RequestID (request_id_ctx already set) and inside the
# body-size guard.
app.add_middleware(AccessLogMiddleware)

# Must be outermost so oversized bodies are rejected before CORS/framework work.
app.add_middleware(RequestBodySizeLimitMiddleware)

# #1749 — outermost layer (added LAST): mints/propagates X-Request-ID so every
# structured WARNING+/ERROR record and every response carries a correlation id.
app.add_middleware(RequestIDMiddleware)

app.include_router(auth.router)
app.include_router(kids.router)
app.include_router(progress.router)
app.include_router(content.router)
app.include_router(export.router)
app.include_router(shares.router)
app.include_router(admin.router)


# #1750 — structured 5xx logging. Unhandled exceptions and 5xx HTTPExceptions
# now land as ERROR records in data/error.log (method/path/status/request_id,
# PII-scrubbed) instead of falling through Starlette's ServerErrorMiddleware
# with no method/path/request_id. The handlers still return the client-visible
# JSON payload unchanged (500 additionally carries `request_id` in the body —
# #1626) — the log record is the point. 4xx stays quiet (except the 401/429
# WARNINGs added by the rate-limit wave), and RequestValidationError (422) has
# its own handler below (#1626) that keeps FastAPI's detail array intact.
@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code >= 500:
        log.error(
            "HTTPException %s %s → %d (request_id=%s)",
            request.method, request.url.path, exc.status_code, request_id_ctx.get(),
        )
    # The RequestIDMiddleware re-stamps X-Request-ID on every response that flows
    # through it, so threading it here too is harmless for handled HTTPExceptions
    # and covers the case where the response bypasses the middleware's send wrap.
    headers = dict(getattr(exc, "headers", None) or {})
    headers.setdefault("X-Request-ID", request_id_ctx.get())
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    # #1626 — 422 bodies now carry the same correlation id the header does, but
    # the client-visible `detail` ARRAY is preserved exactly (many clients parse
    # `detail[0].loc` / `detail[0].msg` — do NOT flatten it). No ERROR record:
    # 422 stays quiet (#1750).
    return JSONResponse(
        status_code=422,
        content={
            "detail": jsonable_encoder(exc.errors()),
            "request_id": request_id_ctx.get(),
        },
    )


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    log.error(
        "Unhandled exception %s %s → 500 (request_id=%s)",
        request.method, request.url.path, request_id_ctx.get(),
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    # Starlette's ServerErrorMiddleware sends this response directly to the
    # transport, bypassing RequestIDMiddleware's send wrapper — so the correlation
    # id must be threaded explicitly here for 500 responses.
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error",
            # #1626 — the correlation id lives in the body too, so clients that
            # read the JSON body (not just the header) can correlate the 500.
            "request_id": request_id_ctx.get(),
        },
        headers={"X-Request-ID": request_id_ctx.get()},
    )


@app.get("/health")
async def health():
    """#1748 — real liveness probe, not a static "ok".

    Reports the API as healthy only when BOTH the database answers a `SELECT 1`
    within the probe timeout AND the background embed/prune loop is heartbeating
    (running + last pass within the tolerance window). Any failure → HTTP 503
    with the failing check named, so the uptime monitor / deploy smoke (which
    grep the body for `"status":"ok"`) correctly flag a dead API instead of
    trusting nginx's 200 shell.
    """
    checks: dict[str, str] = {}
    overall = "ok"

    # ── DB probe: SELECT 1 with a hard timeout ─────────────────────────────
    try:
        async with asyncio.timeout(_HEALTH_DB_PROBE_TIMEOUT_SECONDS):
            async with SessionLocal() as db:
                await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:  # noqa: BLE001 — health must never raise, only degrade
        checks["database"] = "unreachable"
        overall = "degraded"

    # ── background embed/prune loop liveness ───────────────────────────────
    task = _embed_task
    if task is None:
        checks["background_jobs"] = "not-started"
        overall = "degraded"
    elif task.done():
        checks["background_jobs"] = "stopped"
        overall = "degraded"
    else:
        interval = settings.kotha_embed_interval_minutes * 60
        tolerance = max(
            30.0,
            interval * _EMBED_HEARTBEAT_TOLERANCE_MULTIPLIER,
        )
        age = time.monotonic() - _embed_heartbeat
        if _embed_heartbeat <= 0 or age > tolerance:
            checks["background_jobs"] = "stalled"
            overall = "degraded"
        else:
            checks["background_jobs"] = "ok"

    payload = {
        "status": overall,
        "service": "numberverse-api",
        "checks": checks,
    }
    if overall == "ok":
        return payload
    return JSONResponse(status_code=503, content=payload)

