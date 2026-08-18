#!/usr/bin/env python3
"""#1854 — the body-size guard's 413 now echoes the request Origin as
Access-Control-Allow-Origin, so a cross-origin oversized POST returns a
readable 413.

`RequestBodySizeLimitMiddleware` is OUTERMOST (before CORSMiddleware), so a
413 it emits never passes through CORS and previously carried no
`Access-Control-Allow-Origin` — a browser cross-origin client could not read
the error at all. The middleware now echoes the request's Origin on the 413
(an Origin-less caller — curl, native apps — simply gets no CORS header).

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_cors_413.py

This drives the REAL app's full middleware stack; the size guard rejects
before any DB work, so no database is touched.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import (  # noqa: E402
    MAX_REQUEST_BODY_BYTES,
    RequestBodySizeLimitMiddleware,
)
from app.main import app  # noqa: E402

_json = json

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


# ── Dependency-free ASGI harness (mirrors test_request_id.py) ───────────────

class _Resp:
    def __init__(self, status, headers, body):
        self.status_code = status
        self.headers = {k.lower(): v for k, v in headers.items()}
        self.body = body

    def json(self):
        return _json.loads(self.body.decode("utf-8"))


class _AsgiClient:
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
                if resp.status_code == 0:
                    raise

        import asyncio
        asyncio.run(run())
        return resp

    def post(self, path, body_bytes=b"", headers=None):
        return self.request("POST", path, headers=headers, body=body_bytes)


# ── A tiny downstream that never runs (the size guard rejects first) ─────────

class _Downstream:
    """Records that it was reached and drains the request body the way a real
    Starlette/FastAPI app would — the size guard's STREAMED-counter only fires
    once the downstream actually reads the body, so a drain is required to
    exercise the counting path."""

    def __init__(self):
        self.reached = False

    async def __call__(self, scope, receive, send):
        self.reached = True
        while True:
            message = await receive()
            if message["type"] != "http.request" or not message.get("more_body"):
                break
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"text/plain"), (b"content-length", b"2")],
        })
        await send({"type": "http.response.body", "body": b"ok"})


BIG = b"x" * (MAX_REQUEST_BODY_BYTES + 1)
SMALL = b"tiny"


def _run():
    print("①  real app stack — oversized cross-origin POST → readable 413…")
    client = _AsgiClient(app)
    r = client.post(
        "/api/v1/kids",
        body_bytes=BIG,
        headers={"Origin": "https://portal.example", "X-Request-ID": "cors-413-001"},
    )
    check("413 status", r.status_code, 413)
    check("Access-Control-Allow-Origin echoes the request Origin",
          r.headers.get("access-control-allow-origin"), "https://portal.example")
    check("413 body is the readable JSON detail",
          r.json(), {"detail": "Request body too large"})

    # No Origin (curl / native) → no CORS header, same 413.
    r2 = client.post("/api/v1/kids", body_bytes=BIG, headers={"X-Request-ID": "cors-413-002"})
    check("Origin-less 413 still 413", r2.status_code, 413)
    check("Origin-less 413 has NO access-control-allow-origin",
          r2.headers.get("access-control-allow-origin"), None)

    print("②  middleware in isolation — Content-Length budget + streamed paths…")

    # (a) Content-Length declared over budget → immediate 413 + origin echo.
    downstream = _Downstream()
    wrapped = RequestBodySizeLimitMiddleware(downstream)
    client_i = _AsgiClient(wrapped)
    headers = {
        "Origin": "https://portal.example",
        "Content-Length": str(len(BIG)),
    }
    r3 = client_i.post("/anything", body_bytes=SMALL, headers=headers)
    check("Content-Length over budget → 413", r3.status_code, 413)
    check("budget 413 echoes Origin", r3.headers.get("access-control-allow-origin"),
          "https://portal.example")
    check("oversized body short-circuits downstream", downstream.reached, False)

    # (b) no Content-Length but a streamed body over budget → 413 + origin echo.
    downstream2 = _Downstream()
    wrapped2 = RequestBodySizeLimitMiddleware(downstream2)
    client_i2 = _AsgiClient(wrapped2)
    r4 = client_i2.post("/anything", body_bytes=BIG, headers={"Origin": "https://portal.example"})
    check("streamed over budget → 413", r4.status_code, 413)
    check("streamed 413 echoes Origin", r4.headers.get("access-control-allow-origin"),
          "https://portal.example")

    # (c) a compliant body passes straight through, origin untouched.
    downstream3 = _Downstream()
    wrapped3 = RequestBodySizeLimitMiddleware(downstream3)
    client_i3 = _AsgiClient(wrapped3)
    r5 = client_i3.post("/anything", body_bytes=SMALL, headers={"Origin": "https://portal.example"})
    check("compliant body reaches the app (200)", r5.status_code, 200)
    check("compliant body not short-circuited", downstream3.reached, True)

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES: {fails}")
        sys.exit(1)
    print("✓ all #1854 CORS-413 checks passed")


if __name__ == "__main__":
    _run()