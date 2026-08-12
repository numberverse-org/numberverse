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
# Long runs of digits (device ids, IMEI-ish) — redact anything ≥ 12 digits
_LONG_DIGITS = re.compile(r"\b\d{12,}\b")
# MAC addresses
_MAC = re.compile(r"\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b")

REDACTION = "[REDACTED]"


def redact_text(s: str) -> str:
    """Return `s` with every PII-shaped token replaced. Idempotent."""
    if not s:
        return s
    out = _EMAIL.sub(REDACTION, s)
    out = _MAC.sub(REDACTION, out)
    out = _IPV6.sub(REDACTION, out)
    out = _IPV4.sub(REDACTION, out)
    out = _PHONE.sub(REDACTION, out)
    out = _LONG_DIGITS.sub(REDACTION, out)
    return out


def redact_context(ctx: dict[str, Any] | None) -> dict[str, Any] | None:
    """Deep-redact a story context envelope before storage (#270).

    Walks nested dicts/lists and rewrites string leaves; every other type is
    kept as-is. Never mutates the caller's dict."""
    if ctx is None:
        return None

    def walk(v: Any) -> Any:
        if isinstance(v, str):
            return redact_text(v)
        if isinstance(v, dict):
            return {k: walk(x) for k, x in v.items()}
        if isinstance(v, list):
            return [walk(x) for x in v]
        if isinstance(v, tuple):
            return tuple(walk(x) for x in v)
        return v

    return walk(ctx)


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
