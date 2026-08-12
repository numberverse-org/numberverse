#!/usr/bin/env node
/**
 * Dependency security audit gate (#308).
 *
 * Run:  node scripts/audit-deps.mjs   (from repo root)
 *
 * Runs `pnpm audit` and FAILS the build on any HIGH (or CRITICAL) severity
 * advisory that is not on the allowlist below. Like every gate in this repo
 * the allowlist is a deliberate, reviewable policy decision — an advisory
 * earns its entry only when the vulnerable code path cannot exist in how we
 * ship the app. If an allowlisted advisory stops appearing, we WARN (not
 * fail) so the entry can be removed and the tree stays honest.
 */
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;

// ── Policy: advisories accepted with a documented reason. Key = GitHub
// advisory URL (the `url` field in pnpm audit --json). ────────────────
const ALLOWLIST = {
  // ── next (parent app) — all server-runtime advisories. The parent portal
  // is `output: "export"` (apps/parent/next.config): fully static, every page
  // a client component, NO node server / route handlers / middleware / server
  // actions / websockets on the box — these code paths never execute. The
  // fix (Next 15) is a major upgrade with React 19; tracked as a follow-up.
  "https://github.com/advisories/GHSA-h25m-26qc-wcjf": "next RSC deserialization DoS — static export has no RSC server runtime",
  "https://github.com/advisories/GHSA-q4gf-8mx6-v5v3": "next RSC DoS — static export has no RSC server runtime",
  "https://github.com/advisories/GHSA-8h8q-6873-q5fj": "next RSC DoS — static export has no RSC server runtime",
  "https://github.com/advisories/GHSA-c4j6-fc7j-m34r": "next WebSocket SSRF — no websocket upgrade path in static export",
  "https://github.com/advisories/GHSA-36qx-fr4f-26g5": "next middleware/proxy bypass — static export has no middleware",
  "https://github.com/advisories/GHSA-m99w-x7hq-7vfj": "next Server Actions DoS — static export runs no server actions",
  "https://github.com/advisories/GHSA-89xv-2m56-2m9x": "next Server Actions SSRF — static export runs no server actions",
  "https://github.com/advisories/GHSA-p9j2-gv94-2wf4": "next rewrites SSRF — static export has no rewrites server",
  // ── vite (kid app) — build-time only. `server.fs.deny` is a DEV-SERVER
  // filesystem guard; vite runs only during `pnpm build` on the box and the
  // shipped PWA is static files behind nginx — no vite dev server ever runs
  // in production.
  "https://github.com/advisories/GHSA-fx2h-pf6j-xcff": "vite dev-server fs.deny bypass — vite never runs in production",
  // ── postcss (transitive via next@14) — build-time only (source-map
  // resolution while compiling CSS). The vulnerable 8.4.31 disappears with
  // the Next 15 upgrade (tracked).
  "https://github.com/advisories/GHSA-6g55-p6wh-862q": "postcss sourceMappingURL file-read — build-time, fixed by Next 15",
  "https://github.com/advisories/GHSA-r28c-9q8g-f849": "postcss source-map traversal — build-time, fixed by Next 15",
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

// ── Fail on any HIGH/CRITICAL advisory not explicitly allowlisted. ────
const blocking = advisories.filter((a) => ["high", "critical"].includes(a.severity) && !(a.url in ALLOWLIST));
for (const a of blocking) {
  console.error(`  ✖ ${a.severity.toUpperCase()} ${a.module_name} — ${a.title}`);
  console.error(`    ${a.url}`);
  console.error(`    vulnerable ${a.range} — fix: ${a.fix_available === false ? "none in range; upgrade" : (a.fix_available?.isBreakingFix !== undefined ? "breaking upgrade" : "available")}`);
}
if (blocking.length) {
  console.error(`\n✖ ${blocking.length} high/critical advisory(ies) not allowlisted — add a justified entry to ALLOWLIST in scripts/audit-deps.mjs or upgrade.`);
  process.exit(1);
}

// ── Warn when an allowlisted advisory has gone away (clean it up). ─────
for (const url of Object.keys(ALLOWLIST)) {
  if (!advisories.some((a) => a.url === url)) {
    console.warn(`  ⚠ allowlisted advisory no longer present — safe to remove the entry: ${url}`);
  }
}

console.log(`Dep audit: ${meta.low ?? 0} low, ${meta.moderate ?? 0} moderate, ${meta.high ?? 0} high, ${meta.critical ?? 0} critical (${Object.keys(ALLOWLIST).length} allowlisted, all justified)`);
console.log("✓ no un-allowlisted high/critical advisories");
