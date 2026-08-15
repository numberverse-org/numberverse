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
VERSION = 1


def iso(dt: datetime | None) -> str | None:
    """Serialize timestamp columns as UTC ISO strings (handles legacy naive)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def profile_meta(profile) -> dict:
    """What a parent may read about their own account. NOTE: deliberately
    omits password_hash, sessions, and is_admin — the export is family data,
    not account internals."""
    return {
        "display_name": profile.display_name,
        "email": profile.email,
    }


def serialize_kid(kid, settings, mastery, events, stories) -> dict:
    return {
        "id": str(kid.id),
        "name": kid.name,
        "avatar": kid.avatar,
        "birth_year": kid.birth_year,
        "created_at": iso(kid.created_at),
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
                "created_at": iso(e.created_at),
            }
            for e in sorted(events, key=lambda e: e.created_at or datetime.min)
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
    }


def round_rows(kids, events) -> list[dict]:
    """CSV rows: one per progress round, kid name resolved for readability."""
    name_by_id = {k.id: k.name for k in kids}
    rows = [
        {
            "kid": name_by_id.get(e.kid_id, str(e.kid_id)),
            "kid_id": str(e.kid_id),
            "date": iso(e.created_at),
            "skill_id": e.skill_id,
            "game_id": e.game_id,
            "correct": e.correct,
            "response_ms": e.response_ms,
            "difficulty": e.difficulty,
        }
        for e in events
    ]
    return sorted(rows, key=lambda r: r["date"] or "")


def to_csv(rows: list[dict], fieldnames: list[str]) -> bytes:
    """Serialize round rows to UTF-8 (BOM so Excel renders Bangla names)."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return ("﻿" + buf.getvalue()).encode("utf-8")
