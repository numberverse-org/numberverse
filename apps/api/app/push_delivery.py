"""#3002 — Web Push delivery path.

Until this module, `push_subscriptions` rows were written and read but NEVER
sent to: the weekly `trigger` kids.py computes had no consumer, and no code in
the repo ever made a push request. This module is the delivery half — it turns
stored subscriptions + a notification signal into a send.

SCOPE NOTE (flagged, not hidden): the *actual* Web Push wire format is RFC
8291/8030 — the message body must be AES-GCM encrypted to the subscription's
`p256dh` key and signed with a VAPID JWT in the `Authorization` header. That
encryption is exactly what the `pywebpush` package provides, and it is NOT a
dependency here. So the real `_send_webpush()` below is a clearly-marked stub:
it posts the *plaintext* payload over HTTPS but does NOT produce a notification
a browser will accept. Shipping the full RFC 8291 encryption requires adding
`pywebpush` (dependency add) — a flagged follow-up.

What IS here and functional:
  - a send function wired to the real notification trigger points (weekly,
    milestone, reminder) so the intake side is real end-to-end;
  - VAPID key handling: an unconfigured keypair degrades to an explicit
    "not configured" result (never a crash), and a configured key produces a
    VAPID JWT authorization header;
  - per-subscription isolation: an unreachable/erroring endpoint is logged and
    skipped, never fatal to the remaining subscriptions;
  - deterministic payload shaping (`title`/`body`/`tag`) so the sender can be
    unit-tested without any network.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger("numberverse")

# The Delivery:authorization header claim set (RFC 8292 §2). The kid is the VAPID
# public key (base64url, no padding); a browser-facing push service only accepts
# it when the signed `aud` is the endpoint's origin.
_VAPID_HEADER = {"typ": "JWT", "alg": "ES256"}
# signing subject (RFC 8292 §2.1 — an http: or mailto: URI)
_VAPID_SUBJECT = "mailto:push@numberverse.dev"


@dataclass
class DeliverResult:
    """Outcome of one delivery run, per subscription."""

    sent: int = 0
    failed: int = 0
    not_configured: bool = False
    errors: list[str] = field(default_factory=list)


def _b64url(data: bytes) -> str:
    """Base64url-encode WITHOUT padding (RFC 7515) — required for a VAPID JWT."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    """Inverse of _b64url — tolerant of standard base64 padding/whitespace."""
    s = s.strip()
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)


def derive_public_key_b64url(private_key_b64url: str) -> str | None:
    """Derive the RFC 8292 `Crypto-Key: p256ecdsa=` public key (uncompressed
    point, base64url-unpadded) from an unpadded base64url P-256 PRIVATE scalar.

    Returns None when the key is malformed or `cryptography` is unavailable —
    the caller then treats the keypair as unusable (a VAPID JWT naming a wrong
    or absent public key is rejected by every push service).
    """
    try:
        raw = _b64url_decode(private_key_b64url)
        if len(raw) != 32:
            return None
        from cryptography.hazmat.primitives.asymmetric import ec

        priv = ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())
        pub = priv.public_key().public_numbers()
        return _b64url(b"\x04" + pub.x.to_bytes(32, "big") + pub.y.to_bytes(32, "big"))
    except Exception:
        return None


def build_vapid_authorization(private_key_b64url: str, aud: str) -> tuple[str, str] | None:
    """Build the (authorization, crypto_key) header pair for one audience.

    Returns None when the key is malformed or ES256 signing is unavailable so
    the caller skips the subscription rather than raising.
    """
    from .security import sign_vapid_token

    public_b64url = derive_public_key_b64url(private_key_b64url)
    if public_b64url is None:
        return None
    header_b64 = _b64url(json.dumps(_VAPID_HEADER, separators=(",", ":")).encode())
    now = int(time.time())
    claims = {
        "aud": aud,
        "exp": now + 12 * 3600,
        "sub": _VAPID_SUBJECT,
    }
    payload_b64 = _b64url(json.dumps(claims, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}"
    try:
        signature = sign_vapid_token(private_key_b64url, signing_input)
    except Exception:
        return None
    jwt = f"{signing_input}.{_b64url(signature)}"
    return f"vapid t={jwt}, k={public_b64url}", public_b64url


def build_vapid_headers(endpoint: str) -> tuple[str, str] | None:
    """Return the (authorization, crypto_key) header pair for a subscription,
    reading the API's configured VAPID private key. None = not configured (or
    unparseable), meaning delivery should degrade to an explicit skip."""
    from urllib.parse import urlsplit

    from .config import settings

    if not settings.vapid_configured:
        return None
    parts = urlsplit(endpoint)
    aud = f"{parts.scheme}://{parts.netloc}"
    built = build_vapid_authorization(settings.vapid_private_key, aud)
    if built is None:
        return None
    authorization, public_b64url = built
    return authorization, f"p256ecdsa={public_b64url}"


def build_weekly_payload(
    kid_display_name: str, *, trigger: str, rounds: int, streak: int
) -> tuple[str, str, str]:
    """Map the weekly `trigger` signal (`weekly-summary` | `milestone` |
    `reminder`) to a deterministic (title, body, tag) for the notification."""
    if trigger == "milestone":
        return (
            f"{kid_display_name} hit a milestone 🎉",
            f"{kid_display_name} mastered something new this week "
            f"({rounds} rounds, {streak}-day streak).",
            "milestone",
        )
    if trigger == "reminder":
        return (
            f"{kid_display_name} hasn't practiced yet",
            "No rounds this week — a gentle nudge to keep the streak alive.",
            "reminder",
        )
    return (
        f"{kid_display_name}'s weekly summary",
        f"{rounds} rounds this week, {streak}-day streak.",
        "weekly-summary",
    )


async def send_notification(
    *,
    db,
    endpoint: str,
    title: str,
    body: str,
    tag: str,
    httpx_client=None,
) -> str:
    """Send ONE notification to a stored subscription endpoint; returns a
    status string ("sent" | "failed" | "not_configured"). Raises nothing.

    The DB handle is accepted for signature compatibility with future
    pywebpush-backed sends (which re-read `p256dh`/`auth`); the plaintext stub
    below only needs the endpoint + VAPID keys.
    """
    import httpx

    from .push_delivery import _send_webpush

    vapid = build_vapid_headers(endpoint)
    if vapid is None:
        return "not_configured"
    authorization, crypto_key = vapid
    own_client = httpx_client is None
    client = httpx_client or httpx.AsyncClient(timeout=10.0)
    try:
        ok = await _send_webpush(client, endpoint, title, body, tag, authorization, crypto_key)
        return "sent" if ok else "failed"
    except Exception as exc:  # per-subscription isolation
        logger.warning("push delivery send failed endpoint=%s error=%r", endpoint, exc)
        return "failed"
    finally:
        if own_client:
            await client.aclose()


async def _send_webpush(
    client, endpoint: str, title: str, body: str, tag: str, authorization: str, crypto_key: str
) -> bool:
    """The REAL wire call to the push endpoint. Currently plaintext-only (see
    scope note) — a follow-up swaps this body for pywebpush's encrypted send."""
    payload = json.dumps({"title": title, "body": body, "tag": tag}, separators=(",", ":"))
    headers = {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "none",
        "TTL": "86400",
        "Authorization": authorization,
        "Crypto-Key": crypto_key,
    }
    resp = await client.post(endpoint, content=payload.encode(), headers=headers)
    return resp.status_code in (200, 201, 202, 204)
