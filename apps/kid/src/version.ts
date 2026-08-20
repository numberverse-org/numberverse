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
export const APP_BUILD = "20 Aug 2026 · 1.11.0 (Kids-get-stuck wave: crash recovery, tap-to-answer, un-stick games, nav + HUD, playability sweep, share-token expiry, rate-limit hardening, BKT decay, Bangla i18n, notifications)";
export const APP_VERSION = "1.11.0";
