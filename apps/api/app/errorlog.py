"""Structured error log (#124) — local WARNING+ JSON-lines file, zero analytics.

Every warning/error from any ``numberverse.*`` logger is appended to
``data/error.log`` as one JSON object per line, with size-based rotation
(1 MB × 3 backups). Debug/info never lands on disk. The box stays in control
of its own log file — nothing leaves the machine.

Record schema (one JSON object per line):
``ts`` (UTC, ``+00:00`` offset — #1752), ``level``, ``logger``, ``msg``,
``request_id``, ``module``, ``funcName``, ``lineno``, then any non-standard
``extra={...}`` keys sorted by name (#1753), then ``exc`` (redacted) last.

Privacy (#124 checklist): every field passes through the same scrubber as #266
(including ``extra={...}`` string values), and the formatter re-redacts the
*rendered* traceback (``Formatter.format`` computes ``exc_text`` from
``exc_info`` AFTER filters run, so a filter alone would let PII-shaped
traceback lines through). Verify with tests/test_errorlog.py.
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


# Standard LogRecord attributes — anything else in record.__dict__ is treated
# as caller-supplied structured context (extra={...}) and merged into the JSON
# (#1753). request_id is handled separately (from request_id_ctx), so it is
# excluded even though the RequestIDMiddleware stores it on the record too.
_STANDARD_RECORD_KEYS = frozenset({
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_text", "exc_info", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "taskName", "message", "asctime", "request_id",
})


class _JsonFormatter(logging.Formatter):
    """One JSON object per line: ts(UTC), level, logger, msg, request_id,
    module, funcName, lineno, sorted extra context (PII-redacted), exc last."""

    def format(self, record: logging.LogRecord) -> str:
        # Calling the base formatter renders exc_text from exc_info — do it
        # BEFORE we build JSON so we can redact the rendered traceback.
        super().format(record)
        payload = {
            # #1752 — UTC only: astimezone() would shift the host's local offset,
            # while every DB path and the rest of the stack already uses UTC.
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact_text(record.getMessage()),
            "request_id": request_id_ctx.get(),
            "module": record.module,
            "funcName": record.funcName,
            "lineno": record.lineno,
        }
        # #1753 — non-standard extra keys (extra={...}) ride along verbatim,
        # sorted for deterministic output, and every string passes the same
        # scrubber that governs msg/exc. Non-strings are kept as-is.
        for key in sorted(record.__dict__.keys() - _STANDARD_RECORD_KEYS):
            value = record.__dict__[key]
            payload[key] = redact_text(value) if isinstance(value, str) else value
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
