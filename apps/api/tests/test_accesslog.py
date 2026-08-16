#!/usr/bin/env python3
"""Self-contained tests for the access log middleware + installer (#1754).

Run:  cd apps/api && python3 tests/test_accesslog.py
No pytest, no network — mirrors test_errorlog.py's style.
"""
import asyncio
import json
import logging
import logging.handlers
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app.accesslog as accesslog  # noqa: E402
from app.accesslog import AccessLogMiddleware, install_access  # noqa: E402
from app.errorlog import _JsonFormatter, request_id_ctx  # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    mark = "✓" if cond else "✖"
    print(f"  {mark} {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)


class _Capture(logging.Handler):
    """Collects LogRecords for assertion (caplog-style, no disk writes)."""

    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.records = []

    def emit(self, record):
        self.records.append(record)


_CAPTURE = _Capture()
_ACCESS_LOGGER = logging.getLogger("numberverse.access")
_ACCESS_LOGGER.setLevel(logging.INFO)
_ACCESS_LOGGER.addHandler(_CAPTURE)


class _Resp:
    def __init__(self, status, headers, body):
        self.status_code = status
        self.headers = {k.lower(): v for k, v in headers.items()}
        self.body = body


class _AsgiClient:
    """Drives an ASGI app through a request/response cycle without any HTTP
    stack (same pattern as tests/test_request_id.py)."""

    def __init__(self, target):
        self._app = target

    def get(self, path):
        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("latin-1"),
            "query_string": b"",
            "root_path": "",
            "headers": [(b"host", b"testserver")],
            "client": ("testclient", 50000),
            "server": ("test", 80),
        }
        resp = _Resp(0, {}, b"")
        received = False

        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": b"", "more_body": False}
            return {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                resp.status_code = message["status"]
                resp.headers = {
                    k.decode("latin-1"): v.decode("latin-1")
                    for k, v in message["headers"]
                }
            elif message["type"] == "http.response.body":
                resp.body += message.get("body", b"")

        async def run():
            await self._app(scope, receive, send)

        asyncio.run(run())
        return resp


class _TinyApp:
    """Echoes a fixed status + JSON body so the access middleware can capture it."""

    def __init__(self, status=201):
        self.status = status

    async def __call__(self, scope, receive, send):
        body = json.dumps({"ok": True}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": self.status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": body})


def test_middleware_emits_record():
    print("① AccessLogMiddleware emits exactly one INFO record per request…")
    _CAPTURE.records.clear()
    client = _AsgiClient(AccessLogMiddleware(_TinyApp()))
    tok = request_id_ctx.set("trace-abc-123")
    try:
        r = client.get("/hello")
        recs = [rec for rec in _CAPTURE.records if rec.name == "numberverse.access"]
        check("response status 201", r.status_code, 201)
        check("exactly one access INFO record", len(recs) == 1, f"got {len(recs)}")
        if recs:
            rec = recs[0]
            msg = rec.getMessage()
            check("level INFO", rec.levelname, "INFO")
            check("record has method", "method=GET" in msg, msg)
            check("record has path", "path=/hello" in msg, msg)
            check("record has status", "status=201" in msg, msg)
            check("record has latency_ms", "latency_ms=" in msg, msg)
            check("record has request_id", "request_id=trace-abc-123" in msg, msg)
            payload = json.loads(_JsonFormatter().format(rec))
            check("JSON payload carries request_id", payload["request_id"], "trace-abc-123")
            check("JSON payload carries msg", "msg" in payload, True)
    finally:
        request_id_ctx.reset(tok)


def test_non_http_passthrough():
    print("② non-http scope passes through with no access record…")
    _CAPTURE.records.clear()
    seen = {}

    class _LifespanApp:
        async def __call__(self, scope, receive, send):
            seen["called"] = True

    mw = AccessLogMiddleware(_LifespanApp())

    async def run():
        await mw({"type": "lifespan"}, None, None)

    asyncio.run(run())
    check("inner app called", seen.get("called"), True)
    check("no access record", len(_CAPTURE.records) == 0, f"got {len(_CAPTURE.records)}")


def test_install_idempotent():
    print("③ install_access() attaches at most one handler…")
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "access.log")
        # Reset module state and clear prior file handlers (keep _CAPTURE).
        accesslog.LOG_PATH = path
        accesslog._ATTACHED = False
        _ACCESS_LOGGER.handlers[:] = [
            h for h in _ACCESS_LOGGER.handlers
            if not isinstance(h, logging.handlers.RotatingFileHandler)
        ]
        install_access()
        install_access()  # second call must be a no-op
        fhs = [h for h in _ACCESS_LOGGER.handlers
               if isinstance(h, logging.handlers.RotatingFileHandler)]
        check("exactly one access file handler", len(fhs) == 1, f"got {len(fhs)}")
        # And it writes JSON lines for access records only (not other loggers).
        logging.getLogger("numberverse.test").info("must not land on access.log")
        _ACCESS_LOGGER.info("access method=GET path=/x status=200 latency_ms=1.0 request_id=-")
        lines = [l for l in open(path, encoding="utf-8").read().splitlines() if l.strip()]
        check("access.log has one JSON line", len(lines) == 1, f"got {len(lines)}")
        if lines:
            rec = json.loads(lines[0])
            check("line has msg", "msg" in rec, True)
            check("line has request_id", "request_id" in rec, True)
            check("line is INFO", rec["level"], "INFO")


if __name__ == "__main__":
    test_middleware_emits_record()
    test_non_http_passthrough()
    test_install_idempotent()
    print()
    if FAILS:
        print(f"✖ {len(FAILS)} check(s) failed: {FAILS}")
        sys.exit(1)
    print("✓ all accesslog checks passed")
