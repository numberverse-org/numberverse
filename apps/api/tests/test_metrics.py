#!/usr/bin/env python3
"""#1755/#1759 — /metrics endpoint + request instrumentation + pool telemetry.

Standalone tests (no pytest, no Postgres) driving the real FastAPI app through
the same dependency-free ASGI harness as test_request_id.py:

  ① /metrics is gated: operator token (constant-time) when configured, else an
     admin/super_admin JWT (verified from the signed `role` claim, no DB hit).
  ② the middleware counts every routed request as http_requests_total{route,status}
     and records a request_latency_seconds histogram.
  ③ the registry renders Prometheus text lines (counters + cumulative buckets +
     the db_checkout_wait_seconds histogram).
  ④ /health carries a live `pool` object and db_pool_status() reports
     checked_out / overflow / pool_size / max_overflow (#1759).

Run:  cd apps/api && python3 tests/test_metrics.py
"""
import asyncio
import json
import sys
import uuid
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import main as main_mod  # noqa: E402
from app.main import _route_label, app  # noqa: E402
from app.security import create_access_token  # noqa: E402


class _Resp:
    def __init__(self, status, headers, body):
        self.status_code = status
        self.headers = {k.lower(): v for k, v in headers.items()}
        self.body = body

    def json(self):
        return json.loads(self.body.decode("utf-8"))


class _AsgiClient:
    def __init__(self, target):
        self._app = target

    def request(self, method, path, headers=None, body: bytes = b"", client=("testclient", 50000)):
        hdrs = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in (headers or {}).items()]
        hdrs.append((b"host", b"testserver"))
        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("latin-1"),
            "query_string": b"",
            "root_path": "",
            "headers": hdrs,
            "client": client,
            "server": ("test", 80),
        }
        resp = _Resp(0, {}, b"")
        received = False

        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                resp.status_code = message["status"]
                resp.headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in message["headers"]}
            elif message["type"] == "http.response.body":
                resp.body += message.get("body", b"")

        async def run():
            await self._app(scope, receive, send)

        asyncio.run(run())
        return resp

    def get(self, path, headers=None):
        return self.request("GET", path, headers=headers)


client = _AsgiClient(app)
FAILS = []


def check(name, cond, detail=""):
    mark = "✓" if cond else "✖"
    print(f"  {mark} {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)


def _admin_token(role: str = "admin") -> str:
    return create_access_token(str(uuid.uuid4()), role)


def _get_metrics_authed(headers):
    """GET /metrics and return (status, body_text). Uses the admin-JWT fallback
    when no token is configured (the default in dev/test)."""
    r = client.get("/metrics", headers=headers)
    return r.status_code, r.body.decode()


# ── Tests ─────────────────────────────────────────────────────────────────

def test_route_label_normalization():
    print("① _route_label normalizes dynamic segments…")
    check("uuid kid id → {id}", _route_label("/api/v1/kids/3f2504e0-4f89-41d3-9a0c-0305e82c3301"),
          "/api/v1/kids/{id}")
    check("numeric kid id → {id}", _route_label("/api/v1/kids/12345"), "/api/v1/kids/{id}")
    check("bare api path unchanged", _route_label("/api/v1/progress"), "/api/v1/progress")
    check("health unchanged", _route_label("/health"), "/health")
    check("long share token → {id}", _route_label("/api/v1/admin/shares/abcXYZ0123456789abcdefghijklmnop"),
          "/api/v1/admin/shares/{id}")


def test_metrics_admin_jwt_gate():
    print("② /metrics admin-JWT gate (no operator token configured)…")
    status, _ = _get_metrics_authed({})
    check("no header → 401", status == 401, f"got {status}")
    status, _ = _get_metrics_authed({"Authorization": f"Bearer {_admin_token('user')}"})
    check("user-role JWT → 403", status == 403, f"got {status}")
    status, body = _get_metrics_authed({"Authorization": f"Bearer {_admin_token('admin')}"})
    check("admin JWT → 200", status == 200, f"got {status}")
    check("body exposes http_requests_total", "http_requests_total" in body, "")
    check("body exposes request_latency_seconds", "request_latency_seconds" in body, "")
    check("body exposes db_checkout_wait_seconds", "db_checkout_wait_seconds" in body, "")
    check("body exposes db_pool gauges", "db_pool_checked_out" in body and "db_pool_overflow" in body, "")
    check("prometheus type lines present", "# TYPE http_requests_total counter" in body, "")


def test_metrics_operator_token_gate():
    print("③ /metrics operator-token gate (NV_METRICS_TOKEN set)…")
    with mock.patch.object(main_mod.settings, "metrics_token", "test-token"):
        status, _ = _get_metrics_authed({})
        check("no header → 401", status == 401, f"got {status}")
        status, _ = _get_metrics_authed({"Authorization": "Bearer wrong"})
        check("wrong token → 401", status == 401, f"got {status}")
        # a valid admin JWT must NOT pass when an operator token is configured
        status, _ = _get_metrics_authed({"Authorization": f"Bearer {_admin_token('admin')}"})
        check("admin JWT rejected under token mode", status == 401, f"got {status}")
        status, body = _get_metrics_authed({"Authorization": "Bearer test-token"})
        check("matching token → 200", status == 200, f"got {status}")
        check("body exposes http_requests_total", "http_requests_total" in body, "")


def test_middleware_counts_and_histogram():
    print("④ middleware counts routed requests + records latency histogram…")
    # /health and a 404 both flow through the middleware.
    client.get("/health")
    client.get("/definitely-not-a-route")
    status, body = _get_metrics_authed({"Authorization": f"Bearer {_admin_token('admin')}"})
    check("health counted", 'http_requests_total{route="/health",status="503"}' in body, "")
    check("404 counted", 'http_requests_total{route="/definitely-not-a-route",status="404"}' in body, "")
    check("histogram bucket line present",
          'request_latency_seconds_bucket{route="/health",le="' in body, "")
    check("histogram count present", 'request_latency_seconds_count{route="/health"}' in body, "")


def test_checkout_wait_histogram_and_pool_status():
    print("⑤ db_checkout_wait_seconds histogram + pool status…")
    from app.metrics import observe_checkout_wait, render_metrics
    observe_checkout_wait(0.002)
    body = render_metrics()
    check("checkout histogram has a count", "db_checkout_wait_seconds_count 1" in body, body[:400])
    check("checkout bucket >0", "db_checkout_wait_seconds_bucket{le=\"0.005\"} 1" in body, "")

    from app.db import db_pool_status
    pool = db_pool_status()
    check("pool has checked_out", "checked_out" in pool, str(pool))
    check("pool has overflow", "overflow" in pool, str(pool))
    check("pool has pool_size", pool.get("pool_size") == 10, str(pool))
    check("pool has max_overflow", pool.get("max_overflow") == 20, str(pool))

    h = client.get("/health")
    hbody = h.json()
    check("health carries pool object", "pool" in hbody, str(hbody.get("pool")))


# ── Runner ─────────────────────────────────────────────────────────────────

def main():
    test_route_label_normalization()
    test_metrics_admin_jwt_gate()
    test_metrics_operator_token_gate()
    test_middleware_counts_and_histogram()
    test_checkout_wait_histogram_and_pool_status()
    print()
    if FAILS:
        print(f"✖ {len(FAILS)} check(s) failed: {FAILS}")
        sys.exit(1)
    print("✓ metrics + pool telemetry checks passed")


if __name__ == "__main__":
    main()
