import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { BANDS, SKILLS, GAME_SCENES, getGame, nextDifficulty, type Band, type Skill } from "@numberverse/core";
import { CountPopScene } from "./game/CountPopScene";
import { FruitAddScene } from "./game/FruitAddScene";
import { BnLettersScene } from "./game/BnLettersScene";
import { BnNumbersScene } from "./game/BnNumbersScene";
import { ShapeCatcherScene } from "./game/ShapeCatcherScene";
import { EnLettersScene } from "./game/EnLettersScene";
import { NumberBondsScene } from "./game/NumberBondsScene";
import { RocketMultScene } from "./game/RocketMultScene";
import { PizzaFracScene } from "./game/PizzaFracScene";
import { BnWordsScene } from "./game/BnWordsScene";
import { CvcScene } from "./game/CvcScene";
import { DivisionFactsScene } from "./game/DivisionFactsScene";
import { FractionMatchScene } from "./game/FractionMatchScene";
import { PlaceValueScene } from "./game/PlaceValueScene";
import { BnMatrasScene } from "./game/BnMatrasScene";
import { SightWordsScene } from "./game/SightWordsScene";
import { AnimalHomeScene } from "./game/AnimalHomeScene";
import { DecimalsScene } from "./game/DecimalsScene";
import { PercentScene } from "./game/PercentScene";
import { AreaPerimScene } from "./game/AreaPerimScene";
import { BnSentenceScene } from "./game/BnSentenceScene";
import { GrammarScene } from "./game/GrammarScene";
import { BgsFactsScene } from "./game/BgsFactsScene";
import { BnColorsScene } from "./game/BnColorsScene";
import { BdMoneyScene } from "./game/BdMoneyScene";
import { EnPhonicsScene } from "./game/EnPhonicsScene";
import { AddSub100Scene } from "./game/AddSub100Scene";
import { NovaScene } from "./game/NovaScene";
import { GrowCountScene } from "./game/GrowCountScene";
import { FruitTreeScene } from "./game/FruitTreeScene";
import { GardenScene } from "./game/GardenScene";
import { FrogHopScene } from "./game/FrogHopScene";
import { MemoryPairsScene } from "./game/MemoryPairsScene";
import { BalloonPopScene } from "./game/BalloonPopScene";
import { ClockTimeScene } from "./game/ClockTimeScene";
import { BalanceScene } from "./game/BalanceScene";
import { CountingSongScene } from "./game/CountingSongScene";
import { useKidStore, todayIso, dayIsoAgo, NOVA_QUEST_TARGET, NOVA_QUEST_REWARD, NOVA_BIRTHDAY_COINS, type RoundResult } from "./store";
import { syncProgress, startAutoSync, fetchKidSettings, cachedKidSettings, todayMinutes, addTodayMinutes, type KidSettings } from "./api";
import { ensureAudio, startMusic, toggleMusicMute, isMusicMuted, click, whooshUp, tada } from "./game/audio";
import { setCurrentKidName } from "./game/kidName";
import { speak, cancelSpeech, primeSpeech, speechStatus, speechReadiness, setSpeechEnabled, type SpeechPlatform, type SpeechReadiness } from "./game/speech";
import { getAppLang, setAppLang } from "./game/locale";
import { ensureAssets } from "./game/svgAssets";
import { Icon, AvatarIcon, AVATAR_EMOJI, AVATAR_KEYS } from "./components/Icon";
import { neuralSpeak, getNeuralSpeaker, setNeuralSpeaker, isNeuralReady, NEURAL_VOICES } from "./game/neuralVoice";
import { renderShareCard, renderCertCard, canvasToBlob, sharePng, waTextUrl, type ShareCardData, type ShareCertData } from "./game/shareImage";

/** Build stamp — shown in the parent panel footer. Bump on every deploy so a
 *  stale service-worker cache is instantly visible (if the phone shows an old
 *  stamp, the new build hasn't landed yet — force-reload / reinstall the PWA). */
const APP_BUILD = "11 Aug 2026 · v13 (release train (2 since v12))";

type Screen = "home" | "kidpick" | "addkid" | "worlds" | "worlddetail" | "playing" | "done" | "parent" | "settings" | "nova" | "garden" | "cards" | "cert" | "castle";
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
  mode?: "add" | "sub" | "vowels" | "consonants" | "family";
  /** Run the narrated Basket Math concept-demo before the drills (add/sub). */
  teach?: boolean;
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
  syncError: string;
  pickKid: string;
  switchKid: (avatar: string, name: string) => string;
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
  removeKid: (name: string) => string;
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
  /* daily quest */
  questTitle: string;
  questProgress: (n: number, target: number) => string;
  questDoneText: string;
  questReward: (n: number) => string;
  questCompleteSpeak: (n: number) => string;
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
  /* settings screen */
  settingsTitle: string;
  settingsSub: string;
  settingsParent: string;
  settingsVoice: string;
  settingsVoiceOk: (v: string) => string;
  settingsVoiceNone: string;
  settingsVoiceTest: string;
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
    pickKid: "👶 Pick your kid",
    switchKid: (a, n) => `${a} ${n} — switch kid`,
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
    removeKid: (name) => `🗑 Remove ${name}`,
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
    petStage2: "Young owl",
    petStage3: "Wise owl",
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
    /* daily quest */
    questTitle: "🎯 Today's Quest",
    questProgress: (n, target) => `Play ${n}/${target} rounds`,
    questDoneText: "✅ Quest complete!",
    questReward: (n) => `+${n} 🪙 bonus`,
    questCompleteSpeak: (n) => `Quest complete! You won ${n} bonus coins! 🎉`,
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
    settingsTitle: "Settings",
    settingsSub: "Language, sound & voice",
    settingsParent: "👨‍👩‍👧 Parent analytics",
    settingsVoice: "🔊 Voice & reading",
    settingsVoiceOk: (v) => `Voice ready: ${v}`,
    settingsVoiceNone: "No voice found — install a voice in Settings → Accessibility → Spoken Content",
    settingsVoiceTest: "Test voice",
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
    playLimitReached: "⏰ Playtime is all done for today! Ask a grown-up — more learning awaits tomorrow 🌙",
    inProgress: "In progress",
    notStarted: "Not started",
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
    syncOk: "✓ অগ্রগতি ক্লাউডে সংরক্ষিত",
    syncSyncing: "সিঙ্ক হচ্ছে…",
    syncOffline: "অফলাইন — অগ্রগতি ডিভাইসে সংরক্ষিত",
    syncError: "সিঙ্কে সমস্যা — আবার চেষ্টা হবে",
    pickKid: "👶 বাচ্চা বাছাই করুন",
    switchKid: (a, n) => `${a} ${n} — পরিবর্তন করুন`,
    parentZone: "👨‍👩‍👧 অভিভাবক অঞ্চল",
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
    removeKid: (name) => `🗑 ${name} মুছুন`,
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
    petStage2: "ছোট্ট প্যাঁচা",
    petStage3: "জ্ঞানী প্যাঁচা",
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
    /* daily quest */
    /* daily quest */
    questTitle: "🎯 আজকের মিশন",
    questProgress: (n, target) => `${n}/${target}টা খেলা খেলো`,
    questDoneText: "✅ মিশন শেষ!",
    questReward: (n) => `+${n} 🪙 বোনাস`,
    questCompleteSpeak: (n) => `মিশন শেষ! তুমি ${n}টা বোনাস কয়েন জিতেছ! 🎉`,
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
    parentTitle: "অভিভাবক প্যানেল",
    parentSub: "দেখুন প্রতিটি সন্তান কীভাবে দক্ষতায় এগোচ্ছে",
    settingsTitle: "সেটিংস",
    settingsSub: "ভাষা, শব্দ ও ভয়েস",
    settingsParent: "👨‍👩‍👧 অভিভাবক বিশ্লেষণ",
    settingsVoice: "🔊 ভয়েস ও পড়া",
    settingsVoiceOk: (v) => `ভয়েস প্রস্তুত: ${v}`,
    settingsVoiceNone: "কোনো ভয়েস পাওয়া যায়নি — সেটিংস → অ্যাক্সেসিবিলিটি → স্পোকেন কনটেন্ট-এ ভয়েস ইনস্টল করুন",
    settingsVoiceTest: "ভয়েস পরীক্ষা",
    starsTotal: (n) => `${n}টি তারা অর্জন`,
    points: (n) => `${n} পয়েন্ট`,
    sessions: (n) => `${n}টি সেশন`,
    parentSkills: "দক্ষতা",
    music: "🔊 মিউজিক চালু",
    musicMuted: "🔇 মিউজিক বন্ধ",
    install: "অ্যাপ ইনস্টল করুন",
    shareProgress: "📤 অগ্রগতি শেয়ার করুন",
    shareShare: "শেয়ার",
    shareCardTitle: "🎉 Numberverse",
    shareCardFooter: "Numberverse দিয়ে তৈরি — বাচ্চারা গণিত ও বাংলা শেখে, অফলাইনেও, কোনো বিজ্ঞাপন নেই।",
    shareStatsStars: "তারা",
    shareStatsScore: "পয়েন্ট",
    shareStatsSessions: "সেশন",
    shareWorldsTitle: "জগৎ",
    shareRewardSpeak: (name) => `${name}-এর অগ্রগতি শেয়ার হয়েছে! তুমি +৫ কয়েন পেয়েছ! 🎉`,
    shareRewardToast: "🎉 শেয়ার হয়েছে! আপনার সন্তানের জন্য +৫ কয়েন",
    shareWhatsApp: "WhatsApp",
    shareDone: "✓ শেয়ার হয়েছে",
    shareFail: "এই ডিভাইসে শেয়ার করা যায়নি",
    shareProgressCaption: (name) => `${name} Numberverse-এ খেলছে — গণিত ও বাংলা, অফলাইনেও, কোনো বিজ্ঞাপন নেই! kids.munna-khan.xyz`,
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
    voicePickKid: "শিশুর ভয়েস",
    voicePickSoft: "নরম মেয়ে",
    voicePickWarm: "বন্ধুত্বপূর্ণ ছেলে",
    voicePickListen: "শোনো",
    mastered: "আয়ত্ত",
    playLimitReached: "⏰ আজকের খেলার সময় শেষ! একজন বড়কে বলো — কাল আবার শেখা চলবে 🌙",
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

/** Guided session = up to SESSION_LEN unmastered skills, in world order. If all mastered, replay the first few. */
function sessionForWorld(skills: SkillMap, kidId: string, band: number): SessionStep[] {
  const ordered = filterSkills.filter((s) => s.band === band && s.game).map(stepForSkill);
  const unmastered = ordered.filter((st) => !skillMastered(skills, kidId, st.skillId));
  const pool = unmastered.length ? unmastered : ordered;
  return pool.slice(0, SESSION_LEN);
}

function nextUnmasteredSkill(skills: SkillMap, kidId: string, band: number): Skill | undefined {
  return filterSkills.find((s) => s.band === band && s.game && !skillMastered(skills, kidId, s.id));
}

/** Adaptive starting level index for a kid + skill, from their BKT mastery state. */
function adaptiveLevelIndex(kidId: string, skillId: string, gameId: string): number {
  const game = getGame(gameId);
  if (!game) return 0;
  const state = useKidStore.getState().skillFor(kidId, skillId);
  const target = nextDifficulty(state, game.difficultyLevels, game.targetSuccess);
  const idx = game.difficultyLevels.indexOf(target);
  return idx < 0 ? 0 : idx;
}

/**
 * No-op boot scene. Phaser auto-starts the FIRST scene in the `scene:` array on
 * boot WITHOUT any data. If that first scene is a real game (e.g. CountPop), it
 * runs standalone with an undefined onRoundDone and never reports back to React.
 * Putting a blank scene first means every real game is started explicitly via
 * `game.scene.start(key, {startLevelIndex, mode, onRoundDone})`.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  create() {
    // Kick off the SVG → canvas texture loads the moment the game boots, so
    // lessons are already using crisp vector art (no first-round emoji flash).
    ensureAssets(this);
  }
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

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sessionRef = useRef<SessionStep[]>([]);
  const activeSceneRef = useRef<string | null>(null);
  // Mastery snapshot BEFORE a session starts — lets the done-screen celebrate
  // the skills that were genuinely NEW this session, not just re-played ones.
  const masteredBeforeRef = useRef<Set<string>>(new Set());
  // Pet stage when the session began — lets the done-screen celebrate a hatch/grow.
  const petStageBeforeRef = useRef(0);
  const [roundsDone, setRoundsDone] = useState(0);
  const [sessionIdx, setSessionIdx] = useState(0);
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
  // First-ever launch (no profiles) → straight to onboarding. Otherwise land on
  // the PLAY screen (remembered kid) or the simplified picker.
  const [screen, setScreen] = useState<Screen>(() => {
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
  // Which kid the parent panel is showing analytics for (defaults to the active kid).
  const [parentKidId, setParentKidId] = useState<string | null>(null);
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
  const t = STR[lang];

  const [fsActive, setFsActive] = useState(false);
  const syncState = useKidStore((s) => s.syncState);
  const syncPending = useKidStore((s) => s.pending.length);
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

  // ── Parent controls ─────────────────────────────────────────────────────
  // Per-kid settings come from the parent portal (api.ts). We fetch them on
  // the active kid (cache-first so offline play still respects the rules) and
  // apply: subject visibility, world cap, daily playtime, voice + music.
  const [settings, setSettings] = useState<KidSettings>(() => (kid ? cachedKidSettings(kid.id) : { enabled_subjects: null, max_band: null, daily_limit_min: null, tts_enabled: true, music_enabled: true }));
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
  /** A skill is hidden when its subject is turned off by the parent. */
  const subjectAllowed = useRef<Set<string>>(new Set()).current;
  useEffect(() => {
    subjectAllowed.clear();
    if (settings.enabled_subjects) for (const s of settings.enabled_subjects) subjectAllowed.add(s);
  }, [settings.enabled_subjects, subjectAllowed]);
  /** Should the PLAY button be blocked? (daily playtime cap reached) */
  const playLimitReached =
    !!settings.daily_limit_min && settings.daily_limit_min > 0 && todayMinutes() >= settings.daily_limit_min;
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
  /** Open the printable certificate for a completed world. */
  const openCert = (b: Band) => {
    if (!kid) return;
    setCertWorld(b);
    setScreen("cert");
    cancelSpeech();
    tada();
    speak(t.certSpeak(kid.name, b.title));
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
        return { emoji: worldEmoji(b.key), title: b.title, mastered: p.mastered, total: p.total };
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
        worldTitle: certWorld.title,
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
      const caption = t.certShareCaption(kid.name, certWorld.title);
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
  /** Forget the active kid (they're leaving the app to a sibling). */
  const clearKid = () => {
    setKid(null);
    try {
      localStorage.removeItem("nv_kid_id");
    } catch {
      /* ignore */
    }
  };

  /* ── Persist the chosen UI language + mirror it to game scenes ── */
  useEffect(() => {
    try {
      localStorage.setItem("nv_lang", lang);
    } catch {
      /* ignore */
    }
    setAppLang(lang);
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

  /* ── Create + boot Phaser for the game canvas (playing / Nova / Garden) ── */
  useEffect(() => {
    if ((screen !== "playing" && screen !== "nova" && screen !== "garden") || !mountRef.current || gameRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mountRef.current,
      backgroundColor: "#0b2545",
      scene: [
        BootScene,
        NovaScene,
        GardenScene,
        GrowCountScene, FruitTreeScene,
        CountPopScene, FruitAddScene, BnLettersScene, BnNumbersScene, ShapeCatcherScene, EnLettersScene, NumberBondsScene,
        RocketMultScene, PizzaFracScene, BnWordsScene, CvcScene, DivisionFactsScene, FractionMatchScene,
        PlaceValueScene, BnMatrasScene, SightWordsScene, AnimalHomeScene, DecimalsScene, PercentScene,
        AreaPerimScene, BnSentenceScene, GrammarScene, BgsFactsScene, BnColorsScene, EnPhonicsScene,
        BdMoneyScene,
        AddSub100Scene,
        FrogHopScene, MemoryPairsScene, BalloonPopScene, ClockTimeScene, BalanceScene,
        CountingSongScene,
      ],
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      input: { activePointers: 3 },
    });
    gameRef.current = game;
    (window as unknown as Record<string, unknown>).__NV_GAME__ = game;
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
    if (typeof ResizeObserver !== "undefined" && mountRef.current) {
      ro = new ResizeObserver(() => {
        if (raf) return; // one refresh per frame max
        raf = requestAnimationFrame(() => {
          raf = 0;
          refreshCanvas();
        });
      });
      ro.observe(mountRef.current);
    }
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    vv?.addEventListener("resize", refreshCanvas);
    return () => {
      gameRef.current = null;
      activeSceneRef.current = null;
      (window as unknown as Record<string, unknown>).__NV_GAME__ = null;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      vv?.removeEventListener("resize", refreshCanvas);
      game.destroy(true);
    };
  }, [screen]);

  /* ── Nova companion home: greet the kid right after profile selection ── */
  useEffect(() => {
    if (screen !== "nova" || !kid) return;
    const game = gameRef.current;
    if (!game) return;
    let active = true;
    const start = () => {
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
    if (game.isBooted) start();
    else game.events.once(Phaser.Core.Events.READY, start);
    return () => {
      active = false;
    };
  }, [screen, kid]);

  /* ── The Growth Garden: the kid's living proof of every correct answer ── */
  useEffect(() => {
    if (screen !== "garden" || !kid) return;
    const game = gameRef.current;
    if (!game) return;
    let active = true;
    const start = () => {
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
    if (game.isBooted) start();
    else game.events.once(Phaser.Core.Events.READY, start);
    return () => {
      active = false;
    };
  }, [screen, kid]);

  /* ── Start the scene for the current session step ── */
  useEffect(() => {
    if (screen !== "playing" || !kid) return;
    const game = gameRef.current;
    const step = sessionRef.current[sessionIdx];
    if (!game || !step) return;
    let active = true;
    const startLevelIndex = adaptiveLevelIndex(kid.id, step.skillId, step.gameId);
    setCurrentKidName(kid.name);
    const start = () => {
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
        teach: step.teach,
        kidName: kid.name,
        // Per-skill difficulty ladder (e.g. CountPop reuses the same scene for
        // count-to-10 AND count-to-50 — the scene reads its own levels here).
        levels: getGame(step.gameId)?.difficultyLevels,
        onRoundDone: (correct: boolean, ms: number, difficulty: number) => {
          const e: RoundResult = { gameId: step.gameId, skillId: step.skillId, correct, difficulty, responseMs: ms };
          addEvent(kid.id, e);
          novaAwardRound(kid.id, correct);
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
            // PET: a brand-new mastery is a BIG step — egg cracks, hatchling grows.
            if (!masteredBeforeRef.current.has(step.skillId)) {
              useKidStore.getState().petGrowMastery(kid.id);
              masteredBeforeRef.current.add(step.skillId);
            }
          }
          void syncProgress();
          setRoundsDone((n) => n + 1);
        },
      });
      activeSceneRef.current = step.scene;
    };
    if (game.isBooted) start();
    else game.events.once(Phaser.Core.Events.READY, start);
    return () => {
      active = false;
    };
  }, [screen, world, kid, sessionIdx, addEvent, novaAwardRound, novaQuestRound, gardenWater, gardenMastery]);

  /* ── Advance to the next skill after ROUNDS_TO_FINISH rounds ── */
  useEffect(() => {
    if (screen !== "playing" || roundsDone < ROUNDS_TO_FINISH) return;
    setRoundsDone(0);
    const next = sessionIdx + 1;
    if (next < sessionRef.current.length) {
      setSessionIdx(next);
    } else {
      if (kid) {
        novaCompleteSession(kid.id);
        recordSession(kid.id);
      }
      tada();
      cancelSpeech();
      setTimeout(() => setScreen("done"), 400);
    }
  }, [roundsDone, sessionIdx, screen, kid, recordSession, novaCompleteSession]);

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
    startMusic();
    whooshUp();
    reset();
    setRoundsDone(0);
    setSessionIdx(0);
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
    startMusic();
    whooshUp();
    reset();
    setRoundsDone(0);
    setSessionIdx(0);
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
    masteredBeforeRef.current = masteredSkillIds(skillsMap, kid.id);
    petStageBeforeRef.current = useKidStore.getState().nova[kid.id]?.petStage ?? 0;
    setScreen("playing");
  };

  /** Start the NEXT round after a finished session: the journey's current stop
   *  (which is the freshly-mastered skill's successor when the kid crossed the
   *  mastery bar, or the same skill to keep practicing when they didn't — the
   *  honest next step either way). Journey complete → falls back to a replay. */
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

  const removeKid = (id: string) => {
    const next = kids.filter((k) => k.id !== id);
    setKids(next);
    try {
      localStorage.setItem("nv_kids", JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (kid?.id === id) {
      clearKid();
      // Never strand a blank screen — go pick a remaining kid (or onboard a new one).
      setScreen(next.length ? "kidpick" : "addkid");
    }
  };

  const curStep = sessionRef.current[sessionIdx];

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
        <div className="app play-app">
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
            <button className="big-btn play-btn" onClick={onPlay}>
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

            {/* The pet — the kid's growing friend. Learning feeds it: every
                session, every new mastery, and one daily snack. */}
            <div className="pet-card" role="status">
              <span className="pet-emoji" aria-hidden="true">
                {["🥚", "🐣", "🦉", "🦉"][petStage]}
                {petStage >= 3 && <span className="pet-sparkle">✨</span>}
              </span>
              <div className="pet-meta">
                <span className="pet-title">{t.petTitle} · {[t.petStage0, t.petStage1, t.petStage2, t.petStage3][petStage]}</span>
                <span className="pet-bar">
                  <span className="pet-fill" style={{ width: `${Math.round(petProgress * 100)}%` }} />
                </span>
                <span className="pet-grow">{t.petGrow(petProgress)}</span>
              </div>
              <button className="pet-btn" onClick={feedPet} disabled={petFedToday || petStage >= 3}>
                {petFedToday ? t.petFedToday : t.petFeed}
              </button>
            </div>

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
        </div>
      );
    }
    // No active kid → fall through to the picker (below) so a blank screen
    // never appears.
  }

  if (screen === "settings") {
    const voiceLine = tts && tts.available
      ? tts.bnPick
        ? t.settingsVoiceOk(tts.bnPick)
        : t.settingsVoiceOk(tts.enPick ?? t.settingsVoiceTest)
      : t.settingsVoiceNone;
    return (
      <div className="app">
        <main className="screen worlds parent-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label="Back">‹</button>
            <div className="head-title">
              <h2>⚙️ {t.settingsTitle}</h2>
              <p className="head-sub">{t.settingsSub}</p>
            </div>
          </header>

          <div className="parent-card">
            <div className="parent-head">
              <span className="parent-name">{t.langLabel}</span>
              <span className="parent-stats">{t.music}</span>
            </div>
            <div className="row settings-row">
              <button
                className="ghost-btn lang-toggle"
                onClick={() => setLang((l) => (l === "en" ? "bn" : "en"))}
                aria-label="Switch language"
              >
                {t.langLabel}
              </button>
              <button
                className="ghost-btn lang-toggle"
                onClick={() => setMuted(toggleMusicMute())}
                aria-label="Toggle music"
              >
                {muted ? t.musicMuted : t.music}
              </button>
              {fsSupported() && (
                <button
                  className="ghost-btn lang-toggle fullscreen-toggle"
                  onClick={toggleFs}
                  aria-label={fsActive ? t.fullscreenOff : t.fullscreen}
                >
                  {fsActive ? t.fullscreenOff : t.fullscreen}
                </button>
              )}
              {installEvt && (
                <button className="ghost-btn mini pwa-install" onClick={installApp}>
                  📲 {t.install}
                </button>
              )}
            </div>
            <div
              className={`sync-pill sync-${syncState}`}
              title={`${syncPending} pending · ${t.syncIdle}`}
            >
              {syncState === "ok"
                ? t.syncOk
                : syncState === "syncing"
                  ? t.syncSyncing
                  : syncState === "offline"
                    ? t.syncOffline
                    : syncState === "error"
                      ? t.syncError
                      : t.syncIdle}
            </div>
          </div>

          {/* 🔊 TTS check on every run lives here — status + a live test. */}
          <div className="parent-card">
            <div className="parent-head">
              <span className="parent-name">{t.settingsVoice}</span>
              <span className="parent-stats">{voiceLine}</span>
            </div>
            <button
              className="ghost-btn mini voice-test-btn"
              onClick={() => {
                setTts(speechReadiness());
                const bn = getAppLang() === "bn";
                speak(bn ? "এক দুই তিন — এইটা একটা পরীক্ষা।" : "One two three — this is a test line.", { lang: bn ? "bn" : "en" });
              }}
            >
              🔊 {t.settingsVoiceTest}
            </button>
          </div>

          <button className="ghost-btn" onClick={() => setScreen("parent")}>
            {t.settingsParent}
          </button>
        </main>
      </div>
    );
  }

  if (screen === "parent") {
    // A child picker keeps the panel compact — analytics belong to ONE kid at a time,
    // and stacking every kid's full report is what made the panel unscrollable.
    const activeId = parentKidId && kids.some((k) => k.id === parentKidId) ? parentKidId : (kid?.id ?? kids[0]?.id ?? null);
    const activeKid = kids.find((k) => k.id === activeId);
    return (
      <div className="app">
        <main className="screen worlds parent-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label="Back">‹</button>
            <div className="head-title">
              <h2>{t.parentTitle}</h2>
              <p className="head-sub">{t.parentSub}</p>
            </div>
          </header>

          {kids.length === 0 ? (
            <p className="note">{t.pickProfile}</p>
          ) : (
            <>
              {/* ── Child picker: tap an avatar to switch whose analytics you see ── */}
              <div className="parent-picker" role="tablist" aria-label={t.parentTitle}>
                {kids.map((k) => {
                  const selected = k.id === activeId;
                  const st = stats[k.id];
                  return (
                    <button
                      key={k.id}
                      role="tab"
                      aria-selected={selected}
                      className={`parent-chip${selected ? " selected" : ""}`}
                      onClick={() => setParentKidId(k.id)}
                    >
                      <span className="chip-avatar"><AvatarIcon emoji={k.avatar} size={18} /></span>
                      <span className="chip-meta">
                        <span className="chip-name">{k.name}</span>
                        <span className="chip-stars">⭐ {st?.stars ?? 0}</span>
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
                            <span className="parent-world-name">{b.title}</span>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${p.pct}%` }} />
                            </div>
                            <span className="parent-world-pct">{p.mastered}/{p.total}</span>
                          </div>
                        );
                      })}
                    </div>
                    <button className="ghost-btn mini share-progress-btn" onClick={() => void shareProgress(activeKid)}>
                      {t.shareProgress}
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
          <VoiceCheck t={t} />
          <button className="ghost-btn" onClick={() => setScreen("settings")}>
            ⚙️ {t.settingsTitle}
          </button>
          <p className="build-stamp">Numberverse · {APP_BUILD}</p>
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
              aria-label="Back"
            >
              ‹
            </button>
            <div className="head-title">
              <h2>{t.whoPlaying}</h2>
              <p className="head-sub">{t.pickProfile}</p>
            </div>
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
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label="Back">‹</button>
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
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label="Back">‹</button>
            <div className="head-title">
              <h2>{kid ? <AvatarIcon emoji={kid.avatar} size={26} /> : null} {kid?.name ? t.worldsOf(kid.name) : t.worldsOf("")}</h2>
              <p className="head-sub">{mapView ? t.mapSub : journeyView ? t.journeySub : t.masterSkillsSub}</p>
            </div>
            <span className="rank-chip" title={t.rankLabel}>
              {rankFor(totalMastered(skillsMap, kid!.id), lang).title}
            </span>
            <button className="icon-btn nova-hud-btn" onClick={goNova} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
          </header>

          {curStop ? (
            <button className="big-btn play-now" onClick={() => startSingleSkill(curStop.skill)}>
              {t.playNext(curStop.skill.title)}
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
                          {b.title}
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
                        <span className="world-name">{b.title}</span>
                        <span className="world-age">
                          {unlocked
                            ? complete
                              ? t.worldComplete
                              : t.skillsProg(prog.mastered, prog.total)
                            : t.masterMoreIn(more, prev?.title ?? (lang === "bn" ? "আগের জগৎ" : "the last world"))}
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

          <button className="ghost-btn" onClick={() => removeKid(kid!.id)}>
            {t.removeKid(kid?.name ?? "")}
          </button>
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
            <button className="icon-btn" onClick={() => setScreen("worlds")} aria-label="Back">‹</button>
            <div className="head-title">
              <h2><Icon name={world.key} size={26} /> {world.title}</h2>
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
          <p className="subtitle">{t.earned(kid.avatar, kid.name, stars, score, world.title)}</p>
          {newMastered > 0 && (
            <div className="mastered-badge" key={newMastered}>
              <Icon name="trophy" size={24} />
              {t.newSkill(newMastered)}
            </div>
          )}
          {petStage > petStageBeforeRef.current && (
            <div className="pet-badge" key={`pet-${petStage}`}>
              <span className="pet-badge-emoji">{["🥚", "🐣", "🦉", "🦉"][petStage]}{petStage >= 3 ? "✨" : ""}</span>
              <span>{t.petGrewInto([t.petStage0, t.petStage1, t.petStage2, t.petStage3][petStage])}</span>
            </div>
          )}
          {complete && newMastered > 0 && (
            <div className="gold-badge" key={`gold-${world.id}-${newMastered}`}>
              <span className="gold-badge-icon">👑</span>
              <span>{t.worldChampDone(world.title)}</span>
            </div>
          )}
          <div className="rank-badge">
            <span className="rank-badge-label">{t.rankLabel}</span>
            <span className="rank-badge-title">{rank.title}</span>
            {rank.nextTitle && <span className="rank-badge-next">{t.rankNextNeed(rank.nextTitle, rank.need)}</span>}
          </div>
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
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label="Back">‹</button>
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
          <p className="cert-world">{certWorld.title}</p>
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
          <button className="icon-btn" onClick={onCancel} aria-label="Back">‹</button>
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
