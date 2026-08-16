#!/usr/bin/env node
/**
 * 🧠 SKILLS family cross-reference integrity + curriculum lookup helpers
 * (feed test-coverage-core #2/#3).
 *
 * #2 — EVERY skill whose `family` is set must have a matching entry in
 *      SKILL_FAMILIES (by id), the family id must be a NON-EMPTY string, and
 *      every family skill must carry a numeric `tier`.
 * #3 — curriculum lookup helpers: defaultSceneForBand(1..8) returns a scene
 *      key that GAME_SCENES maps to; the no-game fallback is 'CountPop';
 *      getSkill / skillsForBand / getGame return the right entries.
 *
 * Run:  node packages/core/tests/skills_families.mjs
 */
import {
  SKILLS,
  SKILL_FAMILIES,
  GAME_SCENES,
  getSkill,
  skillsForBand,
  getGame,
  defaultSceneForBand,
} from "../dist/index.js";

let fails = 0;
let checks = 0;
const check = (name, got, want) => {
  checks++;
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

/* ══════════ #2 — family cross-reference integrity ══════════ */

// EVERY skill whose family is set must have a matching SKILL_FAMILIES entry.
const dangling = SKILLS.filter((s) => s.family && !SKILL_FAMILIES.some((f) => f.id === s.family));
check(
  `family cross-reference: no dangling ids (${SKILLS.length} skills / ${SKILL_FAMILIES.length} families)`,
  dangling,
  []
);
if (dangling.length) for (const s of dangling) console.log(`    dangling: ${s.id} → ${s.family}`);

// Every family id (when set) is a NON-EMPTY string.
const familySkills = SKILLS.filter((s) => s.family !== undefined);
const badFamily = familySkills.filter((s) => typeof s.family !== "string" || s.family.trim() === "");
check(`every skill with a family has a non-empty string family id (${familySkills.length} skills)`, badFamily, []);

// Every skill with a family has a numeric tier.
const missingTier = familySkills.filter((s) => typeof s.tier !== "number" || !Number.isFinite(s.tier));
check(`every skill with a family has a numeric tier (${familySkills.length} skills)`, missingTier, []);

/* ══════════ #3 — curriculum lookup helpers ══════════ */

// defaultSceneForBand(b) for b = 1..8 returns a scene key GAME_SCENES maps to.
const sceneValues = new Set(Object.values(GAME_SCENES));
const defaultScenes = {};
for (let b = 1; b <= 8; b++) {
  const scene = defaultSceneForBand(b);
  defaultScenes[b] = scene;
  check(`defaultSceneForBand(${b}) is a recognized GAME_SCENES scene`, sceneValues.has(scene), true);
}

// No-game fallback → 'CountPop' (band 999 has no skills, so no skill.game).
check("defaultSceneForBand(999) no-game fallback → CountPop", defaultSceneForBand(999), "CountPop");

// getSkill: known id → the right skill; unknown id → undefined.
const known = getSkill("count-1-10");
check('getSkill("count-1-10") returns the count-1-10 skill', known?.id, "count-1-10");
check('getSkill("count-1-10") is band 1', known?.band, 1);
check('getSkill("does-not-exist") → undefined', getSkill("does-not-exist"), undefined);

// skillsForBand: only skills of that band.
const band3 = skillsForBand(3);
check(`skillsForBand(3) returns only band-3 skills (${band3.length} skills)`, band3.every((s) => s.band === 3), true);
check("skillsForBand(3) is non-empty", band3.length > 0, true);

// getGame: known game id → its config, and its id maps through GAME_SCENES.
const g = getGame("game-countpop");
check('getGame("game-countpop") returns the game-countpop config', g?.id, "game-countpop");
check('getGame("game-countpop") skillId matches count-1-10', g?.skillId, "count-1-10");
check('GAME_SCENES[getGame("game-countpop").id] → CountPop', GAME_SCENES[g?.id], "CountPop");
check('getGame("does-not-exist") → undefined', getGame("does-not-exist"), undefined);

/* ── report ── */
const defaultReport = Object.entries(defaultScenes)
  .map(([b, s]) => `${b}:${s}`)
  .join("  ");

console.log("─".repeat(30));
console.log(`defaultSceneForBand(1..8): ${defaultReport}`);
console.log(`✓ ${checks} checks passed`);
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
