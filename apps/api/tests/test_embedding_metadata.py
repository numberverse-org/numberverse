#!/usr/bin/env python3
"""#329-fix — `story_embeddings` must live OUTSIDE `Base.metadata`.

The pgvector `story_embeddings` table uses a server-side `vector` type that
postgres:16-alpine does NOT ship. If it were registered on `Base.metadata`,
the startup `Base.metadata.create_all` would try to CREATE it and crash the
whole API boot with `type "vector" does not exist` — even though the embed job
(which also needs the optional sentence-transformers stack) is gracefully
disabled. This locks the invariant that the table is on its own metadata.

Run:
    cd apps/api && python3 tests/test_embedding_metadata.py
"""
import os
import subprocess
import sys
from pathlib import Path

API_DIR = str(Path(__file__).resolve().parents[1])


def _venv_python() -> str:
    probe = subprocess.run(
        [sys.executable, "-c", "import pydantic_settings"],
        capture_output=True,
        text=True,
    )
    if probe.returncode == 0:
        return sys.executable
    venv_py = os.path.join(API_DIR, ".venv", "bin", "python3")
    return venv_py if os.path.exists(venv_py) else sys.executable


if _venv_python() != sys.executable:
    os.execv(_venv_python(), [_venv_python(), str(Path(__file__).resolve()), *sys.argv[1:]])

sys.path.insert(0, API_DIR)

passes = 0
fails = 0


def check(name, got, want=True):
    global passes, fails
    if got == want:
        passes += 1
        print(f"  ✓ {name}")
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


from app.db import Base  # noqa: E402
import app.models  # noqa: E402,F401  (register every Base.metadata table)
import app.story_embedding_model as sem  # noqa: E402

# The startup create_all iterates Base.metadata.tables — the pgvector table
# must NOT be among them, or a DB without the `vector` extension 502s the API.
check("story_embeddings absent from Base.metadata", "story_embeddings" in Base.metadata.tables, False)

# The model is still defined (when the Python package is present) on its own
# metadata, so the embed job can lazily create it after CREATE EXTENSION.
check("StoryEmbedding still defined when pgvector present", sem.StoryEmbedding is not None, sem.HAVE_VECTOR)
if sem.HAVE_VECTOR and sem.StoryEmbedding is not None:
    check("story_embeddings present on embed_metadata", "story_embeddings" in sem.embed_metadata.tables)

print(f"\n✓ {passes} passed, {fails} failed")
sys.exit(0 if fails == 0 else 1)
