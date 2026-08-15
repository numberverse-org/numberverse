#!/usr/bin/env node
/**
 * Child-safety content gate (#91).
 *
 * Run:  node scripts/content-safety.mjs   (from repo root)
 *
 * Scans every child-facing display surface for words a kid should never see
 * in an educational app: skill titles/descriptions (EN + BN), game-scene
 * strings, the 3D island source, and BOTH i18n dictionaries (apps/kid/src/
 * i18n.ts + apps/kid/src/game/i18n.ts) — the largest source of display text.
 * FAILS the build on any hit so no surface can silently ship an unsafe word.
 * Mirrors the oracle's l1_safety() check but as a fast, self-contained gate
 * with a real ALLOWLIST (the oracle has none).
 *
 * The word lists live in apps/kid/src/game/unsafeWords.json — the SINGLE
 * source of truth shared by this gate, scripts/team/oracle_team.py, and the
 * runtime TTS guard in apps/kid/src/game/speech.ts (no duplicate lists to
 * drift out of sync).
 *
 * If a word is BOTH legitimate in context AND kid-safe, add it to ALLOWLIST
 * with a one-line reason (see docs/CONTENT_SAFETY.md). Word-boundary regexes,
 * so "skills" never trips "kill" and "diet" never trips "die".
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

// Word-boundary matched — "skill!" must not trip "kill", "die" must not trip "diet".
// Bangla script has no ASCII word boundaries, so BN words use explicit
// Bangla-script lookarounds ("মর" in "মরিচ" must not trip "die").
const BANGLA_RANGE = "\\u0980-\\u09FF";
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const WORDS_JSON = join(ROOT, "apps", "kid", "src", "game", "unsafeWords.json");
let wordsByLang;
try {
  wordsByLang = JSON.parse(readFileSync(WORDS_JSON, "utf8"));
} catch (err) {
  console.error(`✖ cannot read shared unsafe-word list at ${WORDS_JSON}: ${err.message}`);
  process.exit(1);
}

const UNSAFE = [
  ...Object.values(wordsByLang.en).flat().map((w) =>
    new RegExp(`\\b${escapeRegExp(w)}\\b`, "i")),
  ...Object.values(wordsByLang.bn).flat().map((w) =>
    new RegExp(`(?<![${BANGLA_RANGE}])${escapeRegExp(w)}(?![${BANGLA_RANGE}])`, "u")),
];

// Legitimate kid-safe uses. Key = the unsafe word (lowercase). Value = reason.
const ALLOWLIST = new Map([
  // e.g. ["die", "math game uses 'roll the die' (singular of dice)"],
]);

const SRC = join(ROOT, "packages", "core", "src");
const KID = join(ROOT, "apps", "kid", "src");

let hits = [];
const scanText = (label, text, lineNo = 1) => {
  for (const re of UNSAFE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const word = m[0].toLowerCase();
      if (ALLOWLIST.has(word)) continue;
      const hitLine = lineNo + text.slice(0, m.index).split("\n").length - 1;
      hits.push(`${label}:${hitLine}: unsafe word "${m[0]}"`);
      break; // one hit per unsafe regex per text is enough
    }
  }
};

const stripJsComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ── skills.ts — every EN + BN title/description is rendered to kids ──
const skillsSrc = readFileSync(join(SRC, "skills.ts"), "utf8");
let skillFieldCount = 0;
for (const m of skillsSrc.matchAll(/\b(titleBn|descriptionBn|description|title):\s*'([^']+)'/g)) {
  skillFieldCount++;
  const lineNo = skillsSrc.slice(0, m.index).split("\n").length;
  scanText(`packages/core/src/skills.ts:${m[1]}`, m[2], lineNo);
}

// ── game scenes — quoted display strings a kid reads/hears ──
const sceneFiles = readdirSync(join(KID, "game")).filter((n) => n.endsWith("Scene.ts"));
for (const f of sceneFiles) {
  const src = readFileSync(join(KID, "game", f), "utf8");
  for (const m of src.matchAll(/['"`]([^'"`\n]{3,120})['"`]/g)) {
    const lineNo = src.slice(0, m.index).split("\n").length;
    scanText(`apps/kid/src/game/${f}`, m[1], lineNo);
  }
}

// ── 3D island (#684) — child-facing strings outside the Scene dir ──
const nova3dDir = join(KID, "nova3d");
const nova3dFiles = readdirSync(nova3dDir).filter((n) => /\.[tj]sx?$/.test(n));
for (const f of nova3dFiles) {
  const src = readFileSync(join(nova3dDir, f), "utf8");
  for (const m of src.matchAll(/['"`]([^'"`\n]{3,120})['"`]/g)) {
    const lineNo = src.slice(0, m.index).split("\n").length;
    scanText(`apps/kid/src/nova3d/${f}`, m[1], lineNo);
  }
}

// ── i18n dictionaries — scan comment-stripped lines so a word hidden in a
//    template-literal fragment is still caught (the largest display surface). ──
const i18nFiles = [
  join(KID, "i18n.ts"),
  join(KID, "game", "i18n.ts"),
];
let i18nLines = 0;
for (const f of i18nFiles) {
  const src = stripJsComments(readFileSync(f, "utf8"));
  const lines = src.split("\n");
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    i18nLines++;
    scanText(f.replace(ROOT, "").replace(/^\//, ""), line, idx + 1);
  });
}

console.log(
  `Content-safety scan: ${skillFieldCount} skill titles/descriptions + ` +
  `${sceneFiles.length} scenes + ${nova3dFiles.length} 3D-island files + ${i18nLines} i18n lines checked`
);
if (hits.length) {
  for (const h of hits.slice(0, 20)) console.error(`  ✖ ${h}`);
  console.error(`✖ ${hits.length} unsafe content hit(s). Fix them or add a justified ALLOWLIST entry (docs/CONTENT_SAFETY.md).`);
  process.exit(1);
}
console.log("✓ no unsafe words in shipped content");
