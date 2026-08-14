import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import SessionLocal
from .embeddings import embed_stories
from .errorlog import install as install_errorlog
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


async def _embed_loop():
    """📚 KOTHA background embed job (#329) — runs on schedule, never crashes.
    If the model/pgvector is missing it reports `skipped` and waits for the
    next tick; once the stack is present it quietly catches up on new stories."""
    interval = settings.kotha_embed_interval_minutes * 60
    while True:
        try:
            async with SessionLocal() as db:
                result = await embed_stories(db)
            if result.get("status") == "ok" and result.get("embedded", 0) > 0:
                log.info("Kotha embed tick: embedded %s", result["embedded"])
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

app.include_router(auth.router)
app.include_router(kids.router)
app.include_router(progress.router)
app.include_router(content.router)
app.include_router(export.router)
app.include_router(shares.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "numberverse-api"}
