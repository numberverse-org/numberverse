#!/usr/bin/env node
/**
 * 🧠 MONI misconception ledger — regression tests for feed #11 (the #11
 * lifecycle): observeWrong episode-gating, recordMisconception entry shape,
 * and resolveMisconception removal.
 * Self-contained: runs against the BUILT core (packages/core/dist) with zero
 * deps, so CI can run it bare after `pnpm --filter @numberverse/core build`.
 *
 * Run:  node packages/core/tests/moni_misconception.mjs
 */
import { DEFAULT_MONI_PARAMS, moni } from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const T = 1_000_000; // fixed clock
// observeWrong only reads skill.wrongStreak, but keep the SkillState shape.
const skill = (wrongStreak = 0) => ({
  pMastered: 0.5, streak: 0, correct: 5, attempts: 10, wrongStreak,
});
const wrong = (skillId, ts) => ({
  kidId: "k", skillId, gameId: "g", difficulty: 1, timestamp: ts,
});

/* ── #11 — observeWrong episode-gating ──
 * The "episode" boundary is a continuous wrong streak on a skill: the source
 * gates the ledger upsert on `skill.wrongStreak === params.misconcOccurrences`
 * (strict equality, default 2). So the ledger updates exactly once per streak —
 * sub-threshold wrongs register nothing, the exact-threshold wrong creates /
 * increments the entry, wrongs past the threshold in the SAME streak re-fire
 * nothing, and only a NEW streak (wrongStreak reset) that climbs back to the
 * threshold updates the ledger again. */
{
  let p = moni.initial("k", T);
  const M = DEFAULT_MONI_PARAMS.misconcOccurrences; // 2

  // Sub-threshold wrongs register NO ledger entry.
  p = moni.observeWrong(p, wrong("s1", T), skill(1), DEFAULT_MONI_PARAMS, T);
  check("#11 below threshold → no entry", p.misconceptions.length, 0);

  // Exactly misconcOccurrences (2) consecutive wrongs in the same streak
  // register the entry ONCE (occurrences 1), not twice.
  p = moni.observeWrong(p, wrong("s1", T + 1), skill(2), DEFAULT_MONI_PARAMS, T + 1);
  const first = p.misconceptions.find((m) => m.skillId === "s1");
  check("#11 at threshold → entry registered", !!first, true);
  check("#11 at threshold → occurrences 1", first?.occurrences, 1);

  // Wrongs PAST the threshold within the SAME streak (same episode) do NOT
  // double-count — this is the strict-=== gate, not >=.
  p = moni.observeWrong(p, wrong("s1", T + 2), skill(3), DEFAULT_MONI_PARAMS, T + 2);
  p = moni.observeWrong(p, wrong("s1", T + 3), skill(4), DEFAULT_MONI_PARAMS, T + 3);
  check("#11 same streak past threshold → occurrences stays 1",
    p.misconceptions.find((m) => m.skillId === "s1")?.occurrences, 1);
  check("#11 same streak past threshold → still 1 entry", p.misconceptions.length, 1);

  // A wrong on a DIFFERENT skill adds a NEW entry.
  p = moni.observeWrong(p, wrong("s2", T + 4), skill(2), DEFAULT_MONI_PARAMS, T + 4);
  check("#11 different skill → new entry added", p.misconceptions.length, 2);
  check("#11 different skill → own occurrences 1",
    p.misconceptions.find((m) => m.skillId === "s2")?.occurrences, 1);

  // A NEW episode (wrongStreak reset to 0 then climbing back to the
  // threshold) re-fires the gate → increments the SAME skill's entry.
  p = moni.observeWrong(p, wrong("s1", T + 5), skill(1), DEFAULT_MONI_PARAMS, T + 5); // reset → new episode
  p = moni.observeWrong(p, wrong("s1", T + 6), skill(2), DEFAULT_MONI_PARAMS, T + 6); // threshold again
  check("#11 new episode → same-skill entry increments",
    p.misconceptions.find((m) => m.skillId === "s1")?.occurrences, 2);
  check("#11 new episode → total entries unchanged", p.misconceptions.length, 2);
}

/* ── #11 — recordMisconception documented shape ── */
{
  let p = moni.initial("k", T);
  p = moni.recordMisconception(p, "s1", "reversal-6-9", "Confuses 6 and 9", T + 10);
  const m = p.misconceptions.find((x) => x.skillId === "s1" && x.code === "reversal-6-9");
  check("#11 record → entry added", !!m, true);
  check("#11 record → skillId", m?.skillId, "s1");
  check("#11 record → code", m?.code, "reversal-6-9");
  check("#11 record → label", m?.label, "Confuses 6 and 9");
  check("#11 record → occurrences", m?.occurrences, 1);
  check("#11 record → firstSeen", m?.firstSeen, T + 10);
  check("#11 record → lastSeen", m?.lastSeen, T + 10);

  // Re-recording the same skill+pattern increments occurrences, updates
  // lastSeen, and preserves firstSeen.
  p = moni.recordMisconception(p, "s1", "reversal-6-9", "Confuses 6 and 9", T + 20);
  const m2 = p.misconceptions.find((x) => x.skillId === "s1" && x.code === "reversal-6-9");
  check("#11 record → re-record increments occurrences", m2?.occurrences, 2);
  check("#11 record → re-record updates lastSeen", m2?.lastSeen, T + 20);
  check("#11 record → re-record keeps firstSeen", m2?.firstSeen, T + 10);
}

/* ── #11 — resolveMisconception removes exactly the right entries ── */
{
  let p = moni.initial("k", T);
  p = moni.recordMisconception(p, "s1", "overcount-1", "Counts one too many", T);
  p = moni.recordMisconception(p, "s2", "reversal-6-9", "Confuses 6 and 9", T + 1);
  p = moni.recordMisconception(p, "s2", "off-by-ten", "Off by ten", T + 2);

  p = moni.resolveMisconception(p, "s1", "overcount-1");
  check("#11 resolve → resolved entry gone",
    p.misconceptions.find((m) => m.skillId === "s1" && m.code === "overcount-1"), undefined);
  check("#11 resolve → untouched s2/reversal remains",
    p.misconceptions.find((m) => m.skillId === "s2" && m.code === "reversal-6-9") !== undefined, true);
  check("#11 resolve → untouched s2/off-by-ten remains",
    p.misconceptions.find((m) => m.skillId === "s2" && m.code === "off-by-ten") !== undefined, true);
  check("#11 resolve → ledger length after remove", p.misconceptions.length, 2);
}

/* ── #11 — resolve also clears the same-skill generic "repeated-error" ── */
{
  // Resolving a skill+code ALSO clears that skill's generic "repeated-error"
  // (the pattern is fixed, so the generic name goes) — but NOT other skills'.
  let p = moni.initial("k", T);
  p = moni.observeWrong(p, wrong("s1", T), skill(2), DEFAULT_MONI_PARAMS, T);         // s1/repeated-error
  p = moni.observeWrong(p, wrong("s2", T + 1), skill(2), DEFAULT_MONI_PARAMS, T + 1); // s2/repeated-error
  p = moni.recordMisconception(p, "s1", "off-by-ten", "Off by ten", T + 2);           // s1/off-by-ten
  p = moni.resolveMisconception(p, "s1", "off-by-ten");
  check("#11 resolve → same-skill generic repeated-error cleared",
    p.misconceptions.find((m) => m.skillId === "s1"), undefined);
  check("#11 resolve → other-skill generic repeated-error stays",
    p.misconceptions.find((m) => m.skillId === "s2" && m.code === "repeated-error") !== undefined, true);
  check("#11 resolve → remaining entries are the other skill", p.misconceptions.length, 1);
}

console.log("─".repeat(30));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all moni misconception tests passed");
