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
export const APP_BUILD = "16 Aug 2026 · 0.88.0 (test-coverage-api: 5 standalone test files (480+ checks) closing 12 feed findings + 4 real bug fixes (import updated_at round-trip, admin request NameError, admin string-PK id, #865 iat sub-second race))";
export const APP_VERSION = "0.88.0";
