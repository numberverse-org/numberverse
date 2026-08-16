#!/usr/bin/env python3
"""Data-export format tests for the parent-facing privacy feature (#273).

`export_format` is dependency-free (duck-typed attribute access, no sqlalchemy /
fastapi imports) so this runs in CI with zero Postgres — the same pattern as
`test_band_lock.py`. It proves:

  ①  The export shape is stable and readable (settings, mastery, events, stories).
  ②  The privacy contract: NO password_hash / session / admin internals leak.
  ③  CSV round rows carry kid names + sort by date; Bangla survives (BOM).
  ④  Naive DB timestamps serialize as UTC ISO with a Z.

Run:  python3 apps/api/tests/test_export.py
"""
import csv
import sys
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.export_format import (  # noqa: E402
    VERSION,
    _guard_csv_cell,
    iso,
    profile_meta,
    round_rows,
    serialize_kid,
    to_csv,
)

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def kid(**kw):
    base = dict(id=uuid.uuid4(), name="ময়না", avatar="owl", birth_year=2019,
                coins=150,
                consent_version="1.0", consent_at=datetime(2026, 8, 1, 10, 30, 0, tzinfo=timezone.utc), consent_method="create_kid",
                created_at=datetime(2026, 8, 1, 10, 30, 0))
    base.update(kw)
    return SimpleNamespace(**base)


def settings(**kw):
    base = dict(enabled_subjects=None, max_band=2, daily_limit_min=45,
                weekday_limits_min="45,45,45,45,45,90,90",
                tts_enabled=True, music_enabled=True,
                updated_at=datetime(2026, 8, 5, 9, 0, 0))
    base.update(kw)
    return SimpleNamespace(**base)


def mastery(**kw):
    base = dict(skill_id="count-1-10", mastery=0.8777, correct=40, attempts=50,
                streak=12, last_practice=datetime(2026, 8, 10, 8, 0, 0),
                last_decay=datetime(2026, 8, 10, 8, 0, 0))
    base.update(kw)
    return SimpleNamespace(**base)


def event(**kw):
    base = dict(id=7, kid_id=uuid.uuid4(), skill_id="count-1-10", game_id="count", correct=True,
                response_ms=1400, difficulty=1.0,
                created_at=datetime(2026, 8, 10, 8, 0, 0))
    base.update(kw)
    return SimpleNamespace(**base)


def story(**kw):
    base = dict(uid="abc-123", skill_id="count-1-10", game_id="count",
                error_kind="slip", misconception_code=None, action="encourage",
                outcome=False, difficulty=1.0, response_ms=900, wrong_streak=2,
                created_at=datetime(2026, 8, 9, 18, 0, 0))
    base.update(kw)
    return SimpleNamespace(**base)


def accel(**kw):
    """#987 — acceleration log entry for export."""
    base = dict(skill_id="skip-1", reason="know", band_from=1, band_to=3,
                created_at=datetime(2026, 8, 8, 12, 0, 0))
    base.update(kw)
    return SimpleNamespace(**base)


def make_profile(**kw):
    """#985 — profile with consent fields."""
    base = dict(display_name="Parent", email="p@ex.com",
                password_hash="hunter2", is_admin=True, aggregate_opt_in=True,
                consent_version="1.0", consent_at=datetime(2026, 8, 1, 10, 0, 0, tzinfo=timezone.utc),
                consent_method="signup")
    base.update(kw)
    return SimpleNamespace(**base)


print("①  ISO serialization of naive DB timestamps…")
check("None → None", iso(None), None)
check("naive → Z", iso(datetime(2026, 8, 10, 8, 0, 0)), "2026-08-10T08:00:00Z")
check("aware → Z", iso(datetime(2026, 8, 10, 8, 0, 0, tzinfo=timezone.utc)), "2026-08-10T08:00:00Z")

print("②  Privacy contract: profile export never leaks account internals…")
meta = profile_meta(make_profile())
check("profile has display_name", "display_name" in meta, True)
check("profile has email", "email" in meta, True)
check("profile has consent", "consent" in meta, True)
check("consent has version", meta["consent"]["version"], "1.0")
check("consent has method", meta["consent"]["method"], "signup")
check("no password_hash", "password_hash" in meta, False)
check("no is_admin", "is_admin" in meta, False)

print("③  Kid export shape — readable, ordered, clamped mastery…")
out = serialize_kid(
    kid(name="আরিফ", birth_year=2020, coins=200),
    settings(),
    [mastery(mastery=1.234), mastery(skill_id="count-to-50", mastery=-0.5)],  # clamp + sort by skill_id
    [event(created_at=datetime(2026, 8, 10, 8, 0, 0)), event(id=1, created_at=datetime(2026, 8, 1, 8, 0, 0))],  # sorted by time
    [story()],
    acceleration=[accel()],
)
check("kid id is str", isinstance(out["id"], str), True)
check("kid name", out["name"], "আরিফ")
check("birth_year", out["birth_year"], 2020)
check("coins", out["coins"], 200)
check("consent.version", out["consent"]["version"], "1.0")
check("consent.method", out["consent"]["method"], "create_kid")
check("settings.weekday_limits_min", out["settings"]["weekday_limits_min"], "45,45,45,45,45,90,90")
check("mastery count", len(out["mastery"]), 2)
check("mastery clamp top", out["mastery"][0]["mastery"], 1.0)
check("mastery clamp bottom", out["mastery"][1]["mastery"], 0.0)
check("mastery sorted", [m["skill_id"] for m in out["mastery"]], ["count-1-10", "count-to-50"])
check("events sorted by time", [e["id"] for e in out["events"]], [1, 7])
check("story error_kind", out["stories"][0]["error_kind"], "slip")
check("acceleration present", len(out["acceleration"]), 1)
check("accel reason", out["acceleration"][0]["reason"], "know")
check("accel band_from", out["acceleration"][0]["band_from"], 1)
check("accel band_to", out["acceleration"][0]["band_to"], 3)
check("mastery has no internal cols", {"kid_id", "created_at"} & set(out["mastery"][0].keys()), set())
check("event has no internal cols", "kid_id" in out["events"][0], False)

print("④  CSV round rows: kid name resolved, sorted by date, BOM + header…")
k = kid(name="তারা")
rows = round_rows(
    [k],
    [event(kid_id=k.id, created_at=datetime(2026, 8, 10, 8, 0, 0)),
     event(id=1, kid_id=k.id, created_at=datetime(2026, 8, 1, 8, 0, 0))],
)
check("row count", len(rows), 2)
check("kid name in row", rows[0]["kid"], "তারা")
check("sorted by date", [r["date"] for r in rows], ["2026-08-01T08:00:00Z", "2026-08-10T08:00:00Z"])
csv_bytes = to_csv(rows, ["kid", "kid_id", "date", "skill_id", "game_id", "correct", "response_ms", "difficulty"])
check("csv is bytes", isinstance(csv_bytes, bytes), True)
check("BOM present", csv_bytes[:3], b"\xef\xbb\xbf")
text = csv_bytes.decode("utf-8-sig")
check("csv header", text.splitlines()[0], "kid,kid_id,date,skill_id,game_id,correct,response_ms,difficulty")
check("csv row 1", "তারা," in text.splitlines()[1], True)

print("⑤  Format version constant (v2 adds acceleration + coins + consent)…")
check("VERSION", VERSION, 2)

print("⑥  CSV formula-injection guard (#1826)…")
_guard_cases = [
    # (raw cell, expected guarded cell)
    ("=HYPERLINK(\"http://evil.example\")", "'=HYPERLINK(\"http://evil.example\")"),
    ("+2+3", "'+2+3"),
    ("@SUM(A1:B1)", "'@SUM(A1:B1)"),
    ("-5", "'-5"),
    ("\t=tab", "'\t=tab"),
    ("\r=cr", "'\r=cr"),
    ("Aarif", "Aarif"),
    ("আরিফ", "আরিফ"),
    (1500, 1500),  # non-string cells keep their type
    (True, True),
    (None, None),
]
for raw, want in _guard_cases:
    check(f"guard {raw!r}", _guard_csv_cell(raw), want)

# End-to-end through to_csv: dangerous kid names are neutralized in the file.
# Values containing quotes get quoted by the writer, so parse the row back
# with csv.reader and assert on the actual cell value.
_e2e_fields = ["kid", "kid_id", "date", "skill_id", "game_id", "correct", "response_ms", "difficulty"]
for _danger in ("=HYPERLINK(\"http://evil.example\")", "+2+3", "@SUM", "-5"):
    _evil = kid(name=_danger)
    _evil_csv = to_csv(
        round_rows([_evil], [event(kid_id=_evil.id, created_at=datetime(2026, 8, 10, 8, 0, 0))]),
        _e2e_fields,
    ).decode("utf-8-sig")
    _evil_cell = next(iter(csv.reader([_evil_csv.splitlines()[1]])))[0]
    check(f"csv neutralizes {_danger!r} kid", _evil_cell, "'" + _danger)

# Normal names pass through the CSV unchanged.
for _plain in ("Aarif", "আরিফ"):
    _pk = kid(name=_plain)
    _plain_csv = to_csv(
        round_rows([_pk], [event(kid_id=_pk.id, created_at=datetime(2026, 8, 10, 8, 0, 0))]),
        _e2e_fields,
    ).decode("utf-8-sig")
    _plain_cell = next(iter(csv.reader([_plain_csv.splitlines()[1]])))[0]
    check(f"csv keeps {_plain!r} unchanged", _plain_cell, _plain)

print()
print(f"✓ export format matrix: {passes} passed, {fails} failed")
sys.exit(1 if fails else 0)
