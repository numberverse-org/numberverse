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
export const APP_BUILD = "15 Aug 2026 · 0.59.0 (feat: 4 new mechanic engines — ArcadeCatch physics fast-round facts, TraceScene glyph handwriting, ExploreGarden no-pressure free play, BanglaSpell typing hybrid (#1140 #1142 #1143 #1144))";
export const APP_VERSION = "0.59.0";
