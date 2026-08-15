#!/usr/bin/env node
/**
 * Self-contained tests for #131 — the locale-pack architecture.
 *
 * Run:  pnpm --filter @numberverse/core build && node scripts/test-locale.mjs
 *
 * Proves the app is language+country EXTENSIBLE as a config addition:
 *   1. Registry: en + bn are shipped; ar + hi are planned scaffolds in their
 *      OWN tree-shaken module (PLANNED_LOCALES) with the right RTL + digit
 *      metadata (Bangla today, Arabic/Hindi later) — registerPlannedLocales()
 *      merges them in for a preview/research build.
 *   2. Digit rendering: each locale's numerals map 0-9 (০১২৩ … ٠١٢٣ … ०१२३).
 *   3. Fallback: unknown locale codes never break — they resolve to English.
 *   4. i18n table: the shipped-locale dictionary registry + parity over every
 *      used key (mirrors apps/kid/scripts/audit.mjs — an extra safety net here).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { LOCALES, getLocale, shippedLocales, formatNumber, isRtl, currentFestival, PLANNED_LOCALES, registerPlannedLocales } = require("../packages/core/dist/index.js");

let fails = 0;
const check = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log(`  ✓ ${name}`);
  } else {
    fails++;
    console.error(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
};

console.log("①  Registry — shipped locales en+bn; planned ar+hi tree-shaken…");
check("en shipped", LOCALES.en.status, "shipped");
check("bn shipped", LOCALES.bn.status, "shipped");
check("ar NOT in shipped registry (tree-shake)", LOCALES.ar, undefined);
check("hi NOT in shipped registry (tree-shake)", LOCALES.hi, undefined);
check("shippedLocales() sorted", shippedLocales(), ["bn", "en"]);
check("bn curriculum is Bangladesh", LOCALES.bn.curriculum, "nctb-bangladesh");
check("planned ar scaffold", PLANNED_LOCALES.ar.status, "planned");
check("planned hi scaffold", PLANNED_LOCALES.hi.status, "planned");
check("ar is RTL", PLANNED_LOCALES.ar.dir, "rtl");
check("en is LTR", isRtl("en"), false);
check("registerPlannedLocales() extends the registry", (() => {
  registerPlannedLocales(LOCALES);
  return LOCALES.ar?.dir;
})(), "rtl");
check("ar isRtl true after registration", isRtl("ar"), true);

console.log("②  Digit rendering — each locale's numeral set…");
check("en latin", formatNumber(123, "en"), "123");
check("bn bengali", formatNumber(123, "bn"), "১২৩");
check("ar arabic-indic", formatNumber(123, "ar"), "١٢٣");
check("hi devanagari", formatNumber(123, "hi"), "१२३");
check("bn zero", formatNumber(0, "bn"), "০");
check("ar 0-9", formatNumber(67890, "ar"), "٦٧٨٩٠");

console.log("③  Fallback — unknown codes never break…");
check("unknown → en pack", getLocale("zz").code, "en");
check("unknown → latin digits", formatNumber(5, "zz"), "5");
check("empty → en", getLocale("").code, "en");

console.log("⑤  Festivals — country config, the UI just reads the active one (#137)…");
check("bn has Boishakh", LOCALES.bn.festivals.some((f) => f.key === "boishakh"), true);
check("bn has Eid (lunar config)", LOCALES.bn.festivals.filter((f) => f.key.startsWith("eid_")).length, 2);
check("en has Christmas", LOCALES.en.festivals.some((f) => f.key === "christmas"), true);
check("ar has Ramadan (planned)", PLANNED_LOCALES.ar.festivals.some((f) => f.key === "ramadan"), true);
check("hi has Diwali (planned)", PLANNED_LOCALES.hi.festivals.some((f) => f.key === "diwali"), true);
check("off-season → null", currentFestival("bn", new Date("2026-08-15T12:00:00")), null);
check("Boishakh window active", currentFestival("bn", new Date("2026-04-14T12:00:00"))?.key, "boishakh");
check("lunar Eid window active", currentFestival("bn", new Date("2026-03-20T12:00:00"))?.key, "eid_fitr");
check("unknown locale falls back to en's festival", currentFestival("zz", new Date("2026-12-25T12:00:00"))?.key, "christmas");

console.log("④  i18n table parity (apps/kid/src/game/i18n.ts)…");
const src = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), "apps", "kid", "src", "game", "i18n.ts"), "utf8");
const dictDecls = [...src.matchAll(/const ([A-Z][A-Z0-9_]*): Record<string, Entry> = \{/g)].map((m) => m[1]);
const dictCodes = dictDecls.map((c) => c.toLowerCase()).sort();
check("DICTS has a dict for en + bn", dictCodes, ["bn", "en"]);
// each shipped locale (from core) that has a dict must cover every used t() key
const used = new Set();
for (const m of src.matchAll(/\bt\(\s*["'`]([a-zA-Z][a-zA-Z0-9_-]*)["'`]/g)) used.add(m[1]);
for (const code of dictCodes) {
  const block = src.slice(src.indexOf(`const ${code.toUpperCase()}`));
  const keys = new Set();
  for (const m of block.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*):\s*(?:\([^)]*\)\s*=>|"|`)/gm)) keys.add(m[1]);
  for (const k of used) {
    if (!keys.has(k)) { fails++; console.error(`  ✖ ${code}: missing t("${k}")`); }
  }
}
if (fails === 0) console.log("  ✓ every used i18n key present in every shipped-locale dict");

console.log();
if (fails) { console.error(`✖ ${fails} FAILURE(S)`); process.exit(1); }
console.log("✓ locale-pack architecture holds — a new language is a config addition (#131)");
