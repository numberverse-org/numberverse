#!/usr/bin/env node
/**
 * Zero-dependency integrity audit for the kid app + core catalog.
 * Run:  node scripts/audit.mjs  (from apps/kid)
 *
 * Catches the exact bug classes that bite a 30+-scene kids' app:
 *   1. i18n — every `t("key")` used in scenes must exist in BOTH EN and BN
 *      (a missing key silently renders the raw key to a child).
 *   2. catalog — every skill.game ∈ GAMES; every GAME has a GAME_SCENES key;
 *      every GAME_SCENES value has a scene class registered in engine.ts
 *      (the lazy Phaser chunk — see issue #15).
 *   3. seed — every core skill id exists in apps/api/app/seed.py SKILLS_SEED
 *      (or progress sync 500s on FK).
 *   4. header titles — flags hardcoded English scene headers (not via t()).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))); // repo root
const KID = join(ROOT, "apps", "kid");
const GAME = join(KID, "src", "game");
const CORE = join(ROOT, "packages", "core");

let errors = 0;
let warns = 0;
const fail = (msg) => { errors++; console.error("  ✖ " + msg); };
const warn = (msg) => { warns++; console.error("  ⚠ " + msg); };

/* ── 1. i18n completeness ── */
function parseI18nTable() {
  const src = readFileSync(join(GAME, "i18n.ts"), "utf8");
  const bnBlock = src.slice(src.indexOf("const BN"));
  const enBlock = src.slice(src.indexOf("const EN"), src.indexOf("const BN"));
  const keys = (block) => {
    const set = new Set();
    const re = /^\s*([a-zA-Z][a-zA-Z0-9]*):\s*(?:\([^)]*\)\s*=>|"|`)/gm;
    let m;
    while ((m = re.exec(block))) set.add(m[1]);
    return set;
  };
  return { en: keys(enBlock), bn: keys(bnBlock) };
}

function usedKeys() {
  const used = new Set();
  for (const f of readdirSync(GAME).filter((x) => x.endsWith(".ts") && x !== "i18n.ts")) {
    const src = readFileSync(join(GAME, f), "utf8");
    const re = /\bt\(\s*["'`]([a-zA-Z][a-zA-Z0-9_-]*)["'`]/g;
    let m;
    while ((m = re.exec(src))) used.add(m[1]);
    // also count double-quoted camelCase keys: dynamic callers like speech.ts
    // build the key from a variable and pass the literal elsewhere (e.g.
    // "qAdd"). Guarded so data words ("whistle", "xiaomi"…) and non-keys are
    // skipped:
    //   * camelCase (lowercase start + an uppercase letter) — every i18n key
    //     is camelCase by convention
    //   * double quotes only — backtick/single quotes in doc comments
    //     (`maxRadius`, `rightGroup`) are not keys
    //   * not a property check like `"speechSynthesis" in window`
    const lit = /"([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)"(?!\s+in\s)/g;
    let l;
    while ((l = lit.exec(src))) used.add(l[1]);
  }
  return used;
}

console.log("①  i18n completeness (every used key in EN + BN)…");
const { en, bn } = parseI18nTable();
const used = usedKeys();
const missEn = [...used].filter((k) => !en.has(k)).sort();
const missBn = [...used].filter((k) => !bn.has(k)).sort();
for (const k of missEn) fail(`t("${k}") used in a scene but MISSING from EN table`);
for (const k of missBn) fail(`t("${k}") used in a scene but MISSING from BN table`);
// keys defined but never used (drift)
const drift = [...en].filter((k) => !used.has(k)).sort();
for (const k of drift) warn(`i18n key "${k}" defined but never used (maybe reuse or remove)`);
if (!missEn.length && !missBn.length) console.log("  ✓ all used keys present in EN + BN");

/* ── 2. core catalog integrity ── */
console.log("②  core catalog integrity (skills ⇄ games ⇄ scenes ⇄ engine)…");
let skills = [], games = [], scenes = {};
const skillsSrc = existsSync(join(CORE, "dist", "skills.js"))
  ? readFileSync(join(CORE, "dist", "skills.js"), "utf8")
  : readFileSync(join(CORE, "src", "skills.ts"), "utf8");
try {
  const mod = await import(join(CORE, "dist", "skills.js"));
  skills = mod.SKILLS; games = mod.GAMES; scenes = mod.GAME_SCENES;
} catch {
  fail("cannot import @numberverse/core dist (run core build first)");
}
if (skills.length) {
  const gameIds = new Set(games.map((g) => g.id));
  const skillIds = new Set(skills.map((s) => s.id));
  const dupSkill = skills.filter((s, i) => skills.findIndex((x) => x.id === s.id) !== i);
  for (const d of dupSkill) fail(`duplicate skill id "${d.id}"`);
  const dupGame = games.filter((g, i) => games.findIndex((x) => x.id === g.id) !== i);
  for (const d of dupGame) fail(`duplicate game id "${d.id}"`);
  for (const s of skills) {
    if (s.game && !gameIds.has(s.game)) fail(`skill "${s.id}" → game "${s.game}" not in GAMES`);
  }
  for (const g of games) {
    if (!skillIds.has(g.skillId)) fail(`game "${g.id}" → skill "${g.skillId}" not in SKILLS`);
    if (!scenes[g.id]) fail(`game "${g.id}" has no GAME_SCENES entry`);
    // 6 = one-mode ladder; 9 = three-mode ladder (e.g. game-bdtaka: recognize/make/give-change)
    if (g.difficultyLevels?.length !== 6 && g.difficultyLevels?.length !== 9)
      warn(`game "${g.id}" difficultyLevels ≠ 6/9 tiers (${g.difficultyLevels?.length})`);
  }
  // ── SCOPE GUARD: no ladder may exceed its skill's promise. This is the
  // "pop games under another number" rule — a count-to-10 game must never ask
  // for 12, an add-within-10 game never 25, a tables-2,5,10 lesson never ×7.
  // (skip-per-skill: some scenes interpret levels as divisor/table/digit INDEX,
  // not raw magnitude — they are not in the map.)
  const SCOPE_CAP = {
    "count-1-10": 10, "count-1-20": 20, "count-to-50": 50, "count-to-100": 100,
    "count-to-999": 999,
    "grow-count": 12, "quantity-match": 7, "number-line": 10, "number-song": 10,
    "fruit-tree-add": 15, "add-within-10": 10, "sub-within-10": 10,
    "add-within-20": 20, "sub-within-20": 20, "add-to-20": 20,
    "number-bonds-10": 12, "bd-taka": 10, "add-sub-100": 100,
  };
  for (const g of games) {
    const cap = SCOPE_CAP[g.skillId];
    if (cap && g.difficultyLevels?.length) {
      const max = Math.max(...g.difficultyLevels);
      if (max > cap)
        fail(`SCOPE: "${g.skillId}" (${g.id}) difficulty max ${max} exceeds its promise (${cap})`);
    }
  }
  // ÷ by 2 and 3 must ONLY use divisors {2,3}
  const div23 = games.find((g) => g.id === "game-div-23");
  if (div23 && !div23.difficultyLevels.every((d) => d === 2 || d === 3))
    fail(`SCOPE: game-div-23 uses divisors outside {2,3}: ${div23.difficultyLevels}`);

  // ── SEQUENCE GUARD: the SKILLS array order IS the course index. It must
  // follow the brain ladder — a kid learns numbers BEFORE calculation, and
  // meets an operation concretely BEFORE its abstract drill.
  const seqIndex = new Map(skills.map((s, i) => [s.id, i]));
  const calc = ["add-within-10", "sub-within-10", "fruit-tree-add", "add-to-20", "add-within-20", "sub-within-20"];
  const countLadder = ["count-to-50", "count-to-100"];
  for (const c of calc) {
    const ci = seqIndex.get(c);
    if (ci === undefined) continue;
    for (const n of countLadder) {
      const ni = seqIndex.get(n);
      if (ni === undefined) continue;
      if (ci < ni) fail(`SEQUENCE: "${c}" (#${ci + 1}) comes BEFORE "${n}" (#${ni + 1}) — numbers must be learned before calculation`);
    }
  }
  const before = [["add-within-10", "sub-within-10"], ["add-within-20", "sub-within-20"], ["div-facts-fair-share", "div-facts-by-2-3"]];
  for (const [a, b] of before) {
    const ai = seqIndex.get(a), bi = seqIndex.get(b);
    if (ai === undefined || bi === undefined) continue;
    if (ai > bi) fail(`SEQUENCE: "${a}" (#${ai + 1}) must come BEFORE "${b}" (#${bi + 1}) (game-first, then the abstract drill)`);
  }
  // every scene key has a class file + an engine.ts import + an engine.ts array
  // entry. Since issue #15 the scenes live in the lazy Phaser chunk (engine.ts),
  // NOT App.tsx — App.tsx only has `import type { Game } from "phaser"`.
  const engineSrc = readFileSync(join(GAME, "engine.ts"), "utf8");
  const arrayBlock = engineSrc.split("scene: [")[1]?.split("]")[0] ?? "";
  for (const [gid, sceneKey] of Object.entries(scenes)) {
    const sceneFile = join(GAME, `${sceneKey}Scene.ts`);
    if (!existsSync(sceneFile))
      fail(`GAME_SCENES "${gid}" → "${sceneKey}" but no ${sceneKey}Scene.ts file`);
    else if (!new RegExp(`export class ${sceneKey}Scene`).test(readFileSync(sceneFile, "utf8")))
      fail(`${sceneKey}Scene.ts exists but has no \`export class ${sceneKey}Scene\``);
    if (!new RegExp(`import \\{ ${sceneKey}Scene \\}`).test(engineSrc))
      fail(`GAME_SCENES "${gid}" → "${sceneKey}" but engine.ts doesn't import ${sceneKey}Scene`);
    if (!new RegExp(`${sceneKey}Scene`).test(arrayBlock))
      fail(`GAME_SCENES "${gid}" → "${sceneKey}" not listed in engine.ts scene array`);
  }
  console.log(`  ✓ ${skills.length} skills, ${games.length} games, ${Object.keys(scenes).length} scenes checked`);
}

/* ── 3. seed parity ── */
console.log("③  seed.py parity (every core skill in SKILLS_SEED)…");
const seedSrc = readFileSync(join(ROOT, "apps", "api", "app", "seed.py"), "utf8");
const seedIds = new Set([...seedSrc.matchAll(/^\s*\(("([^"]+)")\s*,\s*\d+\s*,/gm)].map((m) => m[2]));
for (const s of skills) {
  if (!seedIds.has(s.id)) fail(`skill "${s.id}" missing from seed.py SKILLS_SEED`);
}
if (skills.length) console.log(`  ✓ ${[...seedIds].length} skills in seed.py checked`);

/* ── 4. hardcoded English header titles ── */
console.log("④  hardcoded (untranslated) scene header titles…");
for (const f of readdirSync(GAME).filter((x) => x.endsWith("Scene.ts"))) {
  const src = readFileSync(join(GAME, f), "utf8");
  const re = /text\(\s*0,\s*0,\s*"([^"]+)"\s*,/g;
  let m;
  while ((m = re.exec(src))) {
    const t = m[1];
    if (/[A-Za-z]/.test(t)) warn(`${f}: untranslated header "${t}"`);
  }
}

console.log("\n──────────────────────────────");
if (errors) { console.log(`✖ ${errors} error(s), ${warns} warning(s)`); process.exit(1); }
if (warns) console.log(`✓ 0 errors, ${warns} warning(s) — fix warnings or leave deliberate`);
else console.log("✓ clean");
