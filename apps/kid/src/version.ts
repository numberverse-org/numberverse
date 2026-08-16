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
export const APP_BUILD = "17 Aug 2026 · 0.96.0 (Parent UX + a11y wave: #1586 admin reset, #1587 honest errors, #1588 dashboard extract, #1590-#1596 parent UX fixes, #1597-#1598 share/BN parity, #1600-#1610 a11y focus management)";
export const APP_VERSION = "0.96.0";
