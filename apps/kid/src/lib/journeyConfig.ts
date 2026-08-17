/* journeyConfig.ts — the heavy static DATA tables of the learning journey,
 * split out of journey.ts (#883) so the boot graph can defer them. Pure data
 * + types — no React, no DOM, no app state. journey.ts re-exports every one of
 * these for backward compat (its helper functions still consult a few of them
 * internally), but the kid-app shell (App.tsx) no longer statically imports
 * this module: it is loaded on demand the first time a kid selects a profile
 * and lands on home, and the screens that render these tables are lazy chunks
 * that pull this module into their own shared chunk instead of first paint.
 *
 * The catalog (BANDS/SKILLS) lives upstream in @numberverse/core — this module
 * re-exports it so every journey config table hangs off ONE module. */

import { BANDS, SKILLS, type Band, type Skill } from "@numberverse/core";
import { NOVA_SPECIES } from "../store";
import { bnNum } from "../i18n-core";
import { NV_GOLD, NV_ORANGE, NV_PINK, NV_SKY } from "../game/ui";

export { BANDS, SKILLS };
export type { Band, Skill };

/** #247 — PIN-recovery security questions. Index = stored qid (so a locale
 *  change never corrupts the pairing). Add a key to the locale map for any new
 *  country pack — no rewrites. */
export const SECURITY_QUESTIONS: Array<{ en: string; bn: string }> = [
  { en: "What is your favourite colour?", bn: "আপনার প্রিয় রং কোনটি?" },
  { en: "What is the name of your first pet?", bn: "আপনার প্রথম পোষা প্রাণীর নাম কী?" },
  { en: "What is your mother's first name?", bn: "আপনার মায়ের প্রথম নাম কী?" },
  { en: "Which city were you born in?", bn: "আপনি কোন শহরে জন্মেছেন?" },
  { en: "What is your favourite food?", bn: "আপনার প্রিয় খাবার কোনটি?" },
];

/** 🎯 #325 — MONI contrast-drill templates, keyed by misconception CODE.
 *  Each is a short side-by-side quiz: two big options (correct + the pattern's
 *  trap) around a warm prompt. Bilingual (EN + BN) kid-facing copy; numerals
 *  + emoji stay universal. Only codes with a template get a drill — a random
 *  guess never triggers one. */
export interface ContrastRound {
  prompt: { en: string; bn: string };
  correct: string;
  trap: string;
  tip: { en: string; bn: string };
}
export interface ContrastTemplate {
  code: string;
  intro: { en: string; bn: string };
  rounds: ContrastRound[];
}
export const CONTRAST_TEMPLATES: Record<string, ContrastTemplate> = {
  reversal: {
    code: "reversal",
    intro: { en: "6 and 9 love to turn upside down. Can you spot the difference?", bn: "৬ আর ৯ উল্টে ঘুরতে ভালোবাসে। তুমি পারবে চিনতে?" },
    rounds: [
      { prompt: { en: "Which one is six?", bn: "কোনটা ৬?" }, correct: "6", trap: "9", tip: { en: "Six has the swirl on top.", bn: "৬-এর মাথায় গোল ঘুর আছে।" } },
      { prompt: { en: "Which one is two?", bn: "কোনটা ২?" }, correct: "2", trap: "5", tip: { en: "Two has a curly tail.", bn: "২-এর একটা কোঁকড়া লেজ।" } },
      { prompt: { en: "Which one is three?", bn: "কোনটা ৩?" }, correct: "3", trap: "8", tip: { en: "Three has two bumps.", bn: "৩-এর দুটো ঢেউ আছে।" } },
    ],
  },
  "overcount-1": {
    code: "overcount-1",
    intro: { en: "Let's count super carefully — one at a time.", bn: "একটা করে খুব মন দিয়ে গুনি।" },
    rounds: [
      { prompt: { en: "⭐⭐⭐⭐⭐ How many stars?", bn: "⭐⭐⭐⭐⭐ কতগুলো তারা?" }, correct: "5", trap: "6", tip: { en: "Point to each one as you count.", bn: "গোনার সময় প্রতিটায় আঙুল দাও।" } },
      { prompt: { en: "🌸🌸🌸🌸 How many flowers?", bn: "🌸🌸🌸🌸 কতগুলো ফুল?" }, correct: "4", trap: "5", tip: { en: "Count slowly — no rushing!", bn: "ধীরে গুনো — তাড়াহুড়ো নয়!" } },
      { prompt: { en: "🍎🍎🍎 How many apples?", bn: "🍎🍎🍎 কতগুলো আপেল?" }, correct: "3", trap: "4", tip: { en: "Tap each apple as you count it.", bn: "গোনার সময় প্রতিটা আপেল ছোঁও।" } },
    ],
  },
  "undercount-1": {
    code: "undercount-1",
    intro: { en: "Let's make sure we didn't miss any!", bn: "নিশ্চিত করি — যেন কিছু মিস না হয়!" },
    rounds: [
      { prompt: { en: "🐠🐠🐠🐠🐠🐠 How many fish?", bn: "🐠🐠🐠🐠🐠🐠 কতগুলো মাছ?" }, correct: "6", trap: "5", tip: { en: "Count them one by one.", bn: "একটা একা করে গুনো।" } },
      { prompt: { en: "🌳🌳🌳🌳🌳 How many trees?", bn: "🌳🌳🌳🌳🌳 কতগুলো গাছ?" }, correct: "5", trap: "4", tip: { en: "Take your time — no rush.", bn: "সময় আছে — তাড়া নেই।" } },
      { prompt: { en: "⚽⚽⚽⚽ How many balls?", bn: "⚽⚽⚽⚽ কতগুলো বল?" }, correct: "4", trap: "3", tip: { en: "Every one counts!", bn: "প্রতিটাই গুনতে হবে!" } },
    ],
  },
  "off-by-ten": {
    code: "off-by-ten",
    intro: { en: "Tens and ones live in different houses — let's check which house the number goes in.", bn: "দশ আর এককের বাড়ি আলাদা — দেখি সংখ্যাটা কোন বাড়িতে যায়।" },
    rounds: [
      { prompt: { en: "Which number is ten more than 24?", bn: "কোন সংখ্যাটা ২৪-এর চেয়ে ১০ বেশি?" }, correct: "34", trap: "24", tip: { en: "Add ten: 24 → 34.", bn: "১০ যোগ করো: ২৪ → ৩৪।" } },
      { prompt: { en: "Which number is ten less than 51?", bn: "কোন সংখ্যাটা ৫১-এর চেয়ে ১০ কম?" }, correct: "41", trap: "51", tip: { en: "Take ten away: 51 → 41.", bn: "১০ বাদ দাও: ৫১ → ৪১।" } },
      { prompt: { en: "Which number is ten more than 68?", bn: "কোন সংখ্যাটা ৬৮-এর চেয়ে ১০ বেশি?" }, correct: "78", trap: "68", tip: { en: "Only the tens digit grows by one.", bn: "শুধু দশের ঘরের অঙ্কটা এক বাড়ে।" } },
    ],
  },
  double: {
    code: "double",
    intro: { en: "Doubling means two of everything — like magic!", bn: "দ্বিগুণ মানে সবকিছু দুবার — জাদুর মতো!" },
    rounds: [
      { prompt: { en: "What is double 4?", bn: "৪-এর দ্বিগুণ কত?" }, correct: "8", trap: "4", tip: { en: "Double 4 = 4 + 4.", bn: "৪-এর দ্বিগুণ = ৪ + ৪।" } },
      { prompt: { en: "What is double 6?", bn: "৬-এর দ্বিগুণ কত?" }, correct: "12", trap: "6", tip: { en: "Double 6 = 6 + 6.", bn: "৬-এর দ্বিগুণ = ৬ + ৬।" } },
      { prompt: { en: "What is double 9?", bn: "৯-এর দ্বিগুণ কত?" }, correct: "18", trap: "9", tip: { en: "Double 9 = 9 + 9.", bn: "৯-এর দ্বিগুণ = ৯ + ৯।" } },
    ],
  },
  half: {
    code: "half",
    intro: { en: "Halving means splitting into two equal parts — share it fairly!", bn: "অর্ধেক মানে সমান দুভাগে ভাগ করা — সবার সমান!" },
    rounds: [
      { prompt: { en: "What is half of 10?", bn: "১০-এর অর্ধেক কত?" }, correct: "5", trap: "10", tip: { en: "Split 10 into two equal piles.", bn: "১০ টা সমান দুভাগে ভাগ করো।" } },
      { prompt: { en: "What is half of 8?", bn: "৮-এর অর্ধেক কত?" }, correct: "4", trap: "8", tip: { en: "Split 8 into two equal piles.", bn: "৮ টা সমান দুভাগে ভাগ করো।" } },
      { prompt: { en: "What is half of 14?", bn: "১৪-এর অর্ধেক কত?" }, correct: "7", trap: "14", tip: { en: "Split 14 into two equal piles.", bn: "১৪ টা সমান দুভাগে ভাগ করো।" } },
    ],
  },
};

/**
 * Done-screen confetti field — computed ONCE at module load. This MUST NOT be
 * a hook: it's rendered inside the `screen === "done"` branch, and a hook there
 * would change the hook count vs every other screen, making React throw
 * "Rendered more hooks than during the previous render" the instant a session
 * completes → the whole app unmounts → the "complete all rounds then blank"
 * bug. Module-level is stable, zero hooks, and 30 pieces are trivial to build.
 */
export const DONE_CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  left: Math.random() * 100,
  delay: -Math.random() * 4, // negative → already mid-fall on mount
  dur: 2.6 + Math.random() * 2.6,
  drift: (Math.random() - 0.5) * 180,
  rot: 360 + Math.random() * 540,
  color: [NV_SKY, NV_GOLD, NV_PINK, "#2ec4b6", "#c4b5fd", NV_ORANGE][i % 6],
}));

/* ── Seasons — the journey path lives in the real world's season ───────────
 * The path is decorated by the actual calendar month (Northern-ish cycle that
 * still matches a Bangladeshi kid's year):
 *   Dec–Feb ❄️ snow   Mar–May 🌸 spring flowers
 *   Jun–Aug ✨ fireflies   Sep–Nov 🍂 autumn leaves
 * The particles are stable module data (same pattern as DONE_CONFETTI), so the
 * path doesn't reshuffle on every render. */
export type SeasonKey = "snow" | "flowers" | "fireflies" | "leaves";
export const SEASON_PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 7.3 + 3) % 96,
  delay: (i % 7) * 0.6,
  dur: 5 + (i % 5) * 1.6,
  drift: (i % 2 ? 1 : -1) * (10 + (i % 4) * 8),
  rot: (i % 3) * 120,
}));
export const SEASON_EMOJI: Record<SeasonKey, string> = { snow: "❄️", flowers: "🌸", fireflies: "✨", leaves: "🍂" };

/* ── #280 beat-the-owl drill: question generator + fair Nova ──
 * Pure + locale-aware. `bnNum` is hoisted (same module) so the Bangla digit
 * conversion is available even though this block sits earlier in the file. */

export const CHALLENGE_ROUNDS = 5;
export const CHALLENGE_MIN_LEVEL = 1;
export const CHALLENGE_MAX_LEVEL = 10;

/* ── #356 first-play tour: 4 steps. All copy lives in STR[lang] (never
 *  hardcoded), so a new country is a config addition, not a rewrite (#131). */
export const TOUR_STEPS = [{ emoji: "👋" }, { emoji: "🗺️" }, { emoji: "🦉" }, { emoji: "🧭" }] as const;

/* ── rank ladder: mastery count → a fun title kids want to reach ── */
export const RANKS = [
  { min: 0, en: "🌱 Seedling", bn: "🌱 চারা" },
  { min: 3, en: "🌿 Sprout", bn: "🌿 কচি" },
  { min: 8, en: "🦊 Explorer", bn: "🦊 অভিযাত্রী" },
  { min: 15, en: "🦉 Wise Owl", bn: "🦉 জ্ঞানী প্যাঁচা" },
  { min: 22, en: "🚀 Star Pilot", bn: "🚀 স্টার পাইলট" },
  { min: 28, en: "👑 Champion", bn: "👑 চ্যাম্পিয়ন" },
];

/* ────────────────────────────── #283 goal badges ──────────────────────────────
 * Small lifetime badges for real learning wins. Each condition reads only
 * existing local state (stats, streak, world mastery) — fully offline. The
 * earned set is persisted in the store (`NovaState.badges`); this config just
 * DEFINES the badges + their conditions. Names are locale-packed like Nova
 * outfits (name / nameBn — a new country adds its field, no rewrite). */

export interface BadgeCtx {
  sessions: number; // completed sessions (each = a playthrough)
  stars: number;
  streak: number;
  worlds: number; // fully-mastered lands
  weekDone: boolean; // #100 — skill-of-the-week challenge completed
}
export interface BadgeDef {
  id: string;
  emoji: string;
  name: string;
  nameBn: string;
  hint: string;
  hintBn: string;
  earned: (c: BadgeCtx) => boolean;
  /** #1356 — concrete progress toward the badge (current/target) so the book
   *  never reads as a wall of locks. */
  progress: (c: BadgeCtx) => { current: number; target: number };
}
export const BADGES: BadgeDef[] = [
  { id: "rounds10", emoji: "🎮", name: "10 Rounds Hero", nameBn: "১০ রাউন্ড হিরো", hint: "Finish 10 sessions", hintBn: "১০টা খেলা শেষ করো", earned: (c) => c.sessions >= 10, progress: (c) => ({ current: Math.min(c.sessions, 10), target: 10 }) },
  { id: "stars50", emoji: "⭐", name: "Star Collector", nameBn: "তারকা সংগ্রহকারী", hint: "Earn 50 stars", hintBn: "৫০টা তারা জিতো", earned: (c) => c.stars >= 50, progress: (c) => ({ current: Math.min(c.stars, 50), target: 50 }) },
  { id: "streak7", emoji: "🔥", name: "7-Day Streak", nameBn: "৭ দিনের ধারা", hint: "Play 7 days in a row", hintBn: "টানা ৭ দিন খেলো", earned: (c) => c.streak >= 7, progress: (c) => ({ current: Math.min(c.streak, 7), target: 7 }) },
  { id: "worldChamp", emoji: "👑", name: "Land Champion", nameBn: "ভূখণ্ড চ্যাম্পিয়ন", hint: "Master every skill in a land", hintBn: "একটি ভূখণ্ডের সব দক্ষতা আয়ত্ত করো", earned: (c) => c.worlds >= 1, progress: (c) => ({ current: Math.min(c.worlds, 1), target: 1 }) },
  { id: "weekWarrior", emoji: "🏅", name: "Week Warrior", nameBn: "সপ্তাহের যোদ্ধা", hint: "Finish this week's challenge", hintBn: "এই সপ্তাহের চ্যালেঞ্জ শেষ করো", earned: (c) => c.weekDone, progress: (c) => ({ current: c.weekDone ? 1 : 0, target: 1 }) },
];

/* #289 — long-term achievements album: milestones ACROSS weeks, derived from
 * lifetime local stats (same shape as Badges but bigger, slower goals). A new
 * one fires the celebrate-once effect on home; the album grid pops the newly
 * unlocked card with a glow animation. All offline. */
export interface AchCtx {
  sessions: number; // completed sessions
  stars: number; // lifetime stars
  mastered: number; // skills mastered (lifetime)
  streak: number; // standing day streak
  coins: number; // lifetime coins earned
  worlds: number; // fully-mastered lands
  pets: number; // species adopted
  petStage: number; // current pet growth 0..3
}
export interface AchDef {
  id: string;
  emoji: string;
  name: string;
  nameBn: string;
  hint: string;
  hintBn: string;
  earned: (c: AchCtx) => boolean;
}

export const ACHIEVEMENTS: AchDef[] = [
  { id: "firstRound", emoji: "🎈", name: "First Steps", nameBn: "প্রথম পদক্ষেপ", hint: "Complete your first session", hintBn: "প্রথম খেলাটি শেষ করো", earned: (c) => c.sessions >= 1 },
  { id: "rounds25", emoji: "🎮", name: "25 Rounds", nameBn: "২৫ রাউন্ড", hint: "Complete 25 sessions", hintBn: "২৫টা খেলা শেষ করো", earned: (c) => c.sessions >= 25 },
  { id: "rounds100", emoji: "💯", name: "100 Rounds", nameBn: "১০০ রাউন্ড", hint: "Complete 100 sessions", hintBn: "১০০টা খেলা শেষ করো", earned: (c) => c.sessions >= 100 },
  { id: "rounds250", emoji: "🚀", name: "250 Rounds", nameBn: "২৫০ রাউন্ড", hint: "Complete 250 sessions", hintBn: "২৫০টা খেলা শেষ করো", earned: (c) => c.sessions >= 250 },
  { id: "stars100", emoji: "⭐", name: "100 Stars", nameBn: "১০০ তারা", hint: "Earn 100 stars", hintBn: "১০০টা তারা জিতো", earned: (c) => c.stars >= 100 },
  { id: "stars500", emoji: "🌟", name: "500 Stars", nameBn: "৫০০ তারা", hint: "Earn 500 stars", hintBn: "৫০০টা তারা জিতো", earned: (c) => c.stars >= 500 },
  { id: "master5", emoji: "🧠", name: "5 Skills", nameBn: "৫ দক্ষতা", hint: "Master 5 skills", hintBn: "৫টি দক্ষতা আয়ত্ত করো", earned: (c) => c.mastered >= 5 },
  { id: "master10", emoji: "📚", name: "10 Skills", nameBn: "১০ দক্ষতা", hint: "Master 10 skills", hintBn: "১০টি দক্ষতা আয়ত্ত করো", earned: (c) => c.mastered >= 10 },
  { id: "master25", emoji: "🏅", name: "25 Skills", nameBn: "২৫ দক্ষতা", hint: "Master 25 skills", hintBn: "২৫টি দক্ষতা আয়ত্ত করো", earned: (c) => c.mastered >= 25 },
  { id: "master40", emoji: "🎓", name: "40 Skills", nameBn: "৪০ দক্ষতা", hint: "Master 40 skills", hintBn: "৪০টি দক্ষতা আয়ত্ত করো", earned: (c) => c.mastered >= 40 },
  { id: "streak14", emoji: "🔥", name: "14-Day Streak", nameBn: "১৪ দিনের ধারা", hint: "Play 14 days in a row", hintBn: "টানা ১৪ দিন খেলো", earned: (c) => c.streak >= 14 },
  { id: "streak30", emoji: "🗓️", name: "30-Day Streak", nameBn: "৩০ দিনের ধারা", hint: "Play 30 days in a row", hintBn: "টানা ৩০ দিন খেলো", earned: (c) => c.streak >= 30 },
  { id: "world1", emoji: "🌍", name: "First Land", nameBn: "প্রথম ভূখণ্ড", hint: "Fully master your first land", hintBn: "প্রথম ভূখণ্ড সম্পূর্ণ করো", earned: (c) => c.worlds >= 1 },
  { id: "worldAll", emoji: "👑", name: "All Lands", nameBn: "সব ভূখণ্ড", hint: `Master every land (${BANDS.length})`, hintBn: `সব ভূখণ্ড আয়ত্ত করো (${bnNum(BANDS.length)})`, earned: (c) => c.worlds >= BANDS.length },
  { id: "banker", emoji: "🪙", name: "Banker", nameBn: "ব্যাংকার", hint: "Earn 100 coins in total", hintBn: "মোট ১০০ কয়েন জিতো", earned: (c) => c.coins >= 100 },
  { id: "collector", emoji: "💰", name: "Collector", nameBn: "সংগ্রাহক", hint: "Earn 500 coins in total", hintBn: "মোট ৫০০ কয়েন জিতো", earned: (c) => c.coins >= 500 },
  { id: "grown", emoji: "🐣", name: "Fully Grown", nameBn: "সম্পূর্ণ বড়", hint: "Grow your pet to the last stage", hintBn: "পোষ্যকে শেষ ধাপে বড় করো", earned: (c) => c.petStage >= 3 },
  { id: "zookeeper", emoji: "🐾", name: "Zookeeper", nameBn: "চিড়িয়াখানার রক্ষক", hint: "Adopt every pet species", hintBn: "সব পোষ্যের প্রজাতি দত্তক নাও", earned: (c) => c.pets >= NOVA_SPECIES.length },
];

/* #292 — Nova reaction pack v2: in-game learning-event reactions. A floating
 * Nova face + a short line fires on win streaks, setbacks and reteach moments
 * (exactly ONE per round, highest-priority wins). Pure visual bubble + gentle
 * speak (speak skipped when a bigger spoken moment already owns that round).
 * Lines are locale-packed EN/BN (#131) like Badges/Achievements. */
export type NovaReaction = "cheer" | "amaze" | "superstar" | "streak" | "oops" | "gentle" | "setback" | "reteach" | "master" | "quest";
export interface NovaReactionDef {
  emoji: string;
  lineEn: () => string;
  lineBn: () => string;
  /** #1034 — older-kid register (bands 5+, ages ~10+) for the same moment. */
  lineEnMature?: () => string;
  lineBnMature?: () => string;
  /** Speak the line aloud? False when the round already has its own spoken moment. */
  speak?: boolean;
}
export const NOVA_REACTIONS: Record<NovaReaction, NovaReactionDef> = {
  cheer: { emoji: "🎉", lineEn: () => "3 in a row — nice!", lineBn: () => "টানা ৩টা — দারুণ!", lineEnMature: () => "3 in a row — solid.", lineBnMature: () => "টানা ৩টা — চমৎকার।", speak: true },
  amaze: { emoji: "🌟", lineEn: () => "AMAZING!", lineBn: () => "অসাধারণ!", lineEnMature: () => "Excellent!", lineBnMature: () => "চমৎকার!", speak: true },
  superstar: { emoji: "⭐", lineEn: () => "SUPER STAR!", lineBn: () => "সুপার স্টার!", lineEnMature: () => "Well done!", lineBnMature: () => "দারুণ করেছ!", speak: true },
  streak: { emoji: "🔥", lineEn: () => "You're on fire!", lineBn: () => "তুমি জ্বলছ!", lineEnMature: () => "Strong streak.", lineBnMature: () => "চমৎকার ধারাবাহিকতা।", speak: true },
  oops: { emoji: "🤔", lineEn: () => "Oops! Try again — you've got this", lineBn: () => "ওহ! আবার চেষ্টা করো — পারবে", lineEnMature: () => "Not quite — try again.", lineBnMature: () => "ঠিক হয়নি — আবার চেষ্টা করো।", speak: true },
  gentle: { emoji: "💛", lineEn: () => "Take a breath — you've got this", lineBn: () => "একটা নিঃশ্বাস নাও — পারবে", lineEnMature: () => "Pause, then go again.", lineBnMature: () => "একটু থামো, তারপর আবার করো।", speak: true },
  setback: { emoji: "😮", lineEn: () => "So close! Keep going", lineBn: () => "খুব কাছাকাছি! চালিয়ে যাও", lineEnMature: () => "Close — keep going.", lineBnMature: () => "কাছাকাছি — চালিয়ে যাও।", speak: true },
  reteach: { emoji: "🎯", lineEn: () => "Let's learn it together!", lineBn: () => "একসাথে শিখি!", lineEnMature: () => "Let's go over it together.", lineBnMature: () => "আবার একসাথে দেখি।", speak: true },
  master: { emoji: "🏆", lineEn: () => "Skill mastered!", lineBn: () => "দক্ষতা আয়ত্ত হয়েছে!", lineEnMature: () => "Skill mastered.", lineBnMature: () => "দক্ষতা আয়ত্ত হয়েছে।", speak: false },
  quest: { emoji: "🎁", lineEn: () => "Quest complete!", lineBn: () => "মিশন শেষ!", lineEnMature: () => "Quest complete.", lineBnMature: () => "মিশন শেষ।", speak: false },
};

/* ── World map palette ─────────────────────────────────────────────────────
 * Each world gets its own land colors + tiny terrain decorations. Used by the
 * visual map (islands on a winding road) and the world-detail backdrop so the
 * whole "worlds" experience shares one art language. */
export const WORLD_LANDS: Record<
  number,
  { c1: string; c2: string; c3: string; c2_22: string; deco: string[] }
> = {
  1: { c1: "#0b3d2e", c2: "#2f9e6e", c3: "#c8f2c9", c2_22: "rgba(47,158,110,0.16)", deco: ["🌱", "🍃", "🌿"] },      // Sprout Grove — green (not teal), so it reads apart from the blue River Town by value too (#1365)
  2: { c1: "#5a2a1e", c2: "#f6c06a", c3: "#ffe8b0", c2_22: "rgba(246,192,106,0.16)", deco: ["🌾", "🐄", "🌻"] },      // Cottage Fields
  3: { c1: "#0b3b6d", c2: "#5fb6e8", c3: "#bde8ff", c2_22: "rgba(95,182,232,0.16)", deco: ["🌊", "🐟", "🛶"] },      // River Town
  4: { c1: "#4a1f2e", c2: "#e8b0a0", c3: "#ffd9c4", c2_22: "rgba(232,176,160,0.16)", deco: ["☁️", "🏰", "🕊️"] },      // Sky Castle
  5: { c1: "#2b2350", c2: "#c4b5fd", c3: "#e6dcff", c2_22: "rgba(196,181,253,0.16)", deco: ["🚀", "⭐", "🌠"] },       // Star Academy
  6: { c1: "#1e4d1f", c2: "#43d17c", c3: "#c8f7a9", c2_22: "rgba(67,209,124,0.16)", deco: ["🌴", "🦜", "🌿"] },        // Jungle Canopy (#20)
  7: { c1: "#1f3a5f", c2: "#8fd3ff", c3: "#e3f4ff", c2_22: "rgba(143,211,255,0.16)", deco: ["❄️", "🐧", "🏔️"] },       // Polar Peaks (#20)
  8: { c1: "#2e2638", c2: "#f0a83c", c3: "#ffe3b3", c2_22: "rgba(240,168,60,0.16)", deco: ["⛰️", "🦅", "🌄"] },        // Summit Peaks (#1164)
};

/** #257 — human subject labels for the focus chip (EN + BN). */
export const FOCUS_SUBJECT_LABELS: Record<string, { en: string; bn: string }> = {
  math: { en: "Math", bn: "গণিত" },
  bangla: { en: "Bangla", bn: "বাংলা" },
  english: { en: "English", bn: "ইংরেজি" },
  science: { en: "Science", bn: "বিজ্ঞান" },
  bgs: { en: "BGS", bn: "বিজিএস" },
};

/** Subject → trading-card gradient (top-left deep → bright). */
export const SUBJECT_CARD: Record<string, [string, string]> = {
  math: ["#2f6fd0", "#6ec6ff"],
  bangla: ["#1f7a46", "#6cdb8e"],
  english: ["#4b5eaa", "#9db4f0"],
  science: ["#0e7490", "#5eead4"],
  bgs: ["#b23a3a", "#f08a72"],
  ict: ["#475569", "#9fb4c8"],
};

/* #285 — custom avatar builder: mix-and-match parts to build a unique buddy.
 * Base = the sticker hero (same AVATAR_KEYS as today); parts are emoji layers
 * (hat/glasses/outfit) drawn OVER the sticker. 7 options each (6+ ✓), "none"
 * to clear. Locale-packed labels (#131), persisted per kid, fully offline. */
export const AVATAR_PART_OPTIONS: Record<"hat" | "glasses" | "outfit", string[]> = {
  hat: ["none", "🎩", "🧢", "👑", "🎀", "🌼", "🍄"],
  glasses: ["none", "👓", "🕶️", "🥽", "🤓", "✨", "🌈"],
  outfit: ["none", "👕", "👗", "🥼", "🦺", "🎽", "🧥"],
};
export const AVATAR_PART_LABELS: Record<"hat" | "glasses" | "outfit", string> = {
  hat: "🎩",
  glasses: "👓",
  outfit: "👕",
};
