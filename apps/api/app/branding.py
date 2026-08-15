"""#965 — TenantConfig → effective branding resolver (global-first, org-override).

The B2B branding promise (MONETIZATION.md §1: "their branding — logo, colors,
app name, domain") sits on the tenant axis.  This module provides the single
resolver that composes the effective branding for a request:

  org row  →  global row (org_id IS NULL)  →  hardcoded Numberverse defaults

Each field falls back independently (field-by-field override), so an org that
only sets a logo still inherits the global app name and default colors.

The global default row lives in the `tenant_config` table with `org_id = NULL`.
At most one such row is enforced at the application layer (the DB unique
constraint permits many NULLs).
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import TenantConfig

log = logging.getLogger("numberverse.branding")

# Hardcoded Numberverse defaults (the "no row anywhere" fallback).
NUMBERVERSE_DEFAULTS: dict[str, Any] = {
    "brand_name": "Numberverse",
    "logo_url": None,
    "primary_color": "#4F46E5",  # indigo-600
    "accent_color": "#F59E0B",   # amber-500
    "domains": [],
    "default_locale": "en",
    "feature_flags": {},
}


@dataclass
class Branding:
    """The effective (resolved) branding for one org or the global consumer."""

    brand_name: str = NUMBERVERSE_DEFAULTS["brand_name"]
    logo_url: str | None = None
    primary_color: str = NUMBERVERSE_DEFAULTS["primary_color"]
    accent_color: str = NUMBERVERSE_DEFAULTS["accent_color"]
    domains: list[str] = field(default_factory=list)
    default_locale: str = NUMBERVERSE_DEFAULTS["default_locale"]
    feature_flags: dict = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "brand_name": self.brand_name,
            "logo_url": self.logo_url,
            "primary_color": self.primary_color,
            "accent_color": self.accent_color,
            "domains": list(self.domains or []),
            "default_locale": self.default_locale,
            "feature_flags": dict(self.feature_flags or {}),
        }


async def resolve_branding(
    db: AsyncSession,
    org_id: Any = None,
) -> Branding:
    """Resolve effective branding for an org (or the global consumer).

    Resolution order (per field):
      1. The org's TenantConfig row (when org_id is not None).
      2. The global TenantConfig row (org_id IS NULL).
      3. Hardcoded Numberverse defaults.

    Args:
        db: AsyncSession.
        org_id: The organization's UUID, or None for the global consumer path.

    Returns:
        A Branding dataclass with every field resolved.
    """
    # Load the org row first (if any), then the global row.
    rows: list[TenantConfig] = []
    if org_id is not None:
        org_row = await db.scalar(
            select(TenantConfig).where(TenantConfig.org_id == org_id)
        )
        if org_row is not None:
            rows.append(org_row)
    global_row = await db.scalar(
        select(TenantConfig).where(TenantConfig.org_id.is_(None))
    )
    if global_row is not None:
        rows.append(global_row)

    if not rows:
        return Branding()

    resolved = Branding()
    for row in rows:
        if row.brand_name is not None:
            resolved.brand_name = row.brand_name
        if row.logo_url is not None:
            resolved.logo_url = row.logo_url
        if row.primary_color is not None:
            resolved.primary_color = row.primary_color
        if row.accent_color is not None:
            resolved.accent_color = row.accent_color
        if row.domains is not None:
            resolved.domains = list(row.domains)
        if row.default_locale is not None:
            resolved.default_locale = row.default_locale
        if row.feature_flags is not None:
            resolved.feature_flags = dict(row.feature_flags)
    return resolved


async def get_global_config(db: AsyncSession) -> TenantConfig | None:
    """Fetch (or lazily create) the single global TenantConfig row.

    Used by the boot path to ensure a global default exists; idempotent.
    """
    row = await db.scalar(select(TenantConfig).where(TenantConfig.org_id.is_(None)))
    if row is None:
        row = TenantConfig(org_id=None)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row
