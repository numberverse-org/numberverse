#!/usr/bin/env node
/**
 * 🧠 journey.ts band/age + family-unit regression tests (#1044-audit from the
 * v50 difficulty-model feed).
 *   #4  bandForAge covers band 8 (Summit Peaks) by placement.
 *   #13 kidBand uses full-date age (Dec-31 kid not a year older on Jan 1).
 *   #10 family unit counts mastered only when the HARDEST tier is mastered.
 *
 * journey.ts pulls game/ui → phaser + zustand at module load, so we bundle it
 * with esbuild (stubbing phaser + game/ui) and run the pure fns against the
 * bundle.
 *
 * Run:  node apps/kid/tests/journey_bands.test.mjs
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmp = mkdtempSync(join(tmpdir(), "journey-band-test-"));
const bundle = join(tmp, "journey.bundle.mjs");

// Locate the esbuild JS entry (vite's bundled copy lives in the pnpm store).
function findEsbuildMain() {
  const direct = join(root, "node_modules", "esbuild", "lib", "main.js");
  if (existsSync(direct)) return direct;
  const pnpmDir = join(root, "node_modules", ".pnpm");
  if (existsSync(pnpmDir)) {
    for (const d of readdirSync(pnpmDir)) {
      if (!d.startsWith("esbuild@")) continue;
      const p = join(pnpmDir, d, "node_modules", "esbuild", "lib", "main.js");
      if (existsSync(p)) return p;
    }
  }
  throw new Error("esbuild lib/main.js not found — install esbuild or vite");
}
const esbuildMain = findEsbuildMain();

// 1. Build the stub plugin + bundle journey.ts.
writeFileSync(join(tmp, "build.mjs"), `
import { build } from ${JSON.stringify(esbuildMain)};
const phaserStub = \`module.exports = { default: { Display: { Color: { HexStringToColor: () => ({ color: 0 }) } }, Math: { Between: (a,b)=>a } } };\`;
const uiStub = \`module.exports = { NV_GOLD: 0xffd166, NV_ORANGE: 0xff8c42, NV_PINK: 0xff6b9d, NV_SKY: 0x6bb8ff };\`;
await build({
  entryPoints: [${JSON.stringify(join(root, "apps/kid/src/lib/journey.ts"))}],
  bundle: true, format: "esm", platform: "node",
  outfile: ${JSON.stringify(bundle)},
  define: { "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^phaser$/ }, () => ({ path: "phaser", namespace: "stub" }));
      b.onResolve({ filter: /\\/game\\/ui$/ }, () => ({ path: "ui", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, async (args) => ({
        contents: args.path === "phaser" ? phaserStub : uiStub, loader: "js",
      }));
    },
  }],
});
`);
execSync(`node ${join(tmp, "build.mjs")}`, { cwd: root, stdio: "inherit" });

// 2. Load the bundle and run checks.
const { bandForAge, kidBand, worldProgress } = await import(`${bundle}?t=${Date.now()}`);

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

/* #4 — bandForAge covers band 8 (Summit Peaks, ages 13–16) */
check("bandForAge(14) → 8 (Summit Peaks by placement)", bandForAge(14), 8);
check("bandForAge(15) → 8", bandForAge(15), 8);
check("bandForAge(16) → 8", bandForAge(16), 8);
check("bandForAge(13) → 6 (Jungle Canopy)", bandForAge(13), 6);
check("bandForAge(12) → 5 (Star Academy)", bandForAge(12), 5);
check("bandForAge(7) → 3 (River Town)", bandForAge(7), 3);
check("bandForAge(3) → 1 (youngest)", bandForAge(3), 1);

/* #13 — kidBand uses full-date age when birthday known */
const dec31 = { id: "k", name: "k", avatar: "a", birthYear: 2020, birthMonth: 12, birthDay: 31 };
check("Dec-31 kid is age 5 on Jan 1 2026 → band 2", kidBand(dec31, new Date(2026, 0, 1)), 2);
check("Dec-31 kid turns 6 on Dec 31 2026 → band 3", kidBand(dec31, new Date(2026, 11, 31)), 3);
check("year-only legacy profile → band 3", kidBand({ id: "k", name: "k", avatar: "a", birthYear: 2020 }, new Date(2026, 0, 1)), 3);
check("future birth year → band 1 fallback", kidBand({ id: "k", name: "k", avatar: "a", birthYear: 2030 }, new Date(2026, 0, 1)), 1);

/* #10 — family unit counts mastered only when HARDEST tier mastered */
const m1 = { "f:count-1-10": { pMastered: 0.9 }, "f:count-1-20": { pMastered: 0.1 } };
check("#10 only-easiest-tier → band NOT mastered", worldProgress(m1, "f", 1).mastered, 0);
const m2 = { "f2:count-1-10": { pMastered: 0.9 }, "f2:count-1-20": { pMastered: 0.9 } };
check("#10 hardest-tier mastered → band mastered", worldProgress(m2, "f2", 1).mastered >= 1, true);

rmSync(tmp, { recursive: true, force: true });
console.log("─".repeat(30));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all journey band tests passed");
