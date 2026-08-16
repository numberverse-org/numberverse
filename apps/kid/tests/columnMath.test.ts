import { describe, it, expect } from "vitest";
import {
  generateColumnProblem,
  solveColumn,
  digitsNum,
  columnAnswer,
  LEVEL_CFG,
  type ColumnProblem,
} from "../src/game/columnMath";

// ---------------------------------------------------------------------------
// Manual columnar arithmetic helpers (independent reference implementations)
// ---------------------------------------------------------------------------

/** Manual columnar addition — digit-by-digit result (no shortcut). */
function referenceAdd(aD: number[], bD: number[]): number {
  let carry = 0;
  let place = 1;
  let result = 0;
  for (let i = 0; i < 3; i++) {
    const s = aD[i] + bD[i] + carry;
    result += (s % 10) * place;
    carry = Math.floor(s / 10);
    place *= 10;
  }
  result += carry * place; // final carry-out
  return result;
}

/** Manual columnar subtraction with borrow — result must be non-negative. */
function referenceSub(aD: number[], bD: number[]): number {
  let borrow = 0;
  let place = 1;
  let result = 0;
  for (let i = 0; i < 3; i++) {
    let top = aD[i] - borrow;
    if (top < bD[i]) {
      top += 10;
      borrow = 1;
    } else {
      borrow = 0;
    }
    result += (top - bD[i]) * place;
    place *= 10;
  }
  // borrow out must be 0 — generated sub problems never go negative
  return result;
}

// ---------------------------------------------------------------------------
// digitsNum
// ---------------------------------------------------------------------------

describe("digitsNum", () => {
  it("maps [ones, tens, hundreds] to the correct number", () => {
    expect(digitsNum([0, 0, 0])).toBe(0); // 0 -> 1 digit
    expect(digitsNum([7, 0, 0])).toBe(7); // 7 -> 1 digit
    expect(digitsNum([0, 1, 0])).toBe(10); // 10 -> 2 digits
    expect(digitsNum([9, 9, 9])).toBe(999); // 999 -> 3 digits
    expect(digitsNum([5, 3, 1])).toBe(135);
    expect(digitsNum([0, 4, 0])).toBe(40);
  });

  it("is a pure arithmetic mapping (no crash on negative entries)", () => {
    expect(digitsNum([-3, 0, 0])).toBe(-3);
    expect(digitsNum([0, -1, 0])).toBe(-10);
    expect(digitsNum([-5, 1, 0])).toBe(5);
  });

  it("handles all-zero higher columns (2-digit problems store 0 hundreds)", () => {
    expect(digitsNum([8, 4, 0])).toBe(48);
  });
});

// ---------------------------------------------------------------------------
// columnAnswer
// ---------------------------------------------------------------------------

describe("columnAnswer", () => {
  it("adds for add mode, including carried ones", () => {
    expect(columnAnswer([5, 3, 1], [2, 1, 0], "add")).toBe(135 + 12);
    expect(columnAnswer([9, 9, 9], [0, 0, 1], "add")).toBe(999 + 100); // [0,0,1] = 100
    // 48 + 57 = 105 (ones 8+7=15 carry 1; tens 4+5+1=10 carry 1 -> 105)
    expect(columnAnswer([8, 4, 0], [7, 5, 0], "add")).toBe(105);
  });

  it("subtracts for sub mode, producing the difference", () => {
    expect(columnAnswer([0, 2, 1], [5, 1, 0], "sub")).toBe(120 - 15);
    expect(columnAnswer([0, 0, 1], [5, 0, 0], "sub")).toBe(95); // 100 - 5 with borrow
  });

  it("matches the independent columnar reference for fixed cases", () => {
    expect(columnAnswer([9, 9, 9], [9, 9, 9], "add")).toBe(referenceAdd([9, 9, 9], [9, 9, 9]));
    expect(columnAnswer([8, 4, 0], [7, 5, 0], "add")).toBe(referenceAdd([8, 4, 0], [7, 5, 0]));
    expect(columnAnswer([0, 0, 1], [5, 0, 0], "sub")).toBe(referenceSub([0, 0, 1], [5, 0, 0]));
  });
});

// ---------------------------------------------------------------------------
// generateColumnProblem
// ---------------------------------------------------------------------------

describe("generateColumnProblem", () => {
  it("always produces the level's configured digit count", () => {
    for (let level = 0; level < LEVEL_CFG.length + 2; level++) {
      const cfg = LEVEL_CFG[Math.min(level, LEVEL_CFG.length - 1)];
      for (let trial = 0; trial < 200; trial++) {
        const p = generateColumnProblem(level);
        expect(p.digits).toBe(cfg.digits);
      }
    }
  });

  it("returns aD/bD as 3-slot [ones, tens, hundreds] arrays", () => {
    for (let level = 0; level <= 5; level++) {
      for (let trial = 0; trial < 50; trial++) {
        const p = generateColumnProblem(level);
        expect(p.aD).toHaveLength(3);
        expect(p.bD).toHaveLength(3);
        for (const v of [...p.aD, ...p.bD]) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(9);
        }
      }
    }
  });

  it("add answers match the independent columnar reference (carries carried correctly)", () => {
    for (let level = 0; level <= 5; level++) {
      for (let trial = 0; trial < 200; trial++) {
        const p = generateColumnProblem(level);
        if (p.mode !== "add") continue;
        const expected = referenceAdd(p.aD, p.bD);
        expect(columnAnswer(p.aD, p.bD, "add")).toBe(expected);
      }
    }
  });

  it("sub answers match the independent columnar reference and never go negative", () => {
    for (let level = 0; level <= 5; level++) {
      for (let trial = 0; trial < 200; trial++) {
        const p = generateColumnProblem(level);
        if (p.mode !== "sub") continue;
        const expected = referenceSub(p.aD, p.bD);
        expect(expected).toBeGreaterThanOrEqual(0);
        expect(columnAnswer(p.aD, p.bD, "sub")).toBe(expected);
      }
    }
  });

  it("L0 (2-digit, no double): add stays 2 digits; sub stays 2 digits", () => {
    for (let trial = 0; trial < 500; trial++) {
      const p = generateColumnProblem(0);
      if (p.mode === "add") {
        expect(columnAnswer(p.aD, p.bD, "add")).toBeLessThan(100);
        expect(columnAnswer(p.aD, p.bD, "add")).toBeGreaterThanOrEqual(10);
      } else {
        const ans = columnAnswer(p.aD, p.bD, "sub");
        expect(ans).toBeGreaterThanOrEqual(11); // tens digit >= 1 after ones-borrow
        expect(ans).toBeLessThan(100);
      }
    }
  });

  it("L1 (2-digit, double): add rolls into a NEW hundreds column", () => {
    for (let trial = 0; trial < 500; trial++) {
      const p = generateColumnProblem(1);
      if (p.mode !== "add") continue;
      const ans = columnAnswer(p.aD, p.bD, "add");
      expect(ans).toBeGreaterThanOrEqual(100);
      expect(ans).toBeLessThan(200);
    }
  });

  it("L2 (3-digit, no double): add never overflows the hundreds", () => {
    for (let trial = 0; trial < 500; trial++) {
      const p = generateColumnProblem(2);
      if (p.mode !== "add") continue;
      expect(columnAnswer(p.aD, p.bD, "add")).toBeLessThan(1000);
    }
  });

  it("L3/L4/L5 (3-digit, double): add never overflows to a 4th digit", () => {
    for (let level of [3, 4, 5]) {
      for (let trial = 0; trial < 500; trial++) {
        const p = generateColumnProblem(level);
        if (p.mode !== "add") continue;
        expect(columnAnswer(p.aD, p.bD, "add")).toBeLessThan(1000);
      }
    }
  });

  it("3-digit sub (double) survives the hundreds cascade (never negative, no leading-zero tens)", () => {
    for (let level of [3, 4, 5]) {
      for (let trial = 0; trial < 500; trial++) {
        const p = generateColumnProblem(level);
        if (p.mode !== "sub") continue;
        const ans = columnAnswer(p.aD, p.bD, "sub");
        expect(ans).toBeGreaterThanOrEqual(0);
        // hundreds survive the cascade -> result is at least 100
        expect(ans).toBeGreaterThanOrEqual(100);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// solveColumn
// ---------------------------------------------------------------------------

describe("solveColumn", () => {
  it("add: ones always carry and tens carry depends on the double flag", () => {
    // L0 add problem: ones carry, tens does NOT carry (double=false)
    for (let trial = 0; trial < 200; trial++) {
      const p = generateColumnProblem(0);
      if (p.mode !== "add") continue;
      const ones = solveColumn(0, "add", p.aD, p.bD, 0, 0, p.digits);
      const tens = solveColumn(1, "add", p.aD, p.bD, 1, 0, p.digits);
      expect(ones.borrows).toBe(false);
      expect(ones.lends).toBe(false);
      expect(ones.digit).toBe((p.aD[0] + p.bD[0]) % 10);
      // ones sum always carries -> (aD[0]+bD[0]) >= 10
      expect(p.aD[0] + p.bD[0]).toBeGreaterThanOrEqual(10);
      // tens does NOT carry out for L0
      expect(p.aD[1] + p.bD[1] + 1).toBeLessThanOrEqual(9);
      expect(tens.digit).toBe((p.aD[1] + p.bD[1] + 1) % 10);
      expect(tens.borrows).toBe(false);
      expect(tens.lends).toBe(false);
    }
  });

  it("add: L1 double tens carry rolls into a new hundreds column", () => {
    for (let trial = 0; trial < 200; trial++) {
      const p = generateColumnProblem(1);
      if (p.mode !== "add") continue;
      const tens = solveColumn(1, "add", p.aD, p.bD, 1, 0, p.digits);
      // tens+carry must overflow into hundreds
      expect(p.aD[1] + p.bD[1] + 1).toBeGreaterThanOrEqual(10);
      expect(tens.digit).toBe((p.aD[1] + p.bD[1] + 1) % 10);
    }
  });

  it("sub: ones ALWAYS borrow for every generated problem", () => {
    for (let level = 0; level <= 5; level++) {
      for (let trial = 0; trial < 200; trial++) {
        const p = generateColumnProblem(level);
        if (p.mode !== "sub") continue;
        const ones = solveColumn(0, "sub", p.aD, p.bD, 0, 0, p.digits);
        expect(ones.borrows).toBe(true);
        expect(ones.lends).toBe(true); // a column to the left exists
        expect(ones.digit).toBe(10 + p.aD[0] - p.bD[0]);
      }
    }
  });

  it("sub: L0/L1 2-digit tens do NOT borrow after the ones borrow", () => {
    for (let level of [0, 1]) {
      for (let trial = 0; trial < 200; trial++) {
        const p = generateColumnProblem(level);
        if (p.mode !== "sub") continue;
        const tens = solveColumn(1, "sub", p.aD, p.bD, 0, 1, p.digits);
        expect(tens.borrows).toBe(false);
        expect(tens.digit).toBe(p.aD[1] - 1 - p.bD[1]);
      }
    }
  });

  it("sub: 3-digit double tens cascade borrow, hundreds pays", () => {
    for (let level of [3, 4, 5]) {
      for (let trial = 0; trial < 200; trial++) {
        const p = generateColumnProblem(level);
        if (p.mode !== "sub") continue;
        const tens = solveColumn(1, "sub", p.aD, p.bD, 0, 1, p.digits);
        const hundreds = solveColumn(2, "sub", p.aD, p.bD, 0, 1, p.digits);
        // bt >= at so after ones-borrow the tens must borrow too
        expect(p.bD[1]).toBeGreaterThanOrEqual(p.aD[1]);
        expect(tens.borrows).toBe(true);
        expect(tens.lends).toBe(true); // hundreds column exists
        expect(tens.digit).toBe(10 + p.aD[1] - 1 - p.bD[1]);
        // hundreds survives the cascade (ah - 1 >= bh)
        expect(hundreds.borrows).toBe(false);
        expect(hundreds.digit).toBe(p.aD[2] - 1 - p.bD[2]);
      }
    }
  });

  it("sub: lends is false when there is no column to the left (show boundary)", () => {
    const ones = solveColumn(0, "sub", [0, 2, 1], [5, 1, 0], 0, 0, 1);
    expect(ones.borrows).toBe(true);
    expect(ones.lends).toBe(false); // i+1 < show is 1 < 1 -> false
    expect(ones.digit).toBe(10 + 0 - 5);
  });

  it("builds a full solve that reconstructs the correct answer", () => {
    // For an L3 sub problem, solve each column with running borrow and
    // check the digit-by-digit result equals columnAnswer.
    for (let trial = 0; trial < 200; trial++) {
      const p = generateColumnProblem(3);
      if (p.mode !== "sub") continue;
      let borrow = 0;
      let place = 1;
      let built = 0;
      for (let i = 0; i < 3; i++) {
        const s = solveColumn(i, "sub", p.aD, p.bD, 0, borrow, 3);
        built += s.digit * place;
        place *= 10;
        borrow = s.borrows ? 1 : 0;
      }
      expect(built).toBe(columnAnswer(p.aD, p.bD, "sub"));
    }
  });
});
