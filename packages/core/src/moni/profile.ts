/**
 * 🧠 MONI — the learning profile.
 * Moni watches every round and every wrong tap, and slowly builds a picture
 * of THIS child: their attention curve, their confidence, their style, and
 * the misconceptions that trip them. Pure + deterministic (easy to test).
 */

import type {
  MoniProfile,
  MoniRound,
  MoniWrong,
  MoniParams,
  Misconception,
  SkillMasteryLike,
} from "./types.js";

export function initialMoniProfile(kidId: string, now = Date.now()): MoniProfile {
  return {
    kidId,
    createdAt: now,
    updatedAt: now,
    sessions: 0,
    totalRounds: 0,
    totalCorrect: 0,
    accuracy: 0,
    confidence: { score: 0.5, recoveryRate: 0, fragile: false },
    attention: { fatigueThreshold: null, earlyAccuracy: 0, lateAccuracy: 0 },
    style: { speedTendency: 0.5, gameAffinity: {}, bestGame: null, avgResponseMs: 0 },
    misconceptions: [],
    recent: [],
    trend: 0,
    weak: [],
    lastSeen: now,
    lastSessionStart: now,
    sessionRounds: 0,
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Observe one completed round. Updates:
 *  - volume + accuracy
 *  - recent outcomes (trend)
 *  - response speed (style)
 *  - attention curve (early vs late session accuracy)
 *  - confidence (recovery after errors, snowball detection)
 *  - misconceptions (via the caller, which knows the wrong answer value)
 */
export function observeRound(
  profile: MoniProfile,
  round: MoniRound,
  skill: SkillMasteryLike | null,
  params: MoniParams,
  now = Date.now(),
): MoniProfile {
  const p: MoniProfile = { ...profile };
  p.updatedAt = now;
  p.lastSeen = now;
  p.totalRounds += 1;
  p.sessionRounds += 1;
  if (round.correct) p.totalCorrect += 1;
  p.accuracy = p.totalRounds ? p.totalCorrect / p.totalRounds : 0;

  // Recent window → trend
  p.recent = [{ correct: round.correct, ts: now }, ...p.recent].slice(0, params.trendWindow);
  p.trend = trendOf(p.recent, params);

  // Style: speed tendency + avg response ms
  const ms = round.responseMs > 0 ? round.responseMs : p.style.avgResponseMs;
  p.style.avgResponseMs = p.style.avgResponseMs
    ? (p.style.avgResponseMs * 0.85 + ms * 0.15)
    : ms;
  // Normalize: <1s → 1 (very fast), >10s → 0 (very slow)
  p.style.speedTendency = clamp01(1 - Math.max(0, Math.min(1, (p.style.avgResponseMs - 1000) / 9000)));

  // Game affinity: engagement = accuracy-weighted volume
  const aff = p.style.gameAffinity[round.gameId] ?? 0;
  p.style.gameAffinity[round.gameId] = clamp01(aff + (round.correct ? 0.08 : -0.03));
  p.style.bestGame = bestGameOf(p.style.gameAffinity);

  // Attention: split recent rounds into early/late halves of the session.
  const sessionRounds = p.sessionRounds;
  if (sessionRounds >= 4) {
    // p.recent is NEWEST-first, so slice(0,half) = LATE in session, slice(half) = EARLY.
    const recentOutcomes = p.recent.slice(0, Math.min(sessionRounds, params.fatigueWindow));
    const half = Math.max(1, Math.floor(recentOutcomes.length / 2));
    const late = recentOutcomes.slice(0, half);
    const early = recentOutcomes.slice(half);
    const earlyAcc = mean(early.map((r) => (r.correct ? 1 : 0)));
    const lateAcc = mean(late.map((r) => (r.correct ? 1 : 0)));
    p.attention.earlyAccuracy = earlyAcc;
    p.attention.lateAccuracy = lateAcc;
    // Fatigue threshold: the point in the session where accuracy first dips.
    if (lateAcc < earlyAcc - 0.15 && sessionRounds >= 6) {
      p.attention.fatigueThreshold = Math.max(6, sessionRounds - Math.floor(recentOutcomes.length * 0.5));
    } else if (p.attention.fatigueThreshold === null && lateAcc >= earlyAcc - 0.05) {
      // Session stayed strong this far — extend the threshold.
      p.attention.fatigueThreshold = Math.max(p.attention.fatigueThreshold ?? 0, sessionRounds);
    }
  }

  // Confidence: recovery after a wrong. We update this in observeWrong too,
  // but a correct answer right after a wrong is a strong signal.
  if (round.correct && p.recent.length >= 2 && !p.recent[1].correct) {
    p.confidence.recoveryRate = clamp01(p.confidence.recoveryRate + 0.1);
  }

  return p;
}

/**
 * Observe a wrong tap (mid-round wrongs included). This is where the model
 * learns confidence fragility and updates the misconception ledger.
 */
export function observeWrong(
  profile: MoniProfile,
  wrong: MoniWrong,
  skill: SkillMasteryLike | null,
  params: MoniParams,
  now = Date.now(),
): MoniProfile {
  const p: MoniProfile = { ...profile };
  p.updatedAt = now;
  p.lastSeen = now;

  // Recovery tracking: note that we just got a wrong.
  if (p.recent.length && p.recent[0].correct) {
    // A correct was followed by a wrong — slight fragility signal.
    p.confidence.score = clamp01(p.confidence.score - 0.02);
  }

  // Misconception detection — caller provides a normalized error code via
  // the skill's wrong pattern. Moni confirms a pattern after N repeats.
  if (skill && skill.wrongStreak >= params.misconcOccurrences) {
    p.misconceptions = upsertMisconception(p.misconceptions, {
      skillId: wrong.skillId,
      code: "repeated-error",
      label: "Repeats the same kind of mistake",
      firstSeen: now,
      lastSeen: now,
      occurrences: 1,
    });
  }

  return p;
}

/** End a session — resets the session round counter, bumps session count. */
export function endSession(profile: MoniProfile, now = Date.now()): MoniProfile {
  const p: MoniProfile = { ...profile };
  p.sessions += 1;
  p.sessionRounds = 0;
  p.updatedAt = now;
  return p;
}

/** Register a NEW misconception pattern (caller knows the code/label). */
export function recordMisconception(
  profile: MoniProfile,
  skillId: string,
  code: string,
  label: string,
  now = Date.now(),
): MoniProfile {
  const p: MoniProfile = { ...profile };
  p.misconceptions = upsertMisconception(p.misconceptions, {
    skillId, code, label, firstSeen: now, lastSeen: now, occurrences: 1,
  });
  return p;
}

function upsertMisconception(list: Misconception[], m: Misconception): Misconception[] {
  const i = list.findIndex((x) => x.skillId === m.skillId && x.code === m.code);
  if (i === -1) return [...list, m];
  const copy = list.slice();
  copy[i] = {
    ...copy[i],
    occurrences: copy[i].occurrences + 1,
    lastSeen: m.lastSeen,
  };
  return copy;
}

function bestGameOf(affinity: Record<string, number>): string | null {
  let best: string | null = null;
  let bestVal = 0;
  for (const [g, v] of Object.entries(affinity)) {
    if (v > bestVal) { bestVal = v; best = g; }
  }
  return best;
}

function trendOf(recent: { correct: boolean }[], params: MoniParams): -1 | 0 | 1 {
  const window = recent.slice(0, params.trendWindow);
  if (window.length < 10) return 0;
  const half = Math.floor(window.length / 2);
  const early = window.slice(half);
  const late = window.slice(0, half);
  const e = mean(early.map((r) => (r.correct ? 1 : 0)));
  const l = mean(late.map((r) => (r.correct ? 1 : 0)));
  if (l - e >= 0.15) return 1;
  if (e - l >= 0.15) return -1;
  return 0;
}
