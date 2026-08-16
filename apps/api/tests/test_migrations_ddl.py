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
from sqlalchemy import Column, Index, Integer, MetaData, Table  # noqa: E402
from sqlalchemy.dialects import postgresql  # noqa: E402

from app.migrations import (  # noqa: E402
    _CHECK_SQLTEXT_ALLOWLIST,
    _check_sqltext_ok,
    _column_ddl,
    _constraint_name,
    _index_ddl,
    _q,
)

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

# ── _check_sqltext_ok (#1793) ─────────────────────────────────────────────────
for _expr in sorted(_CHECK_SQLTEXT_ALLOWLIST["kid_settings"]):
    check(f"kid_settings allowlisted: {_expr[:44]}…", _check_sqltext_ok("kid_settings", _expr), True)
check("unregistered expression refused", _check_sqltext_ok("kid_settings", "1 = 1; DROP TABLE kids"), False)
check("unknown table refused", _check_sqltext_ok("not_a_table", "1 = 1"), False)

print("─" * 30)
if fails:
    print(f"✖ {len(fails)} failed: {fails}")
    sys.exit(1)
print("✓ all migrations-DDL checks passed")
