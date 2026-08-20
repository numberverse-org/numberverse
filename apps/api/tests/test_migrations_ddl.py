#!/usr/bin/env python3
"""#1793–#1798 — pure DDL-string checks for `app.migrations`.

No pytest, no Postgres, no network. Importing `app.migrations` builds the
engine object lazily but never connects.

Run:
    cd apps/api && python3 tests/test_migrations_ddl.py
"""
import os
import subprocess
import sys
from pathlib import Path

API_DIR = str(Path(__file__).resolve().parents[1])


def _venv_python() -> str:
    """Pick a Python that can import pydantic_settings (required to import
    app.migrations), re-exec-ing under the repo venv when the outer
    interpreter can't (the established pattern in the apps/api tests)."""
    probe = subprocess.run(
        [sys.executable, "-c", "import pydantic_settings"],
        capture_output=True,
        text=True,
    )
    if probe.returncode == 0:
        return sys.executable
    venv_py = os.path.join(API_DIR, ".venv", "bin", "python3")
    return venv_py if os.path.exists(venv_py) else sys.executable


if _venv_python() != sys.executable:
    os.execv(_venv_python(), [_venv_python(), str(Path(__file__).resolve()), *sys.argv[1:]])

sys.path.insert(0, API_DIR)
from sqlalchemy import Column, ForeignKeyConstraint, Index, Integer, MetaData, Table  # noqa: E402
from sqlalchemy.dialects import postgresql  # noqa: E402

from app.migrations import (  # noqa: E402
    _CHECK_SQLTEXT_ALLOWLIST,
    _check_sqltext_ok,
    _column_ddl,
    _constraint_name,
    _fk_constraint_ddl,
    _fk_ondelete,
    _index_ddl,
    _lit,
    _nullable_contract_violations,
    _q,
    _unique_constraint_ddl,
)

# #907/#908 — the models carry composite / created_at indexes in __table_args__
# so BOTH fresh-DB create_all and existing-DB apply_index_migrations get them.
from app.models import LearningStory, ProgressEvent  # noqa: E402

dialect = postgresql.dialect()
fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


# ── _q (#1794) ────────────────────────────────────────────────────────────────
check('_q("kids")', _q("kids"), '"kids"')
check('_q(\'a"b\')', _q('a"b'), '"a""b"')

# ── _constraint_name (#1798) ──────────────────────────────────────────────────
check("short name unchanged", _constraint_name("uq", ["kids", "email"]), "uq_kids_email")
check(
    "short name with ref unchanged",
    _constraint_name("fk", ["kids", "profile_id"], ref="profiles"),
    "fk_kids_profile_id_ref_profiles",
)
_long_parts = ["averylongtable", "column_one", "column_two", "column_three", "column_four"]
_long_ref = "another_extremely_long_referred_table_name_pushing_past_sixty_three"
_long_name = _constraint_name("fk", _long_parts, ref=_long_ref)
check("long name truncated to ≤63", len(_long_name) <= 63, True)
check(
    "long name stable (same input twice)",
    _constraint_name("fk", _long_parts, ref=_long_ref),
    _long_name,
)
_other_long_name = _constraint_name(
    "fk", ["averylongtable", "column_one", "column_two", "column_three", "column_FIVE"], ref=_long_ref
)
check("different long inputs differ", _other_long_name != _long_name, True)

# ── _column_ddl (#1796) ───────────────────────────────────────────────────────
# _column_ddl returns SQLAlchemy's Compiled object (it stringifies inside the
# migrations' f-strings), so stringify it explicitly for membership asserts.
_force = str(_column_ddl(Column("x", Integer), dialect, force_nullable=True))
check("force_nullable drops NOT NULL", "NOT NULL" not in _force, True)
_notnull = str(_column_ddl(Column("x", Integer, nullable=False), dialect, force_nullable=False))
check("nullable=False keeps NOT NULL", "NOT NULL" in _notnull, True)
_wallet = str(_column_ddl(Column("x", Integer, server_default="0", nullable=False), dialect, force_nullable=False))
check("server_default + NOT NULL still emits NOT NULL", "NOT NULL" in _wallet, True)

# ── _index_ddl (#1795) ────────────────────────────────────────────────────────
_md = MetaData()
_tbl = Table("kids", _md, Column("id", Integer), Column("a", Integer))
_plain = _index_ddl(Index("ix_kids_a", _tbl.c.a), dialect)
check("plain index starts CREATE INDEX IF NOT EXISTS", _plain.startswith("CREATE INDEX IF NOT EXISTS"), True)
_unique = _index_ddl(Index("ix_kids_a", _tbl.c.a, unique=True), dialect)
check(
    "unique index starts CREATE UNIQUE INDEX IF NOT EXISTS",
    _unique.startswith("CREATE UNIQUE INDEX IF NOT EXISTS"),
    True,
)

# ── _fk_ondelete (#1681) ──────────────────────────────────────────────────────
_fk_md = MetaData()
_fk_parent = Table("organizations", _fk_md, Column("id", Integer, primary_key=True))
_fk_cascade = ForeignKeyConstraint(
    ["tenant_id"], ["organizations.id"], ondelete="CASCADE"
)
check("_fk_ondelete CASCADE", _fk_ondelete(_fk_cascade), "CASCADE")
_fk_setnull = ForeignKeyConstraint(
    ["tenant_id"], ["organizations.id"], ondelete="SET NULL"
)
check("_fk_ondelete SET NULL", _fk_ondelete(_fk_setnull), "SET NULL")
_fk_restrict = ForeignKeyConstraint(
    ["tenant_id"], ["organizations.id"], ondelete="RESTRICT"
)
check("_fk_ondelete RESTRICT", _fk_ondelete(_fk_restrict), "RESTRICT")
_fk_none = ForeignKeyConstraint(["tenant_id"], ["organizations.id"])
check("_fk_ondelete undeclared → None", _fk_ondelete(_fk_none), None)

# ── _check_sqltext_ok (#1793) ─────────────────────────────────────────────────
for _expr in sorted(_CHECK_SQLTEXT_ALLOWLIST["kid_settings"]):
    check(f"kid_settings allowlisted: {_expr[:44]}…", _check_sqltext_ok("kid_settings", _expr), True)
check("unregistered expression refused", _check_sqltext_ok("kid_settings", "1 = 1; DROP TABLE kids"), False)
check("unknown table refused", _check_sqltext_ok("not_a_table", "1 = 1"), False)

# ── model index declarations (#907, #908) ─────────────────────────────────────
# The indexes must be declared on the MODELS (not just the migration harness)
# so a fresh DB gets them from create_all and the existing-DB path picks them
# up from table.indexes. Assert the name + column set SQLAlchemy would compile.


def _index_cols(idx) -> tuple:
    return tuple(c.name for c in idx.columns)


_prog_indexes = {i.name: _index_cols(i) for i in ProgressEvent.__table__.indexes}
check(
    "ProgressEvent composite (kid_id, id) index (#907)",
    _prog_indexes.get("ix_progress_events_kid_id_id"),
    ("kid_id", "id"),
)
_story_indexes = {i.name: _index_cols(i) for i in LearningStory.__table__.indexes}
check(
    "LearningStory created_at index (#908)",
    _story_indexes.get("ix_learning_stories_created_at"),
    ("created_at",),
)
check(
    "LearningStory (kid_id, created_at) index (#908)",
    _story_indexes.get("ix_learning_stories_kid_id_created_at"),
    ("kid_id", "created_at"),
)

# ── _unique_constraint_ddl (#2882/#2885) ─────────────────────────────────────
_uniq = _unique_constraint_ddl("progress_events", "uq_progress_events_kid_uid", 'kid_id, "uid"')
check("unique DDL wraps ADD CONSTRAINT in DO block", _uniq.startswith("DO $$"), True)
check("unique DDL has the ADD CONSTRAINT UNIQUE", "ADD CONSTRAINT \"uq_progress_events_kid_uid\" UNIQUE" in _uniq, True)
check("unique DDL swallows duplicate_object (#2882)", "WHEN duplicate_object THEN NULL" in _uniq, True)
check("unique DDL records unique_violation (#2885)", "WHEN unique_violation THEN" in _uniq, True)
check("unique DDL writes schema_migrations ledger (#2885)", "INSERT INTO schema_migrations" in _uniq, True)

# ── _fk_constraint_ddl (#2882) ───────────────────────────────────────────────
_fkddl = _fk_constraint_ddl(
    "kids", "fk_kids_profile_id_ref_profiles",
    ("profile_id",), "profiles", ("id",), " ON DELETE CASCADE",
)
check("fk DDL wraps ADD CONSTRAINT in DO block", _fkddl.startswith("DO $$"), True)
check("fk DDL carries ON DELETE CASCADE (#2883)", " ON DELETE CASCADE" in _fkddl, True)
check("fk DDL swallows duplicate_object (#2882)", "WHEN duplicate_object THEN NULL" in _fkddl, True)

# ── _lit (#2885 literal escaping) ────────────────────────────────────────────
check('_lit plain', _lit("kids.email"), "'kids.email'")
check('_lit escapes a quote', _lit("a'b"), "'a''b'")

# ── _nullable_contract_violations (#2888) ────────────────────────────────────
# A NOT NULL, no-server_default model column whose LIVE column is NULLABLE is a
# violation. `share_tokens.kid_id` is `nullable=False` with no server_default
# (see models.py), so flag it when the live schema reports it nullable; a clean
# schema (no nullable=True on any NOT NULL column) reports nothing.
_no_viol = _nullable_contract_violations({})
check("no tables → no violations", _no_viol, [])
_drift = _nullable_contract_violations({"share_tokens": {"kid_id": True}})
check("share_tokens.kid_id weakened to nullable → detected", "share_tokens.kid_id" in _drift, True)
_clean = _nullable_contract_violations({"share_tokens": {"kid_id": False}})
check("share_tokens.kid_id properly NOT NULL → clean", _clean, [])

print("─" * 30)
if fails:
    print(f"✖ {len(fails)} failed: {fails}")
    sys.exit(1)
print("✓ all migrations-DDL checks passed")
