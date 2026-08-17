/* journey.ts — pure learning-domain logic + data for the kid app (extracted from
 * App.tsx, #589). NO React, NO DOM, NO app state — every function here is a pure
 * function of (skillsMap, kidId, ...) or static config. The kid app shell
 * (App.tsx) and the screen components import from here.
 *
 * i18n seam: locale-sensitive labels (badges/achievements/ranks/tour) keep
 * { en, bn } pairs here; the Strings/STR table lives in ../i18n.ts. */
import { BANDS, SKILLS, GAME_SCENES, getGame, getSkill, getFamily, nextDifficulty, moni, DEFAULT_MONI_PARAMS, type Band, type ErrorKind, type Skill } from "@numberverse/core";
import { useKidStore, type RoundResult, type MistakeState } from "../store";
import { bnNum, BN_MONTHS, type Lang, type Strings } from "../i18n-core";
import { RANKS, NOVA_REACTIONS, type NovaReaction, type SeasonKey } from "./journeyConfig";

/* #883 — the heavy journey config TABLES (BADGES/ACHIEVEMENTS/CHALLENGE_ROUNDS,
 * WORLD_LANDS, RANKS, SEASON decor, DONE_CONFETTI + the core BANDS/SKILLS
 * catalog) live in ./journeyConfig.ts. They are re-exported here for backward
 * compat so every existing importer (screens + App shell) keeps working
 * unchanged; the boot graph defers that module via the on-demand import in
 * App.tsx. */
export {
  BANDS, SKILLS, type Band, type Skill,
  SECURITY_QUESTIONS, type ContrastRound, type ContrastTemplate, CONTRAST_TEMPLATES,
  DONE_CONFETTI, type SeasonKey, SEASON_PARTICLES, SEASON_EMOJI,
  CHALLENGE_ROUNDS, CHALLENGE_MIN_LEVEL, CHALLENGE_MAX_LEVEL, TOUR_STEPS, RANKS,
  type BadgeCtx, type BadgeDef, BADGES, type AchCtx, type AchDef, ACHIEVEMENTS,
  type NovaReaction, type NovaReactionDef, NOVA_REACTIONS,
  WORLD_LANDS, FOCUS_SUBJECT_LABELS, SUBJECT_CARD, AVATAR_PART_OPTIONS, AVATAR_PART_LABELS,
} from "./journeyConfig";
/** Max skills per guided play session — each skill gets a proper block.
 *  World sessions now sweep every unmastered skill in the band (min 6). */
export const SESSION_LEN = 6;
/** A skill is "mastered" at this BKT P(mastered). Mirrors core masteryThreshold. */
export const MASTERY_THRESHOLD = 0.8;
/** Challenge-mode (#1158 #1166) older-kid skills need a HIGHER bar — a band-6/7
 *  skill isn't "done" the moment it crosses the same 0.8 a 6-year-old hits; the
 *  older learner proves fluency (0.92) before the map counts it mastered. */
export const CHALLENGE_MASTERY_THRESHOLD = 0.92;
/** The mastery bar a given skill must cross: challenge skills require more
 *  proof, everything else uses the standard 0.8. Pure fn of the skill catalog —
 *  no skill id→threshold map to keep in sync (a new challenge skill is data). */
export function masteryThresholdFor(skillId: string): number {
  return getSkill(skillId)?.challenge ? CHALLENGE_MASTERY_THRESHOLD : MASTERY_THRESHOLD;
}
/** #1133/#1136 — the EXPERT bar: a skill is "over-mastered" (challenge-replay
 *  eligible) at pMastered ≥ 0.92. This is the gradation past the mastery
 *  boolean — 0.8 is just-mastered (stays in Moni's review rotation), 0.92+
 *  is expert (gets the top-rung timed challenge replay). So 1.0 genuinely
 *  plays harder than 0.8 without needing a new number in the data model. */
export const CHALLENGE_REPLAY_THRESHOLD = 0.92;
/** Post-mastery EXPERT check (#1133): pMastered ≥ 0.92 → the skill can re-enter
 *  the session pool as a challenge replay. Pure fn of the mastery map. */
export function challengeEligible(skills: SkillMap, kidId: string, skillId: string): boolean {
  const st = skills[`${kidId}:${skillId}`];
  return !!st && st.pMastered >= CHALLENGE_REPLAY_THRESHOLD;
}
/** Post-mastery challenge replay starts at the TOP rung of the skill's OWN
 *  ladder (dataLevels when present, else the game ladder) — the hardest the
 *  skill offers; the challenge flag (timed/no-hint in the supporting scenes)
 *  supplies the pressure. #1129/#1134 — the answer to "what's next" for a
 *  mastered skill. */
export function challengeStartLevelIndex(skillId: string, gameId: string): number {
  const game = getGame(gameId);
  if (!game || game.difficultyLevels.length === 0) return 0;
  const ladder = getSkill(skillId)?.dataLevels ?? game.difficultyLevels;
  return ladder.length - 1;
}
/** Next world unlocks when ≥80% of the previous world's skills are mastered. */
export const UNLOCK_THRESHOLD = 0.8;


/** #247 — PIN-recovery security questions: moved to ./journeyConfig (#883). */

/** 🎯 #325 — MONI contrast-drill templates: moved to ./journeyConfig (#883). */

/** Done-screen confetti + season decor data: moved to ./journeyConfig (#883). */
export function currentSeason(): SeasonKey {
  const m = new Date().getMonth(); // 0 = January
  if (m >= 11 || m <= 1) return "snow";
  if (m <= 4) return "flowers";
  if (m <= 7) return "fireflies";
  return "leaves";
}

/** Fullscreen helpers — degrade gracefully when the Fullscreen API is missing
 *  (iOS Safari reports fullscreenEnabled === false, and its webkit prefix only
 *  works for <video>, not the page). The PWA manifest's "fullscreen" display +
 *  the apple/mobile-web-app meta tags cover the installed-home-screen path.
 *
 *  DEFAULT FULLSCREEN: the app enters fullscreen on the very first tap
 *  anywhere — a kid gets an immersive, edge-to-edge screen from the start and
 *  it STAYS fullscreen through leaving a game (parents exit via the footer
 *  toggle / "f" key). */
export const fsSupported = () => {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as unknown as {
    webkitRequestFullscreen?: () => void;
  };
  return Boolean(document.fullscreenEnabled || el?.webkitRequestFullscreen);
};

export function requestFullscreen() {
  const el = document.documentElement as unknown as {
    requestFullscreen?: () => void | Promise<void>;
    webkitRequestFullscreen?: () => void;
  };
  const req = el?.requestFullscreen?.bind(el) || el?.webkitRequestFullscreen?.bind(el);
  if (!req) return;
  if (document.fullscreenElement) return;
  try {
    void req();
  } catch {
    /* some browsers reject programmatic fullscreen (permissions / iframes) */
  }
}
export function exitFullscreen() {
  const d = document as unknown as {
    fullscreenElement?: Element | null;
    exitFullscreen?: () => void | Promise<void>;
    webkitExitFullscreen?: () => void;
  };
  if (!d.fullscreenElement) return;
  try {
    const ex = d.exitFullscreen?.bind(d) || d.webkitExitFullscreen?.bind(d);
    if (ex) void ex();
  } catch {
    /* ignore */
  }
}

/** One step in a guided session — a skill + the scene that teaches it. */
export interface SessionStep {
  skillId: string;
  gameId: string;
  scene: string;
  title: string;
  mode?: "add" | "sub" | "vowels" | "consonants" | "family" | "conjuncts" | "words" | "civic" | "paragraph" | "sentences" | "fast";
  /** Run the narrated Basket Math concept-demo before the drills (add/sub). */
  teach?: boolean;
  /** #1130/#1158 — post-mastery CHALLENGE replay: this step re-runs a mastered
   *  EXPERT skill (pMastered ≥ 0.92) at the TOP rung with the challenge flag —
   *  no forced re-demo, reteach stays at tier, and the scenes that support it
   *  add a countdown + no hint/reveal. "Mastered" never means "gone". */
  challenge?: boolean;
  /** Mastery-gate count: how many remediation re-runs this step has had after
   *  the kid left wrongs unresolved. >0 → re-teach (re-demo + easier tier)
   *  until a block ends with open === 0, then advance. */
  reteach?: number;
}

/** Durable snapshot of a kid's in-flight session. Saved to localStorage so a
 *  kid can leave mid-game (or close the app) and resume at the same step, round,
 *  score, and streak instead of starting the block over. */
export interface SavedSession {
  steps: SessionStep[];
  idx: number;
  roundsDone: number;
  score: number;
  stars: number;
  events: RoundResult[];
}

export interface Kid {
  id: string;
  name: string;
  avatar: string;
  birthYear: number;
  /** Optional full birthday (month 1–12, day 1–31) — feeds the birthday party.
   *  Kids created before this existed only have the year → no party (graceful). */
  birthMonth?: number;
  birthDay?: number;
  /** #285 — mix-and-match avatar parts (built in the Customize screen). The
   *  base stays in `avatar` so every older screen keeps working; this layers
   *  the hat/glasses/outfit on top when present. Offline, persisted per kid. */
  avatarParts?: AvatarParts;
}

/** #1415 — the product promises "up to 4 per family"; enforce that hard cap in
 *  the Add Kid flow (the UI hides the add action and `addKid` guards it too). */
export const MAX_KIDS_PER_FAMILY = 4;

/** Mastery state map (from the persisted store) — key `${kidId}:${skillId}`.
 *  The store's real value is the full core SkillState (lastPractice/correct/
 *  attempts/streak too) — the album reads those for card dates + flip stats. */
export type SkillMapEntry = { pMastered: number; lastPractice?: number | null; correct?: number; attempts?: number; streak?: number };
export type SkillMap = Record<string, SkillMapEntry>;


/* #285 — custom avatar builder: mix-and-match parts to build a unique buddy.
 * Base = the sticker hero (same AVATAR_KEYS as today); parts are emoji layers
 * (hat/glasses/outfit) drawn OVER the sticker. 7 options each (6+ ✓), "none"
 * to clear. Locale-packed labels (#131), persisted per kid, fully offline.
 * AVATAR_PART_OPTIONS / AVATAR_PART_LABELS: moved to ./journeyConfig (#883). */
export interface AvatarParts {
  base: string; // one of AVATAR_KEYS
  hat: string; // emoji or "none"
  glasses: string; // emoji or "none"
  outfit: string; // emoji or "none"
}
/** Current buddy's parts (or null if the kid never customized). */
export function kidParts(k: Kid | undefined | null): AvatarParts | null {
  return k?.avatarParts ? { ...k.avatarParts } : null;
}



/* ── #280 beat-the-owl drill: question generator + fair Nova ──
 *  Pure + locale-aware. `bnNum` is hoisted (same module) so the Bangla digit
 *  conversion is available even though this block sits earlier in the file. */

/** CHALLENGE_ROUNDS / MIN / MAX levels: moved to ./journeyConfig (#883). */

export interface ChallengeQ {
  text: string;      // "3 + 4 = ?" (display digits already localized)
  options: string[]; // 4 choices, localized digits
  answer: number;    // index of the correct choice
}

export function challengeQ(level: number, lang: Lang): ChallengeQ {
  const ri = (n: number) => Math.floor(Math.random() * n);
  let a = 1, b = 1, op = "+", ans = 1;
  const bump = ri(4) > 0 ? 1 + ri(level <= 3 ? 2 : 3) : 0; // small off-by-n distractor spread
  if (level <= 2) {
    a = 1 + ri(9); b = 1 + ri(9); op = ri(2) ? "+" : "-";
    if (op === "-") { if (a < b) { const t = a; a = b; b = t; } ans = a - b; } else ans = a + b;
  } else if (level <= 4) {
    a = 10 + ri(40); b = 10 + ri(40); op = ri(2) ? "+" : "-";
    if (op === "-") { if (a < b) { const t = a; a = b; b = t; } ans = a - b; } else ans = a + b;
  } else if (level <= 6) {
    a = 2 + ri(8); b = 2 + ri(8); op = "×"; ans = a * b;
  } else if (level <= 8) {
    const kind = ri(3);
    if (kind === 0) { a = 10 + ri(50); b = 5 + ri(10); op = "+"; ans = a + b; }
    else if (kind === 1) { a = 20 + ri(60); b = 2 + ri(15); op = "-"; ans = a - b; }
    else { a = 3 + ri(9); b = 6 + ri(6); op = "×"; ans = a * b; }
  } else {
    const kind = ri(3);
    if (kind === 0) { a = 40 + ri(60); b = 20 + ri(40); op = "+"; ans = a + b; }
    else if (kind === 1) { a = 60 + ri(50); b = 12 + ri(20); op = "-"; ans = a - b; }
    else { a = 7 + ri(6); b = 7 + ri(6); op = "×"; ans = a * b; }
  }
  // Distractors — near-correct values, always ≥ 0, never duplicates.
  const set = new Set<number>([ans]);
  let guard = 0;
  while (set.size < 4 && guard++ < 50) {
    const d = ans + (ri(5) - 2) * Math.max(1, bump + 1) + (ri(3) - 1);
    if (d >= 0) set.add(d);
  }
  let fill = ans + 3;
  while (set.size < 4) set.add(fill++);
  const arr = [...set];
  for (let i = arr.length - 1; i > 0; i--) { const j = ri(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  const fmt = (n: number) => (lang === "bn" ? bnNum(n) : String(n));
  return { text: `${fmt(a)} ${op} ${fmt(b)} = ?`, options: arr.map(fmt), answer: arr.indexOf(ans) };
}

/** Fair Nova: their hit-rate tracks the kid — a strong kid meets a strong owl
 *  (still beatable), a struggling kid meets a gentler one. Always winnable. */
export function challengeNovaChance(kidAccuracy: number): number {
  return Math.min(0.65, Math.max(0.35, 0.5 + (kidAccuracy - 0.5) * 0.4));
}

/* ── #356 first-play tour steps + rank ladder: moved to ./journeyConfig (#883).
 * rankFor below reads RANKS from the lazy config module. */

export function rankFor(mastered: number, lang: Lang): { title: string; nextTitle: string | null; need: number } {
  let cur = RANKS[0];
  for (const r of RANKS) {
    if (mastered >= r.min) cur = r;
    else break;
  }
  const i = RANKS.indexOf(cur);
  const next = RANKS[i + 1] ?? null;
  return {
    title: lang === "bn" ? cur.bn : cur.en,
    nextTitle: next ? (lang === "bn" ? next.bn : next.en) : null,
    need: next ? Math.max(1, next.min - mastered) : 0,
  };
}

/** Is today the kid's actual birthday? Needs the full month+day — kids created
 *  before we collected it simply don't get a party (graceful, no crash). */
export function isBirthday(kid: Kid | null | undefined): boolean {
  if (!kid || typeof kid.birthMonth !== "number" || typeof kid.birthDay !== "number") return false;
  const now = new Date();
  return now.getMonth() + 1 === kid.birthMonth && now.getDate() === kid.birthDay;
}

/* #1162 — age-graded reward surfaces. The nursery pet is perfect for the
 * youngest bands, but the same caring ritual reads as patronising to older
 * learners. Map age onto the curriculum bands in packages/core skills.ts BANDS
 * (1 = 2–4, 2 = 4–6, 3 = 6–8, 4 = 8–10, 5 = 10–13, 6 = 11–14, 7 = 12–15,
 * 8 = 13–16) so the home screen can swap the pet for a streak/badge/achievement
 * mission bar on bands 5–8. */
export function bandForAge(age: number): number {
  if (!Number.isFinite(age) || age < 4) return 1;
  if (age < 6) return 2;
  if (age < 8) return 3;
  if (age < 10) return 4;
  if (age < 13) return 5;
  if (age < 14) return 6;
  // 14+ → Summit Peaks (band 8, ages 13–16) so the oldest cohort reaches the
  // band-8 surface by placement, not only by journey progress. Band 7 (Polar
  // Peaks, 12–15) overlaps heavily and stays reachable via progression.
  // Clamp against the catalog so a future band added to BANDS is covered
  // automatically instead of silently capping here.
  return Math.min(8, BANDS.length);
}

/** The band a kid is in, from their stored birth year + optional birthday.
 *  A missing/zero/future birth year falls back to band 1 (youngest surface) so
 *  an incomplete profile keeps the nursery pet instead of losing the caring
 *  ritual entirely. */
export function kidBand(kid: Kid | null | undefined, now: Date = new Date()): number {
  const birthYear = kid?.birthYear;
  if (typeof birthYear !== "number" || birthYear <= 0) return 1;
  // #13 — full-date age when the birthday is known: a Dec-31-born kid isn't a
  // year older on Jan 1. Fall back to year-only for legacy profiles (graceful).
  let age = now.getFullYear() - birthYear;
  if (typeof kid?.birthMonth === "number" && typeof kid?.birthDay === "number") {
    const beforeBirthday =
      now.getMonth() + 1 < kid.birthMonth ||
      (now.getMonth() + 1 === kid.birthMonth && now.getDate() < kid.birthDay);
    if (beforeBirthday) age -= 1;
  }
  if (age < 0) return 1;
  return bandForAge(age);
}

/** Skill ids that have crossed the mastery bar for a kid right now. */
export function masteredSkillIds(map: SkillMap, kidId: string): Set<string> {
  const set = new Set<string>();
  for (const key of Object.keys(map)) {
    const sep = key.indexOf(":");
    if (sep < 0 || key.slice(0, sep) !== kidId) continue;
    if (map[key].pMastered >= masteryThresholdFor(key.slice(sep + 1))) set.add(key.slice(sep + 1));
  }
  return set;
}

/** Consecutive correct rounds at the tail of this session's events → the HUD 🔥. */
export function sessionStreak(events: RoundResult[]): number {
  let s = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (!events[i].correct) break;
    s++;
  }
  return s;
}

/* #283 goal badges + #289 achievements album: the DEFS moved to ./journeyConfig
 * (#883). The earned/progress conditions only read local state. */

/* #292 — Nova reaction pack: the reaction TABLE moved to ./journeyConfig (#883);
 * novaReactionLine reads NOVA_REACTIONS from the lazy config module. */

/** #1034 — pick the reaction line for the active kid's register (EN/BN). */
export function novaReactionLine(kind: NovaReaction, lang: "en" | "bn", mature: boolean): string {
  const def = NOVA_REACTIONS[kind];
  if (lang === "bn") return mature && def.lineBnMature ? def.lineBnMature() : def.lineBn();
  return mature && def.lineEnMature ? def.lineEnMature() : def.lineEn();
}

/** How many lands the kid has FULLY mastered (every skill past the threshold). */
export function fullyMasteredWorlds(skillsMap: Record<string, SkillMapEntry>, kidId: string): number {
  return BANDS.filter((b) => {
    const prog = worldProgress(skillsMap, kidId, b.id);
    return prog.total > 0 && prog.mastered === prog.total;
  }).length;
}


/** Works in non-secure contexts (LAN/phone) where crypto.randomUUID() is unavailable. */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ────────────────────────────── progress helpers ────────────────────────────── */

// ── Parent-control filters (set by App on the active kid) ────────────────
// These are module-level so the journey/world helpers can consult them without
// threading a "settings" param through every call. `applyKidControls` is called
// whenever the active kid's settings load or change.
export let filterSkills: Skill[] = SKILLS; // subject filter applied
export let filterMaxBand: number | null = null; // null = no cap
// #257 — curriculum focus pin (parent-set subject + world the journey leads
// with). Both set together or both null (clear default).
export let filterFocusSubject: string | null = null;
export let filterFocusBand: number | null = null;

/** #1120 — the 305-skill catalog grouped into LEARNABLE UNITS, rebuilt ONLY
 *  when the subject filter changes. totalMastered/worldProgress used to
 *  re-filter + re-group the whole catalog on EVERY call — and App.tsx has 13+
 *  call sites per render (kid reducers, leaderboard rows, world progress), so
 *  every store tick ran thousands of filter + skillMastered iterations with
 *  zero memoization. Now these helpers iterate this single cached structure.
 *  Built from the initial (unfiltered) filterSkills at module scope so first
 *  render behaves exactly as before applyKidControls runs. */
export let gameUnits: { key: string; band: number; members: Skill[] }[] = [];
/** #1121 — per-band view of the same cached units, so worldProgress touches
 *  only its band's units instead of scanning all 7 bands' worth. Rebuilt
 *  alongside gameUnits (only on applyKidControls). */
export let gameUnitsByBand = new Map<number, { key: string; band: number; members: Skill[] }[]>();
/** #1122 — the playable journey-stop list, cached (was filterSkills.filter(game)
 *  on EVERY journeyStops()/journeyState()/worldCards() call). */
export let journeyStopList: Skill[] = [];

function buildGameUnits() {
  const byKey = new Map<string, { key: string; band: number; members: Skill[] }>();
  journeyStopList = [];
  for (const s of filterSkills) {
    if (!s.game) continue;
    journeyStopList.push(s);
    const key = `${s.band}:${s.family ?? `__${s.id}`}`;
    let u = byKey.get(key);
    if (!u) {
      u = { key, band: s.band, members: [] };
      byKey.set(key, u);
    }
    u.members.push(s);
  }
  gameUnits = [...byKey.values()];
  const byBand = new Map<number, { key: string; band: number; members: Skill[] }[]>();
  for (const u of gameUnits) {
    let arr = byBand.get(u.band);
    if (!arr) {
      arr = [];
      byBand.set(u.band, arr);
    }
    arr.push(u);
  }
  gameUnitsByBand = byBand;
}
buildGameUnits();

export function applyKidControls(
  enabledSubjects: string[] | null,
  maxBand: number | null,
  focusSubject: string | null = null,
  focusBand: number | null = null
) {
  filterSkills = enabledSubjects
    ? SKILLS.filter((s) => enabledSubjects.includes(s.subject))
    : SKILLS;
  filterMaxBand = maxBand;
  filterFocusSubject = focusSubject;
  filterFocusBand = focusBand;
  buildGameUnits();
}

/** #257 — subject id of a skill (for focus-pin ordering in session pools). */
export function subjectForSkill(skillId: string): string | undefined {
  return SKILLS.find((s) => s.id === skillId)?.subject;
}

/** #257 — subject labels: moved to ./journeyConfig (#883). */

export function skillMastered(skills: SkillMap, kidId: string, skillId: string): boolean {
  const st = skills[`${kidId}:${skillId}`];
  return !!st && st.pMastered >= masteryThresholdFor(skillId);
}

/** #1431 — kid-facing mastery % for one skill. `pMastered` is a floating BKT
 *  probability and can hover just under the bar (79%…) while the integer
 *  rendering sits still. Instead, use the BKT estimate as the floor and add the
 *  current per-skill streak on top, so every correct answer VISIBLY ticks the
 *  bar; a wrong answer falls back to the long-term floor (never to zero). Once
 *  the BKT estimate crosses the mastery bar, the meter reads a full 100%. */
export function masteryDisplayPct(st: SkillMapEntry | undefined, skillId: string): number {
  if (!st) return 0;
  if (st.pMastered >= masteryThresholdFor(skillId)) return 100;
  const floor = Math.round(st.pMastered * 100);
  const streak = st.streak ?? 0;
  return Math.min(99, floor + streak);
}

/* #1125 — per-kid mastery stats (count + pMastered sum), folded ONCE per
 * skills-map reference. startChallenge() used to scan Object.entries(st.skills)
 * (filtering the kid's prefix, up to 305 entries, then reducing) synchronously
 * on EVERY tap. The store writes a NEW skills object on every round, so the
 * cache refreshes between sessions; within one snapshot it's O(1) per kid. */
let masteryStatsRef: unknown = null;
let masteryStatsByKid = new Map<string, { count: number; sum: number }>();

export function kidMasteryStats(kidId: string): { count: number; sum: number } {
  const st = useKidStore.getState();
  if (st.skills !== masteryStatsRef) {
    masteryStatsRef = st.skills;
    const byKid = new Map<string, { count: number; sum: number }>();
    for (const [key, m] of Object.entries(st.skills)) {
      const colon = key.indexOf(":");
      const kid = colon < 0 ? key : key.slice(0, colon);
      let c = byKid.get(kid);
      if (!c) {
        c = { count: 0, sum: 0 };
        byKid.set(kid, c);
      }
      c.count += 1;
      c.sum += m.pMastered;
    }
    masteryStatsByKid = byKid;
  }
  return masteryStatsByKid.get(kidId) ?? { count: 0, sum: 0 };
}

/** Skills a kid is currently struggling with: open (unresolved) wrongs right now,
 *  OR ≥3 lifetime misses and not yet mastered. Feeds the parent panel's
 *  "Needs a little help" list so a grown-up can guide the tough ones. */
export function strugglingSkills(
  skills: SkillMap,
  kidId: string,
  mistakes: Record<string, MistakeState>
): Array<{ skill: Skill; open: number; wrong: number; lastAt: number }> {
  const out: Array<{ skill: Skill; open: number; wrong: number; lastAt: number }> = [];
  for (const skill of SKILLS) {
    if (!skill.game) continue;
    if (skillMastered(skills, kidId, skill.id)) continue;
    const m = mistakes[`${kidId}:${skill.id}`];
    if (!m) continue;
    if (m.open > 0 || m.wrong >= 3) out.push({ skill, open: m.open, wrong: m.wrong, lastAt: m.lastAt });
  }
  return out.sort((a, b) => b.open - a.open || b.wrong - a.wrong);
}

/* ── SKILL FAMILIES (#1207-#1216) ──────────────────────────────────────────
 * Overlapping skill ids that are TIERS of ONE concept (concrete→abstract→timed
 * drills, or a band-ceiling bump of the same scene — percent 10→75%, fractions
 * 4→8 parts, clock to the minute, division to 100, the count ladder) share a
 * `family` in the catalog. Progress counts ONE unit per family per band, so the
 * "X mastered / Y" number a child AND a parent see no longer fragments the same
 * concept across duplicate ids. Every individual game stays playable and every
 * per-skill card/mastery record is untouched — only the aggregate counts unify. */

/** Family unit key — one learnable concept per band. Skills without a family
 *  are their own unit (so families of one behave exactly as before). */
function unitKey(s: Skill): string {
  return `${s.band}:${s.family ?? `__${s.id}`}`;
}

/** True when a cached unit is mastered (#1120 — O(members) on the cached group,
 *  no catalog re-scan). A multi-tier FAMILY is ONE concept: it counts as
 *  mastered only when the family's HARDEST tier (top `tier`) is mastered, so a
 *  kid who can count to 10 doesn't unlock River Town without ever counting to
 *  20 (#1044-audit). A unit with a single member behaves exactly as before. */
function unitMasteredFrom(skills: SkillMap, kidId: string, u: { members: Skill[] }): boolean {
  const top = u.members.reduce((a, b) => ((b.tier ?? 1) > (a.tier ?? 1) ? b : a), u.members[0]);
  return !!top && skillMastered(skills, kidId, top.id);
}

export function worldProgress(skills: SkillMap, kidId: string, band: number): { mastered: number; total: number; pct: number } {
  let mastered = 0;
  let total = 0;
  // #1121 — single pass over ONLY this band's cached units (was two filters
  // over the whole catalog per band, everywhere in render).
  const units = gameUnitsByBand.get(band);
  if (units) {
    for (const u of units) {
      total++;
      if (unitMasteredFrom(skills, kidId, u)) mastered++;
    }
  }
  // #1484 — a band with no playable units (parent subject filter removed every
  // game-bearing member) must report an honest 0/0, NOT a fabricated 0/1. The
  // old `total || 1` clamp made an empty band read as one unmastered lesson and
  // leaked that phantom 1 into the next world's unlock division.
  if (total === 0) return { mastered: 0, total: 0, pct: 0 };
  return { mastered, total, pct: Math.round((mastered / total) * 100) };
}

/** #1485 — ONE unlock-gap helper for every map/detail renderer. `ready` is true
 *  at exactly 0 remaining — the UI shows a distinct ready wordmark instead of
 *  clamping "master 1 more" (map) vs "ready" (detail) for the same gate. */
export function unlockGap(
  prog: { mastered: number; total: number },
  threshold: number = UNLOCK_THRESHOLD
): { needed: number; more: number; ready: boolean } {
  const needed = Math.ceil(prog.total * threshold);
  const more = Math.max(0, needed - prog.mastered);
  return { needed, more, ready: more === 0 };
}

/** Total learnable units in the whole journey — the "Y" in "X mastered / Y".
 *  Subject filters (parent controls) are honoured, exactly like the old count.
 *  #1120 — O(1) off the cached unit group. */
export function progressUnitCount(): number {
  return gameUnits.length;
}

/** #1120 — mastered-unit count for MANY kids in one pass over the cached unit
 *  groups (instead of N kids × the old full-catalog re-filter per call).
 *  Returns a Map<kidId, count>; every kid in the list gets an entry. */
export function masteredCounts(skills: SkillMap, kidIds: string[]): Map<string, number> {
  const out = new Map<string, number>(kidIds.map((id) => [id, 0]));
  for (const u of gameUnits) {
    for (const kidId of kidIds) {
      if (unitMasteredFrom(skills, kidId, u)) out.set(kidId, (out.get(kidId) ?? 0) + 1);
    }
  }
  return out;
}

/** Learnable units in one band from the FULL catalog — the parent syllabus shows
 *  every planned lesson even for filtered-out subjects, so it counts unfiltered. */
export function progressUnitsInBand(band: number): number {
  return new Set(SKILLS.filter((s) => s.band === band && s.game).map((s) => s.family ?? `__${s.id}`)).size;
}

/** EN/BN title of a skill's family — lets the UI group tier cards under ONE
 *  concept name instead of repeating "Add to 20" four times. */
export function familyTitle(skill: Skill, lang: Lang): string {
  if (skill.family) {
    const f = getFamily(skill.family);
    if (f) return lang === "bn" ? f.titleBn : f.title;
  }
  return lang === "bn" ? skill.titleBn ?? skill.title : skill.title;
}

/** #1071/#1072 — one EN/BN title helper for every catalog card (the card
 *  layers used to repeat `lang === "bn" ? titleBn ?? title : title` inline,
 *  so a Bengali card could silently fall back to an English title). */
export function skillTitle(skill: Skill, lang: Lang): string {
  return lang === "bn" ? skill.titleBn ?? skill.title : skill.title;
}

/** #1071/#1072 — one EN/BN description helper for every catalog card, so
 *  journey stops, skill trees and mastery rows all say WHAT the game teaches. */
export function skillDesc(skill: Skill, lang: Lang): string {
  return lang === "bn" ? skill.descriptionBn ?? skill.description ?? "" : skill.description ?? "";
}

/** World emblem emoji — matches the game's SVG assets (see svgs.ts WORLDS). */
export function worldEmoji(key: string): string {
  switch (key) {
    case "sprout-grove": return "🌱";
    case "cottage-fields": return "🐄";
    case "river-town": return "🏞️";
    case "sky-castle": return "🏰";
    case "star-academy": return "🚀";
    case "jungle-canopy": return "🌴";
    case "polar-peaks": return "❄️";
    case "summit-peaks": return "⛰️";
    default: return "⭐";
  }
}

/* ── World map palette (WORLD_LANDS): moved to ./journeyConfig (#883). */

/** Worlds unlock by PROGRESS, not age — beat the previous world to open the next.
 *  The parent's difficulty cap overrides everything: worlds above the cap are locked. */
export function worldUnlocked(skills: SkillMap, kidId: string, band: number): boolean {
  if (filterMaxBand != null && band > filterMaxBand) return false;
  if (band <= 1) return true;
  const prev = worldProgress(skills, kidId, band - 1);
  // #1484 — a zero-unit previous band is "nothing left to master", so it must
  // not divide by the old clamped 1 and block the next world.
  if (prev.total === 0) return true;
  return prev.mastered / prev.total >= UNLOCK_THRESHOLD;
}

/** #1164 — the intermediate land boss appears once a land is HALF-mastered
 *  (≥50% progress). Pure fn of the same worldProgress aggregate the map uses. */
export function landBossUnlocked(skills: SkillMap, kidId: string, band: number): boolean {
  return worldProgress(skills, kidId, band).pct >= 50;
}

/** #1164 — whether this kid has already beaten this land's intermediate boss. */
export function landBossBeaten(nova: { bosses?: number[] } | null | undefined, band: number): boolean {
  return !!nova?.bosses?.includes(band);
}

/** #1120 — O(units) over the cached unit groups (was O(n²): re-filtering the
 *  whole 305-skill catalog + re-grouping units on every call, 13+ times/render). */
export function totalMastered(skills: SkillMap, kidId: string): number {
  let n = 0;
  for (const u of gameUnits) {
    if (unitMasteredFrom(skills, kidId, u)) n++;
  }
  return n;
}

/* ────────────────────────────── learning journey ──────────────────────────────
 * The whole app is ONE path: every playable lesson is a stop, in world order.
 * A stop unlocks when the stop right before it is mastered → linear, no
 * age-gating, no dead-ends. The journey screen is the kid's map. */

export interface JourneyStop {
  skill: Skill;
  done: boolean;
  unlocked: boolean;
  current: boolean;
}

/** #1122 — playable stops, cached at buildGameUnits time (see journeyStopList).
 *  No longer re-filters the whole catalog on every call. */
export function journeyStops(): Skill[] {
  return journeyStopList;
}

export function journeyState(skills: SkillMap, kidId: string): JourneyStop[] {
  let prevDone = true;
  return journeyStops()
    .filter((skill) => filterMaxBand == null || skill.band <= filterMaxBand)
    .map((skill) => {
      const done = skillMastered(skills, kidId, skill.id);
      const unlocked = prevDone;
      prevDone = done;
      return { skill, done, unlocked, current: unlocked && !done };
    });
}

export function journeyCurrentIndex(stops: JourneyStop[]): number {
  const i = stops.findIndex((s) => s.current);
  return i < 0 ? stops.length : i;
}

/* ────────────────────────────── mastery card album ──────────────────────────────
 * Every mastered lesson = a collectible trading card. Full-world mastery =
 * a golden Champion card. Locked cards stay visible (the hunt) — dimmed, 🔒.
 * The card "mastered date" is the skill's last practice time (the closest
 * honest moment the store records; not shown for cards earned before the
 * album existed). */

/** "5 Aug 2026" / "৫ আগস্ট ২০২৬" — the card's mastered-date stamp. */
export function cardDate(ts: number, lang: Lang): string {
  const d = new Date(ts);
  if (lang === "bn") return `${bnNum(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${bnNum(d.getFullYear())}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One collectible — mastered + all the flip-side stats. */
export interface CardSkill {
  skill: Skill;
  mastered: boolean;
  dateMs: number | null;
  accuracy: number; // 0–100
  attempts: number;
  streak: number;
}

export function worldCards(skills: SkillMap, kidId: string, band: number): CardSkill[] {
  return journeyStops()
    .filter((s) => s.band === band)
    .map((skill) => {
      const st = skills[`${kidId}:${skill.id}`];
      const mastered = !!st && st.pMastered >= masteryThresholdFor(skill.id);
      const attempts = st?.attempts ?? 0;
      return {
        skill,
        mastered,
        dateMs: mastered ? (st?.lastPractice ?? null) : null,
        accuracy: attempts > 0 ? Math.round(((st?.correct ?? 0) / attempts) * 100) : 100,
        attempts,
        streak: st?.streak ?? 0,
      };
    });
}

/** Subject → trading-card gradient (SUBJECT_CARD): moved to ./journeyConfig (#883). */

/** The single "next thing" a kid should play — the first unmastered journey
 *  stop (world order). When the whole journey is done, replay the very first
 *  stop so there's ALWAYS something to play. This is what the home PLAY button
 *  starts — one tap, no choices, the app picks for the child. */
export function recommendedSkill(skills: SkillMap, kidId: string): Skill | undefined {
  const stops = journeyState(skills, kidId);
  // #257 — focus pin leads the journey: the pinned subject+world's next
  // unlocked stop plays first (falls back to the normal path if it's done).
  if (filterFocusSubject && filterFocusBand) {
    const focus = stops.find(
      (s) => s.unlocked && !s.done && s.skill.subject === filterFocusSubject && s.skill.band === filterFocusBand
    );
    if (focus) return focus.skill;
  }
  const cur = stops.find((s) => s.current);
  if (cur) return cur.skill;
  // #1131 — no unmastered next step pressing: offer a mastered EXPERT skill as
  // a 'beat your best' challenge replay (deterministic via weekNumber) instead
  // of only ever pointing forward. A fully-mastered skill has a replay affordance.
  const experts = stops.filter((s) => s.done && challengeEligible(skills, kidId, s.skill.id));
  if (experts.length) return experts[weekNumber() % experts.length].skill;
  return stops[0]?.skill;
}

/** #100 — skill-of-the-week: a deterministic, OFFLINE week index. Anchored to
 *  Sun 2026-01-04; every Monday rolls to the next week. Same week number for
 *  every device — the rotation needs no server. */
export function weekNumber(d: Date = new Date()): number {
  const anchor = Date.UTC(2026, 0, 4); // a Sunday
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - anchor) / (7 * 86400e3));
}

/** #100 — the weekly highlight: cycles one skill per week through the kid's
 *  RECOMMENDED (unmastered) journey stops, deterministic + offline. When the
 *  whole journey is done it rotates the full path so there's always a focus. */
export function skillOfWeek(skills: SkillMap, kidId: string): Skill | undefined {
  const stops = journeyState(skills, kidId);
  if (stops.length === 0) return undefined;
  const pending = stops.filter((s) => !s.done);
  const pool = pending.length > 0 ? pending : stops;
  return pool[weekNumber() % pool.length].skill;
}

export function modeForSkill(skill: Skill): SessionStep["mode"] {
  // #1169 — the scene variant is DATA on the skill (sub-within-10/20 → "sub",
  // bn-benjonborno → "consonants", bn-family-words → "family", bn-conjuncts →
  // "conjuncts"), read here instead of a hardcoded skill-id map. A new variant
  // is one dataMode field in packages/core, not a code branch.
  // #1142 — ArcadeCatch is always the fast-round variant of a fact drill, so
  // its scene gets mode:"fast" regardless of the shared dataMode field.
  if (skill.game === "game-arcadecatch") return "fast";
  return skill.dataMode;
}

export function stepForSkill(skill: Skill, challenge = false): SessionStep {
  const gameId = skill.game!;
  return {
    skillId: skill.id,
    gameId,
    scene: GAME_SCENES[gameId],
    title: skill.title,
    mode: modeForSkill(skill),
    // #1130/#1131 — a mastered EXPERT skill re-enters as a post-mastery
    // challenge replay (top rung + challenge flag) instead of vanishing.
    challenge,
    // First exposure to + or − → the kid gets the narrated Basket Math demo
    // round first, so the symbol means "put together / take away" before they
    // ever face an abstract drill. (Replay sessions re-teach — harmless.)
    teach: skill.id === "add-within-10" || skill.id === "sub-within-10" || skill.id === "add-within-20" || skill.id === "sub-within-20",
  };
}

/** #1123 — Moni's plan cache. moniPlanFor() folded two 305-entry maps (mastery
 *  + catalog) and ran the full moni.plan() algorithm on EVERY call — and it's
 *  called per step-start (moniLevelIndex→adaptiveLevelIndex, App.tsx:1763) and
 *  per render (parent panel + done screen). The plan only depends on
 *  (kidId, skills, moniWrongStreak, Moni profile, strictness, now) — so cache
 *  the RESULT on those store refs + a 60s bucket. Within a session step all
 *  callers share ONE plan; a store change (new round) or a minute rollover
 *  rebuilds it. */
let moniPlanCacheKey = "";
let moniPlanCacheRefs: [unknown, unknown, unknown, unknown] | null = null;
let moniPlanCacheResult: ReturnType<typeof moni.plan> | null = null;

/** 🧠 MONI — the child's next move, from the tiny tutor.
 *  Returns Moni's plan (focus skill, difficulty, game, tone) once the kid has
 *  enough rounds for Moni to see a pattern (>= 4, same bar as the parent card).
 *  Falls back to null before that — the journey logic is the default until
 *  Moni earns its voice. */
export function moniPlanFor(kidId: string): ReturnType<typeof moni.plan> | null {
  const st = useKidStore.getState();
  const profile = st.moni[kidId];
  if (!profile || profile.totalRounds < 4) {
    moniPlanCacheKey = ""; // a reset/ineligible profile must never reuse a stale plan
    return null;
  }

  // Fast path: same kid + same minute + identical store refs → reuse the plan.
  // #1050 — undefined (NOT "steady") when no parent choice: planner.ts then uses
  // Moni's OWN automatic tone (fragile→gentle / sharp→challenging / else
  // steady). The old `?? "steady"` pinned every fresh device to steady and
  // silently overrode the auto read.
  const strictness = st.moniStrictness?.[kidId];
  // #1047 — per-skill difficulty offsets (parent subject steppers #1044, kid's
  // too-easy/too-hard #1048). Folded into the cache key so a delta change
  // rebuilds the plan within the same minute.
  const skillDeltas = st.moniSkillDeltas?.[kidId];
  const refs: [unknown, unknown, unknown, unknown] = [st.skills, st.moniWrongStreak, profile, strictness];
  const key = `${kidId}:${Math.floor(Date.now() / 60_000)}:${JSON.stringify(skillDeltas ?? {})}`;
  if (moniPlanCacheKey === key && moniPlanCacheRefs && moniPlanCacheRefs.every((r, i) => r === refs[i])) {
    return moniPlanCacheResult;
  }

  // Mastery map for every skill the app knows about (pMastered + streak +
  // wrongStreak + lastPractice) — what Moni plans against. lastPractice feeds
  // the confidence-based review schedule (#328).
  const mastery: Record<string, { pMastered: number; streak: number; correct: number; attempts: number; wrongStreak: number; lastPractice: number | null }> = {};
  for (const s of filterSkills) {
    const key = `${kidId}:${s.id}`;
    const skill = st.skills[key];
    if (!skill) continue;
    mastery[s.id] = {
      pMastered: skill.pMastered,
      streak: skill.streak ?? 0,
      correct: skill.correct ?? 0,
      attempts: skill.attempts ?? 0,
      wrongStreak: st.moniWrongStreak[key] ?? 0,
      lastPractice: skill.lastPractice ?? null,
    };
  }
  // Catalog: every skill the app can actually teach, with its game.
  const catalog: Record<string, { id: string; band: number; game: string; dependsOn?: string[] }> = {};
  for (const s of filterSkills) {
    if (!s.game) continue;
    catalog[s.id] = { id: s.id, band: s.band, game: s.game };
  }
  try {
    // Parent-set strictness (#333) shapes Moni's tone + difficulty deltas.
    // #1050 — when never set it stays undefined so the planner uses Moni's own
    // automatic read (NOT pinned steady). `now` is passed explicitly so the
    // review-due computation is deterministic.
    const plan = moni.plan(profile, mastery, catalog, DEFAULT_MONI_PARAMS, strictness, Date.now(), skillDeltas);
    moniPlanCacheKey = key;
    moniPlanCacheRefs = refs;
    moniPlanCacheResult = plan;
    return plan;
  } catch {
    // A malformed profile must never break the session loop. Cache the null for
    // the minute too — it can't self-heal within a store snapshot.
    moniPlanCacheKey = key;
    moniPlanCacheRefs = refs;
    moniPlanCacheResult = null;
    return null;
  }
}

/** 🧠 MONI difficulty — the level index Moni wants for a skill (from its plan).
 *  Moni's difficulty is an absolute 1–5 (mastery tier + delta); we normalize it
 *  into the game's own level array. Returns -1 when Moni has no opinion. */
export function moniLevelIndex(kidId: string, skillId: string, gameId: string): number {
  const plan = moniPlanFor(kidId);
  if (!plan || plan.focusSkillId !== skillId) return -1;
  const game = getGame(gameId);
  if (!game || game.difficultyLevels.length === 0) return -1;
  // #1170 — map Moni's 1–5 tier onto the SKILL's own ladder length when the
  // skill carries dataLevels (a band-6 skill's ladder is shorter/narrower than
  // the shared game ladder — the tier must clamp inside ITS range, not the
  // band-3 partner's). Fall back to the game ladder when no narrower range.
  const ladder = getSkill(skillId)?.dataLevels ?? game.difficultyLevels;
  // Map Moni's 1–5 tier onto the ladder's ascending levels (tier 3 of 5 → the
  // middle level). Clamp so it can never leave the skill's range.
  const t = Math.min(1, Math.max(0, (plan.difficulty - 1) / 4));
  const idx = Math.round(t * (ladder.length - 1));
  return Math.min(Math.max(idx, 0), ladder.length - 1);
}

/** 🧠 MONI-guided session — Moni's focus skill leads the pool when it has an
 *  opinion (else the classic journey order: struggled-first, then fresh). */
export function sessionForWorld(skills: SkillMap, kidId: string, band: number): SessionStep[] {
  const ordered = filterSkills.filter((s) => s.band === band && s.game).map((s) => stepForSkill(s));
  const unmastered = ordered.filter((st) => !skillMastered(skills, kidId, st.skillId));
  const pool = unmastered.length ? unmastered : ordered;
  const mistakes = useKidStore.getState().mistakes;
  const struggled = (st: SessionStep) => (mistakes[`${kidId}:${st.skillId}`]?.wrong ?? 0) > 0;
  // #1130/#1133 — post-mastery challenge replays: mastered EXPERT skills
  // (pMastered ≥ 0.92) re-enter the pool at the TOP rung with the challenge
  // flag. A 0.8–0.91 mastered skill stays OUT (Moni's spaced review keeps it
  // warm) — so 1.0 genuinely plays harder than 0.8, and mastered never means
  // gone. Exactly one expert replay closes the session when any exists.
  const expertSteps = ordered
    .filter((st) => challengeEligible(skills, kidId, st.skillId))
    .map((st) => stepForSkill(getSkill(st.skillId)!, true));
  // #1400 — a fully-mastered world is a 'beat your best' replay, not a flat
  // re-sweep: fill the session with the mastered EXPERT challenge steps. When
  // a world has no experts yet, keep the old all-skills sweep so the button
  // still has a safe practice path.
  if (unmastered.length === 0) {
    return expertSteps.length ? expertSteps.slice(0, SESSION_LEN) : ordered.slice(0, SESSION_LEN);
  }
  const finish = (arr: SessionStep[]): SessionStep[] => {
    if (!expertSteps.length) return arr.slice(0, SESSION_LEN);
    const others = arr.filter((st) => !st.challenge);
    return [...others.slice(0, SESSION_LEN - 1), ...expertSteps].slice(0, SESSION_LEN);
  };

  // MONI: if the tutor has a recommended skill in THIS band, it leads the queue
  // (it already accounts for gaps + misconceptions + review timing).
  const plan = moniPlanFor(kidId);
  if (plan && plan.focusSkillId) {
    const focus = pool.find((st) => st.skillId === plan.focusSkillId);
    if (focus) {
      const rest = pool.filter((st) => st.skillId !== plan.focusSkillId);
      return finish([focus, ...rest.filter(struggled), ...rest.filter((st) => !struggled(st))]);
    }
  }
  // #257 — focus pin: inside the pinned world, the pinned subject's unmastered
  // skills lead (Moni still outranks this, so the tutor's call wins above).
  if (filterFocusSubject && filterFocusBand === band) {
    const focused = pool.filter((st) => subjectForSkill(st.skillId) === filterFocusSubject);
    const rest = pool.filter((st) => subjectForSkill(st.skillId) !== filterFocusSubject);
    return finish([...focused, ...rest.filter(struggled), ...rest.filter((st) => !struggled(st))]);
  }
  return finish([...pool.filter(struggled), ...pool.filter((st) => !struggled(st))]);
}

export function nextUnmasteredSkill(skills: SkillMap, kidId: string, band: number): Skill | undefined {
  return filterSkills.find((s) => s.band === band && s.game && !skillMastered(skills, kidId, s.id));
}

/** Adaptive starting level index for a kid + skill, from their BKT mastery state.
 *  🧠 MONI overrides when it has a plan for this skill: the tutor's difficulty
 *  tier beats the raw BKT ramp (it already accounts for gaps/misconceptions and
 *  review timing). Falls back to BKT when Moni has no opinion. */
export function adaptiveLevelIndex(kidId: string, skillId: string, gameId: string): number {
  const moniIdx = moniLevelIndex(kidId, skillId, gameId);
  if (moniIdx >= 0) return moniIdx;
  const game = getGame(gameId);
  if (!game) return 0;
  // #1170 — band-pair skills carry their OWN ladder (dataLevels); the adaptive
  // ramp must be computed against THAT ladder, not the shared game ladder, or
  // a band-6 skill would start at a level that belongs to the band-3 partner.
  const ladder = getSkill(skillId)?.dataLevels ?? game.difficultyLevels;
  const state = useKidStore.getState().skillFor(kidId, skillId);
  const target = nextDifficulty(state, ladder, game.targetSuccess);
  const idx = ladder.indexOf(target);
  return idx < 0 ? 0 : idx;
}

// #1218 — kids are read at boot (3×: kids state, active-kid resolver, and the
// screen initializer). Parse nv_kids ONCE and memoize; writers must call
// invalidateKidsCache() so a later read re-parses (kept as an export so App.tsx
// can refresh after addKid/avatar writes).
let kidsCache: Kid[] | null = null;

export function loadKids(): Kid[] {
  if (kidsCache) return kidsCache;
  // #818 — parse once, guard the storage read, and shape-check every entry so
  // a tampered/corrupt nv_kids blob can never surface as a non-Kid object.
  try {
    const raw = localStorage.getItem("nv_kids");
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    kidsCache = Array.isArray(parsed)
      ? parsed
          .filter((k): k is Record<string, unknown> => typeof k === "object" && k !== null && !Array.isArray(k))
          .filter((k) => typeof k.id === "string" && typeof k.name === "string")
          .map((k) => ({
            id: k.id as string,
            name: k.name as string,
            avatar: typeof k.avatar === "string" ? k.avatar : "🦉",
            birthYear: typeof k.birthYear === "number" && k.birthYear > 0 ? k.birthYear : new Date().getFullYear(),
            ...(typeof k.birthMonth === "number" ? { birthMonth: k.birthMonth } : {}),
            ...(typeof k.birthDay === "number" ? { birthDay: k.birthDay } : {}),
            ...(typeof k.avatarParts === "object" && k.avatarParts !== null && !Array.isArray(k.avatarParts)
              ? { avatarParts: k.avatarParts as Kid["avatarParts"] }
              : {}),
          }))
      : [];
  } catch {
    /* ignore */
    kidsCache = [];
  }
  return kidsCache;
}

export function invalidateKidsCache(): void {
  kidsCache = null;
}
