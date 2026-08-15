/**
 * #1321 — the SINGLE version-notes SOURCE for the PWA update banner.
 *
 * release.sh stamps the two APP_BUILD / APP_VERSION exports below on every
 * release (its python regex line-anchors on `^export const`, and this comment
 * deliberately never contains that literal text — keep it that way). The two
 * exports must stay on ONE line each. They're imported by
 * BOTH the boot chunk (the update banner) and the lazy App chunk (the parent
 * panel footer + build stamp), so the version a kid's device reports is the
 * version the banner offers. Keep this file to these two tiny strings — the
 * stamp lives here specifically so nothing heavy has to be imported to read it.
 */
export const APP_BUILD = "15 Aug 2026 · 0.71.0 (batch-2: 8 clusters (#763-941) — auth/security durable PG rate-limit, content-safety i18n/BN/3D/speech scans + shared unsafeWords.json, scene auto-discovery + lifecycle, kid refactor + PBKDF2 PIN, data-integrity tz-aware + indexes, infra secrets/resource-limits, styling/a11y, e2e suite)";
export const APP_VERSION = "0.71.0";
