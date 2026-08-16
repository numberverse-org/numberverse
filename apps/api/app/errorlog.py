"""Structured error log (#124) — local WARNING+ JSON-lines file, zero analytics.

Every warning/error from any ``numberverse.*`` logger is appended to
``data/error.log`` as one JSON object per line, with size-based rotation
(1 MB × 3 backups). Debug/info never lands on disk. The box stays in control
of its own log file — nothing leaves the machine.

Privacy (#124 checklist): every field passes through the same scrubber as #266,
and the formatter re-redacts the *rendered* traceback (``Formatter.format``
computes ``exc_text`` from ``exc_info`` AFTER filters run, so a filter alone
would let PII-shaped traceback lines through). Verify with tests/test_errorlog.py.
"""
from __future__ import annotations

import json
import logging
import logging.handlers
import os
from contextvars import ContextVar
from datetime import datetime, timezone

from .scrub import ScrubFilter, redact_text

LOG_PATH = "data/error.log"
_MAX_BYTES = 1024 * 1024  # 1 MB
_BACKUP_COUNT = 3

# #1749 — per-request correlation id. RequestIDMiddleware (app/main.py) sets this
# for the lifetime of an HTTP request so every WARNING+/ERROR record written by
# the structured formatter below can be grepped out of data/error.log as one
# request. Defaults to "-" for logs that happen outside any request (startup,
# the background embed/prune loop, tests).
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class _JsonFormatter(logging.Formatter):
    """One JSON object per line: ts, level, logger, msg, request_id, exc (redacted)."""

    def format(self, record: logging.LogRecord) -> str:
        # Calling the base formatter renders exc_text from exc_info — do it
        # BEFORE we build JSON so we can redact the rendered traceback.
        super().format(record)
        payload = {
            "ts": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }
        exc = getattr(record, "exc_text", None)
        if exc:
            payload["exc"] = redact_text(exc)
        return json.dumps(payload, ensure_ascii=False)


_handler: logging.Handler | None = None
_ATTACHED = False


def install(max_bytes: int | None = None, backup_count: int | None = None) -> None:
    """Attach the rotating, PII-redacted file handler to the root logger once.

    Safe to call any number of times (uvicorn reload, tests) — the handler is
    attached at most once and a broken file path never crashes the app (it
    falls back to a loud stderr warning and continues).
    """
    global _ATTACHED, _handler
    if _ATTACHED:
        return
    root = logging.getLogger()
    for h in root.handlers:
        if isinstance(h, logging.handlers.RotatingFileHandler):
            _ATTACHED = True
            _handler = h
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
        logging.getLogger("numberverse").warning("error log unavailable (%s): %s", LOG_PATH, exc)
        _ATTACHED = True  # don't retry every import
        return
    fh.setLevel(logging.WARNING)
    fh.setFormatter(_JsonFormatter())
    # #124 privacy — same scrubber governs the file as governs the console.
    fh.addFilter(ScrubFilter())
    root.addHandler(fh)
    _handler = fh
    _ATTACHED = True
    logging.getLogger("numberverse").info("structured error log → %s (rotates at %d×%d)",
                                          LOG_PATH, _MAX_BYTES, _BACKUP_COUNT)
