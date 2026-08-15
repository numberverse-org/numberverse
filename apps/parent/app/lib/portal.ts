/* ───────────────────────────────────────────────────────────────────
   Parent portal — pure helpers + config (EN/BN country-pack seams).
   Extracted from app/page.tsx (#620) so the dashboard page is just the
   shell + data wiring. Every map below IS the i18n seam: add a locale
   key (e.g. "hi", "ar") and the sections follow — no component rewrites.
   ─────────────────────────────────────────────────────────────────── */
"use client";

import { SKILLS } from "@numberverse/core";
import type {
  KidSettings as KidSettingsT,
  WeeklyReport,
  ActivityRow,
  MasteryRow,
  LearningStoryRow,
} from "../../lib/api";

/** #7 — local-only diagnostics ring buffer. The portal has ZERO analytics, so
 *  the parent's browser is the only error log. We keep the last 20 window
 *  errors + unhandled rejections in memory and let the parent export them as a
 *  plain-text blob — nothing is sent anywhere; the buffer dies on reload. */
export const NV_DIAG_MAX = 20;
export const nvDiagErrors: { at: string; msg: string }[] = [];
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


export const AVATARS = ["🛡️", "🔮", "🗡️", "🪓", "🏹", "🦊", "🐱", "🐼", "🐸", "🦄", "🐯", "🐰", "🐨", "🐹", "🦁"];

/** #246 — first-run onboarding wizard strings. EN + BN shipped today; the map
 *  IS the country-pack seam: add a new key (e.g. "hi", "ar") with the same
 *  shape and the wizard follows — no component rewrites. Selected via
 *  localStorage `nv_parent_lang` (default "en"). */
export const WIZARD_LANGS = {
  en: {
    title: "👋 Welcome to Numberverse!",
    step0: "Let's set up your kids so their progress has a home.",
    stepN: "Add one at a time — you can add or edit more anytime.",
    nameLabel: "Name",
    // #1540 — explain WHY the wizard asks for birth year.
    birthLabel: "Birth year (used to start them at the right level)",
    // #1539/#1540 — field-level validation + tiny in-wizard hint.
    birthRangeErr: "Birth year must be between 2010 and 2030.",
    birthHint: "Will start them at the right level.",
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
    // #1540 — explain WHY the wizard asks for birth year.
    birthLabel: "জন্মসাল (সঠিক স্তর থেকে শুরু করতে ব্যবহৃত)",
    // #1539/#1540 — field-level validation + tiny in-wizard hint.
    birthRangeErr: "জন্মসাল ২০১০ থেকে ২০৩০-এর মধ্যে হতে হবে।",
    birthHint: "সঠিক স্তর থেকে শুরু করবে।",
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
export type WizardLang = keyof typeof WIZARD_LANGS;

/** #1537 — parent account creation route strings. EN + BN shipped together;
 *  the page reads the same `nv_parent_lang` preference the wizard uses (default
 *  "en"), so a parent who chose Bangla keeps that language at sign-up. */
export const SIGNUP_LANGS = {
  en: {
    title: "Create your parent account",
    namePlaceholder: "Your name",
    emailPlaceholder: "Parent email",
    passwordPlaceholder: "Password (at least 8 characters)",
    submit: "Create account",
    success: "Account created — signed in as",
    openDashboard: "Open dashboard →",
    signInLink: "Already have an account? Sign in",
    err: "Couldn't create your account — check your details and try again.",
    pwTooShort: "Password must be at least 8 characters.",
    nameRequired: "Please enter your name.",
  },
  bn: {
    title: "আপনার অভিভাবক অ্যাকাউন্ট তৈরি করুন",
    namePlaceholder: "আপনার নাম",
    emailPlaceholder: "অভিভাবকের ইমেইল",
    passwordPlaceholder: "পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)",
    submit: "অ্যাকাউন্ট তৈরি করুন",
    success: "অ্যাকাউন্ট তৈরি হয়েছে — সাইন ইন করেছেন",
    openDashboard: "ড্যাশবোর্ড খুলুন →",
    signInLink: "ইতিমধ্যে অ্যাকাউন্ট আছে? সাইন ইন করুন",
    err: "অ্যাকাউন্ট তৈরি করা যায়নি — তথ্য পরীক্ষা করে আবার চেষ্টা করুন।",
    pwTooShort: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।",
    nameRequired: "আপনার নাম লিখুন।",
  },
} as const;
export type SignupLang = keyof typeof SIGNUP_LANGS;

/** 🧏 #250 — global accessibility toggle strings (EN + BN). Same country-pack
 *  seam as WIZARD_LANGS: a new locale = a new key, no component rewrites. */
export const A11Y_LANGS = {
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
export const THEME_LANGS = {
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
export const THEME_KEY = "nv_parent_theme";

/** 🧵 #255 — session timeline strings (EN + BN). Same country-pack seam. */
export const SESSION_LANGS = {
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

/** #1487/#1490/#1491/#1545-#1548 — account & security card strings (EN + BN).
 *  Same country-pack seam as the maps above: a new locale = a new key here,
 *  keyed by `wizLang`, and the AccountCard follows without a component rewrite. */
export const ACCOUNT_LANGS = {
  en: {
    changePwTitle: "Change password",
    changePwHint: "Changing it signs out every other device immediately — only this one stays in.",
    currentPw: "Current password",
    newPw: "New password",
    confirmNewPw: "Confirm new password",
    newPwPlaceholder: "8+ characters",
    maxLenHint: "Maximum 72 characters.",
    changePwButton: "Change password",
    saving: "Saving…",
    // #1487 — Google-created accounts set a password instead of changing one.
    setPwTitle: "Set a password",
    googleSetHint: "Signed in with Google — you can set a password to also sign in with email/password.",
    setPwButton: "Set a password",
    setPwOk: "Password set — you can now sign in with email/password too.",
    setPwErr: "Could not set a password.",
    pwTooLong: "Password too long — maximum 72 characters.",
    // #1491/#1545-#1548 — active-logins block.
    activeLoginsTitle: "Active logins",
    activeLoginsHint: "Every device signed into this account. Revoke one you don't recognize.",
    loading: "Loading sessions…",
    empty: "No other active sessions",
    signOut: "Sign out",
    signOutHere: "Sign out here",
    signOutAll: "Sign out of all devices",
    confirmRevoke: "Confirm sign out {device}?",
    cancel: "Cancel",
    noRecentActivity: "no recent activity",
  },
  bn: {
    changePwTitle: "পাসওয়ার্ড পরিবর্তন",
    changePwHint: "পরিবর্তন করলে অন্য সব ডিভাইস সাথে সাথে সাইন আউট হয়ে যাবে — শুধু এই ডিভাইসটি থাকবে।",
    currentPw: "বর্তমান পাসওয়ার্ড",
    newPw: "নতুন পাসওয়ার্ড",
    confirmNewPw: "নতুন পাসওয়ার্ড আবার লিখুন",
    newPwPlaceholder: "৮+ অক্ষর",
    maxLenHint: "সর্বোচ্চ ৭২ অক্ষর।",
    changePwButton: "পাসওয়ার্ড পরিবর্তন করুন",
    saving: "সংরক্ষণ হচ্ছে…",
    setPwTitle: "পাসওয়ার্ড সেট করুন",
    googleSetHint: "Google দিয়ে সাইন ইন করেছেন — ইমেইল/পাসওয়ার্ড দিয়েও সাইন ইন করতে চাইলে একটি পাসওয়ার্ড সেট করুন।",
    setPwButton: "পাসওয়ার্ড সেট করুন",
    setPwOk: "পাসওয়ার্ড সেট হয়েছে — এখন ইমেইল/পাসওয়ার্ড দিয়েও সাইন ইন করতে পারবেন।",
    setPwErr: "পাসওয়ার্ড সেট করা যায়নি।",
    pwTooLong: "পাসওয়ার্ড খুব লম্বা — সর্বোচ্চ ৭২ অক্ষর।",
    activeLoginsTitle: "সক্রিয় লগইন",
    activeLoginsHint: "এই অ্যাকাউন্টে সাইন ইন করা প্রতিটি ডিভাইস। চেনা নেই এমন কোনো ডিভাইস সাইন আউট করুন।",
    loading: "সেশন লোড হচ্ছে…",
    empty: "অন্য কোনো সক্রিয় সেশন নেই",
    signOut: "সাইন আউট",
    signOutHere: "এখানে সাইন আউট",
    signOutAll: "সব ডিভাইস থেকে সাইন আউট",
    confirmRevoke: "নিশ্চিতভাবে {device} সাইন আউট করবেন?",
    cancel: "বাতিল",
    noRecentActivity: "সাম্প্রতিক কোনো কার্যকলাপ নেই",
  },
} as const;

export const SUBJECTS = [
  { id: "math", label: "Math", emoji: "🔢" },
  { id: "bangla", label: "Bangla", emoji: "অ" },
  { id: "english", label: "English", emoji: "🔤" },
  { id: "science", label: "Science", emoji: "🔬" },
  { id: "bgs", label: "BGS", emoji: "🌏" },
] as const;

/** #237 — the read-aloud / story-comprehension games that make up a kid's
 *  "reading & stories" progress (EN + BN tracks). Mastery for these skills is
 *  already loaded with the dashboard, so the card works fully offline. */
export const READING_GAMES = new Set(["game-readstory", "game-storyread", "game-story", "game-readaloud"]);
export const readingSkills = SKILLS.filter((s) => s.game && READING_GAMES.has(s.game));

export const GAME_LABELS: Record<string, string> = {
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

export function gameLabel(id: string): string {
  return GAME_LABELS[id] ?? id.replace("game-", "").replace(/-/g, " ");
}

export function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** Turn a user-agent string into a short, human-friendly device label. */
export function friendlyDevice(ua: string | null): string {
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

export function weekdayShort(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleString(undefined, { weekday: "short" });
  } catch {
    return iso;
  }
}

/** Privacy-safe share blurb — only aggregates, never a kid's name/device data
 *  unless the parent types the name into the share line themselves. */
export function weeklyShareText(kidName: string, w: WeeklyReport): string {
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

export const DEFAULT_SETTINGS: KidSettingsT = {
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
export const PAUSE_LANGS = {
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
export const STREAK_LANGS = {
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
export const TIMELINE_LANGS = {
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
export const DEBUG_LANGS = {
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
export const SYNC_LANGS = {
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

/** #18 — parent-facing "how do I…" Help card: install on iPhone + the Bangla
 *  voice download + the build-stamp check. EN + BN — same country-pack seam. */
export const HELP_LANGS = {
  en: {
    title: "❓ Help — install & voice",
    toggle: "❓ Help & setup",
    installTitle: "📱 Install on iPhone / iPad",
    installStep1: "Open kids.munna-khan.xyz in Safari (not another browser).",
    installStep2: "Tap the Share button (square with an up arrow).",
    installStep3: "Tap “Add to Home Screen” (it may be on a second page of the share sheet).",
    installStep4: "Tap “Add”. A Numberverse icon appears on your home screen.",
    installStep5: "Always open the game from that icon — it runs full-screen and works offline.",
    voiceTitle: "🔊 Download the Bangla voice",
    voiceIos1: "iPhone/iPad: Settings → Accessibility → Spoken Content → Voices → Bengali → download a voice.",
    voiceIos2: "Then relaunch the game; the read-aloud buttons use the downloaded voice.",
    voiceAnd1: "Android: Settings → System → Languages & input → Text-to-speech output → settings gear → Install voice data → Bengali.",
    voiceAnd2: "The game detects the voice automatically once it’s installed.",
    stampTitle: "🏷️ Check the build (stale install?)",
    stampStep1: "Open the kid app → ⚙️ Settings → About. It shows “Numberverse · vX.Y.Z · <date>”.",
    stampStep2: "If the date/version looks older than what was announced, the app hasn’t refreshed yet.",
    stampStep3: "Fully close the app and reopen it (or tap the update banner when it appears).",
    stampStep4: "Last resort: remove the home-screen icon and re-add it. Progress is safe — it lives on the server and on-device.",
  },
  bn: {
    title: "❓ সাহায্য — ইনস্টল ও ভয়েস",
    toggle: "❓ সাহায্য ও সেটআপ",
    installTitle: "📱 iPhone / iPad-এ ইনস্টল",
    installStep1: "Safari-তে kids.munna-khan.xyz খুলুন (অন্য ব্রাউজারে নয়)।",
    installStep2: "Share বোতামে চাপুন (উপরের তীর সহ বর্গক্ষেত্র)।",
    installStep3: "“Add to Home Screen”-এ চাপুন (শেয়ার শিটের দ্বিতীয় পাতায় থাকতে পারে)।",
    installStep4: "“Add”-এ চাপুন। হোম স্ক্রিনে একটি Numberverse আইকন আসবে।",
    installStep5: "সবসময় সেই আইকন থেকেই খেলুন — এটি পূর্ণ স্ক্রিনে চলে এবং অফলাইনে কাজ করে।",
    voiceTitle: "🔊 বাংলা ভয়েস ডাউনলোড",
    voiceIos1: "iPhone/iPad: Settings → Accessibility → Spoken Content → Voices → Bengali → একটি ভয়েস ডাউনলোড করুন।",
    voiceIos2: "তারপর খেলা আবার খুলুন; পড়া-শোনার বোতাম ডাউনলোড করা ভয়েস ব্যবহার করবে।",
    voiceAnd1: "Android: Settings → System → Languages & input → Text-to-speech output → সেটিংস গিয়ার → Install voice data → Bengali।",
    voiceAnd2: "ভয়েস ইনস্টল হলে খেলা নিজেই তা শনাক্ত করবে।",
    stampTitle: "🏷️ বিল্ড পরীক্ষা (পুরনো ইনস্টল?)",
    stampStep1: "বাচ্চার অ্যাপ খুলুন → ⚙️ Settings → About। সেখানে “Numberverse · vX.Y.Z · <তারিখ>” দেখাবে।",
    stampStep2: "ঘোষণার চেয়ে তারিখ/ভার্সন পুরনো মনে হলে অ্যাপটি এখনও রিফ্রেশ হয়নি।",
    stampStep3: "অ্যাপ পুরোপুরি বন্ধ করে আবার খুলুন (বা আপডেট ব্যানারে চাপুন)।",
    stampStep4: "শেষ উপায়: হোম-স্ক্রিন আইকন মুছে আবার যোগ করুন। অগ্রগতি নিরাপদ — সেটা সার্ভার ও ডিভাইসে থাকে।",
  },
} as const;

/** #89 — per-skill missed questions: what a kid got wrong, so re-teaching is
 *  transparent. EN + BN strings for the portal card — same country-pack seam.
 *  Built purely from the already-loaded story ledger (offline-first). */
export const MISSED_LANGS = {
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
export interface MissedQ {
  gameId: string;
  at: string;
  wrongAnswer: string | number | null;
  correctAnswer: string | number | null;
  errorKind: string | null;
  fingerprint: string | null;
  reteaching: boolean;
}

/** Per-skill group of recent misses (newest first, capped per skill). */
export interface MissedSkill {
  skillId: string;
  misses: MissedQ[];
}

/** #89 — derive the per-skill missed-question list from the loaded stories
 *  (newest-first). Pure + client-side, offline-friendly, nothing fetched. */
export function buildMissedQuestions(stories: LearningStoryRow[]): MissedSkill[] {
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
export function skillLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** #257 — world bands a focus pin can target (1..7). */
export const FOCUS_BANDS = [1, 2, 3, 4, 5, 6, 7];

/** #258 — per-kid VOICE preference. Tones are stable non-i18n handles that
 *  mirror the kid app's neural picker (warm female = the default); speed is a
 *  Web-Speech rate multiplier (1.0 = normal — the Bangla voice's own tempo is
 *  baked into its model). Same country-pack seam as WIZARD_LANGS: a new
 *  language = new en/bn keys, never a component rewrite. */
export const VOICE_TONES = [
  { key: "female", en: "Warm adult (female)", bn: "উষ্ণ প্রাপ্তবয়স্ক (মেয়ে)" },
  { key: "kid", en: "Kid voice", bn: "বাচ্চার ভয়েস" },
  { key: "soft", en: "Soft female", bn: "নরম মেয়ে" },
  { key: "warm", en: "Friendly male", bn: "বন্ধুত্বপূর্ণ ছেলে" },
] as const;
export const VOICE_SPEEDS = [
  { key: "slow", rate: 0.8, en: "Slower", bn: "ধীরে" },
  { key: "normal", rate: 1.0, en: "Normal", bn: "স্বাভাবিক" },
  { key: "fast", rate: 1.2, en: "Faster", bn: "দ্রুত" },
] as const;
export const VOICE_LANGS = {
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
export const WEEKDAYS = [
  { key: "mon", short: "Mon", full: "Monday" },
  { key: "tue", short: "Tue", full: "Tuesday" },
  { key: "wed", short: "Wed", full: "Wednesday" },
  { key: "thu", short: "Thu", full: "Thursday" },
  { key: "fri", short: "Fri", full: "Friday" },
  { key: "sat", short: "Sat", full: "Saturday" },
  { key: "sun", short: "Sun", full: "Sunday" },
] as const;
export const LIMIT_CHOICES = [0, 30, 45, 60, 90] as const;
export const WEEKDAY_DEFAULTS = [45, 45, 45, 45, 45, 90, 90]; // school vs weekend

/** #6 — read the current per-day array from settings (Mon..Sun). A legacy flat
 *  `daily_limit_min` shows as the same value every day; nothing set → the
 *  built-in defaults (45 school / 90 weekend). Mirrors todayLimitMin() in the
 *  kid app, so the portal display always matches what the kid app enforces. */
export function weekdayLimits(s: KidSettingsT): number[] {
  if (s.weekday_limits_min) {
    const parts = s.weekday_limits_min.split(",").map((x) => parseInt(x, 10));
    if (parts.length === 7 && parts.every((n) => Number.isFinite(n))) return parts;
  }
  if (s.daily_limit_min && s.daily_limit_min > 0) {
    return Array(7).fill(s.daily_limit_min); // legacy flat cap → same every day
  }
  return [...WEEKDAY_DEFAULTS];
}
export function writeWeekdayLimits(s: KidSettingsT, arr: number[]): KidSettingsT {
  return { ...s, weekday_limits_min: arr.join(",") };
}

/** #248 — per-day quiet windows (Mon..Sun). Each entry is "HH:MM-HH:MM" or "-"
 *  (no quiet time that day). Mirrors the kid-app parser exactly. */
export const QUIET_DEFAULTS = ["-", "-", "-", "-", "-", "-", "-"];
export function quietWindowsArr(s: KidSettingsT): string[] {
  if (s.quiet_windows) {
    const parts = s.quiet_windows.split(",");
    if (parts.length === 7) return parts.map((p) => (p.trim() ? p.trim() : "-"));
  }
  return [...QUIET_DEFAULTS];
}
export function writeQuietWindows(s: KidSettingsT, arr: string[]): KidSettingsT {
  return { ...s, quiet_windows: arr.map((w) => (w && w.includes("-") ? w : "-")).join(",") };
}
/** Split one "HH:MM-HH:MM" entry into its two time strings (or "" when off). */
export function quietWindowParts(entry: string): { start: string; end: string; on: boolean } {
  const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(entry.trim());
  if (!m) return { start: "", end: "", on: false };
  return { start: m[1], end: m[2], on: true };
}

export function masteryPct(m: MasteryRow): number {
  return Math.min(100, Math.round(m.mastery * 100));
}

// ── #238 KOTHA weekly learning narrative ────────────────────────────────
// A plain-language "what happened this week" paragraph generated from the
// kid's Kotha stories. Pure + client-side: it takes only the stories the portal
// already fetched and the skill catalog, and returns EN + BN text. Nothing is
// re-sent to any server, so a parent's edits are edit-safe and stay local.

/** Misconception fingerprint codes (packages/core/src/moni/fingerprint.ts) →
 *  short parent-friendly phrasing, EN + BN. */
export const NARR_MIS: Record<string, { en: string; bn: string }> = {
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
export const ACCEL_REASONS: Record<string, { en: string; bn: string }> = {
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

export const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTH_NAMES_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

/** The last `months` calendar months as `{ key, year, month, labelEn, labelBn }`
 *  (newest first, zero-filled so an idle month shows honestly). */
export function rollingMonths(months = 12, now = new Date()): Array<{ key: string; labelEn: string; labelBn: string }> {
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

export interface MonthSummary {
  key: string;
  rounds: number;
  correct: number;
  minutes: number;
  /** Top skills by rounds played that month (skill id + counts). */
  top: Array<{ id: string; rounds: number; correct: number }>;
}

/** Bucket activity rounds into the rolling 12-month archive. `activity` must be
 *  sorted newest-first (as the API returns it). Pure + offline. */
export function buildMonthlyArchive(activity: ActivityRow[]): MonthSummary[] {
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
export function archiveToCsv(rows: MonthSummary[]): string {
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

export function narrTitleEn(id: string): string {
  return SKILLS.find((s) => s.id === id)?.title ?? id.replace(/-/g, " ");
}
export function narrTitleBn(id: string): string {
  const s = SKILLS.find((x) => x.id === id);
  return s?.titleBn ?? narrTitleEn(id);
}

/** #79 — short "12 Aug" / "১২ আগস্ট" date for the mastery timeline. */
export function shortDate(iso: string, lang: "en" | "bn"): string {
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
export function relTime(ms: number, lang: "en" | "bn"): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return lang === "bn" ? "এইমাত্র" : "just now";
  if (mins < 60) return `${lang === "bn" ? String(mins).replace(/[0-9]/g, (x) => "০১২৩৪৫৬৭৮৯"[Number(x)]) : mins}${lang === "bn" ? "মি" : "m"}`;
  const h = Math.round(mins / 60);
  return `${lang === "bn" ? String(h).replace(/[0-9]/g, (x) => "০১২৩৪৫৬৭৮৯"[Number(x)]) : h}${lang === "bn" ? "ঘ" : "h"}`;
}

/** One kid's play session, derived client-side from the activity feed. */
export interface TimelineSession {
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
export interface TimelineAcc {
  start: string;
  rounds: number;
  correct: number;
  ms: number;
  mastered: string[];
}

/** A 30-minute idle gap starts a new session. */
export const SESSION_GAP_MS = 30 * 60 * 1000;
export const SESSION_MASTERY = 0.8;

/** Port of the API's BKT mastery update (routers/progress.py `_bkt_update`).
 *  Replaying the activity feed with this reproduces server mastery exactly
 *  (default params) so we can attribute "mastered" crossings to the session
 *  they happened in — fully offline. */
export function bktUpdate(m: number, correct: boolean, pLearn = 0.1, pGuess = 0.15, pSlip = 0.1): number {
  const p = m;
  const pCorrect = p * (1 - pSlip) + (1 - p) * pGuess;
  if (pCorrect <= 0) return p;
  const pGiven = correct ? (p * (1 - pSlip)) / pCorrect : (p * pSlip) / (1 - pCorrect);
  const g = Math.min(1, Math.max(0, pGiven));
  return Math.min(1, g + (1 - g) * pLearn);
}

export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Group a kid's rounds (newest-first, as the API returns them) into play
 *  sessions and replay BKT to find which skills crossed mastery in each block.
 *  Pure + offline — built from the same full-history fetch as the archive. */
export function buildSessionTimeline(activity: ActivityRow[]): TimelineSession[] {
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
export function narrListEn(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}
export function narrListBn(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length === 2) return `${xs[0]} ও ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")} ও ${xs[xs.length - 1]}`;
}

export interface KothaNarrative {
  en: string;
  bn: string;
}

/** Build the EN+BN "this week" paragraph from the last 7 days of stories.
 *  Returns null when there's nothing this week (the card then invites play). */
export function buildWeeklyNarrative(kidName: string, stories: LearningStoryRow[]): KothaNarrative | null {
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
export function readNarrDraft(kidId: string): { en: string; bn: string; edited: boolean } | null {
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

export interface FlaggedSkill {
  skillId: string;
  wrong: number;
  reason: { en: string; bn: string };
}

/** Top 3 skills with Moni flags in the last 7 days, strongest flag first.
 *  misconception > fatigue > gap/guessing > plain wrongs. Empty = no flags. */
export function buildFlaggedSkills(stories: LearningStoryRow[]): FlaggedSkill[] {
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
export function kidCurrentBand(m: MasteryRow[]): number {
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
export function trySoundPreview(kind: "voice" | "sfx" | "music", vol: number) {
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
export function tryVoicePreview(tone: string, speed: number, lang: "en" | "bn") {
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

/** #619 — persistent section navigation. Every dashboard card carries an
 *  `id` matching one of these anchors so parents can jump straight to the
 *  report, the learning controls, or account settings instead of scrolling
 *  blind through 26 sections. Grouped into six top-level areas. */
export const NAV_GROUPS: { label: string; items: { id: string; label: string }[] }[] = [
  {
    label: "Overview",
    items: [
      { id: "overview", label: "Family overview" },
      { id: "today", label: "Today" },
      { id: "week", label: "This week" },
      { id: "review", label: "Week in review" },
      { id: "sessions", label: "Sessions" },
      { id: "activity", label: "Recent activity" },
      { id: "compare", label: "Compare kids" },
    ],
  },
  {
    label: "Reading & stories",
    items: [
      { id: "stories", label: "Reading & stories" },
      { id: "week-words", label: "Week in words" },
      { id: "archive", label: "Monthly archive" },
    ],
  },
  {
    label: "Learning",
    items: [
      { id: "controls", label: "Learning controls" },
      { id: "games", label: "Games to try" },
      { id: "mastery", label: "Skill mastery" },
      { id: "accel", label: "Acceleration plan" },
      { id: "help-needed", label: "Needs a little help" },
      { id: "missed", label: "Missed sessions" },
    ],
  },
  {
    label: "Resources",
    items: [
      { id: "worksheet", label: "Printable worksheet" },
      { id: "flashcards", label: "Flashcard QR cards" },
    ],
  },
  {
    label: "Family",
    items: [
      { id: "add-kid", label: "Add a new kid" },
      { id: "edit-kid", label: "Edit child" },
    ],
  },
  {
    label: "Account",
    items: [
      { id: "account", label: "Account & security" },
      { id: "help", label: "Help & setup" },
      { id: "on-device", label: "On-device data" },
    ],
  },
];
