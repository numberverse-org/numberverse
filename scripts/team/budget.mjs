#!/usr/bin/env node
/**
 * #886 — kid bundle budget gate.
 *
 * Run:  node scripts/team/budget.mjs            (builds kid, then measures)
 *       node scripts/team/budget.mjs --skip-build  (measures an existing build)
 *
 * Builds the kid app (via the workspace's local Vite binary — no pnpm install
 * side effects), then enforces the #1316 wire target: the gzipped main entry
 * (`dist/assets/index-*.js`) AND the gzipped total of every JS file in dist
 * must both stay at or under 1.5MB gz. Exit 1 on oversize so CI fails the PR.
 *
 * This is the chunk/total budget gate; `scripts/bundle-size.mjs` remains the
 * per-chunk regression gate (#305). They are complementary: that one guards
 * the largest single chunk, this one guards the whole kid wire payload.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KID = join(ROOT, "apps", "kid");
const DIST = join(KID, "dist");
const ASSETS = join(DIST, "assets");
const VITE = join(KID, "node_modules", ".bin", "vite");

/** #1316 — the kid wire budget: main entry AND total JS must gzip ≤ 1.5MB. */
const GZ_BUDGET = 1_572_864; // 1.5 MB gz

const skipBuild = process.argv.includes("--skip-build") || process.env.NV_BUDGET_SKIP_BUILD === "1";

if (!skipBuild) {
  if (!existsSync(VITE)) {
    console.error("✖ vite binary not found — run `pnpm install` first.");
    process.exit(1);
  }
  console.log("▶ building kid app…");
  execFileSync(VITE, ["build"], { cwd: KID, stdio: "inherit" });
}

if (!existsSync(ASSETS)) {
  console.error("✖ no build at apps/kid/dist/assets — build the kid app first.");
  process.exit(1);
}

/** Every JS file in dist (chunks + service worker), keyed by absolute path. */
const jsFiles = [];
function collectJs(dir) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) collectJs(abs);
    else if (name.endsWith(".js")) jsFiles.push(abs);
  }
}
collectJs(DIST);

const measured = jsFiles
  .map((abs) => {
    const rel = abs.slice(DIST.length + 1);
    const bytes = statSync(abs).size;
    const gz = gzipSync(readFileSync(abs)).length;
    return { rel, bytes, gz };
  })
  .sort((a, b) => b.bytes - a.bytes);

for (const f of measured) {
  console.log(`  ${(f.bytes / 1024).toFixed(0)} KB raw / ${(f.gz / 1024).toFixed(0)} KB gz  ${f.rel}`);
}

const main = measured.find((f) => /(^|\/)index-.*\.js$/.test(f.rel)) ?? measured[0];
const totalGz = measured.reduce((sum, f) => sum + f.gz, 0);

console.log(`\nMain entry:  ${main.rel} ${(main.gz / 1024).toFixed(0)} KB gz (budget ${(GZ_BUDGET / 1024).toFixed(0)} KB)`);
console.log(`Total JS:    ${(totalGz / 1024).toFixed(0)} KB gz across ${measured.length} files (budget ${(GZ_BUDGET / 1024).toFixed(0)} KB)`);

let failed = false;
if (main.gz > GZ_BUDGET) {
  console.error(`✖ main entry ${main.rel} gzips to ${(main.gz / 1024).toFixed(0)} KB — over the ${(GZ_BUDGET / 1024).toFixed(0)} KB budget.`);
  failed = true;
}
if (totalGz > GZ_BUDGET) {
  console.error(`✖ total kid JS gzips to ${(totalGz / 1024).toFixed(0)} KB — over the ${(GZ_BUDGET / 1024).toFixed(0)} KB budget.`);
  failed = true;
}
if (failed) {
  console.error("  Split a heavy chunk / lazy-load more before merging.");
  process.exit(1);
}
console.log("✓ kid bundle within the 1.5MB gz wire budget");
