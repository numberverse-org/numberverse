#!/usr/bin/env python3
"""#963 — cross-org isolation: org A cannot read org B's data.

Every tenant-scoped query must route through ``org_scoped()``.  This test
asserts that helper behaves correctly:
  - org_scoped(org_id) adds a tenant filter to models with an org_id column;
  - org_scoped(None) is a no-op (consumer / single-tenant path);
  - org_scoped handles joins (e.g. SkillMastery JOIN Kid) by filtering the
    org-carrying table in the join;
  - the org role hierarchy (teacher < admin < owner) is enforced.

The DB-dependent checks (creating two orgs and verifying a profile in Org A
cannot read Org B's kids/mastery) are pytest `--db`-gated: they run only when
a live Postgres is available.

Run standalone (no DB needed):  python3 apps/api/tests/test_org_isolation.py
Run with Postgres:              pytest apps/api/tests/test_org_isolation.py --db
"""

import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import pytest
except ImportError:  # pragma: no cover
    pytest = None

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.deps import (  # noqa: E402
    _validate_role_hierarchy,
    org_scoped,
    parse_org_id_header,
    parse_uuid,
)
from app.models import Classroom, Kid, SkillMastery  # noqa: E402


# ── Standalone unit checks (no DB) ─────────────────────────────────────────

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def _run_standalone():
    org_id = uuid.uuid4()

    print("①  org_scoped(None) is a no-op for consumer paths…")
    stmt = select(Kid).where(Kid.id == uuid.uuid4())
    before = str(stmt)
    after = str(org_scoped(stmt, None))
    check("no-op", after == before, True)

    print("②  org_scoped(org_id) filters models that carry org_id…")
    stmt = org_scoped(select(Kid).where(Kid.id == uuid.uuid4()), org_id)
    sql = str(stmt)
    check("Kid filtered", "kids.org_id" in sql, True)
    check("single filter", sql.count("kids.org_id ="), 1)

    print("③  org_scoped(org_id) filters org tables (Classroom)…")
    stmt = org_scoped(select(Classroom).where(Classroom.name == "Room 1"), org_id)
    sql = str(stmt)
    check("Classroom filtered", "classrooms.org_id" in sql, True)

    print("④  org_scoped(org_id) filters through a JOIN…")
    stmt = (
        select(SkillMastery)
        .join(Kid, Kid.id == SkillMastery.kid_id)
        .where(SkillMastery.kid_id == uuid.uuid4())
    )
    stmt = org_scoped(stmt, org_id)
    sql = str(stmt)
    check("join Kid filtered", "kids.org_id" in sql, True)
    check("join no SkillMastery filter", "skill_mastery.org_id" not in sql, True)

    print("⑤  Role hierarchy enforcement…")
    check("teacher < admin", _try_role("teacher", "admin"), False)
    check("admin ≥ admin", _try_role("admin", "admin"), True)
    check("owner ≥ admin", _try_role("owner", "admin"), True)
    check("admin ≥ teacher", _try_role("admin", "teacher"), True)
    check("teacher ≥ teacher", _try_role("teacher", "teacher"), True)

    # #1629 — the role-failure message is generic: it must not leak the
    # internal role vocabulary or the caller's exact role.
    try:
        _validate_role_hierarchy("teacher", "admin")
        check("role hierarchy failure raises", "no-error", "403")
    except HTTPException as e:
        check("role hierarchy failure status", e.status_code, 403)
        check("role hierarchy message is generic", e.detail, "Insufficient privileges")

    print("⑥  Shared identifier parsing (#1627/#1628)…")
    org_str = str(org_id)
    check("parse_uuid ok", str(parse_uuid(org_str)), org_str)
    try:
        parse_uuid("not-a-uuid")
        check("parse_uuid malformed → 400", "no-error", 400)
    except HTTPException as e:
        check("parse_uuid malformed → 400", e.status_code, 400)
        check("parse_uuid labels the field", e.detail, "Invalid id")
    try:
        parse_uuid("not-a-uuid", what="org_id")
        check("parse_uuid what label", "no-error", "Invalid org_id")
    except HTTPException as e:
        check("parse_uuid what label", e.detail, "Invalid org_id")

    req = SimpleNamespace(headers={"X-Org-ID": org_str})
    check("parse_org_id_header ok", str(parse_org_id_header(req)), org_str)
    check("parse_org_id_header absent → None",
          parse_org_id_header(SimpleNamespace(headers={})), None)
    try:
        parse_org_id_header(SimpleNamespace(headers={"X-Org-ID": "garbage"}))
        check("parse_org_id_header malformed → 400", "no-error", 400)
    except HTTPException as e:
        check("parse_org_id_header malformed → 400", e.status_code, 400)
        check("parse_org_id_header detail identical everywhere",
              e.detail, "Invalid X-Org-ID")

    print()
    print(f"✓ org-isolation unit matrix: {passes} passed, {fails} failed")
    sys.exit(1 if fails else 0)


def _try_role(actual: str, minimum: str) -> bool:
    try:
        _validate_role_hierarchy(actual, minimum)
        return True
    except Exception:
        return False


# ── Pytest DB-gated tests (require --db) ───────────────────────────────────

if pytest is not None:
    pytestmark = [
        pytest.mark.skipif(
            "not config.getoption('--db')",
            reason="requires --db flag and a running Postgres",
        ),
    ]

    @pytest.fixture
    async def two_orgs(db):
        """Create two distinct organizations, each with an owner + a kid."""
        from app.models import Kid, OrgMember, Organization, Profile

        org_a = Organization(name="Org A")
        org_b = Organization(name="Org B")
        db.add_all([org_a, org_b])
        await db.flush()

        owner_a = Profile(
            email=f"owner_a_{uuid.uuid4().hex[:8]}@test.com",
            password_hash="x",
        )
        owner_b = Profile(
            email=f"owner_b_{uuid.uuid4().hex[:8]}@test.com",
            password_hash="x",
        )
        db.add_all([owner_a, owner_b])
        await db.flush()

        member_a = OrgMember(org_id=org_a.id, profile_id=owner_a.id, role="owner")
        member_b = OrgMember(org_id=org_b.id, profile_id=owner_b.id, role="owner")
        db.add_all([member_a, member_b])
        await db.flush()

        kid_a = Kid(profile_id=owner_a.id, org_id=org_a.id, name="Kid A")
        kid_b = Kid(profile_id=owner_b.id, org_id=org_b.id, name="Kid B")
        db.add_all([kid_a, kid_b])
        await db.flush()

        return {
            "org_a": org_a,
            "org_b": org_b,
            "owner_a": owner_a,
            "owner_b": owner_b,
            "kid_a": kid_a,
            "kid_b": kid_b,
        }

    @pytest.mark.asyncio
    async def test_org_scoped_kid_isolation(db, two_orgs):
        """Org A must NOT see Org B's kid via org_scoped."""
        # Org A scope querying Org B's kid → no row.
        stmt = org_scoped(
            select(Kid).where(Kid.id == two_orgs["kid_b"].id),
            two_orgs["org_a"].id,
        )
        kid = await db.scalar(stmt)
        assert kid is None, "Org A should NOT see Org B's kid"

        # Org A scope querying Org A's kid → row found.
        stmt = org_scoped(
            select(Kid).where(Kid.id == two_orgs["kid_a"].id),
            two_orgs["org_a"].id,
        )
        kid = await db.scalar(stmt)
        assert kid is not None, "Org A should see its own kid"
        assert kid.name == "Kid A"

    @pytest.mark.asyncio
    async def test_org_scoped_mastery_isolation(db, two_orgs):
        """Org A must NOT see Org B's skill mastery via a Kid join."""
        sm_b = SkillMastery(
            kid_id=two_orgs["kid_b"].id,
            skill_id="test_skill_1",
            mastery=0.9,
        )
        db.add(sm_b)
        await db.commit()

        stmt = (
            select(SkillMastery)
            .join(Kid, Kid.id == SkillMastery.kid_id)
            .where(Kid.id == two_orgs["kid_b"].id)
        )
        stmt = org_scoped(stmt, two_orgs["org_a"].id)
        result = await db.scalars(stmt)
        assert list(result) == [], "Org A should NOT see Org B's skill mastery"

    @pytest.mark.asyncio
    async def test_org_scoped_null_org_id_noop(db, two_orgs):
        """org_scoped(None) must return the statement unchanged."""
        stmt = select(Kid).where(Kid.id == two_orgs["kid_a"].id)
        before = str(stmt)
        after = str(org_scoped(stmt, None))
        assert before == after, "org_scoped(None) must not modify the statement"

    @pytest.mark.asyncio
    async def test_admin_org_scoped_crud(db, two_orgs):
        """Admin CRUD must not leak across orgs when X-Org-ID is set."""
        stmt = org_scoped(
            select(Kid).where(Kid.id == two_orgs["kid_b"].id),
            two_orgs["org_a"].id,
        )
        kid = await db.scalar(stmt)
        assert kid is None, "Org A admin must not see Org B's kid"

    @pytest.mark.asyncio
    async def test_org_member_role_hierarchy(db, two_orgs):
        """Role hierarchy enforcement for require_org_member."""
        assert _try_role("teacher", "admin") is False
        assert _try_role("admin", "admin") is True
        assert _try_role("owner", "admin") is True


# ── Standalone entrypoint (no pytest) ──────────────────────────────────────

if __name__ == "__main__":
    _run_standalone()
