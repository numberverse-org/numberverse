#!/usr/bin/env node
/**
 * 🌍 Locale festival windows (#137 / feed test-coverage-core #7) — regression
 * for currentFestival's DATE-BOUNDARY matrix:
 *   - fixed MM-DD feasts (boishakh, christmas) and year-scoped YYYY-MM-DD
 *     lunar windows (eid_fitr) are INCLUSIVE on both ends: the last festival
 *     day still returns the festival, and the day after returns null.
 *   - an unknown locale falls back to the en calendar (LOCALES.en), so "zz"
 *     yields exactly what "en" yields.
 *
 * Run:  node packages/core/tests/locale_festival.mjs
 */
import { currentFestival } from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

/** Build a LOCAL Date (not UTC) from "YYYY-MM-DD" so the function's local
 *  getMonth/getDate/getFullYear see exactly the day we mean. */
const day = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const bn = (s) => currentFestival("bn", day(s));

/* ── bn #7 date-boundary matrix ── */
check("bn 2026-03-18 → eid_fitr (inside window)", bn("2026-03-18")?.key, "eid_fitr");
check("bn 2026-03-24 → null (day after eid_fitr closes)", bn("2026-03-24"), null);
check("bn 2026-04-30 → boishakh (last boishakh day)", bn("2026-04-30")?.key, "boishakh");
check("bn 2026-05-01 → null (day after boishakh closes)", bn("2026-05-01"), null);

/* ── inclusive/exclusive edge: the LAST festival day still returns it ── */
check("bn 2026-03-23 → eid_fitr (last eid_fitr day, inclusive)", bn("2026-03-23")?.key, "eid_fitr");

/* ── unknown locale falls back to the en calendar ── */
const dec25 = day("2026-12-25");
const zz = currentFestival("zz", dec25);
const en = currentFestival("en", dec25);
check("zz 2026-12-25 → christmas (en fallback)", zz?.key, "christmas");
check("zz equals en on the same date", zz, en);

console.log("─".repeat(30));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all locale festival tests passed");
