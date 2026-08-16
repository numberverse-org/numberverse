#!/usr/bin/env node
/**
 * 🖐️ MONI — per-skill error fingerprint (#335) + learning-style classifier
 * (#332). Feed #13. Self-contained: runs against the BUILT core
 * (packages/core/dist) with zero deps, so CI can run it bare after
 * `pnpm --filter @numberverse/core build`.
 *
 * Run:  node packages/core/tests/moni_fingerprint.mjs
 */
import { fingerprintAnswer, deriveLearningStyle } from "../dist/index.js";

let fails = 0;
let checks = 0;
const check = (name, got, want) => {
  checks++;
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

/* ────────────────────────────────────────────────────────────────────────
 * fingerprintAnswer() — EXHAUSTIVE, table-driven over every code the source
 * can return. Each row is (correct, wrong, expected {code,label}|null) and
 * the source's branch ORDER is exercised too (e.g. 1→2 is overcount-1, NOT
 * double; 10→20 is off-by-ten, NOT double).
 * ──────────────────────────────────────────────────────────────────────── */
const FP = [
  // non-numeric → null
  ["7", 6, null],
  [7, "6", null],

  // non-finite → null
  [NaN, 5, null],
  [5, NaN, null],
  [Infinity, 5, null],
  [5, -Infinity, null],

  // overcount-1 : w === c + 1
  [5, 6, { code: "overcount-1", label: "Counts one too many" }],
  [0, 1, { code: "overcount-1", label: "Counts one too many" }],
  // precedence: c+1 wins over double (1→2)
  [1, 2, { code: "overcount-1", label: "Counts one too many" }],

  // undercount-1 : w === c - 1
  [5, 4, { code: "undercount-1", label: "Counts one too few" }],
  // precedence: c-1 wins over half (2→1)
  [2, 1, { code: "undercount-1", label: "Counts one too few" }],

  // off-by-ten : |w - c| === 10
  [25, 35, { code: "off-by-ten", label: "Off by ten — tens/ones mix-up" }],
  [25, 15, { code: "off-by-ten", label: "Off by ten — tens/ones mix-up" }],
  // precedence: off-by-ten wins over double (10→20)
  [10, 20, { code: "off-by-ten", label: "Off by ten — tens/ones mix-up" }],

  // off-by-hundred : |w - c| === 100
  [250, 350, { code: "off-by-hundred", label: "Off by one hundred — place mix-up" }],
  [250, 150, { code: "off-by-hundred", label: "Off by one hundred — place mix-up" }],
  // precedence: off-by-hundred wins over double (100→200)
  [100, 200, { code: "off-by-hundred", label: "Off by one hundred — place mix-up" }],

  // double : c !== 0 && w === 2 * c
  [4, 8, { code: "double", label: "Doubles the number" }],
  [3, 6, { code: "double", label: "Doubles the number" }],

  // half : c !== 0 && w === c / 2
  [8, 4, { code: "half", label: "Halves the number" }],
  [6, 3, { code: "half", label: "Halves the number" }],

  // reversal : single-digit mirror pairs (all six)
  [6, 9, { code: "reversal", label: "Writes the digit the wrong way round" }],
  [9, 6, { code: "reversal", label: "Writes the digit the wrong way round" }],
  [2, 5, { code: "reversal", label: "Writes the digit the wrong way round" }],
  [5, 2, { code: "reversal", label: "Writes the digit the wrong way round" }],
  [8, 3, { code: "reversal", label: "Writes the digit the wrong way round" }],
  [3, 8, { code: "reversal", label: "Writes the digit the wrong way round" }],

  // no recognizable pattern → null
  [4, 7, null],
  [0, 0, null],
];

/* ── deriveLearningStyle() — fast / social / steady ── */
const style = (speedTendency, affinities) => ({
  speedTendency,
  gameAffinity: affinities,
  bestGame: null,
  avgResponseMs: 0,
});

const four = { a: 0.15, b: 0.15, c: 0.15, d: 0.15, e: 0.14, f: 0.01 };
const three = { a: 0.15, b: 0.15, c: 0.15, d: 0.14, e: 0.01 };
const five = { a: 0.15, b: 0.15, c: 0.15, d: 0.15, e: 0.15 };
const one = { a: 0.15, b: 0.05 };
const justBelow = { a: 0.1499, b: 0.15, c: 0.15, d: 0.15 };

console.log("── fingerprintAnswer() exhaustive table ──");
for (const [c, w, want] of FP) {
  const got = fingerprintAnswer("skill", c, w);
  check(`fp(${JSON.stringify(c)}, ${JSON.stringify(w)}) → ${want?.code ?? "null"}`, got, want);
}

console.log("── deriveLearningStyle() ──");
// fast : speedTendency > 0.6 (fast wins even when social would also match)
check("fast when speedTendency 0.61", deriveLearningStyle(style(0.61, {})), "fast");
check("fast beats social (0.9 + 4 affinities)", deriveLearningStyle(style(0.9, four)), "fast");
// exactly 0.6 is NOT > 0.6 → falls through to social
check("0.6 boundary is not fast → social", deriveLearningStyle(style(0.6, four)), "social");

// social : not fast AND >= 4 affinities >= 0.15
check("social with exactly 4 affinities at 0.15", deriveLearningStyle(style(0.4, four)), "social");
check("3 affinities at 0.15 → NOT social (steady)", deriveLearningStyle(style(0.4, three)), "steady");
check("5 affinities at 0.15 → social (>= 4)", deriveLearningStyle(style(0.4, five)), "social");
check("affinity exactly 0.15 counts toward breadth", deriveLearningStyle(style(0.4, { a: 0.15, b: 0.15, c: 0.15, d: 0.15 })), "social");
check("0.1499 below bar → 3 count → steady", deriveLearningStyle(style(0.4, justBelow)), "steady");

// steady : not fast, < 4 affinities >= 0.15
check("steady with 0.4 speed + 1 affinity", deriveLearningStyle(style(0.4, one)), "steady");
check("steady with no affinities", deriveLearningStyle(style(0.4, {})), "steady");
check("steady with all affinities below bar", deriveLearningStyle(style(0.4, { a: 0.14, b: 0.01 })), "steady");

console.log("─".repeat(30));
console.log(`checks: ${checks}`);
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all moni fingerprint + learning-style tests passed");
