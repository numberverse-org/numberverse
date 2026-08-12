import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import SessionLocal
from .embeddings import embed_stories
from .errorlog import install as install_errorlog
from .routers import admin, auth, content, export, kids, progress
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

app.include_router(auth.router)
app.include_router(kids.router)
app.include_router(progress.router)
app.include_router(content.router)
app.include_router(export.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "numberverse-api"}
