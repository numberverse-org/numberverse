#!/usr/bin/env python3
"""Standalone tests for the auth-surface hardening wave (#1669 #1673 #1675 #1676 #1672).

No pytest, no Postgres. Covers:
  ① #1675 — bcrypt 72-BYTE password-cap enforcement:
     - `security.password_bytes_ok` handles plain vs multi-byte inputs;
     - the four password-INPUT routes (signup / change-password / set-password /
       delete-account) reject an over-long input with a 422
       {"detail":"Password too long (max 72 bytes)"} BEFORE any bcrypt work;
  ② #1669/#1676 — per-IP rate limits wired on /auth/google (20/min) and
     /auth/set-password (10/min), keyed as ip:google / ip:set-password;
  ③ #1672 — SameOriginAuthMiddleware rejects a state-changing /auth/ request
     whose present Origin is neither same-origin nor a configured CORS origin,
     while leaving GETs, non-auth paths, Origin-less clients and preflights alone;
  ④ #1673 — the CORS middleware allows exactly the methods/headers the API
     exposes and the clients send (no wildcard allow_methods/allow_headers).

Run:  cd apps/api && python3 tests/test_auth_hardening.py
"""
import asyncio
import inspect
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

import app.ratelimit as rl  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import SameOriginAuthMiddleware, app  # noqa: E402
from app.routers import auth  # noqa: E402
from app.schemas import (  # noqa: E402
    ChangePasswordIn,
    DeleteAccountIn,
    SetPasswordIn,
    SignupIn,
)
from app.security import password_bytes_ok  # noqa: E402

FAILS = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        FAILS.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


async def expect_http(name, coro, status_code):
    try:
        result = await coro
    except HTTPException as e:
        check(name, e.status_code, status_code)
        return e
    except Exception as e:  # noqa: BLE001
        check(name, type(e).__name__, f"HTTPException({status_code})")
        return None
    check(name, "no error", f"HTTPException({status_code})")
    return result


# ── Minimal fakes (the byte checks fire before any DB / bcrypt work) ────────

class _DummyDB:
    """Never touched by the byte-check paths (the 422 raises first). For the
    "valid password still flows" case, `scalar` returns an existing profile so
    signup reaches its duplicate-email branch (409) — proving the byte check
    did NOT pre-trigger."""

    async def scalar(self, *a, **k):
        return SimpleNamespace(id=uuid.uuid4(), auth_provider="local")

    async def scalars(self, *a, **k):
        return []

    async def commit(self, *a, **k):
        return None


def _req():
    return SimpleNamespace(
        client=SimpleNamespace(host="1.2.3.4"),
        headers={},
        state=SimpleNamespace(session=None),
    )


def _local_profile():
    return SimpleNamespace(id=uuid.uuid4(), auth_provider="local")


# ═════════════════════════════════════════════════════════════════════════
# ① #1675 — 72-BYTE password cap
# ═════════════════════════════════════════════════════════════════════════

def test_1675_password_bytes_ok():
    print("① #1675 password_bytes_ok (bcrypt reads 72 BYTES, not chars)…")
    check("72 ASCII bytes ok", password_bytes_ok("a" * 72), True)
    check("73 ASCII bytes rejected", password_bytes_ok("a" * 73), False)
    check("72-byte multi-byte ok ('😀'×18 = 72B)", password_bytes_ok("😀" * 18), True)
    check("76-byte multi-byte rejected ('😀'×19 = 76B)", password_bytes_ok("😀" * 19), False)
    check("empty ok (min_length handled elsewhere)", password_bytes_ok(""), True)


async def test_1675_route_422s():
    print("① #1675 route-level bytes 422 (before any bcrypt/Google)…")
    # signup — a 72-CHAR multibyte password ("A1😀"×18) passes the schema's char
    # cap AND the complexity policy (upper+digit+symbol) but is 108 BYTES; the
    # route must reject it with the clear 422.
    e = await expect_http(
        "signup >72-byte password → 422",
        auth.signup(
            SignupIn(email="long@test.com", password="A1😀" * 18, display_name="P"),
            _req(),
            _DummyDB(),
            _signup_limit=None,
        ),
        422,
    )
    check("signup 422 detail", e.detail, "Password too long (max 72 bytes)")
    # …while a valid password still flows past the byte check (it would 409
    # on the DB lookup, proving the byte check did NOT pre-trigger).
    await expect_http(
        "signup valid password reaches DB lookup (email dup) → 409 not 422",
        auth.signup(
            SignupIn(email="dup@test.com", password="Password1!", display_name="P"),
            _req(),
            _DummyDB(),
            _signup_limit=None,
        ),
        409,
    )
    # change-password: both current (bcrypt-CHECKED) and new (bcrypt-HASHED).
    # current_password is VERIFY-only: 72 emoji chars pass max_length (chars) but
    # are 288 bytes → the route's byte check rejects it as the 422.
    e2 = await expect_http(
        "change-password >72-byte current_password → 422",
        auth.change_password(
            ChangePasswordIn(current_password="😀" * 72, new_password="NewPass456!"),
            _req(),
            _local_profile(),
            _DummyDB(),
        ),
        422,
    )
    check("change-password current detail", e2.detail, "Password too long (max 72 bytes)")
    e3 = await expect_http(
        "change-password >72-byte new_password → 422",
        auth.change_password(
            ChangePasswordIn(current_password="oldpass123", new_password="A1😀" * 18),
            _req(),
            _local_profile(),
            _DummyDB(),
        ),
        422,
    )
    check("change-password new detail", e3.detail, "Password too long (max 72 bytes)")
    # set-password: recovery path — rejected before the Google token verify.
    e4 = await expect_http(
        "set-password >72-byte new_password → 422 (before Google verify)",
        auth.set_password(
            SetPasswordIn(id_token="x" * 10, new_password="A1😀" * 18),
            _DummyDB(),
            _set_password_limit=None,
        ),
        422,
    )
    check("set-password detail", e4.detail, "Password too long (max 72 bytes)")
    # delete-account: confirmation password is bcrypt-CHECKED for local accounts.
    e5 = await expect_http(
        "delete-account >72-byte password → 422",
        auth.delete_account(
            DeleteAccountIn(confirmation="delete my account", password="😀" * 72),
            _req(),
            _local_profile(),
            _DummyDB(),
        ),
        422,
    )
    check("delete-account detail", e5.detail, "Password too long (max 72 bytes)")


# ═════════════════════════════════════════════════════════════════════════
# ② #1669/#1676 — per-IP rate limits on /auth/google and /auth/set-password
# ═════════════════════════════════════════════════════════════════════════

async def test_1669_1676_rate_limits():
    print("② #1669/#1676/#3109 per-IP limits wired on /auth/google (10) + set-password (10)…")
    check("_GOOGLE_RATE_LIMIT is a callable dep", callable(auth._GOOGLE_RATE_LIMIT), True)
    check("_SET_PASSWORD_RATE_LIMIT is a callable dep", callable(auth._SET_PASSWORD_RATE_LIMIT), True)
    # Wiring is visible on the route signatures (FastAPI resolves the dep in DI).
    check(
        "google_auth carries _google_limit dep",
        "_google_limit" in inspect.signature(auth.google_auth).parameters,
        True,
    )
    check(
        "set_password carries _set_password_limit dep",
        "_set_password_limit" in inspect.signature(auth.set_password).parameters,
        True,
    )

    calls = []

    async def _allow(db, key, limit, window_seconds):
        calls.append((key, limit, window_seconds))
        return True

    def _quiet_log(kind, key, limit, window_seconds):  # sync — `_log_429` is not awaited
        pass

    orig_allow, orig_log = rl._allow_fixed_window, rl._log_429
    rl._allow_fixed_window, rl._log_429 = _allow, _quiet_log
    try:
        await auth._GOOGLE_RATE_LIMIT(_req(), _DummyDB())
        await auth._SET_PASSWORD_RATE_LIMIT(_req(), _DummyDB())
    finally:
        rl._allow_fixed_window, rl._log_429 = orig_allow, orig_log

    # #3109 — /auth/google auto-creates accounts on first login, so it must share
    # signup's 10/min cap (was 20/min before #3109).
    check("google keyed ip:google:<ip>, limit 10",
          calls[0], ("ip:google:1.2.3.4", 10, 60))
    check("set-password keyed ip:set-password:<ip>, limit 10",
          calls[1], ("ip:set-password:1.2.3.4", 10, 60))

    # Breached bucket → 429, even before any route body runs.
    async def _deny(db, key, limit, window_seconds):
        return False

    rl._allow_fixed_window = _deny
    rl._log_429 = _quiet_log
    try:
        await expect_http(
            "google limit exceeded → 429",
            auth._GOOGLE_RATE_LIMIT(_req(), _DummyDB()),
            429,
        )
    finally:
        rl._allow_fixed_window = orig_allow


# ═════════════════════════════════════════════════════════════════════════
# ③ #1672 — SameOriginAuthMiddleware defense-in-depth
# ═════════════════════════════════════════════════════════════════════════

class _OK:
    """Downstream app that always returns 200 — proves the request flowed through."""

    async def __call__(self, scope, receive, send):
        body = b'{"ok":true}'
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"application/json")],
        })
        await send({"type": "http.response.body", "body": body})


class _Resp:
    def __init__(self, status, headers, body):
        self.status_code = status
        self.headers = headers
        self.body = body

    def json(self):
        import json as _j
        return _j.loads(self.body.decode("utf-8"))


class _Client:
    """Minimal ASGI driver (Host header defaults to testserver, like test_request_id)."""

    def __init__(self, app):
        self._app = app

    def request(self, method, path, headers=None):
        hdrs = [(k.lower().encode(), v.encode("latin-1")) for k, v in (headers or {}).items()]
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
        received = sent = False

        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": b"", "more_body": False}
            return {"type": "http.disconnect"}

        async def send(message):
            nonlocal sent
            if message["type"] == "http.response.start":
                resp.status_code = message["status"]
                resp.headers = {
                    k.decode("latin-1"): v.decode("latin-1")
                    for k, v in message["headers"]
                }
            elif message["type"] == "http.response.body":
                resp.body += message.get("body", b"")
                sent = True

        async def run():
            try:
                await self._app(scope, receive, send)
            except Exception:
                if resp.status_code == 0:
                    raise

        asyncio.run(run())
        return resp


def test_1672_same_origin_middleware():
    print("③ #1672 SameOriginAuthMiddleware…")
    client = _Client(SameOriginAuthMiddleware(_OK()))

    # Same-origin: Origin matches the request's own scheme://Host → allowed.
    r = client.request("POST", "/api/v1/auth/login", {"Origin": "http://testserver"})
    check("same-origin state-changing POST → 200", r.status_code, 200)
    # Configured CORS origin (the LAN/dev portal allow-list) → allowed.
    r = client.request("POST", "/api/v1/auth/login", {"Origin": "http://localhost:3000"})
    check("configured CORS origin POST → 200", r.status_code, 200)
    # Behind a proxy: X-Forwarded-Proto https + Origin https://testserver → same-origin.
    r = client.request(
        "POST", "/api/v1/auth/login",
        {"Origin": "https://testserver", "X-Forwarded-Proto": "https"},
    )
    check("proxy-proto same-origin POST → 200", r.status_code, 200)
    # Cross-origin attacker Origin on a state-changing /auth/ POST → rejected 403.
    r = client.request("POST", "/api/v1/auth/login", {"Origin": "https://evil.example"})
    check("cross-origin state-changing POST → 403", r.status_code, 403)
    check("403 detail echoes a clear message",
          r.json().get("detail"), "Cross-origin request rejected")
    # The browser sandbox Origin "null" is not a trusted origin → rejected.
    r = client.request("POST", "/api/v1/auth/login", {"Origin": "null"})
    check("Origin:null state-changing POST → 403", r.status_code, 403)
    # No Origin header (curl / native) → allowed, non-breaking.
    r = client.request("POST", "/api/v1/auth/login", {})
    check("no Origin (curl/native) POST → 200", r.status_code, 200)
    # GET/read endpoints are NOT checked (no state change → no CSRF risk).
    r = client.request("GET", "/api/v1/auth/me", {"Origin": "https://evil.example"})
    check("cross-origin GET /auth/me → 200 (not checked)", r.status_code, 200)
    # Non-auth paths are out of scope.
    r = client.request("POST", "/api/v1/kids", {"Origin": "https://evil.example"})
    check("cross-origin POST /api/v1/kids → 200 (out of scope)", r.status_code, 200)
    # OPTIONS preflights pass through untouched (CORS owns those).
    r = client.request("OPTIONS", "/api/v1/auth/login", {"Origin": "https://evil.example"})
    check("cross-origin OPTIONS preflight → 200 (passes through)", r.status_code, 200)


# ═════════════════════════════════════════════════════════════════════════
# ④ #1673 — CORS methods/headers tightened (no wildcards)
# ═════════════════════════════════════════════════════════════════════════

def test_1673_cors_config():
    print("④ #1673 CORS allow_methods/allow_headers tightened…")
    cors_opts = None
    for m in app.user_middleware:
        if m.cls is CORSMiddleware:
            cors_opts = m.kwargs
    check("CORSMiddleware is registered", cors_opts is not None, True)
    check("allow_methods == the exact route set",
          cors_opts["allow_methods"], ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    check("no wildcard allow_methods", "*" in cors_opts["allow_methods"], False)
    check("allow_headers == client-sent set",
          set(cors_opts["allow_headers"]),
          {"Content-Type", "Authorization", "X-Request-ID", "X-Org-ID"})
    check("no wildcard allow_headers", "*" in cors_opts["allow_headers"], False)
    check("expose_headers includes Content-Range / X-Total-Count / X-Request-ID",
          set(cors_opts["expose_headers"]),
          {"Content-Range", "X-Total-Count", "X-Request-ID"})
    check("allow_origins unchanged (the configured allow-list)",
          cors_opts["allow_origins"], settings.origins)


# ═════════════════════════════════════════════════════════════════════════
# ⑤ #2934/#2939/#2941/#2944/#2940 — auth-hardening cluster (password policy,
#    length caps, signup-enumeration leak, login-lockout DoS)
# ═════════════════════════════════════════════════════════════════════════

def test_2934_password_complexity_schema():
    print("⑤ #2934 password-complexity policy (schema boundary)…")
    from pydantic import ValidationError

    def _rejected(label, pw):
        try:
            SignupIn(email="a@b.co", password=pw)
            check(label, "accepted", "rejected (ValidationError)")
        except ValidationError:
            check(label, "rejected", "rejected")
        except Exception as e:  # noqa: BLE001
            check(label, type(e).__name__, "ValidationError")

    # The two spec "Done when" cases: 'aaaaaaaa' and 8 spaces.
    _rejected("'aaaaaaaa' (1 class) rejected", "aaaaaaaa")
    _rejected("8 spaces (whitespace-only) rejected", "        ")
    # Other weak shapes that the old min_length=8 let through.
    _rejected("'password1' (lower+digit = 2 classes) rejected", "password1")
    _rejected("'Password' (upper+lower = 2 classes) rejected", "Password")
    _rejected("8 chars all-lowercase rejected", "abcdefgh")
    # Strong shapes still accepted (3 of 4 classes).
    SignupIn(email="a@b.co", password="Password1!")  # 4 classes
    SignupIn(email="a@b.co", password="Abc123xyz")   # upper+lower+digit = 3
    SignupIn(email="a@b.co", password="Abcdef!!")    # upper+lower+symbol = 3
    check("Password1! accepted", True, True)
    # Same policy on change-password + set-password NEW secrets.
    ChangePasswordIn(current_password="oldpass123", new_password="Password1!")
    SetPasswordIn(id_token="x" * 10, new_password="Password1!")
    check("change/set-password new_password accepts strong", True, True)
    # …but NOT on the VERIFY-only fields (legacy weak passwords must still verify).
    from app.schemas import LoginIn  # LoginIn.password has no complexity validator
    LoginIn(email="a@b.co", password="password123")
    ChangePasswordIn(current_password="password123", new_password="Password1!")
    check("verify-only fields still accept weak legacy passwords", True, True)


def test_2939_current_password_max_length():
    print("⑤ #2939 current_password is capped like every other password field…")
    from pydantic import ValidationError
    # A 10 KB current_password must be rejected at the schema boundary (422),
    # not accepted through to bcrypt (which would 401/500 on >72-byte inputs).
    big = "a" * (10 * 1024)
    try:
        ChangePasswordIn(current_password=big, new_password="Password1!")
        check("10 KB current_password → 422", "accepted", "rejected (ValidationError)")
    except ValidationError:
        check("10 KB current_password → 422", "rejected", "rejected")
    # 72 chars is still fine; 73 is rejected (char cap, like every other field).
    ChangePasswordIn(current_password="a" * 72, new_password="Password1!")
    try:
        ChangePasswordIn(current_password="a" * 73, new_password="Password1!")
        check("73-char current_password rejected", "accepted", "rejected")
    except ValidationError:
        check("73-char current_password rejected", "rejected", "rejected")


def test_2944_signup_display_name_bounded():
    print("⑤ #2944 signup display_name bounded at 80 chars (matches PATCH /auth/me)…")
    from pydantic import ValidationError
    # 500-char display_name must be rejected with 422 (schema boundary).
    try:
        SignupIn(email="a@b.co", password="Password1!", display_name="x" * 500)
        check("500-char display_name → 422", "accepted", "rejected (ValidationError)")
    except ValidationError:
        check("500-char display_name → 422", "rejected", "rejected")
    # 80 chars is the ceiling (PARENT_NAME_MAX_LENGTH).
    SignupIn(email="a@b.co", password="Password1!", display_name="x" * 80)
    check("80-char display_name accepted", True, True)


async def test_2941_signup_no_enumeration():
    print("⑤ #2941 signup does not leak email registration…")
    # Both the pre-lookup duplicate and the IntegrityError race use the SAME
    # generic body, so a second signup for a known email is indistinguishable
    # from a generic failure.
    check("_SIGNUP_CONFLICT_MESSAGE is generic", "registered" not in auth._SIGNUP_CONFLICT_MESSAGE.lower(), True)
    class _DupDB:
        async def scalar(self, *a, **k):
            return SimpleNamespace(id=uuid.uuid4(), auth_provider="local")  # email exists
    e = await expect_http(
        "duplicate signup → 409 generic body",
        auth.signup(
            SignupIn(email="victim@test.com", password="Password1!", display_name="V"),
            _req(),
            _DupDB(),
            _signup_limit=None,
        ),
        409,
    )
    check("duplicate body indistinguishable (no 'registered'/'email')",
          "registered" not in e.detail.lower() and "email" not in e.detail.lower(), True)


def test_2940_login_lockout_ip_cap():
    print("⑤ #2940/#3112 login lockout per-IP cap is wired…")
    # #3112 already caps distinct victim-emails a single IP can lock to 3/hour.
    # Verify the constant + wiring are in place (login passes ip + cap to the guard).
    check("_MAX_LOCKOUTS_PER_IP_PER_HOUR == 3", auth._MAX_LOCKOUTS_PER_IP_PER_HOUR, 3)
    import inspect
    sig = inspect.signature(auth._LOGIN_GUARD.record_failure)
    check("record_failure accepts max_distinct_lockouts", "max_distinct_lockouts" in sig.parameters, True)
    check("record_failure accepts ip", "ip" in sig.parameters, True)
    # The login handler threads them through (source-level assertion).
    import app.routers.auth as auth_mod
    src = inspect.getsource(auth_mod.login)
    check("login calls record_failure with ip", "ip=ip" in src, True)
    check("login calls record_failure with the hour cap", "max_distinct_lockouts=_MAX_LOCKOUTS_PER_IP_PER_HOUR" in src, True)


def _run():
    test_1675_password_bytes_ok()
    asyncio.run(test_1675_route_422s())
    asyncio.run(test_1669_1676_rate_limits())
    test_1672_same_origin_middleware()
    test_1673_cors_config()
    test_2934_password_complexity_schema()
    test_2939_current_password_max_length()
    test_2944_signup_display_name_bounded()
    asyncio.run(test_2941_signup_no_enumeration())
    test_2940_login_lockout_ip_cap()
    print()
    if FAILS:
        print(f"✖ {len(FAILS)} check(s) failed: {FAILS}")
        sys.exit(1)
    print("✓ all auth-hardening checks passed")


if __name__ == "__main__":
    _run()
