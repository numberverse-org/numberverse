#!/usr/bin/env node
/**
 * 🔗 External-link allowlist regression (#267, #790) — feed test-coverage-core #4/#5.
 *
 * Covers packages/core/src/links.ts:
 *   - isAllowedExternalUrl  → scheme-only allowlist gate
 *   - openExternalWith      → allowlist-gated opener wrapper
 *   - isWhatsAppShare       → EXACT hostname match (wa.me / www.wa.me over https)
 *
 * Source rules (read from links.ts):
 *   ALLOWED_EXTERNAL_SCHEMES = { https:, mailto:, blob: }   (#1823: data:/about: removed)
 *   isAllowedExternalUrl parses with base "https://numberverse.invalid", so:
 *     • http:       is NOT allowlisted           → REJECT
 *     • javascript: / file: are NOT allowlisted  → REJECT
 *     • data:       is NOT allowlisted (#1823 XSS)          → REJECT
 *     • about:      is NOT allowlisted (#1823, never needed) → REJECT
 *     • host/port/path are NOT gated: any https host/port/path passes the
 *       scheme-only predicate; a malformed host (URL parse throws) → REJECT.
 *   openExternalWith: allowed → calls opener(url, target, "noopener,noreferrer")
 *     and returns true; blocked → returns false WITHOUT calling opener;
 *     opener throws → returns false (catch).
 *   isWhatsAppShare: EXACT hostname "wa.me" | "www.wa.me" + https only.
 *
 * Run:  node packages/core/tests/links.mjs
 */
import {
  isAllowedExternalUrl,
  openExternalWith,
  isWhatsAppShare,
  ALLOWED_EXTERNAL_SCHEMES,
} from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

/* ── #4 allow/reject matrix (computed from the source's rules) ── */
const MATRIX = [
  { case: "allowed https host",                       url: "https://numberverse.invalid/",                        want: true },
  { case: "known-allowed deep-link path (https)",     url: "https://numberverse.invalid/play?level=3&skill=measure", want: true },
  { case: "http scheme — NOT in allowlist → reject",  url: "http://numberverse.invalid/",                         want: false },
  { case: "javascript: scheme — not allowlisted",     url: "javascript:alert(1)",                                want: false },
  { case: "file: scheme — not allowlisted",           url: "file:///etc/passwd",                                 want: false },
  { case: "data: scheme — REJECTED (#1823 XSS)",      url: "data:text/html,<script>alert(1)</script>",           want: false },
  { case: "data:image — REJECTED (#1823)",            url: "data:image/png;base64,iVBORw0KGgo=",                 want: false },
  { case: "mailto: scheme — allowlisted",             url: "mailto:hello@numberverse.invalid",                   want: true },
  { case: "blob: scheme — allowlisted",               url: "blob:https://numberverse.invalid/uuid",               want: true },
  { case: "about: scheme — REJECTED (#1823)",         url: "about:blank",                                         want: false },
  { case: "blocked host (malformed: no host → parse throws)", url: "https://",                                    want: false },
  { case: "blocked host (malformed: space → parse throws)",   url: "https://exa mple.com/",                       want: false },
  { case: "arbitrary https host — no host allowlist in source", url: "https://evil.example.com/steal",            want: true },
  { case: "port 8080 — source has no port gating",    url: "https://numberverse.invalid:8080/",                   want: true },
  { case: "subdomain — scheme-only gate does not reject", url: "https://sub.numberverse.invalid/",                want: true },
  { case: "empty string — early false",               url: "",                                                    want: false },
];

for (const { case: c, url, want } of MATRIX) {
  check(`#4 isAllowedExternalUrl: ${c} → ${want ? "ALLOW" : "REJECT"} (${url})`, isAllowedExternalUrl(url), want);
}

/* ── #4 openExternalWith behavior ── */
{
  const calls = [];
  const ok = openExternalWith("https://numberverse.invalid/deep", (u, t, f) => { calls.push([u, t, f]); }, "_blank");
  check("#4 openExternalWith allowed → true", ok, true);
  check("#4 openExternalWith calls opener exactly once", calls.length, 1);
  check("#4 openExternalWith args = (url, target, 'noopener,noreferrer')",
    calls[0], ["https://numberverse.invalid/deep", "_blank", "noopener,noreferrer"]);
}
{
  const calls = [];
  openExternalWith("https://numberverse.invalid/x", (...a) => calls.push(a));
  check("#4 openExternalWith default target is _blank", calls[0][1], "_blank");
}
{
  let called = false;
  const ok = openExternalWith("javascript:alert(1)", () => { called = true; });
  check("#4 openExternalWith blocked → false", ok, false);
  check("#4 openExternalWith blocked → opener NOT called", called, false);
}
{
  const ok = openExternalWith("https://numberverse.invalid/boom", () => { throw new Error("boom"); });
  check("#4 openExternalWith opener throws → false (catch)", ok, false);
}

/* ── #5 isWhatsAppShare exact-match matrix (wa.me / www.wa.me, https only) ── */
const WA_MATRIX = [
  ["https://wa.me/123",       true,  "exact wa.me + https"],
  ["https://www.wa.me/1",     true,  "exact www.wa.me + https"],
  ["https://notwa.me",        false, "lookalike suffix (endsWith false-positive guard)"],
  ["https://wa.me.evil.com",  false, "lookalike suffix on different registrable domain"],
  ["https://sub.wa.me/1",     false, "malicious subdomain"],
  ["http://wa.me/1",          false, "http scheme rejected"],
  ["not a url",               false, "unparseable"],
];
for (const [url, want, desc] of WA_MATRIX) {
  check(`#5 isWhatsAppShare(${url}) === ${want} (${desc})`, isWhatsAppShare(url), want);
}

/* ── print the allow/reject matrix ── */
console.log("─".repeat(64));
console.log("allow/reject matrix (isAllowedExternalUrl):");
for (const { case: c, url, want } of MATRIX) {
  console.log(`  ${want ? "ALLOW" : "REJECT"}  ${url.padEnd(58)} ${c}`);
}
console.log("─".repeat(64));
console.log(`scheme allowlist: ${[...ALLOWED_EXTERNAL_SCHEMES].join(", ")}`);
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log(`✓ all links tests passed (${MATRIX.length} matrix cases + 7 openExternalWith + ${WA_MATRIX.length} whatsapp = ${MATRIX.length + 7 + WA_MATRIX.length} checks)`);
