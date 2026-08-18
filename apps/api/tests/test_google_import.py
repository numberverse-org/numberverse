#!/usr/bin/env python3
"""#1853 — missing `google-auth` dependency → 503, never an unhandled 500.

`auth._verify_google_token` imports google-auth lazily INSIDE its try so the
API boots without the optional dependency. When the package is absent the
ImportError/ModuleNotFoundError used to escape the `except (ValueError,
GoogleAuthError)` and 500 the route. It must now surface the same
"Google sign-in not configured" body as the unset-client-id path (#382), as a
503.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_google_import.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# IMPORTANT: never `import google...` at this module's top level — the lazy
# import inside _verify_google_token is exactly what we are testing.

from app.config import settings  # noqa: E402
from app.routers import auth  # noqa: E402

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


class _BlockGoogleFinder:
    """sys.meta_path hook that makes ANY `import google[.*]` raise ImportError,
    deterministically simulating an environment without the google-auth package
    even when it IS installed on this machine."""

    def find_spec(self, fullname, path=None, target=None):
        if fullname == "google" or fullname.startswith("google."):
            raise ImportError(f"No module named {fullname!r}")
        return None


def _evict_google_modules():
    """Drop already-imported google modules so the in-function lazy import
    actually re-runs through the (blocked) meta path."""
    evicted = [n for n in list(sys.modules)
               if n == "google" or n.startswith("google.")]
    for name in evicted:
        sys.modules.pop(name, None)
    return evicted


def _run():
    print("①  _verify_google_token with google-auth missing → 503 (never 500)…")

    orig_client_id = settings.google_client_id
    evicted = _evict_google_modules()
    finder = _BlockGoogleFinder()
    sys.meta_path.insert(0, finder)
    try:
        settings.google_client_id = "test-client.apps.googleusercontent.com"  # configured, so 503 ≠ the unset-client 501
        from fastapi import HTTPException  # noqa: E402

        try:
            auth._verify_google_token("some.id.token")
            check("missing google-auth → 503", "no error", "HTTPException(503)")
        except HTTPException as e:
            check("missing google-auth → 503", e.status_code, 503)
            check("503 carries the configured-body message",
                  e.detail, "Google sign-in not configured")
        except Exception as e:  # noqa: BLE001
            check("missing google-auth → 503", type(e).__name__, "HTTPException(503)")
    finally:
        sys.meta_path.remove(finder)
        # Restore the evicted modules so nothing else in this process breaks.
        for name in evicted:
            try:
                __import__(name)
            except Exception:  # noqa: BLE001
                pass
        settings.google_client_id = orig_client_id

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES: {fails}")
        sys.exit(1)
    print("✓ all #1853 google-import checks passed")


if __name__ == "__main__":
    _run()