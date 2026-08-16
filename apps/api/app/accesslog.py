"""Structured access log (#1754) — one JSON INFO line per HTTP request.

``AccessLogMiddleware`` times every HTTP request (method, path, status,
latency_ms, request_id) and emits a single ``numberverse.access`` INFO record.
``install_access()`` routes those records to ``data/access.log`` as one JSON
object per line — the same ``_JsonFormatter`` shape and ``ScrubFilter`` as
error.log, but its own rotating file so it never fights error.log's rotation.

The middleware must sit INSIDE ``RequestIDMiddleware`` so ``request_id_ctx`` is
already set when the access record is emitted. Non-http scopes (lifespan,
websockets) pass through untouched. Exceptions that never produced a
``http.response.start`` are left to the 5xx handler — no access line is emitted
for those (status would be a meaningless 0), but a partial exchange that had
already started a response IS logged.
"""
from __future__ import annotations

import logging
import logging.handlers
import os
import time

from .errorlog import _JsonFormatter, request_id_ctx
from .scrub import ScrubFilter

LOG_PATH = "data/access.log"
_MAX_BYTES = 1024 * 1024
_BACKUP_COUNT = 3

_access_logger = logging.getLogger("numberverse.access")
# #1754 — access records go ONLY to the access JSON sink (data/access.log),
# never up to the parent/root handlers (error.log, console). This keeps the
# access stream separate from the WARNING+ error stream and stops access INFO
# records from polluting captures on the ``numberverse`` logger.
_access_logger.propagate = False

_ATTACHED = False


class AccessLogMiddleware:
    """ASGI middleware emitting one ``numberverse.access`` INFO record per HTTP request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        state = {"status": 0}

        async def send_with_status(message):
            if message["type"] == "http.response.start":
                state["status"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_with_status)
        except Exception:
            # Let the 5xx handler own exceptions that never started a response
            # (status stays 0 → no access line here). If a response HAD already
            # started, log the partial exchange with its captured status.
            if state["status"]:
                self._emit(scope, state["status"], start)
            raise
        else:
            self._emit(scope, state["status"], start)

    @staticmethod
    def _emit(scope, status, start) -> None:
        latency_ms = (time.perf_counter() - start) * 1000
        _access_logger.info(
            "access method=%s path=%s status=%d latency_ms=%.1f request_id=%s",
            scope.get("method", "-"),
            (scope.get("path") or "-")[:500],
            status,
            latency_ms,
            request_id_ctx.get(),
        )


def install_access(max_bytes: int | None = None, backup_count: int | None = None) -> None:
    """Attach the rotating, PII-redacted JSON handler to ``numberverse.access``.

    Idempotent like ``errorlog.install()`` — safe to call any number of times
    (uvicorn reload, tests) and a broken file path never crashes the app (it
    falls back to a loud stderr warning and continues). Attaches ONLY to the
    ``numberverse.access`` logger (never the root), so it never fights
    error.log's rotation.
    """
    global _ATTACHED
    if _ATTACHED:
        return
    logger = logging.getLogger("numberverse.access")
    for h in logger.handlers:
        if isinstance(h, logging.handlers.RotatingFileHandler):
            _ATTACHED = True
            return
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        fh = logging.handlers.RotatingFileHandler(
            LOG_PATH,
            maxBytes=max_bytes or _MAX_BYTES,
            backupCount=backup_count if backup_count is not None else _BACKUP_COUNT,
            encoding="utf-8",
        )
    except OSError as exc:
        logging.getLogger("numberverse").warning("access log unavailable (%s): %s", LOG_PATH, exc)
        _ATTACHED = True  # don't retry every import
        return
    fh.setLevel(logging.INFO)
    fh.setFormatter(_JsonFormatter())
    fh.addFilter(ScrubFilter())
    logger.addHandler(fh)
    logger.setLevel(logging.INFO)
    _ATTACHED = True
    logging.getLogger("numberverse").info("structured access log → %s (rotates at %d×%d)",
                                          LOG_PATH, _MAX_BYTES, _BACKUP_COUNT)
