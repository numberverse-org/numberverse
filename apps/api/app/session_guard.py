"""Session-revocation rules (#265) — pure, dependency-free, CI-testable.

When a password changes (or an account-wide logout fires), every session except
the CURRENT one must die server-side so a leaked/old token stops working
immediately. The revocable-sessions design (`deps.get_current_profile`) refuses
any token whose session row is revoked — the JWT is only the bearer; the row is
the kill-switch.

Extracted from the `change-password` endpoint so the security contract is
provable in CI without a live FastAPI + Postgres (`python3 tests/test_session_guard.py`).
"""

from __future__ import annotations

from datetime import datetime


def revoke_other_sessions(sessions, current_id, now: datetime) -> int:
    """Revoke every session EXCEPT the one whose id == current_id.

    - `current_id is None` (a legacy token with no session row) revokes
      everything, including the caller — correct for "sign out everywhere".
    - Already-revoked rows are left untouched (no double-stamp).
    - Returns the number of sessions newly revoked (0 is fine).
    """
    revoked = 0
    for s in sessions:
        if s.revoked_at is not None:
            continue
        if current_id is None or s.id != current_id:
            s.revoked_at = now
            revoked += 1
    return revoked
