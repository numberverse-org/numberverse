#!/usr/bin/env python3
"""#1773 — short-lived access tokens + rotating httpOnly refresh cookie.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_refresh_rotation.py

Asserts:
  ① create_access_token issues a SHORT lifetime: user → ~15 min, admin/
    super_admin → ~10 min (the old week-long single JWT is gone);
  ② a sid-carrying token round-trips through decode_token with sub/role/sid
    and FLOAT iat/exp (#865 convention);
  ③ set_refresh_cookie / clear_refresh_cookie set httpOnly + Secure +
    SameSite=Strict + path /api/v1/auth + the 7-day Max-Age, with Secure=True
    on https (X-Forwarded-Proto) and Secure=False on plain http (LAN dev);
  ④ _rotate_refresh_session mints a new access token + a NEW refresh, swaps
    the stored refresh hash in place (old refresh dies), extends expiry;
  ⑤ presenting the OLD refresh again after rotation → 401;
  ⑥ revoked / expired / unknown refresh → 401.
"""
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy.sql.elements import BinaryExpression, BindParameter, BooleanClauseList, Null  # noqa: E402
from sqlalchemy.sql import Select  # noqa: E402

from app.config import settings  # noqa: E402
from app.routers import auth  # noqa: E402
from app.security import (  # noqa: E402
    REFRESH_COOKIE_NAME,
    clear_refresh_cookie,
    create_access_token,
    decode_token,
    set_refresh_cookie,
    sha256_token,
)

fails = []
_count = 0


def check(name, got, want):
    global _count
    _count += 1
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


# ── Fake response that records cookie calls ────────────────────────────────

class _FakeResponse:
    def __init__(self):
        self.set_cookie_calls = []
        self.delete_cookie_calls = []

    def set_cookie(self, **kwargs):
        self.set_cookie_calls.append(kwargs)

    def delete_cookie(self, *args, **kwargs):
        self.delete_cookie_calls.append((args, kwargs))


def _https_req():
    return SimpleNamespace(
        headers={"x-forwarded-proto": "https"},  # behind nginx
        url=SimpleNamespace(scheme="http"),
    )


def _http_req():
    return SimpleNamespace(headers={}, url=SimpleNamespace(scheme="http"))


# ── Fake in-memory AsyncSession shaped for _rotate_refresh_session ─────────

class FakeSession:
    """Handles exactly the two `scalar` queries _rotate_refresh_session makes:
    select(Session).where(Session.refresh_hash == h) and
    select(Profile).where(Profile.id == row.profile_id)."""

    def __init__(self):
        self.sessions: list[SimpleNamespace] = []
        self.profiles: list[SimpleNamespace] = []
        self.committed = False

    @staticmethod
    def _conds(stmt):
        wc = stmt.whereclause
        if wc is None:
            return []
        clauses = list(wc.clauses) if isinstance(wc, BooleanClauseList) else [wc]
        out = []
        for c in clauses:
            if not isinstance(c, BinaryExpression):
                continue
            col = c.left.key if hasattr(c.left, "key") else None
            right = c.right
            if isinstance(right, BindParameter):
                val = right.value
            elif isinstance(right, Null):
                val = None
            else:
                val = right
            out.append((col, c.operator.__name__, val))
        return out

    @staticmethod
    def _matches(obj, conds):
        for col, op, val in conds:
            actual = getattr(obj, col, None)
            if op == "is_":
                if actual is not None:
                    return False
            elif op == "eq":
                if actual != val:
                    return False
            else:
                raise NotImplementedError(f"FakeSession op {op!r}")
        return True

    async def scalar(self, stmt):
        if not isinstance(stmt, Select):
            return None
        cols = list(stmt.selected_columns)
        if not cols:
            return None
        tbl = getattr(cols[0], "table", None)
        if tbl is None:
            return None
        conds = self._conds(stmt)
        if tbl.name == "sessions":
            for s in self.sessions:
                if self._matches(s, conds):
                    return s
        elif tbl.name == "profiles":
            for p in self.profiles:
                if self._matches(p, conds):
                    return p
        return None

    async def commit(self):
        self.committed = True


def _session_row(*, refresh_hash, refresh_expires_at, revoked_at=None, profile_id=None, last_seen_at=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        profile_id=profile_id or uuid.uuid4(),
        token_hash="th",
        refresh_hash=refresh_hash,
        refresh_expires_at=refresh_expires_at,
        last_seen_at=last_seen_at or datetime.now(timezone.utc),
        revoked_at=revoked_at,
    )


# ── The matrix ─────────────────────────────────────────────────────────────

async def main():
    print("①  create_access_token — short-lived access lifetimes by role…")
    tok_user = create_access_token("u1", "user", session_id=str(uuid.uuid4()))
    du = decode_token(tok_user)
    lu = du["exp"] - du["iat"]
    check("user lifetime ≈ 15×60s", abs(lu - 15 * 60) <= 5, True)

    tok_admin = create_access_token("a1", "admin", session_id=str(uuid.uuid4()))
    da = decode_token(tok_admin)
    la = da["exp"] - da["iat"]
    check("admin lifetime ≈ 10×60s", abs(la - 10 * 60) <= 5, True)

    tok_super = create_access_token("a2", "super_admin", session_id=str(uuid.uuid4()))
    ds = decode_token(tok_super)
    ls = ds["exp"] - ds["iat"]
    check("super_admin lifetime ≈ 10×60s", abs(ls - 10 * 60) <= 5, True)

    print("②  decode_token round-trip — sub/role/sid + float iat/exp (#865)…")
    sid = uuid.uuid4()
    tok = create_access_token("p123", "user", session_id=str(sid))
    payload = decode_token(tok)
    check("sub preserved", payload["sub"], "p123")
    check("role preserved", payload["role"], "user")
    check("sid preserved", payload["sid"], str(sid))
    check("iat is float", isinstance(payload["iat"], float), True)
    check("exp is float", isinstance(payload["exp"], float), True)

    print("③  cookie helpers — HttpOnly + Secure + SameSite=Strict + path + Max-Age…")
    resp = _FakeResponse()
    set_refresh_cookie(resp, _https_req(), "refresh-token-value")
    c = resp.set_cookie_calls[-1]
    check("cookie key is nv_refresh", c["key"], REFRESH_COOKIE_NAME)
    check("cookie value is the token", c["value"], "refresh-token-value")
    check("HttpOnly set", c["httponly"], True)
    check("Secure set on https (x-forwarded-proto)", c["secure"], True)
    check("SameSite=strict", c["samesite"], "strict")
    check("path is /api/v1/auth", c["path"], "/api/v1/auth")
    check("Max-Age = jwt_refresh_days×86400", c["max_age"], settings.jwt_refresh_days * 86400)

    resp2 = _FakeResponse()
    set_refresh_cookie(resp2, _http_req(), "t2")
    check("Secure False on plain http (LAN dev)", resp2.set_cookie_calls[-1]["secure"], False)

    resp3 = _FakeResponse()
    clear_refresh_cookie(resp3, _https_req())
    args, kwargs = resp3.delete_cookie_calls[-1]
    check("clear deletes nv_refresh", args[0], REFRESH_COOKIE_NAME)
    check("clear path /api/v1/auth", kwargs["path"], "/api/v1/auth")
    check("clear secure True (https)", kwargs["secure"], True)
    check("clear samesite strict", kwargs["samesite"], "strict")

    print("④  rotation — new access + new refresh, old hash swapped in place…")
    now = datetime.now(timezone.utc)
    profile_id = uuid.uuid4()
    old_refresh = "the-old-refresh-token-value"
    row = _session_row(
        refresh_hash=sha256_token(old_refresh),
        refresh_expires_at=now + timedelta(days=1),
        profile_id=profile_id,
    )
    profile = SimpleNamespace(id=profile_id, role="user")
    db = FakeSession()
    db.sessions = [row]
    db.profiles = [profile]

    access, new_refresh = await auth._rotate_refresh_session(db, old_refresh)
    check("returns a string access token", isinstance(access, str) and len(access) > 20, True)
    check("returns a new refresh token", isinstance(new_refresh, str) and len(new_refresh) > 20, True)
    ap = decode_token(access)
    check("access sub = profile id", ap["sub"], str(profile_id))
    check("access role = user", ap["role"], "user")
    check("access sid names the row", ap["sid"], str(row.id))
    check("row refresh_hash CHANGED", row.refresh_hash != sha256_token(old_refresh), True)
    check("row refresh_hash = hash(new refresh)", row.refresh_hash, sha256_token(new_refresh))
    check("sha256(old_refresh) no longer matches any row",
          row.refresh_hash == sha256_token(old_refresh), False)
    check("refresh_expires_at extended to ~7d",
          abs((row.refresh_expires_at.replace(tzinfo=timezone.utc) - now).total_seconds()
              - settings.jwt_refresh_days * 86400) <= 60, True)
    check("last_seen_at bumped", row.last_seen_at is not None, True)
    check("db committed", db.committed, True)

    print("⑤  old refresh replayed after rotation → 401…")
    try:
        await auth._rotate_refresh_session(db, old_refresh)
        check("old refresh replayed → 401", "no error", "HTTPException 401")
    except HTTPException as e:
        check("old refresh replayed → 401", e.status_code, 401)

    print("⑥  revoked / expired / unknown refresh → 401…")
    # revoked_at set → 401
    db_r = FakeSession()
    db_r.sessions = [_session_row(
        refresh_hash=sha256_token("revoked-token"),
        refresh_expires_at=now + timedelta(days=1),
        revoked_at=now,
        profile_id=profile_id,
    )]
    db_r.profiles = [profile]
    try:
        await auth._rotate_refresh_session(db_r, "revoked-token")
        check("revoked row → 401", "no error", "HTTPException 401")
    except HTTPException as e:
        check("revoked row → 401", e.status_code, 401)

    # refresh_expires_at in the past → 401
    db_e = FakeSession()
    db_e.sessions = [_session_row(
        refresh_hash=sha256_token("expired-token"),
        refresh_expires_at=now - timedelta(minutes=1),
        profile_id=profile_id,
    )]
    db_e.profiles = [profile]
    try:
        await auth._rotate_refresh_session(db_e, "expired-token")
        check("expired refresh → 401", "no error", "HTTPException 401")
    except HTTPException as e:
        check("expired refresh → 401", e.status_code, 401)

    # unknown token (no matching row) → 401
    db_u = FakeSession()
    db_u.sessions = []
    db_u.profiles = [profile]
    try:
        await auth._rotate_refresh_session(db_u, "unknown-token")
        check("unknown token → 401", "no error", "HTTPException 401")
    except HTTPException as e:
        check("unknown token → 401", e.status_code, 401)

    # refresh_hash is None (pre-#1773 row) → 401
    db_n = FakeSession()
    db_n.sessions = [_session_row(
        refresh_hash=None,
        refresh_expires_at=now + timedelta(days=1),
        profile_id=profile_id,
    )]
    db_n.profiles = [profile]
    try:
        await auth._rotate_refresh_session(db_n, "anything")
        check("NULL refresh_hash (pre-#1773) → 401", "no error", "HTTPException 401")
    except HTTPException as e:
        check("NULL refresh_hash (pre-#1773) → 401", e.status_code, 401)

    print()
    if fails:
        print(f"✖ {len(fails)} FAILURES")
        sys.exit(1)
    print(f"✓ all {_count} checks passed")


if __name__ == "__main__":
    asyncio.run(main())
