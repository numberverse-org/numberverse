#!/usr/bin/env python3
"""#1858 — the app lifespan re-raises the embed task's cancellation instead of
swallowing it.

The lifespan's `finally` cancels the background `_embed_loop` task and awaits
it. Awaiting a cancelled task raises `asyncio.CancelledError` — which is the
shutdown signal WE requested — so the old `except (CancelledError, Exception):
pass` silently ate every shutdown. The fixed code `except asyncio.CancelledError:
raise` first, so cancellation stays semantically visible to whoever awaits the
lifespan; only non-cancellation task deaths are swallowed.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_lifespan_cancellation.py

The real create_tables/seed/_embed_loop are replaced with fakes so no database
is touched.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.main as M  # noqa: E402

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


async def _noop_db_step():
    pass


async def _never_ending_embed_loop():
    """The background job: sleeps forever, cancelled on shutdown."""
    await asyncio.sleep(3600)


async def _crashy_embed_loop():
    """A scheduler that dies on its own with a plain exception."""
    raise RuntimeError("scheduler bug inside the loop")


async def _run():
    print("①  shutdown cancellation propagates as CancelledError (never swallowed)…")
    orig = (M.create_tables, M.seed, M._embed_loop)
    M.create_tables = _noop_db_step
    M.seed = _noop_db_step
    M._embed_loop = _never_ending_embed_loop
    try:
        cm = M.lifespan(M.app)
        await cm.__aenter__()
        check("embed task started on entry", M._embed_task is not None and not M._embed_task.done(), True)

        cancelled_seen = False
        other_exc = None
        try:
            await cm.__aexit__(None, None, None)
        except asyncio.CancelledError:
            cancelled_seen = True
        except Exception as e:  # noqa: BLE001
            other_exc = e

        check("shutdown surfaces CancelledError (not swallowed)", cancelled_seen, True)
        check("no OTHER exception masks the cancellation", other_exc, None)
        check("embed task was actually cancelled/finished", M._embed_task.done(), True)
    finally:
        M.create_tables, M.seed, M._embed_loop = orig
        M._embed_task = None

    print("②  a task that dies on its own stays swallowed (except Exception: pass)…")
    orig2 = (M.create_tables, M.seed, M._embed_loop)
    M.create_tables = _noop_db_step
    M.seed = _noop_db_step
    M._embed_loop = _crashy_embed_loop
    try:
        cm = M.lifespan(M.app)
        await cm.__aenter__()
        # Let the crashed task finish before we exit (async tasks don't run
        # until the loop yields).
        for _ in range(200):
            if M._embed_task.done():
                break
            await asyncio.sleep(0.01)
        check("embed task died on its own", M._embed_task.done(), True)

        exited_clean = False
        other_exc = None
        try:
            await cm.__aexit__(None, None, None)
            exited_clean = True
        except asyncio.CancelledError:
            exited_clean = False
        except Exception as e:  # noqa: BLE001
            other_exc = e
            exited_clean = False

        check("plain task death does NOT raise out of shutdown", exited_clean, True)
        check("plain task death swallowed quietly", other_exc, None)
    finally:
        M.create_tables, M.seed, M._embed_loop = orig2
        M._embed_task = None

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES: {fails}")
        sys.exit(1)
    print("✓ all #1858 lifespan-cancellation checks passed")


if __name__ == "__main__":
    asyncio.run(_run())