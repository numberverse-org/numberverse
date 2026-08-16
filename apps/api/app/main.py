import asyncio
import logging
import re
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import SessionLocal
from .embeddings import embed_stories
from .errorlog import install as install_errorlog, request_id_ctx
from .routers import admin, auth, content, export, kids, progress, shares
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
log = logging.getLogger("numberverse")

# #836 — abuse guard: FastAPI/Starlette impose no global request-body cap, so a
# client can POST an arbitrarily large JSON document and force Pydantic to
# deserialize the whole thing (memory/CPU exhaustion). 1 MiB is far beyond any
# real Numberverse payload (auth, progress, content metadata, etc.).
MAX_REQUEST_BODY_BYTES = 1 * 1024 * 1024


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

        content_length = self._content_length(scope)
        if content_length is not None and content_length > self.max_body_bytes:
            await self._send_413(send)
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
                        await self._send_413(send)
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
        lengths = []
        for name, value in scope.get("headers", []):
            if name.lower() != b"content-length":
                continue
            try:
                lengths.append(int(value.decode("latin-1").strip()))
            except (ValueError, UnicodeDecodeError):
                continue
        return max(lengths) if lengths else None

    async def _send_413(self, send):
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


async def _embed_loop():
    """📚 KOTHA background embed job (#329) — runs on schedule, never crashes.
    If the model/pgvector is missing it reports `skipped` and waits for the
    next tick; once the stack is present it quietly catches up on new stories."""
    interval = settings.kotha_embed_interval_minutes * 60
    # #944 — track consecutive skipped ticks with the same reason so a
    # deployment that forgot `pip install numberverse-api[embeddings]` or
    # lacks the pgvector extension surfaces a clear signal instead of silence.
    _skip_reason: str | None = None
    _skip_count: int = 0
    # #950 — run the prune job once per hour (every N ticks at 15-min interval)
    _tick_count = 0
    _prune_every = max(1, 3600 // interval)  # ≈1 hour
    while True:
        try:
            async with SessionLocal() as db:
                result = await embed_stories(db)
            status = result.get("status")
            if status == "ok" and result.get("embedded", 0) > 0:
                log.info("Kotha embed tick: embedded %s", result["embedded"])
                _skip_reason = None
                _skip_count = 0
            elif status == "skipped":
                reason = result.get("reason", "unknown")
                if reason == _skip_reason:
                    _skip_count += 1
                else:
                    _skip_reason = reason
                    _skip_count = 1
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
                        from .routers.admin import (
                            _prune_progress_events,
                            _prune_stories,
                            _purge_revoked_sessions,
                        )

                        stories = await _prune_stories(db)
                        progress = await _prune_progress_events(db)
                        sessions = await _purge_revoked_sessions(db)
                    if stories:
                        log.info("Kotha scheduled prune: removed %d stories", stories)
                    if progress:
                        log.info("Progress-event scheduled prune: removed %d rows", progress)
                    if sessions:
                        log.info("Revoked-session scheduled purge: removed %d rows", sessions)
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
    embed_task = asyncio.create_task(_embed_loop())
    try:
        yield
    finally:
        embed_task.cancel()
        try:
            await embed_task
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
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "X-Total-Count"],
)

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
# JSON payload unchanged — the log record is the point. 4xx stays quiet
# (except the 401/429 WARNINGs added by the rate-limit wave), and
# RequestValidationError (422) keeps FastAPI's specific handler because it is
# more specific than Exception.
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
        content={"detail": "Internal Server Error"},
        headers={"X-Request-ID": request_id_ctx.get()},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "numberverse-api"}
