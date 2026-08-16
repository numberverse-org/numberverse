import { describe, it, expect } from "vitest";
import { moni, initialSkillState } from "@numberverse/core";
import { observeRoundLearning } from "../src/lib/roundLearning";
import type { RoundResult } from "../src/store";

const KID = "kid-A";
const SKILL = "add-3-to-1";
const GAME = "orbit-1";
const T0 = 1_700_000_000_000;

function result(correct: boolean, difficulty = 1, responseMs = 2400): RoundResult {
  return { gameId: GAME, skillId: SKILL, correct, difficulty, responseMs };
}

/** Mastery state at a chosen pMastered, pinned to T0 so decay is a no-op. */
function seed(p: number) {
  const s = initialSkillState(KID, SKILL, T0);
  return { ...s, pMastered: p, lastDecay: T0 };
}

describe("observeRoundLearning — mastery-ledger direction", () => {
  it("a correct round raises the estimate; a wrong round from the same state lowers it", () => {
    const prev = seed(0.85);
    const prof = moni.empty(KID);
    const up = observeRoundLearning(KID, result(true), prev, prof, 0, T0);
    const down = observeRoundLearning(KID, result(false), prev, prof, 0, T0);
    expect(up.updated.pMastered).toBeGreaterThan(0.85);
    expect(down.updated.pMastered).toBeLessThan(0.85);
  });

  it("consecutive correct rounds converge — mastery climbs each step", () => {
    let prev = initialSkillState(KID, SKILL, T0);
    const prof = moni.empty(KID);
    const seen: number[] = [prev.pMastered];
    for (let i = 0; i < 3; i++) {
      const out = observeRoundLearning(KID, result(true), prev, prof, 0, T0);
      prev = out.updated;
      seen.push(prev.pMastered);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    }
    expect(seen[seen.length - 1]).toBeGreaterThan(0.8);
  });

  it("a long wrong streak from high mastery drags the estimate down each round", () => {
    let prev = seed(0.85);
    const prof = moni.empty(KID);
    const seen: number[] = [prev.pMastered];
    for (let streak = 1; streak <= 3; streak++) {
      const out = observeRoundLearning(KID, result(false), prev, prof, streak, T0);
      prev = out.updated;
      seen.push(prev.pMastered);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeLessThan(seen[i - 1]);
    }
    expect(seen[seen.length - 1]).toBeLessThan(0.15);
  });
});

describe("observeRoundLearning — output shape", () => {
  it("returns the RoundLearning shape with finite numbers and no undefined fields", () => {
    const prev = seed(0.5);
    const prof = moni.empty(KID);
    const out = observeRoundLearning(KID, result(true), prev, prof, 0, T0);
    // updated (SkillState)
    expect(out.updated.kidId).toBe(KID);
    expect(out.updated.skillId).toBe(SKILL);
    for (const k of ["pMastered", "correct", "attempts", "streak"] as const) {
      expect(typeof out.updated[k]).toBe("number");
      expect(Number.isFinite(out.updated[k])).toBe(true);
    }
    expect(Number.isFinite(out.updated.pMastered)).toBe(true);
    expect(out.updated.pMastered).toBeGreaterThanOrEqual(0);
    expect(out.updated.pMastered).toBeLessThanOrEqual(1);
    expect(out.updated.lastPractice).not.toBe(null);
    expect(Number.isFinite(out.updated.lastPractice as number)).toBe(true);
    expect(Number.isFinite(out.updated.lastDecay)).toBe(true);
    // diag
    expect(["slip", "gap", "misconception", "fatigue", "guessing"]).toContain(out.diag.kind);
    expect(Number.isFinite(out.diag.confidence)).toBe(true);
    expect(typeof out.diag.action.type).toBe("string");
    expect(typeof out.diag.action.message).toBe("string");
    expect(out.diag.reason.length).toBeGreaterThan(0);
    // moniNext
    expect(out.moniNext.totalRounds).toBe(1);
    expect(out.moniNext.totalCorrect).toBe(1);
    expect(Number.isFinite(out.moniNext.accuracy)).toBe(true);
    // mis: none for a clean profile
    expect(out.mis).toBeUndefined();
  });

  it("surfaces the seeded misconception code for a wrong round", () => {
    const prev = seed(0.6);
    const prof = moni.empty(KID);
    prof.misconceptions = [
      {
        skillId: SKILL,
        code: "off-by-ten",
        label: "Off by ten",
        firstSeen: T0,
        lastSeen: T0,
        occurrences: 2,
      },
    ];
    const out = observeRoundLearning(KID, result(false), prev, prof, 2, T0);
    expect(out.mis).toBeDefined();
    expect(out.mis?.code).toBe("off-by-ten");
    expect(out.mis?.skillId).toBe(SKILL);
  });
});
