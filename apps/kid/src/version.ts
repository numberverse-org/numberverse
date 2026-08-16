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
export const APP_BUILD = "17 Aug 2026 · 0.90.1 (fix: #1771 secret-guard entropy uses len·log2(distinct chars) so strong hex/Base32 keys pass (0.90.0 crash-loop regression — prod 48-char hex JWT + 32-char hex demo password were refused by the over-strict ≥3-class heuristic))";
export const APP_VERSION = "0.90.1";
