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
export const APP_BUILD = "17 Aug 2026 · 0.90.0 (sync/security/observability wave: #1803 mastery advisory-lock + #1804 wallet LWW spend sync (no more GREATEST resurrection) + #1814 persist worker off main thread; #1781/#1782 share page OG/Twitter card + server-shell split; #1771 secret guard min-length/entropy; #1760/#1761 trusted-proxy IP + #1762 per-endpoint rate keys + #1772 nginx CSP/HSTS/XFO headers + #1751 lockout logging; #1749/#1750 X-Request-ID correlation + structured 5xx logging)";
export const APP_VERSION = "0.90.0";
