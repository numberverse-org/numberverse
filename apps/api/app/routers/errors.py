"""Client error reporting (#1756).

The kid app's reporter POSTs scrubbed client-side errors here. The endpoint
re-scrubs everything with the same PII scrubber every other exit path uses
(#266), rate-limits per IP, and lands a single record in the local error log.
Nothing is persisted and no analytics leave the box — this is local
observability for a device whose own log we can't see.

It is deliberately DB-free: rate limiting is a small in-process fixed-window
per-IP budget, NOT the durable Postgres limiter, because a dead DB is exactly
when clients have errors to report — the reporter must still land its error.
(An in-process throttle is fine here because this is a best-effort diagnostics
sink, not a security boundary.)
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator

from ..ratelimit import _request_ip
from ..scrub import clamp_context_strings, context_depth, redact_context, redact_text

router = APIRouter(prefix="/api/v1/errors", tags=["errors"])

log = logging.getLogger("numberverse")

# ── In-process fixed-window per-IP budget ────────────────────────────────────
_WINDOW_SECONDS = 60
_MAX_PER_MIN = 30
_buckets: dict[str, tuple[int, int]] = {}  # ip -> (window_id, count)


def _allow(ip: str) -> bool:
    now = int(time.monotonic() // _WINDOW_SECONDS)
    window_id, count = _buckets.get(ip, (now, 0))
    if window_id != now:
        window_id, count = now, 0
    if count >= _MAX_PER_MIN:
        return False
    _buckets[ip] = (window_id, count + 1)
    # Keep the map bounded — a changing set of IPs must not grow it forever.
    if len(_buckets) > 4096:
        for stale in [k for k, (w, _) in _buckets.items() if w != now]:
            _buckets.pop(stale, None)
    return True


# ── Payload ────────────────────────────────────────────────────────────────
_MAX_VERSION = 32
_MAX_LABEL = 64
_MAX_MESSAGE = 2048
_MAX_REQUEST_ID = 64
_MAX_LANGUAGE = 8
_CONTEXT_MAX_STRING = 1024
_CONTEXT_MAX_BYTES = 8192


class ClientErrorIn(BaseModel):
    """Scrubbed client error report.

    The client pre-redacts PII before sending; the endpoint re-scrubs anyway
    (defense in depth — the scrubber is the one source of truth for every exit
    path).
    """
    kind: str = Field(default="boundary", max_length=16)
    version: str | None = Field(default=None, max_length=_MAX_VERSION)
    label: str = Field(default="unknown", max_length=_MAX_LABEL)
    message: str = Field(default="", max_length=_MAX_MESSAGE)
    context: dict[str, Any] = Field(default_factory=dict)
    request_id: str | None = Field(default=None, max_length=_MAX_REQUEST_ID)
    status: int | None = Field(default=None, ge=100, le=599)
    language: str | None = Field(default=None, max_length=_MAX_LANGUAGE)

    @field_validator("context")
    @classmethod
    def _context_byte_budget(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Bound the envelope: clamp string leaves and cap the serialized size
        so a huge/deep payload can't become a storage + CPU abuse surface."""
        if not v:
            return v
        clamped = clamp_context_strings(v, _CONTEXT_MAX_STRING)
        size = len(json.dumps(clamped, separators=(",", ":"), default=str))
        if size > _CONTEXT_MAX_BYTES:
            raise ValueError(f"context too large (max {_CONTEXT_MAX_BYTES} bytes)")
        return clamped

    @field_validator("context")
    @classmethod
    def _context_no_deep_nesting(cls, v: dict[str, Any]) -> dict[str, Any]:
        if not v:
            return v
        if context_depth(v) > 10:
            raise ValueError("context nesting too deep (max 10 levels)")
        return v


@router.post("", status_code=202)
async def report_client_error(payload: ClientErrorIn, request: Request) -> dict:
    """Accept a scrubbed client error report and land it in the local error log.

    The caller (currently just the reporter's own throttle) has already bounded
    volume; this per-IP budget is the last-resort abuse guard on a public,
    no-auth surface. Returns 202 Accepted — the report is fire-and-forget.
    """
    ip = _request_ip(request)
    if not _allow(ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many error reports")

    # Re-scrub everything (client pre-scrub is best-effort; this is the gate).
    message = redact_text(payload.message)[:_MAX_MESSAGE]
    label = redact_text(payload.label)[:_MAX_LABEL]
    version = redact_text(payload.version or "")[:_MAX_VERSION] or None
    request_id = redact_text(payload.request_id or "")[:_MAX_REQUEST_ID] or None
    language = redact_text(payload.language or "")[:_MAX_LANGUAGE] or None
    context = redact_context(payload.context) or {}

    log.warning(
        "client error kind=%s label=%s version=%s status=%s request_id=%s "
        "language=%s message=%s context=%s",
        payload.kind, label, version, payload.status, request_id, language,
        message, json.dumps(context, separators=(",", ":"), default=str),
    )
    return {"status": "accepted"}