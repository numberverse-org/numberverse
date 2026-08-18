#!/usr/bin/env python3
"""#1756 — POST /api/v1/errors: scrubbed, rate-limited client error reporting.

Standalone tests (no pytest, no Postgres) driving the real FastAPI app:

  ① a scrubbed payload is accepted (202) and the log record is PII-redacted;
  ② the endpoint is a public surface with its own per-IP budget (429 after the
     window fills), and the budget is in-process so a dead DB can't take the
     error sink down;
  ③ oversized / deep-nested / over-length payloads fail validation (422).

Run:  cd apps/api && python3 tests/test_client_errors.py
"""
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402


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

    def post(self, path, body: bytes = b"", headers=None, client=("testclient", 50000)):
        hdrs = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in (headers or {}).items()]
        hdrs.append((b"host", b"testserver"))
        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "POST",
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


client = _AsgiClient(app)
FAILS = []


def check(name, cond, detail=""):
    mark = "✓" if cond else "✖"
    print(f"  {mark} {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)


def _payload(**overrides):
    body = {
        "kind": "boundary",
        "version": "1.5.0",
        "label": "boot",
        "message": "boom user@example.com 01712345678",
        "context": {"nested": {"email": "kid@school.com"}, "device_id": "dev-abc-123"},
        "request_id": "req-abc",
        "language": "en",
    }
    body.update(overrides)
    return json.dumps(body).encode()


class _CaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.records = []

    def emit(self, record):
        self.records.append(record.getMessage())


def test_valid_payload_accepted_and_scrubbed():
    print("① valid payload → 202, log record scrubbed…")
    handler = _CaptureHandler()
    logger = logging.getLogger("numberverse")
    logger.addHandler(handler)
    try:
        resp = client.post("/api/v1/errors", body=_payload(),
                           headers={"Content-Type": "application/json"})
        check("status 202", resp.status_code == 202, f"got {resp.status_code}")
        check("body accepted", resp.json() == {"status": "accepted"}, str(resp.body))
    finally:
        logger.removeHandler(handler)
    check("one WARNING record captured", len(handler.records) == 1, str(len(handler.records)))
    if handler.records:
        rec = handler.records[0]
        check("email redacted", "[REDACTED]" in rec and "user@example.com" not in rec, rec)
        check("phone redacted", "01712345678" not in rec, rec)
        check("context email redacted", "kid@school.com" not in rec, rec)


def test_validation_rejections():
    print("② over-length / oversized / deep payloads → 422…")
    long_msg = _payload(message="x" * 4096)
    resp = client.post("/api/v1/errors", body=long_msg,
                       headers={"Content-Type": "application/json"})
    check("over-length message → 422", resp.status_code == 422, f"got {resp.status_code}")

    big_ctx = _payload(context={f"k{i}": "z" * 700 for i in range(20)})
    resp = client.post("/api/v1/errors", body=big_ctx,
                       headers={"Content-Type": "application/json"})
    check("oversized context → 422", resp.status_code == 422, f"got {resp.status_code}")

    deep_ctx = _payload(context={"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": {"i": {"j": {"k": 1}}}}}}}}}}})
    resp = client.post("/api/v1/errors", body=deep_ctx,
                       headers={"Content-Type": "application/json"})
    check("deep context → 422", resp.status_code == 422, f"got {resp.status_code}")


def test_per_ip_rate_limit():
    print("③ per-IP budget: 30 accepted, then 429 (in-process limiter)…")
    ip = "10.99.0.1"  # trusted-proxy-range peer → _request_ip resolves it
    headers = {"Content-Type": "application/json"}
    ok = 0
    for _ in range(30):
        r = client.post("/api/v1/errors", body=_payload(message="f"), headers=headers, client=(ip, 50000))
        if r.status_code == 202:
            ok += 1
    check("30 reports accepted", ok == 30, f"accepted {ok}/30")
    r = client.post("/api/v1/errors", body=_payload(message="f"), headers=headers, client=(ip, 50000))
    check("31st report → 429", r.status_code == 429, f"got {r.status_code}")
    # a different IP is unaffected
    r2 = client.post("/api/v1/errors", body=_payload(message="f"), headers=headers, client=("10.99.0.2", 50000))
    check("different IP still accepted", r2.status_code == 202, f"got {r2.status_code}")


def main():
    test_valid_payload_accepted_and_scrubbed()
    test_validation_rejections()
    test_per_ip_rate_limit()
    print()
    if FAILS:
        print(f"✖ {len(FAILS)} check(s) failed: {FAILS}")
        sys.exit(1)
    print("✓ client-error reporting checks passed")


if __name__ == "__main__":
    main()
