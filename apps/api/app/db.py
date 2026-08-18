import logging
import time
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings
from .metrics import observe_checkout_wait

log = logging.getLogger("numberverse")


class Base(DeclarativeBase):
    pass


# #1759 — explicit pool sizing from settings (pool_size/max_overflow/pool_timeout).
# The old default (pool_size=5 + overflow=10) is a single-app-worker assumption;
# these knobs let a deployment size the pool to its worker count and query mix
# without editing code. `pool_pre_ping` stays on so a dead Postgres fails fast
# on checkout instead of surfacing as a mid-request connection error.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout,
)


class _TelemetrySession(AsyncSession):
    """#1759 — wrap connection checkout so a saturating pool is observable.

    Every connection acquisition is timed; a wait longer than
    `db_checkout_warn_seconds` logs a WARNING (scrubbed by the app's log
    filters) and every wait feeds the `db_checkout_wait_seconds` histogram so
    /metrics shows the pool's pressure over time. Pure pass-through — it never
    changes what the session returns or when it connects.
    """

    async def connection(self, *args, **kwargs):
        t0 = time.monotonic()
        try:
            return await super().connection(*args, **kwargs)
        finally:
            wait = time.monotonic() - t0
            observe_checkout_wait(wait)
            if wait > settings.db_checkout_warn_seconds:
                log.warning(
                    "DB pool checkout waited %.3fs (threshold %.1fs)",
                    wait,
                    settings.db_checkout_warn_seconds,
                )


SessionLocal = async_sessionmaker(
    engine,
    class_=_TelemetrySession,
    expire_on_commit=False,
)


def db_pool_status() -> dict:
    """#1759 — live pool utilization for /health and /metrics.

    `checkedout()` is the number of connections currently in use; `overflow()`
    is the current overflow count (negative = unused overflow capacity, per
    SQLAlchemy's QueuePool semantics). Both are read from the sync pool backing
    the async engine — cheap, no I/O.
    """
    pool = engine.sync_engine.pool
    return {
        "checked_out": int(pool.checkedout()),
        "overflow": int(pool.overflow()),
        "pool_size": int(settings.db_pool_size),
        "max_overflow": int(settings.db_max_overflow),
    }


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
