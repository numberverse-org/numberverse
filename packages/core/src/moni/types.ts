/**
 * 🧠 MONI (মণি — precious gem) — the tiny per-child tutor model.
 *
 * A small, fully-local model that watches how a child actually learns —
 * speed, timing, confidence, fatigue, misconceptions — and turns it into
 * one thing: the next move that makes them sharper. No big AI, no cloud,
 * no data leaves the device. It grows with each child.
 *
 * Design: layered signal → profile → diagnosis → plan.
 *   - Signals  : every round (correct, ms, difficulty) + every wrong tap
 *   - Profile  : what we believe about THIS child (attention, confidence,
 *                style, misconceptions)
 *   - Diagnosis: classify each mistake (slip / gap / misconception / fatigue)
 *   - Plan     : the next skill, difficulty, game, tone, and review schedule
 */

/** Round data Moni observes — the same fields the store already records. */
export interface MoniRound {
  kidId: string;
  skillId: string;
  gameId: string;
  correct: boolean;
  difficulty: number;
  responseMs: number; // how fast the child answered
  timestamp: number;
}

/** A wrong tap (every wrong tap, including mid-round taps). */
export interface MoniWrong {
  kidId: string;
  skillId: string;
  gameId: string;
  difficulty: number;
  timestamp: number;
}

/** What kind of mistake Moni thinks this was. */
export type ErrorKind =
  | "slip"          // knows it, rushed / careless
  | "gap"           // genuinely doesn't know this yet
  | "misconception" // a systematic error — same pattern repeats
  | "fatigue"       // attention collapsed after too many rounds
  | "guessing";     // disengaged, answering fast & randomly

/** The treatment Moni prescribes. */
export type ActionType =
  | "slow-down"     // accuracy reward, cue to take their time
  | "reteach"       // concept taught again, differently (the app's teach mode)
  | "contrast"      // interleaved contrast drill targeting the misconception
  | "easier"        // step difficulty back, rebuild wins
  | "challenge"     // push up — they're ready
  | "break"         // stop now, come back rested
  | "celebrate";    // just praise — they earned it

export interface MoniDiagnosis {
  kind: ErrorKind;
  confidence: number; // 0..1 how sure we are
  reason: string;     // human-readable, why
  action: MoniAction;
}

export interface MoniAction {
  type: ActionType;
  /** How to talk to the child — written in warm, simple words. */
  message: string;
  /** If a DIFFERENT skill should be practiced instead. */
  targetSkillId?: string;
  /** Difficulty delta relative to current: -1 easier, 0 same, +1 harder. */
  difficultyDelta?: number;
  /** A game that is best for this child's need. */
  gameId?: string;
  /** Spaced review: days until this skill should resurface. */
  reviewInDays?: number;
}

/** A detected systematic error (misconception). */
export interface Misconception {
  skillId: string;
  /** e.g. "overcount-1", "reversal-6-9", "off-by-ten", "operation-flip". */
  code: string;
  label: string;      // friendly, e.g. "Counts one too many"
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
}

/** Confidence / resilience of the child — how they bounce back. */
export interface MoniConfidence {
  /** 0..1. High = errors don't snowball. Low = one error crushes momentum. */
  score: number;
  /** P(correct on the very next attempt after a wrong). */
  recoveryRate: number;
  /** True when a single error tends to lead to more errors. */
  fragile: boolean;
}

/** Attention / fatigue curve for this child. */
export interface MoniAttention {
  /** Rounds into a session accuracy stays high — beyond this it dips. */
  fatigueThreshold: number | null;
  /** P(correct) in the first half of typical sessions. */
  earlyAccuracy: number;
  /** P(correct) in the second half — compared to early to spot fatigue. */
  lateAccuracy: number;
}

/** How this child learns best. */
export interface MoniStyle {
  /** 0 = careful/slow, 1 = fast/impatient. */
  speedTendency: number;
  /** Each gameId → engagement score (0..1, volume + accuracy weighted). */
  gameAffinity: Record<string, number>;
  /** The game the child learns best in. */
  bestGame: string | null;
  /** Mean response time over recent rounds (ms). */
  avgResponseMs: number;
}

/** The full per-child profile — the "gem" Moni keeps cutting. */
export interface MoniProfile {
  kidId: string;
  createdAt: number;
  updatedAt: number;

  // Volume
  sessions: number;
  totalRounds: number;
  totalCorrect: number;
  accuracy: number; // lifetime 0..1

  confidence: MoniConfidence;
  attention: MoniAttention;
  style: MoniStyle;

  /** Misconceptions Moni has caught (systematic errors). */
  misconceptions: Misconception[];

  /** Last N recent outcomes, newest first (for trend detection). */
  recent: { correct: boolean; ts: number }[];
  /** -1 slipping, 0 flat, +1 improving (last ~20 rounds). */
  trend: -1 | 0 | 1;

  /** Skills that are weak and why (set by planner). */
  weak: { skillId: string; reason: string; strength: number }[];

  lastSeen: number;
  lastSessionStart: number;
  /** Round count in the current session (used for fatigue). */
  sessionRounds: number;
}

/** Parent-adjustable strictness (#333) — how hard Moni pushes a kid.
 *  `gentle` → step difficulty back + warm tone; `steady` → keep the current
 *  level; `challenging` → push a step up + crisp tone. Offline, per-kid. */
export type MoniStrictness = "gentle" | "steady" | "challenging";

/** The plan Moni produces — the next best move for this child. */
export interface MoniPlan {
  focusSkillId: string;
  focusReason: string;
  difficulty: number;
  gameId: string;
  /** How to speak to this child: gentle / steady / challenging. */
  tone: "gentle" | "steady" | "challenging";
  /** Suggested rounds before a break (their fatigue threshold). */
  sessionLengthHint: number;
  /** Spaced review schedule (days). */
  reviewSchedule: { skillId: string; inDays: number }[];
  /** Skills due for a review NOW (#328) — most overdue first. The kid UI
   *  surfaces these as gentle, non-blocking prompts ("no rush"). `overdueDays`
   *  is 0 when the skill is due today. */
  dueReviews: { skillId: string; inDays: number; overdueDays: number }[];
  /** Parent-facing summary — what Moni learned and recommends. */
  summary: string;
  /** The next 3 skills this child should practice, newest/most urgent first.
   *  Parent-facing, offline-safe. `reason` is a plain English line;
   *  `reasonCode` lets the UI render a localized phrase instead. */
  recommendations: { skillId: string; reasonCode: "focus" | "weak" | "review"; reason: string; inDays?: number }[];
}

/** Tuning constants — sane defaults, overridable. */
export interface MoniParams {
  fastMs: number;            // below this = "fast" answer
  slowMs: number;            // above this = "hesitant" answer
  slipAccuracy: number;      // skill mastery above this → an error is a slip
  slipStreak: number;        // consecutive wrongs before we call it a gap
  misconcOccurrences: number;// repeats before a systematic error is confirmed
  fatigueWindow: number;     // rounds used to measure early/late accuracy
  trendWindow: number;       // recent rounds used for trend
  recoveryWindow: number;    // recent wrongs used for recovery rate
  reviewDays: number[];      // spaced review ladder [1, 3, 7, 14]
}

export const DEFAULT_MONI_PARAMS: MoniParams = {
  fastMs: 2000,
  slowMs: 5000,
  slipAccuracy: 0.7,
  slipStreak: 2,
  misconcOccurrences: 2,
  fatigueWindow: 12,
  trendWindow: 20,
  recoveryWindow: 8,
  reviewDays: [1, 3, 7, 14],
};

/** Minimal skill-mastery shape Moni needs (from the app's SkillState). */
export interface SkillMasteryLike {
  pMastered: number;
  streak: number;
  correct: number;
  attempts: number;
  /** Consecutive wrongs on this skill right now (0 if the last round was right). */
  wrongStreak: number;
  /** Last practice time (epoch ms) — feeds the confidence-based review
   *  schedule (#328). Optional: falls back to "due now" when unknown. */
  lastPractice?: number | null;
}
