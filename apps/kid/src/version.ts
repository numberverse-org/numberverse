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
export const APP_BUILD = "17 Aug 2026 · 0.92.0 (ratelimit/keymgmt wave: #1765 admin search+embed budgets, #1766 push rate limit, #1767/#1769/#1770 bucket eviction + no-IP keys + burn isolation, #1768 export/import 10/min, #1774 JWT key rotation, #1775 device credential derivation, #1777 share-token sha256 fingerprint)";
export const APP_VERSION = "0.92.0";
