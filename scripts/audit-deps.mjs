#!/usr/bin/env node
/**
 * Dependency security audit gate (#308, #1698, #1699).
 *
 * Run:  node scripts/audit-deps.mjs   (from repo root)
 *
 * Runs `pnpm audit` and FAILS the build on any MODERATE, HIGH or CRITICAL
 * severity advisory that is not on the allowlist below (#1698 — moderate
 * advisories used to pass silently; now they need the same documented
 * justification as high/critical). Like every gate in this repo the allowlist
 * is a deliberate, reviewable policy decision — an advisory earns its entry
 * only when the vulnerable code path cannot exist in how we ship the app.
 *
 * #1699 — the allowlist is VERSION-AWARE. Every entry records the affected
 * `range` and the exact `resolved` version that was in the tree when the entry
 * was written. If the resolved version ever changes (an upgrade that should
 * have cleared the advisory, OR a regression back into a vulnerable range),
 * the gate FAILS and the entry must be re-validated. A version regression into
 * an allowlisted range can never pass silently.
 *
 * If an allowlisted advisory stops appearing, we WARN (not fail) so the entry
 * can be removed and the tree stays honest.
 */
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;

// ── Policy: advisories accepted with a documented reason. Key = GitHub
// advisory URL (the `url` field in pnpm audit --json). Each value carries:
//   reason   — why the vulnerable code path cannot execute in how we ship
//   range    — the advisory's affected version range at allowlist time
//   resolved — the exact version currently resolved in the tree; any change
//              (upgrade OR regression) fails the gate (#1699).
const ALLOWLIST = {
  // ── next (parent app) — ALL server-runtime advisories (high + moderate).
  // The parent portal is `output: "export"` (apps/parent/next.config): fully
  // static, every page a client component, NO node server / route handlers /
  // middleware / server actions / websockets / image optimizer / rewrites on
  // the box — these code paths never execute. next@14 is EOL; the fix is the
  // tracked Next 15 upgrade (docs/DEPENDENCY_SECURITY.md, SUNSET-BOUND).
  // Every entry below is sunset-bound, not permanent policy.
  "https://github.com/advisories/GHSA-h25m-26qc-wcjf": {
    reason: "next RSC deserialization DoS — static export has no RSC server runtime",
    range: ">=13.0.0 <15.0.8",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-q4gf-8mx6-v5v3": {
    reason: "next RSC DoS — static export has no RSC server runtime",
    range: ">=13.0.0 <15.5.15",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-8h8q-6873-q5fj": {
    reason: "next RSC DoS — static export has no RSC server runtime",
    range: ">=13.0.0 <15.5.16",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-c4j6-fc7j-m34r": {
    reason: "next WebSocket SSRF — no websocket upgrade path in static export",
    range: ">=13.4.13 <15.5.16",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-36qx-fr4f-26g5": {
    reason: "next middleware/proxy bypass — static export has no middleware",
    range: ">=12.2.0 <15.5.16",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-m99w-x7hq-7vfj": {
    reason: "next Server Actions DoS — static export runs no server actions",
    range: ">=13.0.0 <15.5.21",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-89xv-2m56-2m9x": {
    reason: "next Server Actions SSRF — static export runs no server actions",
    range: ">=14.1.1 <15.5.21",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-p9j2-gv94-2wf4": {
    reason: "next rewrites SSRF — static export has no rewrites server",
    range: ">=12.0.0 <15.5.21",
    resolved: "14.2.35",
  },
  // ── next@14 MODERATE advisories — same static-export non-applicability
  // rationale as the high ones. Required now that moderate fails by default
  // (#1698). All sunset-bound with the Next 15 upgrade.
  "https://github.com/advisories/GHSA-9g9p-9gw9-jx7f": {
    reason: "next Image Optimizer remotePatterns DoS — static export has no image optimizer server",
    range: ">=10.0.0 <15.5.10",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-ggv3-7p47-pfv8": {
    reason: "next HTTP request smuggling in rewrites — static export has no rewrites server",
    range: ">=9.5.0 <15.5.13",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-3x4c-7xq6-9pq8": {
    reason: "next/image disk cache exhaustion — static export has no image optimizer server",
    range: ">=10.0.0 <15.5.14",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-ffhc-5mcf-pf4q": {
    reason: "next CSP nonce XSS in App Router — static export has no dynamic CSP middleware",
    range: ">=13.4.0 <15.5.16",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-gx5p-jg67-6x7h": {
    reason: "next beforeInteractive script XSS — static export has no server-injected interactive scripts",
    range: ">=13.0.0 <15.5.16",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-h64f-5h5j-jqjh": {
    reason: "next Image Optimization API DoS — static export has no image optimizer server",
    range: ">=10.0.0 <15.5.16",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-wfc6-r584-vfw7": {
    reason: "next RSC response cache poisoning — static export has no RSC server runtime",
    range: ">=14.2.0 <15.5.16",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-68g3-v927-f742": {
    reason: "next cache confusion for request bodies — static export has no RSC server runtime",
    range: ">=13.0.0 <15.5.21",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-4633-3j49-mh5q": {
    reason: "next cache confusion for invalid-UTF-8 request bodies — static export has no RSC server runtime",
    range: ">=13.0.0 <15.5.21",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-4c39-4ccg-62r3": {
    reason: "next Server Action unbounded payload in Edge — static export has no server actions / edge runtime",
    range: ">=13.0.0 <15.5.21",
    resolved: "14.2.35",
  },
  "https://github.com/advisories/GHSA-955p-x3mx-jcvp": {
    reason: "next internal Server Function endpoint disclosure — static export has no server functions",
    range: ">=13.0.0 <15.5.21",
    resolved: "14.2.35",
  },
};

const run = spawnSync("pnpm", ["audit", "--json"], { cwd: ROOT, encoding: "utf8" });
if (!run.stdout) {
  console.error("✖ could not run `pnpm audit --json`:", (run.stderr || run.error || "no output").toString().slice(0, 300));
  process.exit(1);
}
let data;
try {
  data = JSON.parse(run.stdout);
} catch (e) {
  console.error("✖ `pnpm audit --json` returned unparseable output:", e.message);
  process.exit(1);
}

const meta = data?.metadata?.vulnerabilities ?? { low: 0, moderate: 0, high: 0, critical: 0 };
const advisories = Object.values(data?.advisories ?? {});

// ── Fail on any MODERATE/HIGH/CRITICAL advisory not allowlisted, AND on any
// allowlisted advisory whose resolved version has drifted from the recorded one
// (#1698 + #1699). LOW advisories are informational and pass silently. ──────
const blocking = [];
const stillAllowlisted = new Set();

for (const a of advisories) {
  if (!["moderate", "high", "critical"].includes(a.severity)) continue;

  const entry = ALLOWLIST[a.url];
  if (!entry) {
    blocking.push({ a, reason: "not allowlisted" });
    continue;
  }

  stillAllowlisted.add(a.url);

  // #1699 — version-aware allowlist. Collect every distinct resolved version in
  // the tree for this advisory. If ANY of them differs from the version recorded
  // when the entry was written, the entry is stale and must be re-validated.
  const resolvedVersions = [...new Set((a.findings ?? []).map((f) => f.version))];
  const drifted = resolvedVersions.filter((v) => v !== entry.resolved);
  if (drifted.length > 0) {
    blocking.push({
      a,
      reason: `allowlisted resolved version changed: recorded ${entry.resolved}, found ${drifted.join(", ")} — re-validate the allowlist entry`,
    });
  }
}

for (const { a, reason } of blocking) {
  console.error(`  ✖ ${a.severity.toUpperCase()} ${a.module_name} — ${a.title}`);
  console.error(`    ${a.url}`);
  console.error(`    vulnerable ${a.vulnerable_versions ?? "?"} — fix: ${a.fix_available === false ? "none in range; upgrade" : "available"}`);
  console.error(`    ${reason}`);
}
if (blocking.length) {
  console.error(`\n✖ ${blocking.length} moderate/high/critical advisory(ies) not allowed or stale — add/refresh a justified, version-aware entry in scripts/audit-deps.mjs or upgrade.`);
  process.exit(1);
}

// ── Warn when an allowlisted advisory has gone away (clean it up). ─────
for (const url of Object.keys(ALLOWLIST)) {
  if (!stillAllowlisted.has(url)) {
    console.warn(`  ⚠ allowlisted advisory no longer present — safe to remove the entry: ${url}`);
  }
}

console.log(`Dep audit: ${meta.low ?? 0} low, ${meta.moderate ?? 0} moderate, ${meta.high ?? 0} high, ${meta.critical ?? 0} critical (${Object.keys(ALLOWLIST).length} allowlisted, all justified + version-checked)`);
console.log("✓ no un-allowlisted or stale moderate/high/critical advisories");
