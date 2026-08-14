#!/usr/bin/env node
/**
 * Bundle-size regression gate (#305, #1316).
 *
 * Run:  node scripts/bundle-size.mjs   (from repo root, after `pnpm --filter kid build`)
 *
 * Scans the kid app's production build and FAILS if ANY JS chunk exceeds the
 * gzip budget (the real wire cost, per the #1316 'main JS < 1.5MB gz' target),
 * or if the raw largest chunk blows past a deliberate headroom tripwire.
 *
 * Background: the first-screen entry is a tiny shell (`index-*.js`), the app
 * shell is `App-*.js`, the Phaser engine + scenes are a lazy `engine-*.js`
 * chunk, and the 3D island + renderer are lazy `Nova3D-*`/`three-vendor-*`
 * pulls — so the largest chunk is (correctly) something lazy. Growing any of
 * them past the budgets means we shipped a big dependency without splitting
 * first; the cure is more code-splitting (#343), not a silent blob.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = new URL("../apps/kid/dist/assets", import.meta.url).pathname;
/** #1316 — the kid's wire budget: every chunk must gzip under 1.5MB. */
const GZ_BUDGET = 1_572_864; // 1.5 MB gz
/** Raw headroom tripwire — the largest chunk today is phaser-vendor (~1.4MB);
 *  this keeps ~300KB of growth room before the real fix is splitting. */
const RAW_BUDGET = 1_769_472; // 1728 KB

let files;
try {
  files = readdirSync(DIST).filter((f) => f.endsWith(".js"));
} catch {
  console.error("✖ no build at apps/kid/dist/assets — run `pnpm --filter kid build` first.");
  process.exit(1);
}

const assets = files
  .map((f) => {
    const bytes = statSync(join(DIST, f)).size;
    return { file: f, bytes, gz: gzipSync(readFileSync(join(DIST, f))).length };
  })
  .sort((a, b) => b.bytes - a.bytes);

for (const a of assets) console.log(`  ${(a.bytes / 1024).toFixed(0)} KB raw / ${(a.gz / 1024).toFixed(0)} KB gz  ${a.file}`);
const main = assets[0];
const worst = assets.reduce((a, b) => (a.gz > b.gz ? a : b), main);
console.log(`\nLargest chunk: ${main.file} ${(main.bytes / 1024).toFixed(0)} KB raw (tripwire ${(RAW_BUDGET / 1024).toFixed(0)} KB)`);
console.log(`Worst gz:       ${worst.file} ${(worst.gz / 1024).toFixed(0)} KB gz (budget ${(GZ_BUDGET / 1024).toFixed(0)} KB)`);
if (main.bytes > RAW_BUDGET) {
  console.error(`✖ ${main.file} is ${(main.bytes / 1024).toFixed(0)} KB raw — over the ${(RAW_BUDGET / 1024).toFixed(0)} KB tripwire.`);
  console.error("  Cut size (code-split a scene/dep, drop a dependency) before merging.");
  process.exit(1);
}
if (worst.gz > GZ_BUDGET) {
  console.error(`✖ ${worst.file} gzips to ${(worst.gz / 1024).toFixed(0)} KB — over the ${(GZ_BUDGET / 1024).toFixed(0)} KB #1316 budget.`);
  console.error("  Split the heavy chunk before merging.");
  process.exit(1);
}
console.log("✓ every chunk within budget");
