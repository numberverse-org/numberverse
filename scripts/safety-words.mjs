#!/usr/bin/env node
/**
 * The SINGLE shared unsafe-word table + allowlist for every content-safety
 * gate (#1664).
 *
 * The UNSAFE word table lives in apps/kid/src/game/unsafeWords.json — the
 * canonical source also consumed by the runtime TTS guard
 * (apps/kid/src/game/speechSafety.ts). The ALLOWLIST (kid-safe legitimate
 * collisions) lives HERE so there is exactly ONE place that decides "this word
 * may ship".
 *
 * BOTH build gates consume this one module:
 *   · scripts/content-safety.mjs  → `import { unsafeWords, ALLOWLIST }`
 *   · scripts/team/oracle_team.py → `node scripts/safety-words.mjs` (CLI JSON)
 * The Oracle cannot import ESM directly, so running this file as a CLI prints
 * the shared table + allowlist as JSON — the two gates read the SAME module,
 * so the lists can never drift (docs/CONTENT_SAFETY.md: "they must agree").
 *
 * Run:  node scripts/safety-words.mjs   (prints the shared table as JSON)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORDS_JSON = join(ROOT, "apps", "kid", "src", "game", "unsafeWords.json");

/** Shared UNSAFE word table (EN + BN categories) — sourced from unsafeWords.json. */
export const unsafeWords = JSON.parse(readFileSync(WORDS_JSON, "utf8"));

/**
 * Legitimate kid-safe uses. Key = the unsafe word (lowercase, as it appears in
 * the table). Value = a one-line REASON — a bare entry with no reason is
 * rejected in review (see docs/CONTENT_SAFETY.md). Add an entry here (and
 * nowhere else) so the CI gate and the Oracle agree on the same allowlist.
 */
export const ALLOWLIST = new Map([
  // e.g. ["die", "math game uses 'roll the die' (singular of dice)"],
]);

/** Is a word on the shared allowlist? (lowercased). */
export function isAllowlisted(word) {
  return ALLOWLIST.has(String(word).toLowerCase());
}

// CLI mode: print the shared table as JSON for the Python oracle, which cannot
// import ESM. Both gates therefore derive from the SAME module — no drift.
const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  process.stdout.write(
    JSON.stringify({
      unsafeWords,
      allowlist: Object.fromEntries(ALLOWLIST),
    })
  );
}
