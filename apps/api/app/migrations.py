"""Schema drift protection — idempotent column/index/constraint migrations (#388, #910).

`Base.metadata.create_all` creates MISSING TABLES but NEVER alters an existing
table to add a new COLUMN, INDEX, or CONSTRAINT, and never changes a column's
type. So the first deploy whose image carries a model change crashes the API on
an existing database (the #330 `aggregate_opt_in` outage: `UndefinedColumn` on
every boot → all auth 502'd).

This module diffs every mapped table against the live schema and applies, in
order, whatever the model knows that the database doesn't:
  1. missing COLUMNS (`ADD COLUMN IF NOT EXISTS`);
  2. naive TIMESTAMP → timezone-aware TIMESTAMPTZ (#906);
  3. missing UNIQUE / CHECK constraints (#909, #915);
  4. missing INDEXES (#907, #908, #914);
  5. idempotent one-time data backfills (#912).

It runs every boot AFTER create_all, so:
  · a fresh DB is untouched (create_all already made everything);
  · an existing DB gains the missing schema automatically;
  · when nothing changed it costs one inspector query and zero DDL.
"""

import logging

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, UniqueConstraint, inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateColumn, CreateIndex

from .db import Base, engine

log = logging.getLogger(__name__)


# ── pure DDL-string helpers (#1793–#1798) ────────────────────────────────────
# Every interpolated identifier is routed through `_q` so a table/constraint/
# column name can never be an injection vector (#1794). CHECK expressions are
# gated by an explicit allowlist (#1793). Auto-generated constraint names are
# truncated to PostgreSQL's 63-char identifier limit with a stable hash suffix
# (#1798). All of these are pure functions — no engine access — so the DDL can
# be unit-tested without a database.


def _q(name: str) -> str:
    """Quote a PostgreSQL identifier. Doubles any embedded double quote."""
    return '"' + name.replace('"', '""') + '"'


def _column_ddl(col, dialect, *, force_nullable: bool) -> str:
    """Compile one column's ADD COLUMN clause through CreateColumn uniformly
    (#1796). force_nullable=True emits the column WITHOUT 'NOT NULL' so a
    populated table can gain a column that has no server default."""
    if force_nullable:
        from sqlalchemy import Column

        return CreateColumn(Column(col.name, col.type, nullable=True)).compile(dialect=dialect)
    return CreateColumn(col).compile(dialect=dialect)


def _constraint_name(prefix: str, parts: list[str], *, ref: str | None = None) -> str:
    """#1798 — synthesize a constraint name, truncated to PostgreSQL's 63-char
    identifier limit with a stable 8-hex sha256 suffix so long names never
    collide and never crash boot."""
    base = f"{prefix}_{'_'.join(parts)}"
    if ref is not None:
        base = f"{base}_ref_{ref}"
    if len(base) <= 63:
        return base
    import hashlib

    h = hashlib.sha256(base.encode("utf-8")).hexdigest()[:8]
    return base[: 63 - 9] + "_" + h


def _index_ddl(index, dialect) -> str:
    """#1795 — compile CREATE [UNIQUE] INDEX IF NOT EXISTS via SQLAlchemy's
    own if_not_exists flag (no string slicing of the emitted prefix)."""
    return CreateIndex(index, if_not_exists=True).compile(dialect=dialect).string


_CHECK_SQLTEXT_ALLOWLIST: dict[str, set[str]] = {
    # #1793 — every CheckConstraint a model declares must be registered here
    # VERBATIM (extract each `str(c.sqltext)` from models.py at write time and
    # paste the exact string). A model CHECK that is not allowlisted REFUSES to
    # boot, so new expressions are always reviewed, never silently executed.
    "kid_settings": {
        "weekday_limits_min IS NULL OR weekday_limits_min ~ '^([0-9]{1,3},){6}[0-9]{1,3}$'",
        "quiet_windows IS NULL OR quiet_windows ~ '^(-|[0-9]{1,2}:[0-9]{2}-[0-9]{1,2}:[0-9]{2})(,(-|[0-9]{1,2}:[0-9]{2}-[0-9]{1,2}:[0-9]{2})){6}$'",
        "moni_strictness IS NULL OR moni_strictness IN ('gentle', 'steady', 'challenging')",
    },
}


def _check_sqltext_ok(table_name: str, sqltext: str) -> bool:
    """#1793 — only allowlist-registered CHECK expressions are executed."""
    return sqltext in _CHECK_SQLTEXT_ALLOWLIST.get(table_name, set())


async def apply_column_migrations() -> list[str]:
    """Add any columns the models declare that the DB doesn't have. Returns the
    list of `table.column` names added (empty when up to date). Never raises on
    a populated table — see module docstring."""
    dialect = postgresql.dialect()
    added: list[str] = []

    def _existing(sync_conn) -> dict[str, set[str]]:
        insp = inspect(sync_conn)
        return {t: {c["name"] for c in insp.get_columns(t)} for t in insp.get_table_names()}

    async with engine.begin() as conn:
        existing = await conn.run_sync(_existing)
        for table in Base.metadata.sorted_tables:
            have = existing.get(table.name)
            if have is None:
                continue  # brand-new table — create_all already made it
            for col in table.columns:
                if col.name in have or col.primary_key:
                    continue
                # A NOT NULL column with no server_default would fail on a
                # table that already has rows — add it NULLABLE (safe; the app
                # treats None as the default). The models that are NOT NULL
                # carry a server_default, so this is only a safety net.
                force_nullable = col.nullable is False and col.server_default is None
                ddl = (
                    f"ALTER TABLE {_q(table.name)} "
                    f"ADD COLUMN IF NOT EXISTS {_column_ddl(col, dialect, force_nullable=force_nullable)}"
                )
                await conn.execute(text(ddl))
                added.append(f"{table.name}.{col.name}")
                log.warning("migrated missing column %s.%s", table.name, col.name)

    # #1550 — share-token rotation audit columns. Added here as idempotent ALTERs
    # (not on the Kid ORM model, which a sibling change owns) so an existing
    # `kids` table gains the timestamps without a hand-written migration file.
    # #1797 — identifier interpolations still use f-strings but are routed through
    # the quoting helper so they can never become an injection vector.
    async with engine.begin() as conn:
        for name in ("share_token_created_at", "share_token_revoked_at"):
            await conn.execute(
                text(f'ALTER TABLE {_q("kids")} ADD COLUMN IF NOT EXISTS {_q(name)} TIMESTAMPTZ')
            )
            added.append(f"kids.{name}")

    # #1534 — Web Push subscription storage. `create_all` already creates this
    # table from the PushSubscription model on a fresh DB (and on an existing DB
    # that lacks the table), but issue the same DDL here explicitly so the table
    # and its profile_id index are idempotently present even if create_all ever
    # changes behavior. The billing `subscriptions` table is intentionally left
    # untouched; Web Push lives in this separate `push_subscriptions` table.
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS push_subscriptions ("
                "id UUID PRIMARY KEY, "
                "profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, "
                "endpoint TEXT NOT NULL UNIQUE, "
                "p256dh TEXT NOT NULL, "
                "auth TEXT NOT NULL, "
                "created_at TIMESTAMPTZ NOT NULL DEFAULT now()"
                ")"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_push_subscriptions_profile_id "
                "ON push_subscriptions (profile_id)"
            )
        )
        added.append("push_subscriptions")
        added.append("push_subscriptions.profile_id")

    return added


async def apply_type_migrations() -> list[str]:
    """#906/#910 — make every model DateTime(timezone=True) column a real
    `TIMESTAMPTZ`. Existing values were written as naive UTC, so `AT TIME ZONE
    'UTC'` preserves the instant instead of reinterpreting it in the server's
    session timezone."""
    altered: list[str] = []

    def _existing(sync_conn) -> dict[str, dict[str, object]]:
        insp = inspect(sync_conn)
        out: dict[str, dict[str, object]] = {}
        for t in insp.get_table_names():
            out[t] = {c["name"]: c.get("type") for c in insp.get_columns(t)}
        return out

    async with engine.begin() as conn:
        existing = await conn.run_sync(_existing)
        for table in Base.metadata.sorted_tables:
            live = existing.get(table.name)
            if live is None:
                continue  # brand-new table — create_all already made it tz-aware
            for col in table.columns:
                if not isinstance(col.type, DateTime) or not getattr(col.type, "timezone", False):
                    continue
                live_type = live.get(col.name)
                if live_type is None:
                    continue
                # The reflected type object carries the real `timezone` flag;
                # `str(type)` is just "TIMESTAMP" for both variants.
                if not isinstance(live_type, DateTime) or getattr(live_type, "timezone", False):
                    continue
                ddl = (
                    f"ALTER TABLE {_q(table.name)} ALTER COLUMN {_q(col.name)} "
                    f"TYPE TIMESTAMPTZ USING {_q(col.name)} AT TIME ZONE 'UTC'"
                )
                await conn.execute(text(ddl))
                altered.append(f"{table.name}.{col.name}")
                log.warning("migrated column type %s.%s to TIMESTAMPTZ", table.name, col.name)
    return altered


async def _dedupe_subscriptions(conn) -> None:
    """#909 — before the profile_id unique constraint can be created on an
    existing DB, collapse any legacy duplicate subscription rows down to one
    per profile (latest created_at wins; id breaks ties deterministically)."""
    await conn.execute(
        text(
            "DELETE FROM subscriptions a "
            "USING subscriptions b "
            "WHERE a.profile_id = b.profile_id "
            "AND ("
            "a.created_at < b.created_at "
            "OR (a.created_at = b.created_at AND a.id < b.id)"
            ")"
        )
    )


async def apply_constraint_migrations() -> list[str]:
    """#910 — add model-declared UNIQUE and CHECK constraints that `create_all`
    can't add to an existing table. UNIQUE constraints are added after a
    subscriptions dedupe (#909). CHECK constraints are added `NOT VALID` so a
    populated table with a legacy malformed row can still boot while every
    future write is guarded."""
    added: list[str] = []

    def _existing(sync_conn) -> dict[str, dict[str, set[tuple]]]:
        insp = inspect(sync_conn)
        out: dict[str, dict[str, set[tuple]]] = {}
        for t in insp.get_table_names():
            pk = insp.get_pk_constraint(t)
            out[t] = {
                "unique": {c["name"] for c in insp.get_unique_constraints(t)},
                "unique_cols": {tuple(c["column_names"]) for c in insp.get_unique_constraints(t)},
                # #— the PRIMARY KEY is also a unique constraint, but the inspector's
                # get_unique_constraints() does NOT report it. A model-declared
                # UniqueConstraint whose columns are already covered by the PK must
                # not be re-added (name collides → every boot crashes).
                "pk_cols": tuple(pk["constrained_columns"] or []),
                "check": {c["name"] for c in insp.get_check_constraints(t)},
                "foreign": {
                    (
                        tuple(fk["constrained_columns"]),
                        fk["referred_table"],
                        tuple(fk["referred_columns"]),
                    )
                    for fk in insp.get_foreign_keys(t)
                },
            }
        return out

    async with engine.begin() as conn:
        await _dedupe_subscriptions(conn)
        existing = await conn.run_sync(_existing)
        for table in Base.metadata.sorted_tables:
            have = existing.get(table.name)
            if have is None:
                continue  # brand-new table — create_all already made constraints
            for constraint in table.constraints:
                if isinstance(constraint, UniqueConstraint):
                    cols = tuple(c.name for c in constraint.columns)
                    # #— the PK already enforces uniqueness on these columns (a
                    # PK is a unique constraint; get_unique_constraints() just
                    # doesn't report it as one). Re-adding would collide on the
                    # PK's name → DuplicateTable on every boot.
                    if cols in have["unique_cols"] or set(cols) <= set(have["pk_cols"]):
                        continue
                    name = constraint.name or _constraint_name("uq", [table.name, *cols])
                    col_sql = ", ".join(_q(c) for c in cols)
                    await conn.execute(
                        text(
                            f"ALTER TABLE {_q(table.name)} "
                            f"ADD CONSTRAINT {_q(name)} UNIQUE ({col_sql})"
                        )
                    )
                    added.append(f"{table.name}.{name}")
                    log.warning("migrated missing unique constraint %s.%s", table.name, name)
                elif isinstance(constraint, CheckConstraint):
                    if constraint.name in have["check"]:
                        continue
                    sqltext = str(constraint.sqltext)
                    if not _check_sqltext_ok(table.name, sqltext):
                        raise RuntimeError(
                            f"refusing to create CHECK constraint {table.name}.{constraint.name}: "
                            f"expression is not registered in _CHECK_SQLTEXT_ALLOWLIST — add "
                            f"{sqltext!r} to the allowlist after review"
                        )
                    await conn.execute(
                        text(
                            f"ALTER TABLE {_q(table.name)} "
                            f"ADD CONSTRAINT {_q(constraint.name)} CHECK ({sqltext}) NOT VALID"
                        )
                    )
                    added.append(f"{table.name}.{constraint.name}")
                    log.warning("migrated missing check constraint %s.%s", table.name, constraint.name)
                elif isinstance(constraint, ForeignKeyConstraint):
                    cols = tuple(constraint.column_keys)
                    referred_table = constraint.elements[0].column.table.name
                    referred_cols = tuple(el.column.name for el in constraint.elements)
                    key = (cols, referred_table, referred_cols)
                    if key in have["foreign"]:
                        continue
                    name = constraint.name or _constraint_name(
                        "fk", [table.name, *cols], ref=referred_table
                    )
                    await conn.execute(
                        text(
                            f"ALTER TABLE {_q(table.name)} ADD CONSTRAINT {_q(name)} "
                            f"FOREIGN KEY ({', '.join(_q(c) for c in cols)}) "
                            f"REFERENCES {_q(referred_table)} ({', '.join(_q(c) for c in referred_cols)})"
                        )
                    )
                    added.append(f"{table.name}.{name}")
                    log.warning("migrated missing foreign key %s.%s", table.name, name)
    return added


async def apply_index_migrations() -> list[str]:
    """#910 — add model-declared indexes (including composite indexes) that
    `create_all` can't add to an existing table."""
    dialect = postgresql.dialect()
    added: list[str] = []

    def _existing(sync_conn) -> dict[str, set[str]]:
        insp = inspect(sync_conn)
        return {t: {ix["name"] for ix in insp.get_indexes(t)} for t in insp.get_table_names()}

    async with engine.begin() as conn:
        existing = await conn.run_sync(_existing)
        for table in Base.metadata.sorted_tables:
            have = existing.get(table.name)
            if have is None:
                continue  # brand-new table — create_all already made indexes
            for index in table.indexes:
                if index.name in have:
                    continue
                await conn.execute(text(_index_ddl(index, dialect)))
                added.append(f"{table.name}.{index.name}")
                log.warning("migrated missing index %s.%s", table.name, index.name)
    return added


async def apply_data_backfills() -> list[str]:
    """#912 — one-time backfill: skills already ≥80% before the mastered_at
    column existed get the best proxy we have. Falls back through last_practice
    → last_decay → now() so kids whose last_practice is NULL are no longer
    silently skipped. Future crossings are stamped exactly at the moment
    mastery first hits 80%. Runs every boot but only touches NULL rows, so it's
    idempotent."""
    backfilled: list[str] = []
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE skill_mastery "
                "SET mastered_at = COALESCE(last_practice, last_decay, now()) "
                "WHERE mastered_at IS NULL AND mastery >= 0.8"
            )
        )
    backfilled.append("skill_mastery.mastered_at")

    # #942 — backfill synthetic uids for legacy NULL-uid story rows so every
    # row is dedupable. The synthetic uid is a UUID v4 so it never collides
    # with a client-generated uid. Only touches rows WHERE uid IS NULL, so it's
    # idempotent.
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE learning_stories "
                "SET uid = gen_random_uuid()::text "
                "WHERE uid IS NULL"
            )
        )
    backfilled.append("learning_stories.uid")
    return backfilled


async def apply_migrations() -> list[str]:
    """#910 — the full boot-time migration sequence."""
    applied: list[str] = []
    applied += await apply_column_migrations()
    applied += await apply_type_migrations()
    applied += await apply_constraint_migrations()
    applied += await apply_index_migrations()
    applied += await apply_data_backfills()
    return applied
