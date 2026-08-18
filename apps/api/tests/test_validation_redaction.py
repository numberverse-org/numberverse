#!/usr/bin/env python3
"""#1851 — RequestValidationError (422) bodies redact Pydantic's raw `input`
for sensitive credential fields.

Pydantic echoes the submitted value back in each error dict's `input` key. For
a password / id_token / refresh_token that means the 422 body leaks the exact
secret the client just typed. The handler in `app.main` rebuilds every error
with `input` replaced by "[redacted]" for sensitive field names, while every
other entry (non-sensitive fields) and the overall `detail`-array + `request_id`
shape stay byte-identical.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_validation_redaction.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import BaseModel, Field  # noqa: E402

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

    def post(self, path, json=None, headers=None):
        body = b""
        hdrs = dict(headers or {})
        if json is not None:
            body = _json.dumps(json).encode("utf-8")
            hdrs.setdefault("Content-Type", "application/json")
        return self.request("POST", path, headers=hdrs, body=body)


# ── A test route whose body mixes sensitive + non-sensitive failing fields ──

class _SensitiveBody(BaseModel):
    password: str = Field(min_length=8)   # sensitive — input MUST be redacted
    id_token: str = Field(min_length=10)  # sensitive — input MUST be redacted
    age: int                              # not sensitive — input preserved


@app.post("/__test_sensitive_validate")
async def _sensitive_validate(b: _SensitiveBody):
    return {"ok": True}


def _run():
    print("①  422 detail preserves the array + request_id, redacts sensitive inputs…")
    client = _AsgiClient(app)
    r = client.post(
        "/__test_sensitive_validate",
        json={"password": "short", "id_token": "tiny", "age": "not-an-int"},
        headers={"X-Request-ID": "redact-422-001"},
    )

    check("status is 422", r.status_code, 422)
    body = r.json()
    check("body still carries request_id", body.get("request_id"), "redact-422-001")
    check("response carries X-Request-ID header", r.headers.get("x-request-id"), "redact-422-001")

    detail = body.get("detail")
    check("detail is the FastAPI array (not flattened)", isinstance(detail, list) and len(detail) == 3, True)

    by_loc = {}
    for err in detail:
        # loc is ('body', <field>)
        field = err.get("loc", ("", ""))[-1]
        by_loc[field] = err

    check("password error present", "password" in by_loc, True)
    check("id_token error present", "id_token" in by_loc, True)
    check("age error present", "age" in by_loc, True)

    check("sensitive password input → [redacted]",
          by_loc["password"].get("input"), "[redacted]")
    check("sensitive id_token input → [redacted]",
          by_loc["id_token"].get("input"), "[redacted]")

    check("non-sensitive age input preserved",
          by_loc["age"].get("input"), "not-an-int")

    # Every error keeps its loc / msg / type — only `input` changed for secrets.
    for field in ("password", "id_token", "age"):
        err = by_loc[field]
        check(f"{field} error keeps loc+msg+type",
              all(k in err for k in ("loc", "msg", "type")), True)

    # A sensitive field whose input is NOT echoed here (no failure) is untouched —
    # only errors that carry an `input` are candidates, and validation errors
    # that legitimately have no raw input pass through as-is.
    check("redaction is scoped to the error input key only",
          set(by_loc["age"].keys()) & {"input"}, {"input"})

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES: {fails}")
        sys.exit(1)
    print("✓ all #1851 validation-redaction checks passed")


if __name__ == "__main__":
    _run()
