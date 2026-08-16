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
export const APP_BUILD = "17 Aug 2026 · 0.95.0 (Auth-hardening + scene-lifecycle wave: #1669/#1676 google+set-password rate limits, #1672 same-origin middleware, #1673 CORS tighten, #1675 72-byte password cap, #1739-#1747 scene timer/listener/tween teardown)";
export const APP_VERSION = "0.95.0";
