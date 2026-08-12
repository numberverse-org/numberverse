#!/usr/bin/env node
/**
 * Bundle-size regression gate (#305).
 *
 * Run:  node scripts/bundle-size.mjs   (from repo root, after `pnpm --filter kid build`)
 *
 * Scans the kid app's production build and FAILS if the largest JS bundle
 * (the main entry) exceeds BUDGET. The budget is a deliberate tripwire set
 * slightly above the current main entry (~1.9MB — game scenes are already
 * lazy-chunked into `engine-*.js`, so this is the app shell + React/Phaser).
 * Growing past it means we shipped a big new dependency without shrinking
 * something else; the real cure is more code-splitting (#343), not a silent
 * blob.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../apps/kid/dist/assets", import.meta.url).pathname;
const BUDGET = 2_150_400; // 2100 KB — main entry must stay under this.

let files;
try {
  files = readdirSync(DIST).filter((f) => f.endsWith(".js"));
} catch {
  console.error("✖ no build at apps/kid/dist/assets — run `pnpm --filter kid build` first.");
  process.exit(1);
}

const assets = files
  .map((f) => ({ file: f, bytes: statSync(join(DIST, f)).size }))
  .sort((a, b) => b.bytes - a.bytes);

for (const a of assets) console.log(`  ${(a.bytes / 1024).toFixed(0)} KB  ${a.file}`);
const main = assets[0];
console.log(`\nMain entry: ${(main.bytes / 1024).toFixed(0)} KB (budget ${(BUDGET / 1024).toFixed(0)} KB)`);
if (main.bytes > BUDGET) {
  console.error(`✖ main bundle ${main.file} is ${(main.bytes / 1024).toFixed(0)} KB — over the ${(BUDGET / 1024).toFixed(0)} KB budget.`);
  console.error("  Cut size (code-split a scene/dep, drop a dependency) before merging.");
  process.exit(1);
}
console.log("✓ main bundle within budget");
