#!/usr/bin/env node
/**
 * 🧠 Every onRoundDone difficulty arg is an index-based 1..6 (v50 difficulty-model
 * feed #11). roundCoinTier() (store.ts) pays coins by a 1-BASED LEVEL INDEX
 * (d≥6→3, d≥4→2, else 1) and the server stores `difficulty` — so a scene that
 * reports its LEVEL VALUE (this.levels[min(...)], this.target, this.answer,
 * this.divisor, this.fact.b, this.percent, this.target.den, this.roundTarget,
 * this.shown, this.currentLevel()) instead of `this.levelIndex + 1` skews both
 * the coin economy and the stored difficulty metric.
 *
 * Every scene seeds `this.levelIndex = data.startLevelIndex ?? 0` (0-based), so
 * `levelIndex + 1` is the one true 1..6 index.
 *
 * Run:  node apps/kid/tests/on_round_done_difficulty.test.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "game");
let total = 0;
let bad = [];

for (const f of readdirSync(dir)) {
  if (!/\.(ts|tsx)$/.test(f) || f.includes(".test.")) continue;
  const src = readFileSync(join(dir, f), "utf8");
  const startRe = /this\.onRoundDone\?\.\(/g;
  let m;
  while ((m = startRe.exec(src))) {
    total++;
    let i = m.index + m[0].length - 1;
    let depth = 1;
    const s = [];
    while (i < src.length && depth > 0) {
      i++;
      const ch = src[i];
      if (ch === "(") depth++;
      else if (ch === ")") { if (--depth === 0) break; }
      s.push(ch);
    }
    const body = s.join("");
    const parts = []; let d = 0, cur = "";
    for (const ch of body) {
      if (ch === "(" || ch === "[") d++;
      else if (ch === ")" || ch === "]") d--;
      if (ch === "," && d === 0) { parts.push(cur); cur = ""; }
      else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    const third = (parts[2] ?? "").replace(/\s+/g, " ").trim();
    const indexBased = /\blevelIndex\s*\+\s*1\b/.test(third);
    const line = src.slice(0, m.index).split("\n").length;
    if (!indexBased) bad.push(`${f}:${line}  → ${third}`);
  }
}

console.log(`checked ${total} onRoundDone calls`);
if (bad.length) {
  console.log(`✖ ${bad.length} non-index difficulty args:`);
  for (const b of bad) console.log(`   ${b}`);
  process.exit(1);
}
console.log("✓ every onRoundDone difficulty arg is index-based (levelIndex + 1)");
