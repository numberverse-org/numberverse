#!/usr/bin/env node
/**
 * Dependency license audit gate (#271).
 *
 * Run:  node scripts/license-audit.mjs   (from repo root)
 *
 * Parses `pnpm licenses list --json` and FAILS the build if any bundled
 * dependency carries a license outside the allowlist — so a contributor can't
 * quietly pull in a copy-left or unlicensed package. The allowlist is the
 * product's policy; adding a license here is a deliberate, reviewable change.
 */
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;

// ── Policy: every license we will ever ship. SPDX identifiers; compound
// `(A OR B)` strings are allowed when ALL their members are here. ──
const ALLOWED = new Set([
  "MIT", "ISC", "Apache-2.0", "BSD", "BSD-2-Clause", "BSD-3-Clause",
  "0BSD", "CC0-1.0", "CC-BY-4.0", "BlueOak-1.0.0", "MPL-2.0",
]);

function ok(license) {
  if (!license) return false;
  const inner = license.trim().startsWith("(") && license.trim().endsWith(")")
    ? license.trim().slice(1, -1) : license.trim();
  const parts = inner.split(/\s+OR\s+|\s+AND\s+/i);
  return parts.every((p) => ALLOWED.has(p.trim()));
}

let json;
try {
  json = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--json"], { cwd: ROOT, encoding: "utf8" }));
} catch (e) {
  console.error("✖ could not run `pnpm licenses list --json`:", e.message);
  process.exit(1);
}

let bad = 0;
for (const [license, pkgs] of Object.entries(json)) {
  if (ok(license)) continue;
  bad += pkgs.length;
  for (const p of pkgs) console.error(`  ✖ ${p.name}@${p.versions.join(",")} — license "${license}" not allowlisted`);
}

console.log(`License audit: ${Object.values(json).flat().length} deps checked`);
if (bad) { console.error(`✖ ${bad} package(s) outside the license allowlist — see docs/LICENSES.md`); process.exit(1); }
console.log("✓ all bundled dependency licenses allowed");
