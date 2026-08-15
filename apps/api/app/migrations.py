"""Schema drift protection — idempotent column migrations (#388).

`Base.metadata.create_all` creates MISSING TABLES but NEVER alters an existing
table to add a new COLUMN. So the first deploy whose image carries a model
change crashes the API on an existing database (the #330 `aggregate_opt_in`
outage: `UndefinedColumn` on every boot → all auth 502'd).

This module diffs every mapped table against the live schema and issues
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` for anything the model knows that the
database doesn't. It runs every boot AFTER create_all, so:
  · a fresh DB is untouched (create_all already made everything);
  · an existing DB gains new columns automatically, with the column's declared
    server_default, and a NOT NULL column without a default is added NULLABLE
    so a populated table can never reject the migration;
  · when nothing changed it costs one inspector query and zero DDL.
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateColumn

from .db import Base, engine

log = logging.getLogger(__name__)


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
                if col.nullable is False and col.server_default is None:
                    typ = col.type.compile(dialect=dialect)
                    ddl = f'ALTER TABLE {table.name} ADD COLUMN IF NOT EXISTS "{col.name}" {typ}'
                else:
                    ddl = (
                        f"ALTER TABLE {table.name} "
                        f"ADD COLUMN IF NOT EXISTS {CreateColumn(col).compile(dialect=dialect)}"
                    )
                await conn.execute(text(ddl))
                added.append(f"{table.name}.{col.name}")
                log.warning("migrated missing column %s.%s", table.name, col.name)
    # #79 — one-time backfill: skills already ≥80% before the mastered_at column
    # existed get the best proxy we have (their last practice). Future crossings
    # are stamped exactly at the moment mastery first hits 80%. Runs every boot
    # but only touches NULL rows, so it's idempotent.
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE skill_mastery "
                "SET mastered_at = last_practice "
                "WHERE mastered_at IS NULL AND mastery >= 0.8 AND last_practice IS NOT NULL"
            )
        )

    # #1550 — share-token rotation audit columns. Added here as idempotent ALTERs
    # (not on the Kid ORM model, which a sibling change owns) so an existing
    # `kids` table gains the timestamps without a hand-written migration file.
    async with engine.begin() as conn:
        for name in ("share_token_created_at", "share_token_revoked_at"):
            await conn.execute(text(f'ALTER TABLE kids ADD COLUMN IF NOT EXISTS "{name}" TIMESTAMPTZ'))
            added.append(f"kids.{name}")

    return added
