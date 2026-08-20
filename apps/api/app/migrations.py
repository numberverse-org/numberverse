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

# #2882 — a single global advisory-lock key serializes ALL boot-time migration
# DDL across API processes. Two boots racing an overlapping container recreate /
# crash-restart / future multi-worker setup can both pass the inspector check and
# then both issue the same `ADD CONSTRAINT`; the loser aborts with DuplicateObject
# and the API 502s on every boot until the constraint exists. `pg_advisory_xact_lock`
# is a transaction-scoped lock: the boot that holds it checks + applies, commits,
# and releases; the next boot then inspects a schema that already has the object
# and skips it. The value is an arbitrary app-wide constant (no collision with the
# transaction-level advisory locks other code may take).
_MIGRATION_ADVISORY_LOCK_KEY = 7_477_199  # stable, app-wide numeral

# #2885 — migration failures that are NOT fatal (legacy data defeats a UNIQUE
# constraint, an FK can't be added) are recorded in this table instead of killing
# the boot, so the API starts degraded-but-up and the operator can inspect
# `/admin/migrations/status` rather than reading a crash-loop from container logs.
# The table is created idempotently by apply_migrations (never part of
# Base.metadata / create_all, so it has no ORM model to fall out of sync).
_SCHEMA_MIGRATIONS_DDL = (
    "CREATE TABLE IF NOT EXISTS schema_migrations ("
    "key TEXT PRIMARY KEY, "
    "status TEXT NOT NULL, "
    "detail TEXT, "
    "at TIMESTAMPTZ NOT NULL DEFAULT now()"
    ")"
)


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


def _fk_ondelete(constraint: ForeignKeyConstraint) -> str | None:
    """#1681 — the model-declared ON DELETE action for a ForeignKeyConstraint.

    Returns the action ('CASCADE', 'SET NULL', ...) when every column of the
    constraint declares the SAME action, else None (which means PostgreSQL's
    default, NO ACTION). Pure function — the DDL tests exercise it without a
    database."""
    actions = {el.ondelete for el in constraint.elements if el.ondelete}
    if len(actions) == 1:
        return next(iter(actions))
    return None


def _nullable_contract_violations(live_schema: dict[str, dict[str, bool]]) -> list[str]:
    """#2888 — detect the NOT NULL/no-default drift the column-migration safety
    net can introduce.

    `apply_column_migrations` deliberately adds a model column that is
    `nullable=False` with no `server_default` as NULLABLE (so it never fails on a
    populated table), but nothing afterwards enforced the contract — the next
    boot saw the column exists and skipped it forever, leaving the app believing
    NOT NULL while the DB holds NULLs for every pre-existing row.

    `live_schema` maps table name → (column name → live `nullable`), the same
    shape `_existing` produces. Returns a list of `table.column` entries whose
    model is NOT NULL + no server_default but whose live column is NULLABLE —
    i.e. the columns the safety net silently weakened. Pure function; the DDL
    tests exercise it without a database by passing a hand-built dict.
    """
    violations: list[str] = []
    for table in Base.metadata.sorted_tables:
        cols = live_schema.get(table.name)
        if cols is None:
            continue
        for col in table.columns:
            if col.primary_key:
                continue
            if col.nullable is False and col.server_default is None:
                if cols.get(col.name) is True:
                    violations.append(f"{table.name}.{col.name}")
    return violations


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


def _unique_constraint_ddl(table_name: str, name: str, col_sql: str) -> str:
    """#2882/#2885 — add a UNIQUE constraint idempotently and with a circuit
    breaker. PostgreSQL has no `ADD CONSTRAINT ... IF NOT EXISTS`, so wrap the
    `ALTER TABLE` in a `DO $$` block:

      · `duplicate_object` (42710) — a concurrent boot already added it → NO-OP
        (the #2882 race, made harmless);
      · `unique_violation` (23505) — legacy data defeats the dedupe → the boot
        records the failure in `schema_migrations` and CONTINUES degraded (#2885)
        instead of crash-looping the API.

    Every identifier is already quoted by the caller via `_q`.
    """
    stmt = f"ALTER TABLE {_q(table_name)} ADD CONSTRAINT {_q(name)} UNIQUE ({col_sql})"
    # Quote the name/key for the INSERT's literal; `key` is synthesized from
    # `table.name` so it is a stable, operator-readable identifier.
    err_key = f"{table_name}.{name}"
    return (
        "DO $$\n"
        "BEGIN\n"
        f"  {stmt};\n"
        "EXCEPTION\n"
        "  WHEN duplicate_object THEN NULL;\n"
        "  WHEN unique_violation THEN\n"
        f"    INSERT INTO schema_migrations (key, status, detail) "
        f"VALUES ({_lit(err_key)}, 'failed_unique', 'legacy data violates the unique constraint');\n"
        "END\n"
        "$$;"
    )


def _fk_constraint_ddl(
    table_name: str,
    name: str,
    cols: tuple[str, ...],
    referred_table: str,
    referred_cols: tuple[str, ...],
    ondelete_clause: str,
) -> str:
    """#2882 — add a FK constraint idempotently (no IF NOT EXISTS for FKs
    either), swallowing `duplicate_object` from a concurrent boot. The ON DELETE
    action (#2883) is embedded in the emitted DDL so the FK matches the model."""
    stmt = (
        f"ALTER TABLE {_q(table_name)} ADD CONSTRAINT {_q(name)} "
        f"FOREIGN KEY ({', '.join(_q(c) for c in cols)}) "
        f"REFERENCES {_q(referred_table)} ({', '.join(_q(c) for c in referred_cols)})"
        f"{ondelete_clause}"
    )
    return (
        "DO $$\n"
        "BEGIN\n"
        f"  {stmt};\n"
        "EXCEPTION WHEN duplicate_object THEN NULL;\n"
        "END\n"
        "$$;"
    )


def _lit(s: str) -> str:
    """Escape a string as a PostgreSQL single-quoted literal (double any
    embedded single quote). Used only for `schema_migrations` failure values."""
    return "'" + s.replace("'", "''") + "'"


async def apply_column_migrations() -> list[str]:
    """Add any columns the models declare that the DB doesn't have. Returns the
    list of `table.column` names added (empty when up to date). Never raises on
    a populated table — see module docstring."""
    dialect = postgresql.dialect()
    added: list[str] = []

    # #2889 — the whole diff is computed once against a single inspector snapshot
    # taken under the advisory lock, so every subsequent gate (kids ALTERs, the
    # push/parent/share CREATE TABLE + index) only fires when the object is
    # actually missing. An up-to-date DB costs one inspector query and zero DDL.
    def _snapshot(sync_conn) -> dict[str, dict[str, set[str]]]:
        insp = inspect(sync_conn)
        out: dict[str, dict[str, set[str]]] = {}
        for t in insp.get_table_names():
            out[t] = {
                "columns": {c["name"] for c in insp.get_columns(t)},
                "indexes": {ix["name"] for ix in insp.get_indexes(t)},
            }
        return out

    async with engine.begin() as conn:
        await conn.execute(text(f"SELECT pg_advisory_xact_lock({_MIGRATION_ADVISORY_LOCK_KEY})"))
        # #2885 — the failure ledger must exist before any constraint path can
        # record into it; create it under the same advisory lock.
        await conn.execute(text(_SCHEMA_MIGRATIONS_DDL))
        snap = await conn.run_sync(_snapshot)

        for table in Base.metadata.sorted_tables:
            have = snap.get(table.name)
            if have is None:
                continue  # brand-new table — create_all already made it
            for col in table.columns:
                if col.name in have["columns"] or col.primary_key:
                    continue
                # A NOT NULL column with no server_default would fail on a
                # table that already has rows — add it NULLABLE (safe; the app
                # treats None as the default). The models that are NOT NULL
                # carry a server_default, so this is only a safety net. #2888 —
                # the contract pass below now detects and rejects this drift.
                force_nullable = col.nullable is False and col.server_default is None
                ddl = (
                    f"ALTER TABLE {_q(table.name)} "
                    f"ADD COLUMN IF NOT EXISTS {_column_ddl(col, dialect, force_nullable=force_nullable)}"
                )
                await conn.execute(text(ddl))
                added.append(f"{table.name}.{col.name}")
                log.warning("migrated missing column %s.%s", table.name, col.name)

        # #1550 — share-token rotation audit columns. Idempotent ALTERs (not on
        # the Kid ORM model, which a sibling change owns) so an existing `kids`
        # table gains the timestamps without a hand-written migration file.
        # #2889 — gate each column on the snapshot: only ALTER `kids` when the
        # column is actually missing, and only `append` when the ALTER ran.
        kids_cols = snap.get("kids", {"columns": set()})["columns"]
        for name in ("share_token_created_at", "share_token_revoked_at"):
            if name in kids_cols:
                continue
            await conn.execute(
                text(f'ALTER TABLE {_q("kids")} ADD COLUMN IF NOT EXISTS {_q(name)} TIMESTAMPTZ')
            )
            added.append(f"kids.{name}")

        # #1534/#1843/#3057 — push_subscriptions, parent_events, share_tokens and
        # their indexes. On a fresh DB `create_all` already made each of these from
        # its ORM model; the explicit DDL here is a belt-and-suspenders fallback
        # for an existing DB. #2889 — gate CREATE TABLE on table absence and
        # CREATE INDEX on index absence so a pristine table emits zero DDL and
        # `added` stays empty.
        extra_tables = [
            ("push_subscriptions", (
                "CREATE TABLE IF NOT EXISTS push_subscriptions ("
                "id UUID PRIMARY KEY, "
                "profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, "
                "endpoint TEXT NOT NULL UNIQUE, "
                "p256dh TEXT NOT NULL, "
                "auth TEXT NOT NULL, "
                "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
                "gone_at TIMESTAMPTZ"
                ")"
            ), "ix_push_subscriptions_profile_id", "ON push_subscriptions (profile_id)"),
            ("parent_events", (
                "CREATE TABLE IF NOT EXISTS parent_events ("
                "id UUID PRIMARY KEY, "
                "profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, "
                "action VARCHAR(32) NOT NULL, "
                "event_type VARCHAR(16) NOT NULL, "
                "target VARCHAR(64), "
                "created_at TIMESTAMPTZ NOT NULL DEFAULT now()"
                ")"
            ), "ix_parent_events_profile_id_created_at", "ON parent_events (profile_id, created_at)"),
            ("share_tokens", (
                "CREATE TABLE IF NOT EXISTS share_tokens ("
                "id UUID PRIMARY KEY, "
                "kid_id UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE, "
                "token_hash VARCHAR(64) NOT NULL UNIQUE, "
                "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
                "revoked_at TIMESTAMPTZ"
                ")"
            ), "ix_share_tokens_kid_id", "ON share_tokens (kid_id)"),
        ]
        for table_name, create_ddl, index_name, index_suffix in extra_tables:
            if table_name not in snap:
                await conn.execute(text(create_ddl))
                added.append(table_name)
            # NOTE: after creating a fresh table, the snapshot still says the
            # index is absent (snapshot was taken before the CREATE), so only
            # consult the live table's indexes via a re-inspection-free shortcut:
            # create_all already indexes these on a fresh DB, so skip the index
            # only when the table pre-existed AND the index was already present.
            preexisting = snap.get(table_name)
            if preexisting is not None and index_name in preexisting["indexes"]:
                continue
            await conn.execute(text(f"CREATE INDEX IF NOT EXISTS {_q(index_name)} {index_suffix}"))
            added.append(f"{table_name}.{index_name}")

        # #2888 — after all column adds, detect any NOT NULL/no-default column the
        # safety net weakened to NULLABLE and refuse to boot silently drifting.
        # Build the live nullable map from the snapshot (columns only — nullable
        # per column comes from a second inspector pass).
        violations = await conn.run_sync(
            _nullable_violations_sync, snap,
        )
        if violations:
            raise RuntimeError(
                "NOT NULL column drift detected: the migration safety net added the "
                "following NOT NULL (no server_default) columns as NULLABLE and no "
                "backfill default exists to enforce the contract — add a server_default "
                "or a one-shot backfill: " + ", ".join(violations)
            )

    return added


def _nullable_violations_sync(sync_conn, snap: dict[str, dict[str, set[str]]]) -> list[str]:
    """Inspect live column nullability and return the #2888 NOT NULL drift list.

    Runs inside the same advisory-lock transaction as apply_column_migrations so
    the nullability read is consistent with the columns just added. Reuses the
    table/column snapshot for existence; only the `nullable` flag is re-read.
    """
    insp = inspect(sync_conn)
    live: dict[str, dict[str, bool]] = {}
    for t in snap:
        live[t] = {c["name"]: bool(c.get("nullable", True)) for c in insp.get_columns(t)}
    return _nullable_contract_violations(live)


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
        await conn.execute(text(f"SELECT pg_advisory_xact_lock({_MIGRATION_ADVISORY_LOCK_KEY})"))
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
                # #1681 — the inspector ALSO reports each existing FK's name and
                # ON DELETE option so the repair pass can drop + re-add an FK
                # whose action predates (or contradicts) the model.
                "foreign": {
                    (
                        tuple(fk["constrained_columns"]),
                        fk["referred_table"],
                        tuple(fk["referred_columns"]),
                    ): {
                        "name": fk["name"],
                        "ondelete": (fk.get("options") or {}).get("ondelete"),
                    }
                    for fk in insp.get_foreign_keys(t)
                },
            }
        return out

    async with engine.begin() as conn:
        # #2882 — serialize constraint DDL against concurrent boots (the check
        # below is re-run under this lock, so the loser sees the winner's result).
        await conn.execute(text(f"SELECT pg_advisory_xact_lock({_MIGRATION_ADVISORY_LOCK_KEY})"))
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
                    # #2882/#2885 — idempotent (duplicate_object no-op) with a
                    # circuit breaker: legacy duplicate data records a failure in
                    # schema_migrations and lets the boot continue degraded.
                    await conn.execute(text(_unique_constraint_ddl(table.name, name, col_sql)))
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
                    name = constraint.name or _constraint_name(
                        "fk", [table.name, *cols], ref=referred_table
                    )
                    # #1681/#1686 — carry the model-declared ON DELETE action
                    # (CASCADE / SET NULL / ...) into the emitted DDL, so a FK
                    # an existing DB gains matches the model today, not just on
                    # a fresh create_all (which can never alter an existing
                    # constraint).
                    ondelete = _fk_ondelete(constraint)
                    ondelete_clause = f" ON DELETE {ondelete}" if ondelete else ""
                    existing = have["foreign"].get(key) if isinstance(have["foreign"], dict) else None
                    if existing is not None:
                        # One-time repair: the DB already has this FK but it was
                        # migrated with NO ON DELETE (or a different one) than the
                        # model now declares. Drop + re-add with the intended
                        # action so it actually applies on existing databases.
                        db_ondelete = existing["ondelete"]
                        if ondelete is not None and (db_ondelete or "").lower() != ondelete.lower():
                            fk_name = existing["name"] or name
                            await conn.execute(
                                text(
                                    f"ALTER TABLE {_q(table.name)} DROP CONSTRAINT {_q(fk_name)}"
                                )
                            )
                            await conn.execute(
                                text(
                                    f"ALTER TABLE {_q(table.name)} ADD CONSTRAINT {_q(fk_name)} "
                                    f"FOREIGN KEY ({', '.join(_q(c) for c in cols)}) "
                                    f"REFERENCES {_q(referred_table)} "
                                    f"({', '.join(_q(c) for c in referred_cols)})"
                                    f"{ondelete_clause}"
                                )
                            )
                            added.append(f"{table.name}.{fk_name}")
                            log.warning(
                                "repaired foreign key %s.%s: ondelete %r -> %r",
                                table.name, fk_name, db_ondelete, ondelete,
                            )
                        continue
                    # #2882 — add the FK idempotently (no IF NOT EXISTS for FKs);
                    # a concurrent boot already present is a duplicate_object no-op.
                    await conn.execute(
                        text(
                            _fk_constraint_ddl(
                                table.name, name, cols, referred_table, referred_cols, ondelete_clause
                            )
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
        await conn.execute(text(f"SELECT pg_advisory_xact_lock({_MIGRATION_ADVISORY_LOCK_KEY})"))
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
