"""bKash Tokenized Checkout integration (Parent Plus).

Ported from the production `newscards` bKash service (homeServer) and adapted to
Numberverse's stack: Postgres/SQLAlchemy instead of Supabase, structured logging
instead of Sentry/analytics, and an IN-MEMORY token cache + lock instead of Redis
(Numberverse has a Redis container but no Python client — for one merchant token
at family scale, in-memory is enough).

The three hard parts this module gets right, carried over verbatim from the
proven implementation:
  · token grant is cached + lock-guarded (no thundering herd across workers),
  · a 401 mid-request auto-refreshes the token and retries once,
  · execute returns statusCode 2062 ("already completed") → we re-sync via
    query instead of mislabeling a double-tap as failed.

The Numberverse `bkash-tunnel` container (autossh -D 0.0.0.0:1080) routes bKash
calls through a stable whitelisted IP; set NV_BKASH_PROXY_URL to point at it.
"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from requests.adapters import HTTPAdapter

log = logging.getLogger("numberverse.bkash")

# # Token lifetime buffer — refresh the token 5 min before bKash's expiry so a
# mid-request expiry can't wedge a payment.
_TOKEN_LEEWAY_S = 300


class BkashError(Exception):
    """A bKash API call failed in a way the caller must surface."""


class BkashService:
    """Thin, dependency-free wrapper over the bKash Tokenized Checkout API."""

    def __init__(self, config: Any) -> None:
        self.base_url = (config.bkash_base_url or "").rstrip("/")
        self.username = config.bkash_username
        self.password = config.bkash_password
        self.app_key = config.bkash_app_key
        self.app_secret = config.bkash_app_secret
        self._proxy_url = config.bkash_proxy_url

        self._id_token: str | None = None
        self._token_expiry: float = 0.0
        self._lock = threading.Lock()

        self.session = requests.Session()
        adapter = HTTPAdapter(pool_connections=20, pool_maxsize=50, max_retries=2)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        if self._proxy_url:
            self.session.proxies = {"https": self._proxy_url, "http": self._proxy_url}
        self.session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json",
            }
        )

    @property
    def configured(self) -> bool:
        return bool(self.username and self.password and self.app_key and self.app_secret)

    def _headers(self, force_refresh: bool = False) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "authorization": self.get_token(force_refresh=force_refresh),
            "x-app-key": self.app_key,
        }

    def get_token(self, force_refresh: bool = False) -> str:
        if not force_refresh and self._id_token and time.time() < self._token_expiry - _TOKEN_LEEWAY_S:
            return self._id_token

        with self._lock:
            # Double-check inside the lock — another thread may have refreshed.
            if not force_refresh and self._id_token and time.time() < self._token_expiry - _TOKEN_LEEWAY_S:
                return self._id_token
            log.info("[bKash] requesting ID token")
            resp = self.session.post(
                f"{self.base_url}/token/grant",
                headers={
                    "Content-Type": "application/json",
                    "Username": self.username,
                    "Password": self.password,
                },
                json={"app_key": self.app_key, "app_secret": self.app_secret},
                timeout=(10, 25),
            )
            resp.raise_for_status()
            data = resp.json()
            if "id_token" not in data:
                msg = data.get("statusMessage") or data.get("errorMessage") or data.get("message") or "unknown"
                log.error("[bKash] token grant failed: %s", msg)
                raise BkashError(f"bKash token grant failed: {msg}")
            self._id_token = data["id_token"]
            self._token_expiry = time.time() + int(data.get("expires_in", 3600))
            return self._id_token

    def _request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        """Request with a single 401 → token-refresh retry (mirrors newscards)."""
        resp = self.session.request(method, url, headers=self._headers(), **kwargs)
        if resp.status_code == 401:
            log.warning("[bKash] 401 — refreshing token and retrying")
            resp = self.session.request(method, url, headers=self._headers(force_refresh=True), **kwargs)
        return resp

    def create_payment(self, amount: float, callback_url: str, invoice: str, payer_reference: str) -> dict:
        payload = {
            "mode": "0011",
            "payerReference": payer_reference,
            "callbackURL": callback_url,
            "amount": str(amount),
            "currency": "BDT",
            "intent": "sale",
            "merchantInvoiceNumber": invoice,
            "merchantAssociationInfo": "",
        }
        resp = self._request("POST", f"{self.base_url}/create", json=payload, timeout=(8, 30))
        resp.raise_for_status()
        return resp.json()

    def execute_payment(self, payment_id: str) -> dict:
        resp = self._request("POST", f"{self.base_url}/execute", json={"paymentID": payment_id}, timeout=(10, 25))
        resp.raise_for_status()
        data = resp.json()
        # statusCode 2062 = already executed (a double-tap). Re-sync via query so
        # we report the real status/amount instead of a phantom "failed / 0".
        if data.get("statusCode") == "2062":
            log.info("[bKash] payment %s already completed (2062) — querying", payment_id)
            return self.query_payment(payment_id)
        return data

    def query_payment(self, payment_id: str) -> dict:
        resp = self._request(
            "POST", f"{self.base_url}/payment/status", json={"paymentID": payment_id}, timeout=(10, 25)
        )
        resp.raise_for_status()
        return resp.json()

    def void_payment(self, payment_id: str) -> dict:
        resp = self._request(
            "POST", f"{self.base_url}/payment/confirm/void", json={"paymentID": payment_id}, timeout=(10, 25)
        )
        resp.raise_for_status()
        return resp.json()


def _period_end(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def is_completed(data: dict) -> bool:
    """True when bKash reports a successful, completed transaction."""
    return data.get("statusCode") == "0000" and data.get("transactionStatus") in ("Completed", "Successful")
