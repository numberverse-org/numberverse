"""Router package.

`main.py` imports routers explicitly and calls `app.include_router(...)` for
each of them. New routers are folded in here — without editing main.py — by
attaching them to an already-registered parent router. `export` is the
established fold-in point (it already includes the import router the same way),
so the #1534/#1535 Web Push subscription router is registered there.
"""

from . import billing, export, push

# #1534/#1535 — register the push subscription router without touching main.py's
# explicit import list. FastAPI's `include_router` prepends the PARENT router's
# prefix to the child's routes. `push` already declares its full
# `/api/v1/push` prefix, so include it with the parent prefix temporarily empty
# and its already-prefixed routes are copied through unchanged (final paths
# stay `/api/v1/push/*`). `billing` is folded in the same way (`/api/v1/billing`).
_parent_prefix = export.router.prefix
try:
    export.router.prefix = ""
    export.router.include_router(push.router)
    export.router.include_router(billing.router)
finally:
    export.router.prefix = _parent_prefix
