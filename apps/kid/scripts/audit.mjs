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
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))); // repo root
const KID = join(ROOT, "apps", "kid");
const GAME = join(KID, "src", "game");
const CORE = join(ROOT, "packages", "core");

let errors = 0;
let warns = 0;
const fail = (msg) => { errors++; console.error("  ✖ " + msg); };
const warn = (msg) => { warns++; console.error("  ⚠ " + msg); };

/* ── 1. i18n completeness (every used key in EVERY shipped locale) ── */
function parseI18nTable() {
  const src = readFileSync(join(GAME, "i18n.ts"), "utf8");
  // Locale codes with a dict: `const <CODE>: Record<string, Entry> = {` blocks,
  // ordered by their declaration order in the file.
  const dictDecls = [...src.matchAll(/const ([A-Z][A-Z0-9_]*): Record<string, Entry> = \{/g)].map(
    (m) => m[1]
  );
  const dicts = {};
  for (let i = 0; i < dictDecls.length; i++) {
    const start = src.indexOf(`const ${dictDecls[i]}`);
    const end =
      i + 1 < dictDecls.length
        ? src.indexOf(`const ${dictDecls[i + 1]}`)
        : src.indexOf("/**", src.indexOf(`const ${dictDecls[i]}`) + 8) !== -1
          ? src.indexOf("/**", src.indexOf(`const ${dictDecls[i]}`) + 8)
          : src.length;
    const block = src.slice(start, end);
    const keys = new Set();
    const re = /^\s*([a-zA-Z][a-zA-Z0-9]*):\s*(?:\([^)]*\)\s*=>|"|`)/gm;
    let m;
    while ((m = re.exec(block))) keys.add(m[1]);
    dicts[dictDecls[i].toLowerCase()] = keys;
  }
  return dicts;
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

console.log("①  i18n completeness (every used key in every shipped locale)…");
const dicts = parseI18nTable();
const used = usedKeys();
const codes = Object.keys(dicts).sort();
if (codes.length < 2) fail(`expected ≥2 shipped locale dictionaries (en, bn…), found: ${codes.join(", ")}`);
for (const code of codes) {
  const miss = [...used].filter((k) => !dicts[code].has(k)).sort();
  for (const k of miss) fail(`t("${k}") used in a scene but MISSING from ${code.toUpperCase()} table`);
}
// keys defined but never used (drift) — check against the first (EN) dict
const en = dicts.en;
const drift = [...(en ?? [])].filter((k) => !used.has(k)).sort();
for (const k of drift) warn(`i18n key "${k}" defined but never used (maybe reuse or remove)`);
const ok = codes.length >= 2 && codes.every((c) => [...used].every((k) => dicts[c].has(k)));
if (ok) console.log(`  ✓ all used keys present in ${codes.map((c) => c.toUpperCase()).join(" + ")}`);

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
  // #1019 — NCTB code guard: every nctbCode must be unique and its `cN-`
  // prefix must agree with classNumber (no collisions, no class-prefix drift).
  const seenNctb = new Map();
  for (const s of skills) {
    if (!s.nctbCode && s.classNumber == null) continue;
    if (!s.nctbCode || s.classNumber == null) {
      fail(`NCTB: skill "${s.id}" must carry both nctbCode and classNumber (or neither)`);
      continue;
    }
    const m = /^c(\d+)-[a-z]+-\d+$/.exec(s.nctbCode);
    if (!m) {
      fail(`NCTB: skill "${s.id}" nctbCode "${s.nctbCode}" is not c<class>-<subject>-<unit>`);
    } else if (Number(m[1]) !== s.classNumber) {
      fail(`NCTB: skill "${s.id}" nctbCode prefix c${m[1]} disagrees with classNumber ${s.classNumber}`);
    }
    const prev = seenNctb.get(s.nctbCode);
    if (prev) fail(`NCTB: skills "${prev}" and "${s.id}" share nctbCode "${s.nctbCode}"`);
    else seenNctb.set(s.nctbCode, s.id);
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
    "number-bonds-10": 12, "number-bonds-20": 20, "bd-taka": 10, "add-sub-100": 100,
    "round-nearest-10-100": 999,
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
  // every scene key has a class file + is auto-discovered by the engine.
  // Since #15 the scenes live in the lazy Phaser chunk (engine.ts); since #936
  // the engine uses `import.meta.glob("./*Scene.ts")` for discovery, so any
  // `*Scene.ts` file with an `export class XScene` is automatically reachable
  // and there is no hand-maintained import/array to drift. The audit therefore
  // checks the DISCOVERY contract instead of static imports: the file exists,
  // exports the class, matches the `./*Scene.ts` glob, and — the part globbing
  // cannot guarantee — the class key inside it matches the catalog key.
  const engineSrc = readFileSync(join(GAME, "engine.ts"), "utf8");
  if (!/import\.meta\.glob<Record<string, unknown>>\("\.\/\*Scene\.ts", \{ eager: true \}\)/.test(engineSrc))
    fail(`engine.ts no longer uses import.meta.glob("./*Scene.ts") — update the audit to match the discovery mechanism`);
  for (const [gid, sceneKey] of Object.entries(scenes)) {
    const sceneFile = join(GAME, `${sceneKey}Scene.ts`);
    if (!existsSync(sceneFile))
      fail(`GAME_SCENES "${gid}" → "${sceneKey}" but no ${sceneKey}Scene.ts file (discovery globs *Scene.ts)`);
    else if (!new RegExp(`export class ${sceneKey}Scene`).test(readFileSync(sceneFile, "utf8")))
      fail(`${sceneKey}Scene.ts exists but has no \`export class ${sceneKey}Scene\``);
  }
  console.log(`  ✓ ${skills.length} skills, ${games.length} games, ${Object.keys(scenes).length} scenes checked`);
}

/* ── 3. seed parity ── */
console.log("③  seed.py parity (every core skill + its catalog fields in SKILLS_SEED)…");
const seedSrc = readFileSync(join(ROOT, "apps", "api", "app", "seed.py"), "utf8");
const seedIds = new Set([...seedSrc.matchAll(/^\s*\(("([^"]+)")\s*,\s*\d+\s*,/gm)].map((m) => m[2]));
for (const s of skills) {
  if (!seedIds.has(s.id)) fail(`skill "${s.id}" missing from seed.py SKILLS_SEED`);
}
// #1020 — SKILLS_SEED carries the same catalog metadata as core: nctb_code,
// class_number and description must not drift between the two sources.
const seedRows = new Map(
  [...seedSrc.matchAll(/^\s*\("([^"]+)"\s*,\s*\d+\s*,\s*"[^"]+"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"\s*,\s*(\d+)\s*,\s*"([^"]*)"\),?\s*$/gm)].map(
    (m) => [m[1], { nctbCode: m[2], classNumber: Number(m[3]), description: m[4] }]
  )
);
for (const s of skills) {
  const row = seedRows.get(s.id);
  if (!row) continue;
  if (row.nctbCode !== (s.nctbCode ?? "")) fail(`seed parity: skill "${s.id}" nctb_code "${row.nctbCode}" ≠ core "${s.nctbCode ?? ""}"`);
  if (row.classNumber !== (s.classNumber ?? null)) fail(`seed parity: skill "${s.id}" class_number ${row.classNumber} ≠ core ${s.classNumber ?? null}`);
  if (row.description !== (s.description ?? "")) fail(`seed parity: skill "${s.id}" description differs from core`);
}
if (skills.length) console.log(`  ✓ ${[...seedIds].length} skills in seed.py checked (ids + nctb/class/description)`);

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

/* ── 5. no console.log in shipped frontend code (#268) ── */
console.log("⑤  console.log scan (debug logging must never ship)…");
const SHIPPED_DIRS = [
  join(KID, "src"),            // kid app (PWA)
  join(ROOT, "apps", "parent", "app"),   // parent portal (Next.js)
  join(ROOT, "apps", "parent", "lib"),   // portal helpers
  join(ROOT, "apps", "admin", "src"),    // admin console
];
const CONSOLE_BAD = /\bconsole\.(log|debug|info|warn|trace)\(/g;
// #1324 — perfProbe.ts is the low-end-device frame-jank profiler; it NEVER
// runs for kids (gated behind ?nvperf=1 / window.__NV_PERF_ENABLED__) and its
// console.info is the only way its session summary reaches the operator.
const CONSOLE_ALLOW = new Set(["apps/kid/src/game/perfProbe.ts"]);
let consoleHits = 0;
for (const dir of SHIPPED_DIRS) {
  if (!existsSync(dir)) continue;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|js|mjs)$/.test(e.name)) continue;
      if (CONSOLE_ALLOW.has(p.replace(ROOT + "/", ""))) continue;
      const src = readFileSync(p, "utf8");
      let m;
      while ((m = CONSOLE_BAD.exec(src))) {
        consoleHits++;
        fail(`${p.replace(ROOT + "/", "")}: ${m[0].trim()} — debug logging ships to kids`);
      }
    }
  };
  walk(dir);
}
// console.error on a genuine error path is allowed (only hits above are fatal).
if (!consoleHits) console.log("  ✓ zero console.log/debug/info/warn/trace in shipped code");

/* ── 6. cross-bank word overlap (#1175) ── */
console.log("⑥  shared word-bank cross-overlap (sight ↔ CVC/grammar)…");
const bankSrc = existsSync(join(GAME, "wordBanks.ts")) ? readFileSync(join(GAME, "wordBanks.ts"), "utf8") : "";
if (bankSrc) {
  // grab the string-array blocks for the two sight pools
  const grabArray = (name) => {
    const start = bankSrc.indexOf(`export const ${name}`);
    if (start < 0) return [];
    const open = bankSrc.indexOf("[", start);
    const close = bankSrc.indexOf("];", open);
    return [...bankSrc.slice(open, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  };
  const sight = new Set([...grabArray("SIGHT_WORDS_BASE"), ...grabArray("SIGHT_WORDS_L2"), ...grabArray("SIGHT_WORDS_L3")]);
  // CVC/grammar pools are object entries `{ word: "cat", ... }` / plain strings
  const grabBlock = (name) => {
    const start = bankSrc.indexOf(`export const ${name}`);
    if (start < 0) return [];
    const open = bankSrc.indexOf("[", start);
    const close = bankSrc.indexOf("];", open);
    return [...bankSrc.slice(open, close).matchAll(/word: "([^"]+)"/g)].map((m) => m[1]);
  };
  const cvc = new Set([...grabBlock("CVC_POOL"), ...grabBlock("CVC_BUILD_EXTRA")]);
  const gram = new Set([...grabArray("GRAMMAR_NOUNS"), ...grabArray("GRAMMAR_VERBS")]);
  const overlap = [...sight].filter((w) => cvc.has(w) || gram.has(w)).sort();
  for (const w of overlap) {
    const where = [];
    if (cvc.has(w)) where.push("CVC");
    if (gram.has(w)) where.push("grammar");
    warn(`sight word "${w}" also in ${where.join(" + ")} bank — same spelling must match (wordBanks.ts is the one source)`);
  }
  if (!overlap.length) console.log("  ✓ no sight-word / CVC / grammar lexical overlap");
} else {
  warn("wordBanks.ts not found — ⑥ cross-bank lint skipped");
}

/* ── 7. AST no-unused-export scan (#820) ── */
console.log("⑦  AST no-unused-export scan (dead exports in kid src/ — TS AST, not regex)…");
{
  // #820 — the checks above are regex/string-slicing; they cannot see dead
  // symbols. This pass parses every kid src file with the REAL TypeScript
  // compiler (apps/kid/node_modules/typescript — already installed, do NOT
  // install eslint/typescript-eslint) and resolves exports against the whole
  // app's import graph instead of matching source lines. A symbol that no
  // module imports and that the exporting file never uses internally fails
  // with the FILE + SYMBOL named.
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const SRC = join(KID, "src");
  const KID_APP = join(KID, "tests"); // tests are real consumers of src exports

  // every importable file the scan resolves against (kid src + tests only —
  // build/generated/packages are not consumers of kid src symbols)
  const appFiles = [];
  const scanDir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { scanDir(p); continue; }
      if (e.name.endsWith(".d.ts") || !/\.tsx?$/.test(e.name)) continue;
      appFiles.push(p);
    }
  };
  scanDir(SRC);
  if (existsSync(KID_APP)) scanDir(KID_APP);

  const relP = (p) => p.replace(ROOT + "/", "");

  // resolve a relative module specifier to a scanned file (try both extensions
  // + index/ dir form, matching `moduleResolution: bundler`)
  const resolveLocal = (fromDir, spec) => {
    if (!spec.startsWith(".")) return null; // package / node builtin — not ours
    const base = join(fromDir, spec);
    for (const cand of [base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")]) {
      if (appFiles.includes(cand)) return cand;
    }
    return null;
  };

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const occurrences = (text, name) => (text.match(new RegExp(`\\b${escapeRe(name)}\\b`, "g")) || []).length;

  // ── coarse pass: parse every file, collect (a) every import binding name in
  // the app (tests included — a test importing a src symbol proves it lives),
  // (b) every relative dynamic import() target (lazy chunks, e.g. i18n dicts),
  // (c) every named re-export source so barrels don't look dead.
  const importedNames = new Set();     // any `import { X }` anywhere in the app
  const dynamicTargets = new Set();    // abs path of a relative import("...") target
  const reExportUsed = new Map();      // abs path -> Set(symbol) via `export { S } from ...`
  const sources = [];
  for (const p of appFiles) {
    const text = readFileSync(p, "utf8");
    const sf = ts.createSourceFile(p, text, ts.ScriptTarget.Latest, true, p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    sources.push({ p, rel: relP(p), text, sf, exports: new Map() });
    const walk = (n) => {
      if (ts.isImportDeclaration(n)) {
        const clause = n.importClause;
        if (clause) {
          if (clause.name) importedNames.add(clause.name.text); // default import
          const nb = clause.namedBindings;
          if (nb) {
            if (ts.isNamespaceImport(nb)) importedNames.add(nb.name.text);
            else for (const el of nb.elements) {
              importedNames.add(el.name.text); // local binding
              if (el.propertyName) importedNames.add(el.propertyName.text); // `X as Y` — the EXPORTED name counts too
            }
          }
        }
        return; // an import clause's own specifiers are not usages *inside* this file
      }
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments.length > 0 && ts.isStringLiteral(n.arguments[0])) {
        const tgt = resolveLocal(dirname(p), n.arguments[0].text);
        if (tgt) dynamicTargets.add(tgt);
        return;
      }
      ts.forEachChild(n, walk);
    };
    for (const s of sf.statements) walk(s);
  }

  // named re-export `export { S } from "./src"` — marks S used at the source so
  // a barrel (e.g. i18n.ts re-exporting i18n-core) never looks dead.
  const exportKw = ts.SyntaxKind.ExportKeyword;
  const hasMod = (node, kind) => !!node.modifiers && node.modifiers.some((m) => m.kind === kind);
  for (const { p, sf, exports, text } of sources) {
    const bindingNames = (bn) => {
      const names = [];
      if (ts.isIdentifier(bn)) return [bn.text];
      const f = (n) => { if (ts.isIdentifier(n)) names.push(n.text); else ts.forEachChild(n, f); };
      ts.forEachChild(bn, f);
      return names;
    };
    const addDecl = (name, stmt) => {
      exports.set(name, (exports.get(name) ?? 0) + occurrences(stmt.getText(sf), name));
    };
    for (const s of sf.statements) {
      if (hasMod(s, exportKw) && !hasMod(s, ts.SyntaxKind.DefaultKeyword)) {
        // export const/let/var/function/class/interface/type/enum — the value
        // or type name (and the destructured names) become symbols of this file
        if (ts.isVariableStatement(s)) {
          for (const d of s.declarationList.declarations) for (const n of bindingNames(d.name)) addDecl(n, s);
        } else if (s.name && ts.isIdentifier(s.name)) {
          addDecl(s.name.text, s);
        }
      } else if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) {
        for (const el of s.exportClause.elements) {
          const nm = el.propertyName ? el.propertyName.text : el.name.text;
          addDecl(nm, s);
          if (s.moduleSpecifier) {
            const tgt = resolveLocal(dirname(p), s.moduleSpecifier.text);
            if (tgt) {
              if (!reExportUsed.has(tgt)) reExportUsed.set(tgt, new Set());
              reExportUsed.get(tgt).add(nm);
            }
          }
        }
      }
      // `export default …` — entry/lazy-chunk modules are consumed by value
      // post-`import()`, never by name; skip them entirely (App.tsx etc).
    }
  }

  // ── flag: a symbol is dead iff no import binds its name anywhere, no named
  // re-export source claims it, it is not a relative-dynamic-import target and
  // its own file never references it outside the exporting statement. Scene
  // modules are excluded: engine.ts consumes them via `import.meta.glob`
  // (string-keyed, untrackable at the AST level) — the audit's ② section
  // already enforces the discovery contract for those.
  // Denylist of exports that exist TODAY but have no consumer. Each is a real
  // dead export surfaced by the AST pass on the clean tree (verified repo-wide
  // via grep — every one appears only in its own file, or as a string literal
  // in a test/lint script, never as an import). They predate this gate and are
  // not ours to remove in this wave, so they are pinned here to keep the gate
  // green. If a symbol below ever gains a real importer, DELETE its line —
  // the allowlist would then be hiding a genuinely-and-newly-dead export.
  const DEAD_ALLOW = new Set([
    // audio.ts — mute/music state accessors kept as API but not yet wired to a
    // settings surface (paired setters getRenderBand-style live; these don't).
    "apps/kid/src/game/audio.ts#isSfxMuted",
    "apps/kid/src/game/audio.ts#setKidSfxMuted",
    "apps/kid/src/game/audio.ts#isKidSfxMuted",
    "apps/kid/src/game/audio.ts#musicThemeName",
    "apps/kid/src/game/audio.ts#stopMusic",
    "apps/kid/src/game/audio.ts#isMusicOn",
    // game/i18n.ts — locale-inspection helpers orphaned by the #881 split
    // (STR/ensureStrings live on; these two have no caller).
    "apps/kid/src/game/i18n.ts#langOf",
    "apps/kid/src/game/i18n.ts#shippedLocaleCodes",
    // neuralVoice.ts — deliberate test-injection cache (seeded via
    // globalThis by the TTS harness; read here). Keep.
    "apps/kid/src/game/neuralVoice.ts#__nvTestCache",
    // renderBand.ts — read side of setRenderBand(++)/matureRender(); unused
    // until a UI reads the band off the module.
    "apps/kid/src/game/renderBand.ts#getRenderBand",
    // sceneArchetypes.ts — SCENE_ARCHETYPES table + isArchetype live; the
    // key->type helper wrapper has no caller.
    "apps/kid/src/game/sceneArchetypes.ts#sceneArchetype",
    // speech.ts — control/type surface kept for a future voice-settings sheet.
    "apps/kid/src/game/speech.ts#isSpeechEnabled",
    "apps/kid/src/game/speech.ts#VoiceTone",
    // svgAssets.ts — hasAssetTexture() is a debug/verify helper.
    "apps/kid/src/game/svgAssets.ts#hasAssetTexture",
    // tapChoice.ts — reusable tap-selection scene BASE; consumed by string in
    // tests/scenes.test.ts + scripts/lint-scene-reward.mjs, never by import.
    "apps/kid/src/game/tapChoice.ts#TapChoiceScene",
    // ui.ts — text/colour helpers kept as shared toolkit for future scenes.
    "apps/kid/src/game/ui.ts#questionTxt",
    "apps/kid/src/game/ui.ts#NV_BROWN",
    "apps/kid/src/game/ui.ts#NV_GRAY",
    "apps/kid/src/game/ui.ts#NV_INK",
    "apps/kid/src/game/ui.ts#wrapPrompt",
    "apps/kid/src/game/ui.ts#promptPill",
    // voiceRecorder.ts — paired with stop/start; the explicit cancel shim is
    // unreferenced (stop already serves).
    "apps/kid/src/game/voiceRecorder.ts#cancelRecording",
    // lib/journey.ts — family-title helper for a not-yet-shipped parent card.
    "apps/kid/src/lib/journey.ts#familyTitle",
    // nova3d/OwlRig.ts — export used when the 2D fallback owl rig is reused in
    // another surface; currently only the 3D rig path runs.
    "apps/kid/src/nova3d/OwlRig.ts#RIG_FOR_2D",
    // nova3d/Room.tsx — room-ids table kept for room switching/teleport (Garden
    // navigates by geometry today).
    "apps/kid/src/nova3d/Room.tsx#ROOM_IDS",
  ]);
  let deadCount = 0;
  for (const { p, rel, text, exports } of sources) {
    if (!p.startsWith(SRC + "/")) continue; // flag only src, not tests
    if (dynamicTargets.has(p)) continue;    // lazy import() target — exports consumed post-import
    if (/^.*Scene\.tsx?$/.test(basename(p))) continue; // import.meta.glob discovery (see ②)
    const reExportSet = reExportUsed.get(p);
    for (const [name, declCount] of exports) {
      if (DEAD_ALLOW.has(`${rel}#${name}`)) continue;
      if (importedNames.has(name)) continue;              // imported by ANY app file (tests count)
      if (reExportSet && reExportSet.has(name)) continue; // re-exported by a barrel
      if (occurrences(text, name) > declCount) continue;  // self-used outside the export
      deadCount++;
      fail(`unused export ${rel} → ${name} — no importer anywhere and never used internally`);
    }
  }
  if (deadCount === 0) console.log(`  ✓ no unused exports across ${sources.filter((s) => s.p.startsWith(SRC + "/")).length} src files (AST no-unused-export scan)`);
  else console.log(`  ✖ ${deadCount} dead export(s) — see above`);
}

/* ── 8. drag-only scene trap (a kid who can't drag must never be stuck) ──
   A scene that wires drag input (setDraggable / .on("dragend")) but exposes NO
   tap fallback (.on("pointerdown"|"pointerup") / registerTap) can trap a kid who
   can't drag: the round never completes → they're stuck. binSort/reorder BASES
   carry the tap fallback so their subclasses are fine; this catches a STANDALONE
   Phaser.Scene (like PrepositionsScene was) that owns its own drag handlers with
   no tap path. Prevents the "some games are not playable" class from recurring. */
console.log("⑧  drag-only scene trap (drag input with no tap fallback)…");
let dragTraps = 0;
for (const f of readdirSync(GAME).filter((x) => x.endsWith("Scene.ts"))) {
  const src = readFileSync(join(GAME, f), "utf8");
  // Only STANDALONE scenes own their input wiring; subclasses inherit the base's
  // tap fallback (DragReorderScene/BinSortScene both have registerTap/pointerdown).
  if (!/extends\s+Phaser\.Scene/.test(src)) continue;
  const hasDrag = /setDraggable\s*\(|\.on\(\s*["']dragend["']/.test(src);
  const hasTap = /\.on\(\s*["'](pointerdown|pointerup)["']|registerTap\s*\(/.test(src);
  if (hasDrag && !hasTap) {
    fail(`${f}: drag input (setDraggable/dragend) with NO tap fallback (pointerdown/pointerup) — a kid who can't drag is trapped. Add a tap-to-place path (see PrepositionsScene / reorder.ts #1999).`);
    dragTraps++;
  }
}
if (dragTraps === 0) console.log("  ✓ no drag-only standalone scenes (every drag scene has a tap fallback)");

console.log("\n──────────────────────────────");
if (errors) { console.log(`✖ ${errors} error(s), ${warns} warning(s)`); process.exit(1); }
if (warns) console.log(`✓ 0 errors, ${warns} warning(s) — fix warnings or leave deliberate`);
else console.log("✓ clean");
