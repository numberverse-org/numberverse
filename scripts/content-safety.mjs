#!/usr/bin/env node
/**
 * Child-safety content gate (#91).
 *
 * Run:  node scripts/content-safety.mjs   (from repo root)
 *
 * Scans every skill title and every game-scene display string for words a
 * child should never see in an educational app (violence, horror, insults).
 * FAILS the build on any hit so no new scene can silently ship an unsafe
 * word. Mirrors the oracle's l1_safety() check but as a fast, self-contained
 * gate with a real ALLOWLIST (the oracle has none).
 *
 * If a word is BOTH legitimate in context AND kid-safe, add it to ALLOWLIST
 * with a one-line reason (see docs/CONTENT_SAFETY.md). Word-boundary regexes,
 * so "skills" never trips "kill" and "diet" never trips "die".
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

// Word-boundary matched — "skill!" must not trip "kill", "die" must not trip "diet".
const UNSAFE = [
  /\bkill\b/, /\bblood\b/, /\bbomb\b/, /\bweapon\b/, /\bshoot\b/, /\bmurder\b/,
  /\bghost\b/, /\bdemon\b/, /\bdevil\b/, /\bdead\b/, /\bscary\b/, /\btoxic\b/,
  /\bpoison\b/, /\bhate\b/, /\bstupid\b/, /\bugly\b/, /\bliar\b/, /\bcurse\b/,
  /\bdie\b/, /\bkill/, /\bdied\b/, /\bgun\b/,
];

// Legitimate kid-safe uses. Key = the unsafe word (lowercase). Value = reason.
const ALLOWLIST = new Map([
  // e.g. ["die", "math game uses 'roll the die' (singular of dice)"],
]);

const SRC = join(ROOT, "packages", "core", "src");
const KID = join(ROOT, "apps", "kid", "src");

let hits = [];
const scanText = (label, text) => {
  for (const re of UNSAFE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const word = m[0].toLowerCase();
      if (ALLOWLIST.has(word)) continue;
      const lineNo = text.slice(0, m.index).split("\n").length;
      hits.push(`${label}:${lineNo}: unsafe word "${m[0]}"`);
      break; // one hit per unsafe regex per text is enough
    }
  }
};

// ── skills.ts — every `title: '...'` (English) is kid-facing ──
const skillsSrc = readFileSync(join(SRC, "skills.ts"), "utf8");
for (const m of skillsSrc.matchAll(/title:\s*'([^']+)'/g)) {
  scanText("packages/core/src/skills.ts", `title: "${m[1]}"`);
}

// ── game scenes — quoted display strings a kid reads/hears ──
for (const f of readdirSync(join(KID, "game")).filter((n) => n.endsWith("Scene.ts"))) {
  const src = readFileSync(join(KID, "game", f), "utf8");
  for (const m of src.matchAll(/['"`]([^'"`]{3,120})['"`]/g)) {
    scanText(`apps/kid/src/game/${f}`, m[1]);
  }
}

console.log(`Content-safety scan: ${skillsSrc.match(/title:/g).length} skill titles + ${readdirSync(join(KID, "game")).filter((n) => n.endsWith("Scene.ts")).length} scenes checked`);
if (hits.length) {
  for (const h of hits.slice(0, 20)) console.error(`  ✖ ${h}`);
  console.error(`✖ ${hits.length} unsafe content hit(s). Fix them or add a justified ALLOWLIST entry (docs/CONTENT_SAFETY.md).`);
  process.exit(1);
}
console.log("✓ no unsafe words in shipped content");
