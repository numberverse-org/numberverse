"""Pure, dependency-free serializers for the parent data export (#273).

Everything here duck-types attribute access on the ORM rows — NO sqlalchemy /
fastapi imports — so the format is unit-testable in CI with zero Postgres, the
same pattern as `bandlock.py`. The router (`routers/export.py`) only wires the
DB queries + download responses around these pure functions.

Privacy contract enforced here (and asserted by `tests/test_export.py`):
the parent's export carries their OWN family data — never `password_hash`,
session/token material, or admin flags.
"""
import csv
import io
import uuid
from datetime import datetime, timezone

FORMAT = "numberverse-family-export"
# #987 — v2 adds acceleration_log entries and the kid's coins balance to the
# JSON export; v2 also surfaces the #985 consent audit trail. Keep this in lockstep
# with serialize_kid below.
VERSION = 2


def iso(dt: datetime | None) -> str | None:
    """Serialize timestamp columns as UTC ISO strings.

    #906 — the model columns are DateTime(timezone=True), so fresh-DB values
    are already aware and this is a plain astimezone. The `tzinfo is None`
    branch is a legacy guard for rows written before the tz migration (they
    were stored as naive UTC); labeling them UTC preserves the stored instant.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def event_occurred_at(e) -> datetime | None:
    """#3072 — effective occurred-at instant for a progress event row in the
    export.

    Prefers the client-observed ``client_ts``, then the integer epoch-ms
    ``timestamp`` (#1024, converted to an aware UTC datetime), then the
    server-stamped ``created_at``. A 30-days-offline round exported today is
    attributed to the day it was PLAYED, not the day it synced. Duck-types the
    ORM row (this module is dependency-free), so a missing attribute is a clean
    None fallthrough."""
    cts = getattr(e, "client_ts", None)
    if cts is not None:
        return cts
    ts = getattr(e, "timestamp", None)
    if ts is not None:
        try:
            return datetime.fromtimestamp(ts / 1000.0, tz=timezone.utc)
        except (ValueError, OverflowError, OSError):
            pass
    return getattr(e, "created_at", None)


def profile_meta(profile) -> dict:
    """What a parent may read about their own account. NOTE: deliberately
    omits password_hash, sessions, and is_admin — the export is family data,
    not account internals. #985 — includes the consent audit trail."""
    return {
        "display_name": profile.display_name,
        "email": profile.email,
        "consent": {
            "version": getattr(profile, "consent_version", None),
            "at": iso(getattr(profile, "consent_at", None)),
            "method": getattr(profile, "consent_method", None),
        },
    }


def serialize_kid(kid, settings, mastery, events, stories, acceleration=None) -> dict:
    return {
        "id": str(kid.id),
        "name": kid.name,
        "avatar": kid.avatar,
        "birth_year": kid.birth_year,
        # #986 — birth_year is surfaced so the parent can see what the app holds.
        "coins": getattr(kid, "coins", None) or 0,  # #987 — wallet balance
        "created_at": iso(kid.created_at),
        # #985 — per-kid consent acknowledgment
        "consent": {
            "version": getattr(kid, "consent_version", None),
            "at": iso(getattr(kid, "consent_at", None)),
            "method": getattr(kid, "consent_method", None),
        },
        "settings": None
        if settings is None
        else {
            "enabled_subjects": settings.enabled_subjects,
            "max_band": settings.max_band,
            "daily_limit_min": settings.daily_limit_min,
            "weekday_limits_min": settings.weekday_limits_min,
            "tts_enabled": settings.tts_enabled,
            "music_enabled": settings.music_enabled,
            "updated_at": iso(settings.updated_at),
        },
        "mastery": [
            {
                "skill_id": m.skill_id,
                "mastery": round(max(0.0, min(1.0, m.mastery)), 4),
                "correct": m.correct,
                "attempts": m.attempts,
                "streak": m.streak,
                "last_practice": iso(m.last_practice),
                "last_decay": iso(m.last_decay),
            }
            for m in sorted(mastery, key=lambda m: m.skill_id)
        ],
        "events": [
            {
                "id": e.id,
                "skill_id": e.skill_id,
                "game_id": e.game_id,
                "correct": e.correct,
                "response_ms": e.response_ms,
                "difficulty": e.difficulty,
                # #3072 — export the real play time (client_ts → timestamp →
                # created_at), not the server sync stamp.
                "created_at": iso(event_occurred_at(e)),
            }
            for e in sorted(events, key=lambda e: event_occurred_at(e) or datetime.min)
        ],
        "stories": [
            {
                "uid": s.uid,
                "skill_id": s.skill_id,
                "game_id": s.game_id,
                "error_kind": s.error_kind,
                "misconception_code": s.misconception_code,
                "action": s.action,
                "outcome": s.outcome,
                "difficulty": s.difficulty,
                "response_ms": s.response_ms,
                "wrong_streak": s.wrong_streak,
                "created_at": iso(s.created_at),
            }
            for s in sorted(stories, key=lambda s: s.created_at or datetime.min)
        ],
        # #987 — acceleration_log entries (the acceleration plan) were missing
        # from the export; they are now included so a parent can see every
        # "skipped ahead" reason and band jump.
        "acceleration": [
            {
                "skill_id": a.skill_id,
                "reason": a.reason,
                "band_from": a.band_from,
                "band_to": a.band_to,
                "created_at": iso(a.created_at),
            }
            for a in sorted(acceleration or [], key=lambda a: a.created_at or datetime.min)
        ],
    }


def round_rows(kids, events) -> list[dict]:
    """CSV rows: one per progress round, kid name resolved for readability."""
    name_by_id = {k.id: k.name for k in kids}
    rows = [
        {
            "kid": name_by_id.get(e.kid_id, str(e.kid_id)),
            "kid_id": str(e.kid_id),
            # #3072 — the round's real play time, not the server sync stamp.
            "date": iso(event_occurred_at(e)),
            "skill_id": e.skill_id,
            "game_id": e.game_id,
            "correct": e.correct,
            "response_ms": e.response_ms,
            "difficulty": e.difficulty,
        }
        for e in events
    ]
    return sorted(rows, key=lambda r: r["date"] or "")


# #1826 — the export is opened straight in Excel/Numbers, so any cell whose
# text starts with a formula metacharacter is evaluated as a spreadsheet
# formula. The kid name is user-controlled (a `=HYPERLINK(...)` name would be
# a CSV injection), but we guard EVERY cell: `-`, `+`, `=` and `@` prefixes
# are the classic injection set, and Excel also treats leading tab/CR as
# formula-adjacent. Neutralize by prefixing a single quote so the cell reads
# as plain text.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _guard_csv_cell(value):
    """Neutralize spreadsheet formula injection for a single CSV cell.

    Only cells that actually start with a metacharacter are touched — normal
    text ("Aarif", "আরিফ") passes through byte-for-byte. Non-dangerous values
    keep their original type (int/float/bool/None) so the csv module renders
    them exactly as before; dangerous values become a `'`-prefixed string.
    """
    if value is None:
        return value
    text = value if isinstance(value, str) else str(value)
    if text.startswith(_FORMULA_PREFIXES):
        return "'" + text
    return value


def to_csv(rows: list[dict], fieldnames: list[str]) -> bytes:
    """Serialize round rows to UTF-8 (BOM so Excel renders Bangla names)."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for r in rows:
        writer.writerow({k: _guard_csv_cell(v) for k, v in r.items()})
    return ("﻿" + buf.getvalue()).encode("utf-8")
