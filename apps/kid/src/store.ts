import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  observe,
  decay,
  initialSkillState,
  DEFAULT_PARAMS,
  type SkillState,
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
export const PET_MAX_STAGE = 3; // 🥚 → 🐣 → 🦉 → 🦉(wise)

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
  /** The kid's pet — an egg that hatches + grows as they learn. */
  petStage: number; // 0 egg → 1 hatchling → 2 young owl → 3 wise owl
  petProgress: number; // 0..1 toward the next stage
  petFed: string; // last ISO date the pet was fed (once daily)
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
    petStage: 0,
    petProgress: 0,
    petFed: "",
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

interface KidState {
  score: number;
  stars: number;
  events: RoundResult[];
  /** Persisted outbox — every round, queued for server sync (offline-safe). */
  pending: SyncEvent[];
  /** Live sync indicator (transient, not persisted). */
  syncState: SyncState;
  /** Per-kid per-skill adaptive mastery state. Key `${kidId}:${skillId}`. */
  skills: Record<string, SkillState>;
  /** Lifetime totals per kid. Key kidId. */
  stats: Record<string, KidStats>;
  /** Nova companion economy per kid. Key kidId. */
  nova: Record<string, NovaState>;
  /** Growth Garden per kid — correct answers water it, mastery plants flowers. */
  garden: Record<string, GardenState>;
  addEvent: (kidId: string, e: RoundResult) => void;
  clearPending: (uids: Set<string>) => void;
  setSyncState: (s: SyncState) => void;
  skillFor: (kidId: string, skillId: string) => SkillState;
  recordSession: (kidId: string) => void;
  reset: () => void;
  novaAwardRound: (kidId: string, correct: boolean) => void;
  novaCompleteSession: (kidId: string) => void;
  novaBuy: (kidId: string, outfitId: string) => void;
  novaEquip: (kidId: string, outfitId: string) => void;
  novaCare: (kidId: string, action: "feed" | "play") => void;
  /** Every completed round counts toward today's Daily Quest. Returns true the
   *  moment the quest completes (so the caller can celebrate once). */
  novaQuestRound: (kidId: string) => boolean;
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
      syncState: "idle",
      skills: {},
      stats: {},
      nova: {},
      garden: {},
      addEvent: (kidId, e) => {
        const now = Date.now();
        const prev = get().skills[keyOf(kidId, e.skillId)] ?? initialSkillState(kidId, e.skillId);
        const updated = observe(decay(prev, now), e.correct, DEFAULT_PARAMS, now);
        const prior = get().stats[kidId] ?? { stars: 0, score: 0, sessions: 0 };
        set((s) => ({
          events: [...s.events, e],
          // durable outbox — survives reloads; the sync drains it online
          pending: [...s.pending, { uid: genUid(), kidId, ...e, ts: now }],
          score: s.score + (e.correct ? e.difficulty : 0),
          stars: s.stars + (e.correct ? 1 : 0),
          skills: { ...s.skills, [keyOf(kidId, e.skillId)]: updated },
          stats: {
            ...s.stats,
            [kidId]: {
              stars: prior.stars + (e.correct ? 1 : 0),
              score: prior.score + (e.correct ? e.difficulty : 0),
              sessions: prior.sessions,
            },
          },
        }));
      },
      clearPending: (uids) =>
        set((s) => (uids.size ? { pending: s.pending.filter((e) => !uids.has(e.uid)) } : s)),
      setSyncState: (syncState) => set({ syncState }),
      skillFor: (kidId, skillId) =>
        get().skills[keyOf(kidId, skillId)] ?? initialSkillState(kidId, skillId),
      recordSession: (kidId) =>
        set((s) => {
          const prior = s.stats[kidId] ?? { stars: 0, score: 0, sessions: 0 };
          return { stats: { ...s.stats, [kidId]: { ...prior, sessions: prior.sessions + 1 } } };
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

      /** Buy an outfit — instantly wears it (instant gratification). */
      novaBuy: (kidId, outfitId) => {
        const outfit = NOVA_OUTFITS.find((o) => o.id === outfitId);
        if (!outfit) return;
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
    { name: "nv_store_v1", partialize: (s) => ({ skills: s.skills, stats: s.stats, nova: s.nova, garden: s.garden, pending: s.pending }) }
  )
);
