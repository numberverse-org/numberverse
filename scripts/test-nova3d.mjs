#!/usr/bin/env node
/**
 * #888 — 3D island build gate. The nova.glb/KTX2 asset and the WebGL mount
 * (apps/kid/src/nova3d/) are invisible to the flat regex audit — they never
 * touch scenes/i18n, so a broken island ships silently. This deterministic
 * BUILD-TIME gate asserts:
 *   1. the shipped 3D owl asset exists and is non-empty
 *   2. nova3d code actually references it (a rename/typo of the .glb path
 *      fails HERE, not in a kid's browser)
 *   3. Nova3DHome — the app-side wrapper that originates the island (a lazy
 *      React chunk off App.tsx, but a real module in the app chunk's graph) —
 *      resolves without type errors. This is a REAL TS compile rooted at the
 *      wrapper (skipLibCheck on), not a regex.
 *
 * No Playwright/WebGL runtime — keep it deterministic in CI:
 *   run:  node scripts/test-nova3d.mjs
 *
 * Uses the `typescript` package already in apps/kid/node_modules (kid's own
 * devDep); it must never install anything.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // repo root
const KID = join(ROOT, "apps", "kid");
const NOVA3D = join(KID, "src", "nova3d");
const GLB = join(KID, "public", "assets", "nova.glb");

// Anchor `require` at apps/kid so `typescript` resolves from the kid app's own
// node_modules regardless of cwd (repo root has no TS install).
const require = createRequire(join(KID, "noop.js"));
const ts = require("typescript");

let fails = 0;
const check = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log(`  ✓ ${name}`);
  } else {
    fails++;
    console.error(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
};

console.log("①  3D owl asset present and non-empty…");
let glbSize = 0;
try { glbSize = statSync(GLB).size; } catch { /* missing file → size stays 0 */ }
check(`nova.glb exists (${glbSize} bytes)`, glbSize > 0, true);

console.log("②  nova.glb referenced by the nova3d sources…");
const refs = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (/\.tsx?$/.test(e.name) && readFileSync(p, "utf8").includes("/assets/nova.glb")) {
      refs.push(p.replace(ROOT + "/", ""));
    }
  }
};
walk(NOVA3D);
check("≥1 nova3d file references /assets/nova.glb", refs.length > 0, true);
if (refs.length) console.log(`      → ${refs.join(", ")}:`);

console.log("③  Nova3DHome resolves without type errors (real TS program)…");
const cfg = ts.readConfigFile(join(KID, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, KID);
const program = ts.createProgram([join(NOVA3D, "Nova3DHome.tsx")], parsed.options);
const diags = ts.getPreEmitDiagnostics(program);
// Only diagnostics inside the island count: the wrapper graph is what THIS gate
// proves (module resolution + own wiring). Errors reported in a wider dep
// (store.ts/i18n.ts…) belong to the whole-app typecheck job — otherwise this
// gate would double as a slow full-project tsc.
const islandErr = diags.filter(
  (d) => d.category === ts.DiagnosticCategory.Error && d.file && d.file.fileName.includes("src" + "/" + "nova3d")
);
for (const d of islandErr) {
  console.error(`  ✖ nova3d type error ${d.file.fileName}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}`);
  console.error(`    ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
}
check("0 type errors in the Nova3DHome graph", islandErr.length, 0);
if (islandErr.length === 0) console.log(`      (${program.getSourceFiles().length} files compiled — from Nova3DHome.tsx outward)`);

console.log();
if (fails) { console.error(`✖ ${fails} FAILURE(S)`); process.exit(1); }
console.log("✓ 3D island asset + mount gate holds (#888)");