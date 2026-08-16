#!/usr/bin/env node
/**
 * Hermetic tests for the SHARED safety table (#1664) + the i18n.ts scan corpus
 * (#1663). Run with plain node — no test runner, no network.
 *
 * Run:  node apps/kid/tests/safety-scan.test.mjs   (from repo root)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const { unsafeWords, ALLOWLIST, isAllowlisted } = await import(
  pathToFileURL(join(ROOT, "scripts", "safety-words.mjs")).href
);

let failures = 0;
const assert = (cond, msg) => {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✖ ${msg}`);
  }
};

console.log("① the shared safety table loads from scripts/safety-words.mjs (#1664)");
assert(unsafeWords && typeof unsafeWords === "object", "unsafeWords exports an object");
assert(Array.isArray(unsafeWords.en?.violence), "EN table has a 'violence' category");
assert(unsafeWords.en.violence.includes("kill"), "EN table blocks 'kill'");
assert(Array.isArray(unsafeWords.bn?.death), "BN table has a 'death' category");
assert(unsafeWords.bn.death.includes("মর"), "BN table blocks 'মর'");

console.log("② every allowlist entry is a real unsafe word WITH a reason");
const allTerms = [];
for (const cat of Object.values(unsafeWords.en)) allTerms.push(...cat);
for (const cat of Object.values(unsafeWords.bn)) allTerms.push(...cat);
const termSet = new Set(allTerms);
for (const [word, reason] of ALLOWLIST) {
  assert(termSet.has(word), `allowlist key "${word}" is an actual unsafe word`);
  assert(typeof reason === "string" && reason.trim().length > 0, `allowlist key "${word}" has a non-empty reason`);
}
assert(isAllowlisted("die") === ALLOWLIST.has("die"), "isAllowlisted reflects the shared allowlist");

console.log("③ both build gates consume safety-words.mjs (no duplicate lists)");
const contentSrc = readFileSync(join(ROOT, "scripts", "content-safety.mjs"), "utf8");
assert(/import \{ unsafeWords, ALLOWLIST \} from "\.\/safety-words\.mjs"/.test(contentSrc),
  "content-safety.mjs imports unsafeWords + ALLOWLIST from safety-words.mjs");
assert(!/const WORDS_JSON/.test(contentSrc),
  "content-safety.mjs no longer loads a duplicate inline word table");
assert(/Object\.values\(wordsByLang\.en\)/.test(contentSrc),
  "content-safety.mjs builds its regexes from the shared unsafeWords table");

const oracleSrc = readFileSync(join(ROOT, "scripts", "team", "oracle_team.py"), "utf8");
assert(oracleSrc.includes('["node", "scripts/safety-words.mjs"]'),
  "oracle_team.py shells out to the same safety-words.mjs");
assert(!/_SAFETY_WORDS\s*=/.test(oracleSrc),
  "oracle_team.py no longer holds a duplicate inline word table");

console.log("④ the i18n.ts corpus is scanned by BOTH gates (#1663)");
assert(contentSrc.includes('join(KID, "game", "i18n.ts")'),
  "content-safety.mjs scans apps/kid/src/game/i18n.ts");
assert(contentSrc.includes('join(KID, "i18n.ts")'),
  "content-safety.mjs scans the app-level i18n.ts");
assert(oracleSrc.includes('"game" / "i18n.ts"'),
  "oracle_team.py l1_safety scans apps/kid/src/game/i18n.ts");
assert(oracleSrc.includes('"i18n.ts"'),
  "oracle_team.py l1_safety scans the app-level i18n.ts");

console.log("");
if (failures) {
  console.error(`✖ safety-scan: ${failures} failure(s)`);
  process.exit(1);
}
console.log("✓ safety-scan: shared table + i18n corpus hold across both gates");
