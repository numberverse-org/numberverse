#!/usr/bin/env python3
"""#3069 — share feature coverage for the parts #3057/#3061/#3062 left untested.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_share_gates.py

`test_share_tokens.py` already covers expiry (#3057), per-recipient mint (#3061)
and atomic mint (#3062) plus revoke-one/revoke-all. This module fills the
remaining #3069 gaps on `app/routers/shares.py`:

  ① rotate — POST /kids/{kid}/share-token/rotate revokes every active link AND
     mints one fresh token: the old links 404, the new one resolves.
  ② paused gate — #867: a paused kid's share link 404s (the parent's
     kill-switch also gates the public card).
  ③ non-owner — minting/rotating another parent's kid 404s (never leaks a token).
  ④ zero-identity — the public snapshot carries ONLY anonymous aggregates: no
     name, no kid_id, no email, no avatar, no skill ids, no wallet.

The routes are exercised end-to-end through an in-memory AsyncSession-shaped
fake that stores ShareToken/Kid/KidSettings rows so the full mint → rotate →
snapshot lifecycle runs without Postgres.
"""
import asyncio
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import Select, select  # noqa: E402
from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList, ColumnElement, Null  # noqa: E402

from app.models import ContentItem, Kid, KidSettings, Profile, ProgressEvent, ShareToken  # noqa: E402
from app.routers.shares import (  # noqa: E402
    _share_token_hash,
    get_share_snapshot,
    get_share_token,
    rotate_share_token,
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


def _flatten_conds(clause):
    if isinstance(clause, BooleanClauseList):
        out = []
        for c in clause.clauses:
            out.extend(_flatten_conds(c))
        return out
    if isinstance(clause, BinaryExpression):
        left = clause.left
        col = str(left) if isinstance(left, ColumnElement) else getattr(left, "key", str(left))
        op_name = getattr(clause.operator, "__name__", str(clause.operator))
        if op_name == "eq":
            right = clause.right
            return [(col, "=", right.value if hasattr(right, "value") else right)]
        if op_name == "is_":
            is_none = isinstance(clause.right, Null)
            return [(col, "is_none" if is_none else "is_not_none", None)]
        return []
    return []


class _Rows:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return list(self._rows)


class _Rowcount:
    def __init__(self, n):
        self.rowcount = n


class FakeShareDB:
    def __init__(self):
        self.tokens: dict[str, ShareToken] = {}     # token_hash -> row
        self.kids: dict[uuid.UUID, Kid] = {}
        self.settings: dict[uuid.UUID, KidSettings] = {}
        self.commits = 0

    async def scalar(self, stmt):
        if isinstance(stmt, Select):
            ent = stmt.column_descriptions[0].get("entity")
            conds = self._conds_of(stmt)
            if ent is ShareToken:
                for tok in self.tokens.values():
                    if self._matches(tok, conds):
                        return tok
                return None
            if ent is Kid:
                for kid in self.kids.values():
                    if self._matches(kid, conds):
                        return kid
                return None
            if ent is ContentItem:
                return "Fruit Tree"
        return None

    async def scalars(self, stmt):
        return _Rows([])

    async def get(self, model, pk):
        if model is Kid:
            return self.kids.get(pk)
        if model is KidSettings:
            return self.settings.get(pk)
        return None

    async def execute(self, stmt, params=None):
        tok = self._extract_insert(stmt)
        if tok is not None:
            self.tokens[tok.token_hash] = tok
            return _Rowcount(1)
        up = self._extract_update(stmt)
        if up is not None:
            (field, value), conds = up
            n = 0
            for row in list(self.tokens.values()):
                if self._matches(row, conds):
                    setattr(row, field.split(".")[-1], value)
                    n += 1
            return _Rowcount(n)
        return _Rowcount(0)

    def add(self, obj):
        pass

    async def commit(self):
        self.commits += 1

    def _conds_of(self, stmt):
        wc = getattr(stmt, "whereclause", None)
        return _flatten_conds(wc) if wc is not None else []

    def _matches(self, obj, conds):
        for col, op, val in conds:
            actual = getattr(obj, col.split(".")[-1], None)
            if op == "=" and actual != val:
                return False
            if op == "is_none" and actual is not None:
                return False
            if op == "is_not_none" and actual is None:
                return False
        return True

    def _extract_insert(self, stmt):
        from sqlalchemy.sql.dml import Insert

        if isinstance(stmt, Insert):
            vals = getattr(stmt, "_values", None) or {}
            named = {}
            for col, param in vals.items():
                name = getattr(col, "name", str(col))
                named[name] = param.value if hasattr(param, "value") else param
            kid_id = named.get("kid_id")
            token_hash = named.get("token_hash")
            if kid_id is not None and token_hash is not None:
                return ShareToken(
                    id=named.get("id", uuid.uuid4()),
                    kid_id=kid_id,
                    token_hash=token_hash,
                    created_at=datetime.now(timezone.utc),
                )
        return None

    def _extract_update(self, stmt):
        from sqlalchemy.sql.dml import Update

        if not isinstance(stmt, Update):
            return None
        raw_values = getattr(stmt, "_values", None) or {}
        values = {}
        for col, param in raw_values.items():
            name = getattr(col, "name", str(col))
            value = param.value if hasattr(param, "value") else datetime.now(timezone.utc)
            values[name] = value
        wc = getattr(stmt, "whereclause", None)
        conds = _flatten_conds(wc) if wc is not None else []
        return (list(values.items())[0] if values else (None, None), conds)


def _profile():
    return Profile(id=uuid.uuid4(), email="p@example.com", password_hash="x", display_name="P")


def _mk_kid(profile=None, *, paused=False):
    p = profile or _profile()
    kid = Kid(id=uuid.uuid4(), profile_id=p.id, name="K")
    db_add_kid = None
    return kid, p


async def _snapshot_status(db, token):
    try:
        await get_share_snapshot(token, db=db)
        return 200
    except HTTPException as e:
        return e.status_code


# ── ① rotate — revoke all + mint one fresh ───────────────────────────────────
print("①  #3069 rotate — old links die, a fresh one resolves…")

db = FakeShareDB()
kid, prof = _mk_kid()
db.kids[kid.id] = kid

old1 = asyncio.run(get_share_token(kid.id, prof, db=db, _rl=None))
old2 = asyncio.run(get_share_token(kid.id, prof, db=db, _rl=None))
check("two pre-rotate mints are distinct", old1.token != old2.token, True)

fresh = asyncio.run(rotate_share_token(kid.id, prof, db=db))
check("rotate mints a token distinct from both old ones",
      fresh.token not in (old1.token, old2.token), True)
check("rotate revokes BOTH old links (old1 → 404)",
      asyncio.run(_snapshot_status(db, old1.token)), 404)
check("rotate revokes BOTH old links (old2 → 404)",
      asyncio.run(_snapshot_status(db, old2.token)), 404)
check("the fresh rotated token still resolves → 200",
      asyncio.run(_snapshot_status(db, fresh.token)), 200)

# ── ② #867 paused gate — a paused kid's link 404s ────────────────────────────
print("②  #867 paused gate — a paused kid's share link 404s…")

db = FakeShareDB()
kid, prof = _mk_kid()
db.kids[kid.id] = kid
db.settings[kid.id] = KidSettings(kid_id=kid.id, paused=True)
tok = asyncio.run(get_share_token(kid.id, prof, db=db, _rl=None))
check("paused kid's freshly-minted link → 404",
      asyncio.run(_snapshot_status(db, tok.token)), 404)

# An unpaused kid (no settings row = defaults) still resolves.
db2 = FakeShareDB()
kid2, prof2 = _mk_kid()
db2.kids[kid2.id] = kid2
tok2 = asyncio.run(get_share_token(kid2.id, prof2, db=db2, _rl=None))
check("unpaused kid's link → 200", asyncio.run(_snapshot_status(db2, tok2.token)), 200)

# ── ③ non-owner — minting/rotating another parent's kid 404s ─────────────────
print("③  #3069 non-owner — mint/rotate on another parent's kid 404s…")

db = FakeShareDB()
kid, owner = _mk_kid()
db.kids[kid.id] = kid
stranger = _profile()

async def _mint_status(db, kid_id, profile):
    try:
        await get_share_token(kid_id, profile, db=db, _rl=None)
        return 200
    except HTTPException as e:
        return e.status_code

async def _rotate_status(db, kid_id, profile):
    try:
        await rotate_share_token(kid_id, profile, db=db)
        return 200
    except HTTPException as e:
        return e.status_code

check("non-owner mint → 404", asyncio.run(_mint_status(db, kid.id, stranger)), 404)
check("non-owner rotate → 404", asyncio.run(_rotate_status(db, kid.id, stranger)), 404)
check("no token row was minted for the stranger", len(db.tokens), 0)

# ── ④ zero-identity — the public snapshot carries ZERO identity fields ───────
print("④  #3069 zero-identity — public snapshot has no name/kid_id/email/skill ids…")

db = FakeShareDB()
kid, prof = _mk_kid()
kid.name = "Aarif"
kid.avatar = "owl-emoji"
db.kids[kid.id] = kid
tok = asyncio.run(get_share_token(kid.id, prof, db=db, _rl=None))
snap = asyncio.run(get_share_snapshot(tok.token, db=db))
snap_dict = snap.model_dump()
for forbidden in ("name", "kid_id", "avatar", "email", "profile_id", "wallet", "coins", "skill_ids", "skills"):
    check(f"snapshot omits {forbidden!r}", forbidden in snap_dict, False)
# The shape is the documented aggregate-only set.
allowed = {"rounds", "minutes", "minutes_approx", "correct_pct", "active_days",
           "mastered_count", "top_game", "week_of", "minutes_by_day"}
check("snapshot has only the aggregate fields", set(snap_dict.keys()) <= allowed, True)

print()
if fails:
    print(f"✗ share-gates suite: {passes} passed, {fails} FAILED")
    sys.exit(1)
print(f"✓ share-gates suite: {passes} passed, 0 failed")
print("SUMMARY share-gates: #3069 rotate + #867 paused + non-owner + zero-identity covered")
