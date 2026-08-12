#!/usr/bin/env python3
"""Session-revocation tests (#265) — password change must kill every OTHER
session, logout-all must kill every session.

The revocable-sessions design (`deps.get_current_profile`) refuses any token
whose session row is revoked, so "revoke the row" IS "invalidate the token".
These tests prove the revocation RULES are airtight: current kept, others
revoked, legacy-token caller revoked, already-dead rows untouched.

Run:  python3 apps/api/tests/test_session_guard.py   (no pytest, no Postgres)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.session_guard import revoke_other_sessions  # noqa: E402

from datetime import datetime  # noqa: E402
from types import SimpleNamespace  # noqa: E402

NOW = datetime(2026, 8, 12, 12, 0, 0)
fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def session(sid, revoked=None):
    return SimpleNamespace(id=sid, revoked_at=revoked)


print("①  Change password → EVERY OTHER session revoked, current kept…")
cur = session("cur")
s2 = session("s2")
s3 = session("s3")
n = revoke_other_sessions([cur, s2, s3], cur.id, NOW)
check("current NOT revoked", cur.revoked_at, None)
check("other 1 revoked", s2.revoked_at, NOW)
check("other 2 revoked", s3.revoked_at, NOW)
check("count = 2", n, 2)

print("②  Legacy token (no session row) → caller revoked too (sign out everywhere)…")
a = session("a")
b = session("b")
n = revoke_other_sessions([a, b], None, NOW)
check("a revoked", a.revoked_at, NOW)
check("b revoked", b.revoked_at, NOW)
check("count = 2", n, 2)

print("③  Already-revoked rows are left untouched (no double-stamp)…")
early = datetime(2026, 1, 1)
dead = session("dead", revoked=early)
live = session("live")
n = revoke_other_sessions([dead, live], None, NOW)
check("already-dead keeps ORIGINAL stamp", dead.revoked_at, early)
check("live revoked", live.revoked_at, NOW)
check("count = 1 (only the live one)", n, 1)

print("④  Empty session list is safe (0 revoked)…")
check("empty → 0", revoke_other_sessions([], None, NOW), 0)
check("empty, has current → 0", revoke_other_sessions([], "x", NOW), 0)

print("⑤  Current-only list → nothing revoked…")
only_me = session("me")
check("only current → 0", revoke_other_sessions([only_me], "me", NOW), 0)
check("current still alive", only_me.revoked_at, None)

print("⑥  logout-all semantics: every ACTIVE session dies, caller included…")
c1 = session("c1")
c2 = session("c2")
n = revoke_other_sessions([c1, c2], None, NOW)
check("caller revoked", c1.revoked_at, NOW)
check("other revoked", c2.revoked_at, NOW)
check("count = 2", n, 2)

print()
if fails:
    print(f"✖ {len(fails)} FAILURES")
    sys.exit(1)
print("✓ session-guard contract holds — password change/logout-all revoke correctly")
