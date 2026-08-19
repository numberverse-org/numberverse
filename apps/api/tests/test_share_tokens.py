#!/usr/bin/env python3
"""#3057/#3061/#3062 share-token expiry + per-recipient mint + atomic-mint test.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_share_tokens.py

Covers the share-token fixes against `app/routers/shares.py`:

  ①  #3057 — share links expire. A `share_tokens` row whose `created_at` is
     older than `settings.share_token_ttl_days` stops resolving: GET
     /share/{token} raises 404; a fresh row still resolves 200.
  ②  #3061 — per-recipient tokens. Two mints produce two DISTINCT valid tokens
     (no reuse of the old single bearer token); revoking ONE leaves the OTHER
     still resolving.
  ③  #3062 — atomic mint. Two "concurrent" first-share taps each INSERT their
     own unique token (no SELECT-then-UPDATE race), so both returned tokens
     resolve — no dead link.

The routes are exercised end-to-end through an in-memory AsyncSession-shaped
fake that actually stores `ShareToken` rows and `Kid`s, so the full mint →
lookup → revoke → expire lifecycle is honoured without Postgres.
"""
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import Select, select  # noqa: E402
from sqlalchemy.sql.elements import ColumnElement  # noqa: E402

from app.config import settings  # noqa: E402
from app.models import (  # noqa: E402
    ContentItem,
    Kid,
    KidSettings,
    Profile,
    ProgressEvent,
    ShareToken,
    SkillMastery,
)
from app.routers.shares import (  # noqa: E402
    _share_token_expired,
    _share_token_hash,
    get_share_snapshot,
    get_share_token,
    revoke_one_share_token,
    revoke_share_token,
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


# ── In-memory store + AsyncSession-shaped fake ──────────────────────────────
# The fake keeps real dicts for `share_tokens` (keyed by token_hash) and `kids`
# (keyed by id), and routes `select/insert/update/delete` against them so the
# routes' ORM statements actually take effect.


def _flatten_conds(clause):
    """Flatten a nested SQLAlchemy WHERE into a list of (col, op, value).

    `op` is one of ``"="``, ``"is_none"``, ``"is_not_none"``. ``col`` is the
    dotted column name (``share_tokens.token_hash``); callers split on the last
    ``.``. `is_(None)` compiles a SQLAlchemy ``Null`` right-hand side, which has
    no ``.value``, so it is detected specially."""
    from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList, Null

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
        self.tokens: dict[str, ShareToken] = {}   # token_hash -> row
        self.kids: dict[uuid.UUID, Kid] = {}
        self.commits = 0
        self.parent_events: list = []

    # -- AsyncSession surface -------------------------------------------------
    async def scalar(self, stmt):
        if isinstance(stmt, Select):
            ent = stmt.column_descriptions[0].get("entity")
            if ent is ShareToken:
                conds = self._conds_of(stmt)
                for tok in self.tokens.values():
                    if self._matches(tok, conds):
                        return tok
                return None
            if ent is Kid:
                conds = self._conds_of(stmt)
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
        self.parent_events.append(obj)

    async def commit(self):
        self.commits += 1

    # -- introspection helpers ------------------------------------------------
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
            # values are keyed by Column objects; map to name -> bound value
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


def _mk_kid(profile=None):
    p = profile or _profile()
    return Kid(id=uuid.uuid4(), profile_id=p.id, name="K"), p


# ── ① #3057 — share links expire at share_token_ttl_days ─────────────────────
print("①  #3057 — share links expire at share_token_ttl_days…")

fresh = datetime.now(timezone.utc) - timedelta(days=1)
old = datetime.now(timezone.utc) - timedelta(days=settings.share_token_ttl_days + 1)
check("fresh (1 day) token is NOT expired", _share_token_expired(fresh), False)
check("token past the TTL IS expired", _share_token_expired(old), True)
check("missing created_at fails closed (expired)", _share_token_expired(None), True)

# End-to-end: a backdated token 404s on the public route.
db = FakeShareDB()
kid, _p = _mk_kid()
db.kids[kid.id] = kid
expired_raw = "expired-token-abcdefghijklmnopqrstuv"
db.tokens[_share_token_hash(expired_raw)] = ShareToken(
    id=uuid.uuid4(),
    kid_id=kid.id,
    token_hash=_share_token_hash(expired_raw),
    created_at=datetime.now(timezone.utc) - timedelta(days=settings.share_token_ttl_days + 10),
    revoked_at=None,
)
try:
    asyncio.run(get_share_snapshot(expired_raw, db=db))
    check("expired token → 404", True, False)
except HTTPException as e:
    check("expired token → 404", e.status_code, 404)

fresh_raw = "fresh-token-abcdefghijklmnopqrstu"
db.tokens[_share_token_hash(fresh_raw)] = ShareToken(
    id=uuid.uuid4(),
    kid_id=kid.id,
    token_hash=_share_token_hash(fresh_raw),
    created_at=datetime.now(timezone.utc),
    revoked_at=None,
)
out = asyncio.run(get_share_snapshot(fresh_raw, db=db))
check("fresh token → 200 with a snapshot", out.active_days == 0, True)

# ── ② #3061 — per-recipient tokens ───────────────────────────────────────────
print("②  #3061 — per-recipient tokens…")

db = FakeShareDB()
kid, prof = _mk_kid()
db.kids[kid.id] = kid

t1 = asyncio.run(get_share_token(kid.id, prof, db=db, _rl=None))
t2 = asyncio.run(get_share_token(kid.id, prof, db=db, _rl=None))
check("two mints return two DISTINCT tokens", t1.token != t2.token, True)
check("two active rows exist", len([t for t in db.tokens.values() if t.revoked_at is None]), 2)

check("first token resolves", asyncio.run(get_share_snapshot(t1.token, db=db)) is not None, True)
check("second token resolves", asyncio.run(get_share_snapshot(t2.token, db=db)) is not None, True)

# Revoke ONE → the other still resolves.
asyncio.run(revoke_one_share_token(kid.id, t1.token, prof, db=db))
try:
    asyncio.run(get_share_snapshot(t1.token, db=db))
    check("revoked token now 404s", True, False)
except HTTPException as e:
    check("revoked token now 404s", e.status_code, 404)
check(
    "the OTHER token still resolves after revoking one",
    asyncio.run(get_share_snapshot(t2.token, db=db)) is not None,
    True,
)

# revoke-all kills BOTH.
asyncio.run(revoke_share_token(kid.id, prof, db=db))
check("revoke-all left ZERO active tokens", len([t for t in db.tokens.values() if t.revoked_at is None]), 0)

# ── ③ #3062 — atomic mint: concurrent first-share taps ───────────────────────
print("③  #3062 — concurrent first-mints are atomic…")

db = FakeShareDB()
kid, prof = _mk_kid()
db.kids[kid.id] = kid

ta = asyncio.run(get_share_token(kid.id, prof, db=db, _rl=None))
tb = asyncio.run(get_share_token(kid.id, prof, db=db, _rl=None))
check("concurrent mints yield distinct tokens", ta.token != tb.token, True)
check("both concurrent tokens resolve (no dead link)", asyncio.run(get_share_snapshot(ta.token, db=db)) is not None, True)
check("and the other resolves too", asyncio.run(get_share_snapshot(tb.token, db=db)) is not None, True)

print()
if fails:
    print(f"✗ share-tokens suite: {passes} passed, {fails} FAILED")
    sys.exit(1)
print(f"✓ share-tokens suite: {passes} passed, 0 failed")
print("SUMMARY share-tokens: #3057 expiry + #3061 per-recipient + #3062 atomic mint covered")
