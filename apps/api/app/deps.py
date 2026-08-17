import logging
import uuid
from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from .db import get_db
from .models import OrgMember, Profile, Session, Subscription
from .security import decode_token, sha256_token

log = logging.getLogger("numberverse.deps")

# #868 — authorization-model guardrail. Kid-app devices are parent-credentialed
# TODAY: they authenticate with the parent's token, so they currently inherit
# full parent privileges (settings, reset, export, coins). A future direct-kid-
# auth MUST mint a role="kid" token, and every route must declare its allowed
# roles via `require_role` explicitly. The kid role must NEVER pass
# `require_parent` / `require_admin` / `require_super_admin`.

bearer = HTTPBearer(auto_error=False)


async def resolve_plan(db: AsyncSession, profile: Profile) -> tuple[str, datetime | None]:
    """Resolve a parent's billing entitlement: ("free", None) or ("plus", period_end).

    The SERVER is the strict source of truth — a missing or expired subscription
    is "free". The 30-day offline grace is a CLIENT-side concern: the kid app
    caches this value and only downgrades when a re-check here reports "free".
    """
    sub = await db.scalar(select(Subscription).where(Subscription.profile_id == profile.id))
    if sub is None or sub.plan != "plus":
        return "free", None
    end = sub.current_period_end
    if end is not None and end.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return "free", None
    return "plus", end


async def get_current_profile(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Profile:
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        # #1774 — decode_token routes the verifying key by the token's `kid`
        # claim: current key (jwt_secret) or, during a rotation's grace window,
        # the previous key (jwt_secret_old). Any unknown/mismatched kid or bad
        # signature surfaces as jwt.InvalidTokenError and lands here as a 401.
        payload = decode_token(cred.credentials)
    except jwt.InvalidTokenError as exc:
        # #1631 — only PyJWT's token errors are an auth failure. A misconfigured
        # secret, a broken DB, or a bug inside decode_token must NOT be masked
        # as a fake 401 — unexpected exceptions propagate to the app's global
        # exception handler and become a logged 500. The discarded error is
        # still logged server-side before the client sees the generic 401.
        log.warning("token decode failed: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc

    token_hash = sha256_token(cred.credentials)

    # Revocable session — tokens minted after sessions shipped carry `sid`. The
    # row must exist and not be revoked, else the token is dead even if the JWT
    # itself hasn't expired. Legacy tokens (no sid) are handled below.
    sid = payload.get("sid")
    session: Session | None = None
    if sid:
        try:
            session_id = uuid.UUID(str(sid))
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
        session = await db.scalar(select(Session).where(Session.id == session_id))
        if session is None or session.revoked_at is not None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked — sign in again")
        # #773 — the row stores a one-way fingerprint of the exact token that
        # created it. A validly-signed token that merely carries the right `sid`
        # but not the matching bearer is not the same session.
        if session.token_hash != token_hash:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked — sign in again")

    try:
        profile_id = uuid.UUID(payload.get("sub", ""))
    except (ValueError, AttributeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token subject")
    profile = await db.scalar(select(Profile).where(Profile.id == profile_id))
    if not profile:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Profile not found")

    if sid:
        if session is None or session.profile_id != profile.id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked — sign in again")
        await _touch_session(request, session, db)
    else:
        # Legacy no-sid token: look it up by its fingerprint first so a row that
        # logout/revocation already killed is honoured.
        session = await db.scalar(select(Session).where(Session.token_hash == token_hash))
        if session is not None:
            if session.revoked_at is not None or session.profile_id != profile.id:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked — sign in again")
            await _touch_session(request, session, db)
        else:
            # #865 — if logout-all / password change stamped a legacy cutoff
            # after this token was minted, the token is already dead even though
            # it has no row yet.
            if profile.legacy_sessions_revoked_at is not None:
                iat = payload.get("iat")
                marker_ts = profile.legacy_sessions_revoked_at.replace(
                    tzinfo=timezone.utc
                ).timestamp()
                if isinstance(iat, (int, float)) and iat <= marker_ts:
                    raise HTTPException(
                        status.HTTP_401_UNAUTHORIZED, "Session revoked — sign in again"
                    )
            # Materialize a session row so this legacy token is reachable by
            # logout / logout-all / password-change revocation from now on. Use
            # an insert-on-conflict: two concurrent requests carrying the same
            # legacy token can race here, and the unique token_hash index is the
            # tie-breaker (one insert wins, the other refetches the winner).
            now = datetime.now(timezone.utc)
            insert_stmt = (
                pg_insert(Session)
                .values(
                    id=uuid.uuid4(),
                    profile_id=profile.id,
                    token_hash=token_hash,
                    user_agent=(request.headers.get("user-agent") or "")[:200] or None,
                    ip=request.client.host if request.client else None,
                    last_seen_at=now,
                )
                .on_conflict_do_nothing(index_elements=[Session.token_hash])
                .returning(Session.id)
            )
            inserted_id = (await db.execute(insert_stmt)).scalar_one_or_none()
            if inserted_id is None:
                session = await db.scalar(
                    select(Session).where(Session.token_hash == token_hash)
                )
            else:
                session = await db.get(Session, inserted_id)
            if session is None:  # pragma: no cover — unique index guarantees a row
                raise HTTPException(
                    status.HTTP_401_UNAUTHORIZED, "Session revoked — sign in again"
                )
            await _touch_session(request, session, db, force=True)

    return profile


async def _touch_session(
    request: Request, session: Session, db: AsyncSession, *, force: bool = False
) -> None:
    """Throttled touch: a fresh last_seen for the "active logins" list without
    a write on every request. Timestamp columns are timezone-aware UTC (#906),
    so compare with an aware UTC "now" (naive would TypeError on the subtract).
    `force` also persists a just-materialized legacy-session row."""
    now = datetime.now(timezone.utc)
    if force or not session.last_seen_at or (now - session.last_seen_at).total_seconds() > 300:
        session.last_seen_at = now
        await db.commit()
    request.state.session = session


def require_role(*roles: str):
    """#868 — single role-checking path for every protected route.

    Resolves `get_current_profile`, then allows the request only when
    `profile.role` is one of `roles`. Legacy pre-role rows (`is_admin=True`)
    still pass ANY role check, so existing admin accounts never get locked out
    while the console migrates (#846).

    Today the kid app is parent-credentialed: it reuses the parent's token, so
    its traffic carries the parent's role and currently passes parent routes.
    This factory is the scaffold for direct kid auth — once kids get their own
    tokens, a kid token will carry `role="kid"`, and any route that does not
    explicitly allow "kid" rejects it.
    """
    allowed = set(roles)

    async def _require_role(profile: Profile = Depends(get_current_profile)) -> Profile:
        if profile.role not in allowed and not profile.is_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient privileges")
        return profile

    return _require_role


# #868 — parent routes are role-gated at the "user" boundary. This explicit
# alias documents that kid-role tokens are NOT allowed on parent routes; a
# future role="kid" credential can never silently inherit settings/reset/
# export/coins access.
require_parent = require_role("user", "admin", "super_admin")

# #846 — "admin" and "super_admin" are the real roles; require_admin accepts both.
require_admin = require_role("admin", "super_admin")

# #846 — destructive / tenant-wide operations need the top role.
require_super_admin = require_role("super_admin")


# ═════════════════════════════════════════════════════════════════════════
# Multi-tenancy: scoping & org-member auth (#962-#964, #968)
# ═════════════════════════════════════════════════════════════════════════


def org_scoped(stmt: Select, org_id: uuid.UUID | None) -> Select:
    """#963 — THE single sanctioned way to add a tenant filter to a query.

    Used by every router that reads/writes tenant-scoped data.  When `org_id`
    is None (consumer/single-tenant path), the statement is returned unchanged
    — no extra WHERE clause is added, so null-tenant queries stay fast.

    Usage::

        stmt = org_scoped(select(Kid).where(Kid.id == kid_id), org_id)

    Every model method/property that accesses tenant data MUST route through
    this helper; never hand-roll a `.where(Model.org_id == org_id)` filter
    outside this function.

    The helper recursively walks the statement's FROM elements (handles joins)
    and applies ``org_id`` to EVERY referenced table that exposes an ``org_id``
    column.  This makes org-scoped joins (e.g. SkillMastery JOIN Kid) safe by
    construction: the Kid table in the join is filtered to the caller's org.
    """
    if org_id is None:
        return stmt

    from sqlalchemy.sql.util import find_tables

    seen: set[str] = set()
    for table in find_tables(stmt, check_columns=True):
        # `find_tables` can yield the same table multiple times (once per
        # reference site in the statement); dedupe on table key so we only
        # apply the org filter once per table.
        table_key = f"{table.schema}.{table.name}" if table.schema else table.name
        if table_key in seen:
            continue
        seen.add(table_key)
        if "org_id" in table.c:
            stmt = stmt.where(table.c.org_id == org_id)
    return stmt


def parse_uuid(value: object, what: str = "id") -> uuid.UUID:
    """#1627 — the ONE parser for every client-supplied UUID.

    Path params, headers, and caller-controlled body fields are all untrusted
    input; each malformed value must yield the SAME contract: HTTP 400 with a
    `what`-labelled detail, never an unhandled ValueError → 500. FastAPI's
    native 422 is reserved for schema-level body validation only.

    Usage::

        parse_uuid(raw_path_id)                       # → 400 "Invalid id"
        parse_uuid(header_value, what="X-Org-ID")     # → 400 "Invalid X-Org-ID"
        parse_uuid(body_org_id, what="org_id")        # → 400 "Invalid org_id"
    """
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid {what}") from None


def parse_org_id_header(request: Request) -> uuid.UUID | None:
    """#1628 — the ONE way to read the X-Org-ID header.

    Returns None when the header is absent; a malformed value is a 400 with the
    exact same status + detail at every call site (resolve_org_id,
    require_org_member, the admin router)."""
    header_org = request.headers.get("X-Org-ID")
    if not header_org:
        return None
    return parse_uuid(header_org, what="X-Org-ID")


async def resolve_org_id(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID | None:
    """Resolve the effective org_id for the current request.

    Resolution order:
      1. `request.state.org_id` — set by `require_org_member` (JWT/domain).
      2. X-Org-ID header — explicit override for service accounts.
      3. Hostname-based resolution (future: subdomain → org slug lookup).

    Returns None in the single-tenant (consumer) path.
    """
    # Already resolved by require_org_member.
    org_id = getattr(request.state, "org_id", None)
    if org_id is not None:
        return org_id

    # Explicit header override (service accounts, admin tools). #1628 — one
    # parser so the 400 status + detail match every other X-Org-ID site.
    return parse_org_id_header(request)


async def _resolve_org_member(
    profile: Profile,
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    min_role: str | None,
) -> OrgMember:
    """Resolve and validate an OrgMember row for the given profile + org.

    Raises 403 if the profile is not a member of the org, or if the member's
    role is below the minimum required role.

    Role hierarchy: owner > admin > teacher.
    """
    stmt = select(OrgMember).where(
        OrgMember.org_id == org_id,
        OrgMember.profile_id == profile.id,
    )
    member = await db.scalar(stmt)
    if not member:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Not a member of this organization",
        )
    if min_role:
        _validate_role_hierarchy(member.role, min_role)
    return member


_ROLE_RANK = {"teacher": 0, "admin": 1, "owner": 2}


def _validate_role_hierarchy(actual: str, minimum: str) -> None:
    """Check that `actual` is at least `minimum` in the role hierarchy.

    Raises 403 if the actual role is insufficient. #1629 — the client-facing
    message is intentionally generic: it must not leak the internal role
    vocabulary or the caller's exact role."""
    if _ROLE_RANK.get(actual, -1) < _ROLE_RANK.get(minimum, 0):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient privileges")


def require_org_member(org_id_source: str = "header", min_role: str | None = None):
    """#964 — dependency that resolves an OrgMember and stashes org_id on the request.

    Parameters:
        org_id_source: how to obtain the org_id:
            - "header"    — from X-Org-ID request header (default).
            - "path"      — from a URL path param named `org_id`.
            - "domain"    — from the Host header (future: subdomain→slug lookup).
        min_role: minimum role required ("teacher", "admin", "owner").  None = any member.

    On success, sets `request.state.org_id` and `request.state.org_member` so
    downstream routes can access them.

    Usage::

        @router.get("/org/{org_id}/classrooms")
        async def list_classrooms(
            org_id: uuid.UUID,
            _: OrgMember = Depends(require_org_member("path", min_role="teacher")),
            ...
        ):
            stmt = org_scoped(select(Classroom), org_id)
            ...
    """

    async def _dependency(
        request: Request,
        profile: Profile = Depends(get_current_profile),
        db: AsyncSession = Depends(get_db),
    ) -> OrgMember:
        nonlocal org_id_source

        resolved_org_id: uuid.UUID | None = None

        if org_id_source == "header":
            # #1628 — one parser for X-Org-ID at every call site, so the 400
            # status + detail are identical everywhere.
            resolved_org_id = parse_org_id_header(request)
        elif org_id_source == "path":
            # Extract org_id from path params (FastAPI injects it).
            raw = request.path_params.get("org_id")
            if raw:
                # #1627 — a malformed path org_id is the same 400 contract as
                # every other client-supplied identifier.
                resolved_org_id = (
                    raw if isinstance(raw, uuid.UUID) else parse_uuid(raw, what="org_id")
                )
        elif org_id_source == "domain":
            # Future: resolve org from Host header → org.slug lookup.
            raise HTTPException(
                status.HTTP_501_NOT_IMPLEMENTED,
                "Domain-based org resolution not yet implemented",
            )
        else:
            # #1629 — never echo an internal programming constant to the client;
            # log it server-side and return a generic 500.
            log.warning("require_org_member: unknown org_id_source %r", org_id_source)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "Internal server error",
            )

        if resolved_org_id is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Org ID is required for this endpoint",
            )

        member = await _resolve_org_member(
            profile, db,
            org_id=resolved_org_id,
            min_role=min_role,
        )

        # Stash on request for downstream use.
        request.state.org_id = resolved_org_id
        request.state.org_member = member
        return member

    return _dependency
