import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import admin, auth, content, kids, progress
from .seed import create_tables, seed

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("numberverse")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Creating tables…")
    await create_tables()
    log.info("Seeding…")
    await seed()
    log.info("API ready ✅")
    yield


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
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "numberverse-api"}
