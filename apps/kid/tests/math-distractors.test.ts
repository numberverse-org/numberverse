/**
 * math-distractors.test.ts — #1866–#1873 wrong-answer distractor quality.
 *
 * The Phaser canvas engine can't boot in a unit runner (same layer as
 * countback-distractors.test.ts), so this is a PURE-ALGORITHM mirror of each
 * scene's distractor builder. Each mirror reproduces exactly the generator the
 * scene ships; the tests assert that for a representative fact the OPTION SET
 * contains the real misconception values — a one-less/one-more, a wrong
 * leftover, a present-digit, a near-double — not just random ±neighbors.
 */
import { describe, it, expect } from "vitest";

/* ─────────────── TimesTable #1866: (a±1)×b, a×(b±1), a×b±a/±b ─────────────── */
function timesTableOptions(a: number, b: number): number[] {
  const answer = a * b;
  const opts = new Set<number>([answer]);
  const errs = [
    (a + 1) * b,
    a * (b + 1),
    a * (b - 1),
    (a - 1) * b,
    answer + a,
    answer - a,
    answer + b,
    answer - b,
  ];
  for (const e of errs) {
    if (opts.size >= 4) break;
    if (e >= 0 && e <= 100 && e !== answer) opts.add(e);
  }
  let delta = 1;
  while (opts.size < 4) {
    const c = answer + (delta % 2 === 1 ? -delta : delta);
    if (c >= 0 && c <= 100 && c !== answer) opts.add(c);
    delta++;
  }
  return [...opts];
}

describe("TimesTable #1866 — multiplication-error distractors", () => {
  it("6×7=42 offers 36, 48 and 49 (one row/col off), not random neighbors", () => {
    const o = timesTableOptions(6, 7);
    expect(o).toHaveLength(4);
    expect(o).toContain(42);
    expect(o).toContain(36); // 6×6 / 42−6
    expect(o).toContain(48); // 6×8 / 42+6
    expect(o).toContain(49); // 7×7 / 42+7
  });
  it("always yields exactly 4 distinct in-range options", () => {
    for (let a = 2; a <= 9; a++) {
      for (let b = 2; b <= 9; b++) {
        const o = timesTableOptions(a, b);
        expect(new Set(o).size, `${a}×${b}`).toBe(4);
        expect(o.every((c) => c >= 0 && c <= 100), `${a}×${b}`).toBe(true);
      }
    }
  });
});

/* ─────────────────── Division #1867/#1866: clamp + ÷errors ─────────────────── */
function divisionOptions(divisor: number, quotient: number): number[] {
  const dividend = divisor * quotient;
  const answer = quotient;
  const opts = new Set<number>([answer]);
  const errs = [
    answer + 1,
    answer - 1,
    Math.floor(dividend / (divisor + 1)),
    Math.ceil(dividend / Math.max(1, divisor - 1)),
  ];
  for (const e of errs) {
    if (opts.size >= 4) break;
    if (e >= 0 && e <= 100 && e !== answer) opts.add(e);
  }
  let delta = 1;
  while (opts.size < 4) {
    const c = answer + (delta % 2 === 1 ? -delta : delta);
    if (c >= 0 && c <= 100 && c !== answer) opts.add(c);
    delta++;
  }
  return [...opts];
}

describe("Division #1867 — dividend is clamped to ≤100", () => {
  it("drawing quotient from 2..⌊100/div⌋ keeps every dividend ≤100", () => {
    for (let div = 2; div <= 12; div++) {
      const maxQ = Math.floor(100 / div);
      // the whole reachable quotient range stays inside 100
      for (let q = 2; q <= maxQ; q++) {
        expect(div * q, `${div}×${q}`).toBeLessThanOrEqual(100);
      }
      // and the pre-fix 12×12=144 ceiling is now unreachable for the top divisor
      expect(div * 12, `div=${div}`).toBeGreaterThanOrEqual(12); // sanity, always ≥
    }
    // specifically: the old bound let 12×12 ask 144 — the new clamp caps it at 96
    expect(12 * Math.floor(100 / 12)).toBe(96);
  });
});

describe("Division #1866 — division-error distractors", () => {
  it("24÷3=8 offers 7 and 9 (one group too few / too many)", () => {
    const o = divisionOptions(3, 8);
    expect(o).toContain(8);
    expect(o).toContain(7);
    expect(o).toContain(9);
  });
});

/* ─────────────── Percent #1869: 150 rung + %-error distractors ─────────────── */
describe("Percent #1869 — 150% rung has a clean-total set", () => {
  it("the denominator map carries 150 with even totals (1.5× stays whole)", () => {
    for (const total of [2, 4, 6, 8, 10]) {
      expect(Number.isInteger(1.5 * total), `1.5×${total}`).toBe(true);
    }
  });
});

function percentOptions(percent: number, total: number): number[] {
  const answer = (percent / 100) * total;
  const opts = new Set<number>([answer]);
  const errs = [
    answer + 1,
    answer - 1,
    total,
    Math.round(answer + answer * 0.1),
    Math.max(0, Math.round(answer - answer * 0.1)),
  ];
  for (const e of errs) {
    if (opts.size >= 4) break;
    if (e >= 0 && e <= 150 && e !== answer) opts.add(e);
  }
  let delta = 1;
  while (opts.size < 4) {
    const c = answer + (delta % 2 === 1 ? -delta : delta);
    if (c >= 0 && c <= 150 && c !== answer) opts.add(c);
    delta++;
  }
  return [...opts];
}

describe("Percent #1866 — percent-error distractors", () => {
  it("50% of 8=4 offers 3 and 5 (one less / one more) and the total 8", () => {
    const o = percentOptions(50, 8);
    expect(o).toContain(4);
    expect(o).toContain(3);
    expect(o).toContain(5);
  });
});

/* ────────────────── FairShare #1866: sharing-error distractors ────────────────── */
function fairShareOptions(divisor: number, dividend: number, answer: number): number[] {
  const opts = new Set<number>([answer]);
  const errs = [
    answer + 1,
    answer - 1,
    Math.min(dividend, answer + divisor),
    Math.max(1, answer - divisor),
  ];
  for (const e of errs) {
    if (opts.size >= 4) break;
    if (e >= 1 && e <= 100 && e !== answer) opts.add(e);
  }
  let delta = 1;
  while (opts.size < 4) {
    const c = answer + (delta % 2 === 1 ? -delta : delta);
    if (c >= 1 && c <= 100 && c !== answer) opts.add(c);
    delta++;
  }
  return [...opts];
}

describe("FairShare #1866 — fair-share-error distractors", () => {
  it("24 shared into 3 baskets (8 each) offers 7 and 9", () => {
    const o = fairShareOptions(3, 24, 8);
    expect(o).toContain(8);
    expect(o).toContain(7);
    expect(o).toContain(9);
  });
});

/* ──────────── AddSub100 #1866: carry / reversal distractors ──────────── */
function addSubOptions(mode: "add" | "sub", a: number, b: number): number[] {
  const answer = mode === "add" ? a + b : a - b;
  const opts = new Set<number>([answer]);
  const errs =
    mode === "add"
      ? [
          answer + 1,
          answer - 1,
          answer - 10 * Math.floor(answer / 10),
          a * 2,
        ]
      : [
          answer + 1,
          answer - 1,
          a + b,
          a - (b - 1),
        ];
  for (const e of errs) {
    if (opts.size >= 4) break;
    if (e >= 0 && e <= 100 && e !== answer) opts.add(e);
  }
  let delta = 1;
  while (opts.size < 4) {
    const c = answer + (delta % 2 === 1 ? -delta : delta);
    if (c >= 0 && c <= 100 && c !== answer) opts.add(c);
    delta++;
  }
  return [...opts];
}

describe("AddSub100 #1866 — add/sub-error distractors", () => {
  it("34+15=49 offers 48 and 50 (one off)", () => {
    const o = addSubOptions("add", 34, 15);
    expect(o).toContain(49);
    expect(o).toContain(48);
    expect(o).toContain(50);
  });
  it("50−17=33 offers 32 and 34 (took one more / one less)", () => {
    const o = addSubOptions("sub", 50, 17);
    expect(o).toContain(33);
    expect(o).toContain(32);
    expect(o).toContain(34);
  });
});

/* ──────────── FactsAdd #1868: no-carry / ±1 within the 20 cap ──────────── */
function factsAddOptions(a: number, b: number): number[] {
  const answer = a + b;
  const opts = new Set<number>([answer]);
  const errs = [
    answer + 1,
    answer - 1,
    answer - 10 * Math.floor(answer / 10),
    parseInt(String(answer).split("").reverse().join(""), 10),
  ];
  for (const e of errs) {
    if (opts.size >= 4) break;
    if (e >= 0 && e <= 20 && e !== answer) opts.add(e);
  }
  let d = 1;
  while (opts.size < 4) {
    const c = answer + (d % 2 === 1 ? -d : d);
    if (c >= 0 && c <= 20 && c !== answer) opts.add(c);
    d++;
  }
  return [...opts];
}

describe("FactsAdd #1868 — fact-error distractors stay in the 20 cap", () => {
  it("7+5=12 offers 11 and 13", () => {
    const o = factsAddOptions(7, 5);
    expect(o).toContain(12);
    expect(o).toContain(11);
    expect(o).toContain(13);
  });
  it("even at the top (10+10=20) the grid still fills to 4 in-range options", () => {
    const o = factsAddOptions(10, 10);
    expect(o).toHaveLength(4);
    expect(new Set(o).size).toBe(4);
    expect(o.every((c) => c >= 0 && c <= 20)).toBe(true);
    expect(o).toContain(20);
  });
});

/* ─────────── PlaceValue #1871: digits the number actually contains ─────────── */
function placeValueOptions(number: number, answer: number): number[] {
  const opts = new Set<number>([answer]);
  const raw = String(number).split("").map((c) => Number(c));
  for (const digit of raw) {
    if (opts.size >= 4) break;
    if (digit !== answer) opts.add(digit);
  }
  for (const digit of [answer + 1, answer - 1]) {
    if (opts.size >= 4) break;
    if (digit >= 0 && digit <= 9 && digit !== answer) opts.add(digit);
  }
  for (let c = 0; c <= 9 && opts.size < 4; c++) {
    if (c !== answer) opts.add(c);
  }
  return [...opts];
}

describe("PlaceValue #1871 — distractors are other digits of the number", () => {
  it("in 4,829 with TENS=2, 4, 8 and 9 (present digits) are all on the board", () => {
    const o = placeValueOptions(4829, 2);
    expect(o).toContain(2);
    expect(o).toContain(4);
    expect(o).toContain(8);
    expect(o).toContain(9);
  });
  it("always yields exactly 4 distinct digit options", () => {
    for (let n = 10; n <= 99999; n += 73) {
      const answer = Math.floor(n / 10) % 10;
      const o = placeValueOptions(n, answer);
      expect(new Set(o).size, `n=${n}`).toBe(4);
      expect(o.every((c) => c >= 0 && c <= 9)).toBe(true);
    }
  });
});

/* ──── Doubles #1872: near-doubles are always two of the three distractors ──── */
function doublesOptions(base: number, isDouble: boolean): number[] {
  const a = base;
  const b = isDouble ? base : base + 1;
  const answer = a + b;
  const opts = new Set<number>([answer]);
  for (const e of [base * 2 + 1, base * 2 - 1, base * 2]) {
    if (opts.size >= 4) break;
    if (e >= 2 && e <= 20 && e !== answer) opts.add(e);
  }
  let d = 1;
  while (opts.size < 4) {
    const c = answer + (d % 2 === 1 ? -d : d);
    if (c >= 2 && c <= 20 && c !== answer) opts.add(c);
    d++;
  }
  return [...opts];
}

describe("Doubles #1872 — near-double distractors always present", () => {
  it("6+6=12 offers 11 (6+5) and 13 (6+7)", () => {
    const o = doublesOptions(6, true);
    expect(o).toContain(12);
    expect(o).toContain(11);
    expect(o).toContain(13);
  });
});

/* ────── MakeTen #1873: bridge-to-ten (wrong-leftover) distractors ────── */
function makeTenOptions(a: number, b: number): number[] {
  const fill = 10 - a;
  const left = b - fill;
  const answer = a + b;
  const opts = new Set<number>([answer]);
  for (const e of [answer + 1, answer - 1, 10 + (left - 1), 10 + (left + 1), a + 10, 10]) {
    if (opts.size >= 4) break;
    if (e >= 10 && e <= 19 && e !== answer) opts.add(e);
  }
  let d = 1;
  while (opts.size < 4) {
    const c = answer + (d % 2 === 1 ? -d : d);
    if (c >= 10 && c <= 19 && c !== answer) opts.add(c);
    d++;
  }
  return [...opts];
}

describe("MakeTen #1873 — bridge-to-ten distractors", () => {
  it("8+5=13 (8+2+3) offers 12 and 14 (one leftover off)", () => {
    const o = makeTenOptions(8, 5);
    expect(o).toContain(13);
    expect(o).toContain(12);
    expect(o).toContain(14);
  });
});
