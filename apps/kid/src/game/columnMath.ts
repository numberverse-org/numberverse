/**
 * Column-math core — the pure carry/borrow arithmetic shared by the regrouping
 * scenes (#1200). Extracted from RegroupScene so the trickiest part of the
 * written method (ENGINEERED problems that only need the shown columns, and the
 * per-column correct digit) lives in one tested place instead of being buried
 * in scene UI code. Pure functions — no Phaser, no scene state.
 *
 * Note on the regrouping family: RegroupScene (column board, 2–3 digit written
 * method), AddRegroupScene (base-10 blocks, step-by-step add) and SubBorrowScene
 * (base-10 blocks, step-by-step sub) are DELIBERATELY different presentations
 * for different ladders — the shared surface is the MATH, not the board. This
 * module holds the math; each scene keeps its own rendering.
 */

/** Random integer in [min, max] inclusive — same distribution as Phaser.Math.Between. */
function ri(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Per-level generation config: digits = columns shown, double = tens also carries/borrows. */
export const LEVEL_CFG = [
  { digits: 2, double: false }, // L0: 2-digit, ones carry/borrow only
  { digits: 2, double: true  }, // L1: 2-digit, full
  { digits: 3, double: false }, // L2: 3-digit, ones carry/borrow
  { digits: 3, double: true  }, // L3: 3-digit, ones + tens
  { digits: 3, double: true  }, // L4: 3-digit, full, larger
  { digits: 3, double: true  }, // L5: 3-digit, full
];

export interface ColumnProblem {
  digits: number;
  mode: "add" | "sub";
  /** [ones, tens, hundreds] digits of the minuend / first addend. */
  aD: number[];
  /** [ones, tens, hundreds] digits of the subtrahend / second addend. */
  bD: number[];
}

/** Generate an add/sub problem within the level's digit count. Problems are
 *  ENGINEERED so the written method ONLY needs the columns we show:
 *   • add — ones ALWAYS carry; tens carries on `double` levels (a 2-digit
 *           double add rolls into a NEW hundreds column, drawn on the board;
 *           a 3-digit add never overflows the hundreds).
 *   • sub — ones ALWAYS borrow; 3-digit `double` ALSO borrows across the tens
 *           (the hundreds pays 1). No negatives, no leading zeros. */
export function generateColumnProblem(levelIndex: number): ColumnProblem {
  const cfg = LEVEL_CFG[Math.min(levelIndex, LEVEL_CFG.length - 1)];
  const mode: "add" | "sub" = Math.random() < 0.5 ? "add" : "sub";
  if (mode === "add") {
    const ao = ri(1, 9);
    const bo = ri(10 - ao, 9); // ones ALWAYS carry → ao+bo ∈ [10,18]
    let at: number, bt: number;
    if (cfg.double) {
      at = ri(1, 9);
      bt = ri(9 - at, 9); // at+bt ≥ 9 → +ones-carry ≥ 10 → tens carries
    } else {
      at = ri(0, 8);
      bt = ri(0, 8 - at); // at+bt ≤ 8 → +1 ≤ 9 → 2-digit result
    }
    let ah = 0, bh = 0;
    if (cfg.digits === 3) {
      if (cfg.double) {
        ah = ri(1, 8);
        bh = ri(0, 8 - ah); // +1 from tens ≤ 9 → no 4th digit
      } else {
        ah = ri(1, 9);
        bh = ri(0, 9 - ah); // no tens carry → ≤ 9
      }
    }
    return { digits: cfg.digits, mode, aD: [ao, at, ah], bD: [bo, bt, bh] };
  }
  const ao = ri(0, 8);
  const bo = ri(ao + 1, 9); // ones ALWAYS borrow → ao < bo
  const useTensBorrow = cfg.digits === 3 && cfg.double;
  let at: number, bt: number;
  if (useTensBorrow) {
    // bt ≥ at: after the ones-borrow the tens needs to borrow too — the
    // hundreds column pays the 1 (the cascade).
    at = ri(1, 9);
    bt = ri(at, 9);
  } else {
    // minuend tens ≥ subtrahend tens + 2: no tens borrow, and the tens answer
    // is never a leading 0. A 2-digit sub can't borrow twice without going negative.
    at = ri(2, 9);
    bt = ri(0, at - 2);
  }
  let ah = 0, bh = 0;
  if (cfg.digits === 3) {
    if (cfg.double) {
      ah = ri(3, 9);
      bh = ri(1, ah - 2); // ah ≥ bh+2 → hundreds survives the cascade
    } else {
      ah = ri(2, 9);
      bh = ri(0, ah - 2); // ah-1 ≥ bh → no hundreds borrow
    }
  }
  return { digits: cfg.digits, mode, aD: [ao, at, ah], bD: [bo, bt, bh] };
}

/** The correct digit for a column, given the current carry/borrow in flight. */
export interface ColumnSolve {
  digit: number;
  /** This column had to borrow (strike the top digit, show it as 10+it). */
  borrows: boolean;
  /** The column to the LEFT lent 1 (only when there IS a column to the left). */
  lends: boolean;
}

export function solveColumn(
  i: number,
  mode: "add" | "sub",
  aD: number[],
  bD: number[],
  carry: number,
  borrow: number,
  show: number
): ColumnSolve {
  if (mode === "add") {
    return { digit: (aD[i] + bD[i] + carry) % 10, borrows: false, lends: false };
  }
  const top = aD[i] - borrow;
  if (top < bD[i]) {
    return { digit: 10 + top - bD[i], borrows: true, lends: i + 1 < show };
  }
  return { digit: top - bD[i], borrows: false, lends: false };
}

/** [ones, tens, hundreds] → the number they represent. */
export function digitsNum(d: number[]): number {
  return d[0] + d[1] * 10 + d[2] * 100;
}

/** The full-answer value of a column problem (for the win narration). */
export function columnAnswer(aD: number[], bD: number[], mode: "add" | "sub"): number {
  return digitsNum(aD) + (mode === "add" ? 1 : -1) * digitsNum(bD);
}
