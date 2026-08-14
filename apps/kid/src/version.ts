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
export const APP_BUILD = "15 Aug 2026 · 0.63.0 (fix: abuse-guard/authz — share rate-limit+revoke+paused (#832 #866 #867), batch caps (#833 #834 #835), body-size limit (#836), admin allow-lists (#862 #863 #864), export+content rate limits (#838 #839))";
export const APP_VERSION = "0.63.0";
