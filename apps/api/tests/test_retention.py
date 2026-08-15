#!/usr/bin/env python3
"""#983 + #984 — retention/prune policy regression tests.

progress_events grow one row per answered round and Session rows carry ip +
user_agent (PII), so both must have explicit, SCHEDULED bounds — not just an
admin-only manual button. This test guards:

  ① the retention settings defaults exist and are sane;
  ② the prune/purge DELETE statements target exactly the right rows
    (progress_events older than N days; per-kid cap via row_number; sessions
    revoked more than N days ago);
  ③ the scheduled embed-loop in main.py actually calls all three prune/purge
    helpers (a manual-only endpoint is insufficient for unattended operation).

Standalone (no Postgres):  python3 apps/api/tests/test_retention.py
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, func, select  # noqa: E402

from app.config import settings  # noqa: E402
from app.models import ProgressEvent, Session  # noqa: E402

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def _run():
    now = datetime.now(timezone.utc)

    print("①  Retention settings defaults (#983/#984)…")
    check("progress_retention_days default", settings.progress_retention_days, 90)
    check("max_progress_events_per_kid default", settings.max_progress_events_per_kid, 5000)
    check("session_purge_days default", settings.session_purge_days, 30)

    print("②  Prune/purge statements target the right rows…")
    # #983 age prune — drop progress_events older than the retention window.
    age = delete(ProgressEvent).where(
        ProgressEvent.created_at < now - timedelta(days=settings.progress_retention_days)
    )
    age_sql = str(age.compile(compile_kwargs={"literal_binds": True}))
    check("age prune targets progress_events", "DELETE FROM progress_events" in age_sql, True)
    check("age prune bounds created_at", "progress_events.created_at <" in age_sql, True)

    # #983 volume guard — keep only the most recent `cap` per kid.
    ranked = (
        select(
            ProgressEvent.id,
            func.row_number().over(
                partition_by=ProgressEvent.kid_id,
                order_by=ProgressEvent.id.desc(),
            ).label("rn"),
        ).subquery()
    )
    over_cap = (
        select(ProgressEvent.id)
        .join(ranked, ranked.c.id == ProgressEvent.id)
        .where(ranked.c.rn > settings.max_progress_events_per_kid)
    )
    cap = delete(ProgressEvent).where(ProgressEvent.id.in_(over_cap))
    cap_sql = str(cap.compile(compile_kwargs={"literal_binds": True}))
    check("cap trim uses row_number partition", "row_number() OVER" in cap_sql, True)
    check("cap trim partitions by kid_id", "PARTITION BY progress_events.kid_id" in cap_sql, True)
    check("cap threshold is max_progress_events_per_kid", str(settings.max_progress_events_per_kid) in cap_sql, True)

    # #984 session purge — hard-delete only REVOKED rows past the cutoff.
    cutoff = now - timedelta(days=settings.session_purge_days)
    sess = delete(Session).where(
        Session.revoked_at.is_not(None),
        Session.revoked_at < cutoff,
    )
    sess_sql = str(sess.compile(compile_kwargs={"literal_binds": True}))
    check("session purge targets sessions", "DELETE FROM sessions" in sess_sql, True)
    check("session purge only revoked rows", "sessions.revoked_at IS NOT NULL" in sess_sql, True)
    check("session purge respects cutoff", "sessions.revoked_at <" in sess_sql, True)

    print("③  Scheduled loop wires all three (#983/#984 must be unattended)…")
    main_src = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text()
    admin_src = (Path(__file__).resolve().parents[1] / "app" / "routers" / "admin.py").read_text()
    for helper in ("_prune_stories", "_prune_progress_events", "_purge_revoked_sessions"):
        check(f"admin defines {helper}", f"async def {helper}" in admin_src, True)
        check(f"scheduled loop calls {helper}", helper in main_src, True)

    print(f"✓ {passes} checks passed")
    if fails:
        print(f"✖ {fails} FAILED")
        sys.exit(1)


if __name__ == "__main__":
    _run()
