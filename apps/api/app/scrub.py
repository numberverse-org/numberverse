"""Privacy scrubber (#266 + #270).

Redacts PII-shaped data (emails, phone numbers, IPs, device ids, long digits)
wherever it could leak: log records (#266) and Kotha story context envelopes
(#270). One module so the same rules govern every exit path.

Usage:
    from .scrub import redact_text, redact_context, ScrubFilter

    # logs — install once in main.py on every logger's handler
    logging.getLogger("numberverse").addFilter(ScrubFilter())

    # story context — before storage
    context = redact_context(story.context)
"""
from __future__ import annotations

import logging
import re
from typing import Any

# ── PII patterns (defensive: match BEFORE storage, not after) ────────────────
_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# IPv4; IPv6 with :: compression needs a hex/colon run with ≥2 colons
_IPV4 = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_IPV6 = re.compile(r"\b(?=[0-9a-fA-F:]*:[0-9a-fA-F:]*:)[0-9a-fA-F:]{2,}\b")
# BD phone numbers (mobile + landline), also a 16-19 digit card-like run.
# BD numbers are `0`/`+880` + a digit run (with optional spaces/dashes) — the
# exact grouping varies (01712-345678, 02-9887654, +8801712345678) so we match
# the prefix + a 6-14 char run of digits/separators, bounded by word edges.
_PHONE = re.compile(r"\b(?:\+?880|0)[\d\s\-]{5,13}\d\b|\b\d{16,19}\b")
# Long runs of digits that look like IMEI / device-ids but are NOT legitimate
# numeric learning content. #946 — the old `\b\d{12,}\b` was too broad: it
# redacted 12+ digit numeric answers in place-value drills and concatenated
# codes that kids legitimately produce. Narrow to the exact IMEI shape
# (15 digits) or a 19-digit card-like run that no kid answer would produce.
# Also apply to specific context keys named "device", "imei", "fingerprint"
# rather than globally on every string leaf.
_LONG_DIGITS = re.compile(r"\b\d{15}\b|\b\d{19}\b")
# MAC addresses
_MAC = re.compile(r"\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b")
# #1776 — credential-bearing URL (scheme://user:password@host) and an
# Authorization: Bearer <token> header. The scheme+user stay visible (needed
# to debug a connection target); ONLY the secret is replaced.
_CONN_URI = re.compile(r"([a-z][a-z0-9+.\-]*://[^/@\s:]+:)([^@\s]+)@", re.IGNORECASE)
_BEARER = re.compile(r"(\bauthorization\s*[:=]\s*bearer\s+)[^\s,;]+", re.IGNORECASE)

REDACTION = "[REDACTED]"

# #835 — a story context envelope is small; unbounded nesting is adversarial.
# Stop recursing past this depth so redact_context can't be used as a CPU sink.
MAX_CONTEXT_DEPTH = 20
CONTEXT_TRUNCATED = "[CONTEXT_TRUNCATED]"

# #946 — context keys whose string values may contain device identifiers and
# should get the narrower _LONG_DIGITS treatment. All other string values
# bypass _LONG_DIGITS so legitimate numeric learning content (12+ digit
# answers, concatenated codes) is never falsely redacted.
_DEVICE_ID_KEYS = frozenset({"device", "imei", "fingerprint", "deviceId", "device_id"})


def redact_text(s: str) -> str:
    """Return `s` with every PII-shaped token replaced. Idempotent."""
    if not s:
        return s
    # #1776 — credential-bearing URL secrets are scrubbed FIRST so the later
    # _EMAIL pass can't swallow `password@host` (which would lose the host a
    # debugger needs AND leave the URL in a half-mangled state). Only the
    # password is replaced; scheme/user/host stay visible.
    out = _CONN_URI.sub(r"\1[REDACTED]@", s)
    out = _EMAIL.sub(REDACTION, out)
    out = _MAC.sub(REDACTION, out)
    out = _IPV6.sub(REDACTION, out)
    out = _IPV4.sub(REDACTION, out)
    out = _PHONE.sub(REDACTION, out)
    # #1776 — Bearer-token header secrets run LAST (no PII shape overlaps a
    # JWT, so nothing earlier needs the raw token).
    out = _BEARER.sub(r"\1[REDACTED]", out)
    return out


def _redact_text_with_long_digits(s: str) -> str:
    """Like redact_text but also applies _LONG_DIGITS (used only on known
    device-id context keys)."""
    return _LONG_DIGITS.sub(REDACTION, redact_text(s))


def redact_context(
    ctx: dict[str, Any] | None,
    max_depth: int = MAX_CONTEXT_DEPTH,
) -> dict[str, Any] | None:
    """Deep-redact a story context envelope before storage (#270).

    Walks nested dicts/lists and rewrites string leaves; every other type is
    kept as-is. Never mutates the caller's dict.

    #835 — recursion is capped at `max_depth`; any deeper subtree is replaced
    with a truncation marker so an adversarially nested envelope can't burn CPU.

    #946 — long-digit redaction (_LONG_DIGITS) is applied ONLY to values whose
    key is in _DEVICE_ID_KEYS, so legitimate numeric learning content (12+ digit
    answers, concatenated codes in place-value drills) is never falsely redacted.
    """
    if ctx is None:
        return None

    def walk(v: Any, depth: int = 0, key: str | None = None) -> Any:
        if isinstance(v, str):
            if key and key in _DEVICE_ID_KEYS:
                return _redact_text_with_long_digits(v)
            return redact_text(v)
        if depth >= max_depth:
            return CONTEXT_TRUNCATED
        if isinstance(v, dict):
            return {k: walk(x, depth + 1, k) for k, x in v.items()}
        if isinstance(v, list):
            return [walk(x, depth + 1) for x in v]
        if isinstance(v, tuple):
            return tuple(walk(x, depth + 1) for x in v)
        return v

    return walk(ctx)


# ── #947 — envelope size/depth shaping ────────────────────────────────────────
# Kept HERE (not schemas.py) because this module is dependency-free: the API's
# self-contained CI tests (test_scrub.py, bare `python3`, no Postgres) exercise
# the exact helpers the LearningStoryIn validator uses.

def clamp_context_strings(v: dict, max_len: int) -> dict:
    """Recursively clamp every string leaf in a dict to `max_len` characters."""
    out: dict = {}
    for k, val in v.items():
        if isinstance(val, str):
            out[k] = val[:max_len]
        elif isinstance(val, dict):
            out[k] = clamp_context_strings(val, max_len)
        elif isinstance(val, list):
            out[k] = [
                item[:max_len] if isinstance(item, str)
                else clamp_context_strings(item, max_len) if isinstance(item, dict)
                else item
                for item in val
            ]
        else:
            out[k] = val
    return out


def context_depth(v: dict) -> int:
    """Return the max nesting depth of a dict (1 = flat dict)."""
    if not isinstance(v, dict):
        return 0
    if not v:
        return 1
    return 1 + max(
        context_depth(val) if isinstance(val, dict) else 0
        for val in v.values()
    )


class ScrubFilter(logging.Filter):
    """Logging filter that redacts PII in every emitted record (#266)."""

    def filter(self, record: logging.LogRecord) -> bool:
        # message template is safe (ours) — the args are the untrusted data
        record.msg = redact_text(record.msg if isinstance(record.msg, str) else str(record.msg))
        if record.args:
            record.args = tuple(redact_text(str(a)) if isinstance(a, str) else a for a in record.args)
        try:
            record.exc_text = redact_text(record.exc_text) if record.exc_text else record.exc_text
        except Exception:  # noqa: BLE001 — a scrubber must never crash logging
            pass
        return True
