#!/usr/bin/env python3
"""Tests for #1749/#1750 — request correlation ids + structured 5xx logging.

Covers:
  ① RequestIDMiddleware (tiny ASGI app wrapped in the middleware):
     - a 200 response carries an X-Request-ID header (minted when none sent);
     - the header value matches the request_id the downstream log record carried;
     - an incoming X-Request-ID is echoed back unchanged (and downstream sees it
       in request_id_ctx);
     - unsafe header values are sanitized (CR/LF stripped, capped at 64).
  ② app.exception_handler(Exception): an unhandled route exception → 500, an
     ERROR record with method/path/status/request_id lands (and the structured
     _JsonFormatter also stamps request_id on the record), and the 500 response
     still carries X-Request-ID.
  ③ app.exception_handler(HTTPException): 5xx logs, 4xx stays quiet; the
     client-visible {"detail": ...} shape is unchanged.
  ④ RequestValidationError (422) is not spammed.

Run:  cd apps/api && python3 tests/test_request_id.py
"""
import asyncio
import json
import logging
import re
import sys
from pathlib import Path

_json = json  # module alias (the harness's post() shadows the name `json`)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import errorlog  # noqa: E402
from app.main import RequestIDMiddleware, app, request_id_ctx  # noqa: E402


# ── Dependency-free ASGI harness (no httpx2 / TestClient) ───────────────────

class _Resp:
    """Minimal ASGI response: status_code, case-insensitive headers, json()."""

    def __init__(self, status, headers, body):
        self.status_code = status
        self.headers = {k.lower(): v for k, v in headers.items()}
        self.body = body

    def json(self):
        return json.loads(self.body.decode("utf-8"))


class _AsgiClient:
    """Drives an ASGI/FastAPI app through a request/response cycle without
    any HTTP stack (starlette's TestClient requires the httpx2 package, which
    the CI install line does NOT include)."""

    def __init__(self, target):
        self._app = target

    def request(self, method, path, headers=None, body: bytes = b""):
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
            "client": ("testclient", 50000),
            "server": ("test", 80),
        }
        resp = _Resp(0, {}, b"")
        sent_body = False
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
                nonlocal sent_body
                resp.body += message.get("body", b"")
                sent_body = True

        async def run():
            try:
                await self._app(scope, receive, send)
            except Exception:
                # Starlette's ServerErrorMiddleware sends the 500 response and
                # THEN re-raises (so servers / test clients can choose to log or
                # propagate). TestClient's `raise_server_exceptions=False` does
                # the same as this: if a response was already started, swallow
                # the re-raise and hand back the captured 500 response.
                if resp.status_code == 0:
                    raise

        asyncio.run(run())
        return resp

    def get(self, path, headers=None):
        return self.request("GET", path, headers=headers)

    def post(self, path, json=None, headers=None):
        body = b""
        hdrs = dict(headers or {})
        if json is not None:
            body = _json.dumps(json).encode("utf-8")
            hdrs.setdefault("Content-Type", "application/json")
        return self.request("POST", path, headers=hdrs, body=body)

FAILS = []


def check(name, cond, detail=""):
    mark = "✓" if cond else "✖"
    print(f"  {mark} {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)


# ── Capture handler (caplog-style) ──────────────────────────────────────────

class _Capture(logging.Handler):
    """Collects LogRecords for assertion (caplog-style, no disk writes)."""

    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.records = []

    def emit(self, record):
        self.records.append(record)


_CAPTURE = _Capture()
logging.getLogger("numberverse").addHandler(_CAPTURE)


def _records(**filters):
    """Return captured records whose getMessage() contains every filter value."""
    out = []
    for rec in _CAPTURE.records:
        msg = rec.getMessage()
        if all(v in msg for v in filters.values()):
            out.append(rec)
    return out


# ── Test-only routes on the real app (registered once, before any request) ──

def _add_test_routes():
    @app.get("/__test_boom")
    async def _boom():
        raise RuntimeError("boom for request-id test")

    @app.get("/__test_503")
    async def _svc_down():
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="maintenance")

    @app.get("/__test_404")
    async def _missing():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not Found")

    from pydantic import BaseModel

    class _Body(BaseModel):
        email: str
        age: int

    @app.post("/__test_validate")
    async def _validate(b: _Body):
        return {"ok": True}


# ── Tiny ASGI app for the middleware-only checks ────────────────────────────

class _TinyApp:
    """Minimal ASGI app that logs request_id_ctx and echoes it in the body."""

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return
        rid = request_id_ctx.get()
        logging.getLogger("numberverse.requestid").warning("tiny-request request_id=%s", rid)
        body = json.dumps({"request_id": rid}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": body})


# ── ① middleware ────────────────────────────────────────────────────────────

def test_middleware():
    print("① RequestIDMiddleware: mints, echoes, sanitizes, matches log record…")
    client = _AsgiClient(RequestIDMiddleware(_TinyApp()))

    # (a) the response carries an X-Request-ID header (minted when none sent)
    _CAPTURE.records.clear()
    r = client.get("/")
    header_id = r.headers.get("x-request-id")
    check("response carries X-Request-ID header", bool(header_id))
    check("minted id looks like uuid4().hex", re.fullmatch(r"[0-9a-f]{32}", header_id or "") is not None)

    # (b) the header value matches the id the captured log record carried
    recs = _records(tag="tiny-request")
    check("downstream log record captured", len(recs) == 1, f"got {len(recs)}")
    if recs:
        m = re.search(r"request_id=([0-9a-f]{32})", recs[0].getMessage())
        check("log record carried the same id as the header", bool(m) and m.group(1) == header_id)

    # (c) an incoming X-Request-ID is echoed back unchanged
    r2 = client.get("/", headers={"X-Request-ID": "client-trace-123"})
    check("incoming X-Request-ID echoed unchanged", r2.headers.get("x-request-id"), "client-trace-123")
    check("downstream sees the echoed id in request_id_ctx", r2.json()["request_id"], "client-trace-123")

    # (d) unsafe header values are sanitized: CR/LF stripped, capped at 64
    evil = "bad\r\nX-Injected: 1" + "a" * 100
    r3 = client.get("/", headers={"X-Request-ID": evil})
    safe = r3.headers.get("x-request-id")
    check("CR/LF stripped", safe is not None and "\r" not in safe and "\n" not in safe)
    check("capped at 64 chars", safe is not None and len(safe) <= 64)


# ── ②③ exception handlers ───────────────────────────────────────────────────

def test_exception_handlers():
    print("② Exception + HTTPException handlers: structured 5xx logging…")
    client = _AsgiClient(app)

    # --- unhandled Exception → 500, ERROR record, X-Request-ID threaded ---
    _CAPTURE.records.clear()
    rid = "boom-req-001"
    r = client.get("/__test_boom", headers={"X-Request-ID": rid})
    check("unhandled exception → 500", r.status_code, 500)
    check("500 body shape unchanged", r.json(), {"detail": "Internal Server Error"})
    check("500 response carries X-Request-ID", r.headers.get("x-request-id"), rid)
    errs = _records(path="/__test_boom")
    check("one ERROR record for the raised route", len(errs) == 1, f"got {len(errs)}")
    if errs:
        msg = errs[0].getMessage()
        check("record carries method", "GET" in msg)
        check("record carries path", "/__test_boom" in msg)
        check("record carries status 500", "→ 500" in msg)
        check("record carries request_id", f"request_id={rid}" in msg)
        line = json.loads(errorlog._JsonFormatter().format(errs[0]))
        check("structured JSON record has request_id field", line["request_id"], rid)

    # --- HTTPException 503 → ERROR record, body shape preserved ---
    _CAPTURE.records.clear()
    rid503 = "svc-req-503"
    r = client.get("/__test_503", headers={"X-Request-ID": rid503})
    check("HTTPException 503 status", r.status_code, 503)
    check("503 body shape unchanged", r.json(), {"detail": "maintenance"})
    check("503 response carries X-Request-ID", r.headers.get("x-request-id"), rid503)
    errs = _records(path="/__test_503")
    check("one ERROR record for the 503", len(errs) == 1, f"got {len(errs)}")
    if errs:
        msg = errs[0].getMessage()
        check("503 record has status", "→ 503" in msg)
        check("503 record has request_id", f"request_id={rid503}" in msg)

    # --- HTTPException 404 → quiet, body shape preserved ---
    _CAPTURE.records.clear()
    r = client.get("/__test_404", headers={"X-Request-ID": "quiet-404"})
    check("404 status", r.status_code, 404)
    check("404 body shape unchanged", r.json(), {"detail": "Not Found"})
    errs = _records(path="/__test_404")
    check("404 stays quiet (no ERROR record)", len(errs) == 0, f"got {len(errs)}")


# ── ④ RequestValidationError (422) not spammed ──────────────────────────────

def test_validation_422_quiet():
    print("③ RequestValidationError (422) is not spammed…")
    client = _AsgiClient(app)
    _CAPTURE.records.clear()
    r = client.post("/__test_validate", json={"email": "not-an-email", "age": "x"})
    check("422 status", r.status_code, 422)
    check("422 response carries X-Request-ID", bool(r.headers.get("x-request-id")))
    errs = _records(path="/__test_validate")
    check("422 produces no ERROR record", len(errs) == 0, f"got {len(errs)}")


if __name__ == "__main__":
    _add_test_routes()
    test_middleware()
    test_exception_handlers()
    test_validation_422_quiet()
    print()
    if FAILS:
        print(f"✖ {len(FAILS)} check(s) failed: {FAILS}")
        sys.exit(1)
    print("✓ all request-id checks passed")
