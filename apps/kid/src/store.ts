import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  observe,
  decay,
  initialSkillState,
  DEFAULT_PARAMS,
  moni,
  DEFAULT_MONI_PARAMS,
  type SkillState,
  type MoniProfile,
  type MoniStrictness,
  type ErrorKind,
  fingerprintAnswer,
} from "@numberverse/core";
import { waterGarden, masteryPlant, emptyGarden, type GardenState } from "./game/garden";

export interface RoundResult {
  gameId: string;
  skillId: string;
  correct: boolean;
  difficulty: number;
  responseMs: number;
}

/** A round queued for server sync — durable outbox (persisted) so nothing is
 *  lost when the kid plays offline. kidId + ts attach context the RoundResult
 *  doesn't carry; uid lets the sync drain precisely the events it posted. */
export interface SyncEvent extends RoundResult {
  uid: string;
  kidId: string;
  ts: number;
}

/** 📚 A KOTHA (কথা) learning moment — the RAG knowledge lake outbox.
 *  Every meaningful round (Moni's diagnosis included) is queued here and
 *  drained to POST /stories, exactly like `pending` drains to /progress.
 *  Today these stories feed Moni's per-kid plans; later they become the
 *  retrieval corpus for the big move. */
export interface KothaStory {
  uid: string;
  kidId: string; // LOCAL kid id — mapped to a server kid at sync time
  skillId: string;
  gameId: string;
  outcome: boolean;
  /** Moni's classification (null for correct rounds). */
  errorKind: ErrorKind | null;
  misconceptionCode: string | null;
  /** The Moni action type taken this round. */
  action: string | null;
  difficulty: number;
  responseMs: number;
  wrongStreak: number;
  /** Free envelope — reason/message/tts/source. */
  context: Record<string, unknown>;
  ts: number;
}

/** Live indicator of the background sync (for the home/parent screens). */
export type SyncState = "idle" | "syncing" | "ok" | "offline" | "error";

function genUid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* older webviews */
  }
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Lifetime per-kid totals (across sessions) — feeds the Parent Panel. */
export interface KidStats {
  stars: number;
  score: number;
  sessions: number;
}

/* ────────────────────────────── Nova companion economy ────────────────────────────── */

export interface NovaOutfit {
  id: string;
  emoji: string;
  name: string;
  nameBn: string;
  cost: number;
  kind: "scarf" | "tunic" | "cape" | "hat" | "glasses" | "bow" | "boots" | "backpack";
  /** #278 — limited seasonal set this outfit belongs to (festival key from the
   *  locale pack, e.g. "eid_fitr" / "boishakh"). Only purchasable while that
   *  festival is active in the current locale — pure config (#131), so another
   *  country's festival = one entry, not a rewrite. */
  festival?: string;
}

export const NOVA_OUTFITS: NovaOutfit[] = [
  { id: "scarf", emoji: "🧣", name: "Cozy Scarf", nameBn: "শীতের মাফলার", cost: 5, kind: "scarf" },
  { id: "panjabi", emoji: "🇧🇩", name: "Panjabi", nameBn: "পাঞ্জাবি", cost: 15, kind: "tunic" },
  { id: "cape", emoji: "🦸", name: "Hero Cape", nameBn: "হিরো কেপ", cost: 30, kind: "cape" },
  { id: "hat", emoji: "🎩", name: "Party Hat", nameBn: "পার্টি টুপি", cost: 8, kind: "hat" },
  { id: "glasses", emoji: "🕶️", name: "Cool Shades", nameBn: "চশমা", cost: 10, kind: "glasses" },
  { id: "bow", emoji: "🎀", name: "Cute Bow", nameBn: "ফিতে", cost: 6, kind: "bow" },
  { id: "boots", emoji: "🥾", name: "Adventure Boots", nameBn: "বুট জুতা", cost: 12, kind: "boots" },
  { id: "backpack", emoji: "🎒", name: "School Bag", nameBn: "ব্যাগ", cost: 20, kind: "backpack" },
  // #278 — limited seasonal sets (festival-gated). Reuse existing body kinds
  // (tunic/hat/bow) so Nova wears them without new texture code; the card emoji
  // + name carry the festival look. Availability is config from the locale pack.
  { id: "eid-panjabi", emoji: "👔", name: "Eid Panjabi", nameBn: "ঈদের পাঞ্জাবি", cost: 25, kind: "tunic", festival: "eid_fitr" },
  { id: "eid-topi", emoji: "🧢", name: "Eid Prayer Cap", nameBn: "ঈদের টুপি", cost: 20, kind: "hat", festival: "eid_fitr" },
  { id: "boishakh-sharee", emoji: "🥻", name: "Boishakh Sharee", nameBn: "বৈশাখের শাড়ি", cost: 30, kind: "tunic", festival: "boishakh" },
  { id: "boishakh-fan", emoji: "🪭", name: "Boishakh Fan", nameBn: "বৈশাখের পাখা", cost: 20, kind: "bow", festival: "boishakh" },
];

/** Max coins a kid can earn from games in one calendar day (anti-grind). */
export const NOVA_DAILY_CAP = 20;
export const NOVA_COINS_PER_ROUND = 1;
export const NOVA_COINS_PER_SESSION = 3;
export const NOVA_DAILY_BONUS = 2;
export const NOVA_CARE_GAIN = 5;
/** Daily coin reward for feeding/playing with Nova (once each, within the cap). */
export const NOVA_CARE_COINS = 1;
/** Daily Quest — play NOVA_QUEST_TARGET rounds in one calendar day to win a bonus. */
export const NOVA_QUEST_TARGET = 3;
export const NOVA_QUEST_REWARD = 5;
/** #281 — 7-day login calendar: growing coin bonuses for consecutive play days.
 *  Every reward sits inside the daily anti-grind cap (NOVA_DAILY_CAP). */
export const NOVA_CALENDAR_REWARDS = [3, 4, 5, 6, 7, 8, 10] as const;
/** Position (1..7) in the 7-day login cycle for a given streak length. */
export function calendarCycleDay(streak: number): number {
  return streak > 0 ? ((streak - 1) % NOVA_CALENDAR_REWARDS.length) + 1 : 1;
}
/** Birthday gift — Nova's once-a-year treat (a real bonus, so it bypasses the daily cap). */
export const NOVA_BIRTHDAY_COINS = 10;
/** Share reward — a parent sharing the kid's progress to WhatsApp pays the kid
 *  +NOVA_SHARE_REWARD coins (once per calendar day, like a quest bonus). The
 *  share loop feels good to the actual user, not just the parent. */
export const NOVA_SHARE_REWARD = 5;
/* ── The kid's pet: an egg that hatches and grows as they learn ── */
export const PET_GROW_SESSION = 0.25; // each completed session
export const PET_GROW_MASTERY = 0.3; // each newly mastered skill
export const PET_GROW_FEED = 0.2; // feeding it, once daily
export const PET_MAX_STAGE = 3; // 0 egg → 1 hatch → 2 young → 3 grown (per species)

/** #19 — unlockable pet species. The default owl is free; the rest are adopted
 *  once a pet GROWTH MILESTONE is reached AND bought with coins in the pet
 *  sheet (each has its own egg→grown evolution). Stages align with
 *  PET_MAX_STAGE (0..3). */
export interface NovaSpecies {
  id: string;
  name: string;
  nameBn: string;
  cost: number; // coins to adopt (owl = 0, the starter)
  /** Pet growth stage (0..3) that must be reached before this species unlocks. */
  unlockStage: number; // 0 = always available
  /** Evolution emoji per petStage 0..3. */
  stages: readonly [string, string, string, string];
}

export const NOVA_SPECIES: NovaSpecies[] = [
  { id: "owl", name: "Owl", nameBn: "প্যাঁচা", cost: 0, unlockStage: 0, stages: ["🥚", "🐣", "🦉", "🦉"] },
  { id: "cat", name: "Cat", nameBn: "বিড়াল", cost: 40, unlockStage: 1, stages: ["🥚", "🐱", "🐈", "🐈‍⬛"] },
  { id: "peacock", name: "Peacock", nameBn: "ময়ূর", cost: 80, unlockStage: 2, stages: ["🥚", "🐤", "🐓", "🦚"] },
  { id: "dragon", name: "Dragon", nameBn: "ড্রাগন", cost: 120, unlockStage: 3, stages: ["🥚", "🐲", "🐲", "🐉"] },
];

export function speciesById(id: string): NovaSpecies {
  return NOVA_SPECIES.find((s) => s.id === id) ?? NOVA_SPECIES[0];
}

/** The pet's face for a species at a growth stage (clamped to 0..3). */
export function speciesEmoji(speciesId: string, stage: number): string {
  const sp = speciesById(speciesId);
  return sp.stages[Math.max(0, Math.min(3, stage))];
}

/** 📚 KOTHA offline-queue quota (#334). A long offline stretch can't balloon
 *  storage past this many unsent learning stories. It's a HIGH-WATER MARK that
 *  triggers an eager drain — it never deletes: stories are only removed by
 *  `clearStories` AFTER the server confirms them (no data loss before drain). */
export const STORY_QUEUE_CAP = 300;

export interface NovaState {
  coins: number;
  totalEarned: number;
  owned: string[];
  equipped: string;
  /** Consecutive calendar days the kid completed a session. */
  streak: number;
  /** ISO dates ('YYYY-MM-DD') the kid played — feeds the 7-day calendar. */
  days: string[];
  /** Last ISO date a session completed (streak anchor). */
  lastDay: string;
  /** 0..100 — grows with feed/play care. */
  affection: number;
  /** Last ISO date the kid fed Nova (care actions reset daily). */
  fed: string;
  played: string;
  /** Coins earned today (capped at NOVA_DAILY_CAP). */
  earnedToday: number;
  earnDay: string;
  /** Daily Quest state — "play N rounds today" pays a bonus. */
  questDay: string;
  questRounds: number;
  questDone: boolean;
  /** Calendar year the birthday gift was last claimed ("" = never). */
  bdayYear: string;
  /** Last ISO date the parent shared this kid's progress (share reward, once/day). */
  shareDay: string;
  /** #281 — last ISO date the 7-day login calendar bonus was claimed ("" = never). */
  calendarDay: string;
  /** #283 — badge ids the kid has earned (union of BADGES conditions met so
   *  far). The conditions live in App.tsx (they read the skill catalog);
   *  the store only PERSISTS the earned set. */
  badges: string[];
  /** #277 — band ids whose land the kid fully mastered (trophy room). The
   *  condition (mastered === total) lives in App.tsx; the store persists the
   *  earned set so a NEW trophy can be celebrated exactly once. */
  trophies: number[];
  /** #284 — skill ids whose mastery mystery box has already been opened (the
   *  box appears on home for every mastered skill not in this list). */
  boxes: string[];
  /** The kid's pet — an egg that hatches + grows as they learn. */
  petStage: number; // 0 egg → 1 hatchling → 2 young → 3 grown (per species)
  petProgress: number; // 0..1 toward the next stage
  petFed: string; // last ISO date the pet was fed (once daily)
  /** #19 — pet species (owl = starter, free; others adopted with coins). */
  species: string;
}

export function defaultNova(): NovaState {
  return {
    coins: 0,
    totalEarned: 0,
    owned: [],
    equipped: "none",
    streak: 0,
    days: [],
    lastDay: "",
    affection: 0,
    fed: "",
    played: "",
    earnedToday: 0,
    earnDay: "",
    questDay: "",
    questRounds: 0,
    questDone: false,
    bdayYear: "",
    shareDay: "",
    calendarDay: "",
    badges: [],
    trophies: [],
    boxes: [],
    petStage: 0,
    petProgress: 0,
    petFed: "",
    species: "owl",
  };
}

/** Advance the pet's growth bar — the egg hatches, then the owl grows. */
function growPet(state: { petStage: number; petProgress: number }, amount: number): { petStage: number; petProgress: number } {
  // Defensive: kids whose nova entry was saved before the pet existed have no
  // pet fields yet — treat those as the starting egg.
  let { petStage = 0, petProgress = 0 } = state;
  petProgress = Math.min(1, petProgress + amount);
  while (petProgress >= 1 && petStage < PET_MAX_STAGE) {
    petStage += 1;
    petProgress = 0;
  }
  if (petStage >= PET_MAX_STAGE) petProgress = 1;
  return { petStage, petProgress };
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayIsoAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Wrong-answer ledger for one kid+skill. `open` is the count of wrongs not yet
 *  offset by a correct solve — the resolve-to-complete signal the session uses
 *  to refuse advancing until the kid has actually solved it. `byDay` (#78) is a
 *  per-calendar-day wrong-tap count (ISO 'YYYY-MM-DD' → count) that feeds the
 *  parent panel's wrong-answer history — local only, no analytics. */
export interface MistakeState {
  /** Lifetime wrong taps on this skill. */
  wrong: number;
  /** Unresolved wrongs — cleared when a correct round lands (addEvent(correct)). */
  open: number;
  firstAt: number;
  lastAt: number;
  lastDifficulty: number;
  /** Per-day wrong taps for the parent heatmap (#78). Keyed by ISO date. */
  byDay: Record<string, number>;
}

function initialMistake(now: number, difficulty: number): MistakeState {
  return { wrong: 0, open: 0, firstAt: now, lastAt: now, lastDifficulty: difficulty, byDay: {} };
}

interface KidState {
  score: number;
  stars: number;
  events: RoundResult[];
  /** Persisted outbox — every round, queued for server sync (offline-safe). */
  pending: SyncEvent[];
  /** 📚 KOTHA outbox — learning moments with Moni's diagnosis, drained to /stories. */
  stories: KothaStory[];
  /** Live sync indicator (transient, not persisted). */
  syncState: SyncState;
  /** Per-kid per-skill adaptive mastery state. Key `${kidId}:${skillId}`. */
  skills: Record<string, SkillState>;
  /** Wrong-answer ledger per kid+skill. Key `${kidId}:${skillId}`. */
  mistakes: Record<string, MistakeState>;
  /** Lifetime totals per kid. Key kidId. */
  stats: Record<string, KidStats>;
  /** Nova companion economy per kid. Key kidId. */
  nova: Record<string, NovaState>;
  /** Growth Garden per kid — correct answers water it, mastery plants flowers. */
  garden: Record<string, GardenState>;
  /** 🧠 MONI — the tiny per-child tutor profile. Key kidId. */
  moni: Record<string, MoniProfile>;
  /** Consecutive wrongs per kid+skill (for Moni diagnosis). Key `${kidId}:${skillId}`. */
  moniWrongStreak: Record<string, number>;
  /** 🧠 MONI parent-adjustable strictness (#333). Key kidId → gentle/steady/challenging.
   *  Persisted offline; Moni's plan() tone + difficulty respect it. */
  moniStrictness: Record<string, MoniStrictness>;
  /** Set how hard Moni pushes this kid (gentle / steady / challenging). */
  setMoniStrictness: (kidId: string, s: MoniStrictness) => void;
  /** 🎯 #325 — clear a misconception after a successful contrast drill. Warm
   *  resolution: the pattern is beaten, so Moni stops flagging it. */
  moniResolveMisconception: (kidId: string, skillId: string, code: string) => void;
  addEvent: (kidId: string, e: RoundResult) => void;
  clearPending: (uids: Set<string>) => void;
  /** Drop the Kotha stories that were just posted (by uid). */
  clearStories: (uids: Set<string>) => void;
  setSyncState: (s: SyncState) => void;
  skillFor: (kidId: string, skillId: string) => SkillState;
  /** 🧠 MONI profile for a kid (empty profile if never seen). */
  moniFor: (kidId: string) => MoniProfile;
  /** A wrong tap happened for this kid+skill → bumps wrong + open. Called by the
   *  wrongLedger (hooked into hintWrong), so every drill scene reports
   *  automatically. */
  recordWrong: (kidId: string, skillId: string, gameId: string, difficulty: number, correct?: unknown, wrong?: unknown) => void;
  recordSession: (kidId: string) => void;
  reset: () => void;
  novaAwardRound: (kidId: string, correct: boolean) => void;
  novaCompleteSession: (kidId: string) => void;
  /** #278 — `festivalKey` is the current locale's active festival (null
   *  off-season). Seasonal outfits are only purchasable while their festival
   *  is active — enforced here so a tampered client can't buy off-season. */
  novaBuy: (kidId: string, outfitId: string, festivalKey: string | null) => void;
  novaEquip: (kidId: string, outfitId: string) => void;
  novaCare: (kidId: string, action: "feed" | "play") => void;
  /** Every completed round counts toward today's Daily Quest. Returns true the
   *  moment the quest completes (so the caller can celebrate once). */
  novaQuestRound: (kidId: string) => boolean;
  /** #281 — claim today's 7-day login-calendar bonus (once per day, after the
   *  day's first session, inside the daily cap). Returns coins granted (0 = none). */
  novaClaimCalendar: (kidId: string) => number;
  /** #283 — persist the currently-earned badge ids; returns the NEWLY-earned
   *  subset (so the UI can celebrate each once). */
  novaSyncBadges: (kidId: string, earned: string[]) => string[];
  /** #277 — persist the currently-earned land trophy band-ids; returns the
   *  NEWLY-earned subset (so the UI can celebrate each once). */
  novaSyncTrophies: (kidId: string, earned: number[]) => number[];
  /** #284 — open the next unclaimed mastery mystery box. Coins stay inside the
   *  daily anti-grind cap (cap-full → the box waits for another day; no real
   *  money, kid-safe). Returns { skillId, coins } — skillId null = no boxes. */
  novaOpenBox: (kidId: string, unclaimed: string[]) => { skillId: string | null; coins: number };
  /** A parent shared this kid's progress → +NOVA_SHARE_REWARD coins, once per
   *  calendar day. Returns true when the reward was actually granted. */
  novaShareReward: (kidId: string) => boolean;
  /** Water the kid's garden with one correct answer. */
  gardenWater: (kidId: string) => void;
  /** A skill was just mastered → plant its trophy flower. */
  gardenMastery: (kidId: string, skillId: string, title: string) => void;
  /** Nova's birthday gift — claimable once per calendar year (a real bonus, bypasses the daily cap). */
  novaBirthday: (kidId: string) => void;
  /** The pet takes a bigger step when a skill is newly mastered. */
  petGrowMastery: (kidId: string) => void;
  /** Feed the pet — grows it once per calendar day. */
  petFeed: (kidId: string) => void;
  /** #19 — adopt a pet species (costs coins; owl is free/the starter). */
  petAdopt: (kidId: string, speciesId: string) => void;
  /** #9 — merge a server snapshot into the local store, newest-wins. Called on
   *  a SECOND device after the parent signs in, so a kid's progress "follows"
   *  them (aggregate mastery + coins only — never voice/face). The device with
   *  more accumulated corrects wins a skill; the wallet takes the max coins. */
  restoreSnapshot: (
    kidId: string,
    snap: {
      coins: number;
      mastery: Array<{ skillId: string; mastery: number; correct: number; attempts: number; streak: number }>;
    }
  ) => void;
}

const keyOf = (kidId: string, skillId: string) => `${kidId}:${skillId}`;

/**
 * Local-first adaptive store (P2):
 * - Each answer runs the BKT-lite observe() from core (with spaced-repetition decay).
 * - Per-kid per-skill mastery persists across reloads via zustand persist.
 * - score/stars/events are per-session (reset when a game starts).
 */
export const useKidStore = create<KidState>()(
  persist(
    (set, get) => ({
      score: 0,
      stars: 0,
      events: [],
      pending: [],
      stories: [],
      syncState: "idle",
      skills: {},
      mistakes: {},
      stats: {},
      nova: {},
      garden: {},
      moni: {},
      moniWrongStreak: {},
      moniStrictness: {},
      setMoniStrictness: (kidId, s) => {
        const prev = get().moniStrictness[kidId];
        if (prev === s) return {};
        return { moniStrictness: { ...(get().moniStrictness ?? {}), [kidId]: s } };
      },
      addEvent: (kidId, e) => {
        const now = Date.now();
        const prev = get().skills[keyOf(kidId, e.skillId)] ?? initialSkillState(kidId, e.skillId);
        const updated = observe(decay(prev, now), e.correct, DEFAULT_PARAMS, now);
        const prior = get().stats[kidId] ?? { stars: 0, score: 0, sessions: 0 };
        // 🧠 MONI — observe this round + update the kid's wrong streak.
        const moniPrev = get().moni[kidId] ?? moni.initial(kidId, now);
        const wrongStreak = e.correct ? 0 : (get().moniWrongStreak[keyOf(kidId, e.skillId)] ?? 0) + 1;
        const round = { kidId, skillId: e.skillId, gameId: e.gameId, correct: e.correct, difficulty: e.difficulty, responseMs: e.responseMs, timestamp: now };
        const moniNext = moni.observeRound(moniPrev, round, { ...prev, wrongStreak }, DEFAULT_MONI_PARAMS, now);
        // 📚 KOTHA — Moni's diagnosis of this round becomes a learning story.
        const diag = e.correct
          ? moni.diagnoseCorrect(moniPrev, round, { ...prev, wrongStreak }, DEFAULT_MONI_PARAMS)
          : moni.diagnose(moniPrev, round, { ...prev, wrongStreak }, wrongStreak, DEFAULT_MONI_PARAMS);
        const mis = moniNext.misconceptions?.find((m) => m.skillId === e.skillId);
        set((s) => {
          const mk = keyOf(kidId, e.skillId);
          // Resolve-to-complete: a CORRECT round clears the skill's open wrongs
          // (they're solved). A wrong round (rare today — scenes only report
          // completes) would add to them. The ledger keeps "open" so the
          // session refuses to advance until the kid has actually solved.
          const m0 = s.mistakes[mk] ?? initialMistake(now, e.difficulty);
          // #78 — normalize so every ledger entry carries byDay (pre-#78
          // persisted entries have no field; wrong taps land via recordWrong
          // which buckets them, but keep the shape honest here too).
          const mNorm: MistakeState = { ...m0, byDay: m0.byDay ?? {} };
          const mNext: MistakeState = e.correct
            ? { ...mNorm, open: 0 }
            : { ...mNorm, wrong: mNorm.wrong + 1, open: mNorm.open + 1, lastAt: now, lastDifficulty: e.difficulty };
          return {
            events: [...s.events, e],
            // durable outbox — survives reloads; the sync drains it online
            pending: [...s.pending, { uid: genUid(), kidId, ...e, ts: now }],
            // durable Kotha outbox — the story of this learning moment
            stories: [
              ...(s.stories ?? []),
              {
                uid: genUid(),
                kidId,
                skillId: e.skillId,
                gameId: e.gameId,
                outcome: e.correct,
                errorKind: e.correct ? null : diag.kind,
                misconceptionCode: mis?.code ?? null,
                action: diag.action.type,
                difficulty: e.difficulty,
                responseMs: e.responseMs,
                wrongStreak,
                context: { reason: diag.reason, message: diag.action.message },
                ts: now,
              },
            ],
            score: s.score + (e.correct ? e.difficulty : 0),
            stars: s.stars + (e.correct ? 1 : 0),
            skills: { ...s.skills, [mk]: updated },
            mistakes: { ...(s.mistakes ?? {}), [mk]: mNext },
            moni: { ...(s.moni ?? {}), [kidId]: moniNext },
            moniWrongStreak: { ...(s.moniWrongStreak ?? {}), [mk]: wrongStreak },
            stats: {
              ...s.stats,
              [kidId]: {
                stars: prior.stars + (e.correct ? 1 : 0),
                score: prior.score + (e.correct ? e.difficulty : 0),
                sessions: prior.sessions,
              },
            },
          };
        });
      },
      recordWrong: (kidId, skillId, gameId, difficulty, correct, wrong) => {
        const now = Date.now();
        const mk = keyOf(kidId, skillId);
        // 🧠 MONI — observe the wrong tap + track the wrong streak.
        const moniPrev = get().moni[kidId] ?? moni.initial(kidId, now);
        const wrongStreak = (get().moniWrongStreak[mk] ?? 0) + 1;
        const skill = get().skills[mk] ?? initialSkillState(kidId, skillId);
        const round = { kidId, skillId, gameId, correct: false, difficulty, responseMs: DEFAULT_MONI_PARAMS.slowMs, timestamp: now };
        let moniNext = moni.observeWrong(moniPrev, round, { ...skill, wrongStreak }, DEFAULT_MONI_PARAMS, now);
        // 🖐️ FINGERPRINT — cluster the wrong VALUE into a misconception code
        // ("picks 8 when 7 is right" → overcount-1) and log it into Moni's
        // misconception ledger once it repeats (misconcOccurrences=2), so the
        // diagnosis turns into a SPECIFIC contrast drill instead of a generic
        // "repeated error". Only numeric answers fingerprint — never strings.
        const fp = fingerprintAnswer(skillId, correct, wrong);
        if (fp && wrongStreak >= DEFAULT_MONI_PARAMS.misconcOccurrences) {
          moniNext = moni.recordMisconception(moniNext, skillId, fp.code, fp.label, now);
          // The generic "repeated-error" is now redundant — drop it so the
          // ledger names the real pattern only.
          moniNext = {
            ...moniNext,
            misconceptions: moniNext.misconceptions?.filter(
              (m) => !(m.skillId === skillId && m.code === "repeated-error"),
            ),
          };
        }
        // 📚 KOTHA — a wrong tap is a learning moment too (drill-scene struggle).
        // responseMs=0 marks it as a tap, not a scored round; slowMs fed to the
        // diagnosis keeps it from being misclassified as a "fast guess".
        const diag = moni.diagnose(moniNext, round, { ...skill, wrongStreak }, wrongStreak, DEFAULT_MONI_PARAMS);
        const mis = moniNext.misconceptions?.find((m) => m.skillId === skillId);
        // Prefer the SPECIFIC fingerprint code over the generic "repeated-error".
        const fpMis = fp ? moniNext.misconceptions?.find((m) => m.skillId === skillId && m.code === fp.code) : null;
        const misCode = fpMis?.code ?? mis?.code ?? null;
        set((s) => {
          const m = s.mistakes[mk] ?? initialMistake(now, difficulty);
          const day = todayIso();
          return {
            mistakes: {
              ...(s.mistakes ?? {}),
              [mk]: {
                wrong: m.wrong + 1,
                open: m.open + 1,
                firstAt: m.firstAt || now,
                lastAt: now,
                lastDifficulty: difficulty,
                byDay: { ...(m.byDay ?? {}), [day]: (m.byDay?.[day] ?? 0) + 1 }, // #78 heatmap bucket
              },
            },
            moni: { ...(s.moni ?? {}), [kidId]: moniNext },
            moniWrongStreak: { ...(s.moniWrongStreak ?? {}), [mk]: wrongStreak },
            stories: [
              ...(s.stories ?? []),
              {
                uid: genUid(),
                kidId,
                skillId,
                gameId,
                outcome: false,
                errorKind: diag.kind,
                misconceptionCode: misCode,
                action: diag.action.type,
                difficulty,
                responseMs: 0,
                wrongStreak,
                context: { reason: diag.reason, message: diag.action.message, source: "wrong-tap", fingerprint: fp?.code ?? null, wrongAnswer: typeof wrong === "number" ? wrong : null },
                ts: now,
              },
            ],
          };
        });
      },
      moniFor: (kidId) => get().moni[kidId] ?? moni.initial(kidId),
      moniResolveMisconception: (kidId, skillId, code) =>
        set((s) => {
          const prev = s.moni[kidId];
          if (!prev) return {};
          return { moni: { ...(s.moni ?? {}), [kidId]: moni.resolveMisconception(prev, skillId, code) } };
        }),
      clearPending: (uids) =>
        set((s) => (uids.size ? { pending: s.pending.filter((e) => !uids.has(e.uid)) } : s)),
      clearStories: (uids) =>
        set((s) => (uids.size ? { stories: (s.stories ?? []).filter((st) => !uids.has(st.uid)) } : s)),
      setSyncState: (syncState) => set({ syncState }),
      skillFor: (kidId, skillId) =>
        get().skills[keyOf(kidId, skillId)] ?? initialSkillState(kidId, skillId),
      recordSession: (kidId) =>
        set((s) => {
          const prior = s.stats[kidId] ?? { stars: 0, score: 0, sessions: 0 };
          // 🧠 MONI — a session ended: reset its round counter.
          const moniPrev = s.moni?.[kidId] ?? moni.initial(kidId);
          return {
            stats: { ...s.stats, [kidId]: { ...prior, sessions: prior.sessions + 1 } },
            moni: { ...(s.moni ?? {}), [kidId]: moni.endSession(moniPrev) },
          };
        }),
      reset: () => set({ score: 0, stars: 0, events: [] }),

      /* ── Nova economy: coins come from real learning, never ads or money ── */

      /** A correct round pays NOVA_COINS_PER_ROUND, capped by the daily cap. */
      novaAwardRound: (kidId, correct) => {
        if (!correct) return;
        const n = get().nova[kidId] ?? defaultNova();
        const today = todayIso();
        const earnedToday = n.earnDay === today ? n.earnedToday : 0;
        if (earnedToday >= NOVA_DAILY_CAP) return;
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          const todayEarned = cur.earnDay === today ? cur.earnedToday : 0;
          if (todayEarned >= NOVA_DAILY_CAP) return { nova: s.nova };
          const add = Math.min(NOVA_COINS_PER_ROUND, NOVA_DAILY_CAP - todayEarned);
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                coins: cur.coins + add,
                totalEarned: cur.totalEarned + add,
                earnedToday: todayEarned + add,
                earnDay: today,
              },
            },
          };
        });
      },

      /**
       * Session complete → session coins + a first-of-the-day bonus, and the
       * streak calendar updates. Losing a day resets the streak (gentle, no guilt).
       */
      novaCompleteSession: (kidId) => {
        const n = get().nova[kidId] ?? defaultNova();
        const today = todayIso();
        const earnedToday = n.earnDay === today ? n.earnedToday : 0;
        const newDay = n.lastDay !== today;
        const streak = newDay ? (n.lastDay === dayIsoAgo(1) ? n.streak + 1 : 1) : n.streak;
        const days = n.days.includes(today) ? n.days : [...n.days, today].slice(-90);
        const add = Math.max(0, Math.min(NOVA_COINS_PER_SESSION + (newDay ? NOVA_DAILY_BONUS : 0), NOVA_DAILY_CAP - earnedToday));
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                coins: cur.coins + add,
                totalEarned: cur.totalEarned + add,
                earnedToday: earnedToday + add,
                earnDay: today,
                streak,
                days,
                lastDay: today,
                ...growPet({ petStage: cur.petStage, petProgress: cur.petProgress }, PET_GROW_SESSION),
              },
            },
          };
        });
      },

      /** Newly mastered skill → the pet takes a big step (egg → hatch → owl). */
      petGrowMastery: (kidId) => {
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          return {
            nova: {
              ...s.nova,
              [kidId]: { ...cur, ...growPet({ petStage: cur.petStage, petProgress: cur.petProgress }, PET_GROW_MASTERY) },
            },
          };
        });
      },

      /** Feed the pet — once per calendar day (keeps the habit, not a grind). */
      petFeed: (kidId) => {
        const today = todayIso();
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          if (cur.petFed === today) return { nova: s.nova };
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                petFed: today,
                ...growPet({ petStage: cur.petStage, petProgress: cur.petProgress }, PET_GROW_FEED),
              },
            },
          };
        });
      },

      /** Adopt a pet species — owl is free (starter); others need a growth
       *  milestone reached AND coins. Adopting switches the pet's look. */
      petAdopt: (kidId, speciesId) => {
        const species = speciesById(speciesId);
        if (!species) return;
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          if (cur.species === speciesId) return { nova: s.nova };
          // Milestone gate: pet must have grown to the species' unlock stage.
          if (cur.petStage < species.unlockStage) return { nova: s.nova };
          // Coin gate: starter owl is free; the rest cost coins once.
          if (species.cost > 0 && cur.coins < species.cost) return { nova: s.nova };
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                species: speciesId,
                coins: species.cost > 0 ? cur.coins - species.cost : cur.coins,
              },
            },
          };
        });
      },

      /** #9 — restore a server snapshot (newest-wins). See the type doc. */
      restoreSnapshot: (kidId, snap) =>
        set((s) => {
          const skills = { ...s.skills };
          for (const m of snap.mastery) {
            if (m.correct <= 0) continue;
            const key = keyOf(kidId, m.skillId);
            const local = s.skills[key];
            // Newest-wins: the device with more accumulated corrects owns the
            // skill (the server is the sum of ALL devices' outboxes, so it wins
            // against a stale/fresh device but loses to a device that just played
            // and hasn't drained yet — that event catches up on the next sync).
            if (local && local.correct > m.correct) continue;
            skills[key] = {
              kidId,
              skillId: m.skillId,
              pMastered: Math.max(0, Math.min(1, m.mastery)),
              correct: m.correct,
              attempts: m.attempts,
              streak: m.streak,
              lastPractice: local?.lastPractice ?? Date.now(),
              lastDecay: Date.now(),
            };
          }
          // Wallet: keep the max (server may know a higher balance synced earlier).
          // Only touch nova when the balance actually improves or a record needs
          // creating — the skills merge above is the main event.
          const cur = s.nova[kidId];
          const nextCoins = Math.max(cur?.coins ?? 0, snap.coins);
          if (cur) {
            return { skills, nova: { ...s.nova, [kidId]: { ...cur, coins: nextCoins } } };
          }
          return snap.coins > 0
            ? { skills, nova: { ...s.nova, [kidId]: { ...defaultNova(), coins: snap.coins } } }
            : { skills };
        }),

      /** Buy an outfit — instantly wears it (instant gratification). */
      novaBuy: (kidId, outfitId, festivalKey) => {
        const outfit = NOVA_OUTFITS.find((o) => o.id === outfitId);
        if (!outfit) return;
        // #278 — seasonal outfits are locked outside their festival window.
        if (outfit.festival && outfit.festival !== festivalKey) return;
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          if (cur.owned.includes(outfitId) || cur.coins < outfit.cost) return { nova: s.nova };
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                coins: cur.coins - outfit.cost,
                owned: [...cur.owned, outfitId],
                equipped: outfitId,
              },
            },
          };
        });
      },

      /** Wear / take off an owned outfit. */
      novaEquip: (kidId, outfitId) =>
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          if (!cur.owned.includes(outfitId)) return { nova: s.nova };
          return {
            nova: {
              ...s.nova,
              [kidId]: { ...cur, equipped: cur.equipped === outfitId ? "none" : outfitId },
            },
          };
        }),

      /**
       * Feed or play with Nova — raises affection once per day per action, AND
       * pays a small daily coin (capped) so caring for Nova is its own little
       * daily reward loop (teaches a routine, stays inside the anti-grind cap).
       */
      novaCare: (kidId, action) =>
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          const today = todayIso();
          if (action === "feed" && cur.fed === today) return { nova: s.nova };
          if (action === "play" && cur.played === today) return { nova: s.nova };
          const earnedToday = cur.earnDay === today ? cur.earnedToday : 0;
          const add = Math.min(NOVA_CARE_COINS, Math.max(0, NOVA_DAILY_CAP - earnedToday));
          const affection = Math.min(100, cur.affection + NOVA_CARE_GAIN);
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                coins: cur.coins + add,
                totalEarned: cur.totalEarned + add,
                earnedToday: earnedToday + add,
                earnDay: today,
                affection,
                ...(action === "feed" ? { fed: today } : { played: today }),
              },
            },
          };
        }),

      /* ── Daily Quest: play N rounds today → bonus coins ── */

      novaQuestRound: (kidId) => {
        const n = get().nova[kidId] ?? defaultNova();
        const today = todayIso();
        const fresh = n.questDay !== today;
        if (!fresh && n.questDone) return false; // already finished today — no grind
        const rounds = (fresh ? 0 : n.questRounds ?? 0) + 1;
        const reached = rounds >= NOVA_QUEST_TARGET;
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          const earnedToday = cur.earnDay === today ? cur.earnedToday : 0;
          const reward = reached
            ? Math.min(NOVA_QUEST_REWARD, Math.max(0, NOVA_DAILY_CAP - earnedToday))
            : 0;
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                questDay: today,
                questRounds: rounds,
                questDone: reached,
                coins: cur.coins + reward,
                totalEarned: cur.totalEarned + reward,
                earnedToday: earnedToday + reward,
                earnDay: today,
              },
            },
          };
        });
        return reached;
      },

      /* ── #281 7-day login calendar: collect today's cycle bonus (once/day,
           only after today's first session — a reward for DAILY play, not a
           free login; amount stays inside the anti-grind cap). ── */

      novaClaimCalendar: (kidId) => {
        const n = get().nova[kidId] ?? defaultNova();
        const today = todayIso();
        if (n.calendarDay === today || n.lastDay !== today) return 0; // already claimed / not played today
        const pos = calendarCycleDay(n.streak); // 1..7
        const base = NOVA_CALENDAR_REWARDS[pos - 1] ?? 0;
        const earnedToday = n.earnDay === today ? n.earnedToday : 0;
        const add = Math.max(0, Math.min(base, NOVA_DAILY_CAP - earnedToday));
        if (add <= 0) return 0;
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          const todayEarned = cur.earnDay === today ? cur.earnedToday : 0;
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                coins: cur.coins + add,
                totalEarned: cur.totalEarned + add,
                earnedToday: todayEarned + add,
                earnDay: today,
                calendarDay: today,
              },
            },
          };
        });
        return add;
      },

      /* ── #283 goal badges: merge the currently-earned badge ids (computed in
           App.tsx from the skill catalog) into the kid's persisted set and
           return the NEWLY-earned ones so the UI can celebrate them once. ── */

      novaSyncBadges: (kidId, earned) => {
        const n = get().nova[kidId] ?? defaultNova();
        const stored = n.badges ?? [];
        const newly = earned.filter((id) => !stored.includes(id));
        if (newly.length === 0) return [];
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          const merged = Array.from(new Set([...(cur.badges ?? []), ...earned]));
          return { nova: { ...s.nova, [kidId]: { ...cur, badges: merged } } };
        });
        return newly;
      },

      /* ── #277 land trophies: merge the fully-mastered band ids (computed in
           App.tsx from the skill catalog) into the persisted set and return
           the NEWLY-earned ones so the UI can celebrate each once. ── */

      novaSyncTrophies: (kidId, earned) => {
        const n = get().nova[kidId] ?? defaultNova();
        const stored = n.trophies ?? [];
        const newly = earned.filter((id) => !stored.includes(id));
        if (newly.length === 0) return [];
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          const merged = Array.from(new Set([...(cur.trophies ?? []), ...earned]));
          return { nova: { ...s.nova, [kidId]: { ...cur, trophies: merged } } };
        });
        return newly;
      },

      /* ── #284 mastery mystery boxes: opening one awards 2–5 coins inside the
           daily cap. The boxed skill ids the kid has mastered come from App.tsx
           (it knows the catalog); the store just marks them opened + pays. ── */

      novaOpenBox: (kidId, unclaimed) => {
        const n = get().nova[kidId] ?? defaultNova();
        const stored = n.boxes ?? [];
        const next = unclaimed.find((id) => !stored.includes(id));
        if (!next) return { skillId: null, coins: 0 };
        const today = todayIso();
        const earnedToday = n.earnDay === today ? n.earnedToday : 0;
        if (earnedToday >= NOVA_DAILY_CAP) return { skillId: next, coins: 0 }; // cap full → box waits
        const add = Math.min(2 + Math.floor(Math.random() * 4), NOVA_DAILY_CAP - earnedToday); // 2..5
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                boxes: [...(cur.boxes ?? []), next],
                coins: cur.coins + add,
                totalEarned: cur.totalEarned + add,
                earnedToday: (cur.earnDay === today ? cur.earnedToday : 0) + add,
                earnDay: today,
              },
            },
          };
        });
        return { skillId: next, coins: add };
      },

      /* ── Share reward: parent shared this kid's progress → once/day bonus ── */
      novaShareReward: (kidId) => {
        const n = get().nova[kidId] ?? defaultNova();
        const today = todayIso();
        if (n.shareDay === today) return false; // already rewarded today — no farming
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                coins: cur.coins + NOVA_SHARE_REWARD,
                totalEarned: cur.totalEarned + NOVA_SHARE_REWARD,
                shareDay: today,
              },
            },
          };
        });
        return true;
      },

      /* ── Birthday: Nova's once-a-year gift (a real bonus, no daily-cap tax) ── */
      novaBirthday: (kidId) => {
        const n = get().nova[kidId] ?? defaultNova();
        const year = String(new Date().getFullYear());
        if (n.bdayYear === year) return; // already gifted this year
        set((s) => {
          const cur = s.nova[kidId] ?? defaultNova();
          return {
            nova: {
              ...s.nova,
              [kidId]: {
                ...cur,
                coins: cur.coins + NOVA_BIRTHDAY_COINS,
                totalEarned: cur.totalEarned + NOVA_BIRTHDAY_COINS,
                bdayYear: year,
              },
            },
          };
        });
      },

      /* ── Growth Garden: correct answers water it, mastery plants flowers ── */

      gardenWater: (kidId) =>
        set((s) => {
          const g = s.garden[kidId] ?? emptyGarden();
          const next = waterGarden(g);
          if (next === g) return { garden: s.garden }; // full garden — nothing to grow
          return { garden: { ...s.garden, [kidId]: next } };
        }),

      gardenMastery: (kidId, skillId, title) =>
        set((s) => {
          const g = s.garden[kidId] ?? emptyGarden();
          const next = masteryPlant(g, skillId, title);
          if (next === g) return { garden: s.garden }; // already planted
          return { garden: { ...s.garden, [kidId]: next } };
        }),
    }),
    { name: "nv_store_v1", partialize: (s) => ({ skills: s.skills, mistakes: s.mistakes, stats: s.stats, nova: s.nova, garden: s.garden, pending: s.pending, stories: s.stories, moni: s.moni, moniWrongStreak: s.moniWrongStreak, moniStrictness: s.moniStrictness }) }
  )
);
