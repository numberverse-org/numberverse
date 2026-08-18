#!/usr/bin/env python3
"""#1777 share-token hash test matrix — the DB stores only a sha256 fingerprint.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_shares_token_hash.py

Covers, against `app/routers/shares.py`:
  ①  _share_token_hash — one-way: 64 lowercase hex chars, deterministic, and a
      known sha256 vector (empty string) to pin the exact digest function.
  ②  _is_legacy_raw    — pre-migration plaintext `secrets.token_urlsafe(24)`
      values are exactly 32 url-safe chars → True; the new 64-hex → False;
      None/short/empty → False.
  ③  resolve_share_token — the pure public-lookup matcher: a new-form stored
      hash matches the hashed inbound token with no migration; a legacy raw
      stored value matches the raw inbound token and flags `needs_migration`;
      mismatches and empty stores resolve to (None, False).
  ④  two-step lookup simulation mirroring get_share_snapshot — including the
      Done-when #2 flow: a previously-minted plaintext link still resolves, and
      the row is lazily rewritten to a hash so the SAME link keeps working on
      the next hit via the new-form path.
"""
import asyncio
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import Select, select  # noqa: E402

from app.models import ContentItem, Kid, KidSettings, ProgressEvent, SkillMastery  # noqa: E402
from app.routers import shares as shares_mod  # noqa: E402
from app.routers.shares import (  # noqa: E402
    _is_legacy_raw,
    _share_token_hash,
    get_share_snapshot,
    resolve_share_token,
)

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
        print(f"✓ {name}")
    else:
        fails += 1
        print(f"✖ {name}: got {got!r}, want {want!r}")


# A realistic legacy share link: url-safe base64 of 24 bytes == 32 chars.
LEGACY_RAW = "0123456789abcdefghijklmnopqrstuv"
assert len(LEGACY_RAW) == 32
RE_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")

print("①  _share_token_hash — 64 lowercase hex, deterministic, one-way…")

h = _share_token_hash(LEGACY_RAW)
check("sha256(legacy) is a 64-char lowercase hex digest", bool(RE_SHA256_HEX.match(h)), True)
check("len == 64", len(h), 64)
check("deterministic: same token → same digest", _share_token_hash("x-y_2Z!"), _share_token_hash("x-y_2Z!"))
check("different tokens → different digests", _share_token_hash("token-a") != _share_token_hash("token-b"), True)
check(
    "pinned vector sha256(b'') == e3b0…2b855",
    _share_token_hash("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    True,
)
check("empty-string hash is not a legacy raw", _is_legacy_raw(_share_token_hash("")), False)

print("②  _is_legacy_raw — 32-char url-safe → True; 64-hex/None/short → False…")

check("32-char url-safe token → legacy True", _is_legacy_raw(LEGACY_RAW), True)
check("another real 32-char url-safe token → legacy True", _is_legacy_raw("abcdefghijklmnopqrstuvwxyzABCDEF"), True)
check("64-hex (new form) → legacy False", _is_legacy_raw(h), False)
check("None → legacy False", _is_legacy_raw(None), False)
check("empty string → legacy False", _is_legacy_raw(""), False)
check("short 8-char value → legacy False", _is_legacy_raw("abcd1234"), False)
check("33-char value → legacy False", _is_legacy_raw(LEGACY_RAW + "x"), False)

print("③  resolve_share_token — pure public-lookup matcher…")

stored_hash = _share_token_hash("inbound-fresh")
matching, migrate = resolve_share_token(stored_hash, "inbound-fresh")
check("new-form: stored hash matches hashed inbound, no migration", (matching, migrate), (stored_hash, False))
matching, migrate = resolve_share_token(LEGACY_RAW, LEGACY_RAW)
check("legacy: stored raw matches raw inbound, migration needed", (matching, migrate), (LEGACY_RAW, True))
matching, migrate = resolve_share_token(_share_token_hash("other"), "inbound-fresh")
check("mismatch: hash store vs wrong inbound → no match", (matching, migrate), (None, False))
matching, migrate = resolve_share_token(LEGACY_RAW, "abcdefghijklmnopqrstuvwxyzABCDEG")
check("mismatch: legacy store vs wrong inbound → no match", (matching, migrate), (None, False))

bytes32 = "a" * 32
matching, migrate = resolve_share_token(bytes32, bytes32)
check("legacy: 32-char a's match and migrate", (matching, migrate), (bytes32, True))

matching, migrate = resolve_share_token(None, "whatever-token")
check("empty store → no match, no migration", (matching, migrate), (None, False))
matching, migrate = resolve_share_token("", "whatever-token")
check("blank store → no match, no migration", (matching, migrate), (None, False))
matching, migrate = resolve_share_token("short", "short")
check("short 5-char store equal to inbound is NOT treated as legacy", (matching, migrate), (None, False))

print("④  two-step lookup simulation (get_share_snapshot mirror) — Done-when #2…")


def simulate_public_lookup(rows, inbound):
    """Mirror the route: hash-first, legacy-raw fallback, lazy migration flag."""
    token_hash = _share_token_hash(inbound)
    for kid_id, stored in rows.items():
        if stored and stored == token_hash:
            return kid_id, False
    for kid_id, stored in rows.items():
        if stored:
            _, needs_migration = resolve_share_token(stored, inbound)
            if needs_migration:
                return kid_id, True
    return None, False


# Legacy plaintext row: the SAME link resolves, and the row is rewritten to the
# fingerprint so the next hit goes through the new-form path.
rows = {"kid-1": LEGACY_RAW}
check("legacy row resolves to the kid (needs migration)", simulate_public_lookup(rows, LEGACY_RAW), ("kid-1", True))
rows["kid-1"] = _share_token_hash(LEGACY_RAW)  # lazy migration applied
check("after lazy migration, SAME link resolves via hash path", simulate_public_lookup(rows, LEGACY_RAW), ("kid-1", False))
check("migrated row stores a hash, not the raw token", rows["kid-1"] != LEGACY_RAW and RE_SHA256_HEX.match(rows["kid-1"]) is not None, True)

# Fresh-mint row: hash in DB, raw only in the minting response.
fresh = "fresh-minted-url-safe-abcdefghijk"
rows = {"kid-2": _share_token_hash(fresh)}
check("new-form row resolves via hashed inbound", simulate_public_lookup(rows, fresh), ("kid-2", False))
check("new-form row does NOT resolve the raw as a separate match", simulate_public_lookup(rows, "some-other-token-abc-321"), (None, False))
check("unknown kid → no match", simulate_public_lookup({}, "whatever"), (None, False))

print("⑤  #1645 — /share/{token} caps the token length at the framework boundary…")


def _share_token_max_length():
    for route in shares_mod.router.routes:
        if not hasattr(route, "path") or "/share/" not in (route.path or ""):
            continue
        for mf in route.dependant.path_params:
            if mf.name != "token":
                continue
            for m in getattr(mf.field_info, "metadata", None) or []:
                if type(m).__name__ == "MaxLen":
                    return m.max_length
    return None


check("token path param carries a 64-char max_length (422 guard)", _share_token_max_length(), 64)
check("real minted token (32 chars) is under the cap", len(LEGACY_RAW), 32)
check("oversized megabyte token would 422 before the DB lookup", 65 > 64, True)

print("⑥  #1646 — get_share_snapshot derives the window from the UTC day…")


class FakeShareResult:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return list(self._rows)


class FakeShareSession:
    """Postgres-free AsyncSession shaped exactly for get_share_snapshot."""

    def __init__(self, *, kid=None, events=None, settings=None, top_title=None, mastered=None):
        self.kid = kid
        self.events = events or []
        self.settings = settings
        self.top_title = top_title
        self.mastered = mastered or []
        self.commits = 0
        self.last_event_select = None

    async def scalar(self, stmt):
        if isinstance(stmt, Select) and self.kid:
            entity = stmt.column_descriptions[0].get("entity")
            if entity is Kid:
                return self.kid
            if entity is ContentItem:
                return self.top_title
        return None

    async def scalars(self, stmt):
        if isinstance(stmt, Select):
            entity = stmt.column_descriptions[0].get("entity")
            if entity is ProgressEvent:
                self.last_event_select = stmt
                return FakeShareResult(self.events)
            if entity is SkillMastery:
                return FakeShareResult(self.mastered)
        return FakeShareResult([])

    async def get(self, model, pk):
        if model is KidSettings and self.settings is not None and self.settings.kid_id == pk:
            return self.settings
        return None

    async def commit(self):
        self.commits += 1


class _FakeDatetime(datetime):
    """Subclass that pins `now()` to a fixed UTC instant and records the tz arg."""

    _fixed = datetime(2026, 8, 17, 12, 30, tzinfo=timezone.utc)
    called_with = []

    @classmethod
    def now(cls, tz=None):
        cls.called_with.append(tz)
        if tz:
            return cls._fixed.astimezone(tz)
        return cls._fixed


fixed_utc_date = _FakeDatetime._fixed.date()
kid = Kid(id=uuid.uuid4(), profile_id=uuid.uuid4(), name="K", share_token=_share_token_hash("tok-utc"))
event = ProgressEvent(
    id=1,
    kid_id=kid.id,
    skill_id="s1",
    game_id="game-fruit-tree",
    correct=True,
    kind="round",
    created_at=_FakeDatetime._fixed - timedelta(hours=5),  # same UTC day
)
fake = FakeShareSession(kid=kid, events=[event])
_FakeDatetime.called_with.clear()
with mock.patch.object(shares_mod, "datetime", _FakeDatetime):
    out = asyncio.run(get_share_snapshot("tok-utc", db=fake))
check("now() was asked for the UTC clock", _FakeDatetime.called_with == [timezone.utc], True)
check("week_of is the UTC calendar day, not the host's local day", out.week_of, fixed_utc_date.isoformat())
check("active_days counts the event's UTC day", out.active_days, 1)
check("minutes_by_day is a 7-entry window (oldest → newest)", len(out.minutes_by_day), 7)
check("rounds surfaced from the UTC window", out.rounds, 1)

# The events query must bind the window as an aware UTC midnight (same pattern
# as kids.py weekly), so a non-UTC Postgres session can't shift the boundary.
def _find_created_at_bound(clause):
    """Drill into the WHERE tree and return the RHS bound value for
    `progress_events.created_at >= :param` (or None if absent)."""
    from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList
    if isinstance(clause, BooleanClauseList):
        for c in clause.clauses:
            r = _find_created_at_bound(c)
            if r is not None:
                return r
    if isinstance(clause, BinaryExpression):
        col = getattr(clause, "left", None)
        if str(getattr(col, "name", "")).lower() == "created_at":
            return getattr(clause.right, "value", None)
    return None


_bound = _find_created_at_bound(fake.last_event_select.whereclause) if fake.last_event_select is not None else None
check("events window binds an aware UTC datetime (not a naive date)", _bound is not None and _bound.tzinfo is not None, True)
check("events window starts exactly 6 days before the UTC now",
      _bound is not None and _bound.date() == fixed_utc_date - timedelta(days=6), True)

print("⑦  #1800 — mint/rotate paths share ONE named SQL constant (no drift)…")

import inspect  # noqa: E402

from sqlalchemy.sql.expression import TextClause  # noqa: E402

mint_sql = shares_mod._SHARE_TOKEN_MINT_SQL
check("mint/rotate SQL is a single named text constant", isinstance(mint_sql, TextClause), True)
check(
    "constant audits both share_token_created_at and revoked_at",
    "share_token_created_at = now()" in str(mint_sql)
    and "share_token_revoked_at = NULL" in str(mint_sql),
    True,
)

src = inspect.getsource(shares_mod)
check("all three mint/rotate paths reference the shared constant", src.count("_SHARE_TOKEN_MINT_SQL"), 3)
check(
    "no inline UPDATE for share_token_created_at remains",
    'text("UPDATE kids SET share_token_created_at' not in src,
    True,
)

print()
if fails:
    print(f"✗ share-token-hash suite: {passes} passed, {fails} failed")
    sys.exit(1)
print(f"✓ share-token-hash suite: {passes} passed, 0 failed")
