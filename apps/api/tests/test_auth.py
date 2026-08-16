#!/usr/bin/env python3
"""test-coverage-api #3 auth router + #4 get_current_profile.

Executes the REAL async auth handlers (`app/routers/auth.py`) and the REAL
`deps.get_current_profile` with a fake in-memory AsyncSession + fake request
objects — no FastAPI TestClient, no Postgres (mirrors test_session_guard.py's
call-the-handler-directly technique, extended to a full fake DB).

Proves:
  ① signup mints a hashed password + session, rejects duplicates, enforces
     the 8-char password policy;
  ② login issues a token on a correct password and rejects a wrong one while
     recording the failed attempt for the credential rate limiter;
  ③ a minted session id is accepted by get_current_profile, a REVOKED session's
     token is rejected, and the legacy no-sid branch materializes/revokes rows;
  ④ change-password verifies the old secret, swaps the hash, revokes every
     OTHER session, and old-password logins die;
  ⑤ delete-account removes the profile and its sessions;
  ⑥ deps.get_current_profile: happy path, revoked/missing/invalid-token
     rejection, and the legacy branch.

Run:  cd apps/api && python3 tests/test_auth.py   (no pytest, no Postgres)

Needs the app's real deps: fastapi, sqlalchemy[asyncio], psycopg[binary],
pydantic-settings, pyjwt, bcrypt, email-validator (all in apps/api/pyproject.toml).
The CI api-job install line currently omits bcrypt + email-validator — add them
there when this file is wired into .github/workflows/ci.yml.
"""
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import jwt as pyjwt  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from sqlalchemy.sql.dml import Insert  # noqa: E402
from sqlalchemy.sql.elements import BinaryExpression, BindParameter, BooleanClauseList, Null  # noqa: E402
from sqlalchemy.sql.functions import count as count_fn  # noqa: E402

from app import deps  # noqa: E402
from app.config import settings  # noqa: E402
from app.models import Kid, Profile, Session  # noqa: E402
from app.routers import auth  # noqa: E402
from app.schemas import ChangePasswordIn, DeleteAccountIn, LoginIn, SignupIn  # noqa: E402
from app.security import (  # noqa: E402
    create_access_token,
    hash_password,
    sha256_token,
    verify_password,
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


# ── Fake rate-limit guards (spies) ─────────────────────────────────────────

class FakeGuard:
    """Spy for AuthAttemptGuard — records lock checks/failures/resets."""

    def __init__(self):
        self.locked = False
        self.lock_checks = []
        self.recorded_failures = []
        self.resets = []

    async def raise_if_locked(self, db, *keys):
        self.lock_checks.append(keys)
        if self.locked:
            raise HTTPException(
                429, "Too many attempts — try again in 1 minutes"
            )

    async def record_failure(self, db, *keys):
        self.recorded_failures.append(keys)

    async def reset(self, db, *keys):
        self.resets.append(keys)


# ── Fake in-memory AsyncSession ────────────────────────────────────────────

_MODELS = {
    "profiles": Profile,
    "sessions": Session,
    "kids": Kid,
}


class _Rows:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return list(self._rows)

    def __iter__(self):
        return iter(self._rows)


class _Single:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeDB:
    """Minimal SQLAlchemy-AsyncSession-shaped fake.

    Understands the exact query shapes the auth router + deps use:
    select(Model).where(col == val[, col.is_(None)]),
    select(func.count()).select_from(Model).where(...),
    pg_insert(Model).values(...).on_conflict_do_nothing().returning(...).
    """

    def __init__(self):
        self._stores = {Profile: {}, Session: {}, Kid: {}}
        self.added = []
        self.deleted = []
        self.commits = 0

    # -- helpers ------------------------------------------------------------

    def _model_of(self, stmt):
        cols = list(stmt.selected_columns)
        if not cols:
            return None
        if isinstance(cols[0], count_fn):
            for f in stmt.get_final_froms():
                name = getattr(f, "name", None)
                if name in _MODELS:
                    return _MODELS[name]
            return None
        tbl = getattr(cols[0], "table", None)
        if tbl is None:
            return None
        return _MODELS.get(tbl.name)

    def _conds(self, stmt):
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

    def _matches(self, obj, conds):
        for col, op, val in conds:
            actual = getattr(obj, col, None)
            if op == "is_":
                if actual is not None:
                    return False
            elif op == "eq":
                if actual != val:
                    return False
            else:
                raise NotImplementedError(f"FakeDB op {op!r}")
        return True

    def _apply_defaults(self, obj):
        for col in obj.__table__.columns:
            name = col.name
            if getattr(obj, name, None) is not None:
                continue
            if col.default is not None:
                d = col.default
                if d.is_callable:
                    try:
                        val = d.arg(None)
                    except TypeError:
                        val = d.arg()
                elif d.is_scalar:
                    val = d.arg
                else:
                    val = None
                if val is not None:
                    setattr(obj, name, val)
                    continue
            if col.server_default is not None:
                from sqlalchemy import DateTime as _DT

                if isinstance(col.type, _DT):
                    setattr(obj, name, datetime.now(timezone.utc))

    def _store(self, obj):
        store = self._stores.setdefault(type(obj), {})
        if obj.id is not None:
            store[obj.id] = obj

    # -- AsyncSession surface used by the handlers ---------------------------

    def add(self, obj):
        self.added.append(obj)
        self._apply_defaults(obj)
        self._store(obj)

    async def flush(self):
        for obj in self.added:
            self._apply_defaults(obj)
            self._store(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        return None

    async def delete(self, obj):
        self.deleted.append(obj)
        # Approximate the DB's CASCADE FKs: deleting a profile removes its
        # sessions and kids too (the real handler relies on this).
        if isinstance(obj, Profile):
            for related in (Session, Kid):
                self._stores[related] = {
                    pk: o for pk, o in self._stores.get(related, {}).items()
                    if getattr(o, "profile_id", None) != obj.id
                }
        if obj in self.added:
            self.added.remove(obj)
        store = self._stores.get(type(obj), {})
        if obj.id is not None:
            store.pop(obj.id, None)

    async def get(self, model, pk):
        return self._stores.get(model, {}).get(pk)

    async def scalar(self, stmt):
        cols = list(stmt.selected_columns)
        if cols and isinstance(cols[0], count_fn):
            model = self._model_of(stmt)
            conds = self._conds(stmt)
            return sum(
                1 for obj in self._stores.get(model, {}).values()
                if self._matches(obj, conds)
            )
        model = self._model_of(stmt)
        conds = self._conds(stmt)
        for obj in self._stores.get(model, {}).values():
            if self._matches(obj, conds):
                return obj
        return None

    async def scalars(self, stmt):
        model = self._model_of(stmt)
        conds = self._conds(stmt)
        return _Rows(
            obj for obj in self._stores.get(model, {}).values()
            if self._matches(obj, conds)
        )

    async def execute(self, stmt):
        if isinstance(stmt, Insert):
            params = dict(stmt.compile().params)
            obj = Session(**params)
            self._apply_defaults(obj)
            self._store(obj)
            return _Single(obj.id)
        return _Single(await self.scalar(stmt))


# ── Request / seeding helpers ─────────────────────────────────────────────

def make_request(ip="1.2.3.4", user_agent="test-agent"):
    return SimpleNamespace(
        client=SimpleNamespace(host=ip),
        headers={"user-agent": user_agent},
        state=SimpleNamespace(session=None),
    )


def add_profile(db, email="parent@test.com", password="password123", **kw):
    profile = Profile(
        email=email,
        password_hash=hash_password(password),
        display_name=kw.pop("display_name", "Parent"),
    )
    for k, v in kw.items():
        setattr(profile, k, v)
    db.add(profile)
    return profile


def add_session(db, profile, **kw):
    s = Session(
        id=kw.pop("id", uuid.uuid4()),
        profile_id=profile.id,
        token_hash=kw.pop("token_hash", f"hash-{uuid.uuid4().hex}"),
        user_agent=kw.pop("user_agent", "test-agent"),
        ip=kw.pop("ip", "1.2.3.4"),
    )
    for k, v in kw.items():
        setattr(s, k, v)
    db.add(s)
    return s


async def expect_http(name, coro, status_code):
    """Await coro and assert it raises HTTPException(status_code)."""
    try:
        await coro
    except HTTPException as e:
        check(name, e.status_code, status_code)
        return e
    except Exception as e:  # noqa: BLE001
        check(name, type(e).__name__, f"HTTPException({status_code})")
        return None
    check(name, "no error", f"HTTPException({status_code})")
    return None


async def signup_and_seed(db, email="parent@test.com", password="password123"):
    """Real signup handler → returns (profile, token, request)."""
    req = make_request()
    out = await auth.signup(
        SignupIn(email=email, password=password, display_name="Parent"),
        req,
        db,
        _signup_limit=None,
    )
    profile = db._stores[Profile][out.profile.id]
    return profile, out.token, req


# ── The test matrix ───────────────────────────────────────────────────────

async def _run():
    global passes, fails
    passes = 0
    fails = 0

    # Isolate the module-level rate-limit guards so failures are recorded on
    # our spies (no Postgres), but the handler's guard-call SEQUENCE is real.
    login_guard = FakeGuard()
    pw_guard = FakeGuard()
    auth._LOGIN_GUARD = login_guard
    auth._PASSWORD_GUARD = pw_guard

    print("①  Signup: hashed password, session minted, dup rejected, length policy…")
    db = FakeDB()
    req = make_request()
    out = await auth.signup(
        SignupIn(email="New@Test.com", password="password123", display_name="Parent"),
        req,
        db,
        _signup_limit=None,
    )
    check("signup returns token", isinstance(out.token, str) and len(out.token) > 20, True)
    check("signup email normalized", out.profile.email, "new@test.com")
    check("signup role default", out.profile.role, "user")
    check("signup consent stamped", out.profile.consent_version, "1.0")
    stored = db._stores[Profile][out.profile.id]
    check("stored password != plaintext", stored.password_hash != "password123", True)
    check("stored password looks like bcrypt", stored.password_hash.startswith("$2"), True)
    check("verify_password matches", verify_password("password123", stored.password_hash), True)
    check("auth_provider=local", stored.auth_provider, "local")
    check("one session row minted", len(db._stores[Session]), 1)
    session_row = next(iter(db._stores[Session].values()))
    check("session tied to profile", session_row.profile_id, stored.id)
    check("session stores token fingerprint", session_row.token_hash == sha256_token(out.token), True)

    dup = await expect_http(
        "signup duplicate email → 409",
        auth.signup(SignupIn(email="new@test.com", password="password123", display_name="Dup"), make_request(), db, _signup_limit=None),
        409,
    )
    check("dup error mentions registered", "registered" in dup.detail.lower(), True)

    # Password length is enforced at the schema boundary.
    try:
        SignupIn(email="x@test.com", password="short")
        check("short password rejected by schema", "no error", "ValidationError")
    except Exception as e:  # noqa: BLE001
        check("short password rejected by schema", type(e).__name__, "ValidationError")

    print("②  Login: correct → token; wrong → rejected + rate-limiter failure…")
    db = FakeDB()
    add_profile(db, email="login@test.com", password="rightpass123")
    ok = await auth.login(LoginIn(email="login@test.com", password="rightpass123"), make_request(), db)
    check("login returns token", isinstance(ok.token, str) and len(ok.token) > 20, True)
    check("login reset called (success clears failures)", len(login_guard.resets) >= 1, True)
    check("login no failure recorded", len(login_guard.recorded_failures), 0)
    before = len(login_guard.recorded_failures)
    bad = await expect_http(
        "wrong password → 401",
        auth.login(LoginIn(email="login@test.com", password="wrongpass123"), make_request(), db),
        401,
    )
    check("wrong password message", bad.detail, "Invalid email or password")
    check("failure recorded for rate limiter", len(login_guard.recorded_failures), before + 1)
    keys = login_guard.recorded_failures[-1]
    check("failure keyed on email", any("login:email:login@test.com" in k for k in keys), True)
    check("failure keyed on ip", any("login:ip:1.2.3.4" in k for k in keys), True)

    print("③  Sessions: minted id accepted by get_current_profile; revoked rejected; legacy branch…")
    db = FakeDB()
    profile, token, _req = await signup_and_seed(db)
    sid = pyjwt.decode(token, settings.jwt_secret, algorithms=["HS256"])["sid"]
    req = make_request()
    got = await deps.get_current_profile(req, SimpleNamespace(credentials=token), db)
    check("get_current_profile happy path", got.id, profile.id)
    check("session row attached to request.state", req.state.session is not None, True)

    # Revoke the session row → the same token must die.
    session_row = db._stores[Session][uuid.UUID(str(sid))]
    session_row.revoked_at = datetime.now(timezone.utc)
    await expect_http(
        "revoked session token rejected",
        deps.get_current_profile(make_request(), SimpleNamespace(credentials=token), db),
        401,
    )

    # Legacy no-sid token: no session row yet → materializes one and passes.
    legacy_token = create_access_token(str(profile.id), profile.role, session_id=None)
    req2 = make_request()
    got2 = await deps.get_current_profile(req2, SimpleNamespace(credentials=legacy_token), db)
    check("legacy token accepted (materializes row)", got2.id, profile.id)
    check("legacy row now exists", len(db._stores[Session]) >= 2, True)

    # Legacy token whose materialized row is later revoked must die.
    legacy_row = db._stores[Session][req2.state.session.id]
    legacy_row.revoked_at = datetime.now(timezone.utc)
    await expect_http(
        "revoked legacy token rejected",
        deps.get_current_profile(make_request(), SimpleNamespace(credentials=legacy_token), db),
        401,
    )

    # Legacy cutoff (#865): token minted before the cutoff is rejected even
    # though it has no row yet.
    db3 = FakeDB()
    prof3 = add_profile(db3, email="legacy-cutoff@test.com", password="password123")
    prof3.legacy_sessions_revoked_at = datetime(2026, 8, 16, 0, 0, 0, tzinfo=timezone.utc)
    cutoff_early = create_access_token(str(prof3.id), prof3.role, session_id=None)
    cutoff_early = _re_token_iat(cutoff_early, 2026, 8, 15)
    await expect_http(
        "legacy token minted before logout-all cutoff rejected",
        deps.get_current_profile(make_request(), SimpleNamespace(credentials=cutoff_early), db3),
        401,
    )

    # #865 sub-second race: a legacy token minted AFTER the logout-all cutoff
    # must be ACCEPTED. create_access_token emits a whole-second `iat`, so
    # minting 1µs after the cutoff still yields iat == floor(cutoff_ts) and the
    # `iat <= marker_ts` check rejects it — the CORRECT behavior is acceptance.
    # (This check is RED on today's code and documents the bug; fix = preserve
    # sub-second precision in the token's iat claim.)
    db_race = FakeDB()
    prof_race = add_profile(db_race, email="legacy-race@test.com", password="password123")
    prof_race.legacy_sessions_revoked_at = datetime.now(timezone.utc) - timedelta(microseconds=1)
    fresh = create_access_token(str(prof_race.id), prof_race.role, session_id=None)
    try:
        got_race = await deps.get_current_profile(
            make_request(), SimpleNamespace(credentials=fresh), db_race
        )
        check("legacy token minted after cutoff accepted (#865 race)", got_race.id, prof_race.id)
    except HTTPException as e:
        check("legacy token minted after cutoff accepted (#865 race)", e.status_code, prof_race.id)

    print("④  Change-password: old verified, hash swapped, other sessions revoked…")
    db = FakeDB()
    prof = add_profile(db, email="pw@test.com", password="oldpass123")
    cur_sess = add_session(db, prof, token_hash="cur-hash")
    other_sess = add_session(db, prof, token_hash="other-hash")
    req4 = make_request()
    req4.state.session = cur_sess
    await auth.change_password(
        ChangePasswordIn(current_password="oldpass123", new_password="newpass456"),
        req4,
        prof,
        db,
    )
    check("new hash verifies", verify_password("newpass456", prof.password_hash), True)
    check("old password no longer verifies", verify_password("oldpass123", prof.password_hash), False)
    check("current session kept", cur_sess.revoked_at, None)
    check("other session revoked", other_sess.revoked_at is not None, True)
    check("legacy cutoff stamped", prof.legacy_sessions_revoked_at is not None, True)
    check("pw guard reset on success", len(pw_guard.resets), 1)

    await expect_http(
        "re-login with OLD password → 401",
        auth.login(LoginIn(email="pw@test.com", password="oldpass123"), make_request(), db),
        401,
    )
    ok4 = await auth.login(LoginIn(email="pw@test.com", password="newpass456"), make_request(), db)
    check("re-login with NEW password succeeds", isinstance(ok4.token, str), True)

    before_fail = len(pw_guard.recorded_failures)
    await expect_http(
        "wrong current password → 401",
        auth.change_password(
            ChangePasswordIn(current_password="nope", new_password="whatever123"),
            make_request(),
            prof,
            db,
        ),
        401,
    )
    check("pw failure recorded for rate limiter", len(pw_guard.recorded_failures), before_fail + 1)

    print("⑤  Delete-account: profile + sessions removed…")
    db = FakeDB()
    p5 = add_profile(db, email="del@test.com", password="password123")
    s5 = add_session(db, p5, token_hash="s5")
    k5 = Kid(profile_id=p5.id, name="Kid A")
    db.add(k5)
    res = await auth.delete_account(
        DeleteAccountIn(confirmation="delete my account", password="password123"),
        make_request(),
        p5,
        db,
    )
    check("delete summary deleted=true", res["deleted"], True)
    check("delete summary profile_id", str(res["profile_id"]), str(p5.id))
    check("delete counts kids", res["kids_removed"], 1)
    check("delete counts sessions", res["sessions_removed"], 1)
    check("profile removed from store", db._stores[Profile].get(p5.id), None)
    check("session removed from store", db._stores[Session].get(s5.id), None)
    check("kid removed from store", db._stores[Kid].get(k5.id), None)

    # Wrong password cannot delete.
    db6 = FakeDB()
    p6 = add_profile(db6, email="del2@test.com", password="password123")
    await expect_http(
        "delete with wrong password → 401",
        auth.delete_account(
            DeleteAccountIn(confirmation="delete my account", password="wrongpass123"),
            make_request(),
            p6,
            db6,
        ),
        401,
    )
    check("profile survives failed delete", db6._stores[Profile].get(p6.id) is not None, True)

    print("⑥  get_current_profile: missing/invalid/revoked/legacy…")
    db7 = FakeDB()
    p7, token7, _ = await signup_and_seed(db7, email="dep@test.com")
    await expect_http(
        "missing bearer → 401",
        deps.get_current_profile(make_request(), None, db7),
        401,
    )
    await expect_http(
        "invalid token → 401",
        deps.get_current_profile(make_request(), SimpleNamespace(credentials="garbage.token.value"), db7),
        401,
    )
    bad_sid = create_access_token(str(p7.id), p7.role, session_id=str(uuid.uuid4()))
    await expect_http(
        "unknown sid → 401",
        deps.get_current_profile(make_request(), SimpleNamespace(credentials=bad_sid), db7),
        401,
    )
    # #773 — a validly-signed token that merely carries the right sid but not
    # the matching bearer fingerprint is NOT the same session. (iat is moved
    # 5s into the past so the forged token's claims — and therefore its
    # signature + stored fingerprint — differ from the real token's.)
    real_sid = pyjwt.decode(token7, settings.jwt_secret, algorithms=["HS256"])["sid"]
    forged = _mint_with_sid(
        str(p7.id),
        real_sid,
        iat=datetime.now(timezone.utc) - timedelta(seconds=5),
    )
    await expect_http(
        "right sid + wrong bearer fingerprint → 401",
        deps.get_current_profile(make_request(), SimpleNamespace(credentials=forged), db7),
        401,
    )
    # sid claim that is not a UUID → 401
    weird = _mint_with_sid(str(p7.id), "not-a-uuid")
    await expect_http(
        "malformed sid → 401",
        deps.get_current_profile(make_request(), SimpleNamespace(credentials=weird), db7),
        401,
    )
    # valid sid but wrong subject → profile not found
    wrong_sub = create_access_token(str(uuid.uuid4()), "user", session_id=str(uuid.uuid4()))
    await expect_http(
        "token for missing profile → 401",
        deps.get_current_profile(make_request(), SimpleNamespace(credentials=wrong_sub), db7),
        401,
    )
    check("happy path returns the right profile", (await deps.get_current_profile(make_request(), SimpleNamespace(credentials=token7), db7)).id, p7.id)

    print("⑦  Bonus router surface: logout / logout-all / list-sessions / revoke-session…")
    db8 = FakeDB()
    p8 = add_profile(db8, email="sess@test.com", password="password123")
    s_cur = add_session(db8, p8, token_hash="cur")
    s_old = add_session(db8, p8, token_hash="old")
    s_dead = add_session(db8, p8, token_hash="dead", revoked_at=datetime(2026, 1, 1, tzinfo=timezone.utc))

    req8 = make_request()
    req8.state.session = s_cur
    listed = await auth.list_sessions(req8, p8, db8)
    check("list_sessions returns only active rows", len(listed), 2)
    check("list_sessions flags the caller", {s.id: s.current for s in listed}[s_cur.id], True)
    check("list_sessions does not flag another", {s.id: s.current for s in listed}[s_old.id], False)

    await auth.revoke_session(s_old.id, p8, db8)
    check("revoke_session kills the target", s_old.revoked_at is not None, True)
    await expect_http(
        "revoke_session on missing id → 404",
        auth.revoke_session(uuid.uuid4(), p8, db8),
        404,
    )
    await expect_http(
        "revoke_session on already-dead row → 404",
        auth.revoke_session(s_dead.id, p8, db8),
        404,
    )

    await auth.logout(req8, p8, db8)
    check("logout revokes the calling session", s_cur.revoked_at is not None, True)

    db9 = FakeDB()
    p9 = add_profile(db9, email="out@test.com", password="password123")
    a9 = add_session(db9, p9, token_hash="a")
    b9 = add_session(db9, p9, token_hash="b")
    await auth.logout_all(p9, db9)
    check("logout_all revokes session a", a9.revoked_at is not None, True)
    check("logout_all revokes session b", b9.revoked_at is not None, True)
    check("logout_all stamps legacy cutoff", p9.legacy_sessions_revoked_at is not None, True)

    print()
    print(f"✓ {passes} checks passed")
    if fails:
        print(f"✖ {fails} FAILED")
        sys.exit(1)


# ── helpers for crafting controlled tokens ────────────────────────────────

def _re_token_iat(token, y, m, d):
    """Return a new token with the same claims but iat set to y-m-d (legacy cutoff test)."""
    payload = pyjwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    payload["iat"] = int(datetime(y, m, d, tzinfo=timezone.utc).timestamp())
    return pyjwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _mint_with_sid(subject, sid, *, iat=None):
    now = iat if iat is not None else datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "role": "user",
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expires_minutes),
        "sid": sid,
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm="HS256")


if __name__ == "__main__":
    import asyncio

    asyncio.run(_run())
