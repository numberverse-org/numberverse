/**
 * #1321 — the SINGLE version-notes SOURCE for the PWA update banner.
 *
 * release.sh stamps these two consts on every release (the python block in
 * infra/deploy/scripts/release.sh greps this exact file — keep them on ONE
 * line each so the `const APP_BUILD = "…"` regex matches). They're imported by
 * BOTH the boot chunk (the update banner) and the lazy App chunk (the parent
 * panel footer + build stamp), so the version a kid's device reports is the
 * version the banner offers. Keep this file to these two tiny strings — the
 * stamp lives here specifically so nothing heavy has to be imported to read it.
 */
export const APP_BUILD = "14 Aug 2026 · 0.44.1 (bundle gate: enforce #1316 main-JS <1.5MB gz wire budget in CI + oracle)";
export const APP_VERSION = "0.44.1";
