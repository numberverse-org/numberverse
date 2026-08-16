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
export const APP_BUILD = "16 Aug 2026 · 0.89.0 (xss-prevention + main-thread-perf wave: #1823 external-URL allowlist drops data:/about:; #1824/#1828 name+avatar Unicode-charset/length validation (11 fields, 172 checks); #1826 CSV formula-injection guard; #1825/#1830/#1820 kid-app sanitize (download names, TTS control/RTL strip, parentHeatmap memo); #1816/#1819 SVG rasterize chunked off-boot + PNG strip without per-byte array; #1817/#1818/#1827 share-card paint async off game thread + name cap; #1821 44 room/background textures async/lazy; #1822 parent dashboard aggregation memo+chunked)";
export const APP_VERSION = "0.89.0";
