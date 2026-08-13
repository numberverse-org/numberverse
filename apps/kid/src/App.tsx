import { useCallback, useEffect, useRef, useState } from "react";
// Type-only — Phaser's runtime lives in the async engine chunk (issue #15), so
// `import type` is erased and the main bundle carries ZERO engine bytes.
import type { Game } from "phaser";
import {
  BANDS,
  SKILLS,
  GAME_SCENES,
  getGame,
  nextDifficulty,
  moni,
  deriveLearningStyle,
  DEFAULT_MONI_PARAMS,
  type Band,
  type Skill,
  type ErrorKind,
} from "@numberverse/core";
import { useKidStore, todayIso, dayIsoAgo, NOVA_QUEST_TARGET, NOVA_QUEST_REWARD, NOVA_BIRTHDAY_COINS, NOVA_CALENDAR_REWARDS, calendarCycleDay, STORY_QUEUE_CAP, speciesById, speciesEmoji, type RoundResult, type MistakeState, type KothaStory } from "./store";
import { syncProgress, startAutoSync, restoreServerState, fetchKidSettings, cachedKidSettings, todayMinutes, addTodayMinutes, todayLimitMin, hasParentSession, parentName, validateParentSession, signinParent, signupParent, signinGoogle, clearParentSession, signoutParent, drainStoriesIfFull, hasParentPin, setParentPin, verifyParentPin, clearParentPin, KID_SETTINGS_DEFAULT, type KidSettings } from "./api";
import { GoogleSignIn, googleEnabled } from "./components/GoogleSignIn";
import { ensureAudio, startMusic, toggleMusicMute, isMusicMuted, click, whooshUp, tada, setMusicTheme } from "./game/audio";
import { confettiBurst } from "./game/celebrate";
import { setCurrentKidName } from "./game/kidName";
import { speak, cancelSpeech, primeSpeech, speechStatus, speechReadiness, setSpeechEnabled, type SpeechPlatform, type SpeechReadiness } from "./game/speech";
import { getAppLang, setAppLang, getLocale, currentFestival } from "./game/locale";
import { prefersReducedMotion, setReducedMotion } from "./game/reducedMotion";
import { boot as bootGame, teardown as teardownGame, whenReady as whenGameReady } from "./game/gameHost";
import { wrongLedger } from "./game/wrongLedger";
import { Icon, AvatarIcon, AVATAR_EMOJI, AVATAR_KEYS } from "./components/Icon";
import { neuralSpeak, getNeuralSpeaker, setNeuralSpeaker, isNeuralReady, NEURAL_VOICES } from "./game/neuralVoice";
import { renderShareCard, renderCertCard, canvasToBlob, sharePng, waTextUrl, type ShareCardData, type ShareCertData } from "./game/shareImage";
import { startRecording, stopRecording } from "./game/voiceRecorder";

/** Build stamp — shown in the parent panel footer. Bump on every deploy so a
 *  stale service-worker cache is instantly visible (if the phone shows an old
 *  stamp, the new build hasn't landed yet — force-reload / reinstall the PWA). */
const APP_BUILD = "13 Aug 2026 · 0.26.16 (per-day wrong-answer history + playtime caps + band lock + data export)";
/** Semantic version (0.MAJOR.MINOR.PATCH) — auto-bumped by release.sh to
 *  0.<N>.0 for every vN release, so the app reports a real version number. */
const APP_VERSION = "0.26.16";

type Screen = "welcome" | "syllabus" | "home" | "kidpick" | "addkid" | "worlds" | "worlddetail" | "playing" | "done" | "break" | "contrast" | "parent" | "settings" | "nova" | "garden" | "cards" | "badges" | "leaderboard" | "trophyroom" | "cert" | "castle";
/** Rounds per skill before advancing to the next skill in a world.
 *  5 rounds = a real practice block, not a drive-by. */
const ROUNDS_TO_FINISH = 5;
/** Max skills per guided play session — each skill gets a proper block.
 *  World sessions now sweep every unmastered skill in the band (min 6). */
const SESSION_LEN = 6;
/** A skill is "mastered" at this BKT P(mastered). Mirrors core masteryThreshold. */
const MASTERY_THRESHOLD = 0.8;
/** Next world unlocks when ≥80% of the previous world's skills are mastered. */
const UNLOCK_THRESHOLD = 0.8;

/** 📚 #330 — misconception codes → parent-friendly labels (EN + BN). Plain
 *  strings on purpose (not t()) so the class-insights card stays readable
 *  without bloating the i18n table with a full code dictionary. */
const MISCONCEPTION_LABELS: Record<string, { en: string; bn: string }> = {
  "overcount-1": { en: "Counts one too many", bn: "এক বেশি গুনে" },
  "undercount-1": { en: "Counts one too few", bn: "এক কম গুনে" },
  "off-by-ten": { en: "Off by ten — tens/ones mix-up", bn: "দশের ঘরের গোলমাল" },
  "off-by-hundred": { en: "Off by one hundred — place mix-up", bn: "শতকের ঘরের গোলমাল" },
  double: { en: "Doubles the number", bn: "সংখ্যা দ্বিগুণ করে" },
  half: { en: "Halves the number", bn: "সংখ্যা অর্ধেক করে" },
  reversal: { en: "Writes the digit backwards", bn: "অঙ্ক উল্টে লেখে" },
  "repeated-error": { en: "Same mistake keeps repeating", bn: "একই ভুল বারবার হয়" },
};

/** 🎯 #325 — MONI contrast-drill templates, keyed by misconception CODE.
 *  Each is a short side-by-side quiz: two big options (correct + the pattern's
 *  trap) around a warm prompt. Bilingual (EN + BN) kid-facing copy; numerals
 *  + emoji stay universal. Only codes with a template get a drill — a random
 *  guess never triggers one. */
interface ContrastRound {
  prompt: { en: string; bn: string };
  correct: string;
  trap: string;
  tip: { en: string; bn: string };
}
interface ContrastTemplate {
  code: string;
  intro: { en: string; bn: string };
  rounds: ContrastRound[];
}
const CONTRAST_TEMPLATES: Record<string, ContrastTemplate> = {
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
const DONE_CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  left: Math.random() * 100,
  delay: -Math.random() * 4, // negative → already mid-fall on mount
  dur: 2.6 + Math.random() * 2.6,
  drift: (Math.random() - 0.5) * 180,
  rot: 360 + Math.random() * 540,
  color: ["#4cc9f0", "#ffd166", "#ff8fa3", "#2ec4b6", "#c4b5fd", "#ffb35c"][i % 6],
}));

/* ── Seasons — the journey path lives in the real world's season ───────────
 * The path is decorated by the actual calendar month (Northern-ish cycle that
 * still matches a Bangladeshi kid's year):
 *   Dec–Feb ❄️ snow   Mar–May 🌸 spring flowers
 *   Jun–Aug ✨ fireflies   Sep–Nov 🍂 autumn leaves
 * The particles are stable module data (same pattern as DONE_CONFETTI), so the
 * path doesn't reshuffle on every render. */
type SeasonKey = "snow" | "flowers" | "fireflies" | "leaves";
const SEASON_PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 7.3 + 3) % 96,
  delay: (i % 7) * 0.6,
  dur: 5 + (i % 5) * 1.6,
  drift: (i % 2 ? 1 : -1) * (10 + (i % 4) * 8),
  rot: (i % 3) * 120,
}));
function currentSeason(): SeasonKey {
  const m = new Date().getMonth(); // 0 = January
  if (m >= 11 || m <= 1) return "snow";
  if (m <= 4) return "flowers";
  if (m <= 7) return "fireflies";
  return "leaves";
}
const SEASON_EMOJI: Record<SeasonKey, string> = { snow: "❄️", flowers: "🌸", fireflies: "✨", leaves: "🍂" };

/** Fullscreen helpers — degrade gracefully when the Fullscreen API is missing
 *  (iOS Safari reports fullscreenEnabled === false, and its webkit prefix only
 *  works for <video>, not the page). The PWA manifest's "fullscreen" display +
 *  the apple/mobile-web-app meta tags cover the installed-home-screen path.
 *
 *  DEFAULT FULLSCREEN: the app enters fullscreen on the very first tap
 *  anywhere — a kid gets an immersive, edge-to-edge screen from the start and
 *  it STAYS fullscreen through leaving a game (parents exit via the footer
 *  toggle / "f" key). */
const fsSupported = () => {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as unknown as {
    webkitRequestFullscreen?: () => void;
  };
  return Boolean(document.fullscreenEnabled || el?.webkitRequestFullscreen);
};

function requestFullscreen() {
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
function exitFullscreen() {
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
interface SessionStep {
  skillId: string;
  gameId: string;
  scene: string;
  title: string;
  mode?: "add" | "sub" | "vowels" | "consonants" | "family" | "conjuncts";
  /** Run the narrated Basket Math concept-demo before the drills (add/sub). */
  teach?: boolean;
  /** Mastery-gate count: how many remediation re-runs this step has had after
   *  the kid left wrongs unresolved. >0 → re-teach (re-demo + easier tier)
   *  until a block ends with open === 0, then advance. */
  reteach?: number;
}

interface Kid {
  id: string;
  name: string;
  avatar: string;
  birthYear: number;
  /** Optional full birthday (month 1–12, day 1–31) — feeds the birthday party.
   *  Kids created before this existed only have the year → no party (graceful). */
  birthMonth?: number;
  birthDay?: number;
}

/** Mastery state map (from the persisted store) — key `${kidId}:${skillId}`.
 *  The store's real value is the full core SkillState (lastPractice/correct/
 *  attempts/streak too) — the album reads those for card dates + flip stats. */
type SkillMapEntry = { pMastered: number; lastPractice?: number | null; correct?: number; attempts?: number; streak?: number };
type SkillMap = Record<string, SkillMapEntry>;

const AVATARS = AVATAR_KEYS;

/* ── rank ladder: mastery count → a fun title kids want to reach ── */
const RANKS = [
  { min: 0, en: "🌱 Seedling", bn: "🌱 চারা" },
  { min: 3, en: "🌿 Sprout", bn: "🌿 কচি" },
  { min: 8, en: "🦊 Explorer", bn: "🦊 অভিযাত্রী" },
  { min: 15, en: "🦉 Wise Owl", bn: "🦉 জ্ঞানী প্যাঁচা" },
  { min: 22, en: "🚀 Star Pilot", bn: "🚀 স্টার পাইলট" },
  { min: 28, en: "👑 Champion", bn: "👑 চ্যাম্পিয়ন" },
];

function rankFor(mastered: number, lang: Lang): { title: string; nextTitle: string | null; need: number } {
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
function isBirthday(kid: Kid | null | undefined): boolean {
  if (!kid || typeof kid.birthMonth !== "number" || typeof kid.birthDay !== "number") return false;
  const now = new Date();
  return now.getMonth() + 1 === kid.birthMonth && now.getDate() === kid.birthDay;
}

/** Skill ids that have crossed the mastery bar for a kid right now. */
function masteredSkillIds(map: SkillMap, kidId: string): Set<string> {
  const set = new Set<string>();
  for (const key of Object.keys(map)) {
    const sep = key.indexOf(":");
    if (sep < 0 || key.slice(0, sep) !== kidId) continue;
    if (map[key].pMastered >= MASTERY_THRESHOLD) set.add(key.slice(sep + 1));
  }
  return set;
}

/** Consecutive correct rounds at the tail of this session's events → the HUD 🔥. */
function sessionStreak(events: RoundResult[]): number {
  let s = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (!events[i].correct) break;
    s++;
  }
  return s;
}

/* ────────────────────────────── #283 goal badges ──────────────────────────────
 * Small lifetime badges for real learning wins. Each condition reads only
 * existing local state (stats, streak, world mastery) — fully offline. The
 * earned set is persisted in the store (`NovaState.badges`); this config just
 * DEFINES the badges + their conditions. Names are locale-packed like Nova
 * outfits (name / nameBn — a new country adds its field, no rewrite). */

interface BadgeCtx {
  sessions: number; // completed sessions (each = a playthrough)
  stars: number;
  streak: number;
  worlds: number; // fully-mastered lands
}
interface BadgeDef {
  id: string;
  emoji: string;
  name: string;
  nameBn: string;
  hint: string;
  hintBn: string;
  earned: (c: BadgeCtx) => boolean;
}
const BADGES: BadgeDef[] = [
  { id: "rounds10", emoji: "🎮", name: "10 Rounds Hero", nameBn: "১০ রাউন্ড হিরো", hint: "Finish 10 sessions", hintBn: "১০টা খেলা শেষ করো", earned: (c) => c.sessions >= 10 },
  { id: "stars50", emoji: "⭐", name: "Star Collector", nameBn: "তারকা সংগ্রহকারী", hint: "Earn 50 stars", hintBn: "৫০টা তারা জিতো", earned: (c) => c.stars >= 50 },
  { id: "streak7", emoji: "🔥", name: "7-Day Streak", nameBn: "৭ দিনের ধারা", hint: "Play 7 days in a row", hintBn: "টানা ৭ দিন খেলো", earned: (c) => c.streak >= 7 },
  { id: "worldChamp", emoji: "👑", name: "Land Champion", nameBn: "ভূখণ্ড চ্যাম্পিয়ন", hint: "Master every skill in a land", hintBn: "একটি ভূখণ্ডের সব দক্ষতা আয়ত্ত করো", earned: (c) => c.worlds >= 1 },
];

/** How many lands the kid has FULLY mastered (every skill past the threshold). */
function fullyMasteredWorlds(skillsMap: Record<string, SkillMapEntry>, kidId: string): number {
  return BANDS.filter((b) => {
    const prog = worldProgress(skillsMap, kidId, b.id);
    return prog.total > 0 && prog.mastered === prog.total;
  }).length;
}

/* ────────────────────────────── i18n (English / বাংলা) ────────────────────────────── */

type Lang = "en" | "bn";

interface Strings {
  appTagline: string;
  agesBadge: string;
  play: string;
  playWith: (name: string) => string;
  fullscreen: string;
  fullscreenOff: string;
  syncIdle: string;
  syncOk: string;
  syncSyncing: string;
  syncOffline: string;
  storyQueueNote: (n: number) => string;
  syncError: string;
  pickKid: string;
  switchKid: (avatar: string, name: string) => string;
  /* #22 — sibling co-op: two kids, one device, alternating turns. */
  siblingCoop: string;
  passDevice: string;
  passTo: (name: string) => string;
  nowPlaying: (name: string) => string;
  youBadge: string;
  coopHint: string;
  /* #139 — flashcard QR → mini-game tie-in. */
  scanCard: string;
  scanTitle: string;
  scanHint: string;
  scanCodePlaceholder: string;
  scanLaunch: string;
  scanNotCard: string;
  scanCameraDenied: string;
  scanClose: string;
  parentZone: string;
  parentNote: string;
  whoPlaying: string;
  pickProfile: string;
  addKid: string;
  addKidSub: string;
  upTo4: string;
  skillsMastered: (n: number) => string;
  worldsOpen: (n: number) => string;
  worldsOf: (name: string) => string;
  masterSkillsSub: string;
  worldComplete: string;
  /* learning journey */
  journey: string;
  worldsLabel: string;
  /* visual map (worlds as islands on a winding road) */
  mapTab: string;
  mapSub: string;
  mapHere: string;
  mapLand: string;
  mapLandProg: (m: number, t: number) => string;
  mapRoadOpen: (world: string) => string;
  journeySub: string;
  journeyProgress: (m: number, t: number) => string;
  journeyLocked: string;
  journeyTapHint: string;
  journeyDone: string;
  masterMoreIn: (n: number, prev: string) => string;
  skillsProg: (m: number, t: number) => string;
  champion: string;
  worldAges: (range: string, m: number, t: number) => string;
  masterMoreToUnlock: (n: number, name: string) => string;
  readyFor: (name: string) => string;
  playNext: (title: string) => string;
  /** Home PLAY screen's "what will we play next" line. */
  nextLesson: (title: string) => string;
  practiceAgain: string;
  /** Journey-first home: Nova greets the kid by name on the path. */
  homeHello: (name: string) => string;
  homePath: string;
  homeViewJourney: string;
  /** Warm re-entry after a missed day (streak kindness — no guilt). */
  welcomeBack: (name: string) => string;
  /** Quest is unreachable today (parent playtime cap) → gentle rest, not frustration. */
  questRest: string;
  /* mastery card album */
  cardsTile: string;
  cardsTitle: string;
  cardsSub: (n: number, total: number) => string;
  cardsWorldChamp: (title: string) => string;
  cardsWorldComplete: (n: number) => string;
  cardsPlayToCollect: string;
  cardsAccuracy: (n: number) => string;
  cardsAttempts: (n: number) => string;
  cardsStreak: (n: number) => string;
  cardsMasteredBy: (name: string) => string;
  worldChampDone: (title: string) => string;
  /* printable certificate */
  certBtn: string;
  certTitle: string;
  certThisCertifies: string;
  certHasMastered: string;
  certSkillCount: (n: number) => string;
  certWithNova: string;
  certSigned: string;
  certDate: string;
  certPrint: string;
  certBack: string;
  certSpeak: (name: string, world: string) => string;
  /** Generic back-button label (aria) used on every `icon-btn` back arrow —
   *  localized so a Bangla screen reader never announces English "Back". */
  back: string;
  /* birthday party */
  birthMonth: string;
  birthDay: string;
  birthdayHello: (name: string) => string;
  birthdayTitle: (name: string) => string;
  birthdayGift: (n: number) => string;
  birthdayClaim: string;
  birthdayClaimed: string;
  /* the pet — an egg that hatches and grows as the kid learns */
  petTitle: string;
  petStage0: string;
  petStage1: string;
  petStage2: string;
  petStage3: string;
  petGrow: (pct: number) => string;
  petFeed: string;
  petFedToday: string;
  petFeedSpeak: string;
  petHatchSpeak: (name: string) => string;
  petName: string;
  petGrewInto: (stage: string) => string;
  /* name in funny voices — Nova plays with the kid's name */
  funnyTitle: string;
  funnyRobot: string;
  funnyWhisper: string;
  funnyShout: string;
  /* build-a-castle — a tower rises with every mastered world */
  castleTile: string;
  castleTitle: string;
  castleBuilt: (n: number, total: number) => string;
  castleTowerBuilt: (title: string) => string;
  castleTowerToBuild: (title: string) => string;
  castleCrown: string;
  castleBuildCta: (title: string) => string;
  /* seasons — the path changes with the real calendar */
  seasonSnow: string;
  seasonFlowers: string;
  seasonFireflies: string;
  seasonLeaves: string;
  /* festivals — country-based decor, the active one is config (#137) */
  festivalBanner: (name: string, emoji: string) => string;
  fest_boishakh: string;
  fest_eid_fitr: string;
  fest_eid_adha: string;
  fest_christmas: string;
  fest_ramadan: string;
  fest_diwali: string;
  fest_holi: string;
  /* daily quest */
  questTitle: string;
  questProgress: (n: number, target: number) => string;
  questDoneText: string;
  questReward: (n: number) => string;
  questCompleteSpeak: (n: number) => string;
  /* #281 — 7-day login calendar */
  calendarTitle: string;
  calendarHint: string;
  calendarDayOf: (d: number) => string;
  calendarClaim: (n: number) => string;
  calendarClaimed: string;
  calendarLocked: string;
  calendarClaimSpeak: (name: string, n: number) => string;
  /* #283 — goal badges */
  badgeTile: string;
  badgeTitle: string;
  badgeSub: (n: number, total: number) => string;
  badgeEarned: string;
  badgeLocked: string;
  badgeNewSpeak: (name: string, title: string) => string;
  /* #282 — same-device sibling leaderboard */
  lbTile: string;
  lbTitle: string;
  lbSub: string;
  lbStatMastery: string;
  lbStatRounds: string;
  lbStatStars: string;
  lbYou: string;
  lbEmpty: string;
  lbAddSibling: string;
  lbSpeak: (name: string, rank: number) => string;
  /* #277 — land trophy room */
  trTitle: string;
  trSub: (n: number, total: number) => string;
  trEarned: string;
  trLocked: string;
  trEmpty: string;
  trNewSpeak: (name: string, land: string) => string;
  /* #284 — mastery mystery boxes */
  boxTile: string;
  boxHint: (n: number) => string;
  boxOpen: string;
  boxCapSpeak: string;
  boxRewardSpeak: (name: string, coins: number) => string;
  /* offline-first */
  offlineReady: string;
  installBtn: string;
  nextBadge: string;
  amazing: string;
  earned: (avatar: string, name: string, stars: number, score: number, world: string) => string;
  keepGoing: (n: number, world: string) => string;
  greatSession: string;
  completeUnlocked: (world: string, next: string) => string;
  playAgain: string;
  /** The "Next round" button on the done screen — advances to the next stop on
   *  the journey (falls back to Play again when the journey is complete). */
  nextRound: string;
  worldsBtn: string;
  homeBtn: string;
  /** Folded-away "More" menu on the minimal home screen (Worlds/Nova/Garden/
   *  Cards/Castle + Nova's funny-voice name game). */
  moreMenu: string;
  round: (r: number, total: number) => string;
  pickBuddy: string;
  kidsName: string;
  namePlaceholder: string;
  birthYear: string;
  ageAt: (age: number) => string;
  saveKid: (name: string) => string;
  langLabel: string;
  leaveGame: string;
  parentTitle: string;
  parentSub: string;
  parentWelcome: (name: string) => string;
  parentFamTitle: string;
  parentFamKids: (n: number) => string;
  parentFamStars: (n: number) => string;
  parentFamPoints: (n: number) => string;
  parentFamSessions: (n: number) => string;
  parentFamMastered: (n: number) => string;
  parentPortalTitle: string;
  parentPortalSub: string;
  parentPortalCta: string;
  /* parent gate (first-load sign-in) */
  gateTitle: string;
  gateSub: string;
  gateSignin: string;
  gateSignup: string;
  gateNameLabel: string;
  gateNamePh: string;
  gateEmailLabel: string;
  gateEmailPh: string;
  gatePassLabel: string;
  gatePassPh: string;
  gateShowPass: string;
  gatePassHint: string;
  gatePassOk: string;
  gateSubmitIn: string;
  gateSubmitUp: string;
  gateBusy: string;
  gateErrorInvalid: string;
  gateErrorSignup: string;
  gateGuest: string;
  gateGuestSub: string;
  gatePrivacy: string;
  gateWelcome: (name: string) => string;
  gatePower: string;
  gateContinue: string;
  gateGoogleOr: string;
  gateErrorGoogle: string;
  gateGoogleGone: string;
  /* first-time welcome (language pick on top, then guest-vs-sign-in) */
  welcomeTitle: string;
  welcomeSub: string;
  welcomeLangLabel: string;
  welcomeEnglish: string;
  welcomeBangla: string;
  welcomeGuest: string;
  welcomeGuestSub: string;
  welcomeOr: string;
  welcomeSignin: string;
  welcomeSyllabus: string;
  /* interactive syllabus (what kids learn) */
  syllabusGuestNote: string;
  syllabusTitle: string;
  syllabusSub: string;
  syllabusWhat: string;
  syllabusGame: string;
  syllabusStart: string;
  syllabusFab: string;
  syllabusHow: string;
  syllabusHow1: string;
  syllabusHow2: string;
  syllabusHow3: string;
  syllabusProgress: (done: number, total: number) => string;
  syllabusTap: string;
  syllabusBadge: (band: number) => string;
  syllabusMastered: string;
  syllabusNotStarted: string;
  syllabusDone: string;
  syllabusOpen: string;
  /* settings screen */
  settingsTitle: string;
  settingsSub: string;
  settingsSyllabus: string;
  /* parent sign-out (Parent panel — parent-only, never kid-facing) */
  parentSignoutTitle: string;
  parentSignoutSub: string;
  parentSignoutCta: string;
  parentSignoutConfirm: string;
  /* parent PIN lock (#86) — 4-digit gate on the parent area */
  pinTitle: string;
  pinUnlockSub: string;
  pinSetTitle: string;
  pinSetSub: string;
  pinConfirmTitle: string;
  pinConfirmSub: string;
  pinChangeTitle: string;
  pinChangeSub: string;
  pinNewTitle: string;
  pinWrong: (n: number) => string;
  pinLocked: string;
  pinLockedSub: string;
  pinForgot: string;
  pinForgotSub: string;
  pinResetArmed: string;
  pinResetCta: string;
  pinMismatch: string;
  pinCurrentWrong: string;
  pinKeep: string;
  pinLockCardTitle: string;
  pinLockCardSub: string;
  pinSet: string;
  pinChange: string;
  /* about / version */
  settingsAboutSub: string;
  settingsVoice: string;
  settingsVoiceOk: (v: string) => string;
  settingsVoiceNone: string;
  settingsVoiceTest: string;
  /* #138 — kid dictation (record own voice + replay, on-device) */
  settingsDictate: string;
  settingsDictateSub: string;
  settingsDictateStart: string;
  settingsDictateStop: string;
  settingsDictateDenied: string;
  settingsDictateUnsupported: string;
  settingsDictateClear: string;
  /* settings screen — grouped sections */
  settingsSecScreen: string;
  projectorToggle: string;
  projectorToggleSub: string;
  projectorOn: string;
  projectorOff: string;
  projectorKeyHint: string;
  settingsSecParents: string;
  settingsReduceMotion: string;
  settingsMusicOff: string;
  settingsParentsHint: string;
  settingsParentsGo: string;
  settingsParentsSignin: string;
  settingsSecSound: string;
  settingsSecLanguage: string;
  settingsSecLearning: string;
  settingsMusicRow: string;
  settingsVoiceNeural: (v: string) => string;
  settingsVoiceOff: string;
  settingsReadingOff: string;
  settingsVoiceDownload: (pct: number) => string;
  settingsSyncOk: string;
  settingsSyncWorking: string;
  settingsSyncOffline: string;
  settingsSyncError: string;
  settingsSyncIdle: string;
  starsTotal: (n: number) => string;
  points: (n: number) => string;
  sessions: (n: number) => string;
  parentSkills: string;
  /* Share loop — parent shares progress / certificate to WhatsApp */
  shareProgress: string;
  shareShare: string;
  shareCardTitle: string;
  shareCardFooter: string;
  shareStatsStars: string;
  shareStatsScore: string;
  shareStatsSessions: string;
  shareWorldsTitle: string;
  shareRewardSpeak: (name: string) => string;
  shareRewardToast: string;
  shareWhatsApp: string;
  shareDone: string;
  shareFail: string;
  shareProgressCaption: (name: string) => string;
  /* 📄 KOTHA weekly digest export */
  digestBtn: string;
  digestEmpty: string;
  digestDone: string;
  digestHeader: (name: string, week: string) => string;
  digestStats: (total: number, solved: number, tricky: number) => string;
  digestSolved: string;
  digestTricky: (n: number) => string;
  digestMoni: (code: string) => string;
  certShare: string;
  certShareFooter: string;
  certShareCaption: (name: string, world: string) => string;
  music: string;
  musicMuted: string;
  install: string;
  /* Voice check (parent panel) */
  voiceTitle: string;
  voicePlatform: (p: string) => string;
  voiceTest: string;
  voiceBnOk: (v: string) => string;
  voiceBnMissing: string;
  voiceEnOk: (v: string) => string;
  voiceNone: string;
  /* On-device neural Bangla voice (Piper VITS) */
  voiceNeuralReady: string;
  voiceNeuralLoading: (pct: number) => string;
  voiceNeuralError: string;
  voiceNeuralIdle: string;
  voiceCacheHit: (pct: number) => string;
  /* Bangla voice picker (choose among the model's 16 speakers) */
  voicePickTitle: string;
  voicePickHint: string;
  voicePickFemale: string;
  voicePickKid: string;
  voicePickSoft: string;
  voicePickWarm: string;
  voicePickListen: string;
  mastered: string;
  inProgress: string;
  notStarted: string;
  playLimitReached: string;
  /* wrong-answer ledger — parent panel "needs help" */
  parentHelpTitle: string;
  parentHelpNone: string;
  parentHelpOpen: (n: number) => string;
  parentHelpWrong: (n: number) => string;
  reteachLetTry: string;
  practicePill: string;
  /* 🧠 MONI — the tiny tutor's insight card */
  moniTitle: string;
  moniTag: string;
  /* ❌ #78 wrong-answer history (parent panel) — per-day heatmap + drill-down */
  mistakesTitle: string;
  mistakesSub: string;
  mistakesHeatTitle: string;
  mistakesDayLabel: (date: string, n: number) => string;
  mistakesSkillWrong: (n: number) => string;
  mistakesEmpty: string;
  mistakesNoneDay: string;
  mistakesWeekday: string;
  moniLearnStyle: string;
  moniBestGame: string;
  moniAttention: string;
  moniConfidence: string;
  moniConfidenceGentle: string;
  moniConfidenceSteady: string;
  moniConfidenceChallenging: string;
  moniMisconceptions: string;
  moniMisconceptionsNone: string;
  moniNextMove: string;
  moniTone: string;
  moniSessionLength: string;
  moniSessionHint: (n: number) => string;
  moniGoals: string;
  moniGoalFocus: string;
  moniGoalWeak: string;
  moniGoalReview: (n: number) => string;
  /* #333 parent-adjustable strictness */
  moniStrictness: string;
  moniStrictnessHelp: string;
  moniStrictnessGentle: string;
  moniStrictnessSteady: string;
  moniStrictnessChallenging: string;
  moniReviewGentle: string;
  moniReviewTap: (n: number) => string;
  breakTitle: (name: string) => string;
  breakBody: string;
  breakRest: string;
  breakKeepGoing: string;
  moniWeek: string;
  moniWeekRounds: string;
  moniWeekAcc: string;
  moniWeekPace: string;
  moniWeekStyle: string;
  moniWeekBestGame: string;
  moniWeekPaceUp: string;
  moniWeekPaceDown: string;
  moniWeekPaceFlat: string;
  moniStyleFast: string;
  moniStyleSteady: string;
  moniStyleSocial: string;
  contrastTrigger: (name: string) => string;
  contrastTriggerSub: string;
  contrastRight: string;
  /* #133 — screen-reader live-region announcements */
  a11yRight: string;
  a11yWrong: string;
  a11yMastered: (title: string) => string;
  a11yVoiceOn: string;
  a11yVoiceOff: string;
  a11yMusicOn: string;
  a11yMusicOff: string;
  contrastOops: (correct: string) => string;
  contrastDoneTitle: string;
  contrastDoneBody: string;
  contrastDoneBtn: string;
  contrastProgress: (cur: number, total: number) => string;
  kothaInspector: string;
  kothaInspectorSub: string;
  kothaFilterAll: string;
  kothaFilterWrong: string;
  kothaFilterCorrect: string;
  kothaEmpty: string;
  kothaKindMisconception: string;
  kothaKindGap: string;
  kothaKindFatigue: string;
  kothaKindGuessing: string;
  kothaKindSlip: string;
  kothaAction: string;
  kothaAgo: (ts: number) => string;
  kothaCorrect: string;
  kothaWrong: string;
  moniTrendUp: string;
  moniTrendFlat: string;
  moniTrendDown: string;
  moniSessions: (n: number) => string;
  moniRounds: (n: number) => string;
  /* Nova companion */
  novaTitle: string;
  novaTagline: string;
  novaMeet: string;
  novaTapHint: string;
  novaCoins: (n: number) => string;
  novaStreak: (n: number) => string;
  novaCareFed: string;
  novaCarePlay: string;
  novaShop: string;
  novaEquip: string;
  novaEquipped: string;
  novaNeedCoins: string;
  novaDailyEarned: (n: number) => string;
  novaHello: string;
  novaFeedMsg: string;
  novaPlayMsg: string;
  novaTapMsg: string;
  novaEquipMsg: string;
  novaPlayGames: string;
  rankLabel: string;
  rankNextNeed: (next: string, need: number) => string;
  newSkill: (n: number) => string;
  /** Spoken the INSTANT a skill crosses the mastery bar mid-session (#290). */
  masterySpeak: (title: string) => string;
  /* growth garden */
  gardenTile: string;
  gardenHint: string;
}

const STR: Record<Lang, Strings> = {
  en: {
    appTagline: "Your kids learn smarter — Bangla, English, Math & more.",
    agesBadge: "Ages 2–13 · no ads, ever",
    play: "▶ Play",
    playWith: (n) => `▶ Play, ${n}!`,
    fullscreen: "⛶ Fullscreen",
    fullscreenOff: "⛶ Exit fullscreen",
    syncIdle: "Waiting to sync…",
    syncOk: "✓ Progress saved to cloud",
    syncSyncing: "Syncing…",
    syncOffline: "Offline — progress saved on device",
    syncError: "Sync hiccup — will retry",
    storyQueueNote: (n) => `${n} learning moments saved on this device — they'll reach the cloud when you're online 📚`,
    pickKid: "👶 Pick your kid",
    switchKid: (a, n) => `${a} ${n} — switch kid`,
    // #22 — sibling co-op: two kids, one device, alternating turns.
    siblingCoop: "Sibling co-op",
    passDevice: "Pass the device",
    passTo: (name) => `Pass to ${name}`,
    nowPlaying: (name) => `${name} is playing now`,
    youBadge: "You",
    coopHint: "Two kids, one device — take turns!",
    // #139 — flashcard QR → mini-game tie-in.
    scanCard: "Scan a card",
    scanTitle: "Scan a flashcard",
    scanHint: "Point the camera at a flashcard QR — or type its code below.",
    scanCodePlaceholder: "NV:skillId (or just skillId)",
    scanLaunch: "Open game",
    scanNotCard: "That code isn't a Numberverse card",
    scanCameraDenied: "Camera unavailable — type the card's code instead",
    scanClose: "Cancel",
    parentZone: "👨‍👩‍👧 Parent Zone",
    parentNote:
      "Worlds unlock by learning progress, not age — master a world's skills to open the next one.",
    whoPlaying: "Who's playing?",
    pickProfile: "Pick a profile or add one",
    addKid: "Add a kid",
    addKidSub: "Worlds unlock by progress, not age",
    upTo4: "up to 4 per family",
    skillsMastered: (n) => `${n} skills mastered`,
    worldsOpen: (n) => `${n}/5 worlds open`,
    worldsOf: (name) => `${name}'s worlds`,
    masterSkillsSub: "Master skills to unlock the next world",
    worldComplete: "World complete! 🎉",
    journey: "Journey",
    worldsLabel: "Worlds",
    mapTab: "Map",
    mapSub: "A living map — tap a land to play there",
    mapHere: "You're here!",
    mapLand: "Land",
    mapLandProg: (m, t) => `${m}/${t} mastered`,
    mapRoadOpen: (world) => `You opened the road to ${world}! 🎉`,
    journeySub: "Nova walks the path — master a lesson to reach the next dot",
    journeyProgress: (m, t) => `${m} of ${t} lessons mastered`,
    journeyLocked: "Master the lesson above to open this one",
    journeyTapHint: "🦉 Nova is here — tap to play!",
    journeyDone: "🏆 Every lesson mastered — you finished the whole journey!",
    masterMoreIn: (n, prev) => `Master ${n} more in ${prev} to unlock`,
    skillsProg: (m, t) => `${m}/${t} skills mastered`,
    champion: "🏆 Every world mastered — you're a Numberverse champion!",
    worldAges: (range, m, t) => `Ages ${range} · ${m}/${t} skills mastered`,
    masterMoreToUnlock: (n, name) => `Master ${n} more skill${n > 1 ? "s" : ""} to unlock ${name}`,
    readyFor: (name) => `You're ready for ${name}!`,
    playNext: (title) => `▶ Play next: ${title}`,
    nextLesson: (title) => `Next up: ${title}`,
    practiceAgain: "▶ Practice again",
    homeHello: (name) => `Whoo! Hi ${name}!`,
    homePath: "Your path",
    homeViewJourney: "Full journey ›",
    welcomeBack: (name) => `Welcome back, ${name}! 💛`,
    questRest: "🌙 All done for today — great job! Your quest restarts tomorrow.",
    cardsTile: "My Cards",
    cardsTitle: "Card Album",
    cardsSub: (n, total) => `${n} of ${total} collected`,
    cardsWorldChamp: (title) => `✨ ${title} Champion!`,
    cardsWorldComplete: (n) => `All ${n} skills mastered`,
    cardsPlayToCollect: "Play to collect",
    cardsAccuracy: (n) => `🎯 ${n}% correct`,
    cardsAttempts: (n) => `🔁 ${n} rounds`,
    cardsStreak: (n) => `🔥 best streak ${n}`,
    cardsMasteredBy: (name) => `Mastered by ${name}`,
    worldChampDone: (title) => `🏆 ${title} complete — a golden card is yours!`,
    certBtn: "🖨️ Certificate",
    certTitle: "Certificate of Achievement",
    certThisCertifies: "This certifies that",
    certHasMastered: "has proudly mastered",
    certSkillCount: (n) => `${n} skills`,
    certWithNova: "in Numberverse, guided by Nova the Owl",
    certSigned: "Nova the Owl",
    certDate: "Date",
    certPrint: "🖨️ Print / Save as PDF",
    certBack: "‹ Back",
    certSpeak: (name, world) => `Certificate! ${name}, you mastered ${world}!`,
    back: "Back",
    birthMonth: "Month",
    birthDay: "Day",
    birthdayHello: (name) => `Happy Birthday, ${name}! 🎂`,
    birthdayTitle: (name) => `🎂 ${name}'s Birthday`,
    birthdayGift: (n) => `Nova's gift: +${n} coins 🪙`,
    birthdayClaim: "🎁 Collect!",
    birthdayClaimed: "🎁 Gift collected",
    petTitle: "Your pet",
    petStage0: "Egg",
    petStage1: "Hatchling",
    petStage2: "Young",
    petStage3: "Grown",
    petGrow: (pct) => `${Math.round(pct * 100)}% to grow`,
    petFeed: "🍎 Feed",
    petFedToday: "Fed 💖",
    petFeedSpeak: "Yum! That was delicious!",
    petHatchSpeak: (name) => `Wow! ${name}, your pet grew up!`,
    petName: "Pet",
    petGrewInto: (stage) => `Your pet grew into a ${stage}! 🎉`,
    funnyTitle: "Nova says your name!",
    funnyRobot: "🤖 Robot",
    funnyWhisper: "🤫 Whisper",
    funnyShout: "📢 Shout",
    castleTile: "🏰 Castle",
    castleTitle: "My Castle",
    castleBuilt: (n, total) => `${n}/${total} towers built`,
    castleTowerBuilt: (title) => `${title} tower built!`,
    castleTowerToBuild: (title) => `Finish ${title} to build`,
    castleCrown: "🏰 The castle is complete! King Nova salutes you! 👑",
    castleBuildCta: (title) => `Build the ${title} tower`,
    seasonSnow: "❄️ Winter",
    seasonFlowers: "🌸 Spring",
    seasonFireflies: "✨ Firefly Summer",
    seasonLeaves: "🍂 Autumn",
    festivalBanner: (name, emoji) => `✨ ${emoji} ${name} is here in Numberverse!`,
    fest_boishakh: "Pohela Boishakh",
    fest_eid_fitr: "Eid al-Fitr",
    fest_eid_adha: "Eid al-Adha",
    fest_christmas: "Christmas",
    fest_ramadan: "Ramadan",
    fest_diwali: "Diwali",
    fest_holi: "Holi",
    /* daily quest */
    questTitle: "🎯 Today's Quest",
    questProgress: (n, target) => `Play ${n}/${target} rounds`,
    questDoneText: "✅ Quest complete!",
    questReward: (n) => `+${n} 🪙 bonus`,
    questCompleteSpeak: (n) => `Quest complete! You won ${n} bonus coins! 🎉`,
    /* #281 — 7-day login calendar */
    calendarTitle: "📅 Daily Rewards",
    calendarHint: "Play every day — a bigger bonus each day",
    calendarDayOf: (d) => `Day ${d} of 7`,
    calendarClaim: (n) => `Collect +${n} 🪙`,
    calendarClaimed: "✓ Collected",
    calendarLocked: "🔒",
    calendarClaimSpeak: (name, n) => `${name}, daily reward collected — ${n} coins! 🎉`,
    /* #283 — goal badges */
    badgeTile: "Badges",
    badgeTitle: "🏅 Badge Book",
    badgeSub: (n, total) => `${n} of ${total} badges earned`,
    badgeEarned: "Earned!",
    badgeLocked: "Keep playing to unlock",
    badgeNewSpeak: (name, title) => `${name}, new badge — ${title}! 🎖️`,
    /* #282 — same-device sibling leaderboard */
    lbTile: "Leaderboard",
    lbTitle: "🥇 Sibling Leaderboard",
    lbSub: "Same device · no cloud",
    lbStatMastery: "Mastered",
    lbStatRounds: "Rounds",
    lbStatStars: "Stars",
    lbYou: "You",
    lbEmpty: "Add a sibling to start comparing progress!",
    lbAddSibling: "➕ Add sibling",
    lbSpeak: (name, rank) => `${name}, you're #${rank} on this device!`,
    /* #277 — land trophy room */
    trTitle: "🏆 Trophy Room",
    trSub: (n, total) => `${n} of ${total} lands conquered`,
    trEarned: "Earned",
    trLocked: "Master every skill to earn",
    trEmpty: "No trophies yet — master a whole land!",
    trNewSpeak: (name, land) => `${name}, you conquered ${land}! 🏆`,
    /* #284 — mastery mystery boxes */
    boxTile: "🎁 Mystery Box",
    boxHint: (n) => `${n} mystery ${n === 1 ? "box" : "boxes"} waiting to open!`,
    boxOpen: "Open",
    boxCapSpeak: "The box will open tomorrow — the daily reward is full!",
    boxRewardSpeak: (name, coins) => `${name}, you found ${coins} coins in the box! 🎁`,
    /* offline-first */
    offlineReady: "✓ Works offline",
    installBtn: "📲 Get the app",
    nextBadge: "NEXT",
    amazing: "Amazing!",
    earned: (a, n, stars, score, world) => `${a} ${n} earned ${stars} ⭐ and ${score} points in ${world}.`,
    keepGoing: (n, world) => `🔥 Keep going — ${n} more to master in ${world}`,
    greatSession: "🔥 Great session!",
    completeUnlocked: (world, next) => `🏆 ${world} complete — ${next} is unlocked!`,
    playAgain: "Play again",
    nextRound: "Next round",
    worldsBtn: "Worlds",
    homeBtn: "Home",
    moreMenu: "More",
    round: (r, total) => `Round ${r}/${total}`,
    pickBuddy: "Pick a buddy",
    kidsName: "Kid's name",
    namePlaceholder: "e.g. Aria",
    birthYear: "Birth year",
    ageAt: (age) => `Age ${age} · starts at Sprout Grove`,
    saveKid: (name) => `✨ Save ${name}`,
    langLabel: "🌐 English",
    leaveGame: "Exit game",
    parentTitle: "Parent Panel",
    parentSub: "See how each kid is growing, skill by skill",
    parentWelcome: (name) => `Hi ${name} 👋`,
    parentFamTitle: "Family overview",
    parentFamKids: (n) => `${n} kids`,
    parentFamStars: (n) => `${n} stars`,
    parentFamPoints: (n) => `${n} points`,
    parentFamSessions: (n) => `${n} sessions`,
    parentFamMastered: (n) => `${n} mastered`,
    parentPortalTitle: "🖥️ Parent Portal",
    parentPortalSub: "Manage everything from the portal — add & remove kids, set learning limits, see the weekly report, and secure the account.",
    parentPortalCta: "Open Parent Portal",
    gateTitle: "Welcome, parent!",
    gateSub: "Sign in to keep your child's learning safe and see their progress.",
    gateSignin: "Sign in",
    gateSignup: "Create account",
    gateNameLabel: "Your name",
    gateNamePh: "e.g. Aisha",
    gateEmailLabel: "Email",
    gateEmailPh: "you@example.com",
    gatePassLabel: "Password",
    gatePassPh: "at least 6 characters",
    gateShowPass: "Show or hide password",
    gatePassHint: "Use at least 6 characters — a mix of letters and numbers is even stronger.",
    gatePassOk: "Great — that's long enough!",
    gateSubmitIn: "🔓 Sign in",
    gateSubmitUp: "✨ Create account",
    gateBusy: "Working…",
    gateErrorInvalid: "Sign-in failed — check the email and password.",
    gateErrorSignup: "Couldn't create the account — maybe that email is already registered.",
    gateGuest: "Skip for now — guest mode",
    gateGuestSub: "No account? Play instantly. Progress stays on this device, private and ad-free.",
    gatePrivacy: "🔒 No ads, no tracking, no selling your child's data. Your account just keeps their progress safe.",
    gateWelcome: (name) => `Hi ${name} 👋 — here's what your child will learn`,
    gatePower: "You can always return here from Parent Panel → What kids learn.",
    gateContinue: "Start learning →",
    gateGoogleOr: "or continue with email",
    gateErrorGoogle: "Google sign-in didn't work — try email or guest instead.",
    gateGoogleGone: "Google sign-in isn't available right now — email below works too.",
    welcomeTitle: "Welcome to Numberverse",
    welcomeSub: "Pick a language — the whole app will speak it. You can change it anytime in Settings.",
    welcomeLangLabel: "Choose your language",
    welcomeEnglish: "🇬🇧 English",
    welcomeBangla: "🇧🇩 বাংলা",
    welcomeGuest: "🎮 Continue as guest",
    welcomeGuestSub: "No account? Jump straight in — progress stays private on this device.",
    welcomeOr: "or",
    welcomeSignin: "👨‍👩‍👧 I'm a parent — sign in",
    welcomeSyllabus: "📚 What kids learn — no sign-in needed",
    syllabusGuestNote: "You're browsing as a guest — sign in to keep your child's progress on every device.",
    syllabusTitle: "What kids learn",
    syllabusSub: "One guided path, built the way a child's mind grows — numbers first, then games, then questions.",
    syllabusWhat: "👨‍👩‍👧 Every step your child takes, in order",
    syllabusGame: "🎮 play it",
    syllabusStart: "🚀 Start learning",
    syllabusFab: "Start",
    syllabusHow: "The learning ladder",
    syllabusHow1: "1 · Numbers first — your child meets every number before any calculation.",
    syllabusHow2: "2 · Games teach the idea — apples, sharing, arrays make it real.",
    syllabusHow3: "3 · Questions come last — once the idea is seen, the drill makes it stick.",
    syllabusProgress: (done, total) => `${done}/${total} mastered`,
    syllabusTap: "Tap a world to explore its lessons",
    syllabusBadge: (band) => `Band ${band}`,
    syllabusMastered: "✓ mastered",
    syllabusNotStarted: "not started",
    syllabusDone: "All worlds",
    syllabusOpen: "What kids learn",
    settingsTitle: "Settings",
    settingsSub: "Make it yours",
    settingsSyllabus: "📚 What kids learn",
    parentSignoutTitle: "🚪 Sign out",
    parentSignoutSub: "This device will leave the parent account — local progress stays. Sign back in anytime to keep it everywhere.",
    parentSignoutCta: "Sign out",
    parentSignoutConfirm: "Tap again to confirm",
    /* parent PIN lock (#86) */
    pinTitle: "🔒 Parent PIN",
    pinUnlockSub: "Enter the 4-digit PIN to open the parent area",
    pinSetTitle: "Set a parent PIN",
    pinSetSub: "Choose a 4-digit PIN — you'll need it every time the parent area opens",
    pinConfirmTitle: "Confirm your PIN",
    pinConfirmSub: "Enter the same 4 digits again",
    pinChangeTitle: "Change PIN",
    pinChangeSub: "Enter your current PIN",
    pinNewTitle: "New PIN",
    pinWrong: (n) => (n === 1 ? "Wrong PIN — 1 try left" : `Wrong PIN — ${n} tries left`),
    pinLocked: "PIN pad locked",
    pinLockedSub: "Too many wrong tries. Reset the PIN below — you'll sign back in and set a new one.",
    pinForgot: "Forgot PIN?",
    pinForgotSub: "Resets the lock and signs you out of the parent account.",
    pinResetArmed: "Reset PIN & sign out?",
    pinResetCta: "Reset & sign out",
    pinMismatch: "PINs don't match — start over",
    pinCurrentWrong: "That's not your current PIN",
    pinKeep: "Never share your PIN with your child",
    pinLockCardTitle: "🔐 PIN lock",
    pinLockCardSub: "The parent area opens with a 4-digit PIN",
    pinSet: "Set PIN",
    pinChange: "Change PIN",
    settingsAboutSub: "Numberverse · built for curious kids, offline & ad-free",
    settingsVoice: "🔊 Voice & reading",
    settingsVoiceOk: (v) => `Voice ready: ${v}`,
    settingsVoiceNone: "No voice found — install a voice in Settings → Accessibility → Spoken Content",
    settingsVoiceTest: "Test voice",
    settingsDictate: "🎙️ Record my voice",
    settingsDictateSub: "Record yourself saying your answer, then replay it. Stays on this device — never sent anywhere.",
    settingsDictateStart: "⏺️ Record",
    settingsDictateStop: "⏹ Stop",
    settingsDictateDenied: "Mic permission was denied — allow the mic in your browser settings.",
    settingsDictateUnsupported: "Recording isn't supported in this browser.",
    settingsDictateClear: "Delete",
    settingsSecSound: "🔊 Sound & voice",
    settingsSecScreen: "🖥️ Screen",
    projectorToggle: "📽️ Classroom projector",
    projectorToggleSub: "Big, bright type for a classroom screen — the parent area is hidden.",
    projectorOn: "Projector is on",
    projectorOff: "Projector is off",
    projectorKeyHint: "Press Enter to play · Esc to exit fullscreen",
    settingsReduceMotion: "Reduce motion",
    settingsSecLanguage: "🌐 Language",
    settingsSecLearning: "📚 My learning",
    settingsSecParents: "👨‍👩‍👧 For parents",
    settingsMusicOff: "A parent turned music off for this profile.",
    settingsParentsHint: "Progress, per-kid controls and the full portal — grown-ups only.",
    settingsParentsGo: "Open parent area",
    settingsParentsSignin: "Sign in as parent",
    settingsMusicRow: "Background music",
    settingsVoiceNeural: (v) => `Neural Bangla voice — ${v} (offline)`,
    settingsVoiceOff: "Reading is off",
    settingsReadingOff: "A parent turned reading off — ask them to turn it back on.",
    settingsVoiceDownload: (pct) => `Downloading Bangla voice… ${pct}%`,
    settingsSyncOk: "✓ All stories saved on this device",
    settingsSyncWorking: "Saving stories…",
    settingsSyncOffline: "Not connected — stories stay on this device",
    settingsSyncError: "Couldn't save — I'll try again",
    settingsSyncIdle: "Ready — stories save as you play",
    starsTotal: (n) => `${n} stars earned`,
    points: (n) => `${n} points`,
    sessions: (n) => `${n} sessions`,
    parentSkills: "Skills",
    music: "🔊 Music on",
    musicMuted: "🔇 Music off",
    install: "Install app",
    shareProgress: "📤 Share progress",
    shareShare: "Share",
    shareCardTitle: "🎉 Numberverse",
    shareCardFooter: "Made with Numberverse — kids learn math & Bangla, offline, no ads.",
    shareStatsStars: "Stars",
    shareStatsScore: "Points",
    shareStatsSessions: "Sessions",
    shareWorldsTitle: "Worlds",
    shareRewardSpeak: (name) => `${name}'s progress was shared! You earned +5 coins! 🎉`,
    shareRewardToast: "🎉 Shared! +5 coins for your kid",
    shareWhatsApp: "WhatsApp",
    shareDone: "✓ Shared",
    shareFail: "Couldn't share on this device",
    shareProgressCaption: (name) => `${name} has been playing Numberverse — math & Bangla, offline, no ads! kids.munna-khan.xyz`,
    digestBtn: "📄 Weekly digest",
    digestEmpty: "No stories yet this week — a few games and the digest will fill up.",
    digestDone: "Weekly digest downloaded ✓",
    digestHeader: (name, week) => `Numberverse — weekly learning digest\nKid: ${name}\nWeek: ${week}`,
    digestStats: (total, solved, tricky) => `${total} moments · ${solved} solved · ${tricky} tricky`,
    digestSolved: "solved",
    digestTricky: (n) => `${n} misses`,
    digestMoni: (code) => `Moni spotted: ${code}`,
    certShare: "📤 Share",
    certShareFooter: "Made with Numberverse — kids learn math & Bangla, offline, no ads.",
    certShareCaption: (name, world) => `${name} mastered ${world} in Numberverse! 🏆 kids.munna-khan.xyz`,
    voiceTitle: "🔊 Voice check",
    voicePlatform: (p) => `Device: ${p}`,
    voiceTest: "Play test line",
    voiceBnOk: (v) => `Bangla voice: ${v} ✓`,
    voiceBnMissing: "No Bangla voice installed — open Settings → Text-to-speech and install Bengali.",
    voiceEnOk: (v) => `English voice: ${v}`,
    voiceNone: "Speech not available on this device/browser.",
    voiceNeuralReady: "On-device Bangla neural voice ready — same voice everywhere, works offline ✓",
    voiceNeuralLoading: (pct) => `On-device Bangla neural voice downloading… ${pct}%`,
    voiceNeuralError: "Neural voice unavailable — Bangla falls back to the device voice.",
    voiceNeuralIdle: "On-device Bangla neural voice downloads on first use (once, then offline forever).",
    voiceCacheHit: (pct) => `🎙️ Voice cache: ${pct}% of lines instant (on-device, offline)`,
    voicePickTitle: "🎙️ Bangla voice",
    voicePickHint: "Pick who reads Bangla — all on-device, same on every device.",
    voicePickFemale: "Warm adult (female)",
    voicePickKid: "Kid voice",
    voicePickSoft: "Soft female",
    voicePickWarm: "Friendly male",
    voicePickListen: "Listen",
    mastered: "Mastered",
    playLimitReached: "🦉 Wow, you played so much today! Come back tomorrow 💤",
    parentHelpTitle: "Needs a little help",
    parentHelpNone: "All caught up! 🎉",
    parentHelpOpen: (n) => `${n} to finish`,
    parentHelpWrong: (n) => `${n} misses`,
    reteachLetTry: "Almost! Let's practice this a different way 💪",
    practicePill: "Practice!",
    inProgress: "In progress",
    notStarted: "Not started",
    /* 🧠 MONI */
    moniTitle: "Moni the Tutor",
    moniTag: "What Moni learned about your child",
    /* ❌ #78 wrong-answer history */
    mistakesTitle: "❌ Wrong answers",
    mistakesSub: "What your child is still working on — per day, per skill",
    mistakesHeatTitle: "Last 28 days",
    mistakesDayLabel: (date, n) => `${date} — ${n} ${n === 1 ? "wrong answer" : "wrong answers"}`,
    mistakesSkillWrong: (n) => `${n} wrong`,
    mistakesEmpty: "No wrong answers in the last 28 days — wonderful! 🎉",
    mistakesNoneDay: "Nothing tricky on this day",
    mistakesWeekday: "S M T W T F S",
    moniLearnStyle: "Learning style",
    moniBestGame: "Loves",
    moniAttention: "Focus",
    moniConfidence: "Confidence",
    moniConfidenceGentle: "gentle — needs kind wins",
    moniConfidenceSteady: "steady — balanced",
    moniConfidenceChallenging: "ready for a challenge",
    moniMisconceptions: "Patterns spotted",
    moniMisconceptionsNone: "None yet — Moni is still watching",
    moniNextMove: "Moni's next move",
    moniTone: "Tone",
    moniSessionLength: "Best session",
    moniSessionHint: (n) => `Moni saw you stay sharp for ~${n} rounds — keep going or take a break, your call 💛`,
    moniGoals: "Moni's 3 next skills",
    moniGoalFocus: "the main focus right now",
    moniGoalWeak: "still needs work",
    moniGoalReview: (n) => `brush up in ${n} day${n === 1 ? "" : "s"}`,
    moniStrictness: "How hard should Moni push?",
    moniStrictnessHelp: "Gentle eases difficulty back, challenging takes it a step up. Changes instantly, offline.",
    moniStrictnessGentle: "Gentle",
    moniStrictnessSteady: "Steady",
    moniStrictnessChallenging: "Challenging",
    moniReviewGentle: "Moni says: a quick review keeps it sharp — no rush!",
    moniReviewTap: (n) => (n === 1 ? "Tap to brush up" : "Tap to brush up"),
    breakTitle: (name) => `Stretch time, ${name}!`,
    breakBody: "Your brain just worked super hard, and Nova is proud. A little break makes the next game even more fun!",
    breakRest: "OK, stretch break",
    breakKeepGoing: "I'm good — keep going!",
    moniWeek: "📅 This week",
    moniWeekRounds: "Rounds",
    moniWeekAcc: "Accuracy",
    moniWeekPace: "Pace",
    moniWeekStyle: "Learning style",
    moniWeekBestGame: "Best game",
    moniWeekPaceUp: "Stronger than usual 💪",
    moniWeekPaceDown: "A bit softer this week 🐢",
    moniWeekPaceFlat: "Steady as always ⚖️",
    moniStyleFast: "⚡ Speed Sprinter",
    moniStyleSteady: "🐢 Steady Pal",
    moniStyleSocial: "🦉 Friend of All",
    contrastTrigger: (name) => `Moni spotted a pattern in ${name} — fix it together!`,
    contrastTriggerSub: "A short side-by-side game, no pressure",
    contrastRight: "Correct! You spotted the pattern! 🎉",
    a11yRight: "Nice — that's right!",
    a11yWrong: "Not quite — try again, Nova will help.",
    a11yMastered: (title) => `You mastered ${title}!`,
    a11yVoiceOn: "Reading is on.",
    a11yVoiceOff: "Reading is off.",
    a11yMusicOn: "Background music is on.",
    a11yMusicOff: "Background music is off.",
    contrastOops: (correct) => `That's the trick! The answer is ${correct}. Try again!`,
    contrastDoneTitle: "Pattern beaten! 🏆",
    contrastDoneBody: "You looked at them side by side and found the difference. Moni is SO proud — let's keep it sharp!",
    contrastDoneBtn: "Back to the adventure",
    contrastProgress: (cur, total) => `Pattern round ${cur} of ${total}`,
    kothaInspector: "📚 Learning stories",
    kothaInspectorSub: "What was tried, how Moni read it, what we did",
    kothaFilterAll: "All",
    kothaFilterWrong: "Wrong",
    kothaFilterCorrect: "Correct",
    kothaEmpty: "No stories yet — play a round and the story log fills up.",
    kothaKindMisconception: "misconception",
    kothaKindGap: "gap",
    kothaKindFatigue: "fatigue",
    kothaKindGuessing: "guessing",
    kothaKindSlip: "slip",
    kothaAction: "Moni",
    kothaAgo: (ts) => {
      const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (s < 60) return "just now";
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      return `${d}d ago`;
    },
    kothaCorrect: "Correct",
    kothaWrong: "Wrong",
    moniTrendUp: "improving 📈",
    moniTrendFlat: "steady ➖",
    moniTrendDown: "needs support 📉",
    moniSessions: (n) => `${n} sessions`,
    moniRounds: (n) => `${n} rounds`,
    /* Nova companion */
    novaTitle: "Nova the Owl",
    novaTagline: "Earn coins in games — dress up Nova!",
    novaMeet: "Meet Nova",
    novaTapHint: "🦉 Tap Nova!",
    novaCoins: (n) => `${n} coins`,
    novaStreak: (n) => `${n}-day streak`,
    novaCareFed: "Feed",
    novaCarePlay: "Play",
    novaShop: "Outfit shop",
    novaEquip: "Wear",
    novaEquipped: "Wearing",
    novaNeedCoins: "Play games to earn more coins! 💪",
    novaDailyEarned: (n) => `${n}/20 coins earned today`,
    novaHello: "Whoo! I'm Nova — let's have fun!",
    novaFeedMsg: "Yummy! Thanks! 🍎",
    novaPlayMsg: "Whee! That was fun! 🎈",
    novaTapMsg: "Whoo-hoo! 😄",
    novaEquipMsg: "Ooh, I love this outfit! 💛",
    novaPlayGames: "Play games & earn coins",
    rankLabel: "Your rank",
    rankNextNeed: (next, need) => `${need} more lesson${need > 1 ? "s" : ""} to become ${next}`,
    newSkill: (n) => (n === 1 ? "🌟 New skill mastered!" : `🌟 ${n} new skills mastered!`),
    masterySpeak: (title) => `Wow! You mastered ${title}! 🎉`,
    gardenTile: "My Garden",
    gardenHint: "Answer right — plants grow!",
  },
  bn: {
    appTagline: "আপনার সন্তানরা স্মার্টভাবে শিখুক — বাংলা, ইংরেজি, গণিত ও আরও।",
    agesBadge: "২–১৩ বছর · কোনো বিজ্ঞাপন নেই",
    play: "▶ খেলুন",
    playWith: (n) => `▶ খেলো, ${n}!`,
    fullscreen: "⛶ পূর্ণ পর্দা",
    fullscreenOff: "⛶ পর্দা ছোট করুন",
    syncIdle: "সিঙ্কের অপেক্ষায়…",
    syncOk: "✓ শেখার খবর ক্লাউডে সংরক্ষিত",
    syncSyncing: "সিঙ্ক হচ্ছে…",
    syncOffline: "অফলাইন — শেখার খবর এই ডিভাইসে সংরক্ষিত",
    syncError: "সিঙ্কে সমস্যা — আবার চেষ্টা হবে",
    storyQueueNote: (n) => `${n}টি শেখার মুহূর্ত এই ডিভাইসে সংরক্ষিত — অনলাইন হলে ক্লাউডে পৌঁছে যাবে 📚`,
    pickKid: "👶 বাচ্চা বাছাই করুন",
    switchKid: (a, n) => `${a} ${n} — পরিবর্তন করুন`,
    // #22 — sibling co-op: two kids, one device, alternating turns.
    siblingCoop: "ভাই-বোনের খেলা",
    passDevice: "হাত বদল",
    passTo: (name) => `${name}-কে দাও`,
    nowPlaying: (name) => `এখন খেলছে ${name}`,
    youBadge: "তুমি",
    coopHint: "দুই ভাই-বোন, একটি ডিভাইস — পালা করে খেলো!",
    // #139 — flashcard QR → mini-game tie-in.
    scanCard: "কার্ড স্ক্যান করো",
    scanTitle: "ফ্ল্যাশকার্ড স্ক্যান করো",
    scanHint: "ফ্ল্যাশকার্ড QR-এর দিকে ক্যামেরা রাখো — অথবা নিচে কোডটি লিখো।",
    scanCodePlaceholder: "NV:skillId (বা শুধু skillId)",
    scanLaunch: "খেলা খুলো",
    scanNotCard: "এই কোডটি নম্বরভার্স কার্ড নয়",
    scanCameraDenied: "ক্যামেরা পাওয়া যায়নি — বদলে কার্ডের কোডটি লিখো",
    scanClose: "বাতিল",
    parentZone: "👨‍👩‍👧 মা-বাবার জায়গা",
    parentNote:
      "দক্ষতা দিয়ে জগৎ খোলে, বয়স দিয়ে নয় — পরের জগৎ খুলতে আগের জগতের দক্ষতা আয়ত্ত করুন।",
    whoPlaying: "কে খেলবে?",
    pickProfile: "প্রোফাইল বাছাই বা নতুন যোগ করুন",
    addKid: "নতুন বাচ্চা",
    addKidSub: "দক্ষতা দিয়ে জগৎ খোলে, বয়স নয়",
    upTo4: "পরিবারে সর্বোচ্চ ৪টি",
    skillsMastered: (n) => `${n}টি দক্ষতা আয়ত্ত`,
    worldsOpen: (n) => `${n}/৫টি জগৎ খোলা`,
    worldsOf: (name) => `${name} এর জগৎ`,
    masterSkillsSub: "পরের জগৎ খুলতে দক্ষতা আয়ত্ত করুন",
    worldComplete: "জগৎ সম্পন্ন! 🎉",
    journey: "যাত্রা",
    worldsLabel: "জগৎ",
    mapTab: "মানচিত্র",
    mapSub: "একটি জীবন্ত মানচিত্র — যে জমিতে খেলতে চাও, সেটিতে চাপ দাও",
    mapHere: "তুমি এখানে!",
    mapLand: "জমি",
    mapLandProg: (m, t) => `${m}/${t} আয়ত্ত`,
    mapRoadOpen: (world) => `${world}-এর পথ খুলে গেছে! 🎉`,
    journeySub: "নোভা পথ ধরে এগোয় — একটি পাঠ আয়ত্ত করলেই পরের ডটে পৌঁছবে",
    journeyProgress: (m, t) => `${m}/${t} পাঠ আয়ত্ত`,
    journeyLocked: "উপরের পাঠটি আয়ত্ত করলে এটা খুলবে",
    journeyTapHint: "🦉 নোভা এখানে — খেলতে চাপ দিন!",
    journeyDone: "🏆 সব পাঠ আয়ত্ত — পুরো যাত্রা শেষ করেছ!",
    masterMoreIn: (n, prev) => `${prev} এ আর ${n}টি আয়ত্ত করলে খুলবে`,
    skillsProg: (m, t) => `${m}/${t} দক্ষতা আয়ত্ত`,
    champion: "🏆 সব জগৎ আয়ত্ত — তুমি Numberverse চ্যাম্পিয়ন!",
    worldAges: (range, m, t) => `${range} বছর · ${m}/${t} দক্ষতা আয়ত্ত`,
    masterMoreToUnlock: (n, name) => `${name} খুলতে আর ${n}টি আয়ত্ত করুন`,
    readyFor: (name) => `${name} এর জন্য তুমি প্রস্তুত!`,
    playNext: (title) => `▶ পরবর্তী: ${title}`,
    nextLesson: (title) => `পরের পাঠ: ${title}`,
    practiceAgain: "▶ আবার অনুশীলন",
    homeHello: (name) => `হু! হাই ${name}!`,
    homePath: "তোমার পথ",
    homeViewJourney: "সম্পূর্ণ যাত্রা ›",
    welcomeBack: (name) => `ফিরে এসো, ${name}! 💛`,
    questRest: "🌙 আজকের খেলা শেষ — দারুণ! কাল আবার মিশন শুরু হবে।",
    cardsTile: "আমার কার্ড",
    cardsTitle: "কার্ড অ্যালবাম",
    cardsSub: (n, total) => `${bnNum(n)}/${bnNum(total)}টি সংগৃহীত`,
    cardsWorldChamp: (title) => `✨ ${title} চ্যাম্পিয়ন!`,
    cardsWorldComplete: (n) => `${bnNum(n)}টি দক্ষতা আয়ত্ত`,
    cardsPlayToCollect: "খেললে পাবে",
    cardsAccuracy: (n) => `🎯 ${bnNum(n)}% সঠিক`,
    cardsAttempts: (n) => `🔁 ${bnNum(n)}টা রাউন্ড`,
    cardsStreak: (n) => `🔥 সর্বোচ্চ ধারা ${bnNum(n)}`,
    cardsMasteredBy: (name) => `${name} আয়ত্ত করেছে`,
    worldChampDone: (title) => `🏆 ${title} শেষ — তোমার সোনালি কার্ড!`,
    certBtn: "🖨️ সনদ",
    certTitle: "অর্জনের সনদ",
    certThisCertifies: "এতে প্রমাণিত হয় যে",
    certHasMastered: "গর্বের সাথে আয়ত্ত করেছে",
    certSkillCount: (n) => `${bnNum(n)}টি দক্ষতা`,
    certWithNova: "Numberverse-এ, নোভা প্যাঁচার সাথে",
    certSigned: "নোভা প্যাঁচা",
    certDate: "তারিখ",
    certPrint: "🖨️ প্রিন্ট / PDF সংরক্ষণ",
    certBack: "‹ ফিরে যাও",
    certSpeak: (name, world) => `সনদ! ${name}, তুমি ${world} আয়ত্ত করেছ!`,
    back: "ফিরে যাও",
    birthMonth: "মাস",
    birthDay: "দিন",
    birthdayHello: (name) => `জন্মদিনের শুভেচ্ছা, ${name}! 🎂`,
    birthdayTitle: (name) => `🎂 ${name}-এর জন্মদিন`,
    birthdayGift: (n) => `নোভার উপহার: +${bnNum(n)} কয়েন 🪙`,
    birthdayClaim: "🎁 সংগ্রহ করো!",
    birthdayClaimed: "🎁 উপহার সংগৃহীত",
    petTitle: "তোমার পোষা",
    petStage0: "ডিম",
    petStage1: "ছানা",
    petStage2: "ছোট্ট",
    petStage3: "বড়ো",
    petGrow: (pct) => `${bnNum(Math.round(pct * 100))}% বড় হওয়া বাকি`,
    petFeed: "🍎 খাওয়াও",
    petFedToday: "খেয়েছে 💖",
    petFeedSpeak: "মম! কী মজা খাবার!",
    petHatchSpeak: (name) => `বাহ! ${name}, তোমার পোষা বড় হলো!`,
    petName: "পোষা",
    petGrewInto: (stage) => `তোমার পোষা বড় হয়ে হলো ${stage}! 🎉`,
    funnyTitle: "নোভা তোমার নাম বলে!",
    funnyRobot: "🤖 রোবট",
    funnyWhisper: "🤫 ফিসফিস",
    funnyShout: "📢 চিৎকার",
    castleTile: "🏰 দুর্গ",
    castleTitle: "আমার দুর্গ",
    castleBuilt: (n, total) => `${bnNum(n)}/${bnNum(total)} টা টাওয়ার বানানো`,
    castleTowerBuilt: (title) => `${title} টাওয়ার তৈরি!`,
    castleTowerToBuild: (title) => `${title} শেষ করলে তৈরি হবে`,
    castleCrown: "🏰 দুর্গ সম্পূর্ণ! রাজা নোভা তোমাকে স্যালুট করে! 👑",
    castleBuildCta: (title) => `${title} টাওয়ার বানাও`,
    seasonSnow: "❄️ শীত",
    seasonFlowers: "🌸 বসন্ত",
    seasonFireflies: "✨ জোনাকির গ্রীষ্ম",
    seasonLeaves: "🍂 শরৎ",
    festivalBanner: (name, emoji) => `✨ ${emoji} নম্বরভার্সে আজ ${name}!`,
    fest_boishakh: "পহেলা বৈশাখ",
    fest_eid_fitr: "ঈদুল ফিতর",
    fest_eid_adha: "ঈদুল আজহা",
    fest_christmas: "বড়দিন",
    fest_ramadan: "রমজান",
    fest_diwali: "দীপাবলি",
    fest_holi: "হোলি",
    /* daily quest */
    questTitle: "🎯 আজকের মিশন",
    questProgress: (n, target) => `${n}/${target}টা খেলা খেলো`,
    questDoneText: "✅ মিশন শেষ!",
    questReward: (n) => `+${n} 🪙 বোনাস`,
    questCompleteSpeak: (n) => `মিশন শেষ! তুমি ${n}টা বোনাস কয়েন জিতেছ! 🎉`,
    /* #281 — 7-day login calendar */
    calendarTitle: "📅 দৈনিক পুরস্কার",
    calendarHint: "প্রতিদিন খেলো — প্রতিদিন বড় বোনাস",
    calendarDayOf: (d) => `৭ এর মধ্যে দিন ${bnNum(d)}`,
    calendarClaim: (n) => `+${n} 🪙 নাও`,
    calendarClaimed: "✓ পাওয়া গেছে",
    calendarLocked: "🔒",
    calendarClaimSpeak: (name, n) => `${name}, দৈনিক পুরস্কার পেয়েছো — ${n} কয়েন! 🎉`,
    /* #283 — goal badges */
    badgeTile: "ব্যাজ",
    badgeTitle: "🏅 ব্যাজ বই",
    badgeSub: (n, total) => `${bnNum(n)}/${bnNum(total)}টা ব্যাজ জিতেছো`,
    badgeEarned: "জিতেছো!",
    badgeLocked: "আনলক করতে খেলতে থাকো",
    badgeNewSpeak: (name, title) => `${name}, নতুন ব্যাজ — ${title}! 🎖️`,
    /* #282 — same-device sibling leaderboard */
    lbTile: "লিডারবোর্ড",
    lbTitle: "🥇 ভাইবোন লিডারবোর্ড",
    lbSub: "একই ডিভাইস · ক্লাউড ছাড়া",
    lbStatMastery: "আয়ত্ত",
    lbStatRounds: "রাউন্ড",
    lbStatStars: "তারা",
    lbYou: "তুমি",
    lbEmpty: "তুলনা শুরু করতে ভাইবোন যোগ করো!",
    lbAddSibling: "➕ ভাইবোন যোগ করো",
    lbSpeak: (name, rank) => `${name}, এই ডিভাইসে তোমার স্থান #${bnNum(rank)}!`,
    /* #277 — land trophy room */
    trTitle: "🏆 ট্রফি রুম",
    trSub: (n, total) => `${bnNum(n)}/${bnNum(total)} ভূখণ্ড জয় করেছো`,
    trEarned: "জিতেছো",
    trLocked: "আয়ত্ত করলে পাবে",
    trEmpty: "এখনো ট্রফি নেই — পুরো ভূখণ্ড আয়ত্ত করো!",
    trNewSpeak: (name, land) => `${name}, তুমি ${land} জয় করেছ! 🏆`,
    /* #284 — mastery mystery boxes */
    boxTile: "🎁 মিস্ট্রি বক্স",
    boxHint: (n) => `${bnNum(n)}টা মিস্ট্রি বক্স খোলার অপেক্ষায়!`,
    boxOpen: "খোলো",
    boxCapSpeak: "বক্সটা কাল খুলবে — আজকের পুরস্কার ভরে গেছে!",
    boxRewardSpeak: (name, coins) => `${name}, বক্সে ${coins}টা কয়েন পেয়েছো! 🎁`,
    /* offline-first */
    offlineReady: "✓ অফলাইনে চলে",
    installBtn: "📲 অ্যাপটি নাও",
    nextBadge: "পরবর্তী",
    amazing: "অসাধারণ!",
    earned: (a, n, stars, score, world) => `${a} ${n} ${world} এ ${stars} ⭐ এবং ${score} পয়েন্ট অর্জন করেছে।`,
    keepGoing: (n, world) => `🔥 চালিয়ে যাও — ${world} এ আর ${n}টি আয়ত্ত করতে হবে`,
    greatSession: "🔥 দারুণ সেশন!",
    completeUnlocked: (world, next) => `🏆 ${world} সম্পন্ন — ${next} খুলে গেছে!`,
    playAgain: "আবার খেলুন",
    nextRound: "পরের ধাপ",
    worldsBtn: "জগৎ",
    homeBtn: "হোম",
    moreMenu: "আরও",
    round: (r, total) => `রাউন্ড ${r}/${total}`,
    pickBuddy: "বন্ধু বাছাই করুন",
    kidsName: "বাচ্চার নাম",
    namePlaceholder: "যেমন: আরিয়া",
    birthYear: "জন্মসাল",
    ageAt: (age) => `বয়স ${age} · স্প্রাউট গ্রোভ থেকে শুরু`,
    saveKid: (name) => `✨ সংরক্ষণ করুন ${name}`,
    langLabel: "🌐 বাংলা",
    leaveGame: "খেলা থেকে ফিরুন",
    parentTitle: "মা-বাবার প্যানেল",
    parentSub: "দেখুন প্রতিটি বাচ্চা কীভাবে শিখছে",
    parentWelcome: (name) => `হ্যালো, ${name} 👋`,
    parentFamTitle: "পরিবারের এক ঝলক",
    parentFamKids: (n) => `${n} জন বাচ্চা`,
    parentFamStars: (n) => `${n}টি তারা`,
    parentFamPoints: (n) => `${n} পয়েন্ট`,
    parentFamSessions: (n) => `${n}টি সেশন`,
    parentFamMastered: (n) => `${n}টি আয়ত্ত`,
    parentPortalTitle: "🖥️ মা-বাবার পোর্টাল",
    parentPortalSub: "পোর্টাল থেকে সবকিছু করুন — বাচ্চা যোগ/মুছুন, শেখার সময় বেঁধে দিন, সাপ্তাহিক রিপোর্ট দেখুন, অ্যাকাউন্ট সুরক্ষিত রাখুন।",
    parentPortalCta: "মা-বাবার পোর্টাল খুলুন",
    gateTitle: "স্বাগতম, মা-বাবা!",
    gateSub: "বাচ্চার শেখা নিরাপদ রাখতে ও কতটা শিখছে দেখতে সাইন ইন করুন।",
    gateSignin: "সাইন ইন",
    gateSignup: "অ্যাকাউন্ট খুলুন",
    gateNameLabel: "আপনার নাম",
    gateNamePh: "যেমন: ঐশী",
    gateEmailLabel: "ইমেইল",
    gateEmailPh: "you@example.com",
    gatePassLabel: "পাসওয়ার্ড",
    gatePassPh: "অন্তত ৬ অক্ষর",
    gateShowPass: "পাসওয়ার্ড দেখান বা লুকান",
    gatePassHint: "অন্তত ৬ অক্ষর ব্যবহার করুন — অক্ষর আর সংখ্যা মিলালে আরও শক্তিশালী হবে।",
    gatePassOk: "দারুণ — এতটুকুই যথেষ্ট!",
    gateSubmitIn: "🔓 সাইন ইন",
    gateSubmitUp: "✨ অ্যাকাউন্ট খুলুন",
    gateBusy: "চলছে…",
    gateErrorInvalid: "সাইন ইন ব্যর্থ — ইমেইল ও পাসওয়ার্ড যাচাই করুন।",
    gateErrorSignup: "অ্যাকাউন্ট তৈরি করা যায়নি — সম্ভবত ইমেইলটি ইতিমধ্যে নিবন্ধিত।",
    gateGuest: "এখনই না — অতিথি মোড",
    gateGuestSub: "অ্যাকাউন্ট নেই? সাথে সাথে খেলুন। শেখার খবর এই ডিভাইসেই থাকে, ব্যক্তিগত ও বিজ্ঞাপনমুক্ত।",
    gatePrivacy: "🔒 কোনো বিজ্ঞাপন নেই, ট্র্যাকিং নেই, বাচ্চার ডেটা বিক্রি নেই। আপনার অ্যাকাউন্ট শুধু তাদের শেখার খবর নিরাপদ রাখে।",
    gateWelcome: (name) => `হাই ${name} 👋 — আপনার বাচ্চা যা শিখবে`,
    gatePower: "আপনি সবসময় মা-বাবার প্যানেল → বাচ্চারা যা শেখে থেকে ফিরে আসতে পারেন।",
    gateContinue: "শেখা শুরু করুন →",
    gateGoogleOr: "অথবা ইমেইল দিয়ে চালিয়ে যান",
    gateErrorGoogle: "Google সাইন ইন কাজ করেনি — বদলে ইমেইল বা অতিথি চেষ্টা করুন।",
    gateGoogleGone: "Google সাইন ইন এখন পাওয়া যাচ্ছে না — নিচের ইমেইলও ঠিক কাজ করবে।",
    welcomeTitle: "নম্বরভার্সে স্বাগতম",
    welcomeSub: "একটি ভাষা বেছে নিন — পুরো অ্যাপ সেই ভাষাতেই কথা বলবে। যেকোনো সময় সেটিংসে বদলাতে পারবেন।",
    welcomeLangLabel: "আপনার ভাষা চয়ন করুন",
    welcomeEnglish: "🇬🇧 English",
    welcomeBangla: "🇧🇩 বাংলা",
    welcomeGuest: "🎮 অতিথি হিসেবে খেলুন",
    welcomeGuestSub: "অ্যাকাউন্ট নেই? সোজা ঢুকে পড়ুন — শেখার খবর এই ডিভাইসেই ব্যক্তিগত থাকে।",
    welcomeOr: "অথবা",
    welcomeSignin: "👨‍👩‍👧 আমি মা-বাবা — সাইন ইন করুন",
    welcomeSyllabus: "📚 বাচ্চারা যা শেখে — সাইন ইন লাগবে না",
    syllabusGuestNote: "আপনি অতিথি হিসেবে দেখছেন — বাচ্চার শেখার খবর সব ডিভাইসে রাখতে সাইন ইন করুন।",
    syllabusTitle: "বাচ্চারা যা শেখে",
    syllabusSub: "একটি সাজানো পথ, যা বাচ্চার মন বড় হওয়ার মতো করে গড়া — আগে সংখ্যা, তারপর খেলা, তারপর প্রশ্ন।",
    syllabusWhat: "👨‍👩‍👧 আপনার সন্তানের প্রতিটি ধাপ, ক্রম অনুযায়ী",
    syllabusGame: "🎮 খেলুন",
    syllabusStart: "🚀 শেখা শুরু করুন",
    syllabusFab: "শুরু",
    syllabusHow: "শেখার সিঁড়ি",
    syllabusHow1: "১ · আগে সংখ্যা — যেকোনো হিসাবের আগে বাচ্চা প্রতিটি সংখ্যার সাথে পরিচিত হয়।",
    syllabusHow2: "২ · খেলা ধারণা শেখায় — আপেল, ভাগাভাগি, সারি এটি বাস্তব করে তোলে।",
    syllabusHow3: "৩ · প্রশ্ন শেষে আসে — ধারণাটি দেখা হলে, অনুশীলন তা মনে গেঁথে দেয়।",
    syllabusProgress: (done, total) => `${done}/${total} আয়ত্ত`,
    syllabusTap: "শিক্ষার স্তর দেখতে একটি জগৎ ট্যাপ করুন",
    syllabusBadge: (band) => `স্তর ${band}`,
    syllabusMastered: "✓ আয়ত্ত",
    syllabusNotStarted: "শুরু হয়নি",
    syllabusDone: "সব জগৎ",
    syllabusOpen: "বাচ্চারা যা শেখে",
    settingsTitle: "সেটিংস",
    settingsSub: "তোমার মতো করে বানাও",
    settingsSyllabus: "📚 বাচ্চারা যা শেখে",
    parentSignoutTitle: "🚪 সাইন আউট",
    parentSignoutSub: "এই ডিভাইসটি মা-বাবার অ্যাকাউন্ট ছেড়ে যাবে — এই ডিভাইসের শেখার খবর থাকে। যেকোনো সময় আবার সাইন ইন করুন।",
    parentSignoutCta: "সাইন আউট",
    parentSignoutConfirm: "নিশ্চিত করতে আবার চাপুন",
    /* parent PIN lock (#86) */
    pinTitle: "🔒 মা-বাবার পিন",
    pinUnlockSub: "মা-বাবার অংশ খুলতে ৪ অঙ্কের পিন লিখুন",
    pinSetTitle: "মা-বাবার পিন সেট করুন",
    pinSetSub: "৪ অঙ্কের একটি পিন বেছে নিন — প্রতিবার মা-বাবার অংশ খুলতে এটা লাগবে",
    pinConfirmTitle: "পিন নিশ্চিত করুন",
    pinConfirmSub: "আবার একই ৪ অঙ্ক লিখুন",
    pinChangeTitle: "পিন পরিবর্তন করুন",
    pinChangeSub: "আপনার বর্তমান পিন লিখুন",
    pinNewTitle: "নতুন পিন",
    pinWrong: (n) => (n === 1 ? "ভুল পিন — ১ বার চেষ্টা বাকি" : `ভুল পিন — ${n} বার চেষ্টা বাকি`),
    pinLocked: "পিন প্যাড লক হয়ে গেছে",
    pinLockedSub: "অনেকবার ভুল পিন দেওয়া হয়েছে। নিচে থেকে পিন রিসেট করুন — আবার সাইন ইন করে নতুন পিন সেট করবেন।",
    pinForgot: "পিন ভুলে গেছেন?",
    pinForgotSub: "লক রিসেট করে মা-বাবার অ্যাকাউন্ট থেকে সাইন আউট হবে।",
    pinResetArmed: "পিন রিসেট করে সাইন আউট করবেন?",
    pinResetCta: "রিসেট ও সাইন আউট",
    pinMismatch: "পিন মেলেনি — আবার শুরু করুন",
    pinCurrentWrong: "এটা আপনার বর্তমান পিন নয়",
    pinKeep: "আপনার সন্তানকে পিন কখনো বলবেন না",
    pinLockCardTitle: "🔐 পিন লক",
    pinLockCardSub: "মা-বাবার অংশ ৪ অঙ্কের পিন দিয়ে খোলে",
    pinSet: "পিন সেট করুন",
    pinChange: "পিন পরিবর্তন করুন",
    settingsAboutSub: "নম্বরভার্স · কৌতূহলী বাচ্চাদের জন্য, অফলাইনে ও বিজ্ঞাপনমুক্ত",
    settingsVoice: "🔊 ভয়েস ও পড়া",
    settingsVoiceOk: (v) => `ভয়েস প্রস্তুত: ${v}`,
    settingsVoiceNone: "কোনো ভয়েস পাওয়া যায়নি — সেটিংস → অ্যাক্সেসিবিলিটি → স্পোকেন কনটেন্ট-এ ভয়েস ইনস্টল করুন",
    settingsVoiceTest: "ভয়েস পরীক্ষা",
    settingsDictate: "🎙️ নিজের কণ্ঠ রেকর্ড করো",
    settingsDictateSub: "নিজের উত্তর বলো আর রেকর্ড করে শোনো। শুধু এই ডিভাইসেই থাকে — কোথাও পাঠানো হয় না।",
    settingsDictateStart: "⏺️ রেকর্ড",
    settingsDictateStop: "⏹ থামাও",
    settingsDictateDenied: "মাইক অনুমতি দেওয়া হয়নি — ব্রাউজার সেটিংসে মাইক অনুমতি দিন।",
    settingsDictateUnsupported: "এই ব্রাউজারে রেকর্ডিং সমর্থিত নয়।",
    settingsDictateClear: "মুছে ফেলো",
    settingsSecSound: "🔊 শব্দ ও ভয়েস",
    settingsSecScreen: "🖥️ স্ক্রিন",
    projectorToggle: "📽️ ক্লাসরুম প্রজেক্টর",
    projectorToggleSub: "ক্লাসরুমের জন্য বড়, উজ্জ্বল লেখা — বাবা-মার অংশ লুকানো থাকে।",
    projectorOn: "প্রজেক্টর চালু",
    projectorOff: "প্রজেক্টর বন্ধ",
    projectorKeyHint: "খেলতে Enter চাপুন · ফুলস্ক্রিন বন্ধে Esc",
    settingsReduceMotion: "কম গতি",
    settingsSecLanguage: "🌐 ভাষা",
    settingsSecLearning: "📚 আমার শেখা",
    settingsSecParents: "👨‍👩‍👧 মা-বাবার জন্য",
    settingsMusicOff: "মা-বাবা এই প্রোফাইলের জন্য মিউজিক বন্ধ করে দিয়েছেন।",
    settingsParentsHint: "শেখার খবর, নিয়ন্ত্রণ ও পূর্ণ পোর্টাল — শুধু বড়দের জন্য।",
    settingsParentsGo: "মা-বাবার অংশ খুলুন",
    settingsParentsSignin: "মা-বাবা হিসেবে সাইন ইন করুন",
    settingsMusicRow: "ব্যাকগ্রাউন্ড মিউজিক",
    settingsVoiceNeural: (v) => `বাংলা ভয়েস — ${v} (অফলাইন)`,
    settingsVoiceOff: "পড়া বন্ধ",
    settingsReadingOff: "মা-বাবা পড়া বন্ধ করে দিয়েছেন — আবার চালাতে তাদের বলুন।",
    settingsVoiceDownload: (pct) => `বাংলা ভয়েস ডাউনলোড হচ্ছে… ${pct}%`,
    settingsSyncOk: "✓ সব শেখার খবর এই ডিভাইসে সংরক্ষিত",
    settingsSyncWorking: "শেখার খবর সংরক্ষণ হচ্ছে…",
    settingsSyncOffline: "নেট সংযোগ নেই — শেখার খবর এই ডিভাইসেই থাকবে",
    settingsSyncError: "সংরক্ষণ করা যায়নি — আবার চেষ্টা করব",
    settingsSyncIdle: "প্রস্তুত — খেললেই শেখার খবর সংরক্ষিত হবে",
    starsTotal: (n) => `${n}টি তারা অর্জন`,
    points: (n) => `${n} পয়েন্ট`,
    sessions: (n) => `${n}টি সেশন`,
    parentSkills: "দক্ষতা",
    music: "🔊 মিউজিক চালু",
    musicMuted: "🔇 মিউজিক বন্ধ",
    install: "অ্যাপ ইনস্টল করুন",
    shareProgress: "📤 শেখার খবর শেয়ার করুন",
    shareShare: "শেয়ার",
    shareCardTitle: "🎉 Numberverse",
    shareCardFooter: "Numberverse দিয়ে তৈরি — বাচ্চারা গণিত ও বাংলা শেখে, অফলাইনেও, কোনো বিজ্ঞাপন নেই।",
    shareStatsStars: "তারা",
    shareStatsScore: "পয়েন্ট",
    shareStatsSessions: "সেশন",
    shareWorldsTitle: "জগৎ",
    shareRewardSpeak: (name) => `${name}-এর শেখার খবর শেয়ার হয়েছে! তুমি +৫ কয়েন পেয়েছ! 🎉`,
    shareRewardToast: "🎉 শেয়ার হয়েছে! আপনার সন্তানের জন্য +৫ কয়েন",
    shareWhatsApp: "WhatsApp",
    shareDone: "✓ শেয়ার হয়েছে",
    shareFail: "এই ডিভাইসে শেয়ার করা যায়নি",
    shareProgressCaption: (name) => `${name} Numberverse-এ খেলছে — গণিত ও বাংলা, অফলাইনেও, কোনো বিজ্ঞাপন নেই! kids.munna-khan.xyz`,
    digestBtn: "📄 সাপ্তাহিক ডাইজেস্ট",
    digestEmpty: "এই সপ্তাহে এখনো কোনো গল্প নেই — কিছু খেলা খেলুন, ডাইজেস্ট ভরে উঠবে।",
    digestDone: "সাপ্তাহিক ডাইজেস্ট ডাউনলোড হয়েছে ✓",
    digestHeader: (name, week) => `Numberverse — সাপ্তাহিক শেখার ডাইজেস্ট\nবাচ্চা: ${name}\nসপ্তাহ: ${week}`,
    digestStats: (total, solved, tricky) => `${total}টি মুহূর্ত · ${solved}টি সমাধান · ${tricky}টি কঠিন`,
    digestSolved: "সমাধান",
    digestTricky: (n) => `${n}টি ভুল`,
    digestMoni: (code) => `মনি ধরেছে: ${code}`,
    certShare: "📤 শেয়ার",
    certShareFooter: "Numberverse দিয়ে তৈরি — বাচ্চারা গণিত ও বাংলা শেখে, অফলাইনেও, কোনো বিজ্ঞাপন নেই।",
    certShareCaption: (name, world) => `${name} Numberverse-এ ${world} আয়ত্ত করেছে! 🏆 Numberverse দিয়ে তৈরি। kids.munna-khan.xyz`,
    voiceTitle: "🔊 ভয়েস পরীক্ষা",
    voicePlatform: (p) => `ডিভাইস: ${p}`,
    voiceTest: "টেস্ট লাইন বাজান",
    voiceBnOk: (v) => `বাংলা ভয়েস: ${v} ✓`,
    voiceBnMissing: "কোনো বাংলা ভয়েস নেই — Settings → Text-to-speech → বাংলা ইনস্টল করুন।",
    voiceEnOk: (v) => `ইংরেজি ভয়েস: ${v}`,
    voiceNone: "এই ডিভাইস/ব্রাউজারে স্পিচ পাওয়া যায়নি।",
    voiceNeuralReady: "ডিভাইসে বাংলা নিউরাল ভয়েস প্রস্তুত — সব ডিভাইসে একই ভয়েস, অফলাইনে কাজ করে ✓",
    voiceNeuralLoading: (pct) => `ডিভাইসে বাংলা নিউরাল ভয়েস ডাউনলোড হচ্ছে… ${pct}%`,
    voiceNeuralError: "নিউরাল ভয়েস পাওয়া যায়নি — বাংলা ডিভাইসের ভয়েসে পড়ে।",
    voiceNeuralIdle: "ডিভাইসে বাংলা নিউরাল ভয়েস প্রথম ব্যবহারে ডাউনলোড হয় (একবার, তারপর চিরকাল অফলাইন)।",
    voiceCacheHit: (pct) => `🎙️ ভয়েস ক্যাশ: ${pct}% লাইন তাৎক্ষণিক (ডিভাইসে, অফলাইনে)`,
    voicePickTitle: "🎙️ বাংলা ভয়েস",
    voicePickHint: "বাংলা পড়বে কে বাছো — সব ডিভাইসে একই, সব অফলাইন।",
    voicePickFemale: "উষ্ণ প্রাপ্তবয়স্ক (মেয়ে)",
    voicePickKid: "বাচ্চার ভয়েস",
    voicePickSoft: "নরম মেয়ে",
    voicePickWarm: "বন্ধুত্বপূর্ণ ছেলে",
    voicePickListen: "শোনো",
    mastered: "আয়ত্ত",
    playLimitReached: "🦉 বাহ, আজ তুমি অনেক খেলেছ! কাল আবার এসো 💤",
    parentHelpTitle: "একটু সাহায্য দরকার",
    parentHelpNone: "সব ঠিক আছে! 🎉",
    parentHelpOpen: (n) => `শেষ করতে ${n}টা বাকি`,
    parentHelpWrong: (n) => `${n}টা ভুল`,
    reteachLetTry: "প্রায়! চলো এটা আরেকভাবে অনুশীলন করি 💪",
    practicePill: "অনুশীলন!",
    /* 🧠 MONI */
    moniTitle: "মনি টিউটর",
    moniTag: "মনি আপনার সন্তান সম্পর্কে যা শিখেছে",
    /* ❌ #78 ভুল উত্তরের ইতিহাস */
    mistakesTitle: "❌ ভুল উত্তর",
    mistakesSub: "আপনার সন্তান এখনো কী নিয়ে কাজ করছে — প্রতিদিন, প্রতি দক্ষতায়",
    mistakesHeatTitle: "সর্বশেষ ২৮ দিন",
    mistakesDayLabel: (date, n) => `${date} — ${n}টি ভুল উত্তর`,
    mistakesSkillWrong: (n) => `${n}টি ভুল`,
    mistakesEmpty: "সর্বশেষ ২৮ দিনে কোনো ভুল উত্তর নেই — চমৎকার! 🎉",
    mistakesNoneDay: "এই দিনে কিছুই কঠিন ছিল না",
    mistakesWeekday: "র সো ম বু বৃ শু শ",
    moniLearnStyle: "শেখার ধরন",
    moniBestGame: "ভালোবাসে",
    moniAttention: "মনোযোগ",
    moniConfidence: "আত্মবিশ্বাস",
    moniConfidenceGentle: "ভদ্র — দরকার জয়ের আস্থা",
    moniConfidenceSteady: "স্থির — ভারসাম্যপূর্ণ",
    moniConfidenceChallenging: "চ্যালেঞ্জের জন্য প্রস্তুত",
    moniMisconceptions: "ধরার ভুল",
    moniMisconceptionsNone: "এখনো কিছু নেই — মনি দেখছে",
    moniNextMove: "মনির পরবর্তী পদক্ষেপ",
    moniTone: "ভাষা",
    moniSessionLength: "সেরা সেশন",
    moniSessionHint: (n) => `মণি দেখল ~${n} রাউন্ড পর্যন্ত তোমার মনোযোগ ছিল — চালিয়ে যাও বা বিরতি নাও, তোমার পছন্দ 💛`,
    moniGoals: "মনির পরবর্তী ৩ দক্ষতা",
    moniGoalFocus: "এখনকার প্রধান লক্ষ্য",
    moniGoalWeak: "এখনো অনুশীলন দরকার",
    moniGoalReview: (n) => `${n} দিনে একবার ঝালাই`,
    moniStrictness: "মনি কতটা চাপ দেবে?",
    moniStrictnessHelp: "নরম = ধাপ পিছিয়ে নেয়, চ্যালেঞ্জিং = ধাপ উপরে তোলে। সাথে সাথে বদলায়, অফলাইনেও।",
    moniStrictnessGentle: "নরম",
    moniStrictnessSteady: "সাধারণ",
    moniStrictnessChallenging: "চ্যালেঞ্জিং",
    moniReviewGentle: "মণি বলে: একটু ঝালাই করলে দারুণ লাগবে — তাড়াহুড়ো নেই!",
    moniReviewTap: (n) => (n === 1 ? "খুলে ঝালাই করো" : "খুলে ঝালাই করো"),
    breakTitle: (name) => `বিশ্রাম নাও, ${name}!`,
    breakBody: "তোমার মস্তিষ্ক অনেক পরিশ্রম করেছে, আর নোভা খুব গর্বিত। একটু বিশ্রাম নিলে পরের খেলাটা আরও মজার হবে!",
    breakRest: "ঠিক আছে, একটু বিশ্রাম",
    breakKeepGoing: "আমি ফ্রেশ — চলো, খেলি!",
    moniWeek: "📅 এই সপ্তাহে",
    moniWeekRounds: "রাউন্ড",
    moniWeekAcc: "নির্ভুলতা",
    moniWeekPace: "গতি",
    moniWeekStyle: "শেখার ধারা",
    moniWeekBestGame: "সেরা খেলা",
    moniWeekPaceUp: "সাধারণের চেয়ে জোরদার 💪",
    moniWeekPaceDown: "এই সপ্তাহে কিছুটা নরম 🐢",
    moniWeekPaceFlat: "সবসময়ের মতো স্থির ⚖️",
    moniStyleFast: "⚡ দ্রুত তারা",
    moniStyleSteady: "🐢 ধীরে সুস্থে",
    moniStyleSocial: "🦉 সবার বন্ধু",
    contrastTrigger: (name) => `মণি ${name}-এ একটা প্যাটার্ন ধরেছে — একসাথে ঠিক করি!`,
    contrastTriggerSub: "পাশাপাশি খেলা, কোনো চাপ নেই",
    contrastRight: "ঠিক! তুমি প্যাটার্নটা চিনে ফেললে! 🎉",
    a11yRight: "দারুণ — ঠিক আছে!",
    a11yWrong: "মোটামুটি — আবার চেষ্টা করো, নোভা সাহায্য করবে।",
    a11yMastered: (title) => `তুমি ${title} আয়ত্ত করেছ!`,
    a11yVoiceOn: "পড়া চালু আছে।",
    a11yVoiceOff: "পড়া বন্ধ আছে।",
    a11yMusicOn: "ব্যাকগ্রাউন্ড মিউজিক চালু আছে।",
    a11yMusicOff: "ব্যাকগ্রাউন্ড মিউজিক বন্ধ আছে।",
    contrastOops: (correct) => `এইটাই কৌশল! উত্তর হলো ${correct}। আবার চেষ্টা করো!`,
    contrastDoneTitle: "প্যাটার্ন জয় করেছ! 🏆",
    contrastDoneBody: "পাশাপাশি দেখে তুমি পার্থক্যটা খুঁজে পেয়েছ। মণি খুব গর্বিত — ধার ধরে রাখো!",
    contrastDoneBtn: "ফিরে যাই অভিযানে",
    contrastProgress: (cur, total) => `প্যাটার্ন রাউন্ড ${cur}/${total}`,
    kothaInspector: "📚 শেখার গল্প",
    kothaInspectorSub: "কী চেষ্টা হলো, মণি কী দেখল, কী করলাম",
    kothaFilterAll: "সব",
    kothaFilterWrong: "ভুল",
    kothaFilterCorrect: "ঠিক",
    kothaEmpty: "এখনও কোনো গল্প নেই — এক রাউন্ড খেলো, গল্পের খাতা ভরে যাবে।",
    kothaKindMisconception: "ভুল ধারণা",
    kothaKindGap: "ফাঁক",
    kothaKindFatigue: "ক্লান্তি",
    kothaKindGuessing: "অনুমান",
    kothaKindSlip: "অমনোযোগ",
    kothaAction: "মণি",
    kothaAgo: (ts) => {
      const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (s < 60) return "এইমাত্র";
      const m = Math.floor(s / 60);
      if (m < 60) return `${m} মিনিট আগে`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h} ঘণ্টা আগে`;
      const d = Math.floor(h / 24);
      return `${d} দিন আগে`;
    },
    kothaCorrect: "ঠিক",
    kothaWrong: "ভুল",
    moniTrendUp: "উন্নতি 📈",
    moniTrendFlat: "স্থির ➖",
    moniTrendDown: "সাহায্য দরকার 📉",
    moniSessions: (n) => `${n}টা সেশন`,
    moniRounds: (n) => `${n}টা রাউন্ড`,
    inProgress: "চলমান",
    notStarted: "শুরু হয়নি",
    /* Nova companion */
    novaTitle: "নোভা প্যাঁচা",
    novaTagline: "খেলায় কয়েন জিতো — নোভাকে সাজাও!",
    novaMeet: "নোভার সাথে দেখা",
    novaTapHint: "🦉 নোভা চাপো!",
    novaCoins: (n) => `${n} কয়েন`,
    novaStreak: (n) => `${n} দিনের ধারা`,
    novaCareFed: "খাওয়াও",
    novaCarePlay: "খেলাও",
    novaShop: "পোশাকের দোকান",
    novaEquip: "পরো",
    novaEquipped: "পরে আছি",
    novaNeedCoins: "আরও কয়েন পেতে খেলা খেলো! 💪",
    novaDailyEarned: (n) => `আজ ${n}/২০ কয়েন অর্জিত`,
    novaHello: "হু! আমি নোভা — মজা করি চলো!",
    novaFeedMsg: "মমম! ধন্যবাদ! 🍎",
    novaPlayMsg: "উহু! দারুণ মজা! 🎈",
    novaTapMsg: "হু-হু! 😄",
    novaEquipMsg: "ওহ্, পোশাকটা আমার খুব পছন্দ! 💛",
    novaPlayGames: "খেলা খেলো এবং কয়েন জিতো",
    rankLabel: "তোমার পদবি",
    rankNextNeed: (next, need) => `${next} হতে আর ${need}টি পাঠ আয়ত্ত করো`,
    newSkill: (n) => (n === 1 ? "🌟 নতুন দক্ষতা আয়ত্ত করেছো!" : `🌟 ${n}টি নতুন দক্ষতা আয়ত্ত করেছো!`),
    masterySpeak: (title) => `বাহ! তুমি ${title} আয়ত্ত করেছ! 🎉`,
    gardenTile: "আমার বাগান",
    gardenHint: "ঠিক উত্তর দাও — গাছ বাড়বে!",
  },
};

/** Works in non-secure contexts (LAN/phone) where crypto.randomUUID() is unavailable. */
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ────────────────────────────── progress helpers ────────────────────────────── */

// ── Parent-control filters (set by App on the active kid) ────────────────
// These are module-level so the journey/world helpers can consult them without
// threading a "settings" param through every call. `applyKidControls` is called
// whenever the active kid's settings load or change.
let filterSkills: Skill[] = SKILLS; // subject filter applied
let filterMaxBand: number | null = null; // null = no cap

function applyKidControls(enabledSubjects: string[] | null, maxBand: number | null) {
  filterSkills = enabledSubjects
    ? SKILLS.filter((s) => enabledSubjects.includes(s.subject))
    : SKILLS;
  filterMaxBand = maxBand;
}

function skillMastered(skills: SkillMap, kidId: string, skillId: string): boolean {
  const st = skills[`${kidId}:${skillId}`];
  return !!st && st.pMastered >= MASTERY_THRESHOLD;
}

/** Skills a kid is currently struggling with: open (unresolved) wrongs right now,
 *  OR ≥3 lifetime misses and not yet mastered. Feeds the parent panel's
 *  "Needs a little help" list so a grown-up can guide the tough ones. */
function strugglingSkills(
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

function worldProgress(skills: SkillMap, kidId: string, band: number): { mastered: number; total: number; pct: number } {
  const all = filterSkills.filter((s) => s.band === band && s.game);
  const total = all.length || 1;
  const mastered = all.filter((s) => skillMastered(skills, kidId, s.id)).length;
  return { mastered, total, pct: Math.round((mastered / total) * 100) };
}

/** World emblem emoji — matches the game's SVG assets (see svgs.ts WORLDS). */
function worldEmoji(key: string): string {
  switch (key) {
    case "sprout-grove": return "🌱";
    case "cottage-fields": return "🐄";
    case "river-town": return "🏞️";
    case "sky-castle": return "🏰";
    case "star-academy": return "🚀";
    case "jungle-canopy": return "🌴";
    case "polar-peaks": return "❄️";
    default: return "⭐";
  }
}

/* ── World map palette ─────────────────────────────────────────────────────
 * Each world gets its own land colors + tiny terrain decorations. Used by the
 * visual map (islands on a winding road) and the world-detail backdrop so the
 * whole "worlds" experience shares one art language. */
const WORLD_LANDS: Record<
  number,
  { c1: string; c2: string; c3: string; c2_22: string; deco: string[] }
> = {
  1: { c1: "#0f3d33", c2: "#2ec4b6", c3: "#a7f3d0", c2_22: "rgba(46,196,182,0.16)", deco: ["🌱", "🍃", "🌿"] },      // Sprout Grove
  2: { c1: "#5a2a1e", c2: "#f6c06a", c3: "#ffe8b0", c2_22: "rgba(246,192,106,0.16)", deco: ["🌾", "🐄", "🌻"] },      // Cottage Fields
  3: { c1: "#0b3b6d", c2: "#5fb6e8", c3: "#bde8ff", c2_22: "rgba(95,182,232,0.16)", deco: ["🌊", "🐟", "🛶"] },      // River Town
  4: { c1: "#4a1f2e", c2: "#e8b0a0", c3: "#ffd9c4", c2_22: "rgba(232,176,160,0.16)", deco: ["☁️", "🏰", "🕊️"] },      // Sky Castle
  5: { c1: "#2b2350", c2: "#c4b5fd", c3: "#e6dcff", c2_22: "rgba(196,181,253,0.16)", deco: ["🚀", "⭐", "🌠"] },       // Star Academy
  6: { c1: "#1e4d1f", c2: "#43d17c", c3: "#c8f7a9", c2_22: "rgba(67,209,124,0.16)", deco: ["🌴", "🦜", "🌿"] },        // Jungle Canopy (#20)
  7: { c1: "#1f3a5f", c2: "#8fd3ff", c3: "#e3f4ff", c2_22: "rgba(143,211,255,0.16)", deco: ["❄️", "🐧", "🏔️"] },       // Polar Peaks (#20)
};

/** Worlds unlock by PROGRESS, not age — beat the previous world to open the next.
 *  The parent's difficulty cap overrides everything: worlds above the cap are locked. */
function worldUnlocked(skills: SkillMap, kidId: string, band: number): boolean {
  if (filterMaxBand != null && band > filterMaxBand) return false;
  if (band <= 1) return true;
  const prev = worldProgress(skills, kidId, band - 1);
  return prev.mastered / prev.total >= UNLOCK_THRESHOLD;
}

function totalMastered(skills: SkillMap, kidId: string): number {
  return filterSkills.filter((s) => s.game && skillMastered(skills, kidId, s.id)).length;
}

/* ────────────────────────────── learning journey ──────────────────────────────
 * The whole app is ONE path: every playable lesson is a stop, in world order.
 * A stop unlocks when the stop right before it is mastered → linear, no
 * age-gating, no dead-ends. The journey screen is the kid's map. */

interface JourneyStop {
  skill: Skill;
  done: boolean;
  unlocked: boolean;
  current: boolean;
}

function journeyStops(): Skill[] {
  return filterSkills.filter((s) => s.game);
}

function journeyState(skills: SkillMap, kidId: string): JourneyStop[] {
  let prevDone = true;
  return journeyStops().map((skill) => {
    const done = skillMastered(skills, kidId, skill.id);
    const unlocked = prevDone;
    prevDone = done;
    return { skill, done, unlocked, current: unlocked && !done };
  });
}

function journeyCurrentIndex(stops: JourneyStop[]): number {
  const i = stops.findIndex((s) => s.current);
  return i < 0 ? stops.length : i;
}

/* ────────────────────────────── mastery card album ──────────────────────────────
 * Every mastered lesson = a collectible trading card. Full-world mastery =
 * a golden Champion card. Locked cards stay visible (the hunt) — dimmed, 🔒.
 * The card "mastered date" is the skill's last practice time (the closest
 * honest moment the store records; not shown for cards earned before the
 * album existed). */

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

function bnNum(n: number): string {
  return String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

/** "5 Aug 2026" / "৫ আগস্ট ২০২৬" — the card's mastered-date stamp. */
function cardDate(ts: number, lang: Lang): string {
  const d = new Date(ts);
  if (lang === "bn") return `${bnNum(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${bnNum(d.getFullYear())}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One collectible — mastered + all the flip-side stats. */
interface CardSkill {
  skill: Skill;
  mastered: boolean;
  dateMs: number | null;
  accuracy: number; // 0–100
  attempts: number;
  streak: number;
}

function worldCards(skills: SkillMap, kidId: string, band: number): CardSkill[] {
  return journeyStops()
    .filter((s) => s.band === band)
    .map((skill) => {
      const st = skills[`${kidId}:${skill.id}`];
      const mastered = !!st && st.pMastered >= MASTERY_THRESHOLD;
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

/** Subject → trading-card gradient (top-left deep → bright). */
const SUBJECT_CARD: Record<string, [string, string]> = {
  math: ["#2f6fd0", "#6ec6ff"],
  bangla: ["#1f7a46", "#6cdb8e"],
  english: ["#4b5eaa", "#9db4f0"],
  science: ["#0e7490", "#5eead4"],
  bgs: ["#b23a3a", "#f08a72"],
  ict: ["#475569", "#9fb4c8"],
};

/** The single "next thing" a kid should play — the first unmastered journey
 *  stop (world order). When the whole journey is done, replay the very first
 *  stop so there's ALWAYS something to play. This is what the home PLAY button
 *  starts — one tap, no choices, the app picks for the child. */
function recommendedSkill(skills: SkillMap, kidId: string): Skill | undefined {
  const stops = journeyState(skills, kidId);
  const cur = stops.find((s) => s.current);
  if (cur) return cur.skill;
  return stops[0]?.skill;
}

function modeForSkill(skillId: string): SessionStep["mode"] {
  if (skillId === "sub-within-10" || skillId === "sub-within-20") return "sub";
  if (skillId === "bn-benjonborno") return "consonants";
  if (skillId === "bn-family-words") return "family";
  // #20 — Bangla conjuncts (ক্ষ ঞ্জ ঙ্ক ণ্ড): BnMatras' combine mechanic,
  // fed a conjunct list instead of matras.
  if (skillId === "bn-conjuncts") return "conjuncts";
  return undefined;
}

function stepForSkill(skill: Skill): SessionStep {
  const gameId = skill.game!;
  return {
    skillId: skill.id,
    gameId,
    scene: GAME_SCENES[gameId],
    title: skill.title,
    mode: modeForSkill(skill.id),
    // First exposure to + or − → the kid gets the narrated Basket Math demo
    // round first, so the symbol means "put together / take away" before they
    // ever face an abstract drill. (Replay sessions re-teach — harmless.)
    teach: skill.id === "add-within-10" || skill.id === "sub-within-10" || skill.id === "add-within-20" || skill.id === "sub-within-20",
  };
}

/** 🧠 MONI — the child's next move, from the tiny tutor.
 *  Returns Moni's plan (focus skill, difficulty, game, tone) once the kid has
 *  enough rounds for Moni to see a pattern (>= 4, same bar as the parent card).
 *  Falls back to null before that — the journey logic is the default until
 *  Moni earns its voice. */
function moniPlanFor(kidId: string): ReturnType<typeof moni.plan> | null {
  const st = useKidStore.getState();
  const profile = st.moni[kidId];
  if (!profile || profile.totalRounds < 4) return null;

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
    // Parent-set strictness (#333) shapes Moni's tone + difficulty deltas. It
    // defaults to "steady" (Moni's own automatic read) when never set. `now`
    // is passed explicitly so the review-due computation is deterministic.
    return moni.plan(profile, mastery, catalog, DEFAULT_MONI_PARAMS, st.moniStrictness?.[kidId] ?? "steady", Date.now());
  } catch {
    return null; // a malformed profile must never break the session loop
  }
}

/** 🧠 MONI difficulty — the level index Moni wants for a skill (from its plan).
 *  Moni's difficulty is an absolute 1–5 (mastery tier + delta); we normalize it
 *  into the game's own level array. Returns -1 when Moni has no opinion. */
function moniLevelIndex(kidId: string, skillId: string, gameId: string): number {
  const plan = moniPlanFor(kidId);
  if (!plan || plan.focusSkillId !== skillId) return -1;
  const game = getGame(gameId);
  if (!game || game.difficultyLevels.length === 0) return -1;
  // Map Moni's 1–5 tier onto the game's ascending levels (tier 3 of 5 → the
  // middle level). Clamp so it can never leave the game's range.
  const t = Math.min(1, Math.max(0, (plan.difficulty - 1) / 4));
  const idx = Math.round(t * (game.difficultyLevels.length - 1));
  return Math.min(Math.max(idx, 0), game.difficultyLevels.length - 1);
}

/** 🧠 MONI-guided session — Moni's focus skill leads the pool when it has an
 *  opinion (else the classic journey order: struggled-first, then fresh). */
function sessionForWorld(skills: SkillMap, kidId: string, band: number): SessionStep[] {
  const ordered = filterSkills.filter((s) => s.band === band && s.game).map(stepForSkill);
  const unmastered = ordered.filter((st) => !skillMastered(skills, kidId, st.skillId));
  const pool = unmastered.length ? unmastered : ordered;
  const mistakes = useKidStore.getState().mistakes;
  const struggled = (st: SessionStep) => (mistakes[`${kidId}:${st.skillId}`]?.wrong ?? 0) > 0;

  // MONI: if the tutor has a recommended skill in THIS band, it leads the queue
  // (it already accounts for gaps + misconceptions + review timing).
  const plan = moniPlanFor(kidId);
  if (plan && plan.focusSkillId) {
    const focus = pool.find((st) => st.skillId === plan.focusSkillId);
    if (focus) {
      const rest = pool.filter((st) => st.skillId !== plan.focusSkillId);
      return [focus, ...rest.filter(struggled), ...rest.filter((st) => !struggled(st))].slice(0, SESSION_LEN);
    }
  }
  return [...pool.filter(struggled), ...pool.filter((st) => !struggled(st))].slice(0, SESSION_LEN);
}

function nextUnmasteredSkill(skills: SkillMap, kidId: string, band: number): Skill | undefined {
  return filterSkills.find((s) => s.band === band && s.game && !skillMastered(skills, kidId, s.id));
}

/** Adaptive starting level index for a kid + skill, from their BKT mastery state.
 *  🧠 MONI overrides when it has a plan for this skill: the tutor's difficulty
 *  tier beats the raw BKT ramp (it already accounts for gaps/misconceptions and
 *  review timing). Falls back to BKT when Moni has no opinion. */
function adaptiveLevelIndex(kidId: string, skillId: string, gameId: string): number {
  const moniIdx = moniLevelIndex(kidId, skillId, gameId);
  if (moniIdx >= 0) return moniIdx;
  const game = getGame(gameId);
  if (!game) return 0;
  const state = useKidStore.getState().skillFor(kidId, skillId);
  const target = nextDifficulty(state, game.difficultyLevels, game.targetSuccess);
  const idx = game.difficultyLevels.indexOf(target);
  return idx < 0 ? 0 : idx;
}

function loadKids(): Kid[] {
  try {
    const raw = localStorage.getItem("nv_kids");
    if (raw) return JSON.parse(raw) as Kid[];
  } catch {
    /* ignore */
  }
  return [];
}

/** Voice check card — proves TTS works on THIS device, live. Shown in the
 *  parent panel so a grown-up can verify the Bangla voice is installed
 *  (Google বাংলা on Android, Apple's Bangla on iOS) without hunting through
 *  system settings. */
function VoiceCheck({ t }: { t: Strings }) {
  const [st, setSt] = useState<ReturnType<typeof speechStatus>>(speechStatus);
  const [spk, setSpk] = useState<number>(getNeuralSpeaker());
  // Live-poll while the neural voice is downloading so a parent can watch it land.
  useEffect(() => {
    if (st.neural.ready || st.neural.state === "error") return;
    const iv = window.setInterval(() => setSt(speechStatus()), 2000);
    return () => window.clearInterval(iv);
  }, [st.neural.ready, st.neural.state]);
  const platformLabel = st.platform === "ios" ? "🍎 iOS" : st.platform === "android" ? "🤖 Android" : "💻 " + st.platform;
  const neuralLine = st.neural.supported
    ? st.neural.ready
      ? t.voiceNeuralReady
      : st.neural.state === "loading"
        ? t.voiceNeuralLoading(Math.min(99, Math.round(st.neural.progress * 100)))
        : st.neural.state === "error"
          ? `${t.voiceNeuralError}${st.neural.error ? ` (${st.neural.error})` : ""}`
          : t.voiceNeuralIdle
    : null;
  return (
    <div className="parent-card voice-check">
      <div className="parent-head">
        <span className="parent-name">{t.voiceTitle}</span>
        <span className="parent-stats">{t.voicePlatform(platformLabel)}</span>
      </div>
      {!st.available && !st.neural.supported ? (
        <p className="voice-line warn">{t.voiceNone}</p>
      ) : (
        <div className="voice-body">
          <p className="voice-line">{st.neural.supported ? (neuralLine ?? null) : null}</p>
          {st.neural.ready && st.neural.cache && st.neural.cache.hits + st.neural.cache.misses > 0 ? (
            <p className="voice-line">{t.voiceCacheHit(Math.round(st.neural.cache.hitRate * 100))}</p>
          ) : null}
          <p className="voice-line">{st.bnPick ? t.voiceBnOk(st.bnPick) : t.voiceBnMissing}</p>
          <p className="voice-line">{st.enPick ? t.voiceEnOk(st.enPick) : t.voiceNone}</p>
          <button
            className="ghost-btn mini voice-test-btn"
            onClick={() => {
              setSt(speechStatus());
              speak("এক দুই তিন — এইটা একটা পরীক্ষা।", { lang: "bn" });
              window.setTimeout(() => speak("One two three — this is a test line.", { lang: "en" }), 2600);
            }}
          >
            🔊 {t.voiceTest}
          </button>
          {st.neural.ready ? (
            <div className="voice-picker">
              <div className="voice-picker-head">
                <span>{t.voicePickTitle}</span>
                <span className="voice-picker-hint">{t.voicePickHint}</span>
              </div>
              <div className="voice-picker-rows">
                {NEURAL_VOICES.map((v) => {
                  const active = spk === v.id;
                  const label = v.key === "female" ? t.voicePickFemale : v.key === "kid" ? t.voicePickKid : v.key === "soft" ? t.voicePickSoft : t.voicePickWarm;
                  return (
                    <div key={v.id} className={`voice-pick-row${active ? " active" : ""}`}>
                      <button
                        className="voice-pick-select"
                        onClick={() => {
                          setNeuralSpeaker(v.id);
                          setSpk(v.id);
                          setSt(speechStatus());
                        }}
                        aria-pressed={active}
                      >
                        {active ? "✓ " : ""}
                        {label}
                      </button>
                      <button
                        className="voice-pick-listen"
                        aria-label={`${t.voicePickListen} · ${label}`}
                        onClick={() => {
                          void neuralSpeak("আমি তোমার বন্ধু — চলো একসাথে খেলি!", { speaker: v.id });
                        }}
                      >
                        🔈
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {st.platform === "android" && !st.googleBn && !st.neural.ready ? (
            <p className="voice-hint">Tip: install Google বাংলা in Settings → Text-to-speech for the best Bangla voice.</p>
          ) : null}
          {!st.secureContext ? (
            <p className="voice-hint warn">Voice may be blocked over plain http — open via localhost or install the app (https).</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** 📚 #322 — KOTHA story inspector: browse a kid's learning stories in the
 *  parent panel. Reads the LOCAL story log (the offline mirror of the server's
 *  learning_stories table) — what was tried, how Moni read it, what we did.
 *  Filterable by outcome + Moni error kind, newest first, capped for perf.
 *  A proper component so the filter chips own their state. */
function StoryInspector({ stories, t, lang }: { stories: KothaStory[]; t: Strings; lang: string }) {
  const [kind, setKind] = useState<"all" | ErrorKind>("all");
  const [outcome, setOutcome] = useState<"all" | "wrong" | "correct">("all");
  const kinds: ("all" | ErrorKind)[] = ["all", "misconception", "gap", "fatigue", "guessing", "slip"];
  const kindLabel = (k: "all" | ErrorKind) =>
    k === "all" ? t.kothaFilterAll
      : k === "misconception" ? t.kothaKindMisconception
        : k === "gap" ? t.kothaKindGap
          : k === "fatigue" ? t.kothaKindFatigue
            : k === "guessing" ? t.kothaKindGuessing
              : t.kothaKindSlip;
  const bn = lang === "bn";
  const filtered = stories
    .filter(
      (st) =>
        (kind === "all" || st.errorKind === kind) &&
        (outcome === "all" || (outcome === "wrong" ? !st.outcome : st.outcome)),
    )
    .slice(0, 50);
  return (
    <details className="parent-help kotha-inspector" open>
      <summary>{t.kothaInspector}</summary>
      <p className="kotha-inspector-sub">{t.kothaInspectorSub}</p>
      <div className="kotha-filters" role="group" aria-label={t.kothaInspector}>
        {(["all", "wrong", "correct"] as const).map((o) => (
          <button
            key={o}
            className={`kotha-chip${outcome === o ? " active" : ""}`}
            aria-pressed={outcome === o}
            onClick={() => setOutcome(o)}
          >
            {o === "all" ? t.kothaFilterAll : o === "wrong" ? t.kothaFilterWrong : t.kothaFilterCorrect}
          </button>
        ))}
        {kinds.map((k) => (
          <button
            key={k}
            className={`kotha-chip${kind === k ? " active" : ""}`}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            {kindLabel(k)}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="kotha-empty">{t.kothaEmpty}</p>
      ) : (
        <ul className="kotha-list">
          {filtered.map((st) => {
            const gs = filterSkills.find((s) => s.id === st.skillId);
            const misLabel = st.misconceptionCode ? MISCONCEPTION_LABELS[st.misconceptionCode]?.[bn ? "bn" : "en"] : null;
            const reason = typeof st.context?.reason === "string" ? st.context.reason : "";
            return (
              <li key={st.uid} className="kotha-item">
                <span className={`kotha-dot ${st.outcome ? "ok" : "bad"}`} aria-hidden="true">
                  {st.outcome ? "✓" : "✗"}
                </span>
                <span className="kotha-meta">
                  <span className="kotha-name">
                    {gs?.title ?? st.skillId}
                    {gs?.titleBn ? <span className="skill-bn">{gs.titleBn}</span> : null}
                  </span>
                  <span className="kotha-line">
                    {st.outcome ? t.kothaCorrect : t.kothaWrong}
                    {st.errorKind ? ` · ${kindLabel(st.errorKind)}` : ""}
                    {misLabel ? ` · ${misLabel}` : ""}
                    {st.action ? ` · ${t.kothaAction}: ${st.action}` : ""}
                  </span>
                  {reason ? <span className="kotha-reason">{reason}</span> : null}
                </span>
                <span className="kotha-ago">{t.kothaAgo(st.ts)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const sessionRef = useRef<SessionStep[]>([]);
  /** #327 — set when a finished session crossed Moni's fatigue threshold; the
   *  completion effect routes to the gentle break screen instead of straight
   *  to the done screen. Cleared at every session start and after a break. */
  const breakPendingRef = useRef(false);
  /** Bump to force the playing effect to re-run the SAME step with remediation
   *  flags (reteach > 0) after the mastery gate blocks an advance. */
  const [reteachNonce, setReteachNonce] = useState(0);
  const activeSceneRef = useRef<string | null>(null);
  // Mastery snapshot BEFORE a session starts — lets the done-screen celebrate
  // the skills that were genuinely NEW this session, not just re-played ones.
  const masteredBeforeRef = useRef<Set<string>>(new Set());
  // Pet stage when the session began — lets the done-screen celebrate a hatch/grow.
  const petStageBeforeRef = useRef(0);
  const [roundsDone, setRoundsDone] = useState(0);
  const [sessionIdx, setSessionIdx] = useState(0);
  // 🎯 #325 — the active contrast drill (template + the skill it fixes) and
  // the current round index. When the drill finishes, the misconception is
  // resolved warmly in the store.
  const [contrastJob, setContrastJob] = useState<{ template: ContrastTemplate; skillId: string } | null>(null);
  const [contrastIdx, setContrastIdx] = useState(0);
  const [world, setWorld] = useState<Band | null>(null);
  // The world shown on the printable certificate (screen === "cert").
  const [certWorld, setCertWorld] = useState<Band | null>(null);
  const [kids, setKids] = useState<Kid[]>(loadKids);
  // The active kid is REMEMBERED across launches (nv_kid_id). A child should
  // never have to answer "who's playing?" every time they open the app — it
  // just opens where they left off, one giant PLAY button away from a game.
  const [kid, setKid] = useState<Kid | null>(() => {
    const list = loadKids();
    if (!list.length) return null;
    try {
      const id = localStorage.getItem("nv_kid_id");
      return list.find((k) => k.id === id) ?? null;
    } catch {
      return null;
    }
  });
  // #22 — sibling co-op: "pass the device" overlay + "now playing" toast.
  const [coopOpen, setCoopOpen] = useState(false);
  const [coopToast, setCoopToast] = useState<string | null>(null);
  const coopTimerRef = useRef<number | undefined>(undefined);
  // #139 — flashcard QR scan overlay (camera + manual code fallback).
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState("");
  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const scanRafRef = useRef<number | undefined>(undefined);
  // FIRST TIME → the WELCOME screen sits on top of everything: language pick
  // first (topmost), then the binary Guest-vs-Sign-in scene, with the syllabus
  // one tap away BEFORE any sign-in. `nv_seen_welcome` is set on mount so it
  // only appears once per device. Then the normal flow: a parent session lands
  // on the journey, otherwise the PARENT page (which shows the sign-in form
  // inline — the one and only parent page in the whole app).
  const [screen, setScreen] = useState<Screen>(() => {
    if (!localStorage.getItem("nv_seen_welcome")) return "welcome";
    if (!hasParentSession()) return "parent";
    const list = loadKids();
    if (list.length === 0) return "addkid";
    try {
      const id = localStorage.getItem("nv_kid_id");
      return list.some((k) => k.id === id) ? "home" : "kidpick";
    } catch {
      return "kidpick";
    }
  });
  // Worlds screen shows the single linear learning journey by default.
  const [journeyView, setJourneyView] = useState(true);
  const [mapView, setMapView] = useState(false);
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("nv_lang") as Lang) || "en");
  const [muted, setMuted] = useState(isMusicMuted());
  // #136 — classroom projector mode: large-type, high-contrast, no parent UI.
  const [projector, setProjector] = useState(() => {
    try {
      return localStorage.getItem("nv_projector") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("nv_projector", projector ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [projector]);
  // Which kid the parent panel is showing analytics for (defaults to the active kid).
  const [parentKidId, setParentKidId] = useState<string | null>(null);
  // #78 — which calendar day the wrong-answer heatmap drill-down shows (null = most recent day with wrongs).
  const [mistakeDay, setMistakeDay] = useState<string | null>(null);
  // #351 — kid-switcher chips are a real ARIA tablist: only the selected chip
  // sits in tab order (roving tabindex) and arrow keys move focus + selection.
  const parentChipRefs = useRef(new Map<string, HTMLButtonElement>());
  // ── Parent gate form state (stable hooks — never conditionally declared) ──
  const [gateMode, setGateMode] = useState<"in" | "up">("in");
  const [gateName, setGateName] = useState("");
  const [gateEmail, setGateEmail] = useState("");
  const [gatePass, setGatePass] = useState("");
  const [gateShowPass, setGateShowPass] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  // ── Interactive syllabus state: which band is expanded (default band 1). ──
  const [sylBand, setSylBand] = useState<number>(1);
  // Where the parent gate should land after a successful sign-in. First-load /
  // syllabus links → the syllabus; upgrading a guest from Settings → back home
  // (their kids are already there). Never conditionally set — defaults sane.
  const gateReturn = useRef<Screen>("syllabus");
  // PWA install affordance — set when the browser offers beforeinstallprompt.
  const [installEvt, setInstallEvt] = useState<Event | null>(null);
  // 🔊 TTS check on EVERY run: voices load async on iOS/Android (and iOS only
  // populates them after the FIRST speak — the prime), so we probe a few times
  // after mount AND again right after the first tap, then show the verdict as a
  // tiny chip on the PLAY screen (tap → Settings for the full voice check).
  const [tts, setTts] = useState<SpeechReadiness | null>(null);
  useEffect(() => {
    let tries = 0;
    let timer = 0;
    const probe = () => {
      setTts(speechReadiness());
      if (++tries < 10) timer = window.setTimeout(probe, 500);
    };
    probe();
    const onFirstTap = () => {
      // iOS populates getVoices() only after the prime speak — re-probe shortly
      // after the first gesture so the chip reflects reality.
      window.setTimeout(probe, 300);
      window.setTimeout(probe, 900);
    };
    window.addEventListener("pointerdown", onFirstTap, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onFirstTap, true);
    };
  }, []);
  // 🎙️ On-device neural Bangla voice — poll while it's downloading so the
  // home-screen chip + banner show live progress; stop once ready/error.
  const [neural, setNeural] = useState(speechStatus().neural);
  useEffect(() => {
    if (neural.ready || neural.state === "error") return;
    const iv = window.setInterval(() => setNeural(speechStatus().neural), 1500);
    return () => window.clearInterval(iv);
  }, [neural.ready, neural.state]);
  // Brief "🎙️ voice ready ✓" flash the moment the download lands (then it's
  // cached offline forever — no permanent kid-facing noise).
  const [neuralFlash, setNeuralFlash] = useState(false);
  useEffect(() => {
    if (!neural.ready) return;
    setNeuralFlash(true);
    const id = window.setTimeout(() => setNeuralFlash(false), 5000);
    return () => window.clearTimeout(id);
  }, [neural.ready]);
  const { score, stars, events, addEvent, reset, stats, recordSession, novaAwardRound, novaCompleteSession, novaQuestRound, gardenWater, gardenMastery } = useKidStore();
  const skillsMap = useKidStore((s) => s.skills);
  const mistakes = useKidStore((s) => s.mistakes);
  const kothaStories = useKidStore((s) => s.stories);
  const novaCoins = useKidStore((s) => (kid ? s.nova[kid.id]?.coins ?? 0 : 0));
  const quest = useKidStore((s) => {
    const n = s.nova[kid?.id ?? ""];
    if (!n) return { rounds: 0, done: false, today: false };
    const today = todayIso();
    const todayFresh = n.questDay === today;
    return { rounds: todayFresh ? n.questRounds ?? 0 : 0, done: todayFresh ? !!n.questDone : false, today: todayFresh };
  });
  const sessionStreakCount = sessionStreak(events);
  const novaDayStreak = useKidStore((s) => (kid ? s.nova[kid.id]?.streak ?? 0 : 0));
  // #281 — 7-day login calendar: which cycle position is "today" (from the
  // streak anchor), and whether today's bonus is claimable. Claiming requires
  // today's first session — a reward for DAILY play, not a free login tap.
  const calendar = useKidStore((s) => {
    const n = s.nova[kid?.id ?? ""];
    if (!n) return null;
    const today = todayIso();
    const playedToday = n.lastDay === today;
    const pos = playedToday
      ? calendarCycleDay(n.streak)
      : n.lastDay === dayIsoAgo(1)
        ? calendarCycleDay(n.streak + 1) // today would extend the streak → next tile
        : 1; // missed a day → fresh restart at day 1
    return { pos, claimable: playedToday && n.calendarDay !== today, claimedToday: n.calendarDay === today };
  });
  // #283 — goal badges: currently-earned ids (from local stats/streak/worlds),
  // and the celebration effect that fires once per NEW badge.
  const badgeStats = useKidStore((s) => s.stats[kid?.id ?? ""] ?? { stars: 0, score: 0, sessions: 0 });
  const badgeStreak = useKidStore((s) => (kid ? s.nova[kid.id]?.streak ?? 0 : 0));
  const storedBadges = useKidStore((s) => (kid ? s.nova[kid.id]?.badges ?? [] : []));
  const earnedBadgeKey = kid
    ? BADGES.filter((b) => b.earned({ sessions: badgeStats.sessions, stars: badgeStats.stars, streak: badgeStreak, worlds: fullyMasteredWorlds(skillsMap, kid.id) }))
        .map((b) => b.id)
        .join(",")
    : "";
  useEffect(() => {
    if (!kid || !earnedBadgeKey) return;
    const earned = earnedBadgeKey.split(",").filter(Boolean);
    const newly = useKidStore.getState().novaSyncBadges(kid.id, earned);
    if (newly.length) {
      newly.forEach((id) => {
        const b = BADGES.find((x) => x.id === id);
        if (!b) return;
        tada();
        speak(lang === "bn" ? t.badgeNewSpeak(kid.name, b.nameBn) : t.badgeNewSpeak(kid.name, b.name));
      });
    }
  }, [kid?.id, earnedBadgeKey, storedBadges.join(",")]);
  // #277 — land trophies: celebrating a NEWLY fully-mastered land exactly once.
  const earnedTrophyKey = kid
    ? BANDS.filter((b) => {
        const p = worldProgress(skillsMap, kid.id, b.id);
        return p.total > 0 && p.mastered === p.total;
      })
        .map((b) => b.id)
        .join(",")
    : "";
  useEffect(() => {
    if (!kid || !earnedTrophyKey) return;
    const earned = earnedTrophyKey.split(",").filter(Boolean).map(Number);
    const newly = useKidStore.getState().novaSyncTrophies(kid.id, earned);
    if (newly.length) {
      newly.forEach((bandId) => {
        const b = BANDS.find((x) => x.id === bandId);
        if (!b) return;
        tada();
        speak(lang === "bn" ? t.trNewSpeak(kid.name, b.titleBn ?? b.title) : t.trNewSpeak(kid.name, b.title));
      });
    }
  }, [kid?.id, earnedTrophyKey]);
  // #284 — mastery mystery boxes: every mastered skill that hasn't been boxed
  // yet shows as an unopened box on home (newest mastery first).
  const storedBoxes = useKidStore((s) => (kid ? s.nova[kid.id]?.boxes ?? [] : []));
  const unclaimedBoxes = kid
    ? filterSkills
        .filter((s) => s.game && skillMastered(skillsMap, kid.id, s.id) && !storedBoxes.includes(s.id))
        .sort(
          (a, b) =>
            ((skillsMap[`${kid.id}:${b.id}`]?.lastPractice ?? 0) - (skillsMap[`${kid.id}:${a.id}`]?.lastPractice ?? 0))
        )
    : [];
  // Streak kindness: the store only refreshes `streak` at session-complete, so
  // after a missed day the badge would show a STALE flame. Track the anchor day
  // so we can hide the stale flame and welcome the kid back warmly instead.
  const novaLastDay = useKidStore((s) => (kid ? s.nova[kid.id]?.lastDay ?? "" : ""));
  // Birthday gift claimed this calendar year? (gift is once per year)
  const bdayClaimed = useKidStore((s) => (kid ? s.nova[kid.id]?.bdayYear === String(new Date().getFullYear()) : false));
  // The pet — an egg that hatches and grows as the kid learns. Values are read
  // reactively so every mastered skill, completed session, and feeding updates it.
  const petStage = useKidStore((s) => (kid ? s.nova[kid.id]?.petStage ?? 0 : 0));
  const petProgress = useKidStore((s) => (kid ? s.nova[kid.id]?.petProgress ?? 0 : 0));
  const petFedToday = useKidStore((s) => (kid ? s.nova[kid.id]?.petFed === todayIso() : false));
  // #19 — the adopted pet species (owl starter). Names/looks come from the
  // NOVA_SPECIES registry so adding a locale or a species is pure config.
  const petSpecies = useKidStore((s) => (kid ? s.nova[kid.id]?.species ?? "owl" : "owl"));
  const t = STR[lang];

  const [fsActive, setFsActive] = useState(false);
  // 🎬 #350 reduced motion — explicit in-app choice wins over the OS pref.
  const [reduceMotion, setReduceMotion] = useState(() => prefersReducedMotion());
  useEffect(() => {
    document.documentElement.classList.toggle("nv-reduce-motion", reduceMotion);
  }, [reduceMotion]);
  const syncState = useKidStore((s) => s.syncState);
  const syncPending = useKidStore((s) => s.pending.length);
  // 📚 KOTHA offline-queue quota — a long offline stretch can't balloon the
  // story queue: once it hits the cap we eagerly drain (best-effort; nothing is
  // ever dropped before the server confirms it). Count is surfaced in the UI.
  const storyPending = useKidStore((s) => s.stories.length);
  useEffect(() => {
    if (storyPending >= STORY_QUEUE_CAP) drainStoriesIfFull();
  }, [storyPending]);
  // Offline-first cue: the service worker has fully installed (page now served
  // from cache) → the app genuinely works with NO network.
  const [swActive, setSwActive] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    setSwActive(!!navigator.serviceWorker.controller);
    const onCtl = () => setSwActive(true);
    navigator.serviceWorker.addEventListener("controllerchange", onCtl);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onCtl);
  }, []);

  // Always-sync: drain the offline outbox on boot, then keep a heartbeat +
  // reconnect/foreground listeners (see api.ts). Never blocks gameplay.
  useEffect(() => startAutoSync(), []);

  // ── Parent session gate: validate the stored token once on boot. If it
  // expired or was revoked, clear it and return the parent to the gate so the
  // kid app stays protected. Offline keeps the parent in (never kick them out
  // mid-connection-drop).
  useEffect(() => {
    if (!hasParentSession()) return;
    let active = true;
    void validateParentSession().then((ok) => {
      if (active && !ok) {
        clearParentSession();
        setPinOk(false);
        setScreen("parent"); // shows the inline sign-in form — same parent page
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // First-time welcome: mark it seen once so it never reopens on this device.
  useEffect(() => {
    try {
      localStorage.setItem("nv_seen_welcome", "1");
    } catch {
      /* ignore */
    }
  }, []);

  // ── Parent gate handlers (sign-in / sign-up / google / guest) ────────────
  const submitGate = async () => {
    if (gateBusy) return;
    setGateBusy(true);
    setGateError(null);
    try {
      if (gateMode === "in") {
        await signinParent(gateEmail.trim(), gatePass);
      } else {
        await signupParent(gateEmail.trim(), gatePass, gateName.trim());
      }
      // Success → land where the parent came from (syllabus on first-load, or
      // back home when upgrading an existing guest). Their kids are mapped to
      // the parent account on the next sync tick. A fresh sign-in re-arms the
      // PIN gate so a newly signed-in parent proves the PIN before the panel.
      setSylBand(1);
      setPinOk(false);
      setScreen(gateReturn.current);
      // #9 — a fresh parent sign-in immediately pulls the kids' server profiles
      // (mastery + coins) so a second device "catches up" right away, not on the
      // next 30s heartbeat. Best-effort — offline/errors skip quietly.
      void restoreServerState();
    } catch {
      setGateError(gateMode === "in" ? t.gateErrorInvalid : t.gateErrorSignup);
    } finally {
      setGateBusy(false);
    }
  };
  const submitGoogle = async (idToken: string) => {
    if (gateBusy) return;
    setGateBusy(true);
    setGateError(null);
    try {
      await signinGoogle(idToken);
      setSylBand(1);
      setPinOk(false);
      setScreen(gateReturn.current);
      void restoreServerState();
    } catch {
      setGateError(t.gateErrorGoogle);
    } finally {
      setGateBusy(false);
    }
  };
  const enterAsGuest = () => {
    clearParentSession();
    setPinOk(false);
    const list = loadKids();
    setScreen(list.length ? "kidpick" : "addkid");
  };
  // The interactive syllabus is viewable BEFORE any sign-in (welcome + gate).
  const goSyllabus = () => {
    setSylBand(1);
    setScreen("syllabus");
  };
  // 🔐 Parent-area access control — the Parent area is ONE page. A signed-in
  // parent sees the full panel (behind the PIN gate when one is set); anyone
  // else sees the sign-in form INLINE on the same page (never a separate
  // "parent gate" page in the user face). A kid tapping "For parents" gets the
  // login form, not any parent data.
  const goParent = () => {
    gateReturn.current = "parent";
    setPinOk(false); // re-arm the PIN gate every time the parent area opens
    pinNewFlow("unlock"); // fresh pad + no stale lock/change mode
    setScreen("parent");
  };
  // Sign out of the parent account — revokes the session server-side, clears
  // the local parent session, then lands on the gate (guest / sign-in /
  // syllabus). Two taps (arm → confirm) so a stray tap can't log the parent out.
  const [signoutArmed, setSignoutArmed] = useState(false);
  const signOut = () => {
    if (!signoutArmed) {
      setSignoutArmed(true);
      window.setTimeout(() => setSignoutArmed(false), 4000);
      return;
    }
    void signoutParent().then(() => {
      setSignoutArmed(false);
      setPinOk(false);
      gateReturn.current = "parent";
      setScreen("parent"); // stays on the one parent page → inline sign-in form
    });
  };

  // ── Parent-area PIN lock (#86) ───────────────────────────────────────────
  // A 4-digit gate on the signed-in panel, so a kid handed a signed-in device
  // can't wander into parent territory. Enforced INLINE on the parent screen —
  // every path to the panel runs through this render gate, so nothing can
  // bypass it. The PIN is stored as a salted hash in api.ts (per-device only).
  //   · no PIN set yet        → mandatory setup pad on first panel entry
  //   · PIN set + not verified → unlock pad (3 wrong tries → locked → recover
  //     via sign-out-and-back-in, which resets the PIN)
  //   · PIN verified          → panel; a "Change PIN" card re-arms the pad
  const [pinOk, setPinOk] = useState(false);
  const [pinMode, setPinMode] = useState<"unlock" | "setup" | "change">("unlock");
  const [pinStep, setPinStep] = useState<"current" | "new" | "confirm">("current");
  const [pinDigits, setPinDigits] = useState("");
  const [pinPending, setPinPending] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinTries, setPinTries] = useState(0);
  const [pinLocked, setPinLocked] = useState(false);
  const [pinForgotArmed, setPinForgotArmed] = useState(false);
  const pinResetPad = () => { setPinDigits(""); setPinError(null); };
  const pinNewFlow = (mode: "unlock" | "setup" | "change") => {
    setPinMode(mode);
    setPinStep("current");
    setPinPending("");
    setPinTries(0);
    setPinLocked(false);
    pinResetPad();
  };
  /** Append a digit; auto-submit once 4 digits are entered. */
  const appendPinDigit = (d: string) => {
    const next = (pinDigits + d).slice(0, 4);
    setPinDigits(next);
    setPinError(null);
    if (next.length === 4) pinSubmit(next);
  };
  /** The 4-digit value is complete → run the step logic. `hasParentPin()` is
   *  the source of truth for setup-vs-unlock: with no PIN, "current" is
   *  meaningless, so the first entry is treated as the new-PIN stage. A device
   *  with no PIN can never accidentally hit the verify branch. */
  const pinSubmit = (value: string) => {
    const hasPin = hasParentPin();
    const step = hasPin ? pinStep : pinStep === "confirm" ? "confirm" : "new";
    // Verify the current PIN (unlock, or change-current) — only when one exists.
    if (hasPin && step === "current") {
      if (verifyParentPin(value)) {
        pinResetPad();
        if (pinMode === "change") { setPinStep("new"); setPinError(null); }
        else { setPinOk(true); }
        return;
      }
      if (pinMode === "change") {
        pinResetPad();
        setPinError(t.pinCurrentWrong);
      } else {
        const t2 = pinTries + 1;
        setPinTries(t2);
        pinResetPad();
        if (t2 >= 3) { setPinLocked(true); setPinError(null); }
        else { setPinError(t.pinWrong(3 - t2)); }
      }
      return;
    }
    // New PIN (first-time setup, or change-new): stage it, then confirm.
    if (step === "new") {
      setPinPending(value);
      pinResetPad();
      setPinStep("confirm");
      return;
    }
    // Confirmation: must match the staged PIN → save, then open the panel.
    if (value === pinPending) {
      setParentPin(value);
      pinResetPad();
      setPinPending("");
      setPinMode("unlock");
      setPinStep("current");
      setPinOk(true);
    } else {
      pinResetPad();
      setPinPending("");
      setPinStep("new");
      setPinError(t.pinMismatch);
    }
  };
  /** Recovery: a parent who forgot the PIN (or a locked pad) resets the lock
   *  and signs out — signing back in lands on the parent page, which (with no
   *  PIN set) prompts for a fresh PIN. Two taps (arm → confirm). */
  const pinForgot = () => {
    if (!pinForgotArmed) {
      setPinForgotArmed(true);
      window.setTimeout(() => setPinForgotArmed(false), 4000);
      return;
    }
    clearParentPin();
    setPinForgotArmed(false);
    pinNewFlow("unlock");
    setPinOk(false);
    void signoutParent().then(() => {
      gateReturn.current = "parent";
      setScreen("parent"); // inline sign-in form → after sign-in, setup a new PIN
    });
  };

  // ── Parent controls ─────────────────────────────────────────────────────
  // Per-kid settings come from the parent portal (api.ts). We fetch them on
  // the active kid (cache-first so offline play still respects the rules) and
  // apply: subject visibility, world cap, daily playtime, voice + music.
  const [settings, setSettings] = useState<KidSettings>(() => (kid ? cachedKidSettings(kid.id) : { ...KID_SETTINGS_DEFAULT }));
  useEffect(() => {
    if (!kid) return;
    setSettings(cachedKidSettings(kid.id));
    let alive = true;
    void fetchKidSettings(kid.id).then((s) => {
      if (alive) setSettings(s);
    });
    return () => {
      alive = false;
    };
  }, [kid?.id]);
  // Recompute the journey/world skill filters whenever subject/band settings land.
  // (Runs on first paint from cache AND again when the fresh server copy arrives.)
  // The tick state forces a re-render so journey/worlds pick up the new filters
  // immediately instead of waiting for some unrelated state to change.
  const [, setFilterTick] = useState(0);
  useEffect(() => {
    applyKidControls(settings.enabled_subjects, settings.max_band);
    setFilterTick((t) => t + 1);
  }, [settings.enabled_subjects, settings.max_band]);
  // TTS + music enforcement — flip instantly when the parent changes them.
  useEffect(() => {
    setSpeechEnabled(settings.tts_enabled);
  }, [settings.tts_enabled]);
  useEffect(() => {
    if (!settings.music_enabled) {
      // parent turned music off → mute, no matter the kid's tap toggle
      if (!isMusicMuted()) toggleMusicMute();
      setMuted(true);
    }
  }, [settings.music_enabled]);
  // #134 — the home/journey ambient follows the current land the kid is on.
  useEffect(() => {
    if (!kid) return;
    const stops = journeyState(skillsMap, kid.id);
    const idx = journeyCurrentIndex(stops);
    setMusicTheme(idx < stops.length ? stops[idx].skill.band : 2);
  }, [kid, skillsMap]);
  // #138 — kid dictation: record own voice + replay. Parent-gated (off by
  // default); when enabled, recording stays ON-DEVICE only (voiceRecorder.ts).
  const [recState, setRecState] = useState<"idle" | "recording" | "denied" | "unsupported">("idle");
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const recAudioRef = useRef<HTMLAudioElement | null>(null);
  // #133 — screen-reader live region: polite announcements of game/settings
  // state (rounds, mastery, toggles). Kept in sync with the on-screen + spoken
  // feedback so VoiceOver/TalkBack users get the same cues.
  const srLiveRef = useRef<HTMLDivElement | null>(null);
  const announce = useCallback((text: string) => {
    if (srLiveRef.current) srLiveRef.current.textContent = text;
  }, []);
  // #136 — projector keyboard nav: Enter on home plays the next lesson.
  const playRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && projector && screen === "home") {
        e.preventDefault();
        playRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [projector, screen]);
  const handleDictate = useCallback(async () => {
    if (recState === "recording") {
      const out = await stopRecording();
      if (out.url) setRecUrl(out.url);
      setRecState("idle");
    } else {
      if (recAudioRef.current) {
        recAudioRef.current.pause();
        recAudioRef.current.src = "";
      }
      const st = await startRecording();
      setRecState(st);
    }
  }, [recState]);
  /** A skill is hidden when its subject is turned off by the parent. */
  const subjectAllowed = useRef<Set<string>>(new Set()).current;
  useEffect(() => {
    subjectAllowed.clear();
    if (settings.enabled_subjects) for (const s of settings.enabled_subjects) subjectAllowed.add(s);
  }, [settings.enabled_subjects, subjectAllowed]);
  /** Should the PLAY button be blocked? (#6 — effective per-weekday cap reached) */
  const playLimitReached = (() => {
    const cap = todayLimitMin(settings);
    return cap !== null && todayMinutes() >= cap;
  })();
  // A gentle child-facing banner when a play attempt hits the daily cap.
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  // Track minutes: a session start stamps this ref; the session-end effect adds
  // the elapsed minutes to the daily tracker.
  const sessionStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (screen === "playing") sessionStartRef.current = Date.now();
    if (screen !== "playing" && sessionStartRef.current != null) {
      const mins = Math.round((Date.now() - sessionStartRef.current) / 60_000);
      sessionStartRef.current = null;
      if (mins > 0) addTodayMinutes(mins);
    }
  }, [screen]);

  // Auto-enter fullscreen once, on the first interaction — "fullscreen by default".
  const didAutoFs = useRef(false);
  useEffect(() => {
    const onFs = () => setFsActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs as EventListener);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) exitFullscreen();
        else requestFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs as EventListener);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) exitFullscreen();
    else requestFullscreen();
  };

  const goNova = () => setScreen(kid ? "nova" : "kidpick");
  const goGarden = () => setScreen(kid ? "garden" : "kidpick");
  const goCards = () => setScreen(kid ? "cards" : "kidpick");
  const goBadges = () => setScreen(kid ? "badges" : "kidpick");
  const goTrophyRoom = () => setScreen(kid ? "trophyroom" : "kidpick");
  /** Open the printable certificate for a completed world. */
  const openCert = (b: Band) => {
    if (!kid) return;
    setCertWorld(b);
    setScreen("cert");
    cancelSpeech();
    tada();
    // Speak the REAL Bangla world name (কুঁড়ির বাগান …), not an English one
    // or a phonetic transliteration — the parent/certificate hears proper Bangla.
    speak(t.certSpeak(kid.name, lang === "bn" ? b.titleBn ?? b.title : b.title));
  };

  /** Transient "✓ Shared" / error feedback next to the share buttons. */
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const flashShare = (msg: string, ms = 2600) => {
    setShareMsg(msg);
    window.setTimeout(() => setShareMsg((m) => (m === msg ? null : m)), ms);
  };

  /** Parent panel → pretty progress card → WhatsApp. Rewards the kid +5 coins
   *  (once/day) — the share loop pays the actual user, not just the parent. */
  const shareProgress = async (k: Kid) => {
    click();
    try {
      const st = stats[k.id] ?? { stars: 0, score: 0, sessions: 0 };
      const worlds: ShareCardData["worlds"] = BANDS.map((b) => {
        const p = worldProgress(skillsMap, k.id, b.id);
        return { emoji: worldEmoji(b.key), title: lang === "bn" ? b.titleBn ?? b.title : b.title, mastered: p.mastered, total: p.total };
      });
      const data: ShareCardData = {
        title: t.shareCardTitle,
        name: k.name,
        avatar: k.avatar ?? "🧒",
        stars: st.stars,
        score: st.score,
        sessions: st.sessions,
        statsLabels: [t.shareStatsStars, t.shareStatsScore, t.shareStatsSessions],
        worlds,
        worldsTitle: t.shareWorldsTitle,
        footer: t.shareCardFooter,
      };
      const canvas = renderShareCard(document.createElement("canvas"), data);
      const blob = await canvasToBlob(canvas);
      const caption = t.shareProgressCaption(k.name);
      const res = await sharePng(blob, `numberverse-${k.name.replace(/\s+/g, "-")}-progress.png`, caption, waTextUrl(caption));
      if (res === "unsupported") {
        flashShare(t.shareFail);
        return;
      }
      // Reward the kid (once per calendar day) + let Nova announce it.
      if (useKidStore.getState().novaShareReward(k.id)) {
        tada();
        cancelSpeech();
        speak(t.shareRewardSpeak(k.name), { lang: lang === "bn" ? "bn" : "en" });
      }
      flashShare(t.shareDone);
    } catch {
      flashShare(t.shareFail);
    }
  };

  /** 📄 KOTHA weekly digest — exports the last 7 days of learning stories as a
   *  plain-text file (kid name + moments; no PII beyond that). Fully local:
   *  reads the store's own story outbox, never touches the cloud. */
  const downloadWeekDigest = (k: Kid) => {
    click();
    const weekMs = 7 * 864e5;
    const stories = useKidStore
      .getState()
      .stories.filter((s) => s.kidId === k.id && s.ts >= Date.now() - weekMs);
    if (stories.length === 0) {
      flashShare(t.digestEmpty);
      return;
    }
    const sorted = [...stories].sort((a, b) => a.ts - b.ts);
    const solved = sorted.filter((s) => s.outcome).length;
    const tricky = sorted.length - solved;
    const locale = lang === "bn" ? "bn-BD" : "en-GB";
    const day = (ts: number, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
      new Date(ts).toLocaleDateString(locale, opts);
    const weekFrom = day(sorted[0].ts, { day: "numeric", month: "short" });
    const weekTo = day(sorted[sorted.length - 1].ts, { day: "numeric", month: "short" });
    const lines = [
      t.digestHeader(k.name, `${weekFrom} – ${weekTo}`),
      t.digestStats(sorted.length, solved, tricky),
      "",
      ...sorted.map((s) => {
        const skill = filterSkills.find((f) => f.id === s.skillId);
        const title = skill?.title ?? s.skillId;
        const game = getGame(s.gameId)?.id ?? s.gameId;
        const result = s.outcome ? `✓ ${t.digestSolved}` : `⚠ ${t.digestTricky(s.wrongStreak)}`;
        const mis = s.misconceptionCode ? ` · ${t.digestMoni(s.misconceptionCode)}` : "";
        return `${day(s.ts)} · ${title} (${game})\n  ${result}${mis} · lvl ${s.difficulty}`;
      }),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `numberverse-${k.name.replace(/\s+/g, "-")}-digest.txt`;
    a.click();
    URL.revokeObjectURL(url);
    flashShare(t.digestDone);
  };

  /** Certificate screen → pretty cert card → WhatsApp (no coin reward — the
   *  progress share already owns that; this is a keepsake). */
  const shareCert = async () => {
    click();
    if (!kid || !certWorld) return;
    try {
      const cSkills = filterSkills.filter(
        (sk) => sk.band === certWorld.id && sk.game && (skillsMap[`${kid.id}:${sk.id}`]?.pMastered ?? 0) >= MASTERY_THRESHOLD
      );
      const data: ShareCertData = {
        title: t.certTitle,
        certifies: t.certThisCertifies,
        name: kid.name,
        mastered: t.certHasMastered,
        worldTitle: lang === "bn" ? certWorld.titleBn ?? certWorld.title : certWorld.title,
        skillCount: t.certSkillCount(cSkills.length),
        withNova: t.certWithNova,
        signed: t.certSigned,
        dateLabel: t.certDate,
        date: cardDate(Date.now(), lang),
        skills: cSkills.slice(0, 5).map((sk) => ({ title: sk.title, titleBn: sk.titleBn })),
        footer: t.certShareFooter,
      };
      const canvas = renderCertCard(document.createElement("canvas"), data);
      const blob = await canvasToBlob(canvas);
      const caption = t.certShareCaption(kid.name, lang === "bn" ? certWorld.titleBn ?? certWorld.title : certWorld.title);
      const res = await sharePng(blob, `numberverse-${kid.name.replace(/\s+/g, "-")}-certificate.png`, caption, waTextUrl(caption));
      flashShare(res === "unsupported" ? t.shareFail : t.shareDone);
    } catch {
      flashShare(t.shareFail);
    }
  };
  /** Flip a mastered card (front ⇄ back). Locked cards don't flip. */
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const toggleCard = (skillId: string) => {
    click();
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };
  /** Pick a kid + remember them for every future launch. */
  const selectKid = (k: Kid) => {
    setKid(k);
    try {
      localStorage.setItem("nv_kid_id", k.id);
    } catch {
      /* ignore */
    }
  };

  /* #22 — sibling co-op: hand the device to a sibling MID-SESSION. Swapping
     `kid` re-runs the playing effect (kid is a dep), which restarts the CURRENT
     step scene for the new kid with their own name, level ladder, and wrong-ledger
     context — so per-kid progress (skills/moni/stats/pet/coins) stays separate
     automatically while both kids co-play the SAME session (alternating turns). */
  const passToSibling = (k: Kid) => {
    selectKid(k);
    setCoopOpen(false);
    setCoopToast(t.nowPlaying(k.name));
    window.clearTimeout(coopTimerRef.current);
    coopTimerRef.current = window.setTimeout(() => setCoopToast(null), 2200);
  };
  useEffect(() => () => window.clearTimeout(coopTimerRef.current), []);

  /* #139 — stop the QR camera + decode loop (safe to call when idle). */
  const stopScanner = () => {
    cancelAnimationFrame(scanRafRef.current ?? 0);
    scanRafRef.current = undefined;
    scanStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    scanStreamRef.current = null;
  };

  /** Launch the game a flashcard code points to — "NV:<skillId>" or bare
   *  skillId. Used by BOTH the camera decode and the manual entry fallback, so
   *  the card→game path is fully testable offline without a camera. */
  const launchCardCode = (raw: string) => {
    const trimmed = raw.trim();
    const skillId = trimmed.startsWith("NV:") ? trimmed.slice(3).trim() : trimmed;
    const skill = SKILLS.find((s) => s.id === skillId && !!s.game);
    if (!skill) {
      setScanError(t.scanNotCard);
      return;
    }
    stopScanner();
    setScanOpen(false);
    setScanCode("");
    startSingleSkill(skill);
  };

  // Keep the decode loop on the LATEST launcher without re-running the camera
  // effect every render (the effect's closure would otherwise go stale).
  const launchCardCodeRef = useRef(launchCardCode);
  launchCardCodeRef.current = launchCardCode;

  /** #139 — open the camera when the scan sheet opens and live-decode QRs.
   *  jsQR is dynamically imported so the main bundle stays lean. On camera
   *  failure (denied / no camera / non-secure) the sheet shows the manual
   *  entry input instead — the scan flow never dead-ends. */
  useEffect(() => {
    if (!scanOpen) return;
    let active = true;
    setScanError(null);
    (async () => {
      let stream: MediaStream | null = null;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        scanStreamRef.current = stream;
        const video = scanVideoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const loop = async () => {
          if (!active || !scanOpen) return;
          const v = scanVideoRef.current;
          const c = scanCanvasRef.current;
          if (v && c && v.readyState >= 2 && v.videoWidth > 0) {
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              c.width = v.videoWidth;
              c.height = v.videoHeight;
              ctx.drawImage(v, 0, 0);
              try {
                const { default: jsQR } = await import("jsqr");
                const img = ctx.getImageData(0, 0, c.width, c.height);
                const found = jsQR(img.data, c.width, c.height);
                if (found?.data) launchCardCodeRef.current(found.data);
              } catch {
                /* decode hiccup — keep scanning */
              }
            }
          }
          scanRafRef.current = requestAnimationFrame(loop);
        };
        scanRafRef.current = requestAnimationFrame(loop);
      } catch {
        if (active) setScanError(t.scanCameraDenied);
      }
    })();
    return () => {
      active = false;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanOpen]);

  /* ── Persist the chosen UI language + mirror it to game scenes ── */
  useEffect(() => {
    try {
      localStorage.setItem("nv_lang", lang);
    } catch {
      /* ignore */
    }
    setAppLang(lang);
    // #131 — locale packs carry the text direction: an RTL locale (Arabic…)
    // flips the whole document so bidi text lays out correctly.
    document.documentElement.dir = getLocale().dir === "rtl" ? "rtl" : "ltr";
  }, [lang]);

  /* ── PWA: capture the browser's install prompt (Chrome/Samsung/Edge) ── */
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /* One tap anywhere = the app makes sound AND goes fullscreen. Buttons click,
   * background music starts on the very first interaction, iOS speech is
   * "unlocked" inside the gesture so the next question read works even though
   * Phaser scenes mount asynchronously after the tap, and the very first tap
   * anywhere auto-enters fullscreen (the app's default state). */
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      try {
        primeSpeech(); // iOS: unlock speech SYNCHRONOUSLY inside this gesture
        window.speechSynthesis?.resume(); // some Android builds pause on idle
      } catch {
        /* speech unavailable */
      }
      if (!didAutoFs.current && document.documentElement) {
        didAutoFs.current = true;
        requestFullscreen(); // fullscreen by default — first tap anywhere
      }
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.closest !== "function" || t.closest(".game-wrap")) return;
      if (t.closest("button")) {
        ensureAudio();
        startMusic(); // idempotent — music begins on the first tap anywhere
        click();
      }
    };
    document.addEventListener("click", onDoc, true);
    return () => document.removeEventListener("click", onDoc, true);
  }, []);

  const installApp = () => {
    if (!installEvt) return;
    (installEvt as unknown as { prompt: () => Promise<void> }).prompt();
  };

  /** Leave the game canvas mid-session back to the world detail screen.
   *  Stays FULLSCREEN — the app defaults to fullscreen; parents exit via the
   *  footer toggle or the "f" key. */
  const leaveGame = () => {
    cancelSpeech();
    const game = gameRef.current;
    if (game) {
      if (activeSceneRef.current) game.scene.stop(activeSceneRef.current);
      game.scene.start("Boot");
    }
    activeSceneRef.current = null;
    setRoundsDone(0);
    setSessionIdx(0);
    // Back to the PLAY screen — one simple place a child always returns to.
    setScreen("home");
  };

  /* ── Create + boot Phaser for the game canvas (playing / Nova / Garden) ──
     The engine + scenes are a DYNAMIC chunk (issue #15) — bootGame() imports it
     lazily. If the user leaves before the chunk loads, teardown() bumps a
     generation so the pending boot never creates a game on an unmounted canvas. */
  useEffect(() => {
    if ((screen !== "playing" && screen !== "nova" && screen !== "garden") || !mountRef.current || gameRef.current) return;
    const mountEl = mountRef.current;
    /* iOS root-cause fix #2: Safari's toolbar collapse fires `visualViewport.resize`
       (NOT window.resize), and the canvas element can outgrow/under-grow its
       flex parent after HUD show/hide. Re-measure the canvas the moment the
       wrap div or the visual viewport changes → Phaser fires RESIZE → every
       scene re-lays out → questions + answer rows stay on the visible screen. */
    const refreshCanvas = () => {
      const g = gameRef.current;
      if (g && g.isBooted) g.scale.refresh();
    };
    let raf = 0;
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && mountEl) {
      ro = new ResizeObserver(() => {
        if (raf) return; // one refresh per frame max
        raf = requestAnimationFrame(() => {
          raf = 0;
          refreshCanvas();
        });
      });
      ro.observe(mountEl);
    }
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    vv?.addEventListener("resize", refreshCanvas);
    bootGame(mountEl).then((g) => {
      if (!g || gameRef.current !== null) return; // torn down mid-load / already set
      gameRef.current = g;
      (window as unknown as Record<string, unknown>).__NV_GAME__ = g;
    });
    return () => {
      gameRef.current = null;
      activeSceneRef.current = null;
      (window as unknown as Record<string, unknown>).__NV_GAME__ = null;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      vv?.removeEventListener("resize", refreshCanvas);
      teardownGame();
    };
  }, [screen]);

  /* ── Nova companion home: greet the kid right after profile selection ── */
  useEffect(() => {
    if (screen !== "nova" || !kid || !mountRef.current) return;
    const mountEl = mountRef.current;
    let active = true;
    const start = (game: Game) => {
      if (!active || screen !== "nova") return;
      if (activeSceneRef.current && activeSceneRef.current !== "Nova") {
        game.scene.stop(activeSceneRef.current);
      }
      // Nova greets the kid BY NAME with TODAY'S PLAN — the recommended next
      // skill + their current streak — computed fresh from the local store.
      const st = useKidStore.getState();
      const rec = recommendedSkill(st.skills, kid.id);
      game.scene.start("Nova", {
        kidId: kid.id,
        kidName: kid.name,
        onBack: () => setScreen("home"),
        onPlay: () => setScreen("home"),
        recTitle: rec?.title ?? null,
        recTitleBn: rec?.titleBn ?? null,
        streak: st.nova[kid.id]?.streak ?? 0,
      });
      activeSceneRef.current = "Nova";
    };
    whenGameReady(mountEl, start); // waits for the async engine chunk
    return () => {
      active = false;
    };
  }, [screen, kid]);

  /* ── The Growth Garden: the kid's living proof of every correct answer ── */
  useEffect(() => {
    if (screen !== "garden" || !kid || !mountRef.current) return;
    const mountEl = mountRef.current;
    let active = true;
    const start = (game: Game) => {
      if (!active || screen !== "garden") return;
      if (activeSceneRef.current && activeSceneRef.current !== "Garden") {
        game.scene.stop(activeSceneRef.current);
      }
      game.scene.start("Garden", {
        kidId: kid.id,
        kidName: kid.name,
        onBack: () => setScreen("home"),
      });
      activeSceneRef.current = "Garden";
    };
    whenGameReady(mountEl, start); // waits for the async engine chunk
    return () => {
      active = false;
    };
  }, [screen, kid]);

  /* ── Start the scene for the current session step ── */
  useEffect(() => {
    if (screen !== "playing" || !kid || !mountRef.current) return;
    const mountEl = mountRef.current;
    const step = sessionRef.current[sessionIdx];
    if (!step) return;
    let active = true;
    const reteach = step.reteach ?? 0;
    const startLevelIndex = reteach > 0
      // Mastery-gate remediation: drop to the EASIEST tier so the re-taught
      // concept is re-learned simply (then it ramps back up on its own).
      ? Math.min(adaptiveLevelIndex(kid.id, step.skillId, step.gameId), 1)
      : adaptiveLevelIndex(kid.id, step.skillId, step.gameId);
    setCurrentKidName(kid.name);
    // Arm the wrong-answer ledger so hintWrong() records THIS kid+skill on every
    // wrong tap (resolve-to-complete: wrongs accumulate until a correct solve).
    wrongLedger.setContext({ kidId: kid.id, skillId: step.skillId, gameId: step.gameId, difficulty: startLevelIndex });
    const start = (game: Game) => {
      if (!active || screen !== "playing") return;
      // stop the previous scene so two games never render at once
      if (activeSceneRef.current && activeSceneRef.current !== step.scene) {
        game.scene.stop(activeSceneRef.current);
      }
      // Use the SceneManager directly (not target.scene.start): at boot time the
      // scene instance may not exist yet (Phaser creates it lazily on first start),
      // so `getScene(key)` can return null even when `game.isBooted` is true.
      // `game.scene.start` creates the instance if needed and passes data through.
      game.scene.start(step.scene, {
        startLevelIndex,
        mode: step.mode,
        // #20 — scenes that vary content per skill (BgsFacts heritage) read it.
        skill: step.skillId,
        // Remediation re-runs the narrated concept demo (FruitAdd) so the wrong
        // skill is TAUGHT again, differently, before fresh easy drills.
        teach: step.teach || reteach > 0,
        kidName: kid.name,
        // Per-skill difficulty ladder (e.g. CountPop reuses the same scene for
        // count-to-10 AND count-to-50 — the scene reads its own levels here).
        levels: getGame(step.gameId)?.difficultyLevels,
        onRoundDone: (correct: boolean, ms: number, difficulty: number) => {
          const e: RoundResult = { gameId: step.gameId, skillId: step.skillId, correct, difficulty, responseMs: ms };
          addEvent(kid.id, e);
          novaAwardRound(kid.id, correct);
          // #133 — screen-reader cue for every round (matches the on-screen flash).
          announce(correct ? t.a11yRight : t.a11yWrong);
          // every completed round counts toward today's Daily Quest (play N → bonus)
          if (novaQuestRound(kid.id)) {
            // THE moment the quest finishes — cheer once, aloud, in the app's language.
            cancelSpeech();
            tada();
            const bn = getAppLang() === "bn";
            speak(t.questCompleteSpeak(NOVA_QUEST_REWARD), { lang: bn ? "bn" : "en" });
          }
          // GROWTH: a correct answer waters the garden…
          if (correct) gardenWater(kid.id);
          // …and a skill that just crossed the mastery bar plants a trophy flower.
          // (masteryPlant dedupes per skill — one flower, ever. masteredBeforeRef
          //  is left untouched so the done-screen "New skill mastered!" still cheers.)
          const st = useKidStore.getState().skills[`${kid.id}:${step.skillId}`];
          if (st && st.pMastered >= MASTERY_THRESHOLD) {
            gardenMastery(kid.id, step.skillId, step.title);
            // PET + 🎉 #290 IN-THE-MOMENT: a brand-new mastery is the BIG moment —
            // the pet takes a step AND we celebrate RIGHT NOW with a confetti burst
            // + a spoken cheer, not just a badge on the done screen. One per skill.
            if (!masteredBeforeRef.current.has(step.skillId)) {
              useKidStore.getState().petGrowMastery(kid.id);
              masteredBeforeRef.current.add(step.skillId);
              cancelSpeech();
              tada();
              const bn = getAppLang() === "bn";
              speak(t.masterySpeak(step.title), { lang: bn ? "bn" : "en" });
              announce(t.a11yMastered(step.title)); // #133 — screen-reader cue
              const sc = game.scene.getScene(step.scene);
              if (sc && sc.scale) {
                confettiBurst(sc, sc.scale.width / 2, Math.min(sc.scale.height * 0.35, 240), 44);
              }
            }
          }
          void syncProgress();
          setRoundsDone((n) => n + 1);
        },
      });
      activeSceneRef.current = step.scene;
    };
    whenGameReady(mountEl, start); // waits for the async engine chunk
    return () => {
      active = false;
      // Leaving the drill screen disarms the ledger — Nova/Garden taps aren't
      // skill attempts. Any wrongs recorded so far stay in the ledger.
      wrongLedger.setContext(null);
    };
  }, [screen, world, kid, sessionIdx, reteachNonce, addEvent, novaAwardRound, novaQuestRound, gardenWater, gardenMastery]);

  /* ── Advance to the next skill after ROUNDS_TO_FINISH rounds — BUT only if
     the current step's wrongs are RESOLVED (open === 0). If the kid still has
     unresolved wrongs, the block does NOT advance: the same step re-queues in
     REMEDIATION (re-demo + easiest tier, fresh questions each round, solution
     revealed on miss #3) and loops until a block ends clean. The kid MUST play
     the current step until they've shown they know it — wrongs never get
     silently left behind. */
  useEffect(() => {
    if (screen !== "playing" || roundsDone < ROUNDS_TO_FINISH) return;
    setRoundsDone(0);
    const step = sessionRef.current[sessionIdx];
    if (!step || !kid) return;
    const open = mistakes[`${kid.id}:${step.skillId}`]?.open ?? 0;
    if (open > 0) {
      // Mastery gate — re-teach the SAME step differently until solved.
      sessionRef.current[sessionIdx] = { ...step, reteach: (step.reteach ?? 0) + 1 };
      setReteachNonce((n) => n + 1);
      const bn = getAppLang() === "bn";
      speak(t.reteachLetTry, { lang: bn ? "bn" : "en" });
      return; // do NOT advance
    }
    const next = sessionIdx + 1;
    if (next < sessionRef.current.length) {
      setSessionIdx(next);
    } else {
      // #327 — fatigue-aware pacing: read Moni's profile BEFORE recordSession
      // resets sessionRounds. If the session crossed the fatigue threshold, the
      // next screen is a gentle break (never a hard stop — "keep going" is one
      // tap away). Threshold defaults to 12 when never measured, so short
      // sessions are never interrupted.
      const prof = useKidStore.getState().moni?.[kid.id];
      const threshold = prof?.attention.fatigueThreshold ?? 12;
      breakPendingRef.current = !!prof && prof.sessionRounds >= threshold;
      if (kid) {
        novaCompleteSession(kid.id);
        recordSession(kid.id);
      }
      tada();
      cancelSpeech();
      setTimeout(() => setScreen(breakPendingRef.current ? "break" : "done"), 400);
    }
  }, [roundsDone, sessionIdx, screen, kid, mistakes, recordSession, novaCompleteSession]);

  /* The done screen talks — a spoken celebration to seal the win. */
  useEffect(() => {
    if (screen === "done") speak(t.amazing);
  }, [screen, t.amazing]);

  const startPlayWorld = (b: Band) => {
    if (!kid) return;
    if (playLimitReached) {
      setLimitNotice(t.playLimitReached);
      return;
    }
    setLimitNotice(null);
    requestFullscreen();
    ensureAudio();
    setMusicTheme(b.id); // #134 — this land's ambient music + SFX key
    startMusic();
    whooshUp();
    reset();
    setRoundsDone(0);
    setSessionIdx(0);
    breakPendingRef.current = false;
    sessionRef.current = sessionForWorld(skillsMap, kid.id, b.id);
    masteredBeforeRef.current = masteredSkillIds(skillsMap, kid.id);
    petStageBeforeRef.current = useKidStore.getState().nova[kid.id]?.petStage ?? 0;
    setWorld(b);
    setScreen("playing");
  };

  const startSingleSkill = (skill: Skill) => {
    if (!kid) return;
    if (playLimitReached) {
      setLimitNotice(t.playLimitReached);
      return;
    }
    setLimitNotice(null);
    requestFullscreen();
    ensureAudio();
    setMusicTheme(skill.band); // #134 — the stop's land music
    startMusic();
    whooshUp();
    reset();
    setRoundsDone(0);
    setSessionIdx(0);
    breakPendingRef.current = false;
    sessionRef.current = [stepForSkill(skill)];
    masteredBeforeRef.current = masteredSkillIds(skillsMap, kid.id);
    petStageBeforeRef.current = useKidStore.getState().nova[kid.id]?.petStage ?? 0;
    // The "done" screen needs a world to render — bind the stop's band so the
    // celebration screen appears after the lesson instead of a blank page.
    setWorld(BANDS.find((b) => b.id === skill.band) ?? null);
    setScreen("playing");
  };

  /** Replay the exact same session (a single journey stop or a world sweep). */
  const replaySession = () => {
    if (!kid || !sessionRef.current.length) return;
    if (playLimitReached) {
      setLimitNotice(t.playLimitReached);
      return;
    }
    setLimitNotice(null);
    requestFullscreen();
    ensureAudio();
    startMusic();
    whooshUp();
    reset();
    setRoundsDone(0);
    setSessionIdx(0);
    breakPendingRef.current = false;
    masteredBeforeRef.current = masteredSkillIds(skillsMap, kid.id);
    petStageBeforeRef.current = useKidStore.getState().nova[kid.id]?.petStage ?? 0;
    setScreen("playing");
  };

  /** Start the NEXT round after a finished session: the journey's current stop
   *  (which is the freshly-mastered skill's successor when the kid crossed the
   *  mastery bar, or the same skill to keep practicing when they didn't — the
   *  honest next step either way). Journey complete → falls back to a replay. */
  /** 🎯 #325 — launch a Moni contrast drill for a misconception CODE on a
   *  skill. Only codes with a template get a drill (random guesses never
   *  match). Warm sound, then the side-by-side quiz. */
  const startContrastDrill = (code: string, skillId: string) => {
    if (!kid) return;
    const template = CONTRAST_TEMPLATES[code];
    if (!template) return;
    click();
    setContrastJob({ template, skillId });
    setContrastIdx(0);
    setScreen("contrast");
  };

  const startNextRound = () => {
    if (!kid) return;
    if (playLimitReached) {
      setLimitNotice(t.playLimitReached);
      return;
    }
    const stops = journeyState(skillsMap, kid.id);
    const idx = journeyCurrentIndex(stops);
    if (idx >= stops.length) {
      replaySession();
      return;
    }
    startSingleSkill(stops[idx].skill);
  };

  const openWorld = (b: Band) => {
    setWorld(b);
    setScreen("worlddetail");
  };

  const addKid = (name: string, avatar: string, birthYear: number, birthMonth?: number, birthDay?: number) => {
    const newKid: Kid = { id: genId(), name, avatar, birthYear, ...(birthMonth ? { birthMonth } : {}), ...(birthDay ? { birthDay } : {}) };
    const next = [...kids, newKid];
    setKids(next);
    try {
      localStorage.setItem("nv_kids", JSON.stringify(next));
    } catch {
      /* ignore */
    }
    // Onboarding: the fresh profile is picked and the app opens on PLAY —
    // one tap and a brand-new kid is already playing.
    selectKid(newKid);
    setScreen("home");
  };

  const curStep = sessionRef.current[sessionIdx];
  const curReteach = (curStep?.reteach ?? 0) > 0;

  /* ── WELCOME (first time — topmost) ──────────────────────────────────────
   *  The very first screen on a fresh device. LANGUAGE first (topmost), then
   *  the BINARY scene: Guest mode OR Sign in. The syllabus is one tap away
   *  BEFORE any sign-in. Every choice keeps working — nothing is locked
   *  behind the gate; the gate just unlocks cross-device progress. */
  if (screen === "welcome") {
    return (
      <div className="app">
        <main className="screen worlds parent-screen gate-screen">
          <div className="gate-card welcome-card">
            <div className="gate-logo" aria-hidden>🔢</div>
            <h2 className="gate-title">{t.welcomeTitle}</h2>
            <p className="gate-sub">{t.welcomeSub}</p>

            {/* LANGUAGE SELECTION — the topmost decision on first load */}
            <div className="welcome-langs" role="radiogroup" aria-label={t.welcomeLangLabel}>
              <button
                className={`welcome-lang${lang === "en" ? " active" : ""}`}
                role="radio"
                aria-checked={lang === "en"}
                onClick={() => setLang("en")}
              >
                {t.welcomeEnglish}
              </button>
              <button
                className={`welcome-lang${lang === "bn" ? " active" : ""}`}
                role="radio"
                aria-checked={lang === "bn"}
                onClick={() => setLang("bn")}
              >
                {t.welcomeBangla}
              </button>
            </div>

            {/* BINARY SCENE: Guest mode | Sign in */}
            <div className="welcome-binary">
              <button className="big-btn welcome-guest" onClick={enterAsGuest}>
                {t.welcomeGuest}
              </button>
              <p className="gate-guest-sub">{t.welcomeGuestSub}</p>
              <div className="gate-or"><span>{t.welcomeOr}</span></div>
              <button className="ghost-btn welcome-signin" onClick={() => { gateReturn.current = "syllabus"; setScreen("parent"); }}>
                {t.welcomeSignin}
              </button>
            </div>

            <button className="welcome-syllabus-link" onClick={goSyllabus}>
              {t.welcomeSyllabus}
            </button>
            <p className="gate-privacy">{t.gatePrivacy}</p>
          </div>
        </main>
      </div>
    );
  }

  /* ── PARENT GATE (sign-in) ───────────────────────────────────────────────
   *  Reached from Welcome (I'm a parent) or on return visits without a
   *  session. Google one-tap first (when configured), then the email tabs, a
   *  guest fallback for instant play, and the syllabus before signing in. */
  /* ── INTERACTIVE SYLLABUS (what kids learn) ──────────────────────────────
   *  Data-driven straight from @numberverse/core SKILLS — the SAME brain-aligned
   *  index that drives the course, so what a parent sees IS what the kid plays.
   *  Bands expand/collapse; each lesson shows the game + the idea it teaches. */
  if (screen === "syllabus") {
    const pName = parentName();
    const masteredCount = kid ? totalMastered(skillsMap, kid.id) : 0;
    const totalCount = filterSkills.filter((s) => s.game).length;
    const goStart = () => {
      const list = loadKids();
      setScreen(list.length ? (kid ? "home" : "kidpick") : "addkid");
    };
    // No English/Bengali mixing — every label picks the CURRENT language:
    //   en → English title + description · bn → Bangla title + description.
    const L = (s: Skill) => ({
      title: lang === "bn" ? s.titleBn ?? s.title : s.title,
      desc: lang === "bn" ? s.descriptionBn ?? s.description ?? "" : s.description ?? "",
    });
    const bandName = (b: Band) => (lang === "bn" ? b.titleBn ?? b.title : b.title);
    const subjectEmoji = (sub: string) =>
      sub === "math" ? "🧮" : sub === "bangla" ? "📗" : sub === "english" ? "🔤" : sub === "science" ? "🔬" : "🌏";
    return (
      <div className="app">
        <main className="screen worlds parent-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={goStart} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>{t.syllabusTitle}</h2>
              <p className="head-sub">{t.syllabusSub}</p>
            </div>
          </header>

          {/* Browsing the syllabus BEFORE signing in — invite, never block. */}
          {!hasParentSession() && (
            <div className="syllabus-guest-banner">
              <span className="syllabus-guest-emoji" aria-hidden>👀</span>
              <p className="syllabus-guest-text">
                {t.syllabusGuestNote}{" "}
                <button className="syllabus-banner-link" onClick={() => { gateReturn.current = "syllabus"; setScreen("parent"); }}>
                  {t.gateSignin}
                </button>
              </p>
            </div>
          )}

          <div className="syllabus-wrap">
            <div className="syllabus-hello">
              <span className="syllabus-hello-emoji" aria-hidden>👨‍👩‍👧</span>
              <div>
                <p className="syllabus-hello-title">{pName ? t.gateWelcome(pName) : t.syllabusTitle}</p>
                <p className="syllabus-hello-sub">{t.syllabusWhat}</p>
                {kid && <p className="syllabus-hello-progress">{t.syllabusProgress(masteredCount, totalCount)} · {kid.name}</p>}
              </div>
            </div>

            {/* the learning ladder — why the order is the way it is */}
            <div className="syllabus-ladder">
              <p className="syllabus-ladder-title">{t.syllabusHow}</p>
              <ol className="syllabus-ladder-list">
                <li>{t.syllabusHow1}</li>
                <li>{t.syllabusHow2}</li>
                <li>{t.syllabusHow3}</li>
              </ol>
            </div>

            {/* ── EYE-CATCHING WORLD GRID ── each world is a card tinted with
                 its own land colors; lessons are a grid of tappable tiles. */}
            {BANDS.map((b) => {
              const skills = SKILLS.filter((s) => s.band === b.id);
              const p = kid ? worldProgress(skillsMap, kid.id, b.id) : { mastered: 0, total: skills.filter((s) => s.game).length, pct: 0 };
              const palette = WORLD_LANDS[b.id] ?? { c1: "#0f3d33", c2: "#2ec4b6", c3: "#a7f3d0", c2_22: "rgba(46,196,182,0.16)", deco: ["🌱"] };
              return (
                <section
                  key={b.key}
                  className="syllabus-world"
                  style={{ "--w1": palette.c1, "--w2": palette.c2, "--w3": palette.c3, "--w2a": palette.c2_22 } as React.CSSProperties}
                >
                  {/* world header — name, age, live progress */}
                  <div className="syllabus-world-head">
                    <span className="syllabus-world-emoji"><Icon name={b.key} size={40} /></span>
                    <span className="syllabus-world-meta">
                      <span className="syllabus-world-name">{bandName(b)}</span>
                      <span className="syllabus-world-tags">
                        <span className="syllabus-chip">{t.syllabusBadge(b.id)}</span>
                        <span className="syllabus-chip">🎂 {b.ageRange}</span>
                      </span>
                    </span>
                    <span className="syllabus-world-progress">
                      <span className="syllabus-world-pct">{t.syllabusProgress(p.mastered, p.total)}</span>
                      <span className="syllabus-world-bar"><span style={{ width: `${p.pct}%` }} /></span>
                    </span>
                  </div>

                  {/* lesson tiles — one per skill, in course order */}
                  <div className="syllabus-grid">
                    {skills.map((s) => {
                      const { title, desc } = L(s);
                      const ms = kid ? skillsMap[`${kid.id}:${s.id}`] : undefined;
                      const pct = ms ? Math.round(ms.pMastered * 100) : 0;
                      const mastered = pct >= MASTERY_THRESHOLD * 100;
                      const tappable = !!kid && !!s.game;
                      return (
                        <button
                          key={s.id}
                          className={`syllabus-tile${mastered ? " done" : ""}${pct > 0 && !mastered ? " started" : ""}`}
                          onClick={() => tappable && startSingleSkill(s)}
                          disabled={!tappable}
                          title={tappable ? t.syllabusGame : undefined}
                        >
                          <span className="syllabus-tile-top">
                            <span className="syllabus-tile-emoji"><Icon name={s.subject} size={32} fallbackEmoji={subjectEmoji(s.subject)} /></span>
                            <span className={`syllabus-tile-badge${mastered ? " done" : ""}`}>
                              {mastered ? "✓" : pct > 0 ? `${pct}%` : "•"}
                            </span>
                          </span>
                          <span className="syllabus-tile-name">{title}</span>
                          {desc && <span className="syllabus-tile-desc">{desc}</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <button className="big-btn syllabus-start" onClick={goStart}>
              {t.syllabusStart}
            </button>
            <p className="gate-privacy">{t.gatePower}</p>
          </div>

          {/* Floating action button — the signed-in parent just finished the
              gate; one thumb-tap jumps straight into the kid's learning instead
              of scrolling the whole syllabus again. Guests browsing the
              syllabus don't get it (they're not logged in yet). */}
          {hasParentSession() && (
            <button className="syllabus-fab" onClick={goStart} aria-label={t.syllabusStart}>
              <span className="syllabus-fab-icon">▶</span>
              <span className="syllabus-fab-label">{t.syllabusFab}</span>
            </button>
          )}
        </main>
      </div>
    );
  }

  if (screen === "home") {
    // Home is JOURNEY-FIRST: Nova greets the kid by name + streak, the kid's
    // avatar stands on their glowing spot on the path, and one tap plays the
    // next stop. No choice-paralysis — the app remembers who's playing.
    // (If no kid is active we fall through to the picker below.)
    if (kid) {
      const recSkill = recommendedSkill(skillsMap, kid.id);
      const onPlay = () => {
        if (recSkill) startSingleSkill(recSkill);
        else startPlayWorld(BANDS[0]);
      };
      playRef.current = onPlay; // #136 — projector keyboard nav uses this
      // "You are here" — the current spot on the one learning path.
      const stops = journeyState(skillsMap, kid.id);
      const doneCount = stops.filter((s) => s.done).length;
      const hereIdx = journeyCurrentIndex(stops);
      const journeyDone = stops.length > 0 && doneCount === stops.length;
      const homeStops = stops.slice(Math.max(0, hereIdx - 2), hereIdx + 3);
      // The journey path wears the real season (snow/flowers/fireflies/leaves).
      const season = currentSeason();
      // Streak kindness: a stale flame (missed ≥1 day) is a silent punishment.
      // When the kid returns after a miss, hide the badge and greet warmly —
      // the streak restarts on their first session, no guilt, no lecture.
      const missedDay = !!novaLastDay && novaLastDay !== todayIso() && novaLastDay !== dayIsoAgo(1);
      // Quest honesty: if the parent's playtime cap already blocks play, a
      // "Play 0/3 rounds" bar is an unreachable goal → gentle rest message instead.
      const questBlocked = playLimitReached && !quest.done;
      // Birthday: when today is the kid's real birthday, Nova throws a party.
      const birthday = isBirthday(kid);
      const claimBirthday = () => {
        useKidStore.getState().novaBirthday(kid.id);
        tada();
        speak(lang === "bn" ? `${kid.name}-এর জন্মদিনে শুভেচ্ছা! 🎂` : `Happy birthday, ${kid.name}! 🎂`);
      };
      // Feeding the pet — once a day, a tiny caring ritual. If this feeding is the
      // one that pushes it to a NEW stage, Nova cheers about it out loud.
      const feedPet = () => {
        const before = useKidStore.getState().nova[kid.id]?.petStage ?? 0;
        useKidStore.getState().petFeed(kid.id);
        const after = useKidStore.getState().nova[kid.id]?.petStage ?? 0;
        tada();
        if (after > before) speak(t.petHatchSpeak(kid.name));
        else speak(t.petFeedSpeak);
      };
      // Nova plays with the kid's name in funny voices — pure silliness.
      // Speech settings: robot = low + slow, whisper = soft + slow, shout = high + fast.
      const speakFunny = (voice: "robot" | "whisper" | "shout") => {
        const bn = lang === "bn";
        const text =
          voice === "robot"
            ? bn ? `বিপ বিপ। ${kid.name}। বিপ বিপ।` : `beep boop. ${kid.name}. beep boop.`
            : voice === "whisper"
              ? bn ? `চুপ… ${kid.name}… চুপ…` : `shhh… ${kid.name}… shhh…`
              : bn ? `${kid.name}!` : `${kid.name}!`;
        speak(text, {
          lang: lang,
          rate: voice === "shout" ? 1.15 : 0.6,
          pitch: voice === "robot" ? 0.35 : voice === "whisper" ? 1.0 : 1.7,
          volume: voice === "whisper" ? 0.45 : voice === "shout" ? 0.95 : 0.9,
        });
        if (voice === "shout") { tada(); }
      };
      const voiceOk = tts ? tts.available && tts.voiceCount > 0 : null;
      return (
        <div className={`app play-app${projector ? " projector-mode" : ""}`}>
          {/* #133 — screen-reader live region: announces game + settings state. */}
          <div id="sr-live" aria-live="polite" className="sr-only" ref={srLiveRef} />
          <main className="screen play-screen">
            <div className="play-top">
              <button
                className="kid-chip"
                onClick={() => setScreen("kidpick")}
                aria-label={t.switchKid(kid.avatar, kid.name)}
              >
                <AvatarIcon emoji={kid.avatar} size={30} />
                <span className="kid-chip-name">{kid.name}</span>
                <span className="kid-chip-swap" aria-hidden="true">⇄</span>
              </button>
              <div className="play-top-right">
                {!projector && (
                  <>
                    <button
                      className={`voice-chip${voiceOk === false ? " warn" : ""}${neural.ready ? " neural-ready" : ""}`}
                      onClick={() => setScreen("settings")}
                      aria-label={t.settingsVoice}
                      title={neural.state === "loading" ? t.voiceNeuralLoading(Math.min(99, Math.round(neural.progress * 100))) : undefined}
                    >
                      {/* ⏳ downloading → 🎙️ neural voice ready (green dot) → 🔊 device voice */}
                      {neural.state === "loading" ? "⏳" : voiceOk === false ? "🔇" : neural.ready ? "🎙️" : "🔊"}
                    </button>
                    <button className="icon-btn settings-btn" onClick={() => setScreen("settings")} aria-label={t.settingsTitle}>
                      ⚙️
                    </button>
                    {/* #139 — flashcard QR → mini-game: scan (or type) a card. */}
                    <button
                      className="icon-btn scan-btn"
                      onClick={() => { setScanCode(""); setScanError(null); setScanOpen(true); }}
                      aria-label={t.scanCard}
                      title={t.scanCard}
                    >
                      📷
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 🎙️ On-device Bangla voice — first-use download banner (live %),
                then a 5s "ready ✓" flash. Appears ONCE; after that the voice is
                cached offline, so kids never see permanent noise. */}
            {neural.state === "loading" ? (
              <div className="voice-dl-banner" role="status">
                🎙️ {t.voiceNeuralLoading(Math.min(99, Math.round(neural.progress * 100)))}
              </div>
            ) : neuralFlash && neural.ready ? (
              <div className="voice-dl-banner ready" role="status">
                🎙️ {t.voiceNeuralReady}
              </div>
            ) : null}

            {/* Nova greets the kid BY NAME (warm re-entry after a missed day),
                shows the streak only when it's earned, and the PLAY button below
                carries the plan — one action, nothing duplicated. */}
            <div className="home-hero">
              <div className="home-nova" role="img" aria-label="Nova the Owl">
                <Icon name="nova" size={72} />
                {!missedDay && novaDayStreak > 0 && (
                  <span className="home-streak" role="status">🔥 {novaDayStreak}</span>
                )}
              </div>
              <div className="home-greet">
                <p className="home-hello">
                  {birthday
                    ? t.birthdayHello(kid.name)
                    : missedDay
                      ? t.welcomeBack(kid.name)
                      : t.homeHello(kid.name)}
                </p>
              </div>
            </div>

            {/* It's the kid's birthday — Nova throws a party: a gift to collect,
                confetti rain, and Nova says it out loud. One day a year. */}
            {birthday && (
              <div className="birthday-card" role="status">
                <div className="birthday-confetti" aria-hidden="true">
                  {["🎂", "🎈", "🎉", "🎊", "⭐", "🎈", "🎁", "🎉"].map((e, i) => (
                    <span key={i} style={{ left: `${(i * 13 + 4) % 92}%`, animationDelay: `${i * 0.35}s` }}>{e}</span>
                  ))}
                </div>
                <div className="birthday-body">
                  <span className="birthday-emoji" aria-hidden="true">🎂</span>
                  <div className="birthday-meta">
                    <span className="birthday-title">{t.birthdayTitle(kid.name)}</span>
                    <span className="birthday-gift">{t.birthdayGift(NOVA_BIRTHDAY_COINS)}</span>
                  </div>
                  {bdayClaimed ? (
                    <span className="birthday-claimed">{t.birthdayClaimed}</span>
                  ) : (
                    <button className="birthday-btn" onClick={claimBirthday}>
                      {t.birthdayClaim}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* The ONE action — it says which stop + where, so a tap always
                starts the right lesson with zero decision-making. */}
            <button className="big-btn play-btn" onClick={onPlay} aria-label={recSkill ? t.playWith(kid.name) : t.play}>
              <span className="play-btn-main">{recSkill ? t.playWith(kid.name) : t.play}</span>
              {recSkill && (
                <span className="play-btn-sub">
                  {(() => {
                    const band = BANDS.find((b) => b.id === recSkill!.band);
                    const prog = worldProgress(skillsMap, kid.id, recSkill!.band);
                    return `${recSkill!.title} · ${band?.title ?? ""} · ${t.skillsProg(prog.mastered, prog.total)}`;
                  })()}
                </span>
              )}
            </button>

            {/* 🦉 Moni's gentle review prompt (#328) — skills mastered but DUE
                for a spaced-review brush-up. Soft, non-blocking, offline-safe
                (reads the local store only), and never a lecture: a quiet
                nudge on the home screen, one tap to play. */}
            {(() => {
              const due = (moniPlanFor(kid.id)?.dueReviews ?? [])
                .map((d) => ({ ...d, skill: filterSkills.find((s) => s.id === d.skillId) }))
                .filter((d): d is typeof d & { skill: Skill } => !!d.skill && !!d.skill.game)
                .slice(0, 2);
              if (due.length === 0) return null;
              return (
                <div className="home-review-prompt" role="status" aria-label={t.moniReviewGentle}>
                  <span className="home-review-owl" aria-hidden="true">🦉</span>
                  <div className="home-review-body">
                    <span className="home-review-line">{t.moniReviewGentle}</span>
                    <div className="home-review-skills">
                      {due.map((d) => (
                        <button
                          key={d.skillId}
                          className="home-review-skill"
                          onClick={() => startSingleSkill(d.skill)}
                        >
                          {d.skill.title}
                        </button>
                      ))}
                    </div>
                    <span className="home-review-tap">{t.moniReviewTap(due.length)}</span>
                  </div>
                </div>
              );
            })()}

            {/* 🎯 MONI contrast drill trigger (#325) — when a confirmed
                misconception has a contrast template, a warm pill invites the
                kid to "fix the pattern together". Tapping runs the side-by-side
                drill; finishing it clears the misconception from the ledger. */}
            {(() => {
              const mis = useKidStore.getState().moni?.[kid.id]?.misconceptions;
              if (!mis?.length) return null;
              const target = mis
                .slice()
                .sort((a, b) => b.lastSeen - a.lastSeen)
                .find((m) => !!CONTRAST_TEMPLATES[m.code]);
              if (!target) return null;
              const gs = filterSkills.find((s) => s.id === target.skillId);
              const name = gs?.title ?? target.label;
              return (
                <button
                  className="home-contrast-pill"
                  onClick={() => startContrastDrill(target.code, target.skillId)}
                  aria-label={t.contrastTrigger(name)}
                >
                  <span className="home-contrast-owl" aria-hidden="true">🦉</span>
                  <span className="home-contrast-body">
                    <span className="home-contrast-line">{t.contrastTrigger(name)}</span>
                    <span className="home-contrast-sub">{t.contrastTriggerSub}</span>
                  </span>
                  <span className="home-contrast-cta" aria-hidden="true">▶</span>
                </button>
              );
            })()}

            {/* #137 — festival decor: the active festival is CONFIG per country
                (locale pack). Off-season this renders nothing. */}
            {(() => {
              const fest = currentFestival();
              if (!fest) return null;
              const label =
                (t as unknown as Record<string, string>)[`fest_${fest.key}`] ?? fest.key;
              return (
                <div className="festival-banner" role="status">
                  <span className="festival-banner-emoji" aria-hidden="true">{fest.emoji}</span>
                  <span className="festival-banner-text">{t.festivalBanner(label, fest.emoji)}</span>
                </div>
              );
            })()}

            {/* Your path — the hero avatar stands on the glowing current node;
                stops behind are ✓, the road ahead is ▶ until it locks 🔒 */}
            <section className={`home-path season-${season}`} aria-label={t.homePath}>
              <div className="home-path-head">
                <span className="home-path-title">🛣️ {t.homePath}</span>
                <span className="season-chip">{SEASON_EMOJI[season]} {season === "snow" ? t.seasonSnow : season === "flowers" ? t.seasonFlowers : season === "fireflies" ? t.seasonFireflies : t.seasonLeaves}</span>
                <span className="home-path-prog">
                  {journeyDone ? t.champion : stops.length ? t.journeyProgress(doneCount, stops.length) : ""}
                </span>
                <button className="home-path-link" onClick={() => setScreen("worlds")}>
                  {t.homeViewJourney}
                </button>
              </div>
              <div className="home-path-strip" role="list">
                <div className="season-particles" aria-hidden="true">
                  {SEASON_PARTICLES.map((p, i) => (
                    <span
                      key={i}
                      className={`season-particle s-${season}`}
                      style={{
                        left: `${p.left}%`,
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.dur}s`,
                        ["--drift" as string]: `${p.drift}px`,
                        ["--rot" as string]: `${p.rot}deg`,
                      }}
                    >
                      {SEASON_EMOJI[season]}
                    </span>
                  ))}
                </div>
                {homeStops.map((st) => {
                  const cls = st.done ? "done" : st.current ? "current" : st.unlocked ? "open" : "locked";
                  return (
                    <button
                      key={st.skill.id}
                      className={`home-node ${cls}`}
                      disabled={!st.unlocked}
                      onClick={() => startSingleSkill(st.skill)}
                      aria-label={st.skill.title}
                    >
                      <span className="home-node-ring">
                        {st.current ? (
                          <AvatarIcon emoji={kid.avatar} size={30} />
                        ) : st.done ? (
                          "✓"
                        ) : st.unlocked ? (
                          "▶"
                        ) : (
                          "🔒"
                        )}
                      </span>
                      <span className="home-node-emoji"><Icon name={st.skill.subject} size={22} /></span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Daily Quest — the visible "come back every day" goal. When the
                parent's playtime cap already blocks play, a "0/3 rounds" bar is
                an unreachable goal → a warm rest line instead, never guilt. */}
            <div className={`quest-chip${quest.done ? " done" : questBlocked ? " rest" : ""}`} role="status">
              <span className="quest-title">{t.questTitle}</span>
              {quest.done ? (
                <span className="quest-line">
                  {t.questDoneText} <span className="quest-reward">{t.questReward(NOVA_QUEST_REWARD)}</span>
                </span>
              ) : questBlocked ? (
                <span className="quest-line">{t.questRest}</span>
              ) : (
                <span className="quest-line">
                  {t.questProgress(Math.min(quest.rounds, NOVA_QUEST_TARGET), NOVA_QUEST_TARGET)}
                  <span className="quest-bar"><span className="quest-fill" style={{ width: `${Math.min(100, (quest.rounds / NOVA_QUEST_TARGET) * 100)}%` }} /></span>
                </span>
              )}
            </div>

            {limitNotice ? <p className="limit-banner" role="status">{limitNotice}</p> : null}

            {/* #281 — 7-day login calendar: a growing coin bonus per consecutive
                play day. One tap per day, fully offline, inside the anti-grind cap.
                Day 1..7 of the cycle; past tiles ✓, today's tile pulses when ready,
                future tiles 🔒. */}
            {calendar ? (
              <div className="cal-chip" role="status" aria-label={t.calendarTitle}>
                <div className="cal-head">
                  <span className="cal-title">{t.calendarTitle}</span>
                  <span className="cal-hint">{t.calendarHint}</span>
                </div>
                <div className="cal-strip" role="list">
                  {NOVA_CALENDAR_REWARDS.map((coins, i) => {
                    const day = i + 1;
                    const isToday = day === calendar.pos;
                    const past = day < calendar.pos;
                    const state = isToday && calendar.claimable ? "claim" : past || calendar.claimedToday ? "done" : isToday ? "wait" : "future";
                    return (
                      <button
                        key={day}
                        className={`cal-tile ${state}`}
                        disabled={!isToday || !calendar.claimable}
                        onClick={() => {
                          const add = useKidStore.getState().novaClaimCalendar(kid.id);
                          if (add > 0) {
                            tada();
                            speak(t.calendarClaimSpeak(kid.name, add));
                          }
                        }}
                        aria-label={isToday ? (calendar.claimable ? t.calendarClaim(coins) : calendar.claimedToday ? t.calendarClaimed : t.calendarHint) : t.calendarLocked}
                      >
                        <span className="cal-tile-top">{past || calendar.claimedToday ? "✓" : isToday ? day : "🔒"}</span>
                        <span className="cal-tile-coin">🪙{coins}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="cal-dayof">{t.calendarDayOf(calendar.pos)}</span>
              </div>
            ) : null}

            {/* The pet — the kid's growing friend. Learning feeds it: every
                session, every new mastery, and one daily snack. */}
            <div className="pet-card" role="status">
              <span className="pet-emoji" aria-hidden="true">
                {speciesEmoji(petSpecies, petStage)}
                {petStage >= 3 && <span className="pet-sparkle">✨</span>}
              </span>
              <div className="pet-meta">
                <span className="pet-title">{t.petTitle} · {speciesById(petSpecies)[lang === "bn" ? "nameBn" : "name"]} · {[t.petStage0, t.petStage1, t.petStage2, t.petStage3][petStage]}</span>
                <span className="pet-bar">
                  <span className="pet-fill" style={{ width: `${Math.round(petProgress * 100)}%` }} />
                </span>
                <span className="pet-grow">{t.petGrow(petProgress)}</span>
              </div>
              <button className="pet-btn" onClick={feedPet} disabled={petFedToday || petStage >= 3}>
                {petFedToday ? t.petFedToday : t.petFeed}
              </button>
            </div>

            {/* #284 — mastery mystery box: mastering a skill earns an unopened
                box on home. Opening pays 2–5 coins (inside the daily cap —
                a full cap keeps the box for another day). Kid-safe, offline. */}
            {unclaimedBoxes.length > 0 ? (
              <div className="box-card" role="status">
                <span className="box-emoji" aria-hidden="true">🎁</span>
                <div className="box-meta">
                  <span className="box-title">{t.boxTile}</span>
                  <span className="box-hint">{t.boxHint(unclaimedBoxes.length)}</span>
                </div>
                <button
                  className="box-open"
                  onClick={() => {
                    const res = useKidStore.getState().novaOpenBox(kid.id, unclaimedBoxes.map((s) => s.id));
                    if (res.coins > 0) {
                      tada();
                      speak(t.boxRewardSpeak(kid.name, res.coins));
                    } else if (res.skillId) {
                      speak(t.boxCapSpeak);
                    }
                  }}
                >
                  {t.boxOpen}
                </button>
              </div>
            ) : null}

            {/* Secondary destinations + Nova's name-game, FOLDED away so the
                landing stays ONE action: greet → big PLAY → path → pet. Tap
                "More ▾" and everything else is still one tap away. */}
            <details className="more-menu">
              <summary>{t.moreMenu}</summary>
              <div className="play-icons">
                <button className="play-icon" onClick={() => setScreen("worlds")}>
                  <span className="play-icon-emoji" aria-hidden="true">🗺️</span>
                  <span>{t.worldsLabel}</span>
                </button>
                <button className="play-icon" onClick={goNova}>
                  <span className="play-icon-emoji" aria-hidden="true"><Icon name="nova" size={30} /></span>
                  <span>{t.novaMeet}</span>
                </button>
                <button className="play-icon" onClick={goGarden}>
                  <span className="play-icon-emoji" aria-hidden="true">🌱</span>
                  <span>{t.gardenTile}</span>
                </button>
                <button className="play-icon" onClick={goCards}>
                  <span className="play-icon-emoji" aria-hidden="true">🏆</span>
                  <span>{t.cardsTile}</span>
                </button>
                <button className="play-icon" onClick={goBadges}>
                  <span className="play-icon-emoji" aria-hidden="true">🏅</span>
                  <span>{t.badgeTile}</span>
                </button>
                <button className="play-icon" onClick={() => setScreen(kid ? "leaderboard" : "kidpick")}>
                  <span className="play-icon-emoji" aria-hidden="true">🥇</span>
                  <span>{t.lbTile}</span>
                </button>
                <button className="play-icon" onClick={() => setScreen(kid ? "castle" : "kidpick")}>
                  <span className="play-icon-emoji" aria-hidden="true">🏰</span>
                  <span>{t.castleTile}</span>
                </button>
              </div>

              {/* Nova plays with the kid's name in funny voices — pure delight,
                  zero goal. Tap each to hear your name as a robot / whisper / shout. */}
              {voiceOk && (
                <div className="funny-voices" role="group" aria-label={t.funnyTitle}>
                  <span className="funny-title">{t.funnyTitle}</span>
                  <div className="funny-btns">
                    <button className="funny-btn robot" onClick={() => speakFunny("robot")}>{t.funnyRobot}</button>
                    <button className="funny-btn whisper" onClick={() => speakFunny("whisper")}>{t.funnyWhisper}</button>
                    <button className="funny-btn shout" onClick={() => speakFunny("shout")}>{t.funnyShout}</button>
                  </div>
                </div>
              )}
            </details>

            {/* offline-first: install-to-homescreen when offered, else "works offline" */}
            {installEvt ? (
              <button className="offline-chip install-chip" onClick={installApp}>
                {t.installBtn}
              </button>
            ) : swActive ? (
              <span className="offline-chip ready" role="status">{t.offlineReady}</span>
            ) : null}
          </main>

          {/* #139 — flashcard QR scan sheet. Camera auto-starts; manual code
              entry is the offline/no-camera fallback (both launch the game). */}
          {scanOpen && (
            <div className="scan-overlay" onClick={() => { stopScanner(); setScanOpen(false); }}>
              <div className="scan-sheet" role="dialog" aria-label={t.scanTitle} onClick={(e) => e.stopPropagation()}>
                <h3 className="scan-title">📷 {t.scanTitle}</h3>
                <p className="scan-hint">{t.scanHint}</p>
                <div className="scan-stage">
                  <video ref={scanVideoRef} muted playsInline className="scan-video" />
                  <canvas ref={scanCanvasRef} className="scan-canvas" />
                  {scanError && <p className="scan-error">{scanError}</p>}
                </div>
                <div className="scan-manual">
                  <input
                    className="scan-input"
                    value={scanCode}
                    onChange={(e) => setScanCode(e.target.value)}
                    placeholder={t.scanCodePlaceholder}
                    onKeyDown={(e) => { if (e.key === "Enter") launchCardCode(scanCode); }}
                  />
                  <button className="scan-go" onClick={() => launchCardCode(scanCode)}>{t.scanLaunch}</button>
                </div>
                <button className="scan-close" onClick={() => { stopScanner(); setScanOpen(false); }}>
                  {t.scanClose}
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }
    // No active kid → fall through to the picker (below) so a blank screen
    // never appears.
  }

  if (screen === "settings") {
    // 🔐 Kid-facing Settings = KID controls ONLY (sound, screen, language,
    // learning). Parent territory — portal, per-kid analytics, sign-out,
    // aggregate insights — lives in the PARENT AREA behind goParent() (→ the
    // parent gate when signed out). No kid should see a parent thing here.
    const neuralOn = isNeuralReady();
    const curSpk = getNeuralSpeaker();
    const spkVoice = NEURAL_VOICES.find((v) => v.id === curSpk);
    const spkLabel = spkVoice
      ? spkVoice.key === "female"
        ? t.voicePickFemale
        : spkVoice.key === "kid"
          ? t.voicePickKid
          : spkVoice.key === "soft"
            ? t.voicePickSoft
            : t.voicePickWarm
      : t.voicePickWarm;
    const voiceLine = neuralOn
      ? t.settingsVoiceNeural(spkLabel)
      : tts && tts.available
        ? tts.bnPick
          ? t.settingsVoiceOk(tts.bnPick)
          : tts.enPick
            ? t.settingsVoiceOk(tts.enPick)
            : t.settingsVoiceNone
        : t.settingsVoiceNone;
    // Parent controls land on this screen as immutable rules: when the parent
    // switched reading/music off for this profile, the kid sees WHY the
    // control is stuck off — never a way to flip it back on.
    const readingOff = settings.tts_enabled === false;
    const musicLocked = settings.music_enabled === false;
    const syncLine =
      syncState === "ok"
        ? t.settingsSyncOk
        : syncState === "syncing"
          ? t.settingsSyncWorking
          : syncState === "offline"
            ? t.settingsSyncOffline
            : syncState === "error"
              ? t.settingsSyncError
              : t.settingsSyncIdle;
    return (
      <div className="app">
        <main className="screen worlds parent-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>⚙️ {t.settingsTitle}</h2>
              <p className="head-sub">{t.settingsSub}</p>
            </div>
          </header>

          {/* 🔊 Sound & voice — how the app sounds, and which voice reads. */}
          <h3 className="settings-sec">{t.settingsSecSound}</h3>
          <div className="parent-card settings-card">
            <div className="settings-row-line">
              <span className="settings-row-icon">🎵</span>
              <span className="settings-row-label">{t.settingsMusicRow}</span>
              <button
                className={`switch${muted ? "" : " on"}`}
                role="switch"
                aria-checked={!muted}
                aria-label={t.settingsMusicRow}
                disabled={musicLocked}
                onClick={() => {
                  const next = toggleMusicMute();
                  setMuted(next);
                  announce(next ? t.a11yMusicOff : t.a11yMusicOn); // #133
                }}
              >
                <span className="switch-thumb" />
              </button>
            </div>
            {musicLocked && <p className="settings-voice-note warn">{t.settingsMusicOff}</p>}

            <div className="settings-divider" />

            <div className="settings-voice">
              <div className="settings-row-line">
                <span className="settings-row-icon">🗣️</span>
                <span className="settings-row-label">{t.settingsVoice}</span>
                {neuralOn && (
                  <span className="settings-voice-badge" title={t.settingsVoiceNeural(spkLabel)}>🧠</span>
                )}
              </div>
              {readingOff ? (
                <p className="settings-voice-note warn">{t.settingsReadingOff}</p>
              ) : (
                <>
                  <p className="settings-voice-status">{voiceLine}</p>
                  {neural.state === "loading" && !neuralOn && (
                    <p className="settings-voice-note">{t.settingsVoiceDownload(Math.round(neural.progress * 100))}</p>
                  )}
                  <button
                    className="ghost-btn mini voice-test-btn"
                    onClick={() => {
                      setTts(speechReadiness());
                      speak(lang === "bn" ? "এক দুই তিন — এইটা একটা পরীক্ষা।" : "One two three — this is a test line.", { lang: lang === "bn" ? "bn" : "en" });
                    }}
                  >
                    🔊 {t.settingsVoiceTest}
                  </button>
                  {neuralOn && (
                    <div className="voice-picker">
                      <div className="voice-picker-head">
                        <span>{t.voicePickTitle}</span>
                        <span className="voice-picker-hint">{t.voicePickHint}</span>
                      </div>
                      <div className="voice-picker-rows">
                        {NEURAL_VOICES.map((v) => {
                          const active = curSpk === v.id;
                          const label =
                            v.key === "female"
                              ? t.voicePickFemale
                              : v.key === "kid"
                                ? t.voicePickKid
                                : v.key === "soft"
                                  ? t.voicePickSoft
                                  : t.voicePickWarm;
                          return (
                            <div key={v.id} className={`voice-pick-row${active ? " active" : ""}`}>
                              <button
                                className="voice-pick-select"
                                onClick={() => {
                                  setNeuralSpeaker(v.id);
                                  setTts(speechReadiness());
                                }}
                                aria-pressed={active}
                              >
                                {active ? "✓ " : ""}
                                {label}
                              </button>
                              <button
                                className="voice-pick-listen"
                                aria-label={`${t.voicePickListen} · ${label}`}
                                onClick={() => {
                                  void neuralSpeak("আমি তোমার বন্ধু — চলো একসাথে খেলি!", { speaker: v.id });
                                }}
                              >
                                🔈
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {settings.voice_record_enabled && (
              <>
                <div className="settings-divider" />
                {/* #138 — kid dictation: record own voice + replay. On-device only. */}
                <div className="settings-voice">
                  <div className="settings-row-line">
                    <span className="settings-row-icon">🎙️</span>
                    <span className="settings-row-label">{t.settingsDictate}</span>
                  </div>
                  <p className="settings-voice-status">{t.settingsDictateSub}</p>
                  <div className="dictate-row">
                    <button
                      className={`ghost-btn mini voice-test-btn${recState === "recording" ? " recording" : ""}`}
                      onClick={() => void handleDictate()}
                    >
                      {recState === "recording" ? t.settingsDictateStop : t.settingsDictateStart}
                    </button>
                    {recState === "denied" && <p className="settings-voice-note warn">{t.settingsDictateDenied}</p>}
                    {recState === "unsupported" && <p className="settings-voice-note warn">{t.settingsDictateUnsupported}</p>}
                    {recUrl && (
                      <>
                        <audio ref={recAudioRef} src={recUrl} controls className="dictate-audio" preload="metadata" />
                        <button className="ghost-btn mini" onClick={() => setRecUrl(null)}>{t.settingsDictateClear}</button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 🖥️ Screen — how the app fills the device. */}
          <h3 className="settings-sec">{t.settingsSecScreen}</h3>
          <div className="parent-card settings-card">
            {fsSupported() && (
              <div className="settings-row-line">
                <span className="settings-row-icon">⛶</span>
                <span className="settings-row-label">{t.fullscreen}</span>
                <button
                  className={`switch${fsActive ? " on" : ""}`}
                  role="switch"
                  aria-checked={fsActive}
                  aria-label={t.fullscreen}
                  onClick={toggleFs}
                >
                  <span className="switch-thumb" />
                </button>
              </div>
            )}
            {installEvt && (
              <button className="ghost-btn mini settings-install-btn" onClick={installApp}>
                📲 {t.install}
              </button>
            )}
            {/* 🎬 Reduced motion — off for kids who find motion overwhelming. */}
            <div className="settings-row-line">
              <span className="settings-row-icon">🦋</span>
              <span className="settings-row-label">{t.settingsReduceMotion}</span>
              <button
                className={`switch${reduceMotion ? " on" : ""}`}
                role="switch"
                aria-checked={reduceMotion}
                aria-label={t.settingsReduceMotion}
                onClick={() => {
                  const next = !reduceMotion;
                  setReduceMotion(next);
                  setReducedMotion(next);
                }}
              >
                <span className="switch-thumb" />
              </button>
            </div>
            {/* #136 — classroom projector: big, bright type for a big screen. */}
            <div className="settings-row-line">
              <span className="settings-row-icon">📽️</span>
              <span className="settings-row-label">
                <span>{t.projectorToggle}</span>
                <span className="settings-row-sub">{t.projectorToggleSub}</span>
              </span>
              <button
                className={`switch${projector ? " on" : ""}`}
                role="switch"
                aria-checked={projector}
                aria-label={t.projectorToggle}
                onClick={() => {
                  const next = !projector;
                  setProjector(next);
                  announce(next ? t.projectorOn : t.projectorOff); // #133
                  if (next) requestFullscreen();
                  else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
                }}
              >
                <span className="switch-thumb" />
              </button>
            </div>
            {projector && <p className="settings-voice-note">🎹 {t.projectorKeyHint}</p>}
          </div>

          {/* 🌐 Language — two big pills, the current one is unmistakable. */}
          <h3 className="settings-sec">{t.settingsSecLanguage}</h3>
          <div className="parent-card settings-card settings-lang-card">
            <div className="settings-lang-pills">
              <button
                className={`settings-lang-pill${lang === "en" ? " active" : ""}`}
                onClick={() => setLang("en")}
                aria-pressed={lang === "en"}
              >
                English
              </button>
              <button
                className={`settings-lang-pill${lang === "bn" ? " active" : ""}`}
                onClick={() => setLang("bn")}
                aria-pressed={lang === "bn"}
              >
                বাংলা
              </button>
            </div>
          </div>

          {/* 📚 My learning — the syllabus is one tap away, plus a friendly
              line about where progress is kept. */}
          <h3 className="settings-sec">{t.settingsSecLearning}</h3>
          <div className="parent-card settings-card">
            <button
              className="ghost-btn full-syllabus-btn"
              onClick={() => {
                setSylBand(1);
                setScreen("syllabus");
              }}
            >
              {t.settingsSyllabus}
            </button>
            <p className="syllabus-settings-sub">{t.syllabusSub}</p>
            <div className={`settings-sync settings-sync-${syncState}`}>
              <span className="settings-sync-dot" />
              <span className="settings-sync-text">{syncLine}</span>
              {storyPending > 0 && <span className="sync-pill-count">📚 {storyPending}</span>}
            </div>
            {storyPending >= 20 && (
              <p className="story-queue-note" role="status">{t.storyQueueNote(storyPending)}</p>
            )}
          </div>

          {/* 👨‍👩‍👧 For parents — grown-ups only, behind the parent gate.
              Signed in → straight to the panel; signed out → sign in first.
              A kid tapping this gets the gate, never the analytics. */}
          <h3 className="settings-sec settings-sec-parents">{t.settingsSecParents}</h3>
          <div className="parent-card settings-card settings-parents-card">
            <p className="settings-voice-note">{t.settingsParentsHint}</p>
            <button className="big-btn settings-parents-btn" onClick={goParent}>
              {hasParentSession() ? t.settingsParentsGo : t.settingsParentsSignin}
            </button>
          </div>

          <p className="settings-footer">
            {t.settingsAboutSub} · {APP_VERSION} · {APP_BUILD.split(" · ")[0]}
          </p>
        </main>
      </div>
    );
  }
  if (screen === "parent") {
    // ONE parent page: signed in → the full panel; signed out → the sign-in
    // form INLINE (there is no separate "parent gate" page anymore). A kid who
    // taps "For parents" gets this login form, never any parent data.
    const signedIn = hasParentSession();
    if (!signedIn) {
      const valid = gateMode === "in" ? gateEmail.trim().length > 0 && gatePass.length > 0 : gateName.trim().length > 0 && gateEmail.trim().length > 0 && gatePass.length >= 6;
      return (
        <div className="app">
          <main className="screen worlds parent-screen gate-screen">
            <header className="screen-head">
              <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
              <div className="head-title">
                <h2>{t.parentTitle}</h2>
                <p className="head-sub">{t.parentSub}</p>
              </div>
            </header>
            <div className="gate-card">
              <div className="gate-logo" aria-hidden>🔢</div>
              <h2 className="gate-title">{t.settingsSecParents}</h2>
              <p className="gate-sub">{t.settingsParentsHint}</p>

              {googleEnabled() && (
                <>
                  <div className="gate-google">
                    <GoogleSignIn onToken={(tok) => void submitGoogle(tok)} disabled={gateBusy} fallbackText={t.gateGoogleGone} lang={lang} />
                  </div>
                  <div className="gate-or"><span>{t.gateGoogleOr}</span></div>
                </>
              )}

              <div className="gate-tabs" role="tablist">
                <button role="tab" aria-selected={gateMode === "in"} className={`gate-tab${gateMode === "in" ? " active" : ""}`} onClick={() => { setGateMode("in"); setGateError(null); }}>
                  {t.gateSignin}
                </button>
                <button role="tab" aria-selected={gateMode === "up"} className={`gate-tab${gateMode === "up" ? " active" : ""}`} onClick={() => { setGateMode("up"); setGateError(null); }}>
                  {t.gateSignup}
                </button>
              </div>

              <div className="gate-form">
                {gateMode === "up" && (
                  <label className="form-label">{t.gateNameLabel}
                    <input className="input-field" type="text" value={gateName} maxLength={30} placeholder={t.gateNamePh} autoFocus enterKeyHint="next"
                      onChange={(e) => setGateName(e.target.value)} />
                  </label>
                )}
                <label className="form-label">{t.gateEmailLabel}
                  <input className="input-field" type="email" inputMode="email" autoComplete="email" value={gateEmail} placeholder={t.gateEmailPh} autoFocus={gateMode === "in"} enterKeyHint="next"
                    onChange={(e) => setGateEmail(e.target.value)} />
                </label>
                <label className="form-label">{t.gatePassLabel}
                  <span className="pass-wrap">
                    <input className="input-field pass-input" type={gateShowPass ? "text" : "password"} autoComplete={gateMode === "in" ? "current-password" : "new-password"} value={gatePass} placeholder={t.gatePassPh} enterKeyHint="go"
                      onChange={(e) => setGatePass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && valid && !gateBusy) void submitGate(); }} />
                    <button type="button" className="pass-toggle" aria-label={t.gateShowPass} aria-pressed={gateShowPass}
                      onClick={() => setGateShowPass((v) => !v)}>
                      {gateShowPass ? "🙈" : "👁️"}
                    </button>
                  </span>
                  {gateMode === "up" && (
                    <span className={`pass-hint${gatePass.length >= 6 ? " ok" : ""}`} role="status">
                      {gatePass.length >= 6 ? t.gatePassOk : t.gatePassHint}
                    </span>
                  )}
                </label>

                {gateError && <p className="gate-error" role="alert">{gateError}</p>}

                <button className="big-btn gate-submit" disabled={!valid || gateBusy} onClick={() => void submitGate()}>
                  {gateBusy ? t.gateBusy : gateMode === "in" ? t.gateSubmitIn : t.gateSubmitUp}
                </button>
              </div>

              <div className="gate-guest">
                <button className="ghost-btn" onClick={enterAsGuest}>{t.gateGuest}</button>
                <p className="gate-guest-sub">{t.gateGuestSub}</p>
              </div>

              <button className="welcome-syllabus-link gate-syllabus-link" onClick={goSyllabus}>
                {t.welcomeSyllabus}
              </button>
              <p className="gate-privacy">{t.gatePrivacy}</p>
            </div>
          </main>
        </div>
      );
    }
    // 🔐 PIN gate (#86): a signed-in parent proves a 4-digit PIN before the
    // panel — mandatory first-time setup, 3-strike lockout, sign-out recovery.
    // Enforced HERE so EVERY path to the panel (goParent, a fresh sign-in, a
    // session restore) passes through it; there is no bypass path.
    const pinRequired = hasParentPin() && !pinOk;
    if (!hasParentPin() || pinMode === "change" || pinRequired) {
      let pinTitle = t.pinTitle;
      let pinSub = t.pinUnlockSub;
      if (pinLocked) {
        pinTitle = t.pinLocked;
        pinSub = t.pinLockedSub;
      } else if (!hasParentPin()) {
        // first-time setup — this device has no PIN yet
        pinTitle = pinStep === "confirm" ? t.pinConfirmTitle : t.pinSetTitle;
        pinSub = pinStep === "confirm" ? t.pinConfirmSub : t.pinSetSub;
      } else if (pinMode === "change") {
        pinTitle = pinStep === "new" ? t.pinNewTitle : pinStep === "confirm" ? t.pinConfirmTitle : t.pinChangeTitle;
        pinSub = pinStep === "new" ? t.pinSetSub : pinStep === "confirm" ? t.pinConfirmSub : t.pinChangeSub;
      }
      return (
        <div className="app">
          <main className="screen worlds parent-screen">
            <header className="screen-head">
              <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
              <div className="head-title">
                <h2>{t.parentTitle}</h2>
                <p className="head-sub">{t.parentSub}</p>
              </div>
            </header>
            <div className="gate-card pin-card">
              <div className="gate-logo" aria-hidden>🔒</div>
              <h2 className="gate-title">{pinTitle}</h2>
              <p className="gate-sub">{pinSub}</p>

              {/* 4 digit dots */}
              <div className="pin-dots" role="status" aria-label={`${pinDigits.length}/4`}>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`pin-dot${i < pinDigits.length ? " filled" : ""}`} />
                ))}
              </div>

              {pinError && <p className="gate-error" role="alert">{pinError}</p>}

              {/* keypad — hidden once the pad locks (3 wrong tries in unlock) */}
              {!pinLocked && (
                <div className="pin-pad">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                    <button key={d} className="pin-key" onClick={() => appendPinDigit(d)}>{d}</button>
                  ))}
                  <span className="pin-key pin-key-spacer" aria-hidden />
                  <button className="pin-key" onClick={() => appendPinDigit("0")}>0</button>
                  <button className="pin-key pin-key-back" aria-label="⌫" onClick={() => { setPinDigits((v) => v.slice(0, -1)); setPinError(null); }}>⌫</button>
                </div>
              )}

              {/* recovery: forgot PIN / locked pad → reset lock + sign out.
                  Only on the unlock pad (setup has no PIN to forget yet). */}
              {hasParentPin() && pinMode === "unlock" && (
                <div className="pin-recovery">
                  <button className="syllabus-banner-link" onClick={pinForgot}>
                    {pinForgotArmed ? t.pinResetArmed : t.pinForgot}
                  </button>
                  <p className="gate-guest-sub">{t.pinForgotSub}</p>
                </div>
              )}

              <p className="gate-privacy">{t.pinKeep}</p>
            </div>
          </main>
        </div>
      );
    }
    // Signed in → the full parent panel.
    const activeId = parentKidId && kids.some((k) => k.id === parentKidId) ? parentKidId : (kid?.id ?? kids[0]?.id ?? null);
    const activeKid = kids.find((k) => k.id === activeId);
    const pBandName = (b: Band) => (lang === "bn" ? b.titleBn ?? b.title : b.title);
    const famStars = kids.reduce((sum, k) => sum + (stats[k.id]?.stars ?? 0), 0);
    const famPoints = kids.reduce((sum, k) => sum + (stats[k.id]?.score ?? 0), 0);
    const famSessions = kids.reduce((sum, k) => sum + (stats[k.id]?.sessions ?? 0), 0);
    const famMastered = kids.reduce((sum, k) => sum + totalMastered(skillsMap, k.id), 0);
    const PARENT_PORTAL = "/parent/"; // full Next.js portal (same origin)
    return (
      <div className="app">
        <main className="screen worlds parent-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>{t.parentTitle}</h2>
              <p className="head-sub">{t.parentSub}</p>
            </div>
            {signedIn && (
              <a
                className="parent-portal-quick"
                href={PARENT_PORTAL}
                aria-label={t.parentPortalTitle}
                title={t.parentPortalTitle}
              >
                🖥️
              </a>
            )}
          </header>

          {kids.length === 0 ? (
            <p className="note">{t.pickProfile}</p>
          ) : (
            <>
              {/* ── Family summary hero: how the whole household is doing ── */}
              <section className="parent-hero">
                <div className="parent-hero-top">
                  <span className="parent-hello">{t.parentWelcome(signedIn ? (parentName() ?? "Parent") : "Family")}</span>
                  <span className="parent-hero-sub">{t.parentFamTitle}</span>
                </div>
                <div className="family-tiles">
                  <div className="fam-tile"><span className="fam-num">{kids.length}</span><span className="fam-label">{t.parentFamKids(kids.length)}</span></div>
                  <div className="fam-tile"><span className="fam-num">⭐ {famStars}</span><span className="fam-label">{t.parentFamStars(famStars)}</span></div>
                  <div className="fam-tile"><span className="fam-num">🧠 {famPoints}</span><span className="fam-label">{t.parentFamPoints(famPoints)}</span></div>
                  <div className="fam-tile"><span className="fam-num">🏆 {famMastered}</span><span className="fam-label">{t.parentFamMastered(famMastered)}</span></div>
                </div>
              </section>

              {/* ── The full Parent Portal door — always one tap away.
                  This panel is only reachable with a parent session (see
                  goParent + the access-control effect), so the portal is
                  always one tap straight through — same tab, PWA-safe. */}
              <a className="parent-card parent-portal-card" href={PARENT_PORTAL}>
                <div className="parent-head">
                  <span className="parent-name">{t.parentPortalTitle}</span>
                  <span className="parent-stats">{t.parentFamSessions(famSessions)}</span>
                </div>
                <p className="syllabus-settings-sub">{t.parentPortalSub}</p>
                <span className="big-btn parent-portal-btn">{t.parentPortalCta}</span>
              </a>

              {/* ── Sign out of the parent account (device only — progress stays) ── */}
              <div className="parent-card settings-signout-card">
                <div className="parent-head">
                  <span className="parent-name">{t.parentSignoutTitle}</span>
                  <span className="parent-stats">{(parentName() ?? "").slice(0, 1)}</span>
                </div>
                <p className="syllabus-settings-sub">{t.parentSignoutSub}</p>
                <button
                  className={`big-btn settings-signout-btn${signoutArmed ? " armed" : ""}`}
                  onClick={signOut}
                >
                  {signoutArmed ? t.parentSignoutConfirm : t.parentSignoutCta}
                </button>
              </div>

              {/* ── PIN lock (#86) — change the 4-digit parent-area PIN. Only
                  reachable from the panel, which is itself behind the PIN. */}
              <div className="parent-card settings-signout-card pin-lock-card">
                <div className="parent-head">
                  <span className="parent-name">{t.pinLockCardTitle}</span>
                  <span className="parent-stats">🔑</span>
                </div>
                <p className="syllabus-settings-sub">{t.pinLockCardSub}</p>
                <button
                  className="big-btn settings-signout-btn pin-lock-btn"
                  onClick={() => { pinNewFlow("change"); }}
                >
                  {t.pinChange}
                </button>
              </div>

              {/* ── Child picker: tap an avatar to switch whose analytics you see.
                  #351 — full keyboard support: only the selected chip is in tab
                  order, and ←/→ (or ↑/↓) + Home/End move focus AND selection. */}
              <div
                className="parent-picker"
                role="tablist"
                aria-label={t.parentTitle}
                onKeyDown={(e) => {
                  if (kids.length < 2) return;
                  const idx = kids.findIndex((k) => k.id === activeId);
                  const move = (nextIdx: number) => {
                    const next = kids[(nextIdx + kids.length) % kids.length];
                    setParentKidId(next.id);
                    parentChipRefs.current.get(next.id)?.focus();
                  };
                  switch (e.key) {
                    case "ArrowRight":
                    case "ArrowDown":
                      e.preventDefault();
                      move(idx + 1);
                      break;
                    case "ArrowLeft":
                    case "ArrowUp":
                      e.preventDefault();
                      move(idx - 1);
                      break;
                    case "Home":
                      e.preventDefault();
                      move(0);
                      break;
                    case "End":
                      e.preventDefault();
                      move(kids.length - 1);
                      break;
                  }
                }}
              >
                {kids.map((k) => {
                  const selected = k.id === activeId;
                  const st = stats[k.id];
                  const kidTotal = filterSkills.filter((s) => s.game).length;
                  const kidMastered = totalMastered(skillsMap, k.id);
                  return (
                    <button
                      key={k.id}
                      role="tab"
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      ref={(el) => {
                        if (el) parentChipRefs.current.set(k.id, el);
                        else parentChipRefs.current.delete(k.id);
                      }}
                      className={`parent-chip${selected ? " selected" : ""}`}
                      onClick={() => setParentKidId(k.id)}
                    >
                      <span className="chip-avatar"><AvatarIcon emoji={k.avatar} size={18} /></span>
                      <span className="chip-meta">
                        <span className="chip-name">{k.name}</span>
                        <span className="chip-stars">⭐ {st?.stars ?? 0}</span>
                        <span className="chip-progress">
                          <span className="chip-progress-fill" style={{ width: `${kidTotal ? Math.round((kidMastered / kidTotal) * 100) : 0}%` }} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeKid && (
                <div className="parent-list">
                  <div className="parent-card">
                    <div className="parent-head">
                      <span className="world-emoji"><AvatarIcon emoji={activeKid.avatar} size={40} /></span>
                      <span className="parent-name">{activeKid.name}</span>
                      <span className="parent-stats">
                        ⭐ {stats[activeKid.id]?.stars ?? 0} · 🧠 {stats[activeKid.id]?.score ?? 0} · 🕹 {stats[activeKid.id]?.sessions ?? 0}
                      </span>
                    </div>
                    <div className="parent-progress">
                      <div className="progress-bar big">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${
                              filterSkills.filter((s) => s.game).length
                                ? Math.round((totalMastered(skillsMap, activeKid.id) / filterSkills.filter((s) => s.game).length) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="parent-sub">
                        {totalMastered(skillsMap, activeKid.id)}/{filterSkills.filter((s) => s.game).length} · {t.starsTotal(stats[activeKid.id]?.stars ?? 0)} · {t.points(stats[activeKid.id]?.score ?? 0)} · {t.sessions(stats[activeKid.id]?.sessions ?? 0)}
                      </span>
                    </div>
                    <div className="world-progress-card">
                      {BANDS.map((b) => {
                        const p = worldProgress(skillsMap, activeKid.id, b.id);
                        return (
                          <div key={b.key} className="parent-world">
                            <span className="world-emoji small"><Icon name={b.key} size={20} /></span>
                            <span className="parent-world-name">{pBandName(b)}</span>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${p.pct}%` }} />
                            </div>
                            <span className="parent-world-pct">{p.mastered}/{p.total}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* 🧠 MONI — the tiny tutor's insight card (only after real play) */}
                    {(() => {
                      const mp = useKidStore.getState().moni?.[activeKid.id];
                      if (!mp || mp.totalRounds < 4) return null;
                      const styleWords = (s: string) => {
                        const sb: Record<string, string> = {
                          gentle: t.moniConfidenceGentle,
                          steady: t.moniConfidenceSteady,
                          challenging: t.moniConfidenceChallenging,
                        };
                        return sb[s] ?? t.moniConfidenceSteady;
                      };
                      const trendWord = mp.trend === 1 ? t.moniTrendUp : mp.trend === -1 ? t.moniTrendDown : t.moniTrendFlat;
                      const mis = mp.misconceptions?.length
                        ? mp.misconceptions.map((m) => m.label).join(", ")
                        : t.moniMisconceptionsNone;
                      const style = mp.style.speedTendency > 0.65 ? "fast ⚡" : mp.style.speedTendency < 0.35 ? "careful 🐢" : "balanced ⚖️";
                      const focusMs = mp.attention.fatigueThreshold ? `~${mp.attention.fatigueThreshold} ${lang === "bn" ? "রাউন্ড" : "rounds"}` : "—";
                      const pace = mp.confidence.fragile
                        ? t.moniConfidenceGentle
                        : mp.confidence.recoveryRate > 0.7 && mp.style.speedTendency > 0.6
                          ? t.moniConfidenceChallenging
                          : t.moniConfidenceSteady;
                      return (
                        <details className="parent-help moni-card" open>
                          <summary>🧠 {t.moniTitle}</summary>
                          <p className="moni-tag">{t.moniTag}</p>
                          {/* 🎚️ #333 parent-adjustable strictness — how hard Moni
                              pushes this kid. Persists offline; plan() tone +
                              difficulty follow instantly. */}
                          <div className="moni-strictness">
                            <span className="moni-strictness-label">{t.moniStrictness}</span>
                            <div className="moni-strictness-options" role="group" aria-label={t.moniStrictness}>
                              {(["gentle", "steady", "challenging"] as const).map((opt) => {
                                const cur = useKidStore.getState().moniStrictness?.[activeKid.id] ?? "steady";
                                const label =
                                  opt === "gentle"
                                    ? t.moniStrictnessGentle
                                    : opt === "steady"
                                      ? t.moniStrictnessSteady
                                      : t.moniStrictnessChallenging;
                                return (
                                  <button
                                    key={opt}
                                    className={`moni-strictness-opt${cur === opt ? " active" : ""}`}
                                    aria-pressed={cur === opt}
                                    onClick={() => useKidStore.getState().setMoniStrictness(activeKid.id, opt)}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="moni-strictness-help">{t.moniStrictnessHelp}</p>
                          </div>
                          <div className="moni-grid">
                            <div className="moni-cell">
                              <span className="moni-k">{t.moniLearnStyle}</span>
                              <span className="moni-v">{style}</span>
                            </div>
                            <div className="moni-cell">
                              <span className="moni-k">{t.moniAttention}</span>
                              <span className="moni-v">{focusMs}</span>
                            </div>
                            <div className="moni-cell">
                              <span className="moni-k">{t.moniSessionLength}</span>
                              <span className="moni-v">
                                ~{moniPlanFor(activeKid.id)?.sessionLengthHint ?? mp.attention.fatigueThreshold ?? 12}{" "}
                                {lang === "bn" ? "রাউন্ড" : "rounds"}
                              </span>
                            </div>
                            <div className="moni-cell">
                              <span className="moni-k">{t.moniConfidence}</span>
                              <span className="moni-v">{pace}</span>
                            </div>
                            <div className="moni-cell">
                              <span className="moni-k">{t.moniBestGame}</span>
                              <span className="moni-v">{mp.style.bestGame ?? "—"}</span>
                            </div>
                            <div className="moni-cell">
                              <span className="moni-k">{t.moniSessions(mp.sessions)}</span>
                              <span className="moni-v">{t.moniRounds(mp.totalRounds)} · {trendWord}</span>
                            </div>
                            <div className="moni-cell">
                              <span className="moni-k">{t.moniMisconceptions}</span>
                              <span className="moni-v">{mis}</span>
                            </div>
                          </div>
                          {/* 🎯 MONI's top-3 practice goals — the planner's focus first,
                              then weakest skills, then due reviews. Local + plain-language. */}
                          {(() => {
                            const plan = moniPlanFor(activeKid.id);
                            if (!plan || plan.recommendations.length < 2) return null;
                            const goalReason = (g: { reasonCode: "focus" | "weak" | "review"; inDays?: number }) =>
                              g.reasonCode === "focus"
                                ? t.moniGoalFocus
                                : g.reasonCode === "weak"
                                  ? t.moniGoalWeak
                                  : t.moniGoalReview(g.inDays ?? 1);
                            return (
                              <div className="moni-goals">
                                <p className="moni-goals-title">{t.moniGoals}</p>
                                <ol>
                                  {plan.recommendations.map((g) => {
                                    const gs = filterSkills.find((s) => s.id === g.skillId);
                                    return (
                                      <li key={g.skillId}>
                                        <span className="moni-goal-skill">
                                          {gs?.title ?? g.skillId}
                                          {gs?.titleBn ? <span className="skill-bn">{gs.titleBn}</span> : null}
                                        </span>
                                        <span className="moni-goal-why">{goalReason(g)}</span>
                                      </li>
                                    );
                                  })}
                                </ol>
                              </div>
                            );
                          })()}
                          {/* 📅 #326 — weekly insight strip: every read derived
                              purely from Moni's LOCAL profile — this week's
                              rounds/accuracy from recent[] timestamps, pace vs
                              the child's own lifetime accuracy, the learning
                              style badge, and their best game. No network.
                              Hidden when there's no play in the last 7 days
                              (the card never invents a week). */}
                          {(() => {
                            const WEEK_MS = 7 * 86400000;
                            const wk = mp.recent.filter((r) => r.ts >= Date.now() - WEEK_MS);
                            if (!wk.length) return null;
                            const wkCorrect = wk.filter((r) => r.correct).length;
                            const wkAcc = Math.round((wkCorrect / wk.length) * 100);
                            const lifeAcc = Math.round(mp.accuracy * 100);
                            const pace =
                              Math.abs(wkAcc - lifeAcc) <= 5
                                ? t.moniWeekPaceFlat
                                : wkAcc > lifeAcc
                                  ? t.moniWeekPaceUp
                                  : t.moniWeekPaceDown;
                            const lStyle = deriveLearningStyle(mp.style);
                            const styleLabel =
                              lStyle === "fast"
                                ? t.moniStyleFast
                                : lStyle === "social"
                                  ? t.moniStyleSocial
                                  : t.moniStyleSteady;
                            const topGame = Object.entries(mp.style.gameAffinity).sort((a, b) => b[1] - a[1])[0]?.[0];
                            const gameLabel = topGame
                              ? topGame.replace(/^game-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                              : "—";
                            return (
                              <details className="moni-week" open>
                                <summary>{t.moniWeek}</summary>
                                <div className="moni-week-grid">
                                  <div className="moni-cell">
                                    <span className="moni-k">{t.moniWeekRounds}</span>
                                    <span className="moni-v">{wk.length}</span>
                                  </div>
                                  <div className="moni-cell">
                                    <span className="moni-k">{t.moniWeekAcc}</span>
                                    <span className="moni-v">{wkAcc}%</span>
                                  </div>
                                  <div className="moni-cell">
                                    <span className="moni-k">{t.moniWeekPace}</span>
                                    <span className="moni-v">{pace}</span>
                                  </div>
                                  <div className="moni-cell">
                                    <span className="moni-k">{t.moniWeekStyle}</span>
                                    <span className="moni-v">{styleLabel}</span>
                                  </div>
                                  <div className="moni-cell">
                                    <span className="moni-k">{t.moniWeekBestGame}</span>
                                    <span className="moni-v">{gameLabel}</span>
                                  </div>
                                </div>
                              </details>
                            );
                          })()}
                          <p className="moni-next">
                            <strong>{t.moniNextMove}:</strong>{" "}
                            {mp.totalRounds >= 8 ? (
                              lang === "bn"
                                ? `${mp.weak?.[0]?.skillId ?? "শেখা চালিয়ে যাও"} · ${styleWords(mp.trend === -1 ? "gentle" : mp.trend === 1 ? "challenging" : "steady")}`
                                : `${mp.weak?.[0]?.skillId ?? "keep learning"} · ${styleWords(mp.trend === -1 ? "gentle" : mp.trend === 1 ? "challenging" : "steady")}`
                            ) : (
                              lang === "bn" ? "আরও কিছু খেলা চলুক — মনি দেখে নেবে" : "A few more games and Moni will know exactly what to do"
                            )}
                          </p>
                        </details>
                      );
                    })()}
                    {(() => {
                      // Wrong-answer ledger — skills the kid is stuck on right now
                      // (open unresolved) or has missed ≥3× and not yet mastered.
                      const struggling = strugglingSkills(skillsMap, activeKid.id, mistakes);
                      const everMissed = Object.values(mistakes).some((m) => m.wrong > 0);
                      if (!struggling.length) {
                        // Every past struggle has since been solved → reassure.
                        return everMissed ? (
                          <p className="parent-help-caught">{t.parentHelpNone}</p>
                        ) : null;
                      }
                      return (
                        <details className="parent-help" open>
                          <summary>🎯 {t.parentHelpTitle}</summary>
                          <div className="skill-list">
                            {struggling.map(({ skill, open, wrong }) => (
                              <div key={skill.id} className="skill-row">
                                <span className="skill-emoji"><Icon name={skill.subject} size={30} /></span>
                                <span className="skill-meta">
                                  <span className="skill-name">
                                    {skill.title}
                                    {skill.titleBn ? <span className="skill-bn">{skill.titleBn}</span> : null}
                                  </span>
                                </span>
                                <span className="skill-state help">
                                  {open > 0 ? t.parentHelpOpen(open) : t.parentHelpWrong(wrong)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })()}
                    {/* ❌ #78 wrong-answer history — per-day heatmap + drill-down
                        to skill. Everything is derived from the LOCAL mistakes
                        ledger (byDay buckets), so it works fully offline — no
                        network, no analytics. A 28-day grid (7×4, oldest→newest)
                        colors each day by wrong-tap intensity; tapping a day
                        lists the skills + wrong counts for that day. */}
                    <details className="parent-help mistakes-card">
                      <summary>{t.mistakesTitle}</summary>
                      <p className="syllabus-settings-sub">{t.mistakesSub}</p>
                      {(() => {
                        const days: string[] = [];
                        for (let i = 27; i >= 0; i--) days.push(dayIsoAgo(i));
                        // day → skillId → wrong taps, for THIS kid only
                        const daySkills = new Map<string, Map<string, number>>();
                        let anyWrongs = false;
                        const kidPrefix = `${activeKid.id}:`;
                        for (const [key, m] of Object.entries(mistakes)) {
                          if (!key.startsWith(kidPrefix)) continue;
                          const skillId = key.slice(kidPrefix.length);
                          for (const [day, n] of Object.entries(m.byDay ?? {})) {
                            if (n <= 0) continue;
                            anyWrongs = true;
                            let perSkill = daySkills.get(day);
                            if (!perSkill) { perSkill = new Map(); daySkills.set(day, perSkill); }
                            perSkill.set(skillId, (perSkill.get(skillId) ?? 0) + n);
                          }
                        }
                        if (!anyWrongs) return <p className="parent-help-caught">{t.mistakesEmpty}</p>;
                        const dayTotal = (day: string) => {
                          const m = daySkills.get(day);
                          return m ? [...m.values()].reduce((a, b) => a + b, 0) : 0;
                        };
                        // Selected day = the user's pick when it has wrongs, else
                        // the most recent day with any (never invent an empty day).
                        const selDay =
                          mistakeDay && daySkills.has(mistakeDay)
                            ? mistakeDay
                            : [...days].reverse().find((d) => daySkills.has(d)) ?? todayIso();
                        const level = (n: number) => (n <= 0 ? "" : n === 1 ? " lv1" : n <= 3 ? " lv2" : " lv3");
                        const drill = daySkills.has(selDay)
                          ? [...(daySkills.get(selDay) ?? new Map()).entries()]
                              .map(([skillId, wrong]) => {
                                const skill = filterSkills.find((s) => s.id === skillId);
                                return { skillId, wrong, skill: skill ?? null };
                              })
                              .sort((a, b) => b.wrong - a.wrong)
                          : [];
                        return (
                          <>
                            <p className="mistakes-heat-title">{t.mistakesHeatTitle}</p>
                            <div className="mistakes-weekdays" aria-hidden>{t.mistakesWeekday}</div>
                            <div className="mistakes-heat" role="grid" aria-label={t.mistakesHeatTitle}>
                              {days.map((day) => {
                                const n = dayTotal(day);
                                return (
                                  <button
                                    key={day}
                                    role="gridcell"
                                    aria-selected={day === selDay}
                                    className={`mistakes-cell${level(n)}${day === selDay ? " selected" : ""}`}
                                    onClick={() => setMistakeDay(day)}
                                    aria-label={`${day} — ${n} ${n === 1 ? "wrong" : "wrongs"}`}
                                    title={`${day} — ${n}`}
                                  />
                                );
                              })}
                            </div>
                            <p className="mistakes-day-label" role="status">{t.mistakesDayLabel(selDay, dayTotal(selDay))}</p>
                            {drill.length === 0 ? (
                              <p className="parent-help-caught">{t.mistakesNoneDay}</p>
                            ) : (
                              <div className="skill-list">
                                {drill.map(({ skillId, wrong, skill }) => (
                                  <div key={skillId} className="skill-row">
                                    <span className="skill-emoji"><Icon name={skill?.subject ?? "math"} size={30} /></span>
                                    <span className="skill-meta">
                                      <span className="skill-name">
                                        {skill?.title ?? skillId}
                                        {skill?.titleBn ? <span className="skill-bn">{skill.titleBn}</span> : null}
                                      </span>
                                    </span>
                                    <span className="skill-state help">{t.mistakesSkillWrong(wrong)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </details>
                    {/* 📚 #322 — KOTHA story inspector — the per-kid learning
                        story log (offline mirror of learning_stories): what was
                        tried, how Moni read it, what we did. Own card so the
                        parent can dig into the diagnostic detail without
                        crowding the "needs help" list. */}
                    <StoryInspector
                      stories={kothaStories.filter((st) => st.kidId === activeKid.id).sort((a, b) => b.ts - a.ts)}
                      t={t}
                      lang={lang}
                    />
                    <button className="ghost-btn mini share-progress-btn" onClick={() => void shareProgress(activeKid)}>
                      {t.shareProgress}
                    </button>
                    <button className="ghost-btn mini share-progress-btn" onClick={() => downloadWeekDigest(activeKid)}>
                      {t.digestBtn}
                    </button>
                    {shareMsg && <p className="share-feedback" role="status">{shareMsg}</p>}
                    <details className="parent-skills">
                      <summary>{t.parentSkills}</summary>
                      <div className="skill-list">
                        {filterSkills.filter((s) => s.game).map((skill) => {
                          const ms = skillsMap[`${activeKid.id}:${skill.id}`];
                          const pct = ms ? Math.round(ms.pMastered * 100) : 0;
                          const mastered = pct >= MASTERY_THRESHOLD * 100;
                          return (
                            <div key={skill.id} className="skill-row">
                              <span className="skill-emoji"><Icon name={skill.subject} size={30} /></span>
                              <span className="skill-meta">
                                <span className="skill-name">
                                  {skill.title}
                                  {skill.titleBn ? <span className="skill-bn">{skill.titleBn}</span> : null}
                                </span>
                                <div className="skill-bar">
                                  <div className={`skill-fill${mastered ? " done" : ""}`} style={{ width: `${pct}%` }} />
                                </div>
                              </span>
                              <span className="skill-state">
                                {mastered ? `✓ ${t.mastered}` : pct > 0 ? `${pct}%` : t.notStarted}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                </div>
              )}
            </>
          )}
          {/* This panel is grown-ups-only (session required to enter), so the
              old guest-upgrade card is gone — a parent is always signed in
              here. */}
          <VoiceCheck t={t} />
          <button className="ghost-btn" onClick={() => setScreen("settings")}>
            ⚙️ {t.settingsTitle}
          </button>
          <p className="build-stamp">Numberverse · v{APP_VERSION}</p>
        </main>
      </div>
    );
  }

  /* #282 — same-device sibling leaderboard: offline, privacy-safe (only kids
     on THIS device are compared; nothing leaves the phone). Ranked by mastery,
     each row still shows the per-kid totals so nobody's progress is hidden. */
  if (screen === "leaderboard") {
    const rows = kids
      .map((k) => {
        const st = useKidStore.getState().stats[k.id] ?? { stars: 0, score: 0, sessions: 0 };
        return { kid: k, mastery: totalMastered(skillsMap, k.id), rounds: st.sessions, stars: st.stars };
      })
      .sort((a, b) => b.mastery - a.mastery || b.stars - a.stars || a.kid.name.localeCompare(b.kid.name));
    return (
      <div className="app">
        <main className="screen lb-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>{t.lbTitle}</h2>
              <p className="head-sub">{t.lbSub}</p>
            </div>
          </header>

          {kids.length < 2 ? (
            <div className="lb-empty">
              <span className="lb-empty-emoji" aria-hidden="true">🥇</span>
              <span className="lb-empty-text">{t.lbEmpty}</span>
              <button className="big-btn" onClick={() => setScreen("addkid")}>{t.lbAddSibling}</button>
            </div>
          ) : (
            <div className="lb-list">
              {rows.map((r, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
                const mine = kid?.id === r.kid.id;
                return (
                  <button
                    key={r.kid.id}
                    className={`lb-row${mine ? " mine" : ""}${i === 0 ? " first" : ""}`}
                    onClick={() => speak(t.lbSpeak(r.kid.name, i + 1))}
                    aria-label={`${r.kid.name} #${i + 1}`}
                  >
                    <span className="lb-medal" aria-hidden="true">{medal}</span>
                    <span className="lb-avatar"><AvatarIcon emoji={r.kid.avatar} size={40} /></span>
                    <span className="lb-meta">
                      <span className="lb-name">
                        {r.kid.name}
                        {mine && <span className="lb-you">{t.lbYou}</span>}
                      </span>
                      <span className="lb-stats">
                        <span className="lb-stat">🏅 {t.lbStatMastery} {r.mastery}</span>
                        <span className="lb-stat">🎮 {t.lbStatRounds} {r.rounds}</span>
                        <span className="lb-stat">⭐ {t.lbStatStars} {r.stars}</span>
                      </span>
                    </span>
                    <span className="lb-state">▶</span>
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (screen === "kidpick" || (screen === "home" && !kid)) {
    return (
      <div className="app">
        <main className="screen worlds">
          <header className="screen-head">
            <button
              className="icon-btn"
              onClick={() => setScreen(kids.length ? "home" : "addkid")}
              aria-label={t.back}
            >
              ‹
            </button>
            <div className="head-title">
              <h2>{t.whoPlaying}</h2>
              <p className="head-sub">{t.pickProfile}</p>
            </div>
            <button className="icon-btn" onClick={() => setScreen("leaderboard")} aria-label={t.lbTile} title={t.lbTile}>
              🥇
            </button>
          </header>
          <div className="world-list">
            {kids.map((k) => {
              const mastered = totalMastered(skillsMap, k.id);
              const worldsOpen = BANDS.filter((b) => worldUnlocked(skillsMap, k.id, b.id)).length;
              return (
                <button
                  key={k.id}
                  className={`world-card kidpick-card${kid?.id === k.id ? " active" : ""}`}
                  onClick={() => { selectKid(k); setScreen("home"); }}
                >
                  <span className="world-emoji"><AvatarIcon emoji={k.avatar} size={46} /></span>
                  <span className="world-meta">
                    <span className="world-name">{k.name}</span>
                    <span className="world-age">⭐ {t.skillsMastered(mastered)} · {t.worldsOpen(worldsOpen)}</span>
                  </span>
                  <span className="world-state">▶</span>
                </button>
              );
            })}
            <button className="world-card kidpick-card" onClick={() => setScreen("addkid")}>
              <span className="world-emoji">➕</span>
              <span className="world-meta">
                <span className="world-name">{t.addKid}</span>
                <span className="world-age">{t.upTo4}</span>
              </span>
              <span className="world-state">+</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (screen === "addkid") {
    return <AddKidForm t={t} lang={lang} onSave={addKid} onCancel={() => setScreen("kidpick")} />;
  }

  /* ── Mastery Card Album: every mastered lesson = a collectible card. ── */
  if (screen === "cards" && kid) {
    const collected = totalMastered(skillsMap, kid.id);
    const totalCards = journeyStops().length;
    const rank = rankFor(collected, lang);
    return (
      <div className="app">
        <main className="screen cards-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>🏆 {t.cardsTitle}</h2>
              <p className="head-sub">{t.cardsSub(collected, totalCards)}</p>
            </div>
            <span className="rank-chip" title={t.rankLabel}>{rank.title}</span>
            <button className="icon-btn nova-hud-btn" onClick={goNova} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
          </header>

          <div className="cards-scroll">
            {BANDS.map((band) => {
              const cards = worldCards(skillsMap, kid.id, band.id);
              const prog = worldProgress(skillsMap, kid.id, band.id);
              const complete = prog.mastered === prog.total;
              return (
                <section key={band.key} className="cards-world">
                  <div className="cards-world-head">
                    <span className="cards-world-emoji"><Icon name={complete ? "trophy" : band.key} size={20} /></span>
                    <span className="cards-world-name">{band.title}</span>
                    <span className="cards-world-count">{t.skillsProg(prog.mastered, prog.total)}</span>
                    {complete && (
                      <button className="cards-cert" onClick={() => openCert(band)} aria-label={t.certBtn} title={t.certBtn}>
                        🖨️
                      </button>
                    )}
                  </div>
                  <div className="cards-grid">
                    {cards.map((c) => {
                      const flipped = flippedCards.has(c.skill.id);
                      const title = lang === "bn" && c.skill.titleBn ? c.skill.titleBn : c.skill.title;
                      const cls = c.mastered ? "mastered" : "locked";
                      return (
                        <button
                          key={c.skill.id}
                          className={`card ${cls}${flipped ? " flipped" : ""}`}
                          onClick={() => c.mastered && toggleCard(c.skill.id)}
                          aria-label={title}
                          title={title}
                        >
                          <span className="card-inner">
                            <span
                              className="card-face card-front"
                              style={c.mastered ? { background: `linear-gradient(165deg, ${SUBJECT_CARD[c.skill.subject][0]}, ${SUBJECT_CARD[c.skill.subject][1]})` } : undefined}
                            >
                              <span className="card-emoji"><Icon name={c.skill.subject} size={38} /></span>
                              <span className="card-title">{title}</span>
                              <span className="card-stamp">
                                {c.mastered ? (
                                  <>
                                    <span className="card-star">⭐</span>
                                    <span className="card-name">{kid.name}</span>
                                  </>
                                ) : (
                                  <span className="card-lock">🔒</span>
                                )}
                              </span>
                              <span className="card-date">
                                {c.mastered && c.dateMs ? cardDate(c.dateMs, lang) : t.cardsPlayToCollect}
                              </span>
                            </span>
                            <span className="card-face card-back">
                              <span className="card-back-emoji"><Icon name={c.skill.subject} size={24} /></span>
                              <span className="card-back-title">{title}</span>
                              <span className="card-back-row">{t.cardsAccuracy(c.accuracy)}</span>
                              <span className="card-back-row">{t.cardsAttempts(c.attempts)}</span>
                              <span className="card-back-row">{t.cardsStreak(c.streak)}</span>
                              <span className="card-back-foot">{t.cardsMasteredBy(kid.name)}</span>
                              <span className="card-back-date">{c.dateMs ? cardDate(c.dateMs, lang) : ""}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {complete && (
                      <button
                        className="gold-card"
                        onClick={() => tada()}
                        aria-label={t.cardsWorldChamp(band.title)}
                        title={t.cardsWorldChamp(band.title)}
                      >
                        <span className="gold-card-shine" aria-hidden="true" />
                        <span className="gold-card-emoji" aria-hidden="true">👑</span>
                        <span className="gold-card-title">{t.cardsWorldChamp(band.title)}</span>
                        <span className="gold-card-sub">{t.cardsWorldComplete(prog.total)}</span>
                        <span className="gold-card-name">{kid.name}</span>
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  if (screen === "worlds") {
    const allComplete = BANDS.every((b) => worldUnlocked(skillsMap, kid!.id, b.id));
    const stops = journeyState(skillsMap, kid!.id);
    const doneCount = stops.filter((s) => s.done).length;
    const journeyDone = doneCount === stops.length;
    const hereIdx = journeyCurrentIndex(stops);
    const curStop = stops.find((s) => s.current);
    return (
      <div className="app">
        <main className="screen worlds">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>{kid ? <AvatarIcon emoji={kid.avatar} size={26} /> : null} {kid?.name ? t.worldsOf(kid.name) : t.worldsOf("")}</h2>
              <p className="head-sub">{mapView ? t.mapSub : journeyView ? t.journeySub : t.masterSkillsSub}</p>
            </div>
            <span className="rank-chip" title={t.rankLabel}>
              {rankFor(totalMastered(skillsMap, kid!.id), lang).title}
            </span>
            <button className="icon-btn" onClick={goTrophyRoom} aria-label={t.trTitle} title={t.trTitle}>🏆</button>
            <button className="icon-btn nova-hud-btn" onClick={goNova} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
          </header>

          {curStop ? (
            <button className="big-btn play-now" onClick={() => startSingleSkill(curStop.skill)}>
              {t.playNext(lang === "bn" ? curStop.skill.titleBn ?? curStop.skill.title : curStop.skill.title)}
            </button>
          ) : journeyDone ? (
            <button className="big-btn play-now" onClick={() => startPlayWorld(BANDS[0])}>
              {t.practiceAgain}
            </button>
          ) : null}

          <div className="view-toggle" role="tablist" aria-label="View">
            <button
              className={`view-toggle-btn${mapView ? " on" : ""}`}
              onClick={() => { setMapView(true); setJourneyView(false); }}
            >
              🗺️ {t.mapTab}
            </button>
            <button
              className={`view-toggle-btn${!mapView && journeyView ? " on" : ""}`}
              onClick={() => { setJourneyView(true); setMapView(false); }}
            >
              🛣️ {t.journey}
            </button>
            <button
              className={`view-toggle-btn${!mapView && !journeyView ? " on" : ""}`}
              onClick={() => { setJourneyView(false); setMapView(false); }}
            >
              🏘️ {t.worldsLabel}
            </button>
          </div>

          {mapView ? (
            <div className="world-map">
              {/* A winding road through all five lands — the kid's avatar sits
                  on the current land, mastered lands glow, locked ones await. */}
              <div className="map-road" aria-hidden="true">
                <span className="map-road-dot" />
                <span className="map-road-dot" />
                <span className="map-road-dot" />
                <span className="map-road-dot" />
                <span className="map-road-dot" />
              </div>
              {BANDS.map((b, i) => {
                const prog = worldProgress(skillsMap, kid!.id, b.id);
                const unlocked = worldUnlocked(skillsMap, kid!.id, b.id);
                const prev = BANDS.find((x) => x.id === b.id - 1);
                const prevProg = prev ? worldProgress(skillsMap, kid!.id, prev.id) : null;
                const needed = Math.ceil((prevProg ?? prog).total * UNLOCK_THRESHOLD);
                const more = unlocked ? 0 : Math.max(1, needed - (prevProg ?? prog).mastered);
                const complete = prog.mastered === prog.total;
                const isHere = curStop?.skill.band === b.id;
                const land = WORLD_LANDS[b.id];
                return (
                  <div key={b.key} className={`map-island-wrap${isHere ? " here" : ""}`}>
                    <button
                      className={`map-island${unlocked ? "" : " locked"}${complete ? " complete" : ""}`}
                      disabled={!unlocked}
                      onClick={() => openWorld(b)}
                      aria-label={b.title}
                      style={{ ["--c1" as string]: land.c1, ["--c2" as string]: land.c2, ["--c3" as string]: land.c3, ["--c2-22" as string]: land.c2_22 }}
                    >
                      <span className="map-island-deco" aria-hidden="true">
                        {land.deco.map((d, di) => (
                          <span key={di} className={`map-deco d${di}`} style={{ animationDelay: `${di * 0.6}s` }}>{d}</span>
                        ))}
                      </span>
                      <span className="map-island-badge">
                        {complete ? <Icon name="trophy" size={30} /> : unlocked ? <Icon name={b.key} size={30} /> : "🔒"}
                      </span>
                      <span className="map-island-meta">
                        <span className="map-island-name">
                          {lang === "bn" ? b.titleBn ?? b.title : b.title}
                          {isHere && <span className="map-here-chip">📍 {t.mapHere}</span>}
                        </span>
                        <span className="map-island-age">{t.worldAges(b.ageRange, prog.mastered, prog.total)}</span>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${prog.pct}%`, background: `linear-gradient(90deg, ${land.c2}, ${land.c3})` }} />
                        </div>
                        <span className="map-island-sub">
                          {unlocked
                            ? complete
                              ? t.worldComplete
                              : t.mapLandProg(prog.mastered, prog.total)
                            : t.masterMoreIn(more, prev?.title ?? "")}
                        </span>
                      </span>
                      <span className="map-island-num">{i + 1}</span>
                      <span className="map-island-go">{unlocked ? "▶" : "🔒"}</span>
                    </button>
                  </div>
                );
              })}
              {allComplete && <div className="badge">{t.champion}</div>}
            </div>
          ) : journeyView ? (
            <div className="journey-scroll">
              {/* Nova's position on the road */}
              <div className="journey-progress">
                <span className="journey-nova">{journeyDone ? <Icon name="trophy" size={26} /> : <Icon name="nova" size={26} />}</span>
                <span className="journey-progress-txt">
                  {journeyDone ? t.journeyDone : t.journeyProgress(doneCount, stops.length)}
                </span>
                <div className="progress-bar big">
                  <div className="progress-fill" style={{ width: `${Math.round((doneCount / stops.length) * 100)}%` }} />
                </div>
              </div>
              {journeyDone && <div className="badge">{t.champion}</div>}

              {BANDS.map((band) => {
                const bandStops = stops.filter((s) => s.skill.band === band.id);
                if (!bandStops.length) return null;
                const bandProg = worldProgress(skillsMap, kid!.id, band.id);
                const land = WORLD_LANDS[band.id];
                const bandComplete = bandProg.mastered === bandProg.total;
                const nextBand = BANDS.find((x) => x.id === band.id + 1);
                return (
                  <section key={band.key} className="journey-region">
                    <div
                      className="journey-region-head"
                      style={{ ["--c1" as string]: land.c1, ["--c2" as string]: land.c2, ["--c3" as string]: land.c3, ["--c2-22" as string]: land.c2_22 }}
                    >
                      <span className="journey-region-emoji">{bandComplete ? <Icon name="trophy" size={20} /> : <Icon name={band.key} size={20} />}</span>
                      <span className="journey-region-name">{band.title}</span>
                      <span className="journey-region-count">{t.skillsProg(bandProg.mastered, bandProg.total)}</span>
                    </div>
                    {bandComplete && nextBand && !journeyDone && (
                      <div className="journey-road-open">
                        <span className="journey-road-open-txt">{t.mapRoadOpen(nextBand.title)}</span>
                        <span className="journey-road-open-ico"><Icon name={nextBand.key} size={20} /></span>
                      </div>
                    )}
                    <div className="journey-path">
                      {bandStops.map((st) => {
                        const cls = st.done ? "done" : st.current ? "current" : st.unlocked ? "open" : "locked";
                        return (
                          <button
                            key={st.skill.id}
                            className={`j-stop ${cls}`}
                            disabled={!st.unlocked}
                            onClick={() => startSingleSkill(st.skill)}
                            aria-label={st.skill.title}
                          >
                            <span className="j-node">
                              {st.done ? "✓" : st.current ? <Icon name="nova" size={18} /> : st.unlocked ? "▶" : "🔒"}
                            </span>
                            <span className="j-card">
                              <span className="j-emoji"><Icon name={st.skill.subject} size={26} /></span>
                              <span className="j-meta">
                                <span className="j-title">{st.skill.title}</span>
                                <span className="j-sub">
                                  {st.done
                                    ? t.mastered
                                    : st.current
                                      ? t.journeyTapHint
                                      : st.unlocked
                                        ? "…"
                                        : t.journeyLocked}
                                </span>
                              </span>
                              {st.current && <span className="j-play-chip">▶</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              <p className="journey-mile">{t.journeyProgress(doneCount, stops.length)} · {hereIdx + 1}/{stops.length}</p>
            </div>
          ) : (
            <>
              <div className="world-list">
                {BANDS.map((b) => {
                  const prog = worldProgress(skillsMap, kid!.id, b.id);
                  const unlocked = worldUnlocked(skillsMap, kid!.id, b.id);
                  const prev = BANDS.find((x) => x.id === b.id - 1);
                  // To unlock THIS world, the kid must master skills in the PREVIOUS world.
                  // So the "more needed" count comes from prev's progress, not this world's.
                  const prevProg = prev ? worldProgress(skillsMap, kid!.id, prev.id) : null;
                  const needed = Math.ceil((prevProg ?? prog).total * UNLOCK_THRESHOLD);
                  const more = unlocked ? 0 : Math.max(1, needed - (prevProg ?? prog).mastered);
                  const complete = prog.mastered === prog.total;
                  const land = WORLD_LANDS[b.id];
                  return (
                    <button
                      key={b.key}
                      className={`world-card${unlocked ? "" : " locked"}${complete ? " complete" : ""}`}
                      disabled={!unlocked}
                      onClick={() => openWorld(b)}
                      style={{ ["--c1" as string]: land.c1, ["--c2" as string]: land.c2, ["--c3" as string]: land.c3 }}
                    >
                      <span className="world-emoji">{complete ? <Icon name="trophy" size={40} /> : <Icon name={b.key} size={40} />}</span>
                      <span className="world-meta">
                        <span className="world-name">{lang === "bn" ? b.titleBn ?? b.title : b.title}</span>
                        <span className="world-age">
                          {unlocked
                            ? complete
                              ? t.worldComplete
                              : t.skillsProg(prog.mastered, prog.total)
                            : t.masterMoreIn(more, prev ? (lang === "bn" ? prev.titleBn ?? prev.title : prev.title) : (lang === "bn" ? "আগের জগৎ" : "the last world"))}
                        </span>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${prog.pct}%`, background: `linear-gradient(90deg, ${land.c2}, ${land.c3})` }} />
                        </div>
                      </span>
                      <span className="world-state">{unlocked ? "▶" : "🔒"}</span>
                    </button>
                  );
                })}
              </div>
              {allComplete && <div className="badge">{t.champion}</div>}
            </>
          )}
        </main>
      </div>
    );
  }

  if (screen === "worlddetail" && world && kid) {
    const prog = worldProgress(skillsMap, kid.id, world.id);
    const bandSkills = filterSkills.filter((s) => s.band === world.id && s.game);
    const nextSkill = nextUnmasteredSkill(skillsMap, kid.id, world.id);
    const nextWorld = BANDS.find((b) => b.id === world.id + 1);
    const needed = Math.ceil(prog.total * UNLOCK_THRESHOLD);
    const moreToUnlock = Math.max(0, needed - prog.mastered);
    const land = WORLD_LANDS[world.id];
    return (
      <div className="app">
        <main className="screen worlds">
          <header
            className="screen-head worlddetail-head"
            style={{ ["--c1" as string]: land.c1, ["--c2" as string]: land.c2, ["--c3" as string]: land.c3, ["--c2-22" as string]: land.c2_22 }}
          >
            <button className="icon-btn" onClick={() => setScreen("worlds")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2><Icon name={world.key} size={26} /> {lang === "bn" ? world.titleBn ?? world.title : world.title}</h2>
              <p className="head-sub">{t.worldAges(world.ageRange, prog.mastered, prog.total)}</p>
            </div>
          </header>

          <div className="world-progress-card">
            <div className="progress-bar big">
              <div className="progress-fill" style={{ width: `${prog.pct}%` }} />
            </div>
            {prog.mastered === prog.total ? (
              <div className="badge">{t.worldComplete}</div>
            ) : nextWorld ? (
              <p className="unlock-hint">
                {moreToUnlock > 0
                  ? <>{t.masterMoreToUnlock(moreToUnlock, nextWorld.title)} <Icon name={nextWorld.key} size={18} /></>
                  : t.readyFor(nextWorld.title)}
              </p>
            ) : null}
          </div>

          <button className="big-btn" onClick={() => startPlayWorld(world)}>
            {nextSkill ? t.playNext(nextSkill.title) : t.practiceAgain}
          </button>

          <div className="skill-list">
            {bandSkills.map((skill) => {
              const st = skillsMap[`${kid.id}:${skill.id}`];
              const pct = st ? Math.round(st.pMastered * 100) : 0;
              const mastered = pct >= MASTERY_THRESHOLD * 100;
              const isNext = nextSkill?.id === skill.id;
              return (
                <button key={skill.id} className={`skill-row${isNext ? " next" : ""}`} onClick={() => startSingleSkill(skill)}>
                  <span className="skill-emoji"><Icon name={skill.subject} size={30} /></span>
                  <span className="skill-meta">
                    <span className="skill-name">
                      {skill.title}
                      {skill.titleBn ? <span className="skill-bn">{skill.titleBn}</span> : null}
                    </span>
                    <div className="skill-bar">
                      <div className={`skill-fill${mastered ? " done" : ""}`} style={{ width: `${pct}%` }} />
                    </div>
                  </span>
                  <span className="skill-state">
                    {mastered ? "✓" : isNext ? "▶" : `${pct}%`}
                  </span>
                  {isNext && <span className="next-badge">{t.nextBadge}</span>}
                </button>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  if (screen === "done" && world && kid) {
    const prog = worldProgress(skillsMap, kid.id, world.id);
    const complete = prog.mastered === prog.total;
    const nextWorld = BANDS.find((b) => b.id === world.id + 1);
    const rank = rankFor(totalMastered(skillsMap, kid.id), lang);
    // The "Next round" target — the journey's current stop after this session.
    // If the kid just mastered their skill, this is the NEW skill ahead of them;
    // if not, it's the same one (keep practicing). undefined = journey done.
    const nextStop = (() => {
      const stops = journeyState(skillsMap, kid.id);
      const idx = journeyCurrentIndex(stops);
      return idx < stops.length ? stops[idx] : undefined;
    })();
    // skills that crossed the mastery bar DURING this session → a special cheer
    const newMastered = sessionRef.current.filter(
      (s) => !masteredBeforeRef.current.has(s.skillId) && (skillsMap[`${kid.id}:${s.skillId}`]?.pMastered ?? 0) >= MASTERY_THRESHOLD
    ).length;
    // 🧠 MONI soft session hint — a measured attention dip or a sensible default.
    // Soft by design: the keep-going / play-again / home buttons stay available.
    const moniDone = useKidStore.getState().moni?.[kid.id];
    const sessionHint =
      moniPlanFor(kid.id)?.sessionLengthHint ?? moniDone?.attention.fatigueThreshold ?? 12;
    // a field of falling confetti — each piece is pure CSS, runs forever.
    // Module-level (not a hook) — see DONE_CONFETTI above.
    const confetti = DONE_CONFETTI;
    return (
      <div className="app">
        <main className="screen done-screen">
          <div className="confetti" aria-hidden="true">
            {confetti.map((p, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={{
                  left: `${p.left}%`,
                  animationDuration: `${p.dur}s`,
                  animationDelay: `${p.delay}s`,
                  background: p.color,
                  ["--drift" as string]: `${p.drift}px`,
                  ["--rot" as string]: `${p.rot}deg`,
                }}
              />
            ))}
          </div>
          <div className="mascot" role="img" aria-label="Nova celebrating">
            <Icon name="nova" size={88} />
          </div>
          <h1 className="title">{t.amazing}</h1>
          <div className="done-stars" aria-label={`${stars} stars`}>
            <CountUp value={stars} />
            <span className="gold"> ⭐</span>
          </div>
          <p className="subtitle">{t.earned(kid.avatar, kid.name, stars, score, lang === "bn" ? world.titleBn ?? world.title : world.title)}</p>
          {newMastered > 0 && (
            <div className="mastered-badge" key={newMastered}>
              <Icon name="trophy" size={24} />
              {t.newSkill(newMastered)}
            </div>
          )}
          {petStage > petStageBeforeRef.current && (
            <div className="pet-badge" key={`pet-${petStage}`}>
              <span className="pet-badge-emoji">{speciesEmoji(petSpecies, petStage)}{petStage >= 3 ? "✨" : ""}</span>
              <span>{t.petGrewInto(speciesById(petSpecies)[lang === "bn" ? "nameBn" : "name"])}</span>
            </div>
          )}
          {complete && newMastered > 0 && (
            <div className="gold-badge" key={`gold-${world.id}-${newMastered}`}>
              <span className="gold-badge-icon">👑</span>
              <span>{t.worldChampDone(lang === "bn" ? world.titleBn ?? world.title : world.title)}</span>
            </div>
          )}
          <div className="rank-badge">
            <span className="rank-badge-label">{t.rankLabel}</span>
            <span className="rank-badge-title">{rank.title}</span>
            {rank.nextTitle && <span className="rank-badge-next">{t.rankNextNeed(rank.nextTitle, rank.need)}</span>}
          </div>
          {moniDone && moniDone.totalRounds >= 4 && (
            <div className="moni-session-note">
              <Icon name="nova" size={18} /> {t.moniSessionHint(sessionHint)}
            </div>
          )}
          <div className="badge">
            {complete
              ? nextWorld
                ? t.completeUnlocked(world.title, nextWorld.title)
                : t.champion
              : nextWorld
                ? t.keepGoing(prog.total - prog.mastered, world.title)
                : t.greatSession}
          </div>
          {nextStop ? (
            <button className="big-btn next-btn" onClick={startNextRound}>
              <span className="play-btn-main">▶ {t.nextRound}</span>
              <span className="play-btn-sub">
                {nextStop.skill.title}
                {(() => { const b = BANDS.find((bb) => bb.id === nextStop.skill.band); return b ? ` · ${b.title}` : ""; })()}
              </span>
            </button>
          ) : (
            <button className="big-btn" onClick={replaySession}>{t.playAgain}</button>
          )}
          {nextStop && (
            <button className="ghost-btn" onClick={replaySession}>{t.playAgain}</button>
          )}
          {complete && (
            <button className="cert-btn" onClick={() => openCert(world)}>{t.certBtn}</button>
          )}
          <button className="ghost-btn nova-home-btn" onClick={goNova}><Icon name="nova" size={20} /> {t.novaMeet} · 🪙 {novaCoins}</button>
          <button className="ghost-btn" onClick={() => setScreen("worlds")}>{t.worldsBtn}</button>
          <button className="ghost-btn" onClick={() => setScreen("home")}>{t.homeBtn}</button>
        </main>
      </div>
    );
  }

  /* 🧠 MONI break screen (#327) — shown AFTER a session that crossed Moni's
     fatigue threshold. A soft pause, never a wall: Nova gently invites a
     stretch, and "keep going" is always one tap away (never blocks forever).
     Choosing "keep going" lands on the regular done screen so the celebration
     + next-round button are still there. */
  if (screen === "break" && kid) {
    const takeBreak = () => {
      breakPendingRef.current = false;
      cancelSpeech();
      setScreen("home");
    };
    const keepGoing = () => {
      breakPendingRef.current = false;
      setScreen("done");
    };
    return (
      <div className="app">
        <main className="screen break-screen">
          <div className="break-sky" aria-hidden="true">
            {["☁️", "☁️", "⭐", "🌤️", "🕊️", "☁️"].map((e, i) => (
              <span key={i} className={`break-sky-float f${i}`}>{e}</span>
            ))}
          </div>
          <div className="break-mascot" role="img" aria-label="Nova suggesting a break">
            <Icon name="nova" size={96} />
          </div>
          <h1 className="title">{t.breakTitle(kid.name)}</h1>
          <p className="break-body">{t.breakBody}</p>
          <div className="break-stretch" aria-hidden="true">🧘</div>
          <button className="big-btn break-rest-btn" onClick={takeBreak}>
            🦉 {t.breakRest}
          </button>
          <button className="ghost-btn break-go-btn" onClick={keepGoing}>
            {t.breakKeepGoing}
          </button>
        </main>
      </div>
    );
  }

  /* 🎯 MONI contrast drill (#325) — a side-by-side quiz that targets a SPECIFIC
     misconception pattern. Warm copy, two big options (correct + the pattern's
     trap), a tip under them. Finishing all rounds resolves the misconception
     in Moni's ledger (warm resolution — the pattern is beaten). Back always
     works; a kid can never get stuck. */
  if (screen === "contrast" && kid && contrastJob) {
    const { template, skillId } = contrastJob;
    const round = template.rounds[Math.min(contrastIdx, template.rounds.length - 1)];
    const done = contrastIdx >= template.rounds.length;
    const [optA, optB] = Math.random() < 0.5 ? [round.correct, round.trap] : [round.trap, round.correct];
    const answer = (picked: string) => {
      if (picked === round.correct) {
        tada();
        speak(t.contrastRight);
        setContrastIdx((i) => i + 1);
      } else {
        // Wrong pick — a soft nudge and the same round re-asks (never advances).
        click();
        speak(t.contrastOops(round.correct));
      }
    };
    const finishDrill = () => {
      useKidStore.getState().moniResolveMisconception(kid.id, skillId, template.code);
      setContrastJob(null);
      setContrastIdx(0);
      tada();
      setScreen("home");
    };
    return (
      <div className="app">
        <main className="screen contrast-screen">
          <div className="contrast-mascot" role="img" aria-label="Nova helping with the pattern">
            <Icon name="nova" size={72} />
          </div>
          {done ? (
            <>
              <h1 className="title">{t.contrastDoneTitle}</h1>
              <p className="contrast-done-body">{t.contrastDoneBody}</p>
              <button className="big-btn contrast-done-btn" onClick={finishDrill}>
                🌟 {t.contrastDoneBtn}
              </button>
            </>
          ) : (
            <>
              <p className="contrast-kicker">{template.intro[lang === "bn" ? "bn" : "en"]}</p>
              <div className="contrast-round" key={contrastIdx}>
                <p className="contrast-prompt">{round.prompt[lang === "bn" ? "bn" : "en"]}</p>
                <div className="contrast-options">
                  <button className="contrast-opt" onClick={() => answer(optA)}>{optA}</button>
                  <button className="contrast-opt" onClick={() => answer(optB)}>{optB}</button>
                </div>
                <p className="contrast-tip">{round.tip[lang === "bn" ? "bn" : "en"]}</p>
              </div>
              <span className="contrast-progress">{t.contrastProgress(Math.min(contrastIdx + 1, template.rounds.length), template.rounds.length)}</span>
            </>
          )}
          <button className="ghost-btn" onClick={() => { setContrastJob(null); setContrastIdx(0); setScreen("home"); }}>
            {t.homeBtn}
          </button>
        </main>
      </div>
    );
  }

  /* #283 — Badge Book: small trophies for real learning wins (sessions, stars,
     streak, full-land mastery). Conditions read only local state — offline. */
  if (screen === "badges" && kid) {
    const ctx = { sessions: badgeStats.sessions, stars: badgeStats.stars, streak: badgeStreak, worlds: fullyMasteredWorlds(skillsMap, kid.id) };
    const earnedCount = BADGES.filter((b) => b.earned(ctx)).length;
    return (
      <div className="app">
        <main className="screen badges-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>{t.badgeTitle}</h2>
              <p className="head-sub">{t.badgeSub(earnedCount, BADGES.length)}</p>
            </div>
            <button className="icon-btn nova-hud-btn" onClick={goNova} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
          </header>

          <div className="badge-grid">
            {BADGES.map((b) => {
              const earned = b.earned(ctx);
              return (
                <button
                  key={b.id}
                  className={`badge-card${earned ? " earned" : " locked"}`}
                  onClick={() => speak(lang === "bn" ? t.badgeNewSpeak(kid.name, b.nameBn) : t.badgeNewSpeak(kid.name, b.name))}
                  aria-label={earned ? t.badgeEarned : t.badgeLocked}
                >
                  <span className="badge-emoji" aria-hidden="true">{earned ? b.emoji : "🔒"}</span>
                  <span className="badge-name">{lang === "bn" ? b.nameBn : b.name}</span>
                  <span className="badge-hint">{lang === "bn" ? b.hintBn : b.hint}</span>
                  <span className={`badge-state${earned ? " earned" : ""}`}>{earned ? t.badgeEarned : t.badgeLocked}</span>
                </button>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  /* #277 — Land Trophy Room: fully mastering a whole land earns a trophy that
     sits on a shelf. Offline (reads local mastery only); a newly-earned trophy
     gets a confetti + spoken cheer exactly once (via the store's sync). */
  if (screen === "trophyroom" && kid) {
    const rows = BANDS.map((b) => {
      const p = worldProgress(skillsMap, kid.id, b.id);
      return { band: b, earned: p.total > 0 && p.mastered === p.total, mastered: p.mastered, total: p.total };
    });
    const trophyCount = rows.filter((r) => r.earned).length;
    return (
      <div className="app">
        <main className="screen tr-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("worlds")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>{t.trTitle}</h2>
              <p className="head-sub">{t.trSub(trophyCount, rows.length)}</p>
            </div>
            <button className="icon-btn nova-hud-btn" onClick={goNova} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
          </header>

          {trophyCount === 0 ? (
            <div className="tr-empty">
              <span className="tr-empty-emoji" aria-hidden="true">🏆</span>
              <span className="tr-empty-text">{t.trEmpty}</span>
            </div>
          ) : null}

          <div className="tr-shelf">
            {rows.map((r) => {
              const title = lang === "bn" ? r.band.titleBn ?? r.band.title : r.band.title;
              return (
                <div key={r.band.id} className={`tr-slot${r.earned ? " earned" : " locked"}`} role="status" aria-label={r.earned ? t.trEarned : t.trLocked}>
                  <span className="tr-shelf-top" aria-hidden="true" />
                  <span className="tr-trophy" aria-hidden="true">{r.earned ? "🏆" : "🔒"}</span>
                  <span className="tr-band-name">{title}</span>
                  <span className="tr-band-prog">{t.skillsProg(r.mastered, r.total)}</span>
                  <span className="tr-state">{r.earned ? t.trEarned : t.trLocked}</span>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  /* Build-a-castle — every world the kid masters raises a tower with its flag.
     The final tower carries a crown flag; the whole castle is the long-game trophy. */
  if (screen === "castle" && kid) {
    const towers = BANDS.map((b) => {
      const prog = worldProgress(skillsMap, kid.id, b.id);
      return { band: b, built: prog.mastered === prog.total && prog.total > 0, prog };
    });
    const builtCount = towers.filter((t) => t.built).length;
    const allBuilt = builtCount === towers.length;
    const TOWER_COLORS = ["#7ec850", "#f5b84c", "#5aa7e8", "#9a7ce0", "#ef7ba6"];
    return (
      <div className="app">
        <main className="screen castle-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>🏰 {t.castleTitle}</h2>
              <p className="head-sub">{t.castleBuilt(builtCount, towers.length)}</p>
            </div>
            <button className="icon-btn nova-hud-btn" onClick={goNova} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
          </header>

          <div className="castle-scene" role="img" aria-label={t.castleTitle}>
            <div className="castle-sun" aria-hidden="true" />
            <div className="castle-cloud c1" aria-hidden="true" />
            <div className="castle-cloud c2" aria-hidden="true" />

            <div className="castle-keep">
              <div className="castle-towers">
                {towers.map((tw, i) => (
                  <button
                    key={tw.band.id}
                    className={`castle-tower${tw.built ? " built" : ""}`}
                    style={{ "--tower": TOWER_COLORS[i % TOWER_COLORS.length] } as React.CSSProperties}
                    disabled={!tw.built}
                    onClick={() => openCert(tw.band)}
                    title={tw.built ? t.castleTowerBuilt(tw.band.title) : undefined}
                    aria-label={tw.built ? t.castleTowerBuilt(tw.band.title) : t.castleTowerToBuild(tw.band.title)}
                  >
                    <span className="castle-flag" aria-hidden="true">
                      {tw.built ? <Icon name={tw.band.key} size={30} /> : <span className="castle-flag-empty">…</span>}
                    </span>
                    <span className="castle-pole" aria-hidden="true" />
                    <span className="castle-roof" aria-hidden="true" />
                    <span className="castle-body" aria-hidden="true">
                      <span className="castle-window">{tw.built ? "⭐" : "🔒"}</span>
                    </span>
                    <span className="castle-label">{tw.band.title}</span>
                    <span className="castle-sub">{tw.built ? "✓" : t.castleBuildCta(tw.band.title)}</span>
                  </button>
                ))}
              </div>
              <div className="castle-wall" aria-hidden="true">
                <span className="castle-gate" />
                <span className="castle-gate-door" />
              </div>
            </div>

            <div className="castle-ground" aria-hidden="true" />
            {allBuilt && (
              <div className="castle-crown" role="status">{t.castleCrown}</div>
            )}
          </div>
        </main>
      </div>
    );
  }

  /* Printable certificate — a real keepsake the family can print or save as
     PDF. Only complete worlds can be celebrated this way. */
  if (screen === "cert" && kid && certWorld) {
    const cSkills = filterSkills.filter((sk) => sk.band === certWorld.id && sk.game && (skillsMap[`${kid.id}:${sk.id}`]?.pMastered ?? 0) >= MASTERY_THRESHOLD);
    return (
      <div className="cert-screen" role="document" aria-label={t.certTitle}>
        <div className="cert-toolbar no-print">
          <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.certBack}>‹</button>
          <span className="cert-toolbar-title">{t.certTitle}</span>
          <button className="cert-share-btn" onClick={() => void shareCert()}>{t.certShare}</button>
          <button className="cert-print-btn" onClick={() => window.print()}>{t.certPrint}</button>
          {shareMsg && <span className="cert-share-feedback" role="status">{shareMsg}</span>}
        </div>
        <div className="cert-sheet">
          <div className="cert-border" />
          <div className="cert-top">
            <span className="cert-nova" role="img" aria-label={t.certSigned}>🦉</span>
            <span className="cert-title">{t.certTitle}</span>
            <span className="cert-nova" role="img" aria-hidden="true">🦉</span>
          </div>
          <p className="cert-line">{t.certThisCertifies}</p>
          <p className="cert-name">{kid.name}</p>
          <p className="cert-line">{t.certHasMastered}</p>
          <p className="cert-world">{lang === "bn" ? certWorld.titleBn ?? certWorld.title : certWorld.title}</p>
          <p className="cert-skills">{t.certSkillCount(cSkills.length)}</p>
          <ul className="cert-list">
            {cSkills.slice(0, 6).map((sk) => (
              <li key={sk.id}>{sk.title}{sk.titleBn ? <span className="cert-bn"> {sk.titleBn}</span> : null}</li>
            ))}
          </ul>
          <p className="cert-nova-line">{t.certWithNova}</p>
          <div className="cert-foot">
            <div className="cert-date">
              <span className="cert-foot-label">{t.certDate}</span>
              <span className="cert-foot-value">{cardDate(Date.now(), lang)}</span>
            </div>
            <div className="cert-sign">
              <span className="cert-sign-emoji" role="img" aria-hidden="true">🦉</span>
              <span className="cert-foot-value">{t.certSigned}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "nova" || screen === "playing" || screen === "garden") {
    const inGame = screen === "playing";
    const inGarden = screen === "garden";
    return (
      <div className="app game-app">
        {/* HUD is always present so the canvas div below keeps its DOM identity across screens */}
        <div className="hud" hidden={!inGame}>
          {inGame && (
            <>
              <button className="hud-back" onClick={leaveGame} aria-label={t.leaveGame}>‹</button>
              <span className="hud-world">{world && <Icon name={world.key} size={18} />} {world?.title}</span>
              {curStep ? <span className="hud-skill">{curStep.title}</span> : null}
              {curReteach && <span className="hud-reteach">🎯 {t.practicePill}</span>}
              <span className="round-chip">{t.round(Math.min(roundsDone + 1, ROUNDS_TO_FINISH), ROUNDS_TO_FINISH)}</span>
              <span className="stars">⭐ {stars}</span>
              {sessionStreakCount >= 2 && <span className="hud-streak">🔥 {sessionStreakCount}</span>}
              <span className="hud-coins">🪙 {novaCoins}</span>
              <button
                className="hud-music"
                onClick={() => setMuted(toggleMusicMute())}
                aria-label="Toggle music"
              >
                {muted ? "🔇" : "🔊"}
              </button>
              {/* #22 — sibling co-op: only when a second profile exists on this
                  device. Tap → pass the device to a sibling mid-session. */}
              {kids.length >= 2 && (
                <button
                  className={`hud-music coop-btn${coopOpen ? " coop-open" : ""}`}
                  onClick={() => setCoopOpen((o) => !o)}
                  aria-label={t.siblingCoop}
                  title={t.siblingCoop}
                  aria-expanded={coopOpen}
                >
                  👥
                </button>
              )}
            </>
          )}
        </div>
        {/* Garden has its own little back button — home is one tap away */}
        {inGarden && (
          <button className="hud-back garden-back" onClick={() => setScreen("home")} aria-label={t.homeBtn}>
            ‹
          </button>
        )}
        <div ref={mountRef} className="game-wrap" />
        {/* #22 — pass-the-device sheet: pick the sibling whose turn it is. */}
        {coopOpen && kids.length >= 2 && (
          <div className="coop-overlay" onClick={() => setCoopOpen(false)}>
            <div className="coop-sheet" role="dialog" aria-label={t.passDevice} onClick={(e) => e.stopPropagation()}>
              <h3 className="coop-title">👥 {t.passDevice}</h3>
              <p className="coop-sub">{t.coopHint}</p>
              <div className="coop-list">
                {kids.map((k) => (
                  <button
                    key={k.id}
                    className={`coop-card${k.id === kid?.id ? " active" : ""}`}
                    disabled={k.id === kid?.id}
                    onClick={() => passToSibling(k)}
                    aria-label={t.passTo(k.name)}
                  >
                    <AvatarIcon emoji={k.avatar} size={38} />
                    <span className="coop-name">{k.name}</span>
                    {k.id === kid?.id ? (
                      <span className="coop-you">✅ {t.youBadge}</span>
                    ) : (
                      <span className="coop-go">→</span>
                    )}
                  </button>
                ))}
              </div>
              <button className="coop-close" onClick={() => setCoopOpen(false)} aria-label={t.back}>
                {t.back}
              </button>
            </div>
          </div>
        )}
        {coopToast && <div className="coop-toast" role="status">👥 {coopToast}</div>}
      </div>
    );
  }

  return null;
}

/** Bouncy count-up — numbers tick up to the final value (eases out). */
function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n}</>;
}

/** In-game "Add a kid" form — no browser prompts. Parent fills name, picks avatar + birth year. */
function AddKidForm({ t, lang, onSave, onCancel }: { t: Strings; lang: Lang; onSave: (name: string, avatar: string, birthYear: number, birthMonth?: number, birthDay?: number) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [birthYear, setBirthYear] = useState(2021);
  // Full birthday (month + day) — feeds the yearly birthday party. Defaults to
  // today so a parent can just press "+" a few times or leave it as-is.
  const today = new Date();
  const [birthMonth, setBirthMonth] = useState(today.getMonth() + 1);
  const [birthDay, setBirthDay] = useState(today.getDate());
  const maxDay = new Date(today.getFullYear(), birthMonth, 0).getDate();
  const canSave = name.trim().length > 0;
  const doSave = () => onSave(name.trim(), AVATAR_EMOJI[avatar] ?? avatar, birthYear, birthMonth, birthDay);

  return (
    <div className="app">
      <main className="screen worlds">
        <header className="screen-head">
          <button className="icon-btn" onClick={onCancel} aria-label={t.back}>‹</button>
          <div className="head-title">
            <h2>{t.addKid}</h2>
            <p className="head-sub">{t.addKidSub}</p>
          </div>
        </header>

        <div className="form-card">
          <label className="form-label">{t.pickBuddy}</label>
          <div className="avatar-row">
            {AVATARS.map((a) => (
              <button
                key={a}
                className={`avatar-btn${a === avatar ? " selected" : ""}`}
                onClick={() => setAvatar(a)}
                aria-label={`avatar ${a}`}
              >
                <Icon name={a} size={34} />
              </button>
            ))}
          </div>

          <label className="form-label" htmlFor="kid-name">{t.kidsName}</label>
          <input
            id="kid-name"
            className="input-field"
            type="text"
            value={name}
            maxLength={20}
            placeholder={t.namePlaceholder}
            autoFocus
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) doSave();
            }}
          />

          <label className="form-label">{t.birthYear}</label>
          <div className="year-row">
            <button className="year-btn" onClick={() => setBirthYear((y) => Math.max(2015, y - 1))} aria-label="year down">−</button>
            <div className="year-val">
              <span className="year-num">{birthYear}</span>
              <span className="year-age">{t.ageAt(Math.max(0, new Date().getFullYear() - birthYear))}</span>
            </div>
            <button className="year-btn" onClick={() => setBirthYear((y) => Math.min(2025, y + 1))} aria-label="year up">+</button>
          </div>

          {/* full birthday (month + day) — Nova celebrates every year */}
          <label className="form-label">🎂 {lang === "bn" ? "জন্মদিন" : "Birthday"}</label>
          <div className="bday-row">
            <div className="bday-field">
              <span className="bday-label">{t.birthMonth}</span>
              <div className="year-row">
                <button className="year-btn" onClick={() => setBirthMonth((m) => (m <= 1 ? 12 : m - 1))} aria-label="month down">−</button>
                <div className="year-val"><span className="year-num">{birthMonth}</span></div>
                <button className="year-btn" onClick={() => setBirthMonth((m) => (m >= 12 ? 1 : m + 1))} aria-label="month up">+</button>
              </div>
            </div>
            <div className="bday-field">
              <span className="bday-label">{t.birthDay}</span>
              <div className="year-row">
                <button className="year-btn" onClick={() => setBirthDay((d) => Math.max(1, d - 1))} aria-label="day down">−</button>
                <div className="year-val"><span className="year-num">{birthDay}</span></div>
                <button className="year-btn" onClick={() => setBirthDay((d) => Math.min(maxDay, d + 1))} aria-label="day up">+</button>
              </div>
            </div>
          </div>

          <button className="big-btn" disabled={!canSave} onClick={doSave}>
            {t.saveKid(name.trim() || (lang === "bn" ? "বাচ্চা" : "kid"))}
          </button>
        </div>
      </main>
    </div>
  );
}
