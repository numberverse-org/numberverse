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
export const APP_BUILD = "16 Aug 2026 · 0.86.0 (e2e-scenario-coverage: 13 mock-backed specs (gameplay/pin-gate/retention/push-consent/bangla-surface/admin/guardrails/sessions/share-card/qr-cards/google-signin/guest-upgrade/age-band) + vitest foundation for apps/kid + CI preview job + 5 spec-bug fixes)";
export const APP_VERSION = "0.86.0";
