import { describe, it, expect } from "vitest";
import {
  ladderValue,
  poolTierFor,
  roundsForLevel,
  nextLevelIndex,
  timeForLevel,
} from "../src/game/difficulty";

// ---------------------------------------------------------------------------
// ladderValue
// ---------------------------------------------------------------------------

describe("ladderValue", () => {
  it("returns ladder[level] inside the ladder", () => {
    const ladder = [3, 5, 8];
    expect(ladderValue(ladder, 0)).toBe(3);
    expect(ladderValue(ladder, 1)).toBe(5);
    expect(ladderValue(ladder, 2)).toBe(8);
  });

  it("never returns undefined past the end — grows +1 per level past the ceiling", () => {
    const ladder = [3, 5, 8];
    expect(ladderValue(ladder, 3)).toBe(9); // 8 + (3 - 2)
    expect(ladderValue(ladder, 4)).toBe(10);
    expect(ladderValue(ladder, 100)).toBe(106);
  });

  it("past-the-ceiling entries are never byte-identical to earlier levels", () => {
    const ladder = [10, 20, 30, 40, 50, 60];
    const values = ladder.map((_, lv) => ladderValue(ladder, lv));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("empty ladder → documented neutral 0", () => {
    expect(ladderValue([], 0)).toBe(0);
    expect(ladderValue([], 99)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// poolTierFor
// ---------------------------------------------------------------------------

describe("poolTierFor", () => {
  it("returns 1 for tiny wants (first tier alone serves them)", () => {
    expect(poolTierFor(1, [5, 5, 5])).toBe(1);
    expect(poolTierFor(5, [5, 5, 5])).toBe(1);
  });

  it("opens tier 2 when want exceeds tier 1 pool but fits in cumulative", () => {
    expect(poolTierFor(6, [5, 5, 5])).toBe(2);
    expect(poolTierFor(10, [5, 5, 5])).toBe(2);
  });

  it("opens tier 3 when want exceeds the first two tiers", () => {
    expect(poolTierFor(11, [5, 5, 5])).toBe(3);
    expect(poolTierFor(15, [5, 5, 5])).toBe(3);
  });

  it("never returns a tier above the max present (clamps at 3)", () => {
    expect(poolTierFor(999, [5, 5, 5])).toBe(3);
    expect(poolTierFor(999, [0, 0, 0])).toBe(3);
  });

  it("is continuous — every want maps to the exact cumulative band", () => {
    const byTier: [number, number, number] = [4, 6, 10];
    const wantToTier: Array<[number, number]> = [
      [0, 1],
      [1, 1],
      [4, 1],
      [5, 2],
      [10, 2],
      [11, 3],
      [20, 3],
      [999, 3],
    ];
    for (const [want, tier] of wantToTier) {
      expect(poolTierFor(want, byTier)).toBe(tier);
    }
  });
});

// ---------------------------------------------------------------------------
// roundsForLevel
// ---------------------------------------------------------------------------

describe("roundsForLevel", () => {
  it("rounds grow monotonically with level (never shrink)", () => {
    let prev = roundsForLevel(3, 0);
    for (let level = 1; level <= 30; level++) {
      const cur = roundsForLevel(3, level);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it("is base at level 0 and grows by 1 every two levels", () => {
    expect(roundsForLevel(5, 0)).toBe(5);
    expect(roundsForLevel(5, 1)).toBe(5);
    expect(roundsForLevel(5, 2)).toBe(6);
    expect(roundsForLevel(5, 3)).toBe(6);
    expect(roundsForLevel(5, 4)).toBe(7);
    expect(roundsForLevel(5, 10)).toBe(10);
  });

  it("never goes below 1 even for a tiny base", () => {
    expect(roundsForLevel(0, 0)).toBe(1);
    expect(roundsForLevel(-5, 0)).toBe(1);
    expect(roundsForLevel(-5, 4)).toBe(1);
    expect(roundsForLevel(1, 0)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// nextLevelIndex
// ---------------------------------------------------------------------------

describe("nextLevelIndex", () => {
  it("two clean rounds step UP two", () => {
    expect(nextLevelIndex(3, 2, 0)).toBe(5);
    expect(nextLevelIndex(0, 2, 0)).toBe(2);
    expect(nextLevelIndex(5, 2, 1)).toBe(7);
  });

  it("one clean round steps up one", () => {
    expect(nextLevelIndex(3, 1, 0)).toBe(4);
    expect(nextLevelIndex(3, 1, 1)).toBe(4);
  });

  it("one missed stays (kid right at their edge)", () => {
    expect(nextLevelIndex(3, 0, 1)).toBe(3);
    expect(nextLevelIndex(3, 1, 1)).toBe(4); // clean still wins over single miss
  });

  it("two missed ease back one", () => {
    expect(nextLevelIndex(3, 0, 2)).toBe(2);
    expect(nextLevelIndex(1, 0, 2)).toBe(0);
  });

  it("never goes below 0", () => {
    expect(nextLevelIndex(0, 0, 2)).toBe(0);
    expect(nextLevelIndex(0, 0, 99)).toBe(0);
    expect(nextLevelIndex(0, 0, 2)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// timeForLevel
// ---------------------------------------------------------------------------

describe("timeForLevel", () => {
  it("returns ladder[level] inside the ladder", () => {
    const ladder = [10000, 9000, 8000, 7000, 6000, 5000];
    expect(timeForLevel(ladder, 0)).toBe(10000);
    expect(timeForLevel(ladder, 3)).toBe(7000);
    expect(timeForLevel(ladder, 5)).toBe(5000);
  });

  it("past the ceiling shrinks toward floorMs but never below it", () => {
    const ladder = [10000, 9000, 8000, 7000, 6000, 5000];
    expect(timeForLevel(ladder, 6)).toBe(4500); // 5000 - 500 -> clamped to floor
    expect(timeForLevel(ladder, 7)).toBe(4500); // 5000 - 1000 -> clamped
    expect(timeForLevel(ladder, 100)).toBe(4500);
  });

  it("honors an explicit floorMs", () => {
    const ladder = [10000, 9000, 8000];
    expect(timeForLevel(ladder, 3, 7000)).toBe(7500); // 8000 - 500 -> above floor
    expect(timeForLevel(ladder, 4, 7000)).toBe(7000); // 8000 - 1000 = floor
    expect(timeForLevel(ladder, 5, 7000)).toBe(7000); // 8000 - 1500 = 6500 -> clamped
  });

  it("undefined or empty ladder → null (untimed)", () => {
    expect(timeForLevel(undefined, 0)).toBeNull();
    expect(timeForLevel(undefined, 99)).toBeNull();
    expect(timeForLevel([], 0)).toBeNull();
    expect(timeForLevel([], 99)).toBeNull();
  });
});
