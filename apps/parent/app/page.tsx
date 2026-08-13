"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/** #7 — local-only diagnostics ring buffer. The portal has ZERO analytics, so
 *  the parent's browser is the only error log. We keep the last 20 window
 *  errors + unhandled rejections in memory and let the parent export them as a
 *  plain-text blob — nothing is sent anywhere; the buffer dies on reload. */
const NV_DIAG_MAX = 20;
const nvDiagErrors: { at: string; msg: string }[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    nvDiagErrors.push({
      at: new Date().toISOString(),
      msg: `${e.message}${e.filename ? ` @ ${e.filename}:${e.lineno}` : ""}`,
    });
    if (nvDiagErrors.length > NV_DIAG_MAX) nvDiagErrors.shift();
  });
  window.addEventListener("unhandledrejection", (e) => {
    nvDiagErrors.push({
      at: new Date().toISOString(),
      msg: `unhandled rejection: ${String((e.reason as { message?: string } | undefined)?.message ?? e.reason ?? e)}`,
    });
    if (nvDiagErrors.length > NV_DIAG_MAX) nvDiagErrors.shift();
  });
}
import {
  isAllowedExternalUrl,
  SKILLS,
  A11Y_DEFAULTS,
  a11yStorageKey,
  a11yToStorage,
  parseA11yPrefs,
  type A11yPrefs,
} from "@numberverse/core";
import QRCode from "qrcode";
import OnDeviceData from "./OnDeviceData";
import {
  getProfile,
  getKids,
  getMastery,
  getKidSettings,
  saveKidSettings,
  getActivity,
  getWeekly,
  getWeakSkills,
  getStories,
  getStoryStats,
  getAcceleration,
  getShareToken,
  resetKidProgress,
  createKid,
  updateKid,
  deleteKid,
  signout,
  signoutAll,
  getSessions,
  revokeSession,
  changePassword,
  updateProfile,
  validateToken,
  type Profile,
  type Kid,
  type MasteryRow,
  type KidSettings as KidSettingsT,
  type ActivityRow,
  type WeeklyReport,
  type LearningStoryRow,
  type StoryStats,
  type NewKid,
  type SessionRow,
  type AccelerationRow,
} from "../lib/api";
import { worksheetFor, type WorksheetProblem } from "../lib/worksheet";

const AVATARS = ["🛡️", "🔮", "🗡️", "🪓", "🏹", "🦊", "🐱", "🐼", "🐸", "🦄", "🐯", "🐰", "🐨", "🐹", "🦁"];

/** #246 — first-run onboarding wizard strings. EN + BN shipped today; the map
 *  IS the country-pack seam: add a new key (e.g. "hi", "ar") with the same
 *  shape and the wizard follows — no component rewrites. Selected via
 *  localStorage `nv_parent_lang` (default "en"). */
const WIZARD_LANGS = {
  en: {
    title: "👋 Welcome to Numberverse!",
    step0: "Let's set up your kids so their progress has a home.",
    stepN: "Add one at a time — you can add or edit more anytime.",
    nameLabel: "Name",
    birthLabel: "Birth year",
    add: "Add kid",
    adding: "Adding…",
    err: "Couldn't add {name} right now — check your connection and try again.",
    addedAll: "All set — add more below, or finish to see the dashboard.",
    addAnother: "➕ Add another",
    finish: "🚀 Finish →",
    notNow: "Not now",
    lang: "🌐 Language",
    noKidsDone: "No kids on this account yet — add one to get started.",
  },
  bn: {
    title: "👋 নাম্বারভার্সে স্বাগতম!",
    step0: "আপনার বাচ্চাদের সেটআপ করা যাক — শেখার অগ্রগতির একটা জায়গা তৈরি হবে।",
    stepN: "একজন করে যোগ করুন — পরে আরও যোগ বা সম্পাদনা করতে পারবেন।",
    nameLabel: "নাম",
    birthLabel: "জন্মসাল",
    add: "বাচ্চা যোগ করুন",
    adding: "যোগ হচ্ছে…",
    err: "এখন {name} যোগ করা যায়নি — ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।",
    addedAll: "সব ঠিক আছে — নিচে আরও যোগ করুন, অথবা শেষ করে ড্যাশবোর্ড দেখুন।",
    addAnother: "➕ আরেকটি যোগ করুন",
    finish: "🚀 শেষ করুন →",
    notNow: "পরে করুন",
    lang: "🌐 ভাষা",
    noKidsDone: "এই অ্যাকাউন্টে এখনো কোনো বাচ্চা নেই — শুরু করতে একজন যোগ করুন।",
  },
} as const;
type WizardLang = keyof typeof WIZARD_LANGS;

/** 🧏 #250 — global accessibility toggle strings (EN + BN). Same country-pack
 *  seam as WIZARD_LANGS: a new locale = a new key, no component rewrites. */
const A11Y_LANGS = {
  en: {
    bigText: "🔍 Big text",
    highContrast: "🎨 High contrast",
    bigTextOn: "Big text is on for the portal and the kid app",
    bigTextOff: "Big text is off",
    highContrastOn: "High contrast is on for the portal and the kid app",
    highContrastOff: "High contrast is off",
  },
  bn: {
    bigText: "🔍 বড় লেখা",
    highContrast: "🎨 উচ্চ কনট্রাস্ট",
    bigTextOn: "পোর্টাল আর কিড অ্যাপে বড় লেখা চালু",
    bigTextOff: "বড় লেখা বন্ধ",
    highContrastOn: "পোর্টাল আর কিড অ্যাপে উচ্চ কনট্রাস্ট চালু",
    highContrastOff: "উচ্চ কনট্রাস্ট বন্ধ",
  },
} as const;

/** 🎨 #254 — dashboard light/dark theme toggle strings (EN + BN). Portal-only
 *  preference (unlike nv_a11y which is shared with the kid app), so its key
 *  lives here as a config map — same country-pack seam as WIZARD_LANGS. */
const THEME_LANGS = {
  en: {
    dark: "🌙 Dark",
    light: "☀️ Light",
    lightOn: "Light theme is on for the dashboard",
    darkOn: "Dark theme is on for the dashboard",
  },
  bn: {
    dark: "🌙 ডার্ক",
    light: "☀️ লাইট",
    lightOn: "ড্যাশবোর্ডে লাইট থিম চালু",
    darkOn: "ড্যাশবোর্ডে ডার্ক থিম চালু",
  },
} as const;
const THEME_KEY = "nv_parent_theme";

/** 🧵 #255 — session timeline strings (EN + BN). Same country-pack seam. */
const SESSION_LANGS = {
  en: {
    title: "🧵 Session timeline",
    hint: "Play sessions (a 30-min pause starts a new one) with rounds, accuracy and the skills mastered in that block — generated right here in your browser from the history we already load, so it works offline.",
    filterByDay: "Filter by day",
    allDays: "All days",
    rounds: "rounds",
    min: "min",
    accuracy: "correct",
    mastered: "Mastered",
    loading: "Loading full history…",
    notLoaded: "The session timeline loads with the archive.",
    empty: "No sessions yet — play a few rounds and they’ll show up here.",
  },
  bn: {
    title: "🧵 সেশন টাইমলাইন",
    hint: "৩০ মিনিট বিরতিতে আলাদা সেশন — রাউন্ড, নির্ভুলতা আর সেই অংশে আয়ত্ত করা দক্ষতা; আমরা আগে যে ইতিহাস লোড করি তা থেকেই ব্রাউজারে তৈরি হয়, তাই অফলাইনে কাজ করে।",
    filterByDay: "দিন অনুযায়ী ফিল্টার",
    allDays: "সব দিন",
    rounds: "রাউন্ড",
    min: "মিনিট",
    accuracy: "সঠিক",
    mastered: "আয়ত্ত",
    loading: "সম্পূর্ণ ইতিহাস লোড হচ্ছে…",
    notLoaded: "সেশন টাইমলাইন আর্কাইভের সাথে লোড হয়।",
    empty: "এখনো কোনো সেশন নেই — কিছু রাউন্ড খেলুন, এখানে দেখা যাবে।",
  },
} as const;

const SUBJECTS = [
  { id: "math", label: "Math", emoji: "🔢" },
  { id: "bangla", label: "Bangla", emoji: "অ" },
  { id: "english", label: "English", emoji: "🔤" },
  { id: "science", label: "Science", emoji: "🔬" },
  { id: "bgs", label: "BGS", emoji: "🌏" },
] as const;

/** #237 — the read-aloud / story-comprehension games that make up a kid's
 *  "reading & stories" progress (EN + BN tracks). Mastery for these skills is
 *  already loaded with the dashboard, so the card works fully offline. */
const READING_GAMES = new Set(["game-readstory", "game-storyread", "game-story", "game-readaloud"]);
const readingSkills = SKILLS.filter((s) => s.game && READING_GAMES.has(s.game));

const GAME_LABELS: Record<string, string> = {
  "game-countpop": "Count & Pop",
  "game-countpop20": "Count & Pop to 20",
  "game-growcount": "Plant & Count",
  "game-shapecatcher": "Shape Catcher",
  "game-bnletters": "Bangla Letters",
  "game-enletters": "ABCs",
  "game-fruitadd-10": "Fruit Addition (to 10)",
  "game-fruitsub-10": "Fruit Subtraction (to 10)",
  "game-fruitadd-20": "Fruit Addition (to 20)",
  "game-fruitsub-20": "Fruit Subtraction (to 20)",
  "game-fruittree": "Fruit Tree",
  "game-bnbonds": "Number Bonds",
  "game-bncolors": "Bangla Colors",
  "game-enphonics": "Letter Sounds",
  "game-rocketmult": "Rocket Multiplication",
  "game-pizzafrac": "Pizza Fractions",
  "game-addsub100": "Add & Subtract 100",
  "game-bnwords": "Bangla Words",
  "game-cvc": "CVC Words",
  "game-div-23": "Divide by 2 & 3",
  "game-division": "Division Facts",
  "game-fracmatch": "Fraction Match",
  "game-placevalue": "Place Value",
  "game-bnmatras": "Bangla Matras",
  "game-sightwords": "Sight Words",
  "game-animalhome": "Animal Homes",
  "game-decimals": "Decimals",
  "game-percent": "Percent",
  "game-area": "Area & Perimeter",
  "game-bnsentence": "Bangla Sentences",
  "game-grammar": "Nouns & Verbs",
  "game-bgs": "Bangladesh Facts",
};

function gameLabel(id: string): string {
  return GAME_LABELS[id] ?? id.replace("game-", "").replace(/-/g, " ");
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** Turn a user-agent string into a short, human-friendly device label. */
function friendlyDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const s = ua.toLowerCase();
  if (s.includes("iphone")) return "iPhone";
  if (s.includes("ipad")) return "iPad";
  if (s.includes("android")) return "Android phone";
  if (s.includes("mac os") || s.includes("macintosh")) return "Mac";
  if (s.includes("windows")) return "Windows PC";
  if (s.includes("linux")) return "Linux";
  if (s.includes("samsung")) return "Samsung";
  return ua.split(" ")[0].slice(0, 30) || "Device";
}

function weekdayShort(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleString(undefined, { weekday: "short" });
  } catch {
    return iso;
  }
}

/** Privacy-safe share blurb — only aggregates, never a kid's name/device data
 *  unless the parent types the name into the share line themselves. */
function weeklyShareText(kidName: string, w: WeeklyReport): string {
  const n = w.mastered_this_week.length;
  const mastered = n
    ? `🏆 Mastered ${n} skill${n > 1 ? "s" : ""}: ${n <= 4 ? w.mastered_this_week.map((s) => s.replace(/-/g, " ")).join(", ") : `${n} total`}`
    : "🌱 Still growing — we keep playing every day!";
  // #8 — honest coins line: the WALLET balance (a real number), never a made-up
  // "earned this week" figure — we don't keep a per-week coin ledger.
  const coins = w.coins && w.coins > 0 ? `🪙 ${w.coins} coins in ${kidName}’s wallet` : null;
  return [
    `📊 ${kidName}’s learning week on Numberverse`,
    `🎮 ${w.rounds} rounds · ${w.minutes} min · ${w.active_days} day${w.active_days === 1 ? "" : "s"} active`,
    `🎯 ${w.correct_pct}% correct`,
    mastered,
    ...(coins ? [coins] : []),
  ].join("\n");
}

const DEFAULT_SETTINGS: KidSettingsT = {
  enabled_subjects: null,
  max_band: null,
  daily_limit_min: null,
  weekday_limits_min: null,
  tts_enabled: true,
  music_enabled: true,
  voice_volume: 1,
  sfx_volume: 1,
  music_volume: 1,
  quiet_enabled: false,
  quiet_windows: null,
  quiet_dim: true,
  quiet_volume: 0.15,
  voice_record_enabled: false,
  goal_min: null,
  focus_subject: null,
  focus_band: null,
  voice_tone: null,
  voice_speed: null,
  paused: false,
};

/** #272 — SAFETY: instant pause (parent kill-switch). EN + BN strings for the
 *  portal block — same country-pack seam as VOICE_LANGS. */
const PAUSE_LANGS = {
  en: {
    title: "⏸️ Instant pause",
    offHint: "Tap Pause to instantly stop all of {name}'s games. The kid sees a friendly “come back soon” screen — it stays paused even after a reload.",
    onHint: "{name}'s games are paused right now — the app blocks all play with a friendly “learning break” screen until you tap Resume.",
    pause: "⏸️ Pause games now",
    resume: "▶️ Resume games",
  },
  bn: {
    title: "⏸️ সাথে সাথে বিরতি",
    offHint: "{name}-এর সব খেলা সাথে সাথে থামাতে Pause চাপুন। বাচ্চাটি একটি বন্ধুত্বপূর্ণ “শীঘ্রই ফিরে এসো” স্ক্রিন দেখবে — রিলোড করলেও এটি পজড থাকবে।",
    onHint: "{name}-এর খেলা এখন থামানো আছে — আপনি Resume চাপা পর্যন্ত অ্যাপ একটি বন্ধুত্বপূর্ণ “শেখার বিরতি” স্ক্রিন দেখাবে।",
    pause: "⏸️ এখন খেলা থামান",
    resume: "▶️ খেলা চালু করুন",
  },
} as const;

/** #4 — 🔥 weekly streak + today's playtime vs the daily cap, for the
 *  "this week" card. EN + BN — same country-pack seam as PAUSE_LANGS. Fully
 *  derived from the weekly + settings data already loaded with the dashboard. */
const STREAK_LANGS = {
  en: {
    streakTitle: "🔥 {name}'s streak",
    streakNone: "No streak yet — a little play every day lights it up.",
    day: "day",
    days: "days",
    today: "Today",
    of: "of",
    minCap: "min · daily cap",
    min: "min",
    noCap: "no cap set",
    minutesWeek: "minutes this week",
  },
  bn: {
    streakTitle: "🔥 {name}-এর ধারাবাহিকতা",
    streakNone: "এখনো ধারাবাহিকতা নেই — প্রতিদিন একটু খেললেই তা জ্বলে উঠবে।",
    day: "দিন",
    days: "দিন",
    today: "আজ",
    of: "এর মধ্যে",
    minCap: "মিনিট · দৈনিক সীমা",
    min: "মিনিট",
    noCap: "সীমা নির্ধারিত নেই",
    minutesWeek: "এই সপ্তাহের মিনিট",
  },
} as const;

/** #79 — 🏆 mastery timeline: when each skill first hit ≥80%. EN + BN — same
 *  country-pack seam. Purely derived from the already-loaded mastery rows
 *  (their `mastered_at`), so it works offline after the dashboard loads. */
const TIMELINE_LANGS = {
  en: {
    title: "🏆 Mastery timeline",
    hint: "When {name} first mastered each skill — in order, newest first.",
    empty: "No skills mastered yet — first mastery will appear here.",
    mastered: "mastered",
    stillGoing: "still going",
    unknownDate: "earlier",
    subjects: "all subjects",
  },
  bn: {
    title: "🏆 দক্ষতা আয়ত্তের সময়রেখা",
    hint: "{name} কখন প্রতিটি দক্ষতা প্রথমবার আয়ত্ত করেছে — নতুন থেকে পুরনো ক্রমে।",
    empty: "এখনো কোনো দক্ষতা আয়ত্ত হয়নি — প্রথম আয়ত্ত এখানে দেখা যাবে।",
    mastered: "আয়ত্ত করেছে",
    stillGoing: "চলছে",
    unknownDate: "আগে",
    subjects: "সব বিষয়",
  },
} as const;

/** #7 — 🩺 local-only diagnostics card. EN + BN. Every line is read from THIS
 *  browser (error buffer, service worker, last sync, voice engine) and the
 *  export button downloads a text blob — nothing leaves the device. */
const DEBUG_LANGS = {
  en: {
    title: "🩺 Diagnostics",
    hint: "Reads only this browser — last errors, sync state, voice engine. Nothing leaves your device.",
    toggle: "🩺 Diagnostics",
    lastSync: "Last sync",
    never: "never",
    online: "online",
    offline: "offline",
    serviceWorker: "Service worker",
    notInstalled: "not installed",
    voice: "Voice engine",
    voices: "voices available",
    noVoice: "no voices on this device",
    errors: "Errors (last 20)",
    noErrors: "No errors recorded.",
    export: "📋 Export as text",
    exported: "Copied diagnostics to clipboard ✓",
    missing: "missing",
  },
  bn: {
    title: "🩺 ডায়াগনস্টিকস",
    hint: "শুধু এই ব্রাউজার পড়ে — শেষ ত্রুটি, সিঙ্ক অবস্থা, ভয়েস ইঞ্জিন। কিছুই আপনার ডিভাইস থেকে বের হয় না।",
    toggle: "🩺 ডায়াগনস্টিকস",
    lastSync: "সর্বশেষ সিঙ্ক",
    never: "কখনোই না",
    online: "অনলাইন",
    offline: "অফলাইন",
    serviceWorker: "সার্ভিস ওয়ার্কার",
    notInstalled: "ইনস্টল নেই",
    voice: "ভয়েস ইঞ্জিন",
    voices: "টি ভয়েস পাওয়া যায়",
    noVoice: "এই ডিভাইসে কোনো ভয়েস নেই",
    errors: "ত্রুটি (সর্বশেষ ২০টি)",
    noErrors: "কোনো ত্রুটি রেকর্ড হয়নি।",
    export: "📋 টেক্সট হিসেবে কপি করুন",
    exported: "ডায়াগনস্টিকস ক্লিপবোর্ডে কপি হয়েছে ✓",
    missing: "অনুপস্থিত",
  },
} as const;

/** #85 — sync status chip + manual sync in the topbar. EN + BN — same
 *  country-pack seam. Talks only to the app's own API; zero analytics. */
const SYNC_LANGS = {
  en: {
    online: "Online",
    offline: "Offline",
    synced: "synced",
    ago: "ago",
    justNow: "just now",
    syncNow: "↻ Sync now",
    syncing: "Syncing…",
    mins: "m",
    hr: "h",
  },
  bn: {
    online: "অনলাইন",
    offline: "অফলাইন",
    synced: "সিঙ্ক হয়েছে",
    ago: "আগে",
    justNow: "এইমাত্র",
    syncNow: "↻ এখন সিঙ্ক করুন",
    syncing: "সিঙ্ক হচ্ছে…",
    mins: "মি",
    hr: "ঘ",
  },
} as const;

/** #89 — per-skill missed questions: what a kid got wrong, so re-teaching is
 *  transparent. EN + BN strings for the portal card — same country-pack seam.
 *  Built purely from the already-loaded story ledger (offline-first). */
const MISSED_LANGS = {
  en: {
    title: "❌ Missed questions",
    hint: "What {name} got wrong, per skill — with the answer they picked and the right one, so you can see exactly where re-teaching is happening. Built right here from the story ledger we already load, so it works offline.",
    empty: "No misses recorded yet — wrong taps and missed rounds show up here.",
    picked: "picked",
    answer: "answer",
    reteaching: "🔁 reteaching",
    game: "Game",
  },
  bn: {
    title: "❌ ভুল উত্তর",
    hint: "{name} কী ভুল করেছে, দক্ষতা অনুযায়ী — কোন উত্তর বেছে নিয়েছিল আর সঠিক উত্তর কী, যাতে আবার শেখানো কোথায় হচ্ছে তা স্পষ্ট দেখা যায়। আমরা আগে যে স্টোরি লেজার লোড করি তা থেকেই তৈরি হয়, তাই অফলাইনে কাজ করে।",
    empty: "এখনো কোনো ভুল রেকর্ড হয়নি — ভুল ট্যাপ আর ভুল রাউন্ড এখানে দেখাবে।",
    picked: "বেছে নিয়েছে",
    answer: "উত্তর",
    reteaching: "🔁 আবার শেখানো হচ্ছে",
    game: "খেলা",
  },
} as const;

/** #89 — one missed question from the story ledger. Wrong-tap stories carry
 *  the exact two sides (picked vs answer) + Moni's fingerprint; scored-round
 *  misses carry the game + diagnosis. `reteaching` = Moni's action was a
 *  reteach that round. */
interface MissedQ {
  gameId: string;
  at: string;
  wrongAnswer: string | number | null;
  correctAnswer: string | number | null;
  errorKind: string | null;
  fingerprint: string | null;
  reteaching: boolean;
}

/** Per-skill group of recent misses (newest first, capped per skill). */
interface MissedSkill {
  skillId: string;
  misses: MissedQ[];
}

/** #89 — derive the per-skill missed-question list from the loaded stories
 *  (newest-first). Pure + client-side, offline-friendly, nothing fetched. */
function buildMissedQuestions(stories: LearningStoryRow[]): MissedSkill[] {
  const bySkill = new Map<string, MissedQ[]>();
  let count = 0;
  for (const s of stories) {
    if (s.outcome) continue; // only misses
    if (count++ >= 400) break; // cap the scan — newest first is what matters
    const arr = bySkill.get(s.skill_id) ?? [];
    arr.push({
      gameId: s.game_id,
      at: s.created_at,
      wrongAnswer: (typeof s.context?.wrongAnswer === "number" ? s.context.wrongAnswer : null) as string | number | null,
      correctAnswer: (typeof s.context?.correctAnswer === "number" ? s.context.correctAnswer : null) as string | number | null,
      errorKind: s.error_kind,
      fingerprint: (typeof s.context?.fingerprint === "string" ? s.context.fingerprint : null) as string | null,
      reteaching: s.action === "reteach",
    });
    bySkill.set(s.skill_id, arr);
  }
  return [...bySkill.entries()]
    .map(([skillId, misses]) => ({ skillId, misses: misses.slice(0, 5) }))
    .sort((a, b) => b.misses.length - a.misses.length)
    .slice(0, 8);
}

/** #89 — humanize a skill id ("count-pop-to-10" → "count pop to 10"). */
function skillLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** #257 — world bands a focus pin can target (1..7). */
const FOCUS_BANDS = [1, 2, 3, 4, 5, 6, 7];

/** #258 — per-kid VOICE preference. Tones are stable non-i18n handles that
 *  mirror the kid app's neural picker (warm female = the default); speed is a
 *  Web-Speech rate multiplier (1.0 = normal — the Bangla voice's own tempo is
 *  baked into its model). Same country-pack seam as WIZARD_LANGS: a new
 *  language = new en/bn keys, never a component rewrite. */
const VOICE_TONES = [
  { key: "female", en: "Warm adult (female)", bn: "উষ্ণ প্রাপ্তবয়স্ক (মেয়ে)" },
  { key: "kid", en: "Kid voice", bn: "বাচ্চার ভয়েস" },
  { key: "soft", en: "Soft female", bn: "নরম মেয়ে" },
  { key: "warm", en: "Friendly male", bn: "বন্ধুত্বপূর্ণ ছেলে" },
] as const;
const VOICE_SPEEDS = [
  { key: "slow", rate: 0.8, en: "Slower", bn: "ধীরে" },
  { key: "normal", rate: 1.0, en: "Normal", bn: "স্বাভাবিক" },
  { key: "fast", rate: 1.2, en: "Faster", bn: "দ্রুত" },
] as const;
const VOICE_LANGS = {
  en: {
    voice: "Voice",
    toneHint: "Which voice reads aloud to this kid",
    speed: "Speed",
    speedHint: "How fast Nova talks — the Bangla voice keeps its own warm tempo",
    try: "🔈 Try",
  },
  bn: {
    voice: "ভয়েস",
    toneHint: "এই বাচ্চার জন্য কোন ভয়েস পড়বে",
    speed: "গতি",
    speedHint: "নোভা কত দ্রুত কথা বলবে — বাংলা ভয়েসের নিজস্ব উষ্ণ গতি থাকে",
    try: "🔈 শুনুন",
  },
} as const;

/** #6 — day names for the per-weekday playtime editor (Mon..Sun). */
const WEEKDAYS = [
  { key: "mon", short: "Mon", full: "Monday" },
  { key: "tue", short: "Tue", full: "Tuesday" },
  { key: "wed", short: "Wed", full: "Wednesday" },
  { key: "thu", short: "Thu", full: "Thursday" },
  { key: "fri", short: "Fri", full: "Friday" },
  { key: "sat", short: "Sat", full: "Saturday" },
  { key: "sun", short: "Sun", full: "Sunday" },
] as const;
const LIMIT_CHOICES = [0, 30, 45, 60, 90] as const;
const WEEKDAY_DEFAULTS = [45, 45, 45, 45, 45, 90, 90]; // school vs weekend

/** #6 — read the current per-day array from settings (Mon..Sun). A legacy flat
 *  `daily_limit_min` shows as the same value every day; nothing set → the
 *  built-in defaults (45 school / 90 weekend). Mirrors todayLimitMin() in the
 *  kid app, so the portal display always matches what the kid app enforces. */
function weekdayLimits(s: KidSettingsT): number[] {
  if (s.weekday_limits_min) {
    const parts = s.weekday_limits_min.split(",").map((x) => parseInt(x, 10));
    if (parts.length === 7 && parts.every((n) => Number.isFinite(n))) return parts;
  }
  if (s.daily_limit_min && s.daily_limit_min > 0) {
    return Array(7).fill(s.daily_limit_min); // legacy flat cap → same every day
  }
  return [...WEEKDAY_DEFAULTS];
}
function writeWeekdayLimits(s: KidSettingsT, arr: number[]): KidSettingsT {
  return { ...s, weekday_limits_min: arr.join(",") };
}

/** #248 — per-day quiet windows (Mon..Sun). Each entry is "HH:MM-HH:MM" or "-"
 *  (no quiet time that day). Mirrors the kid-app parser exactly. */
const QUIET_DEFAULTS = ["-", "-", "-", "-", "-", "-", "-"];
function quietWindowsArr(s: KidSettingsT): string[] {
  if (s.quiet_windows) {
    const parts = s.quiet_windows.split(",");
    if (parts.length === 7) return parts.map((p) => (p.trim() ? p.trim() : "-"));
  }
  return [...QUIET_DEFAULTS];
}
function writeQuietWindows(s: KidSettingsT, arr: string[]): KidSettingsT {
  return { ...s, quiet_windows: arr.map((w) => (w && w.includes("-") ? w : "-")).join(",") };
}
/** Split one "HH:MM-HH:MM" entry into its two time strings (or "" when off). */
function quietWindowParts(entry: string): { start: string; end: string; on: boolean } {
  const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(entry.trim());
  if (!m) return { start: "", end: "", on: false };
  return { start: m[1], end: m[2], on: true };
}

function masteryPct(m: MasteryRow): number {
  return Math.min(100, Math.round(m.mastery * 100));
}

// ── #238 KOTHA weekly learning narrative ────────────────────────────────
// A plain-language "what happened this week" paragraph generated from the
// kid's Kotha stories. Pure + client-side: it takes only the stories the portal
// already fetched and the skill catalog, and returns EN + BN text. Nothing is
// re-sent to any server, so a parent's edits are edit-safe and stay local.

/** Misconception fingerprint codes (packages/core/src/moni/fingerprint.ts) →
 *  short parent-friendly phrasing, EN + BN. */
const NARR_MIS: Record<string, { en: string; bn: string }> = {
  "overcount-1": { en: "counts one too many", bn: "একটা বেশি গোনা" },
  "undercount-1": { en: "counts one too few", bn: "একটা কম গোনা" },
  "off-by-ten": { en: "mixing up tens and ones", bn: "দশকের ঘর আর এককের ঘর গুলিয়ে ফেলা" },
  "off-by-hundred": { en: "mixing up hundreds with the tens", bn: "শতক আর দশকের ঘর গুলিয়ে ফেলা" },
  double: { en: "doubling the answer", bn: "উত্তরটাকে দ্বিগুণ করে ফেলা" },
  half: { en: "halving the answer", bn: "উত্তরটাকে অর্ধেক করে ফেলা" },
  reversal: { en: "writing digits the wrong way round (like 6 ↔ 9)", bn: "অঙ্ক উল্টো করে লেখা (যেমন ৬ ↔ ৯)" },
  "repeated-error": { en: "repeating the same mistake", bn: "একই ভুল বারবার করা" },
};

// ── 🚀 #249 ACCELERATION PLAN ─────────────────────────────────────────────
// Why a skill was "skipped ahead" — the four reasons the kid app logs. The map
// IS the country-pack seam (like WIZARD_LANGS): add a locale key and the plan
// card follows — no component rewrites.
const ACCEL_REASONS: Record<string, { en: string; bn: string }> = {
  easy: { en: "Found it too easy — skipped ahead", bn: "খুব সহজ লেগেছে — এগিয়ে গিয়েছে" },
  know: { en: "Already knew it — skipped ahead", bn: "আগে থেকেই জানত — এগিয়ে গিয়েছে" },
  "moving-on": { en: "Moved on to the next lesson", bn: "পরের পাঠে এগিয়ে গিয়েছে" },
  parent: { en: "Skipped by a parent", bn: "অভিভাবক এগিয়ে নিয়ে গেছেন" },
};

// ── 🗓️ #251 MONTHLY REPORT ARCHIVE ────────────────────────────────────────
// A rolling 12-month archive of monthly learning summaries, generated
// CLIENT-SIDE from the activity feed (a large lazy fetch) — "offline-generated":
// after the fetch, every month is derived in-browser, nothing stored server-side.
// The month-name map IS the country-pack seam (like WIZARD_LANGS / ACCEL_REASONS).

const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_NAMES_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

/** The last `months` calendar months as `{ key, year, month, labelEn, labelBn }`
 *  (newest first, zero-filled so an idle month shows honestly). */
function rollingMonths(months = 12, now = new Date()): Array<{ key: string; labelEn: string; labelBn: string }> {
  const out: Array<{ key: string; labelEn: string; labelBn: string }> = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      key,
      labelEn: `${MONTH_NAMES_EN[d.getMonth()]} ${d.getFullYear()}`,
      labelBn: `${MONTH_NAMES_BN[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return out;
}

interface MonthSummary {
  key: string;
  rounds: number;
  correct: number;
  minutes: number;
  /** Top skills by rounds played that month (skill id + counts). */
  top: Array<{ id: string; rounds: number; correct: number }>;
}

/** Bucket activity rounds into the rolling 12-month archive. `activity` must be
 *  sorted newest-first (as the API returns it). Pure + offline. */
function buildMonthlyArchive(activity: ActivityRow[]): MonthSummary[] {
  const byKey = new Map<string, { rounds: number; correct: number; ms: number; skills: Map<string, { rounds: number; correct: number }> }>();
  for (const a of activity) {
    const key = a.created_at.slice(0, 7); // "2026-07-08…" → "2026-07"
    let b = byKey.get(key);
    if (!b) {
      b = { rounds: 0, correct: 0, ms: 0, skills: new Map() };
      byKey.set(key, b);
    }
    b.rounds += 1;
    if (a.correct) b.correct += 1;
    b.ms += a.response_ms ?? 0;
    const s = b.skills.get(a.skill_id) ?? { rounds: 0, correct: 0 };
    s.rounds += 1;
    if (a.correct) s.correct += 1;
    b.skills.set(a.skill_id, s);
  }
  return rollingMonths(12).map((m) => {
    const b = byKey.get(m.key);
    if (!b) return { key: m.key, rounds: 0, correct: 0, minutes: 0, top: [] };
    const top = [...b.skills.entries()]
      .map(([id, s]) => ({ id, ...s }))
      .sort((x, y) => y.rounds - x.rounds)
      .slice(0, 3);
    return { key: m.key, rounds: b.rounds, correct: b.correct, minutes: Math.round((b.ms / 60000) * 10) / 10, top };
  });
}

/** CSV export of the 12-month archive (and, if a month is selected, its top
 *  skills). Pure string builder — the caller owns the download blob. */
function archiveToCsv(rows: MonthSummary[]): string {
  const head = ["Month", "Rounds", "Correct", "Accuracy %", "Minutes", "Top skills"];
  const lines = rows.map((r) => {
    const acc = r.rounds ? Math.round((r.correct / r.rounds) * 100) : 0;
    const topTxt = r.top.map((t) => narrTitleEn(t.id)).join("; ");
    return [r.key, r.rounds, r.correct, acc, r.minutes, topTxt]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",");
  });
  return [head.join(","), ...lines].join("\n");
}

function narrTitleEn(id: string): string {
  return SKILLS.find((s) => s.id === id)?.title ?? id.replace(/-/g, " ");
}
function narrTitleBn(id: string): string {
  const s = SKILLS.find((x) => x.id === id);
  return s?.titleBn ?? narrTitleEn(id);
}

/** #79 — short "12 Aug" / "১২ আগস্ট" date for the mastery timeline. */
function shortDate(iso: string, lang: "en" | "bn"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (lang === "bn") {
    const BN_M = ["জানু", "ফেব্রু", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্ট", "অক্টো", "নভে", "ডিসে"];
    const BN_N = "০১২৩৪৫৬৭৮৯";
    const num = (n: number) => String(n).replace(/[0-9]/g, (x) => BN_N[Number(x)]);
    return `${num(d.getDate())} ${BN_M[d.getMonth()]}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** #85 — "2m ago" / "৩মি আগে" for the sync chip. */
function relTime(ms: number, lang: "en" | "bn"): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return lang === "bn" ? "এইমাত্র" : "just now";
  if (mins < 60) return `${lang === "bn" ? String(mins).replace(/[0-9]/g, (x) => "০১২৩৪৫৬৭৮৯"[Number(x)]) : mins}${lang === "bn" ? "মি" : "m"}`;
  const h = Math.round(mins / 60);
  return `${lang === "bn" ? String(h).replace(/[0-9]/g, (x) => "০১২৩৪৫৬৭৮৯"[Number(x)]) : h}${lang === "bn" ? "ঘ" : "h"}`;
}

/** One kid's play session, derived client-side from the activity feed. */
interface TimelineSession {
  /** Unique key (ISO start). */
  key: string;
  startISO: string;
  /** Local calendar day "YYYY-MM-DD" — what the parent sees in fmtTime. */
  date: string;
  rounds: number;
  correct: number;
  minutes: number;
  /** Skill ids whose BKT mastery crossed the threshold during this session. */
  mastered: string[];
}

/** Internal accumulator while grouping rounds into sessions. */
interface TimelineAcc {
  start: string;
  rounds: number;
  correct: number;
  ms: number;
  mastered: string[];
}

/** A 30-minute idle gap starts a new session. */
const SESSION_GAP_MS = 30 * 60 * 1000;
const SESSION_MASTERY = 0.8;

/** Port of the API's BKT mastery update (routers/progress.py `_bkt_update`).
 *  Replaying the activity feed with this reproduces server mastery exactly
 *  (default params) so we can attribute "mastered" crossings to the session
 *  they happened in — fully offline. */
function bktUpdate(m: number, correct: boolean, pLearn = 0.1, pGuess = 0.15, pSlip = 0.1): number {
  const p = m;
  const pCorrect = p * (1 - pSlip) + (1 - p) * pGuess;
  if (pCorrect <= 0) return p;
  const pGiven = correct ? (p * (1 - pSlip)) / pCorrect : (p * pSlip) / (1 - pCorrect);
  const g = Math.min(1, Math.max(0, pGiven));
  return Math.min(1, g + (1 - g) * pLearn);
}

function localDayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Group a kid's rounds (newest-first, as the API returns them) into play
 *  sessions and replay BKT to find which skills crossed mastery in each block.
 *  Pure + offline — built from the same full-history fetch as the archive. */
function buildSessionTimeline(activity: ActivityRow[]): TimelineSession[] {
  const events = [...activity].reverse(); // oldest → newest for replay
  const sessions: TimelineAcc[] = [];
  const mastery = new Map<string, number>();
  let cur: TimelineAcc | null = null;
  let prevTs = 0;
  for (const a of events) {
    const ts = Date.parse(a.created_at);
    if (cur && ts - prevTs > SESSION_GAP_MS) {
      sessions.push(cur);
      cur = null;
    }
    if (!cur) cur = { start: a.created_at, rounds: 0, correct: 0, ms: 0, mastered: [] };
    cur.rounds += 1;
    if (a.correct) cur.correct += 1;
    cur.ms += a.response_ms ?? 0;
    const before = mastery.get(a.skill_id) ?? 0;
    const after = bktUpdate(before, a.correct);
    mastery.set(a.skill_id, after);
    if (before < SESSION_MASTERY && after >= SESSION_MASTERY && !cur.mastered.includes(a.skill_id)) {
      cur.mastered.push(a.skill_id);
    }
    prevTs = ts;
  }
  if (cur) sessions.push(cur);
  sessions.reverse(); // newest first for display
  return sessions.map((s) => ({
    key: s.start,
    startISO: s.start,
    date: localDayKey(s.start),
    rounds: s.rounds,
    correct: s.correct,
    minutes: Math.round((s.ms / 60000) * 10) / 10,
    mastered: s.mastered,
  }));
}

/** i18n-extensible join for a list of titles. */
function narrListEn(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}
function narrListBn(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length === 2) return `${xs[0]} ও ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")} ও ${xs[xs.length - 1]}`;
}

interface KothaNarrative {
  en: string;
  bn: string;
}

/** Build the EN+BN "this week" paragraph from the last 7 days of stories.
 *  Returns null when there's nothing this week (the card then invites play). */
function buildWeeklyNarrative(kidName: string, stories: LearningStoryRow[]): KothaNarrative | null {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const week = stories.filter((s) => Date.now() - new Date(s.created_at).getTime() <= WEEK_MS);
  if (week.length === 0) return null;

  const bySkill = new Map<string, { total: number; correct: number }>();
  const byMis = new Map<string, number>();
  for (const s of week) {
    const e = bySkill.get(s.skill_id) ?? { total: 0, correct: 0 };
    e.total++;
    if (s.outcome) e.correct++;
    bySkill.set(s.skill_id, e);
    if (s.misconception_code) byMis.set(s.misconception_code, (byMis.get(s.misconception_code) ?? 0) + 1);
  }

  const ranked = [...bySkill.entries()].sort((a, b) => b[1].total - a[1].total);
  const topSkills = ranked.slice(0, 3);
  const highlight = [...bySkill.entries()].filter(([, e]) => e.correct > 0).sort((a, b) => b[1].correct - a[1].correct)[0];
  const struggle = [...bySkill.entries()]
    .filter(([, e]) => e.total - e.correct > 0)
    .sort((a, b) => b[1].total - b[1].correct - (a[1].total - a[1].correct))[0];

  // Most-repeated misconception on the struggle skill (if any).
  let misCode: string | null = null;
  if (struggle) {
    let best = 0;
    for (const s of week) {
      if (s.skill_id === struggle[0] && s.misconception_code) {
        const c = byMis.get(s.misconception_code) ?? 0;
        if (c > best) {
          best = c;
          misCode = s.misconception_code;
        }
      }
    }
  }

  const total = week.length;
  const wrong = week.length - week.filter((s) => s.outcome).length;

  // ── EN ──
  let en = `This week ${kidName} had ${total} learning moment${total === 1 ? "" : "s"} across ${narrListEn(topSkills.map(([id]) => narrTitleEn(id)))}.`;
  if (highlight) {
    const hl = highlight[1];
    en += ` ${kidName} was strongest at ${narrTitleEn(highlight[0])} — ${hl.correct}/${hl.total} right.`;
  } else {
    en += " Every correct answer is a win — lovely effort!";
  }
  if (struggle) {
    const st = struggle[1];
    en += ` ${narrTitleEn(struggle[0])} was trickiest (${st.total - st.correct} answer${st.total - st.correct === 1 ? "" : "s"} still to polish)`;
    if (misCode && NARR_MIS[misCode]) en += ` — the pattern we noticed: ${NARR_MIS[misCode].en}`;
    en += ". A little daily practice there will make it click.";
  } else {
    en += " No sticking points this week — smooth sailing!";
  }
  en += wrong > 0
    ? ` Keep the gentle rhythm going — ${kidName} is building a solid foundation.`
    : " Keep the daily rhythm going — consistency makes it stick!";

  // ── BN (natural Bangla, not phonetic) ──
  let bn = `এ সপ্তাহে ${kidName} করেছে ${total}টি শেখার মুহূর্ত — ${narrListBn(topSkills.map(([id]) => narrTitleBn(id)))}।`;
  if (highlight) {
    const hl = highlight[1];
    bn += ` ${kidName} সবচেয়ে ভালো করেছে ${narrTitleBn(highlight[0])} — ${hl.correct}/${hl.total}টি সঠিক উত্তর।`;
  } else {
    bn += " প্রতিটা সঠিক উত্তরের জন্য অনেক ভালো — দারুণ পরিশ্রম করেছে!";
  }
  if (struggle) {
    const st = struggle[1];
    bn += ` ${narrTitleBn(struggle[0])} একটু কঠিন লেগেছে — ${st.total - st.correct}টি উত্তর এখনও ঠিক করা বাকি`;
    if (misCode && NARR_MIS[misCode]) bn += ` — দেখা গেছে ${NARR_MIS[misCode].bn}`;
    bn += "। প্রতিদিন সামান্য অনুশীলন করলেই ঠিক হয়ে যাবে।";
  } else {
    bn += " এ সপ্তাহে কোনো আটকে যাওয়া নেই — দুর্দান্ত!";
  }
  bn += wrong > 0
    ? " ধীরে ধীরে এগিয়ে যাও — ভিত্তিটা মজবুত হচ্ছে।"
    : " প্রতিদিনের ছোট্ট অনুশীলনটাই সবচেয়ে বড় জাদু — এগিয়ে চলো!";

  return { en, bn };
}

/** Read a kid's saved narrative draft (edit-safe: localStorage only). */
function readNarrDraft(kidId: string): { en: string; bn: string; edited: boolean } | null {
  try {
    const raw = localStorage.getItem(`nv_kotha_nar_${kidId}`);
    return raw ? (JSON.parse(raw) as { en: string; bn: string; edited: boolean }) : null;
  } catch {
    return null;
  }
}

// ── #239 STRUGGLE ALERT — top Moni-flagged skills ───────────────────────
// Built from the same synced local wrong-answer ledger (#238's stories): the
// kid app's `wrongLedger` records every wrong tap per kid+skill, Moni classifies
// it (fatigue / misconception / gap / guessing), and the story rows carry that
// error_kind + a misconception code. We re-derive the flags client-side, so
// nothing new is fetched or sent — offline-friendly and privacy-safe.

interface FlaggedSkill {
  skillId: string;
  wrong: number;
  reason: { en: string; bn: string };
}

/** Top 3 skills with Moni flags in the last 7 days, strongest flag first.
 *  misconception > fatigue > gap/guessing > plain wrongs. Empty = no flags. */
function buildFlaggedSkills(stories: LearningStoryRow[]): FlaggedSkill[] {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const week = stories.filter((s) => !s.outcome && Date.now() - new Date(s.created_at).getTime() <= WEEK_MS);
  if (week.length === 0) return [];

  const bySkill = new Map<string, { wrong: number; fatigue: number; mis: number; gap: number; guessing: number; misCode?: string }>();
  for (const s of week) {
    const e = bySkill.get(s.skill_id) ?? { wrong: 0, fatigue: 0, mis: 0, gap: 0, guessing: 0 };
    e.wrong++;
    if (s.error_kind === "fatigue") e.fatigue++;
    else if (s.error_kind === "misconception") e.mis++;
    else if (s.error_kind === "gap") e.gap++;
    else if (s.error_kind === "guessing") e.guessing++;
    if (s.misconception_code) e.misCode = s.misconception_code;
    bySkill.set(s.skill_id, e);
  }

  const scored = [...bySkill.entries()]
    .map(([skillId, e]) => ({
      skillId,
      ...e,
      score: e.mis * 5 + e.fatigue * 4 + e.gap * 2 + e.guessing * 2 + e.wrong,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const reason = (f: (typeof scored)[number]): { en: string; bn: string } => {
    if (f.mis > 0 && f.misCode && NARR_MIS[f.misCode]) {
      return {
        en: `Moni spotted a pattern — ${NARR_MIS[f.misCode].en} (${f.mis}×). A side-by-side reteach will crack it.`,
        bn: `মনি একটি ধাঁচ ধরেছে — ${NARR_MIS[f.misCode].bn} (${f.mis} বার)। পাশাপাশি দেখিয়ে শেখালে সহজেই ঠিক হবে।`,
      };
    }
    if (f.fatigue > 0) {
      return {
        en: "Getting tired in long sessions — shorter, frequent rounds help.",
        bn: "লম্বা সেশনের শেষে ক্লান্ত হয়ে পড়ছে — ছোট আর নিয়মিত রাউন্ডে উপকার হবে।",
      };
    }
    if (f.gap > 0) {
      return {
        en: "Still building this concept — a reteach in a new way would help.",
        bn: "ধারণাটা এখনও তৈরি হচ্ছে — নতুনভাবে একটু শেখালে উপকার হবে।",
      };
    }
    if (f.guessing > 0) {
      return {
        en: "Guessing quickly instead of solving — easier rounds rebuild confidence.",
        bn: "সমাধানের বদলে অন্দাজে উত্তর দিচ্ছে — সহজ রাউন্ডে আত্মবিশ্বাস ফিরবে।",
      };
    }
    return {
      en: "A few mistakes this week — daily practice will smooth this out.",
      bn: "এ সপ্তাহে কিছু ভুল হয়েছে — নিয়মিত অনুশীলনে ঠিক হয়ে যাবে।",
    };
  };

  return scored.map((f) => ({ skillId: f.skillId, wrong: f.wrong, reason: reason(f) }));
}

/** Highest band among the skills a kid has attempted (0 = none yet). */
function kidCurrentBand(m: MasteryRow[]): number {
  let band = 0;
  for (const r of m) {
    if (r.attempts > 0) {
      const s = SKILLS.find((x) => x.id === r.skill_id);
      if (s && s.band > band) band = s.band;
    }
  }
  return band;
}

/** #243 — preview a volume layer at its current level, right in the portal.
 *  Pure client-side WebAudio (synthesized, zero assets) so the Try button works
 *  offline and nothing is ever sent anywhere. */
function trySoundPreview(kind: "voice" | "sfx" | "music", vol: number) {
  type AC = new () => AudioContext;
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext) as AC | undefined;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const t = ctx.currentTime;
    const note = (freq: number, at: number, dur: number, type: OscillatorType, v: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(v, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(at);
      o.stop(at + dur + 0.02);
    };
    const v = Math.max(0, Math.min(1, vol));
    if (kind === "voice") note(660, t, 0.7, "sine", 0.85 * v);
    else if (kind === "sfx") {
      note(660, t, 0.18, "triangle", 0.14 * v);
      note(880, t + 0.1, 0.2, "triangle", 0.14 * v);
    } else {
      note(523.25, t, 0.5, "triangle", 0.05 * v);
      note(659.25, t + 0.14, 0.5, "triangle", 0.05 * v);
      note(783.99, t + 0.28, 0.6, "triangle", 0.05 * v);
    }
  } catch {
    /* audio unavailable — the Try button is a no-op, never an error */
  }
}

/** #258 — play a real TTS sample with the selected tone + speed so a parent
 *  hears exactly what the kid would. Uses the portal's own language for the
 *  line; tone biases WHICH installed voice wins (warm → a male-ish name,
 *  female/soft → a female name, kid/any → best available), and speed scales
 *  the rate. No-op when the browser has no speech engine — never an error. */
function tryVoicePreview(tone: string, speed: number, lang: "en" | "bn") {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return;
  const bn = lang === "bn";
  const text = bn ? "এক, দুই, তিন — চলো পড়া শুরু করি!" : "One, two, three — let's begin reading!";
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bn ? "bn-BD" : "en-US";
  u.rate = Math.max(0.5, Math.min(2, 0.9 * (Number.isFinite(speed) ? speed : 1)));
  u.pitch = 1.1;
  const tag = bn ? "bn" : "en";
  const pool = synth.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(tag));
  if (pool.length) {
    const maleName = (n: string) => /male|daniel|david|george|alex|john/i.test(n);
    const femaleName = (n: string) => /female|feminine|woman|girl|samantha|siri|tessa|rani|karen/i.test(n);
    let match = pool;
    if (tone === "warm") match = pool.filter((v) => maleName(v.name));
    else if (tone === "female" || tone === "soft") match = pool.filter((v) => femaleName(v.name));
    if (!match.length) match = pool; // no gender-tagged voice — any same-language voice
    u.voice = match.find((v) => v.localService) ?? match[0];
  }
  synth.cancel();
  synth.speak(u);
}

export default function ParentDashboard() {
  const [token, setToken] = useState<string | null>(null);
  /** Gate: "checking" → validating the stored token server-side,
   *  "ok" → token proved valid, "anon" → no usable session (login gate). */
  const [authState, setAuthState] = useState<"checking" | "ok" | "anon">("checking");
  const [authNote, setAuthNote] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [mastery, setMastery] = useState<Record<string, MasteryRow[]>>({});
  const [settings, setSettings] = useState<Record<string, KidSettingsT>>({});
  const [activity, setActivity] = useState<Record<string, ActivityRow[]>>({});
  const [weekly, setWeekly] = useState<Record<string, WeeklyReport>>({});
  const [stories, setStories] = useState<Record<string, LearningStoryRow[]>>({});
  const [storyStats, setStoryStats] = useState<Record<string, StoryStats | null>>({});
  // 🚀 #249 — per-kid acceleration plans (skills skipped ahead + why + band jump).
  const [accel, setAccel] = useState<Record<string, AccelerationRow[]>>({});
  // 🗓️ #251 — monthly archive: the FULL activity feed per kid (lazy, up to 2000
  // rounds) + the selected month key. Summaries are derived client-side.
  const [archActivity, setArchActivity] = useState<Record<string, ActivityRow[]>>({});
  const [archLoading, setArchLoading] = useState(false);
  const [archMonth, setArchMonth] = useState<Record<string, string>>({});
  // 🧵 #255 — per-kid session-timeline day filter ("all" = no filter).
  const [sessionDay, setSessionDay] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("🦊");
  const [editBirthYear, setEditBirthYear] = useState(2021);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // #246 — guided multi-kid onboarding. Opens only when the account has NO kids
  // and this browser hasn't finished onboarding before (`nv_parent_onboarded`).
  const [onboarding, setOnboarding] = useState<"init" | "open" | "done">("init");
  const [onboardBusy, setOnboardBusy] = useState(false);
  const [onboardErr, setOnboardErr] = useState<string | null>(null);
  const [wizLang, setWizLang] = useState<WizardLang>("en");
  useEffect(() => {
    const saved = localStorage.getItem("nv_parent_lang");
    if (saved === "en" || saved === "bn") setWizLang(saved);
  }, []);

  // 🧏 #250 — GLOBAL accessibility toggles. One localStorage key (`nv_a11y`,
  // same origin as the kid app) → toggling here applies to BOTH areas; a
  // `storage` listener live-syncs the portal to the kid app and vice-versa.
  const [a11y, setA11y] = useState<A11yPrefs>(() => {
    try {
      return parseA11yPrefs(localStorage.getItem(a11yStorageKey()));
    } catch {
      return { ...A11Y_DEFAULTS };
    }
  });
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("nv-big-text", a11y.bigText);
    el.classList.toggle("nv-high-contrast", a11y.highContrast);
  }, [a11y]);
  useEffect(() => {
    // Cross-tab sync: the kid app (same origin) or another portal tab.
    const el = document.documentElement;
    const onStorage = (e: StorageEvent) => {
      if (e.key === a11yStorageKey()) {
        const next = parseA11yPrefs(e.newValue);
        el.classList.toggle("nv-big-text", next.bigText);
        el.classList.toggle("nv-high-contrast", next.highContrast);
        setA11y(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 🎨 #254 — dashboard light/dark theme. Persisted per-browser (portal-only,
  // unlike nv_a11y). Applied as a `theme-light` class on <html>; a `storage`
  // listener keeps other portal tabs in sync.
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("theme-light", theme === "light");
  }, [theme]);
  useEffect(() => {
    const el = document.documentElement;
    const onThemeStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) {
        const next = e.newValue === "light" ? "light" : "dark";
        el.classList.toggle("theme-light", next === "light");
        setTheme(next);
      }
    };
    window.addEventListener("storage", onThemeStorage);
    return () => window.removeEventListener("storage", onThemeStorage);
  }, []);

  // #7 — read the service-worker version (if any) for the diagnostics card.
  // Guarded: registration can reject (older browsers / private mode) → keep null.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const ctrl = navigator.serviceWorker.controller;
    if (ctrl) {
      setSwVersion(ctrl.scriptURL.split("/").pop() ?? ctrl.scriptURL);
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        const url = reg?.active?.scriptURL ?? reg?.installing?.scriptURL;
        if (url) setSwVersion(url.split("/").pop() ?? url);
      })
      .catch(() => {
        /* no SW — keep null */
      });
  }, []);

  // #85 — live online/offline for the sync chip (browser network events).
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // #238 — weekly narrative language + editable draft (localStorage only).
  const [narrLang, setNarrLang] = useState<"en" | "bn">("en");
  const [narrDraft, setNarrDraft] = useState<{ en: string; bn: string; edited: boolean } | null>(null);
  const [narrCopied, setNarrCopied] = useState(false);

  // #239 — reteach QR deep-links for flagged skills (client-side only).
  const [reteachQr, setReteachQr] = useState<Record<string, { title: string; dataUrl: string; code: string }>>({});
  const [reteachBusy, setReteachBusy] = useState(false);

  // #240 — side-by-side kid comparison (offline: derives from loaded state).
  const [cmpA, setCmpA] = useState<string | null>(null);
  const [cmpB, setCmpB] = useState<string | null>(null);

  // #245 — per-kid share-card deep link (minted lazily on first share).
  const [shareBusy, setShareBusy] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // #7/#85 — local diagnostics: when the dashboard data last synced (set on
  // every successful refreshAll), whether the diagnostics card is open, and the
  // SW version (read lazily; null until a service worker controls this page).
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  const [swVersion, setSwVersion] = useState<string | null>(null);
  // #85 — topbar sync chip: live online/offline + "synced X ago". Tracked from
  // the browser's network events; the manual button just re-runs refreshAll.
  const [online, setOnline] = useState(true);
  const [syncingNow, setSyncingNow] = useState(false);

  // #132 — printable worksheet from weak skills
  const [sheet, setSheet] = useState<{ name: string; items: WorksheetProblem[]; date: string } | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  // #139 — printable flashcard QR sheet (offline-first: pure client-side codes).
  // Each QR encodes "NV:<skillId>" — a kid scans (or types) it in the app to
  // jump straight into that mini-game, no network needed.
  const [qrCards, setQrCards] = useState<Array<{ skillId: string; title: string; dataUrl: string; code: string }> | null>(null);
  const [qrBusy, setQrBusy] = useState(false);

  // ── account & security ──
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [acctMsg, setAcctMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [acctBusy, setAcctBusy] = useState(false);

  /** End the session on this browser AND revoke it server-side, then land on
   *  the login page. Everything in localStorage with a parent-session key dies
   *  so no stale token can silently re-auth on a reload. */
  const doSignout = useCallback(async (tok: string) => {
    await signout(tok).catch(() => undefined);
    localStorage.removeItem("nv_parent_token");
    localStorage.removeItem("nv_parent_name");
    localStorage.removeItem("nv_kid_id");
    localStorage.removeItem("nv_kid_map");
    setToken(null);
    setProfile(null);
    setAuthState("anon");
    setAuthNote(null);
  }, []);

  const refreshAll = useCallback(
    async (tok: string) => {
      const k = await getKids(tok);
      setKids(k);
      setActiveId((prev) => (prev && k.some((x) => x.id === prev) ? prev : (k[0]?.id ?? null)));
      if (k.length === 0) {
        // #246 — first run (or all kids deleted): open the guided setup wizard,
        // but never nag a browser that already finished/skipped onboarding.
        if (!localStorage.getItem("nv_parent_onboarded")) setOnboarding("open");
        return;
      }
      // Load every kid up-front so the family overview + switcher are instant.
      const entries = await Promise.all(
        k.map(async (kid) => {
          const [m, s, a, w, st, sts, ac] = await Promise.all([
            getMastery(tok, kid.id),
            getKidSettings(tok, kid.id).catch(() => DEFAULT_SETTINGS),
            getActivity(tok, kid.id).catch(() => []),
            getWeekly(tok, kid.id).catch(() => null),
            getStories(tok, kid.id).catch(() => []),
            getStoryStats(tok, kid.id).catch(() => null),
            getAcceleration(tok, kid.id).catch(() => []),
          ]);
          return [kid.id, { m, s, a, w, st, sts, ac }] as const;
        })
      );
      const mm: Record<string, MasteryRow[]> = {};
      const ss: Record<string, KidSettingsT> = {};
      const aa: Record<string, ActivityRow[]> = {};
      const ww: Record<string, WeeklyReport> = {};
      const stt: Record<string, LearningStoryRow[]> = {};
      const sst: Record<string, StoryStats | null> = {};
      const acc: Record<string, AccelerationRow[]> = {};
      for (const [id, { m, s, a, w, st, sts, ac }] of entries) {
        mm[id] = m;
        ss[id] = s;
        aa[id] = a;
        if (w) ww[id] = w;
        stt[id] = st;
        sst[id] = sts;
        acc[id] = ac;
      }
      setMastery(mm);
      setSettings(ss);
      setActivity(aa);
      setWeekly(ww);
      setStories(stt);
      setStoryStats(sst);
      setAccel(acc);
      // #7/#85 — record when the dashboard data last came from the API, so the
      // diagnostics card + sync chip can say "synced X ago" (offline-safe).
      setLastSync(Date.now());
    },
    []
  );

  const reloadAccount = useCallback(async (tok: string) => {
    const [p, s] = await Promise.all([getProfile(tok), getSessions(tok)]);
    setProfile(p);
    setDisplayName(p.display_name ?? "");
    setSessions(s);
  }, []);

  // 🗓️ #251 — lazily fetch a kid's FULL activity history (up to 2000 rounds)
  // once per kid, then derive all 12 monthly summaries client-side (offline).
  const loadArchive = useCallback(async (kidId: string) => {
    if (!token || archActivity[kidId]) return;
    setArchLoading(true);
    try {
      const rows = await getActivity(token, kidId, 2000);
      setArchActivity((prev) => ({ ...prev, [kidId]: rows }));
    } catch {
      setError("Could not load the full history for the monthly archive.");
    } finally {
      setArchLoading(false);
    }
  }, [token, archActivity]);

  // Auto-load the archive once per kid (cached; the dashboard stays snappy for
  // accounts with many kids because it's the ONLY big activity fetch).
  useEffect(() => {
    if (activeId && token && !archActivity[activeId] && !archLoading) void loadArchive(activeId);
  }, [activeId, token, archActivity, archLoading, loadArchive]);

  useEffect(() => {
    const tok = localStorage.getItem("nv_parent_token");
    if (!tok) {
      setToken(null);
      setAuthState("anon");
      return;
    }
    setAuthState("checking");
    validateToken(tok).then((verdict) => {
      if (verdict === "ok") {
        // Only a token the API accepts unlocks the dashboard. This is the real
        // gate: presence of ANY string in nv_parent_token (shared, stale, or
        // forged — the kid app writes the same key) no longer grants access.
        setToken(tok);
        setAuthState("ok");
        refreshAll(tok).catch(() => setError("Could not load progress. Is the API running?"));
        reloadAccount(tok).catch(() => setError("Could not load account details."));
      } else if (verdict === "invalid") {
        localStorage.removeItem("nv_parent_token");
        localStorage.removeItem("nv_parent_name");
        localStorage.removeItem("nv_kid_id");
        localStorage.removeItem("nv_kid_map");
        setToken(null);
        setAuthState("anon");
        setAuthNote("Your session ended. Sign in again to view the portal.");
      } else {
        // Offline / API down — we cannot PROVE the session, so we never render
        // the dashboard with an unvalidated token. The stored token survives so
        // a reload (when back online) re-validates and re-enters.
        setToken(null);
        setAuthState("anon");
        setAuthNote("Can't check your session right now — make sure you're online, then sign in.");
      }
    });
  }, [refreshAll, reloadAccount]);

  const switchKid = useCallback(
    async (id: string) => {
      if (!token) return;
      setActiveId(id);
      if (mastery[id]) return; // already loaded (refreshAll fetches every kid)
      try {
        const [m, s, a, w, st, sts, ac] = await Promise.all([
          getMastery(token, id),
          getKidSettings(token, id).catch(() => DEFAULT_SETTINGS),
          getActivity(token, id).catch(() => []),
          getWeekly(token, id).catch(() => null),
          getStories(token, id).catch(() => []),
          getStoryStats(token, id).catch(() => null),
          getAcceleration(token, id).catch(() => []),
        ]);
        setMastery((prev) => ({ ...prev, [id]: m }));
        setSettings((prev) => ({ ...prev, [id]: s }));
        setActivity((prev) => ({ ...prev, [id]: a }));
        if (w) setWeekly((prev) => ({ ...prev, [id]: w }));
        setStories((prev) => ({ ...prev, [id]: st }));
        setStoryStats((prev) => ({ ...prev, [id]: sts }));
        setAccel((prev) => ({ ...prev, [id]: ac }));
      } catch {
        setError("Failed to load that kid.");
      }
    },
    [token, mastery]
  );

  // #238 — load the kid's saved narrative draft (edit-safe: localStorage).
  useEffect(() => {
    setNarrDraft(activeId ? readNarrDraft(activeId) : null);
    setNarrCopied(false);
  }, [activeId]);

  async function handleSaveSettings() {
    if (!token || !activeId) return;
    setBusy(true);
    setError(null);
    try {
      const s = settings[activeId] ?? DEFAULT_SETTINGS;
      await saveKidSettings(token, activeId, s);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to save settings.");
    } finally {
      setBusy(false);
    }
  }

  function patchSettings(patch: Partial<KidSettingsT>) {
    if (!activeId) return;
    setSettings((prev) => ({
      ...prev,
      [activeId]: { ...(prev[activeId] ?? DEFAULT_SETTINGS), ...patch },
    }));
  }

  async function handleReset() {
    if (!token || !activeId || !confirmReset) return;
    setBusy(true);
    setError(null);
    try {
      await resetKidProgress(token, activeId);
      setConfirmReset(false);
      await refreshAll(token);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to reset progress.");
    } finally {
      setBusy(false);
    }
  }

  /** #132 — build + show a printable worksheet from the kid's weak skills. */
  async function handleWorksheet() {
    if (!token || !activeId || sheetBusy) return;
    setSheetBusy(true);
    setError(null);
    try {
      const weak = await getWeakSkills(token, activeId);
      const active = kids.find((k) => k.id === activeId);
      setSheet({
        name: active?.name ?? "My kid",
        items: worksheetFor(weak, "en", Date.now() % 100000),
        date: new Date().toISOString().slice(0, 10),
      });
    } catch {
      setError("Couldn't load weak skills for the worksheet.");
    } finally {
      setSheetBusy(false);
    }
  }

  /** #139 — build a printable QR-card sheet for the games this kid has PLAYED.
   *  Cards are "real" (only played skills) so the deck stays small and relevant;
   *  each QR is pure client-side (offline-first, nothing leaves the browser). */
  async function handleQRCards() {
    if (!token || !activeId || qrBusy) return;
    setQrBusy(true);
    setError(null);
    try {
      const mastery = await getMastery(token, activeId);
      const played = new Set(mastery.map((m) => m.skill_id));
      const cards: NonNullable<typeof qrCards> = [];
      for (const s of SKILLS) {
        if (!s.game || !played.has(s.id)) continue;
        const code = `NV:${s.id}`;
        cards.push({
          skillId: s.id,
          title: s.title,
          dataUrl: await QRCode.toDataURL(code, { margin: 1, width: 170, errorCorrectionLevel: "M" }),
          code,
        });
      }
      setQrCards(cards);
    } catch {
      setError("Couldn't build the QR cards.");
    } finally {
      setQrBusy(false);
    }
  }

  async function handleDelete() {
    if (!token || !activeId || !confirmDelete) return;
    setBusy(true);
    setError(null);
    try {
      await deleteKid(token, activeId);
      setConfirmDelete(false);
      setShowAdd(false);
      await refreshAll(token);
    } catch {
      setError("Failed to delete kid.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!token || !editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const kid = await createKid(token, {
        name: editName.trim(),
        avatar: editAvatar,
        birth_year: editBirthYear,
      } satisfies NewKid);
      setShowAdd(false);
      setEditName("");
      setEditAvatar("🦊");
      await refreshAll(token);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to add kid.");
    } finally {
      setBusy(false);
    }
  }

  /** #246 — guided-first-run add. Same server call, but the wizard STAYS open so
   *  the parent can add 2+ kids back-to-back; on failure the entered values are
   *  kept (offline-friendly retry — nothing typed is ever lost). */
  async function handleOnboardCreate() {
    if (!token || !editName.trim() || onboardBusy) return;
    setOnboardBusy(true);
    setOnboardErr(null);
    const name = editName.trim();
    try {
      await createKid(token, {
        name,
        avatar: editAvatar,
        birth_year: editBirthYear,
      } satisfies NewKid);
      setEditName("");
      setEditAvatar("🦊");
      await refreshAll(token);
      setSavedTick((t) => t + 1);
    } catch {
      // Keep the form values so "Add kid" is a one-click retry once online.
      setOnboardErr(WIZARD_LANGS[wizLang].err.replace("{name}", name));
    } finally {
      setOnboardBusy(false);
    }
  }

  /** #246 — leave the wizard for the dashboard. Marks this browser done so the
   *  wizard never re-opens (even if all kids are deleted later). */
  function finishOnboarding() {
    localStorage.setItem("nv_parent_onboarded", "1");
    setOnboarding("done");
    setShowAdd(false);
  }

  async function handleRename() {
    if (!token || !activeId || !editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateKid(token, activeId, {
        name: editName.trim(),
        avatar: editAvatar,
        birth_year: editBirthYear,
      } satisfies NewKid);
      setEditName("");
      await refreshAll(token);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveName() {
    if (!token || !displayName.trim()) return;
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      const p = await updateProfile(token, displayName.trim());
      setProfile(p);
      localStorage.setItem("nv_parent_name", p.display_name ?? "Parent");
      setAcctMsg({ kind: "ok", text: "Display name saved." });
    } catch {
      setAcctMsg({ kind: "err", text: "Could not save display name." });
    } finally {
      setAcctBusy(false);
    }
  }

  async function handleChangePw() {
    if (!token) return;
    if (pwNew.length < 8) {
      setAcctMsg({ kind: "err", text: "New password must be at least 8 characters." });
      return;
    }
    if (pwNew !== pwConfirm) {
      setAcctMsg({ kind: "err", text: "New passwords don't match." });
      return;
    }
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      await changePassword(token, pwCurrent, pwNew);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setAcctMsg({ kind: "ok", text: "Password changed — every other device was signed out." });
      await reloadAccount(token);
    } catch {
      setAcctMsg({ kind: "err", text: "Password change failed — check your current password." });
    } finally {
      setAcctBusy(false);
    }
  }

  async function handleRevoke(sessionId: string, isCurrent: boolean) {
    if (!token) return;
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      await revokeSession(token, sessionId);
      if (isCurrent) {
        await doSignout(token); // revoked our own token → end the session here too
        return;
      }
      await reloadAccount(token);
      setAcctMsg({ kind: "ok", text: "That device was signed out." });
    } catch {
      setAcctMsg({ kind: "err", text: "Could not revoke that session." });
    } finally {
      setAcctBusy(false);
    }
  }

  async function handleSignoutAll() {
    if (!token) return;
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      await signoutAll(token);
    } catch {
      /* even if the network call fails, the local sign-out below protects THIS
         device — other sessions can be reset from any still-logged-in device */
    }
    await doSignout(token);
  }

  const active = kids.find((k) => k.id === activeId);
  const activeMastery = activeId ? mastery[activeId] ?? [] : [];
  const masteredCount = activeMastery.filter((m) => m.mastery >= 0.8).length;
  // #79 — 🏆 mastery timeline: every mastered skill, newest first by the moment
  // it first hit ≥80% (`mastered_at`). Rows without a stamp (oldest data) sort
  // last under "earlier". Purely from already-loaded mastery → offline after load.
  const masteryTimeline = activeMastery
    .filter((m) => m.mastery >= 0.8)
    .map((m) => ({ id: m.skill_id, at: m.mastered_at ?? null }))
    .sort((a, b) => {
      if (a.at && b.at) return a.at < b.at ? 1 : -1;
      return a.at ? -1 : b.at ? 1 : 0;
    });
  const activeSettings = activeId ? settings[activeId] ?? DEFAULT_SETTINGS : DEFAULT_SETTINGS;
  const EMPTY_WEEKLY: WeeklyReport = { days: [], rounds: 0, correct_pct: 0, minutes: 0, active_days: 0, mastered_this_week: [], mastered_today: [], top_game: null, streak: 0 };
  const activeWeekly = activeId ? weekly[activeId] ?? EMPTY_WEEKLY : EMPTY_WEEKLY;

  // #244 — today's headline from the rolling weekly report (server UTC day
  // buckets, matching the weekly endpoint). Fully offline: derived from data
  // already loaded with the dashboard; a reload "refreshes daily".
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayEntry = activeWeekly.days.find((d) => d.date === todayKey);
  const todayRounds = todayEntry?.rounds ?? 0;
  const todayMinutes = todayEntry?.minutes ?? 0;
  const todayMastered = activeWeekly.mastered_today ?? [];

  // #4 — 🔥 streak + today's playtime vs the DAY's cap. Uses the same
  // weekdayLimits() as the portal's own limit editor → matches the kid app.
  const weeklyStreak = activeWeekly.streak ?? 0;
  const todayCap = weekdayLimits(activeSettings)[(new Date().getDay() + 6) % 7] ?? 0;
  const todayCapPct = todayCap > 0 ? Math.min(100, Math.round((todayMinutes / todayCap) * 100)) : 0;

  // #238 — weekly narrative derived from the kid's Kotha stories.
  const weekNarrative = activeId && active ? buildWeeklyNarrative(active.name, stories[activeId] ?? []) : null;
  // #239 — top Moni-flagged skills this week, derived from the same stories.
  const flags = activeId ? buildFlaggedSkills(stories[activeId] ?? []) : [];
  // #89 — per-skill missed questions, derived from the same offline story ledger.
  const missedSkills = activeId ? buildMissedQuestions(stories[activeId] ?? []) : [];
  // 🚀 #249 — the kid's acceleration plan (skills skipped ahead, newest first —
  // the backend already sorts; offline-safe because it's already-loaded state).
  const accelRows = activeId ? accel[activeId] ?? [] : [];
  // 🗓️ #251 — the 12-month archive derived client-side from the full activity
  // feed (once loaded, fully offline). Selected month defaults to the newest.
  const activeArchive = activeId ? buildMonthlyArchive(archActivity[activeId] ?? []) : [];
  const archiveLoaded = !!activeId && !!archActivity[activeId];
  const selMonth = activeId ? (archMonth[activeId] ?? activeArchive[0]?.key ?? null) : null;
  const selSummary = activeArchive.find((m) => m.key === selMonth) ?? null;
  // 🧵 #255 — session timeline, derived client-side from the SAME full-history
  // feed as the archive (offline after load). Day filter is remembered per kid.
  const activeSessions = activeId ? buildSessionTimeline(archActivity[activeId] ?? []) : [];
  const sessionDays = [...new Set(activeSessions.map((s) => s.date))]
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 14);
  const selSessionDay = activeId ? (sessionDay[activeId] ?? "all") : "all";
  const visibleSessions =
    selSessionDay === "all" ? activeSessions : activeSessions.filter((s) => s.date === selSessionDay);
  // 🎮 #252 — game coverage: which games (per skill) the kid has tried. Derived
  // from the already-loaded mastery (attempts > 0) → fully offline, per-kid.
  const playedSkills = new Set(activeMastery.filter((m) => m.attempts > 0).map((m) => m.skill_id));
  const coverageGames = SKILLS.filter((s) => s.game).map((s) => ({ skill: s, tried: playedSkills.has(s.id) }));
  const coverageTotal = coverageGames.length;
  const coveragePlayed = coverageGames.filter((g) => g.tried).length;
  const coveragePct = coverageTotal ? Math.round((coveragePlayed / coverageTotal) * 100) : 0;
  const coverageBySubject = SUBJECTS.map((sub) => {
    const gs = coverageGames.filter((g) => g.skill.subject === sub.id);
    const tried = gs.filter((g) => g.tried).length;
    return { ...sub, total: gs.length, tried };
  }).filter((x) => x.total > 0);
  const untriedGames = coverageGames.filter((g) => !g.tried);
  const exportArchive = () => {
    if (!activeId || !active?.name || !activeArchive.length) return;
    const blob = new Blob([archiveToCsv(activeArchive)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `numberverse-monthly-${active.name}-${activeId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // #240 — side-by-side comparison of two kids, purely from loaded state.
  const cmpAId = cmpA ?? kids[0]?.id ?? "";
  const cmpBId = cmpB ?? kids[1]?.id ?? kids[0]?.id ?? "";
  const cmpMetric = (id: string) => {
    const m = mastery[id] ?? [];
    const w = weekly[id];
    const kid = kids.find((k) => k.id === id);
    return {
      id,
      name: kid?.name ?? "—",
      avatar: kid?.avatar ?? "🧒",
      mastered: m.filter((x) => x.mastery >= 0.8).length,
      inProgress: m.filter((x) => x.mastery < 0.8 && x.attempts > 0).length,
      band: kidCurrentBand(m),
      minutes: w?.minutes ?? 0,
      rounds: w?.rounds ?? 0,
      correctPct: w?.correct_pct ?? 0,
      activeDays: w?.active_days ?? 0,
      masteredWeek: (w?.mastered_this_week ?? []).length,
    };
  };
  const mtrA = cmpMetric(cmpAId);
  const mtrB = cmpMetric(cmpBId);
  const compareRows = [
    { label: "🏆 Skills mastered", a: String(mtrA.mastered), b: String(mtrB.mastered), higher: mtrA.mastered !== mtrB.mastered ? (mtrA.mastered > mtrB.mastered ? "a" : "b") : null },
    { label: "🚀 Current world", a: mtrA.band ? `World ${mtrA.band}` : "—", b: mtrB.band ? `World ${mtrB.band}` : "—", higher: mtrA.band !== mtrB.band ? (mtrA.band > mtrB.band ? "a" : "b") : null },
    { label: "🕒 Minutes this week", a: String(mtrA.minutes), b: String(mtrB.minutes), higher: mtrA.minutes !== mtrB.minutes ? (mtrA.minutes > mtrB.minutes ? "a" : "b") : null },
    { label: "🎮 Rounds this week", a: String(mtrA.rounds), b: String(mtrB.rounds), higher: mtrA.rounds !== mtrB.rounds ? (mtrA.rounds > mtrB.rounds ? "a" : "b") : null },
    { label: "🎯 Correct this week", a: `${mtrA.correctPct}%`, b: `${mtrB.correctPct}%`, higher: mtrA.correctPct !== mtrB.correctPct ? (mtrA.correctPct > mtrB.correctPct ? "a" : "b") : null },
    { label: "📅 Days active", a: String(mtrA.activeDays), b: String(mtrB.activeDays), higher: mtrA.activeDays !== mtrB.activeDays ? (mtrA.activeDays > mtrB.activeDays ? "a" : "b") : null },
    { label: "🆕 Mastered this week", a: String(mtrA.masteredWeek), b: String(mtrB.masteredWeek), higher: mtrA.masteredWeek !== mtrB.masteredWeek ? (mtrA.masteredWeek > mtrB.masteredWeek ? "a" : "b") : null },
    { label: "📖 Skills in progress", a: String(mtrA.inProgress), b: String(mtrB.inProgress), higher: null },
  ];
  const narrText =
    narrDraft && narrDraft.edited
      ? narrLang === "en"
        ? narrDraft.en
        : narrDraft.bn
      : narrLang === "en"
        ? (weekNarrative?.en ?? "")
        : (weekNarrative?.bn ?? "");

  /** #238 — edit-safe: the parent's changes are stored in this browser only
   *  (localStorage), never sent anywhere. */
  function onNarrativeEdit(text: string) {
    if (!activeId) return;
    const next = { ...(narrDraft ?? { en: "", bn: "", edited: false }), edited: true, [narrLang]: text };
    setNarrDraft(next);
    try {
      localStorage.setItem(`nv_kotha_nar_${activeId}`, JSON.stringify(next));
    } catch {
      /* private browsing — keep the draft in memory for this session */
    }
  }
  function handleRegenerateNarr() {
    if (!activeId) return;
    const next = { en: weekNarrative?.en ?? "", bn: weekNarrative?.bn ?? "", edited: false };
    setNarrDraft(next);
    try {
      localStorage.setItem(`nv_kotha_nar_${activeId}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  async function handleCopyNarr() {
    if (!narrText) return;
    try {
      await navigator.clipboard.writeText(narrText);
      setNarrCopied(true);
      window.setTimeout(() => setNarrCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing to show */
    }
  }

  /** #85 — manual sync: re-fetch every kid's progress from the app's own API.
   *  Sets the chip to "Syncing…", then `lastSync` updates on success. */
  const manualSync = useCallback(async () => {
    if (!token || syncingNow) return;
    setSyncingNow(true);
    try {
      await refreshAll(token);
    } catch {
      /* refreshAll surfaces its own error banner; chip just stays as-is */
    } finally {
      setSyncingNow(false);
    }
  }, [token, syncingNow, refreshAll]);

  /** #7 — export the local-only diagnostics as a plain-text blob (clipboard).
   *  No PII: kid names/ids/emails are never included — only browser/env facts. */
  async function exportDiagnostics() {
    const rows: string[] = [
      "Numberverse parent portal diagnostics",
      `time: ${new Date().toISOString()}`,
      `online: ${navigator.onLine ? "yes" : "no"}`,
      `last sync: ${lastSync ? new Date(lastSync).toISOString() : "never"}`,
      `service worker: ${swVersion ?? "not installed"}`,
      `user agent: ${navigator.userAgent}`,
      "--- errors (last 20) ---",
      ...(nvDiagErrors.length ? nvDiagErrors.map((e) => `${e.at}  ${e.msg}`) : ["(none)"]),
    ];
    const text = rows.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setDiagCopied(true);
      window.setTimeout(() => setDiagCopied(false), 2000);
    } catch {
      // Clipboard blocked → fall back to a download (still stays on-device).
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `numberverse-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  /** #245 — share-card deep link: mint the kid's opaque token (first share
   *  only) and append a UNIQUE per-kid link to the WhatsApp weekly card. The
   *  link opens an ANONYMOUS snapshot page — no name, no skill data, no
   *  tracking; only the parent can mint the token. */
  async function handleShareWeekly() {
    if (!token || !activeId || shareBusy) return;
    setShareBusy(true);
    setError(null);
    try {
      const shareToken = await getShareToken(token, activeId);
      const base = (typeof window !== "undefined" ? window.location.origin : "") + (process.env.NEXT_PUBLIC_BASE_PATH ?? "");
      const link = `${base}/share/?t=${encodeURIComponent(shareToken)}`;
      const text = weeklyShareText(active?.name ?? "My kid", activeWeekly) + `\n🔗 See the week: ${link}`;
      const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
      if (isAllowedExternalUrl(wa)) window.open(wa, "_blank", "noopener,noreferrer");
      setShareLink(link);
    } catch {
      setError("Couldn't create the share link.");
    } finally {
      setShareBusy(false);
    }
  }

  /** #239 — a reteach hook for a flagged skill: a QR the kid scans in the app
   *  (`NV:<skillId>`) to jump straight into that skill's game. Pure client-side
   *  QR, no network needed — matches the existing flashcard-card pattern. */
  async function handleReteachQr(skillId: string, title: string) {
    if (reteachQr[skillId] || reteachBusy) return;
    setReteachBusy(true);
    try {
      const code = `NV:${skillId}`;
      const dataUrl = await QRCode.toDataURL(code, { margin: 1, width: 160, errorCorrectionLevel: "M" });
      setReteachQr((prev) => ({ ...prev, [skillId]: { title, dataUrl, code } }));
    } catch {
      setError("Couldn't build the reteach QR.");
    } finally {
      setReteachBusy(false);
    }
  }

  // Family overview (aggregates every kid, not just the active one).
  const famMastered = kids.reduce(
    (sum, k) => sum + (mastery[k.id] ?? []).filter((m) => m.mastery >= 0.8).length,
    0
  );
  const famRounds = kids.reduce((sum, k) => sum + ((weekly[k.id]?.rounds as number) ?? 0), 0);
  const famMinutes = kids.reduce((sum, k) => sum + ((weekly[k.id]?.minutes as number) ?? 0), 0);
  const famActive = kids.filter((k) => ((weekly[k.id]?.active_days as number) ?? 0) > 0).length;

  // The dashboard renders ONLY after the server validates the token. While the
  // session is being checked we show a neutral shell, and any failure (invalid
  // OR unverifiable) lands on the login gate — never on parent data.
  if (authState !== "ok") {
    return (
      <main className="shell">
        <div className="logo">🔢</div>
        <h1>Parent Portal</h1>
        {authState === "checking" ? (
          <p className="center muted"><span className="spinner" aria-hidden />Checking your session…</p>
        ) : (
          <>
            <p className="center muted">Sign in to manage your children’s learning.</p>
            {authNote && <p className="center err" style={{ marginTop: 8 }}>{authNote}</p>}
          </>
        )}
        <div className="center" style={{ marginTop: 24 }}>
          {authState === "checking" ? (
            <Link className="btn btn-small ghost" href="/login">Sign in instead →</Link>
          ) : (
            <Link className="btn" href="/login">Go to login →</Link>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <span className="brand">🔢 <b>Numberverse</b> <span className="muted">Parent Portal</span></span>
        {/* 🧏 #250 — global accessibility toggles (shared with the kid app). */}
        <span className="a11y-toggle-group" role="group" aria-label="Accessibility">
          <button
            className={`a11y-toggle${a11y.bigText ? " on" : ""}`}
            onClick={() => {
              const next = { ...a11y, bigText: !a11y.bigText };
              setA11y(next);
              try {
                localStorage.setItem(a11yStorageKey(), a11yToStorage(next));
              } catch {
                /* ignore */
              }
            }}
            aria-pressed={a11y.bigText}
            title={A11Y_LANGS[wizLang].bigText}
            aria-label={A11Y_LANGS[wizLang].bigText}
          >
            🔍 <span className="a11y-toggle-label">{A11Y_LANGS[wizLang].bigText}</span>
          </button>
          <button
            className={`a11y-toggle${a11y.highContrast ? " on" : ""}`}
            onClick={() => {
              const next = { ...a11y, highContrast: !a11y.highContrast };
              setA11y(next);
              try {
                localStorage.setItem(a11yStorageKey(), a11yToStorage(next));
              } catch {
                /* ignore */
              }
            }}
            aria-pressed={a11y.highContrast}
            title={A11Y_LANGS[wizLang].highContrast}
            aria-label={A11Y_LANGS[wizLang].highContrast}
          >
            🎨 <span className="a11y-toggle-label">{A11Y_LANGS[wizLang].highContrast}</span>
          </button>
          {/* 🎨 #254 — dashboard light/dark theme toggle (portal-only, persisted). */}
          <button
            className={`a11y-toggle${theme === "light" ? " on" : ""}`}
            onClick={() => {
              const next = theme === "light" ? "dark" : "light";
              setTheme(next);
              try {
                localStorage.setItem(THEME_KEY, next);
              } catch {
                /* ignore */
              }
            }}
            aria-pressed={theme === "light"}
            title={THEME_LANGS[wizLang][theme === "light" ? "lightOn" : "darkOn"]}
            aria-label={THEME_LANGS[wizLang][theme === "light" ? "lightOn" : "darkOn"]}
          >
            {theme === "light" ? "☀️" : "🌙"} <span className="a11y-toggle-label">{THEME_LANGS[wizLang][theme]}</span>
          </button>
        </span>
        {/* #85 — sync status chip + manual sync (own-API only, no analytics). */}
        <span
          className={`sync-chip${online ? " on" : " off"}`}
          title={
            lastSync
              ? `${SYNC_LANGS[wizLang].synced} ${relTime(lastSync, wizLang)} ${SYNC_LANGS[wizLang].ago}`
              : SYNC_LANGS[wizLang].justNow
          }
        >
          <span className={`sync-dot ${online ? "ok" : "bad"}`} aria-hidden />
          {online ? SYNC_LANGS[wizLang].online : SYNC_LANGS[wizLang].offline}
          {lastSync && online && (
            <span className="sync-when">
              {" · "}
              {SYNC_LANGS[wizLang].synced} {relTime(lastSync, wizLang)}
            </span>
          )}
          <button
            className="sync-btn"
            disabled={syncingNow}
            onClick={() => void manualSync()}
            aria-label={SYNC_LANGS[wizLang].syncNow}
            title={SYNC_LANGS[wizLang].syncNow}
          >
            {syncingNow ? SYNC_LANGS[wizLang].syncing : SYNC_LANGS[wizLang].syncNow}
          </button>
        </span>
        <span className="topbar-user" title={profile?.email ?? "signed in"}>
          {profile?.display_name ?? "Parent"} 👨‍👩‍👧
        </span>
        <button className="btn btn-small ghost" onClick={() => token && doSignout(token)}>
          Sign out
        </button>
      </header>

      {error && <p className="err banner">{error}</p>}

      {/* #246 — guided multi-kid onboarding (first run with no kids) */}
      {onboarding === "open" && !error && (
        <section className="card onboarding-card">
          <div className="onboard-head">
            <h2>{WIZARD_LANGS[wizLang].title}</h2>
            <button
              className="onboard-lang"
              onClick={() => {
                const next: WizardLang = wizLang === "en" ? "bn" : "en";
                setWizLang(next);
                localStorage.setItem("nv_parent_lang", next);
              }}
              title="EN / বাংলা"
            >
              {WIZARD_LANGS[wizLang].lang}
            </button>
          </div>
          <p className="onboard-step">
            {kids.length === 0 ? WIZARD_LANGS[wizLang].step0 : WIZARD_LANGS[wizLang].stepN}
          </p>

          <div className="avatar-row">
            {AVATARS.map((a) => (
              <button
                key={a}
                className={`avatar-pick${editAvatar === a ? " on" : ""}`}
                onClick={() => setEditAvatar(a)}
                aria-label={a}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              {WIZARD_LANGS[wizLang].nameLabel}
              <input
                id="onboard-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={wizLang === "en" ? "e.g. Aria" : "যেমন: আরিয়া"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editName.trim() && !onboardBusy) void handleOnboardCreate();
                }}
              />
            </label>
            <label>
              {WIZARD_LANGS[wizLang].birthLabel}
              <input
                type="number"
                min={2010}
                max={2030}
                value={editBirthYear}
                onChange={(e) => setEditBirthYear(Number(e.target.value) || 2021)}
              />
            </label>
          </div>
          <div className="row-buttons">
            <button className="btn primary" disabled={onboardBusy || !editName.trim()} onClick={handleOnboardCreate}>
              {onboardBusy ? WIZARD_LANGS[wizLang].adding : WIZARD_LANGS[wizLang].add}
            </button>
          </div>

          {onboardErr && <p className="err inline">{onboardErr}</p>}

          {kids.length >= 1 && (
            <div className="onboard-added">
              <div className="onboard-chips">
                {kids.map((k) => (
                  <span className="onboard-chip" key={k.id}>
                    {k.avatar ?? "🧒"} {k.name}
                  </span>
                ))}
              </div>
              <p className="onboard-ok">{WIZARD_LANGS[wizLang].addedAll}</p>
            </div>
          )}

          <div className="onboard-actions">
            <button
              className="btn ghost"
              disabled={onboardBusy}
              onClick={() => document.getElementById("onboard-name")?.focus()}
            >
              {WIZARD_LANGS[wizLang].addAnother}
            </button>
            <button className="btn primary" disabled={onboardBusy} onClick={finishOnboarding}>
              {kids.length === 0 ? WIZARD_LANGS[wizLang].notNow : WIZARD_LANGS[wizLang].finish}
            </button>
          </div>
        </section>
      )}

      {/* After onboarding (or skipped): a plain empty state with a fast path in */}
      {kids.length === 0 && onboarding === "done" && !error && (
        <div className="empty-state">
          <p className="hint center">{WIZARD_LANGS[wizLang].noKidsDone}</p>
          <div className="row-buttons center">
            <button className="btn primary" onClick={() => { setShowAdd(true); setEditName(""); setEditAvatar("🦊"); }}>
              ＋ {wizLang === "en" ? "Add your first kid" : "প্রথম বাচ্চা যোগ করুন"}
            </button>
          </div>
        </div>
      )}

      {/* ── family overview ── */}
      {kids.length > 0 && (
        <section className="card overview">
          <h2>👨‍👩‍👧 Family overview</h2>
          <div className="stat-tiles">
            <div className="tile">
              <span className="tile-num">{kids.length}</span>
              <span className="tile-label">kids</span>
            </div>
            <div className="tile">
              <span className="tile-num">{famMastered}</span>
              <span className="tile-label">skills mastered</span>
            </div>
            <div className="tile">
              <span className="tile-num">{famRounds}</span>
              <span className="tile-label">rounds this week</span>
            </div>
            <div className="tile">
              <span className="tile-num">{famMinutes}</span>
              <span className="tile-label">min this week</span>
            </div>
            <div className="tile">
              <span className="tile-num">{famActive}</span>
              <span className="tile-label">active this week</span>
            </div>
          </div>
        </section>
      )}

      {/* ── kid switcher ── */}
      <section className="kids-row">
        {kids.map((k) => {
          const isActive = k.id === activeId;
          return (
            <button
              key={k.id}
              className={`kid-chip${isActive ? " on" : ""}`}
              onClick={() => switchKid(k.id)}
            >
              <span className="kid-avatar">{k.avatar ?? "🧒"}</span>
              <span className="kid-name">{k.name}</span>
              <span className="kid-year">{k.birth_year ?? "—"}</span>
            </button>
          );
        })}
        <button className="kid-chip add" onClick={() => { setShowAdd((s) => !s); setConfirmReset(false); setConfirmDelete(false); }}>
          <span className="kid-avatar">＋</span>
          <span className="kid-name">Add kid</span>
        </button>
      </section>

      {/* ── add-kid form ── */}
      {showAdd && (
        <section className="card add-kid">
          <h2>Add a new kid</h2>
          <div className="avatar-row">
            {AVATARS.map((a) => (
              <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)}>
                {a}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              Name
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Aria" />
            </label>
            <label>
              Birth year
              <input
                type="number"
                min={2010}
                max={2030}
                value={editBirthYear}
                onChange={(e) => setEditBirthYear(Number(e.target.value) || 2021)}
              />
            </label>
          </div>
          <div className="row-buttons">
            <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleCreate}>
              {busy ? "Adding…" : "Add kid"}
            </button>
            <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </section>
      )}

      {active && (
        <>
          {/* ── progress summary ── */}
          <section className="card summary">
            <div className="summary-head">
              <span className="big-avatar">{active.avatar ?? "🧒"}</span>
              <div className="summary-meta">
                <h2>{active.name} <small>(born {active.birth_year ?? "—"})</small></h2>
                <p className="muted">
                  {masteredCount} mastered · {activeMastery.length} skills in progress
                </p>
              </div>
            </div>
            <div className="overall-bar">
              <div className="overall-fill" style={{ width: `${activeMastery.length ? Math.round((masteredCount / activeMastery.length) * 100) : 0}%` }} />
            </div>
          </section>

          {/* #244 — daily play summary: today's headline on open */}
          <section className="card daily-card">
            <div className="daily-head">
              <h2>☀️ Today</h2>
              <span className="muted small">
                {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </span>
            </div>
            {todayRounds === 0 && todayMastered.length === 0 ? (
              <p className="muted">
                Nothing yet today — a little playtime lights up this card. 🌱
              </p>
            ) : (
              <p className="daily-line">
                <b>{todayRounds}</b> round{todayRounds === 1 ? "" : "s"} ·{" "}
                <b>{todayMinutes}</b> min played
                {todayMastered.length > 0 && (
                  <>
                    {" "}· 🏆 mastered <b>{todayMastered.length}</b>{" "}
                    {todayMastered.length === 1 ? "skill" : "skills"}:{" "}
                    <strong>{todayMastered.map((id) => narrTitleEn(id)).join(", ")}</strong>
                  </>
                )}
              </p>
            )}
          </section>

          {/* ── this week (the "show me my kid learned" card) ── */}
          <section className="card weekly">
            <div className="weekly-head">
              <h2>📊 This week</h2>
              {weeklyStreak > 0 && (
                <span className="streak-badge" title={STREAK_LANGS[wizLang].streakTitle.replace("{name}", active.name)}>
                  🔥 {weeklyStreak}{" "}
                  <span className="streak-days">{weeklyStreak === 1 ? STREAK_LANGS[wizLang].day : STREAK_LANGS[wizLang].days}</span>
                </span>
              )}
              {activeWeekly.rounds > 0 && (
                <button
                  className="share-btn"
                  disabled={shareBusy}
                  onClick={() => void handleShareWeekly()}
                  title="Share this week on WhatsApp with a private, anonymous link"
                >
                  {shareBusy ? "Preparing…" : "Share on WhatsApp"}
                </button>
              )}
              {shareLink && (
                <span className="share-link-note">
                  🔗{" "}
                  <code>{shareLink}</code>{" "}
                  <button
                    className="ghost-btn small"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareLink);
                        setShareCopied(true);
                        window.setTimeout(() => setShareCopied(false), 1500);
                      } catch {
                        /* clipboard unavailable */
                      }
                    }}
                  >
                    {shareCopied ? "✓ Copied" : "Copy link"}
                  </button>
                  <span className="muted small">opens a private, anonymous week snapshot</span>
                </span>
              )}
            </div>
            {activeWeekly.rounds === 0 ? (
              <p className="muted">No rounds this week yet — have {active.name} play a game and this report comes alive.</p>
            ) : (
              <>
                <div className="stat-tiles">
                  <div className="tile">
                    <span className="tile-num">{activeWeekly.rounds}</span>
                    <span className="tile-label">rounds</span>
                  </div>
                  <div className="tile">
                    <span className="tile-num">{activeWeekly.correct_pct}%</span>
                    <span className="tile-label">correct</span>
                  </div>
                  <div className="tile">
                    <span className="tile-num">{activeWeekly.minutes}</span>
                    <span className="tile-label">{STREAK_LANGS[wizLang].minutesWeek}</span>
                  </div>
                  <div className="tile">
                    <span className="tile-num">{activeWeekly.active_days}</span>
                    <span className="tile-label">days active</span>
                  </div>
                </div>
                {todayCap > 0 && (
                  <div className="cap-row">
                    <div className="cap-meta">
                      <span>
                        {STREAK_LANGS[wizLang].today} {Math.round(todayMinutes)} {STREAK_LANGS[wizLang].of}{" "}
                        {todayCap} {STREAK_LANGS[wizLang].minCap}
                      </span>
                      <span className="cap-pct">{todayCapPct}%</span>
                    </div>
                    <div className="cap-track">
                      <div className="cap-fill" style={{ width: `${todayCapPct}%` }} />
                    </div>
                  </div>
                )}
                <div className="week-bars">
                  {activeWeekly.days.map((d) => (
                    <div key={d.date} className="week-col" title={`${weekdayShort(d.date)}: ${d.rounds} rounds`}>
                      <div className="week-bar" style={{ height: `${activeWeekly.days.length ? Math.max(4, Math.round((d.rounds / Math.max(1, ...activeWeekly.days.map((x) => x.rounds))) * 60)) : 0}px` }} />
                      <span className="week-day">{weekdayShort(d.date)}</span>
                    </div>
                  ))}
                </div>
                {activeWeekly.mastered_this_week.length > 0 && (
                  <p className="muted small" style={{ marginTop: "10px" }}>
                    🏆 Mastered this week:{" "}
                    <strong>{activeWeekly.mastered_this_week.map((s) => s.replace(/-/g, " ")).join(", ")}</strong>
                  </p>
                )}
              </>
            )}
          </section>

          {/* #79 — 🏆 mastery timeline: when each skill was won */}
          <section className="card timeline-card">
            <h2>{TIMELINE_LANGS[wizLang].title}</h2>
            <p className="muted small">{TIMELINE_LANGS[wizLang].hint.replace("{name}", active.name)}</p>
            {masteryTimeline.length === 0 ? (
              <p className="muted">{TIMELINE_LANGS[wizLang].empty}</p>
            ) : (
              <ol className="timeline-list">
                {masteryTimeline.map((m) => (
                  <li key={m.id} className="timeline-row">
                    <span className="timeline-dot" aria-hidden="true" />
                    <span className="timeline-name">
                      {narrTitleEn(m.id)}
                      {narrTitleBn(m.id) !== narrTitleEn(m.id) && (
                        <span className="muted small"> · {narrTitleBn(m.id)}</span>
                      )}
                    </span>
                    <span className="timeline-date">
                      {m.at ? (
                        <>
                          {shortDate(m.at, wizLang)} <span className="muted small">· {TIMELINE_LANGS[wizLang].mastered}</span>
                        </>
                      ) : (
                        TIMELINE_LANGS[wizLang].unknownDate
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* #237 — per-kid reading & story progress view */}
          <section className="card reading-card">
            <h2>📚 Reading & stories</h2>
            <p className="muted small">
              Which read-aloud books and story quizzes {active.name} has finished — and how they scored.
              Every story game stays on the kid's device data, so this works offline too.
            </p>
            {readingSkills.length === 0 ? (
              <p className="muted">No story games in the catalog yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Story</th>
                    <th>Progress</th>
                    <th>Score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {readingSkills.map((s) => {
                    const m = activeMastery.find((x) => x.skill_id === s.id);
                    const pct = m ? Math.min(100, Math.round(m.mastery * 100)) : 0;
                    const status = !m ? "🌱 Not started" : m.mastery >= 0.8 ? "✅ Finished" : "🔶 In progress";
                    return (
                      <tr key={s.id}>
                        <td>
                          {s.title}
                          {s.titleBn ? <span className="muted small"> · {s.titleBn}</span> : null}
                        </td>
                        <td>
                          {m ? (
                            <>
                              <div className="bar">
                                <div className={`fill${m.mastery >= 0.8 ? " done" : ""}`} style={{ width: `${pct}%` }} />
                              </div>
                              {pct}%
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{m ? `${m.correct}/${m.attempts}` : "—"}</td>
                        <td>{status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* #238 — auto-generated weekly learning narrative from Kotha */}
          <section className="card narrative-card">
            <div className="narrative-head">
              <h2>📖 {active.name}'s week in words</h2>
              <div className="row-buttons" role="group" aria-label="Narrative language">
                <button
                  className={`toggle-chip${narrLang === "en" ? " on" : ""}`}
                  onClick={() => setNarrLang("en")}
                >
                  English
                </button>
                <button
                  className={`toggle-chip${narrLang === "bn" ? " on" : ""}`}
                  onClick={() => setNarrLang("bn")}
                >
                  বাংলা
                </button>
              </div>
            </div>
            <p className="muted small">
              A plain-language summary of what {active.name} practiced and found tricky this week,
              drawn from the learning stories the app recorded. It is written right here in your
              browser — edit it freely, and nothing you type is ever sent to a server.
            </p>
            {weekNarrative ? (
              <>
                <textarea
                  className="narrative-edit"
                  rows={7}
                  value={narrText}
                  onChange={(e) => onNarrativeEdit(e.target.value)}
                  aria-label="Weekly learning narrative (editable)"
                />
                <div className="row-buttons">
                  <button className="btn ghost-btn" onClick={handleRegenerateNarr}>
                    ↺ Regenerate
                  </button>
                  <button className="btn ghost-btn" onClick={() => void handleCopyNarr()}>
                    {narrCopied ? "✓ Copied" : "📋 Copy text"}
                  </button>
                </div>
                <p className="muted small" style={{ marginTop: 8 }}>
                  💾 Your edits stay in this browser only — safe to tweak and share however you like.
                </p>
              </>
            ) : (
              <p className="muted">
                No learning stories for this week yet — have {active.name} play a few rounds and a
                summary appears here.
              </p>
            )}
          </section>

          {/* #239 — struggle alert: top Moni-flagged skills this week */}
          <section className="card alert-card">
            <h2>🚨 Needs a little help</h2>
            <p className="muted small">
              Skills where Moni flagged a misconception or tiredness this week — read from{" "}
              {active.name}’s learning stories on this device, nothing extra is sent anywhere.
            </p>
            {flags.length === 0 ? (
              <p className="muted">No flags this week — {active.name}’s learning is on a steady climb! 🎉</p>
            ) : (
              <ul className="alert-list">
                {flags.map((f) => (
                  <li key={f.skillId} className="alert-row">
                    <div className="alert-main">
                      <strong>{narrTitleEn(f.skillId)}</strong>
                      {narrTitleBn(f.skillId) !== narrTitleEn(f.skillId) && (
                        <span className="muted small"> · {narrTitleBn(f.skillId)}</span>
                      )}
                      <p className="alert-reason small">
                        {narrLang === "bn" ? f.reason.bn : f.reason.en}
                      </p>
                    </div>
                    <button
                      className="btn ghost-btn small"
                      disabled={reteachBusy}
                      onClick={() => void handleReteachQr(f.skillId, narrTitleEn(f.skillId))}
                    >
                      {reteachQr[f.skillId] ? "✓ QR ready" : "🔄 Reteach QR"}
                    </button>
                    {reteachQr[f.skillId] && (
                      <div className="reteach-qr">
                        <img
                          src={reteachQr[f.skillId].dataUrl}
                          alt={`QR code to open ${reteachQr[f.skillId].title} in the kid app`}
                          width={116}
                          height={116}
                        />
                        <span className="muted small">
                          Scan in the kid app to open {reteachQr[f.skillId].title}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 🚀 #249 — acceleration plan: skills the kid skipped ahead past + why */}
          <section className="card accel-card">
            <h2>🚀 Acceleration plan</h2>
            <p className="muted small">
              Skills {active.name} skipped ahead past in the kid app (marked “I already know
              this”), with the world-band jump. Read from the dashboard’s already-loaded data —
              it works offline.
            </p>
            {accelRows.length === 0 ? (
              <p className="muted">
                No skips yet — when {active.name} skips a lesson in the app it lands here.
              </p>
            ) : (
              <ul className="accel-list">
                {accelRows.map((row) => (
                  <li key={row.id} className="accel-row">
                    <div className="accel-main">
                      <span className="accel-ico">⏭</span>
                      <div>
                        <strong>{narrTitleEn(row.skill_id)}</strong>
                        {narrTitleBn(row.skill_id) !== narrTitleEn(row.skill_id) && (
                          <span className="muted small"> · {narrTitleBn(row.skill_id)}</span>
                        )}
                        <p className="accel-reason small">
                          {narrLang === "bn" ? ACCEL_REASONS[row.reason]?.bn : ACCEL_REASONS[row.reason]?.en}
                        </p>
                      </div>
                    </div>
                    <span className="accel-jump">Band {row.band_from} → {row.band_to}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 🗓️ #251 — rolling 12-month archive, derived client-side from the
              full activity history (offline-generated after one lazy fetch). */}
          <section className="card archive-card">
            <div className="archive-head">
              <h2>🗓️ Monthly archive</h2>
              <button
                className="btn ghost-btn small"
                onClick={exportArchive}
                disabled={!archiveLoaded || activeArchive.length === 0}
              >
                ⬇️ Export CSV
              </button>
            </div>
            <p className="muted small">
              The last 12 months of {active.name}’s learning at a glance — rounds, time and the
              skills that got the most play. Generated right here in your browser from the
              history we load once, so it works offline after that.
            </p>
            {!archiveLoaded ? (
              <p className="muted">
                {archLoading ? "Loading full history…" : "The archive needs the full history — it loads automatically."}
              </p>
            ) : (
              <>
                <div className="archive-grid" role="tablist" aria-label="Select a month">
                  {activeArchive.map((m) => {
                    const mm = rollingMonths(12).find((x) => x.key === m.key);
                    const active = m.key === selMonth;
                    return (
                      <button
                        key={m.key}
                        className={`archive-month${active ? " on" : ""}${m.rounds === 0 ? " empty" : ""}`}
                        onClick={() => setArchMonth((prev) => ({ ...prev, [activeId]: m.key }))}
                        role="tab"
                        aria-selected={active}
                      >
                        <span className="archive-month-label">
                          {narrLang === "bn" ? mm?.labelBn : mm?.labelEn}
                        </span>
                        <span className="archive-month-num">
                          {m.rounds === 0 ? "—" : `${m.rounds} rounds`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selSummary && (
                  <div className="archive-detail">
                    <div className="archive-stats">
                      <span className="archive-stat"><b>{selSummary.rounds}</b> rounds</span>
                      <span className="archive-stat"><b>{selSummary.rounds ? Math.round((selSummary.correct / selSummary.rounds) * 100) : 0}%</b> correct</span>
                      <span className="archive-stat"><b>{selSummary.minutes}</b> min</span>
                    </div>
                    {selSummary.top.length > 0 && (
                      <ul className="archive-top">
                        {selSummary.top.map((t) => (
                          <li key={t.id} className="archive-top-row">
                            <span className="archive-top-title">
                              {narrTitleEn(t.id)}
                              {narrTitleBn(t.id) !== narrTitleEn(t.id) && (
                                <span className="muted small"> · {narrTitleBn(t.id)}</span>
                              )}
                            </span>
                            <span className="archive-top-count">
                              {t.rounds} rounds · {t.rounds ? Math.round((t.correct / t.rounds) * 100) : 0}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* 🧵 #255 — session timeline: play blocks (date, rounds, accuracy,
              mastered skills) grouped client-side from the full history. */}
          <section className="card timeline-card">
            <h2>{SESSION_LANGS[wizLang].title}</h2>
            <p className="muted small">{SESSION_LANGS[wizLang].hint}</p>
            {!archiveLoaded ? (
              <p className="muted">
                {archLoading ? SESSION_LANGS[wizLang].loading : SESSION_LANGS[wizLang].notLoaded}
              </p>
            ) : activeSessions.length === 0 ? (
              <p className="muted">{SESSION_LANGS[wizLang].empty}</p>
            ) : (
              <>
                <div className="timeline-filter" role="tablist" aria-label={SESSION_LANGS[wizLang].filterByDay}>
                  <button
                    className={`timeline-chip${selSessionDay === "all" ? " on" : ""}`}
                    onClick={() => activeId && setSessionDay((p) => ({ ...p, [activeId]: "all" }))}
                  >
                    {SESSION_LANGS[wizLang].allDays}
                  </button>
                  {sessionDays.map((d) => (
                    <button
                      key={d}
                      className={`timeline-chip${selSessionDay === d ? " on" : ""}`}
                      onClick={() => activeId && setSessionDay((p) => ({ ...p, [activeId]: d }))}
                    >
                      {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </button>
                  ))}
                </div>
                <ul className="timeline-list">
                  {visibleSessions.map((s) => {
                    const pct = s.rounds ? Math.round((s.correct / s.rounds) * 100) : 0;
                    return (
                      <li key={s.key} className="timeline-row">
                        <div className="timeline-head">
                          <span className="timeline-time">{fmtTime(s.startISO)}</span>
                          <span className="timeline-count">
                            {s.rounds} {SESSION_LANGS[wizLang].rounds} · {s.minutes} {SESSION_LANGS[wizLang].min}
                          </span>
                        </div>
                        <div className="timeline-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                          <span className="timeline-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="timeline-foot">
                          <span className="timeline-pct">{pct}% {SESSION_LANGS[wizLang].accuracy}</span>
                          {s.mastered.length > 0 && (
                            <span className="timeline-mastered">
                              {SESSION_LANGS[wizLang].mastered}:{" "}
                              {s.mastered.map((id) => (
                                <span key={id} className="mastered-chip">
                                  {narrTitleEn(id)}
                                  {narrTitleBn(id) !== narrTitleEn(id) && (
                                    <span className="muted"> · {narrTitleBn(id)}</span>
                                  )}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          {/* 🎮 #252 — game coverage: which games the kid hasn't tried yet (nudge variety). */}
          <section className="card coverage-card">
            <h2>🎮 Games to try</h2>
            <p className="muted small">
              Which of the catalog’s games {active.name} has played — and which are still
              waiting. Derived from the dashboard’s already-loaded progress, so it works offline.
            </p>
            <div className="coverage-summary">
              <span className="coverage-total">{coveragePlayed} of {coverageTotal} games played</span>
              <div className="bar big">
                <div className={`fill${coveragePct === 100 ? " done" : ""}`} style={{ width: `${coveragePct}%` }} />
              </div>
            </div>
            {coverageBySubject.map((sub) => {
              const pct = sub.total ? Math.round((sub.tried / sub.total) * 100) : 0;
              return (
                <div key={sub.id} className="coverage-subject">
                  <span className="coverage-subject-label">
                    {sub.emoji} {sub.label} <span className="muted small">{sub.tried}/{sub.total}</span>
                  </span>
                  <div className="bar">
                    <div className={`fill${pct === 100 ? " done" : ""}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {untriedGames.length === 0 ? (
              <p className="muted">All games played — {active.name} is a full explorer! 🎉</p>
            ) : (
              <ul className="coverage-list">
                {untriedGames.map((g) => (
                  <li key={g.skill.id} className="coverage-row">
                    <span className="coverage-title">
                      {g.skill.title}
                      {g.skill.titleBn ? <span className="muted small"> · {g.skill.titleBn}</span> : null}
                    </span>
                    <span className="coverage-band">World {g.skill.band}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* #240 — compare two kids side-by-side (offline) */}
          {kids.length >= 2 && (
            <section className="card compare-card">
              <h2>⚖️ Compare two kids</h2>
              <p className="muted small">
                How {mtrA.name} and {mtrB.name} stack up, metric by metric. Everything here is
                read from the dashboard’s already-loaded data — it works offline.
              </p>
              <div className="compare-pickers">
                <select aria-label="First kid to compare" value={cmpAId} onChange={(e) => setCmpA(e.target.value)}>
                  {kids.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.avatar} {k.name}
                    </option>
                  ))}
                </select>
                <span className="vs">vs</span>
                <select aria-label="Second kid to compare" value={cmpBId} onChange={(e) => setCmpB(e.target.value)}>
                  {kids.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.avatar} {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>{mtrA.avatar} {mtrA.name}</th>
                    <th>{mtrB.avatar} {mtrB.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td className={r.higher === "a" ? "cmp-lead" : ""}>{r.a}</td>
                      <td className={r.higher === "b" ? "cmp-lead" : ""}>{r.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* #132 — printable worksheet from weak skills */}
          <section className="card worksheet-card">
            <h2>📄 Printable worksheet</h2>
            <p className="muted small">
              A practice sheet built from what {active.name} hasn't mastered yet — perfect for offline
              homework. Print or save as PDF (your browser's Print dialog).
            </p>
            <div className="worksheet-actions">
              <button className="btn" disabled={sheetBusy} onClick={() => void handleWorksheet()}>
                {sheetBusy ? "Building…" : "🖨️ Build worksheet"}
              </button>
              {sheet && (
                <button className="btn ghost-btn" onClick={() => window.print()}>Print / save PDF</button>
              )}
              {sheet && (
                <button className="btn ghost-btn" onClick={() => setSheet(null)}>Close</button>
              )}
            </div>
            {sheet && (
              <p className="muted small" style={{ marginTop: "8px" }}>
                {sheet.items.length} practice lines for {sheet.name} · generated {sheet.date} · tap Print for a clean A4 sheet.
              </p>
            )}
          </section>

          {/* #139 — printable flashcard QR sheet (offline-first) */}
          <section className="card worksheet-card">
            <h2>🎴 Flashcard QR cards</h2>
            <p className="muted small">
              Printable QR codes for the games {active.name} has played. A kid scans a card
              (or types its code) in the app to jump straight into that mini-game — works offline.
            </p>
            <div className="worksheet-actions">
              <button className="btn" disabled={qrBusy} onClick={() => void handleQRCards()}>
                {qrBusy ? "Building…" : "🎴 Build QR cards"}
              </button>
              {qrCards && qrCards.length > 0 && (
                <button className="btn ghost-btn" onClick={() => window.print()}>Print / save PDF</button>
              )}
              {qrCards && (
                <button className="btn ghost-btn" onClick={() => setQrCards(null)}>Close</button>
              )}
            </div>
            {qrCards && qrCards.length === 0 && (
              <p className="muted small" style={{ marginTop: "8px" }}>
                No games played yet — {active.name} needs a session first (mastery builds from rounds).
              </p>
            )}
          </section>

          {/* ── controls ── */}
          <section className="card controls">
            <h2>🎛️ Learning controls</h2>

            {/* #272 — safety: instant pause (parent kill-switch). One tap stops
                every game for this kid with a kid-safe screen; stays paused
                through reloads until a parent resumes. */}
            <div className={`ctrl-block pause-block${activeSettings.paused ? " on" : ""}`}>
              <h3>{PAUSE_LANGS[wizLang].title}</h3>
              <p className="muted small">
                {activeSettings.paused
                  ? PAUSE_LANGS[wizLang].onHint.replace("{name}", active.name)
                  : PAUSE_LANGS[wizLang].offHint.replace("{name}", active.name)}
              </p>
              <button
                className={`btn${activeSettings.paused ? " danger-ghost" : " danger"}`}
                onClick={() => patchSettings({ paused: !activeSettings.paused })}
                aria-pressed={activeSettings.paused}
              >
                {activeSettings.paused ? PAUSE_LANGS[wizLang].resume : PAUSE_LANGS[wizLang].pause}
              </button>
            </div>

            <div className="ctrl-block">
              <h3>Subjects</h3>
              <p className="muted small">Turn a subject off to hide those games from {active.name}.</p>
              <div className="toggle-grid">
                {SUBJECTS.map((s) => {
                  const list = activeSettings.enabled_subjects;
                  const on = list === null || list.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      className={`toggle-chip${on ? " on" : ""}`}
                      onClick={() => {
                        const list = activeSettings.enabled_subjects;
                        const next = list === null ? SUBJECTS.map((x) => x.id) : [...list];
                        if (on) next.splice(next.indexOf(s.id), 1);
                        else next.push(s.id);
                        if (next.length === SUBJECTS.length) patchSettings({ enabled_subjects: null });
                        else patchSettings({ enabled_subjects: next });
                      }}
                    >
                      <span className="toggle-emoji">{s.emoji}</span>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Difficulty cap</h3>
              <p className="muted small">The hardest world {active.name} can reach (1 = easiest, 5 = hardest).</p>
              <div className="toggle-grid bands">
                <button
                  className={`toggle-chip${activeSettings.max_band === null ? " on" : ""}`}
                  onClick={() => patchSettings({ max_band: null })}
                >
                  All worlds
                </button>
                {[1, 2, 3, 4, 5].map((b) => (
                  <button
                    key={b}
                    className={`toggle-chip${activeSettings.max_band === b ? " on" : ""}`}
                    onClick={() => patchSettings({ max_band: b })}
                  >
                    World {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Playtime per day</h3>
              <p className="muted small">
                A soft limit per day of the week — the app gently stops play when {active.name} reaches it. Default: 45 min school days, 90 weekend.
              </p>
              <div className="weekday-limits">
                {WEEKDAYS.map((d, i) => {
                  const cur = weekdayLimits(activeSettings)[i];
                  return (
                    <div key={d.key} className="weekday-row">
                      <span className="weekday-name" title={d.full}>{d.short}</span>
                      <div className="weekday-chips" role="group" aria-label={`${d.full} playtime`}>
                        {LIMIT_CHOICES.map((m) => (
                          <button
                            key={m}
                            className={`toggle-chip${cur === m ? " on" : ""}`}
                            onClick={() => {
                              const arr = [...weekdayLimits(activeSettings)];
                              arr[i] = m;
                              patchSettings(writeWeekdayLimits(activeSettings, arr));
                            }}
                          >
                            {m === 0 ? "Off" : `${m}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="weekday-presets">
                <button
                  className="ghost-btn small"
                  onClick={() => patchSettings(writeWeekdayLimits(activeSettings, WEEKDAY_DEFAULTS))}
                >
                  ↺ Default (45/90)
                </button>
                <button
                  className="ghost-btn small"
                  onClick={() => patchSettings(writeWeekdayLimits(activeSettings, [0, 0, 0, 0, 0, 0, 0]))}
                >
                  No limit
                </button>
              </div>
            </div>

            {/* 🎯 #256 — gentle daily goal: Nova nudges toward it, never blocks.
                The server clamps it to the day's cap, so it respects the limits
                set just above. */}
            <div className="ctrl-block">
              <h3>🎯 Daily goal</h3>
              <p className="muted small">
                A gentle goal {active.name} can aim for each day. Nova cheers it on
                without pressure — it never blocks play, and it always stays at or
                below the day's limit above.
              </p>
              <div className="goal-row">
                <input
                  className="goal-input"
                  type="number"
                  min={0}
                  max={600}
                  value={activeSettings.goal_min ?? ""}
                  placeholder="No goal"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    patchSettings({ goal_min: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) });
                  }}
                />
                <span className="goal-unit">minutes / day</span>
              </div>
              {activeSettings.goal_min != null && activeSettings.goal_min > 0 && (
                <p className="hint">
                  ↳ Saved as up to {activeSettings.goal_min} min — clamped to the daily cap if that's lower.
                </p>
              )}
            </div>

            {/* 📌 #257 — curriculum focus pin: a subject + world the journey
                leads with. Both-or-neither; Clear restores the normal path. */}
            <div className="ctrl-block">
              <h3>📌 Focus</h3>
              <p className="muted small">
                Pin a subject + world so {active.name}’s journey leads with those skills.
                Clear it anytime to go back to the normal path.
              </p>
              <div className="focus-subjects">
                {SUBJECTS.map((sub) => (
                  <button
                    key={sub.id}
                    className={`toggle-chip${activeSettings.focus_subject === sub.id ? " on" : ""}`}
                    onClick={() => {
                      if (activeSettings.focus_subject === sub.id) {
                        patchSettings({ focus_subject: null, focus_band: null });
                      } else {
                        patchSettings({ focus_subject: sub.id, focus_band: null });
                      }
                    }}
                  >
                    {sub.emoji} {sub.label}
                  </button>
                ))}
              </div>
              {activeSettings.focus_subject && (
                <div className="focus-bands" role="group" aria-label="Focus world">
                  {FOCUS_BANDS.map((b) => (
                    <button
                      key={b}
                      className={`toggle-chip${activeSettings.focus_band === b ? " on" : ""}`}
                      onClick={() => patchSettings({ focus_band: b })}
                    >
                      World {b}
                    </button>
                  ))}
                </div>
              )}
              {(activeSettings.focus_subject || activeSettings.focus_band) && (
                <div className="focus-clear">
                  <button
                    className="ghost-btn small"
                    onClick={() => patchSettings({ focus_subject: null, focus_band: null })}
                  >
                    ✕ Clear focus
                  </button>
                </div>
              )}
            </div>

            <div className="ctrl-block">
              <h3>Reading & sound</h3>
              <div className="toggle-grid">
                <button
                  className={`toggle-chip${activeSettings.tts_enabled ? " on" : ""}`}
                  onClick={() => patchSettings({ tts_enabled: !activeSettings.tts_enabled })}
                >
                  🔊 Voice reading
                </button>
                <button
                  className={`toggle-chip${activeSettings.music_enabled ? " on" : ""}`}
                  onClick={() => patchSettings({ music_enabled: !activeSettings.music_enabled })}
                >
                  🎵 Background music
                </button>
                <button
                  className={`toggle-chip${activeSettings.voice_record_enabled ? " on" : ""}`}
                  onClick={() => patchSettings({ voice_record_enabled: !activeSettings.voice_record_enabled })}
                  title="Kid can record their own voice and replay. Stays on this device — never synced."
                >
                  🎙️ Voice recording
                </button>
              </div>
              {/* #243 — per-kid volume balance: voice / sfx / music, with a Try button */}
              <div className="volume-balance">
                {(
                  [
                    { key: "voice_volume", icon: "🗣️", label: "Voice", hint: "Read-aloud and spoken feedback" },
                    { key: "sfx_volume", icon: "✨", label: "Sound effects", hint: "Pops, chimes and win sounds" },
                    { key: "music_volume", icon: "🎵", label: "Music", hint: "The background music" },
                  ] as const
                ).map((row) => {
                  const cur = activeSettings[row.key] ?? 1;
                  return (
                    <div key={row.key} className="vol-row">
                      <span className="vol-label" title={row.hint}>
                        {row.icon} {row.label}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={cur}
                        aria-label={`${row.label} volume`}
                        onChange={(e) => patchSettings({ [row.key]: Number(e.target.value) })}
                      />
                      <span className="vol-num">{Math.round(cur * 100)}%</span>
                      <button
                        className="ghost-btn small vol-try"
                        type="button"
                        onClick={() => trySoundPreview(row.key.replace("_volume", "") as "voice" | "sfx" | "music", cur)}
                      >
                        🔊 Try
                      </button>
                    </div>
                  );
                })}
              </div>
              {/* #258 — per-kid VOICE preference: which tone reads + how fast, with a Try button */}
              <div className="voice-pref">
                <div className="vp-row">
                  <span className="vp-label" title={VOICE_LANGS[wizLang].toneHint}>
                    🗣️ {VOICE_LANGS[wizLang].voice}
                  </span>
                  <div className="vp-chips">
                    {VOICE_TONES.map((t) => {
                      const on = activeSettings.voice_tone === t.key;
                      return (
                        <button
                          key={t.key}
                          className={`toggle-chip${on ? " on" : ""}`}
                          onClick={() => patchSettings({ voice_tone: on ? null : t.key })}
                          aria-pressed={on}
                        >
                          {wizLang === "bn" ? t.bn : t.en}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="vp-row">
                  <span className="vp-label" title={VOICE_LANGS[wizLang].speedHint}>
                    ⚡ {VOICE_LANGS[wizLang].speed}
                  </span>
                  <div className="vp-chips">
                    {VOICE_SPEEDS.map((sp) => {
                      const on = (activeSettings.voice_speed ?? 1) === sp.rate;
                      return (
                        <button
                          key={sp.key}
                          className={`toggle-chip${on ? " on" : ""}`}
                          onClick={() => patchSettings({ voice_speed: on ? null : sp.rate })}
                          aria-pressed={on}
                        >
                          {wizLang === "bn" ? sp.bn : sp.en}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  className="ghost-btn small vol-try"
                  type="button"
                  onClick={() =>
                    tryVoicePreview(
                      activeSettings.voice_tone ?? "female",
                      activeSettings.voice_speed ?? 1,
                      wizLang
                    )
                  }
                >
                  {VOICE_LANGS[wizLang].try}
                </button>
              </div>
              <p className="muted small">🎙️ Voice recording lets a kid record and replay their own voice. Recordings stay on this device and are never sent to the server.</p>
            </div>

            {/* #248 — quiet hours: auto-soften during a per-day schedule, never blocks play */}
            <div className="ctrl-block quiet-block">
              <h3>🌙 Quiet hours</h3>
              <p className="muted small">
                During these times the app gently lowers volume and dims the screen — play is never blocked.
              </p>
              <div className="toggle-grid">
                <button
                  className={`toggle-chip${activeSettings.quiet_enabled ? " on" : ""}`}
                  onClick={() => patchSettings({ quiet_enabled: !activeSettings.quiet_enabled })}
                >
                  🌙 Quiet hours on
                </button>
                <button
                  className={`toggle-chip${activeSettings.quiet_dim ? " on" : ""}`}
                  onClick={() => patchSettings({ quiet_dim: !activeSettings.quiet_dim })}
                  title="Gently dims the screen during quiet hours."
                >
                  🕯️ Gentle dimming
                </button>
              </div>

              <div className="quiet-schedule">
                {WEEKDAYS.map((d, i) => {
                  const win = quietWindowParts(quietWindowsArr(activeSettings)[i]);
                  return (
                    <div className="quiet-day" key={d.key}>
                      <span className="quiet-day-name">{d.full}</span>
                      <label className="quiet-off">
                        <input
                          type="checkbox"
                          checked={win.on}
                          onChange={(e) => {
                            const arr = quietWindowsArr(activeSettings);
                            arr[i] = e.target.checked ? "20:00-07:00" : "-";
                            patchSettings(writeQuietWindows(activeSettings, arr));
                          }}
                        />
                        On
                      </label>
                      <input
                        type="time"
                        className="quiet-time"
                        value={win.start}
                        disabled={!win.on}
                        onChange={(e) => {
                          const arr = quietWindowsArr(activeSettings);
                          const cur = quietWindowParts(arr[i]);
                          const end = cur.end || "07:00";
                          arr[i] = `${e.target.value || "20:00"}-${end}`;
                          patchSettings(writeQuietWindows(activeSettings, arr));
                        }}
                      />
                      <span className="quiet-sep">–</span>
                      <input
                        type="time"
                        className="quiet-time"
                        value={win.end}
                        disabled={!win.on}
                        onChange={(e) => {
                          const arr = quietWindowsArr(activeSettings);
                          const cur = quietWindowParts(arr[i]);
                          const start = cur.start || "20:00";
                          arr[i] = `${start}-${e.target.value || "07:00"}`;
                          patchSettings(writeQuietWindows(activeSettings, arr));
                        }}
                      />
                    </div>
                  );
                })}
                <p className="muted small">Overnight windows cross midnight — e.g. 20:00 → 07:00. Start later than end for bedtime.</p>
              </div>

              <div className="vol-row">
                <span className="vol-label" title="How soft the app gets during quiet hours.">🔉 Soft volume</span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={activeSettings.quiet_volume ?? 0.15}
                  aria-label="Quiet hours volume"
                  onChange={(e) => patchSettings({ quiet_volume: Number(e.target.value) })}
                />
                <span className="vol-num">{Math.round((activeSettings.quiet_volume ?? 0.15) * 100)}%</span>
              </div>
            </div>

            <div className="row-buttons save-row">
              <button className="btn primary" disabled={busy} onClick={handleSaveSettings}>
                {busy ? "Saving…" : "Save settings"}
              </button>
              {savedTick > 0 && <span className="saved-note">✓ Saved</span>}
            </div>
          </section>

          {/* ── activity feed ── */}
          <section className="card">
            <h2>📈 Recent activity</h2>
            {(activity[active.id] ?? []).length === 0 ? (
              <p className="muted">Nothing yet — have {active.name} play a round to see it here.</p>
            ) : (
              <ul className="activity-list">
                {(activity[active.id] ?? []).map((a) => (
                  <li key={a.id} className={`activity-item ${a.correct ? "ok" : "no"}`}>
                    <span className="activity-badge">{a.correct ? "✓" : "✗"}</span>
                    <span className="activity-game">{gameLabel(a.game_id)}</span>
                    <span className="activity-time">{fmtTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* #89 — per-skill missed questions, derived from the already-loaded
              story ledger (offline-first). Shows the answer picked vs the right
              one + Moni's diagnosis, grouped per skill, with a reteach badge. */}
          <section className="card missed-card">
            <h2>{MISSED_LANGS[wizLang].title}</h2>
            <p className="muted small">{MISSED_LANGS[wizLang].hint.replace("{name}", active.name)}</p>
            {missedSkills.length === 0 ? (
              <p className="muted">{MISSED_LANGS[wizLang].empty}</p>
            ) : (
              <div className="missed-list">
                {missedSkills.map((ms) => (
                  <details key={ms.skillId} className="missed-skill" open>
                    <summary>
                      <span className="missed-skill-name">{skillLabel(ms.skillId)}</span>
                      <span className="missed-count">{ms.misses.length}</span>
                      {ms.misses.some((m) => m.reteaching) && (
                        <span className="reteach-badge">{MISSED_LANGS[wizLang].reteaching}</span>
                      )}
                    </summary>
                    <ul className="missed-rows">
                      {ms.misses.map((m, i) => (
                        <li key={i} className="missed-row">
                          <span className="missed-game">{gameLabel(m.gameId)}</span>
                          <span className="missed-time">{fmtTime(m.at)}</span>
                          <span className="missed-detail">
                            {m.wrongAnswer != null && `${MISSED_LANGS[wizLang].picked} ${m.wrongAnswer}`}
                            {m.wrongAnswer != null && m.correctAnswer != null && " · "}
                            {m.correctAnswer != null && `${MISSED_LANGS[wizLang].answer} ${m.correctAnswer}`}
                            {m.fingerprint ? ` · ${m.fingerprint}` : ""}
                          </span>
                          {m.errorKind && <span className={`missed-kind kind-${m.errorKind}`}>{m.errorKind}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
          </section>

          {/* ── mastery table ── */}
          <section className="card">
            <h2>🧠 Skill mastery</h2>
            {activeMastery.length === 0 ? (
              <p className="muted">No practice yet — play the kid app to record progress.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Mastery</th>
                    <th>Correct / Attempts</th>
                    <th>Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMastery.map((m) => (
                    <tr key={m.skill_id}>
                      <td>{m.skill_id.replace(/-/g, " ")}</td>
                      <td>
                        <div className="bar">
                          <div className={`fill${m.mastery >= 0.8 ? " done" : ""}`} style={{ width: `${masteryPct(m)}%` }} />
                        </div>
                        {masteryPct(m)}%
                      </td>
                      <td>{m.correct}/{m.attempts}</td>
                      <td>{m.streak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ── account & security ── */}
          <section className="card account">
            <h2>🔐 Account & security</h2>
            {acctMsg && (
              <p className={acctMsg.kind === "ok" ? "ok-note" : "err"}>{acctMsg.text}</p>
            )}

            <div className="ctrl-block">
              <h3>Display name</h3>
              <p className="muted small">Shown in the portal and on the kid app's sign-in screen.</p>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={profile?.display_name ?? "Parent"}
                  />
                </label>
              </div>
              <div className="row-buttons">
                <button className="btn primary" disabled={acctBusy || !displayName.trim()} onClick={handleSaveName}>
                  {acctBusy ? "Saving…" : "Save name"}
                </button>
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Change password</h3>
              <p className="muted small">
                Changing it signs out every other device immediately — only this one stays in.
              </p>
              <div className="form-grid">
                <label>
                  Current password
                  <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
                </label>
                <label>
                  New password
                  <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" placeholder="8+ characters" />
                </label>
                <label>
                  Confirm new password
                  <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" />
                </label>
              </div>
              <div className="row-buttons">
                <button
                  className="btn primary"
                  disabled={acctBusy || !pwCurrent || pwNew.length < 8 || pwNew !== pwConfirm}
                  onClick={handleChangePw}
                >
                  {acctBusy ? "Saving…" : "Change password"}
                </button>
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Active logins</h3>
              <p className="muted small">Every device signed into this account. Revoke one you don't recognize.</p>
              {sessions.length === 0 ? (
                <p className="muted">Loading sessions…</p>
              ) : (
                <ul className="session-list">
                  {sessions.map((s) => (
                    <li key={s.id} className="session-row">
                      <span className="session-icon">{s.current ? "🖥️" : "📱"}</span>
                      <span className="session-meta">
                        <span className="session-device">
                          {s.current ? "This device" : friendlyDevice(s.user_agent)}
                          {s.current && <span className="session-current-badge">current</span>}
                        </span>
                        <span className="muted small">
                          {s.user_agent ? friendlyDevice(s.user_agent) : "Unknown device"}
                          {s.ip ? ` · ${s.ip}` : ""} · signed in {fmtTime(s.created_at)}
                          {!s.current && ` · last seen ${fmtTime(s.last_seen_at)}`}
                        </span>
                      </span>
                      {!s.current && (
                        <button
                          className="btn btn-small danger-ghost"
                          disabled={acctBusy}
                          onClick={() => handleRevoke(s.id, false)}
                        >
                          Sign out
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="row-buttons" style={{ marginTop: 14 }}>
                <button className="btn danger-ghost" disabled={acctBusy || sessions.length === 0} onClick={handleSignoutAll}>
                  Sign out of all devices
                </button>
              </div>
            </div>
          </section>

          {/* ── edit + danger zone ── */}
          <section className="card danger">
            <h2>⚙️ Edit {active.name}</h2>
            <div className="avatar-row">
              {AVATARS.map((a) => (
                <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)}>
                  {a}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Name
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={active.name} />
              </label>
              <label>
                Birth year
                <input
                  type="number"
                  min={2010}
                  max={2030}
                  value={editBirthYear}
                  onChange={(e) => setEditBirthYear(Number(e.target.value) || 2021)}
                />
              </label>
            </div>
            <div className="row-buttons">
              <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleRename}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>

            <hr />
            <div className="danger-row">
              <div>
                <h3>Reset progress</h3>
                <p className="muted small">Wipes all of {active.name}’s mastery and history. The profile stays.</p>
              </div>
              {confirmReset ? (
                <div className="confirm-group">
                  <button className="btn danger" disabled={busy} onClick={handleReset}>Yes, reset everything</button>
                  <button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn danger-ghost" onClick={() => { setConfirmReset(true); setConfirmDelete(false); }}>Reset progress…</button>
              )}
            </div>

            <div className="danger-row">
              <div>
                <h3>Delete {active.name}</h3>
                <p className="muted small">Permanently removes this profile and all history. This cannot be undone.</p>
              </div>
              {confirmDelete ? (
                <div className="confirm-group">
                  <button className="btn danger" disabled={busy} onClick={handleDelete}>Yes, delete</button>
                  <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn danger-ghost" onClick={() => { setConfirmDelete(true); setConfirmReset(false); }}>Delete…</button>
              )}
            </div>
          </section>

          {/* #7 — 🩺 local-only diagnostics (never leaves the device) */}
          <section className="card diag-card">
            <button className="diag-toggle" onClick={() => setDebugOpen((o) => !o)} aria-expanded={debugOpen}>
              {DEBUG_LANGS[wizLang].toggle}
              <span className="diag-caret">{debugOpen ? "▾" : "▸"}</span>
            </button>
            {debugOpen && (
              <div className="diag-body">
                <p className="muted small">{DEBUG_LANGS[wizLang].hint}</p>
                <dl className="diag-grid">
                  <div>
                    <dt>{DEBUG_LANGS[wizLang].lastSync}</dt>
                    <dd>
                      {lastSync
                        ? new Date(lastSync).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : DEBUG_LANGS[wizLang].never}
                    </dd>
                  </div>
                  <div>
                    <dt>{DEBUG_LANGS[wizLang].online}</dt>
                    <dd>
                      <span className={`dot ${navigator.onLine ? "ok" : "off"}`} aria-hidden />
                      {navigator.onLine ? DEBUG_LANGS[wizLang].online : DEBUG_LANGS[wizLang].offline}
                    </dd>
                  </div>
                  <div>
                    <dt>{DEBUG_LANGS[wizLang].serviceWorker}</dt>
                    <dd>{swVersion ?? DEBUG_LANGS[wizLang].notInstalled}</dd>
                  </div>
                  <div>
                    <dt>{DEBUG_LANGS[wizLang].voice}</dt>
                    <dd>
                      {typeof speechSynthesis !== "undefined" && speechSynthesis.getVoices().length > 0
                        ? `${speechSynthesis.getVoices().length} ${DEBUG_LANGS[wizLang].voices}`
                        : DEBUG_LANGS[wizLang].noVoice}
                    </dd>
                  </div>
                </dl>
                <h3 className="diag-err-head">{DEBUG_LANGS[wizLang].errors}</h3>
                {nvDiagErrors.length === 0 ? (
                  <p className="muted small">{DEBUG_LANGS[wizLang].noErrors}</p>
                ) : (
                  <ul className="diag-errors">
                    {nvDiagErrors.slice(-NV_DIAG_MAX).reverse().map((e, i) => (
                      <li key={`${e.at}-${i}`}>
                        <code>{e.at.slice(0, 16)}</code> {e.msg}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="row-buttons">
                  <button className="btn ghost small" onClick={() => void exportDiagnostics()}>
                    {diagCopied ? DEBUG_LANGS[wizLang].exported : DEBUG_LANGS[wizLang].export}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── #262 on-device data review (localStorage, offline) ── */}
          <OnDeviceData />
        </>
      )}

      {/* #132 — print-only worksheet. Rendered in the DOM so window.print()
          picks it up; CSS @media print hides everything else. */}
      {sheet && (
        <div className="print-sheet" aria-hidden="false">
          <h1>📄 Numberverse practice worksheet</h1>
          <p className="sheet-meta">
            {sheet.name} · {sheet.date} · numberverse.org
          </p>
          <p className="sheet-sub">
            Practice a little every day — you’re getting better every time! ✨
          </p>
          <div className="sheet-problems">
            {sheet.items.map((p, i) => (
              <div className="sheet-problem" key={`${p.skillId}-${i}`}>
                <span className="sheet-num">{i + 1}.</span>
                <span className="sheet-prompt">{p.prompt}</span>
                <span className="sheet-answer">{p.lines === 1 ? "____" : ""}</span>
              </div>
            ))}
          </div>
          <p className="sheet-footer">Made with ❤️ by Numberverse for {sheet.name}</p>
        </div>
      )}

      {/* #139 — print-only QR card sheet. Cut along the grid, scan in the app. */}
      {qrCards && qrCards.length > 0 && (
        <div className="print-sheet" aria-hidden="false">
          <h1>🎴 Numberverse flashcard QR cards</h1>
          <p className="sheet-meta">
            {kids.find((k) => k.id === activeId)?.name ?? "My kid"} · numberverse.org · open the app → 📷 Scan a card
          </p>
          <div className="qr-grid">
            {qrCards.map((c) => (
              <div className="qr-card" key={c.skillId}>
                <img className="qr-img" src={c.dataUrl} alt={c.title} width={140} height={140} />
                <div className="qr-title">{c.title}</div>
                <div className="qr-code">{c.code}</div>
              </div>
            ))}
          </div>
          <p className="sheet-footer">Cut on the dashed lines — every card opens its mini-game offline.</p>
        </div>
      )}
    </main>
  );
}
