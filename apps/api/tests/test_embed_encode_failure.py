#!/usr/bin/env python3
"""#1857 — `embeddings.embed_text` folds the ENCODE step into its failure
guard, so a model that loads but then dies mid-encode returns None (→ the
admin search route's clean 503) instead of an unhandled 500.

Before the fix the `encoder.encode(...)` call sat OUTSIDE the try/except that
covers `_load_encoder`, so a broken/half-downloaded model (or an OOM/CUDA
hiccup) that raised at encode time crashed the route with a 500.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_embed_encode_failure.py
"""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

import app.embeddings as EMB  # noqa: E402
import app.routers.admin as ADMIN  # noqa: E402
from app.schemas import StorySearchIn  # noqa: E402

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


class _FailingEncoder:
    """Loads fine, then dies exactly where the bug used to crash: `.encode()`."""

    def encode(self, *args, **kwargs):
        raise RuntimeError("model blew up mid-encode")


class _Vec:
    def tolist(self):
        return [0.1, 0.2, 0.3]


class _Encoded:
    def __getitem__(self, _i):
        return _Vec()


class _GoodEncoder:
    def encode(self, *args, **kwargs):
        return _Encoded()


class _NoopDB:
    async def scalar(self, stmt):
        return None

    async def execute(self, stmt):
        class _R:
            def all(self):
                return []
        return _R()


async def _run():
    print("①  embed_text — an encoder that fails at encode() → None, not a crash…")
    orig_encoder = EMB._encoder
    EMB._encoder = _FailingEncoder()
    try:
        vec = EMB.embed_text("hello kid")
        check("encode failure returns None (not an exception)", vec, None)
    finally:
        EMB._encoder = orig_encoder

    print("②  embed_text — a healthy encoder still returns the vector…")
    EMB._encoder = _GoodEncoder()
    try:
        vec = EMB.embed_text("hello kid")
        check("healthy encoder returns the vector", vec, [0.1, 0.2, 0.3])
    finally:
        EMB._encoder = None

    print("③  admin search — embed_text None → the clean 503 (end-to-end)…")
    orig_have, orig_se, orig_embed = ADMIN.HAVE_VECTOR, ADMIN.StoryEmbedding, EMB.embed_text
    try:
        # Force the route past its first (pgvector) gate so the encode-failure
        # branch is the one under test, and stub embed_text to return None —
        # exactly what the fixed function returns when encode dies.
        ADMIN.HAVE_VECTOR = True
        ADMIN.StoryEmbedding = object()
        EMB.embed_text = lambda q: None
        try:
            await ADMIN.search_stories(
                StorySearchIn(query="stuck on place value", top_k=3),
                SimpleNamespace(id="admin-1"),
                _NoopDB(),
                _limiter=None,
            )
            check("encode failure maps to 503", "no error", "HTTPException(503)")
        except HTTPException as e:
            check("encode failure maps to 503", e.status_code, 503)
            check("503 names the unavailable model",
                  e.detail, "semantic search unavailable: embedding model not installed")
    finally:
        ADMIN.HAVE_VECTOR, ADMIN.StoryEmbedding, EMB.embed_text = orig_have, orig_se, orig_embed

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES: {fails}")
        sys.exit(1)
    print("✓ all #1857 embed-encode-failure checks passed")


if __name__ == "__main__":
    import asyncio

    asyncio.run(_run())