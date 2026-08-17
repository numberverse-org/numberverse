#!/usr/bin/env python3
"""#1748 — `/health` must probe real dependencies, not return a static "ok".

The endpoint is healthy only when:
  ① the database answers `SELECT 1` inside the probe timeout, AND
  ② the background embed/prune loop is heartbeating (task alive + last pass
     within the tolerance window).

Any failure returns HTTP 503 with the failing check named, so the uptime
monitor / deploy smoke (which grep the body for `"status":"ok"`) flag a dead
API instead of trusting nginx's 200 shell.

Run:  cd apps/api && python3 tests/test_health_probe.py
"""
import asyncio
import json
import sys
import time
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import main as main_mod  # noqa: E402
from app.main import app  # noqa: E402


# ── Dependency-free ASGI harness (same as test_request_id.py) ───────────────

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


# ── Fakes ───────────────────────────────────────────────────────────────────

class _FakeSession:
    """Async context manager standing in for SessionLocal() — execute() can
    succeed or raise, letting the probe exercise both branches without a DB."""

    def __init__(self, ok: bool):
        self._ok = ok

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, *args, **kwargs):
        if not self._ok:
            raise RuntimeError("fake: database unreachable")
        return None


class _FakeTask:
    """Minimal stand-in for the embed asyncio.Task: only `.done()` is read."""

    def __init__(self, done: bool):
        self._done = done

    def done(self):
        return self._done


def _healthy_world():
    """Patch main so the probe sees a green DB + a live, freshly-ticking loop."""
    patches = [
        mock.patch.object(main_mod, "SessionLocal", lambda: _FakeSession(ok=True)),
        mock.patch.object(main_mod, "_embed_task", _FakeTask(done=False)),
        mock.patch.object(main_mod, "_embed_heartbeat", time.monotonic()),
    ]
    for p in patches:
        p.start()
    return patches


def _run_health():
    resp = client.get("/health")
    return resp.status_code, resp.json()


# ── Tests ───────────────────────────────────────────────────────────────────

def test_healthy():
    print("① all green → 200 ok, both checks ok")
    patches = _healthy_world()
    try:
        status, body = _run_health()
        check("status 200", status == 200, f"got {status}")
        check("body status ok", body.get("status") == "ok", str(body))
        check("database ok", body.get("checks", {}).get("database") == "ok", str(body))
        check("background_jobs ok", body.get("checks", {}).get("background_jobs") == "ok", str(body))
        check("service named", body.get("service") == "numberverse-api", str(body))
    finally:
        for p in patches:
            p.stop()


def test_db_down():
    print("② DB unreachable → 503 degraded, database named")
    patches = [
        mock.patch.object(main_mod, "SessionLocal", lambda: _FakeSession(ok=False)),
        mock.patch.object(main_mod, "_embed_task", _FakeTask(done=False)),
        mock.patch.object(main_mod, "_embed_heartbeat", time.monotonic()),
    ]
    for p in patches:
        p.start()
    try:
        status, body = _run_health()
        check("status 503", status == 503, f"got {status}")
        check("body status degraded", body.get("status") == "degraded", str(body))
        check("database unreachable", body.get("checks", {}).get("database") == "unreachable", str(body))
        check("no status:ok in body", '"status":"ok"' not in json.dumps(body), str(body))
    finally:
        for p in patches:
            p.stop()


def test_embed_task_stopped():
    print("③ background loop stopped → 503 degraded, background_jobs named")
    patches = [
        mock.patch.object(main_mod, "SessionLocal", lambda: _FakeSession(ok=True)),
        mock.patch.object(main_mod, "_embed_task", _FakeTask(done=True)),
    ]
    for p in patches:
        p.start()
    try:
        status, body = _run_health()
        check("status 503", status == 503, f"got {status}")
        check("background_jobs stopped", body.get("checks", {}).get("background_jobs") == "stopped", str(body))
        check("no status:ok in body", '"status":"ok"' not in json.dumps(body), str(body))
    finally:
        for p in patches:
            p.stop()


def test_embed_task_not_started():
    print("④ loop never started (task None) → 503 degraded")
    patches = [
        mock.patch.object(main_mod, "SessionLocal", lambda: _FakeSession(ok=True)),
        mock.patch.object(main_mod, "_embed_task", None),
    ]
    for p in patches:
        p.start()
    try:
        status, body = _run_health()
        check("status 503", status == 503, f"got {status}")
        check("background_jobs not-started", body.get("checks", {}).get("background_jobs") == "not-started", str(body))
    finally:
        for p in patches:
            p.stop()


def test_embed_heartbeat_stale():
    print("⑤ task alive but heartbeat ancient → 503 degraded (stalled)")
    # interval 15 min × 3 = 45 min tolerance → an hour-old heartbeat is stale.
    patches = [
        mock.patch.object(main_mod, "SessionLocal", lambda: _FakeSession(ok=True)),
        mock.patch.object(main_mod, "_embed_task", _FakeTask(done=False)),
        mock.patch.object(main_mod, "_embed_heartbeat", time.monotonic() - 3600),
    ]
    for p in patches:
        p.start()
    try:
        status, body = _run_health()
        check("status 503", status == 503, f"got {status}")
        check("background_jobs stalled", body.get("checks", {}).get("background_jobs") == "stalled", str(body))
    finally:
        for p in patches:
            p.stop()


def test_db_probe_never_raises():
    print("⑥ probe raises inside the endpoint → 503, not 500")
    patches = [
        mock.patch.object(main_mod, "SessionLocal", lambda: _FakeSession(ok=False)),
        mock.patch.object(main_mod, "_embed_task", _FakeTask(done=False)),
        mock.patch.object(main_mod, "_embed_heartbeat", time.monotonic()),
    ]
    for p in patches:
        p.start()
    try:
        status, body = _run_health()
        check("status 503 (not 500)", status == 503, f"got {status}")
        check("checks present", "checks" in body, str(body))
    finally:
        for p in patches:
            p.stop()


# ── Runner ──────────────────────────────────────────────────────────────────

def main():
    test_healthy()
    test_db_down()
    test_embed_task_stopped()
    test_embed_task_not_started()
    test_embed_heartbeat_stale()
    test_db_probe_never_raises()
    print()
    if FAILS:
        print(f"✖ {len(FAILS)} check(s) failed: {FAILS}")
        sys.exit(1)
    print("✓ all health-probe checks passed")


if __name__ == "__main__":
    main()
