#!/usr/bin/env python3
"""#1771 — non-dev secret guard must reject weak/short/reused secrets.

Standalone subprocess tests (no pytest, no Postgres).  Each case boots a child
Python process that imports `app.config` under a chosen NV_ENVIRONMENT with
chosen secrets.  Because Settings() reads `.env` at import time, each child runs
from a throwaway directory with a scrubbed environment so the repo's live dev
`.env` can never leak into a production-guard test.

Run:  cd apps/api && python3 tests/test_config_guard.py
"""
import os
import secrets
import string
import subprocess
import sys
import tempfile
from pathlib import Path

API_DIR = str(Path(__file__).resolve().parents[1])

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def _child_python():
    """Pick a Python that can import pydantic_settings (venv-aware)."""
    # If we're already running inside the venv, use that interpreter.
    probe = subprocess.run(
        [sys.executable, "-c", "import pydantic_settings"],
        capture_output=True,
        text=True,
    )
    if probe.returncode == 0:
        return sys.executable
    # Fall back to the repo venv (when the outer process was NOT started by it).
    venv_py = os.path.join(API_DIR, ".venv", "bin", "python3")
    if os.path.exists(venv_py):
        return venv_py
    return sys.executable


def _child_result(env_overrides):
    """Run app.config in a clean child; return (status, stderr).

    `status` is START_OK / REFUSED / ERROR / EMPTY; `stderr` is the raw child
    stderr so tests can assert on the #1778 bind-host warning text.
    """
    code = (
        "import sys\n"
        f"sys.path.insert(0, {API_DIR!r})\n"
        "try:\n"
        "    import app.config\n"
        "    print('START_OK')\n"
        "except RuntimeError as e:\n"
        "    print('REFUSED:' + str(e))\n"
        "except Exception as e:\n"
        "    print('ERROR:' + type(e).__name__ + ':' + str(e))\n"
    )
    clean = {k: v for k, v in os.environ.items() if not k.startswith("NV_")}
    clean.update(env_overrides)
    # Ensure .env cannot be picked up: run from an empty temp dir.
    with tempfile.TemporaryDirectory() as tmp:
        result = subprocess.run(
            [_child_python(), "-c", code],
            env=clean,
            capture_output=True,
            text=True,
            cwd=tmp,
        )
    out = result.stdout.strip()
    if out.startswith("START_OK"):
        status = "START_OK"
    elif out.startswith("REFUSED:"):
        status = "REFUSED"
    else:
        status = out or f"EMPTY (stderr={result.stderr.strip()!r})"
    return status, result.stderr


def _child(env_overrides):
    """Run app.config in a clean child and return START_OK / REFUSED / ERROR."""
    return _child_result(env_overrides)[0]


def _strong_password():
    """A >=12 char password with lower+upper+digit+symbol."""
    return "Nv7!zQ" + secrets.token_urlsafe(8)


def _strong_secret():
    """A >=32 char random secret with lower+upper+digit+symbol."""
    pool = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(pool) for _ in range(48))


def _strong_db_url():
    """A DB URL whose password is strong and NOT the dev placeholder (#1780)."""
    return "postgresql+psycopg://numberverse:" + secrets.token_urlsafe(16) + "@db:5432/numberverse"


print("①  Production + 1-char JWT secret → refuses to start…")
check(
    "NV_JWT_SECRET=x refused",
    _child({
        "NV_ENVIRONMENT": "production",
        "NV_JWT_SECRET": "x",
        "NV_ADMIN_PASSWORD": _strong_password(),
        "NV_DEMO_PASSWORD": _strong_password(),
    }),
    "REFUSED",
)

print("②  Production + leaked dev JWT secret → refuses to start…")
check(
    "numberverse-dev-secret-change-me refused",
    _child({
        "NV_ENVIRONMENT": "production",
        "NV_JWT_SECRET": "numberverse-dev-secret-change-me",
        "NV_ADMIN_PASSWORD": _strong_password(),
        "NV_DEMO_PASSWORD": _strong_password(),
    }),
    "REFUSED",
)

print("③  Production + 1-char admin password → refuses to start…")
check(
    "1-char NV_ADMIN_PASSWORD refused",
    _child({
        "NV_ENVIRONMENT": "production",
        "NV_JWT_SECRET": _strong_secret(),
        "NV_ADMIN_PASSWORD": "x",
        "NV_DEMO_PASSWORD": _strong_password(),
    }),
    "REFUSED",
)

print("④  Production + strong 48-char random secret + strong passwords → starts…")
strong = _strong_secret()
check(
    "strong secrets accepted",
    _child({
        "NV_ENVIRONMENT": "production",
        "NV_JWT_SECRET": strong,
        "NV_ADMIN_PASSWORD": _strong_password(),
        "NV_DEMO_PASSWORD": _strong_password(),
        # #1780 — the built-in dev DB password refuses outside dev, so a valid
        # production boot also needs a strong DB password in the URL.
        "NV_DATABASE_URL": _strong_db_url(),
    }),
    "START_OK",
)

print("⑤  NV_ENVIRONMENT=dev with built-in defaults → starts…")
check(
    "dev defaults accepted",
    _child({"NV_ENVIRONMENT": "dev"}),
    "START_OK",
)

print("⑥  Production + strong 48-char HEX JWT (2 classes) → starts (entropy, not class count)…")
check(
    "hex JWT accepted (regression: class-count rejected strong hex keys)",
    _child({
        "NV_ENVIRONMENT": "production",
        "NV_JWT_SECRET": secrets.token_hex(24),  # 48 hex chars, only 2 classes, 192+ bits
        "NV_ADMIN_PASSWORD": _strong_password(),
        "NV_DEMO_PASSWORD": _strong_password(),
        # #1780 — see ④: a production boot needs a non-dev DB password too.
        "NV_DATABASE_URL": _strong_db_url(),
    }),
    "START_OK",
)

print("⑦  Production + 32x'a' JWT → refuses (length ok, ~0 entropy)…")
check(
    "repeated-char JWT refused",
    _child({
        "NV_ENVIRONMENT": "production",
        "NV_JWT_SECRET": "a" * 32,
        "NV_ADMIN_PASSWORD": _strong_password(),
        "NV_DEMO_PASSWORD": _strong_password(),
    }),
    "REFUSED",
)

print("⑧  Production + dev DB password in NV_DATABASE_URL → refuses (#1780)…")
check(
    "dev DB password refused outside dev",
    _child({
        "NV_ENVIRONMENT": "production",
        "NV_JWT_SECRET": _strong_secret(),
        "NV_ADMIN_PASSWORD": _strong_password(),
        "NV_DEMO_PASSWORD": _strong_password(),
        "NV_DATABASE_URL": "postgresql+psycopg://numberverse:numberverse_dev@db:5432/numberverse",
    }),
    "REFUSED",
)

print("⑨  NV_ENVIRONMENT unset (dev default) + non-localhost CORS → refuses (#1778)…")
check(
    "dev default + non-loopback CORS refused",
    _child({
        "NV_CORS_ORIGINS": "http://localhost:3000,https://kids.example.com",
    }),
    "REFUSED",
)

print("⑩  NV_ENVIRONMENT unset (dev default) + localhost-only CORS → starts…")
check(
    "dev default + localhost-only CORS starts",
    _child({
        "NV_CORS_ORIGINS": "http://localhost:3000,http://127.0.0.1:8000",
    }),
    "START_OK",
)

print("⑪  NV_ENVIRONMENT=dev + NV_BIND_HOST=0.0.0.0 + localhost CORS → starts AND warns…")
_status, _stderr = _child_result({
    "NV_ENVIRONMENT": "dev",
    "NV_BIND_HOST": "0.0.0.0",
    "NV_CORS_ORIGINS": "http://localhost:3000",
})
check("dev + 0.0.0.0 bind starts", _status, "START_OK")
check(
    "dev + 0.0.0.0 bind warns on stderr",
    "dev JWT secret and default admin/demo passwords are LIVE" in _stderr,
    True,
)

print("⑫  Production + strong secrets + strong DB password URL → starts…")
check(
    "production + strong DB password accepted",
    _child({
        "NV_ENVIRONMENT": "production",
        "NV_JWT_SECRET": _strong_secret(),
        "NV_ADMIN_PASSWORD": _strong_password(),
        "NV_DEMO_PASSWORD": _strong_password(),
        "NV_DATABASE_URL": _strong_db_url(),
    }),
    "START_OK",
)

print()
if fails:
    print(f"✖ {len(fails)} FAILURES")
    sys.exit(1)
print("✓ non-dev secret guard rejects weak/short/reused secrets")
