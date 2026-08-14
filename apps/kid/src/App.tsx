import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles/screens.css"; // #1177 — deferred screen CSS rides the lazy App chunk (never blocks first paint)
// Type-only — Phaser's runtime lives in the async engine chunk (issue #15), so
// `import type` is erased and the main bundle carries ZERO engine bytes.
import type { Game } from "phaser";
import {
  BANDS,
  SKILLS,
  GAME_SCENES,
  getGame,
  getSkill,
  nextDifficulty,
  moni,
  deriveLearningStyle,
  DEFAULT_MONI_PARAMS,
  A11Y_DEFAULTS,
  type Band,
  type Skill,
  type ErrorKind,
} from "@numberverse/core";
import { useKidStore, todayIso, dayIsoAgo, NOVA_QUEST_TARGET, NOVA_QUEST_REWARD, QUEST_REWARDS, NOVA_MASTERY_REWARD, NOVA_BIRTHDAY_COINS, NOVA_CALENDAR_REWARDS, NOVA_DAILY_CAP, calendarCycleDay, QUEST_TARGETS, questTypeFor, type QuestType, STORY_QUEUE_CAP, NOVA_SPECIES, speciesById, speciesEmoji, type RoundResult, type MistakeState, type KothaStory } from "./store";
import { syncProgress, startAutoSync, restoreServerState, fetchKidSettings, cachedKidSettings, todayMinutes, addTodayMinutes, todayLimitMin, quietTimeNow, hasParentSession, parentName, validateParentSession, signinParent, signupParent, signinGoogle, clearParentSession, signoutParent, drainStoriesIfFull, drainAccelIfFull, hasParentPin, setParentPin, verifyParentPin, clearParentPin, hasSecurityQA, securityQuestionId, setSecurityQA, verifySecurityQA, KID_SETTINGS_DEFAULT, goalNudgedToday, markGoalNudgedToday, type KidSettings } from "./api";
import { GoogleSignIn, googleEnabled } from "./components/GoogleSignIn";
import { ensureAudio, startMusic, toggleMusicMute, isMusicMuted, click, whooshUp, tada, setMusicTheme, setSfxVolume, setMusicVolume, setQuietLevel as setAudioQuiet } from "./game/audio";
import { confettiBurst } from "./game/celebrate";
import { setCurrentKidName } from "./game/kidName";
import { speak, cancelSpeech, primeSpeech, speechStatus, speechReadiness, setSpeechEnabled, getVoiceFunVolume, setVoiceFunVolume, resetVoiceFunVolume, setVoiceBalance, setVoiceTone, setVoiceSpeed, setQuietLevel as setSpeechQuiet, type SpeechPlatform, type SpeechReadiness } from "./game/speech";
import { getAppLang, setAppLang, getLocale, currentFestival } from "./game/locale";
import { prefersReducedMotion, setReducedMotion } from "./game/reducedMotion";
import { readA11y, writeA11y, initA11y, type A11yPrefs } from "./game/a11y";
import { boot as bootGame, teardown as teardownGame, whenReady as whenGameReady } from "./game/gameHost";
import { wrongLedger } from "./game/wrongLedger";
import { Icon, AvatarIcon, AVATAR_EMOJI, AVATAR_KEYS } from "./components/Icon";
import { neuralSpeak, getNeuralSpeaker, setNeuralSpeaker, isNeuralReady, NEURAL_VOICES } from "./game/neuralVoice";
import { renderShareCard, renderCertCard, canvasToBlob, sharePng, waTextUrl, type ShareCardData, type ShareCertData } from "./game/shareImage";
import { startRecording, stopRecording } from "./game/voiceRecorder";
import { NV_GOLD, NV_ORANGE, NV_PINK, NV_SKY } from "./game/ui"; // tokenized #591
import { STR, bnNum, BN_MONTHS, type Lang, type Strings } from "./i18n";
import VoiceCheck from "./components/VoiceCheck";
import StoryInspector from "./components/StoryInspector";
import CountUp from "./components/CountUp";
import {
  currentSeason, fsSupported, requestFullscreen, exitFullscreen, challengeQ, challengeNovaChance,
  rankFor, isBirthday, masteredSkillIds, sessionStreak, fullyMasteredWorlds, genId, filterSkills,
  applyKidControls, subjectForSkill, skillMastered, strugglingSkills, worldProgress, worldEmoji,
  worldUnlocked, totalMastered, progressUnitCount, progressUnitsInBand, journeyStops, journeyState, journeyCurrentIndex, cardDate,
  worldCards, recommendedSkill, weekNumber, skillOfWeek, stepForSkill, moniPlanFor,
  moniLevelIndex, sessionForWorld, nextUnmasteredSkill, adaptiveLevelIndex, loadKids, invalidateKidsCache,
  MASTERY_THRESHOLD, UNLOCK_THRESHOLD, SESSION_LEN, SECURITY_QUESTIONS, TOUR_STEPS, RANKS,
  BADGES, ACHIEVEMENTS, NOVA_REACTIONS, CONTRAST_TEMPLATES, CHALLENGE_ROUNDS, CHALLENGE_MIN_LEVEL,
  CHALLENGE_MAX_LEVEL, WORLD_LANDS, FOCUS_SUBJECT_LABELS, SEASON_EMOJI, SEASON_PARTICLES,
  DONE_CONFETTI, filterMaxBand, filterFocusSubject, filterFocusBand, SUBJECT_CARD,
  type SessionStep, type Kid, type SkillMap, type SkillMapEntry, type JourneyStop, type CardSkill,
  type BadgeCtx, type BadgeDef, type AchCtx, type AchDef, type NovaReaction, type NovaReactionDef,
  type ChallengeQ, type ContrastTemplate, type ContrastRound, type AvatarParts, type SeasonKey,
} from "./lib/journey";
import { KidAvatar, AvatarBuilder, QuietChrome } from "./components/Avatar";
// #1183 — Nova3DHome (wrapper + WebGL probe) is lazy like its Nova3D island:
// the wrapper is only fetched/parsed the first time a kid actually opens the
// 3D screen, keeping the probe + wrapper code out of the main bundle.
const Nova3DHome = lazy(() => import("./nova3d/Nova3DHome"));
// #1178 — the heaviest non-initial screens are lazy chunks too: only fetched
// + parsed the first time the kid actually routes to them. Keeps the App chunk
// (the boot→splash→interactive path) to the screens a first visitor can reach
// (welcome, parent gate, kidpick, worlds) and defers home/avatar/addkid.
const HomeScreen = lazy(() => import("./components/HomeScreen"));
const AddKidForm = lazy(() => import("./components/AddKidForm"));

/** Build stamp — shown in the parent panel footer. Bump on every deploy so a
 *  stale service-worker cache is instantly visible (if the phone shows an old
 *  stamp, the new build hasn't landed yet — force-reload / reinstall the PWA). */
const APP_BUILD = "14 Aug 2026 · 0.42.10 (reward-overlap: care paws vs learning coins, quality-tier challenge rewards, type-scaled quests (#1189 #1191 #1192 #1194 #1195 #1196))";
/** Semantic version (0.MAJOR.MINOR.PATCH) — auto-bumped by release.sh to
 *  0.<N>.0 for every vN release, so the app reports a real version number. */
const APP_VERSION = "0.42.10";

export type Screen = "welcome" | "syllabus" | "home" | "kidpick" | "addkid" | "worlds" | "worlddetail" | "playing" | "done" | "break" | "contrast" | "parent" | "settings" | "nova" | "nova3d" | "garden" | "cards" | "badges" | "achievements" | "leaderboard" | "trophyroom" | "cert" | "castle" | "avatar";
/** Rounds per skill before advancing to the next skill in a world.
 *  5 rounds = a real practice block, not a drive-by. */
const ROUNDS_TO_FINISH = 5;

/** #1219 — EVERY boot-path localStorage read must be guarded: in private
 *  browsing / storage-denied contexts a bare getItem THROWS, and an unguarded
 *  one in a useState initializer aborts the render before any UI. Central safe
 *  read — returns null on any failure so initializers can fall through. */
function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
const AVATARS = AVATAR_KEYS;

/** #1178/#1186 — shared Suspense fallback while a lazy screen chunk resolves
 *  (SW-precached → a fast flash). Same spinner as the engine-boot overlay. */
function ScreenFallback() {
  return (
    <div className="screen-suspense" role="status">
      <span className="game-boot-spinner" aria-hidden="true" />
    </div>
  );
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  // #1186 — the async engine chunk shows a visible state over the canvas
  // instead of a blank gap: spinner while it loads, a retry button if it fails.
  const [gameBoot, setGameBoot] = useState<"loading" | "ready" | "error">("loading");
  const [gameBootNonce, setGameBootNonce] = useState(0); // retry re-arms the boot
  const sessionRef = useRef<SessionStep[]>([]);
  /** #253 — the in-progress session survives a kid switch. `sessionRef` holds
   *  the CURRENT kid's steps; this map holds abandoned mid-flight sessions keyed
   *  by the kid they were left behind for, so switching back RESUMES instead of
   *  restarting. Cleared on a completed session or an explicit new session. */
  const savedSessionsRef = useRef<Record<string, { steps: SessionStep[]; idx: number; roundsDone: number }>>({});
  /** #253 — snapshot the ACTIVE kid's in-flight session (mid-play) so a kid
   *  switch can restore it later. No-op when nothing is actually mid-game. */
  const snapshotSession = (kidId: string) => {
    if (screen !== "playing" || sessionRef.current.length === 0) return;
    savedSessionsRef.current[kidId] = {
      steps: sessionRef.current,
      idx: sessionIdx,
      roundsDone,
    };
  };
  /** #253 — drop a kid's saved session (session finished / new session chosen). */
  const clearSavedSession = (kidId: string) => {
    if (savedSessionsRef.current[kidId]) delete savedSessionsRef.current[kidId];
  };
  /** #253 — restore a saved session and jump straight back into play. */
  const resumeSession = (saved: { steps: SessionStep[]; idx: number; roundsDone: number }) => {
    if (!kid) return;
    const step = saved.steps[saved.idx];
    if (!step) return;
    setLimitNotice(null);
    requestFullscreen();
    ensureAudio();
    const band = SKILLS.find((s) => s.id === step.skillId)?.band ?? 1;
    setMusicTheme(band);
    startMusic();
    whooshUp();
    setSessionIdx(saved.idx);
    setRoundsDone(saved.roundsDone);
    sessionRef.current = saved.steps;
    breakPendingRef.current = false;
    masteredBeforeRef.current = masteredSkillIds(skillsMap, kid.id);
    petStageBeforeRef.current = useKidStore.getState().nova[kid.id]?.petStage ?? 0;
    setWorld(BANDS.find((b) => b.id === band) ?? null);
    clearSavedSession(kid.id);
    setScreen("playing");
  };
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
    const id = readLS("nv_kid_id"); // #1219 — guarded (private-browsing safe)
    return list.find((k) => k.id === id) ?? null;
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
    if (!readLS("nv_seen_welcome")) return "welcome"; // #1219 — guarded read
    if (!hasParentSession()) return "parent";
    const list = loadKids();
    if (list.length === 0) return "addkid";
    const id = readLS("nv_kid_id"); // #1219 — guarded read
    return list.some((k) => k.id === id) ? "home" : "kidpick";
  });
  // Worlds screen shows the single linear learning journey by default.
  const [journeyView, setJourneyView] = useState(true);
  const [mapView, setMapView] = useState(false);
  const [lang, setLang] = useState<Lang>(() => (readLS("nv_lang") as Lang) || "en"); // #1219
  const [muted, setMuted] = useState(isMusicMuted());
  // #288 — kid voice fun: device-local volume preference (re-renders so the
  // active Soft/Normal/Loud button stays highlighted).
  const [voiceFunVol, setVoiceFunVolState] = useState<number>(getVoiceFunVolume());
  // #355 — haptic pulses on taps. Default ON; the Settings row flips it.
  // `nv_haptics === "0"` is the off marker — anything else (or unset) is ON.
  const [hapticsOn, setHapticsOn] = useState(() => {
    try {
      return localStorage.getItem("nv_haptics") !== "0";
    } catch {
      return true;
    }
  });
  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    try {
      localStorage.setItem("nv_haptics", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    // A real pulse so the kid FEELS what the switch does (no-op on iOS).
    try {
      if (next && "vibrate" in navigator) navigator.vibrate([0, 22, 14, 22]);
    } catch {
      /* ignore */
    }
  };
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
  // #292 — Nova reaction pack v2: a floating Nova face bubble for streaks /
  // setbacks / reteach moments. Throttled (~900ms) so combos never spam; the
  // bubble auto-clears after ~2.6s.
  const [novaReaction, setNovaReaction] = useState<{ kind: NovaReaction; nonce: number } | null>(null);
  const lastReactionAtRef = useRef(0);
  const novaReact = useCallback((kind: NovaReaction) => {
    const now = Date.now();
    if (now - lastReactionAtRef.current < 900) return;
    lastReactionAtRef.current = now;
    setNovaReaction({ kind, nonce: now });
    const def = NOVA_REACTIONS[kind];
    const line = lang === "bn" ? def.lineBn() : def.lineEn();
    const voiceOk = tts ? tts.available && tts.voiceCount > 0 : null;
    if (def.speak !== false && voiceOk) speak(line, { lang: lang === "bn" ? "bn" : "en" });
    window.setTimeout(() => setNovaReaction((cur) => (cur && cur.nonce === now ? null : cur)), 2600);
  }, [lang, tts]);
  const { score, stars, events, addEvent, reset, stats, recordSession, novaAwardRound, novaCompleteSession, novaQuestProgress, gardenWater, gardenMastery } = useKidStore();
  const skillsMap = useKidStore((s) => s.skills);
  const mistakes = useKidStore((s) => s.mistakes);
  const kothaStories = useKidStore((s) => s.stories);
  const novaCoins = useKidStore((s) => (kid ? s.nova[kid.id]?.coins ?? 0 : 0));
  // #1196 — the anti-grind cap: when today's LEARNING coins are maxed, a small
  // 🎯 chip on the HUD explains the coins went quiet (stars keep counting).
  const coinsCapped = useKidStore((s) => {
    const n = kid ? s.nova[kid.id] : undefined;
    if (!n) return false;
    return n.earnDay === todayIso() && (n.earnedToday ?? 0) >= NOVA_DAILY_CAP;
  });
  // #287/#293 — Daily Quest VARIETY: the mission type rotates per kid per day
  // (deterministic, offline). Progress counts only when a round matches today's
  // type; harder types pay more (#1189).
  const quest = useKidStore((s) => {
    const n = s.nova[kid?.id ?? ""];
    if (!n) return { type: "rounds" as QuestType, progress: 0, target: NOVA_QUEST_TARGET, done: false, today: false, reward: NOVA_QUEST_REWARD };
    const today = todayIso();
    const todayFresh = n.questDay === today;
    const type: QuestType = todayFresh && n.questType ? (n.questType as QuestType) : questTypeFor(kid?.id ?? "", today);
    return {
      type,
      progress: todayFresh ? n.questProgress ?? (type === "rounds" ? n.questRounds ?? 0 : 0) : 0,
      target: QUEST_TARGETS[type] ?? NOVA_QUEST_TARGET,
      done: todayFresh ? !!n.questDone : false,
      today: todayFresh,
      reward: QUEST_REWARDS[type] ?? NOVA_QUEST_REWARD,
    };
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
  // #294 — streak-freeze tokens (earned on the day-7 calendar tile; each saves
  // one missed day). Shown as a 🧊 pill in the calendar chip.
  const freezeCount = useKidStore((s) => (kid ? s.nova[kid.id]?.freezes ?? 0 : 0));
  // #283 — goal badges: currently-earned ids (from local stats/streak/worlds),
  // and the celebration effect that fires once per NEW badge.
  const badgeStats = useKidStore((s) => s.stats[kid?.id ?? ""] ?? { stars: 0, score: 0, sessions: 0 });
  const badgeStreak = useKidStore((s) => (kid ? s.nova[kid.id]?.streak ?? 0 : 0));
  const storedBadges = useKidStore((s) => (kid ? s.nova[kid.id]?.badges ?? [] : []));
  // #100 — skill of the week: the highlighted skill this week + whether it's
  // mastered. Feeds the Week Warrior badge and the home card (both offline).
  const weekSkill = kid ? skillOfWeek(skillsMap, kid.id) : undefined;
  const weekDone = !!kid && !!weekSkill && skillMastered(skillsMap, kid.id, weekSkill.id);
  // #1185 — these derivations are memoized + only depend on primitive/stable
  // values (never the store objects themselves, whose fallback literals change
  // identity every render), so a store tick that doesn't touch mastery/stats
  // skips all the badge/achievement/trophy/box filtering on first render.
  const kidMasteredCount = useMemo(() => (kid ? totalMastered(skillsMap, kid.id) : 0), [skillsMap, kid?.id]);
  const kidWorlds = useMemo(() => (kid ? fullyMasteredWorlds(skillsMap, kid.id) : 0), [skillsMap, kid?.id]);
  const earnedBadgeKey = useMemo(
    () =>
      kid
        ? BADGES.filter((b) =>
            b.earned({ sessions: badgeStats.sessions, stars: badgeStats.stars, streak: badgeStreak, worlds: kidWorlds, weekDone })
          )
            .map((b) => b.id)
            .join(",")
        : "",
    [kid?.id, badgeStats.sessions, badgeStats.stars, badgeStreak, kidWorlds, weekDone]
  );
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
  // #289 — long-term achievements: celebrating each NEWLY-unlocked milestone
  // exactly once (the album grid shows the pop animation; home fires the cheer).
  const achStats = useKidStore((s) => s.stats[kid?.id ?? ""] ?? { stars: 0, score: 0, sessions: 0 });
  const achStreak = useKidStore((s) => (kid ? s.nova[kid.id]?.streak ?? 0 : 0));
  const achCoins = useKidStore((s) => (kid ? s.nova[kid.id]?.totalEarned ?? 0 : 0));
  const achPets = useKidStore((s) => (kid ? s.nova[kid.id]?.adoptedPets?.length ?? 0 : 0));
  const achPetStage = useKidStore((s) => (kid ? s.nova[kid.id]?.petStage ?? 0 : 0));
  const storedAchs = useKidStore((s) => (kid ? s.nova[kid.id]?.achievements ?? [] : []));
  const earnedAchKey = useMemo(
    () =>
      kid
        ? ACHIEVEMENTS.filter((a) =>
            a.earned({
              sessions: achStats.sessions,
              stars: achStats.stars,
              mastered: kidMasteredCount,
              streak: achStreak,
              coins: achCoins,
              worlds: kidWorlds,
              pets: achPets,
              petStage: achPetStage,
            })
          )
            .map((a) => a.id)
            .join(",")
        : "",
    [kid?.id, achStats.sessions, achStats.stars, kidMasteredCount, achStreak, achCoins, kidWorlds, achPets, achPetStage]
  );
  useEffect(() => {
    if (!kid || !earnedAchKey) return;
    const earned = earnedAchKey.split(",").filter(Boolean);
    const newly = useKidStore.getState().novaSyncAchievements(kid.id, earned);
    if (newly.length) {
      newly.forEach((id) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (!a) return;
        tada();
        speak(lang === "bn" ? t.achNewSpeak(kid.name, a.nameBn) : t.achNewSpeak(kid.name, a.name));
      });
    }
  }, [kid?.id, earnedAchKey, storedAchs.join(",")]);
  // #277 — land trophies: celebrating a NEWLY fully-mastered land exactly once.
  const earnedTrophyKey = useMemo(
    () =>
      kid
        ? BANDS.filter((b) => {
            const p = worldProgress(skillsMap, kid.id, b.id);
            return p.total > 0 && p.mastered === p.total;
          })
            .map((b) => b.id)
            .join(",")
        : "",
    [skillsMap, kid?.id]
  );
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
  const unclaimedBoxes = useMemo(
    () =>
      kid
        ? filterSkills
            .filter((s) => s.game && skillMastered(skillsMap, kid.id, s.id) && !storedBoxes.includes(s.id))
            .sort(
              (a, b) =>
                ((skillsMap[`${kid.id}:${b.id}`]?.lastPractice ?? 0) - (skillsMap[`${kid.id}:${a.id}`]?.lastPractice ?? 0))
            )
        : [],
    // `storedBoxes.join()` (a stable primitive) — NOT storedBoxes itself, whose
    // `?? []` fallback is a fresh array identity every render.
    [skillsMap, kid?.id, storedBoxes.join(",")]
  );
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
  // 🧏 #250 — GLOBAL accessibility toggles (big text + high contrast). Shared
  // with the parent portal via one localStorage key (nv_a11y, same origin); a
  // `storage` listener keeps open tabs in sync.
  // #1220 — the initializer is a STATIC default (never touches storage during
  // render); the real persisted value is read in the effect below, so a storage
  // exception in private browsing can't abort first render.
  const [a11y, setA11y] = useState<A11yPrefs>(() => ({ ...A11Y_DEFAULTS }));
  useEffect(() => {
    setA11y(readA11y()); // #1220 — hydrate from storage after first paint
    const un = initA11y();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nv_a11y") setA11y(readA11y());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      un();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const syncState = useKidStore((s) => s.syncState);
  const syncPending = useKidStore((s) => s.pending.length);
  // 📚 KOTHA offline-queue quota — a long offline stretch can't balloon the
  // story queue: once it hits the cap we eagerly drain (best-effort; nothing is
  // ever dropped before the server confirms it). Count is surfaced in the UI.
  const storyPending = useKidStore((s) => s.stories.length);
  useEffect(() => {
    if (storyPending >= STORY_QUEUE_CAP) drainStoriesIfFull();
  }, [storyPending]);
  // 🚀 #249 — acceleration queue quota: same eager-drain as stories.
  const accelPending = useKidStore((s) => s.accel.length);
  useEffect(() => {
    if (accelPending >= STORY_QUEUE_CAP) drainAccelIfFull();
  }, [accelPending]);
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

  // #1226 — the persisted nv_store_v1 blob is hydrated HERE (after first paint),
  // not at store creation. Gating: the outbox drains in startAutoSync must NOT
  // run against an empty pre-hydration store (they'd miss queued stories), so
  // sync only arms once rehydrate() has landed. For a normal-size blob this
  // adds a single frame; for a power user's large blob it keeps the App-chunk
  // eval off the first-render path entirely.
  const [storeHydrated, setStoreHydrated] = useState(false);
  useEffect(() => {
    let alive = true;
    // rehydrate() is typed void | Promise<void> — when void (already hydrated),
    // resolve immediately; when a promise, await the merge before arming sync.
    Promise.resolve(useKidStore.persist.rehydrate()).then(() => {
      if (alive) setStoreHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  // Always-sync: drain the offline outbox on boot, then keep a heartbeat +
  // reconnect/foreground listeners (see api.ts). Never blocks gameplay.
  useEffect(() => {
    if (!storeHydrated) return;
    return startAutoSync();
  }, [storeHydrated]);

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
  //     via the security question (#247), or sign-out-and-back-in as fallback)
  //   · PIN verified          → panel; a "Change PIN" card re-arms the pad
  const [pinOk, setPinOk] = useState(false);
  const [pinMode, setPinMode] = useState<"unlock" | "setup" | "change">("unlock");
  const [pinStep, setPinStep] = useState<"current" | "new" | "confirm">("current");
  const [pinDigits, setPinDigits] = useState("");
  const [pinPending, setPinPending] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
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

  // #247 — PIN recovery Q&A. Set at first PIN use (or from the panel card),
  // asked on the unlock/locked pad to reset the PIN IN PLACE — fully offline,
  // no sign-out, no account lockout. Stored as a salted hash in api.ts.
  const [secView, setSecView] = useState<"none" | "set" | "ask">("none");
  const [secStep, setSecStep] = useState<"pick" | "answer" | "confirm">("pick");
  const [secQid, setSecQid] = useState(0);
  const [secAnswer, setSecAnswer] = useState("");
  const [secConfirm, setSecConfirm] = useState("");
  const [secError, setSecError] = useState<string | null>(null);
  const resetSec = () => { setSecStep("pick"); setSecQid(0); setSecAnswer(""); setSecConfirm(""); setSecError(null); };
  const openSecAsk = () => { resetSec(); setSecView("ask"); };
  /** #247 — leave the Q&A view (skip first-use setup, or cancel an edit). */
  const secSkip = () => { setSecView("none"); resetSec(); };
  /** #247 — save the Q&A (confirm step). */
  const secSave = () => {
    if (!secAnswer.trim()) { setSecError(t.secEmpty); return; }
    if (secAnswer.trim() !== secConfirm.trim()) {
      setSecError(t.secMismatch);
      setSecStep("answer");
      setSecConfirm("");
      return;
    }
    setSecurityQA(String(secQid), secAnswer.trim());
    setSecView("none");
    resetSec();
  };
  /** #247 — answer the recovery question → reset the PIN here, in place. */
  const secRecover = () => {
    if (!secAnswer.trim()) { setSecError(t.secEmpty); return; }
    if (verifySecurityQA(secAnswer.trim())) {
      clearParentPin(); // QA stays — reuse it for the next reset.
      setSecView("none");
      resetSec();
      setPinNotice(t.secRecovered);
      pinNewFlow("unlock");
      setPinOk(false);
      setPinForgotArmed(false);
    } else {
      setSecError(t.secWrong);
    }
  };

  /** Append a digit; auto-submit once 4 digits are entered. */
  const appendPinDigit = (d: string) => {
    const next = (pinDigits + d).slice(0, 4);
    setPinDigits(next);
    setPinError(null);
    setPinNotice(null);
    if (next.length === 4) pinSubmit(next);
  };
  /** The 4-digit value is complete → run the step logic. `hasParentPin()` is
   *  the source of truth for setup-vs-unlock: with no PIN, "current" is
   *  meaningless, so the first entry is treated as the new-PIN stage. A device
   *  with no PIN can never accidentally hit the verify branch. */
  const pinSubmit = (value: string) => {
    const setupWasFirst = !hasParentPin(); // before any new-PIN save below
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
      // #247 — first-time setup: step straight into the recovery-question flow
      // so a forgotten PIN is recoverable from day one. (Change-mode and the
      // post-recovery setup skip it — the Q&A is already in place.)
      if (setupWasFirst && !hasSecurityQA()) {
        setSecView("set");
        setSecStep("pick");
        setSecQid(0);
        setSecAnswer("");
        setSecConfirm("");
        setSecError(null);
      }
    } else {
      pinResetPad();
      setPinPending("");
      setPinStep("new");
      setPinError(t.pinMismatch);
    }
  };
  /** Recovery fallback (#247): when NO security question is set, a parent who
   *  forgot the PIN (or hit the locked pad) resets the lock and signs out —
   *  signing back in lands on the parent page, which (with no PIN set) prompts
   *  for a fresh PIN. Two taps (arm → confirm). With Q&A set, "Forgot PIN?"
   *  instead opens `secRecover` and never leaves the screen. */
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
  // #1221 — ONE synchronous cache read per render, shared by the state
  // initializer AND the hydration effect (readSettingsCache is a parse-once
  // memo, so repeated calls already return the same reference; deriving a
  // single `cachedSettings` here makes the single-read intent explicit).
  const cachedSettings = kid ? cachedKidSettings(kid.id) : { ...KID_SETTINGS_DEFAULT };
  const [settings, setSettings] = useState<KidSettings>(cachedSettings);
  useEffect(() => {
    if (!kid) return;
    setSettings(cachedSettings);
    let alive = true;
    void fetchKidSettings(kid.id).then((s) => {
      if (alive) setSettings(s);
    });
    return () => {
      alive = false;
    };
  }, [kid?.id]);
  // #272 — SAFETY: parent kill-switch. Light online poll (only while the tab is
  // visible) so a parent's one-tap pause lands INSTANTLY, even mid-session —
  // not just on the next boot. Only re-applies settings when the pause flag
  // actually flips (no needless re-renders mid-play); offline the cached value
  // stands and the pause still holds (it survives reload).
  useEffect(() => {
    if (!kid) return;
    const iv = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void fetchKidSettings(kid.id).then((s) => {
        setSettings((prev) => (prev.paused === s.paused ? prev : s));
      });
    }, 30_000);
    return () => window.clearInterval(iv);
  }, [kid?.id]);
  // #272 — "restart screen": when the parent RESUMES (paused flips true→false),
  // drop the kid back to a fresh home rather than resuming mid-game.
  const wasPaused = useRef(false);
  useEffect(() => {
    if (settings.paused) {
      wasPaused.current = true;
    } else if (wasPaused.current) {
      wasPaused.current = false;
      cancelSpeech();
      setScreen("home");
    }
  }, [settings.paused]);
  // Recompute the journey/world skill filters whenever subject/band settings land.
  // (Runs on first paint from cache AND again when the fresh server copy arrives.)
  // The tick state forces a re-render so journey/worlds pick up the new filters
  // immediately instead of waiting for some unrelated state to change.
  const [, setFilterTick] = useState(0);
  useEffect(() => {
    applyKidControls(settings.enabled_subjects, settings.max_band, settings.focus_subject, settings.focus_band);
    setFilterTick((t) => t + 1);
  }, [settings.enabled_subjects, settings.max_band, settings.focus_subject, settings.focus_band]);
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
  // #243 — per-kid volume balance: apply the parent's voice/sfx/music knobs.
  useEffect(() => {
    setVoiceBalance(settings.voice_volume ?? 1);
  }, [settings.voice_volume]);
  // #258 — per-kid VOICE preference: the parent's tone (neural Bangla speaker +
  // Web-Speech gender bias) and speed (Web-Speech rate multiplier). Flip the
  // moment the parent saves them.
  useEffect(() => {
    setVoiceTone(settings.voice_tone ?? null);
    setVoiceSpeed(settings.voice_speed ?? 1);
  }, [settings.voice_tone, settings.voice_speed]);
  useEffect(() => {
    setSfxVolume(settings.sfx_volume ?? 1);
  }, [settings.sfx_volume]);
  useEffect(() => {
    setMusicVolume(settings.music_volume ?? 1);
  }, [settings.music_volume]);

  // #248 — quiet hours. Auto-lowers EVERY sound during a parent's per-day
  // window and (optionally) gently dims the screen — play is NEVER blocked.
  // A tap on the 🌙 badge overrides for this session (back to full sound);
  // the minute tick re-checks so windows crossing midnight stay correct.
  const [quietOverride, setQuietOverride] = useState(false);
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => window.clearInterval(iv);
  }, []);
  const quietActive = !quietOverride && quietTimeNow(settings);
  useEffect(() => {
    const level = quietActive ? Math.max(0.05, settings.quiet_volume ?? 0.15) : 1;
    setAudioQuiet(level);
    setSpeechQuiet(level);
  }, [quietActive, settings.quiet_volume, minuteTick]);
  // Shared chrome element: drop into each main kid screen once.
  const quietChrome = (
    <QuietChrome
      active={quietActive}
      dim={!!settings.quiet_dim}
      overridden={quietOverride}
      onToggle={() => setQuietOverride((v) => !v)}
      label={t.quietBadge}
      labelOn={t.quietBadgeOn}
    />
  );

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
  // #1222 — read today's playtime ONCE per render and reuse it for the cap
  // check, the goal line, and the goal banner (the api-level memo already avoids
  // re-parsing localStorage, but this kills the duplicate CALLS too).
  const todayPlayed = todayMinutes();
  /** Should the PLAY button be blocked? (#6 — effective per-weekday cap reached) */
  const playLimitReached = (() => {
    const cap = todayLimitMin(settings);
    return cap !== null && todayPlayed >= cap;
  })();
  // A gentle child-facing banner when a play attempt hits the daily cap.
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  // 🎯 #256 — gentle daily goal (parent-set minutes). Shown as a home progress
  // line, and celebrated ONCE per day when reached. `goalReached` excludes the
  // cap block so the two banners never fight; the nudge is fully dismissible.
  const goalMin = settings.goal_min && settings.goal_min > 0 ? settings.goal_min : 0;
  const goalReached = goalMin > 0 && todayPlayed >= goalMin && !playLimitReached;
  const goalPct = goalMin > 0 ? Math.min(100, Math.round((todayPlayed / goalMin) * 100)) : 0;
  const [goalNotice, setGoalNotice] = useState(false);
  useEffect(() => {
    if (goalReached && !goalNotice && !goalNudgedToday()) {
      setGoalNotice(true);
      markGoalNudgedToday();
    }
    if (!goalReached && goalNotice) setGoalNotice(false);
  }, [goalReached, goalNotice]);
  // 🚀 #249 — skip-ahead toast on the world detail screen.
  const [skipNotice, setSkipNotice] = useState<string | null>(null);
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
  const goAchievements = () => setScreen(kid ? "achievements" : "kidpick");
  const goTrophyRoom = () => setScreen(kid ? "trophyroom" : "kidpick");
  const goAvatar = () => setScreen(kid ? "avatar" : "kidpick");

  /* ── #280 beat-the-owl challenge: 5-round math duel vs Nova ── */
  const [challenge, setChallenge] = useState<{
    round: number;
    myScore: number;
    novaScore: number;
    level: number;
    q: ChallengeQ;
    pick: number | null;
    correct: boolean;
    novaGot: boolean;
    won: "win" | "tie" | "lose" | null;
    coins: number;
  } | null>(null);
  const challengeTimerRef = useRef<number | undefined>(undefined);

  const startChallenge = () => {
    if (!kid) return;
    const st = useKidStore.getState();
    const prefix = `${kid.id}:`;
    const mine = Object.entries(st.skills).filter(([k]) => k.startsWith(prefix));
    const avg = mine.length ? mine.reduce((s, [, m]) => s + m.pMastered, 0) / mine.length : 0.25;
    const base = Math.min(CHALLENGE_MAX_LEVEL, Math.max(CHALLENGE_MIN_LEVEL, Math.round(avg * 10)));
    setChallenge({
      round: 1, myScore: 0, novaScore: 0, level: base,
      q: challengeQ(base, lang), pick: null, correct: false, novaGot: false, won: null, coins: 0,
    });
  };

  const pickChallenge = (i: number) => {
    if (!challenge || !kid || challenge.pick !== null) return;
    const correct = i === challenge.q.answer;
    const myScore = challenge.myScore + (correct ? 1 : 0);
    // Fair Nova: their hit-rate tracks the kid's accuracy so far — always winnable.
    const novaGot = Math.random() < challengeNovaChance(myScore / challenge.round);
    setChallenge({ ...challenge, pick: i, correct, myScore, novaScore: challenge.novaScore + (novaGot ? 1 : 0), novaGot });
    window.clearTimeout(challengeTimerRef.current);
    challengeTimerRef.current = window.setTimeout(() => {
      setChallenge((prev) => {
        if (!prev || prev.pick === null) return prev;
        if (prev.round >= CHALLENGE_ROUNDS) {
          const won = prev.myScore > prev.novaScore ? "win" : prev.myScore < prev.novaScore ? "lose" : "tie";
          const grant = useKidStore.getState().novaChallengeReward(kid.id, won === "win" ? 3 : won === "tie" ? 2 : 1);
          if (won === "win") {
            tada();
            speak(t.chSpeakWin(kid.name));
          } else if (won === "tie") {
            speak(t.chSpeakTie);
          } else {
            speak(t.chSpeakLose(kid.name));
          }
          return { ...prev, won, coins: grant };
        }
        // Fair difficulty ramp: +1 after a hit (up to max), −1 after a miss.
        const level = Math.min(CHALLENGE_MAX_LEVEL, Math.max(CHALLENGE_MIN_LEVEL, prev.level + (prev.correct ? 1 : -1)));
        return { ...prev, round: prev.round + 1, pick: null, correct: false, novaGot: false, level, q: challengeQ(level, lang) };
      });
    }, 1800);
  };

  const closeChallenge = () => {
    window.clearTimeout(challengeTimerRef.current);
    setChallenge(null);
  };

  /* ── #356 first-play tour: 4-step, skippable core-loop walkthrough. Shows
   *  once per device the first time a kid lands on home; "Skip" always works. */
  const [tourStep, setTourStep] = useState<number | null>(null);
  useEffect(() => {
    if (screen !== "home" || !kid || tourStep !== null) return;
    const done = readLS("nv_tour_done") === "1"; // #1219 — centralized safe read
    if (!done) setTourStep(0);
  }, [screen, kid, tourStep]);
  const closeTour = (finished = false) => {
    setTourStep(null);
    if (finished) {
      try {
        localStorage.setItem("nv_tour_done", "1");
      } catch {
        /* ignore */
      }
    }
  };
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

  /** #253 — the kid-pick switcher: snapshots the CURRENT kid's in-flight session
   *  before switching (so switching back resumes it), then switches + goes home.
   *  Never drops a mid-game state. */
  const switchKidPreserving = (next: Kid) => {
    if (kid && kid.id !== next.id) snapshotSession(kid.id);
    selectKid(next);
    setScreen("home");
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
    setGameBoot("loading");
    let alive = true; // #1186 — a stale resolve must not set error after teardown
    bootGame(mountEl).then((g) => {
      if (!alive) return; // torn down mid-load
      if (!g) {
        // #1186 — chunk load failed: visible retry, not a silent blank canvas.
        setGameBoot("error");
        return;
      }
      gameRef.current = g;
      setGameBoot("ready");
      (window as unknown as Record<string, unknown>).__NV_GAME__ = g;
    });
    return () => {
      alive = false;
      gameRef.current = null;
      activeSceneRef.current = null;
      (window as unknown as Record<string, unknown>).__NV_GAME__ = null;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      vv?.removeEventListener("resize", refreshCanvas);
      teardownGame();
    };
  }, [screen, gameBootNonce]);

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
        // Per-skill difficulty ladder (#1170). When a band-pair reuses one
        // game-id (mult-facts-2-10 + mult-fluency-6-9 both run TimesTable),
        // the skill carries its OWN dataLevels so the scene generates content
        // within THAT skill's range — never the other band's floor (a band-6
        // reteach must show ×6, not ×2). Falls back to the game ladder when the
        // skill has no narrower range.
        levels: getSkill(step.skillId)?.dataLevels ?? getGame(step.gameId)?.difficultyLevels,
        onRoundDone: (correct: boolean, ms: number, difficulty: number) => {
          // Was this skill NEVER attempted before this round? (feeds the
          // "try a new game" quest type — must be captured BEFORE the event
          // lands, or the fresh state is already consumed.)
          const pre = useKidStore.getState().skills[`${kid.id}:${step.skillId}`];
          const freshSkill = !pre || (pre.attempts ?? 0) === 0;
          // #696 — Phaser's high-res clock yields fractional ms; the API's
          // response_ms is int, so round at the source (defense in depth with
          // the server's own rounding validator for stale queued events).
          const e: RoundResult = { gameId: step.gameId, skillId: step.skillId, correct, difficulty, responseMs: Math.max(0, Math.round(ms)) };
          addEvent(kid.id, e);
          // #1187 — the coin economy rewards effort: harder rounds pay more.
          const preEarned = (() => {
            const pn = useKidStore.getState().nova[kid.id];
            return pn && pn.earnDay === todayIso() ? pn.earnedToday ?? 0 : 0;
          })();
          novaAwardRound(kid.id, correct, difficulty);
          // #133 — screen-reader cue for every round (matches the on-screen flash).
          announce(correct ? t.a11yRight : t.a11yWrong);
          // every completed round advances today's Daily Quest — the mission
          // TYPE rotates per day (play rounds / earn stars / master a skill /
          // try a new game). Progress counts only when this round matches it.
          const st = useKidStore.getState().skills[`${kid.id}:${step.skillId}`];
          const mastered = !!(st && st.pMastered >= MASTERY_THRESHOLD);
          const questDone = novaQuestProgress(kid.id, { correct, mastered, freshSkill });
          if (questDone) {
            // THE moment the quest finishes — cheer once, aloud, in the app's
            // language, with that day's TYPE-SPECIFIC reward (#1189).
            cancelSpeech();
            tada();
            const bn = getAppLang() === "bn";
            const qtype = useKidStore.getState().nova[kid.id]?.questType as QuestType | undefined;
            speak(t.questCompleteSpeak(QUEST_REWARDS[qtype ?? "rounds"] ?? NOVA_QUEST_REWARD), { lang: bn ? "bn" : "en" });
          }
          // #1196 — the moment the daily coin cap is reached, reward feedback
          // must NOT drop to nothing: learning keeps paying (stars, combo,
          // mastery) but currency stops. Cheer the cap once, warmly, so the
          // switch to "no more coins today" feels celebrated, not punished
          // (the persistent HUD 🎯 chip then marks the rest of the day).
          if (correct) {
            const an = useKidStore.getState().nova[kid.id];
            const postEarned = an && an.earnDay === todayIso() ? an.earnedToday ?? 0 : 0;
            if (preEarned < NOVA_DAILY_CAP && postEarned >= NOVA_DAILY_CAP) {
              cancelSpeech();
              tada();
              const bn = getAppLang() === "bn";
              speak(t.hudCoinsMaxed, { lang: bn ? "bn" : "en" });
            }
          }
          // #292 — Nova reaction: exactly ONE per round, highest-priority wins.
          // Win streaks / setbacks / reteach moments get a floating Nova face.
          const evs = useKidStore.getState().events;
          const streakBefore = sessionStreak(evs.slice(0, -1));
          const streakNow = sessionStreak(evs);
          let wrongs = 0;
          for (let i = evs.length - 1; i >= 0; i--) {
            if (evs[i].correct) break;
            wrongs++;
          }
          if (mastered) novaReact("master");
          else if (questDone) novaReact("quest");
          else if (wrongs >= 3) novaReact("gentle");
          else if (wrongs === 2) novaReact("oops");
          else if (correct && streakNow >= 7) novaReact("superstar");
          else if (correct && streakNow >= 5) novaReact("amaze");
          else if (correct && streakNow >= 3) novaReact("cheer");
          else if (!correct && streakBefore >= 3) novaReact("setback");
          // GROWTH: a correct answer waters the garden — harder rounds water
          // more (#1190): level 4+ advances a stage in 2 instead of 3.
          if (correct) gardenWater(kid.id, difficulty >= 4 ? 2 : 1);
          // …and a skill that just crossed the mastery bar plants a trophy flower.
          // (masteryPlant dedupes per skill — one flower, ever. masteredBeforeRef
          //  is left untouched so the done-screen "New skill mastered!" still cheers.)
          if (mastered) {
            gardenMastery(kid.id, step.skillId, step.title);
            // PET + 🎉 #290 IN-THE-MOMENT: a brand-new mastery is the BIG moment —
            // the pet takes a step AND we celebrate RIGHT NOW with a confetti burst
            // + a spoken cheer, not just a badge on the done screen. One per skill.
            if (!masteredBeforeRef.current.has(step.skillId)) {
              useKidStore.getState().petGrowMastery(kid.id);
              // #1188 — mastery is the BIG moment: a distinct coin bonus (once
              // per skill, inside the daily cap) on top of the round payout.
              useKidStore.getState().novaChallengeReward(kid.id, NOVA_MASTERY_REWARD);
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
  }, [screen, world, kid, sessionIdx, reteachNonce, addEvent, novaAwardRound, novaQuestProgress, gardenWater, gardenMastery]);

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
        // #294 — if this session's streak update SPENT a freeze token, cheer
        // about it: the chain survived a missed day.
        const freezesBefore = useKidStore.getState().nova[kid.id]?.freezes ?? 0;
        novaCompleteSession(kid.id);
        recordSession(kid.id);
        if ((useKidStore.getState().nova[kid.id]?.freezes ?? 0) < freezesBefore) {
          tada();
          speak(t.freezeSpentSpeak);
        }
      }
      tada();
      cancelSpeech();
      // #253 — the session finished: drop any saved snapshot so a later switch
      // back starts fresh (a completed session is nothing to resume).
      if (kid) clearSavedSession(kid.id);
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
    clearSavedSession(kid.id); // #253 — explicit new session drops any saved one
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
    clearSavedSession(kid.id); // #253 — explicit new session drops any saved one
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

  /** 🚀 #249 — skip-ahead: the kid already knows the next lesson. Marks the
   *  skill mastered locally (journey advances past it) + logs an acceleration
   *  entry with the band jump, so the parent portal's acceleration plan shows
   *  exactly what was skipped and why. Purely additive — never silently deletes
   *  content; the parent sees every skip. */
  const skipAhead = (skill: Skill) => {
    if (!kid) return;
    click();
    setLimitNotice(null);
    const from = skill.band;
    const to = Math.min(5, from + 1);
    useKidStore.getState().accelSkip(kid.id, skill.id, "know", from, to);
    announce(t.skipLogged(skill.title));
    // If we just skipped the CURRENT journey stop, the journey advances to the
    // next unmastered skill on its own (mastered = done). Show a quick toast.
    setSkipNotice(t.skipDone);
    window.setTimeout(() => setSkipNotice(null), 2200);
  };

  const addKid = (name: string, avatar: string, birthYear: number, birthMonth?: number, birthDay?: number) => {
    const newKid: Kid = { id: genId(), name, avatar, birthYear, ...(birthMonth ? { birthMonth } : {}), ...(birthDay ? { birthDay } : {}) };
    const next = [...kids, newKid];
    setKids(next);
    invalidateKidsCache(); // #1218 — the memo must re-parse after a write
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

  // #285 — save a kid's mix-and-match avatar look (persisted per kid, offline).
  const updateKidAvatar = (kidId: string, parts: AvatarParts) => {
    const next = kids.map((k) => (k.id === kidId ? { ...k, avatarParts: parts } : k));
    setKids(next);
    invalidateKidsCache(); // #1218 — the memo must re-parse after a write
    try {
      localStorage.setItem("nv_kids", JSON.stringify(next));
    } catch {
      /* ignore */
    }
    // If the look changed for the active kid, refresh the selectKid cache too.
    if (kid?.id === kidId) {
      selectKid({ ...kid, avatarParts: parts });
    }
  };

  const curStep = sessionRef.current[sessionIdx];
  const curReteach = (curStep?.reteach ?? 0) > 0;
  // #292 — reteach moment: when a step flips into its remediation re-run,
  // Nova pops a "let's learn it together" face (once per transition).
  const prevReteachRef = useRef(0);
  useEffect(() => {
    const r = curStep?.reteach ?? 0;
    if (r > 0 && prevReteachRef.current === 0) novaReact("reteach");
    prevReteachRef.current = r;
  }, [sessionIdx, curStep?.reteach]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // #1207-#1216 — skills that are tiers of ONE family count once, so the
    // syllabus's "X mastered / Y" matches the one-concept number the kid sees.
    const totalCount = progressUnitCount();
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
              const p = kid ? worldProgress(skillsMap, kid.id, b.id) : { mastered: 0, total: progressUnitsInBand(b.id), pct: 0 };
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

  if (screen === "home" && kid) {
    return (
    <Suspense fallback={<ScreenFallback />}>
    <HomeScreen
      kid={kid}
      lang={lang}
      skillsMap={skillsMap}
      settings={settings}
      challenge={challenge}
      quest={quest}
      tourStep={tourStep}
      projector={projector}
      neural={neural}
      tts={tts}
      installEvt={installEvt}
      swActive={swActive}
      scanOpen={scanOpen}
      scanCode={scanCode}
      scanError={scanError}
      goalMin={goalMin}
      goalNotice={goalNotice}
      limitNotice={limitNotice}
      todayPlayed={todayPlayed}
      weekSkill={weekSkill}
      weekDone={weekDone}
      bdayClaimed={bdayClaimed}
      petFedToday={petFedToday}
      petProgress={petProgress}
      petSpecies={petSpecies}
      petStage={petStage}
      novaDayStreak={novaDayStreak}
      novaLastDay={novaLastDay}
      unclaimedBoxes={unclaimedBoxes}
      freezeCount={freezeCount}
      calendar={calendar}
      goalPct={goalPct}
      playLimitReached={playLimitReached}
      launchCardCode={launchCardCode}
      voiceFunVol={voiceFunVol}
      neuralFlash={neuralFlash}
      quietChrome={quietChrome}
      playRef={playRef}
      savedSessionsRef={savedSessionsRef}
      scanCanvasRef={scanCanvasRef}
      scanVideoRef={scanVideoRef}
      srLiveRef={srLiveRef}
      setScreen={setScreen}
      setScanCode={setScanCode}
      setScanError={setScanError}
      setScanOpen={setScanOpen}
      setGoalNotice={setGoalNotice}
      setTourStep={setTourStep}
      setVoiceFunVolState={setVoiceFunVolState}
      closeChallenge={closeChallenge}
      closeTour={closeTour}
      installApp={installApp}
      pickChallenge={pickChallenge}
      resumeSession={resumeSession}
      snapshotSession={snapshotSession}
      startChallenge={startChallenge}
      startContrastDrill={startContrastDrill}
      startPlayWorld={startPlayWorld}
      startSingleSkill={startSingleSkill}
      stopScanner={stopScanner}
      goAchievements={goAchievements}
      goAvatar={goAvatar}
      goBadges={goBadges}
      goCards={goCards}
      goGarden={goGarden}
      goNova={goNova}
    />
    </Suspense>
    );
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

            {/* #355 — haptic pulses on taps. Subtle, optional, fully off-able.
                On devices without vibration (e.g. iOS Safari) this row simply
                shows off — the audio module already no-ops there. */}
            <div className="settings-divider" />
            <div className="settings-row-line">
              <span className="settings-row-icon">📳</span>
              <span className="settings-row-label">{t.settingsHaptics}</span>
              <button
                className={`switch${hapticsOn ? " on" : ""}`}
                role="switch"
                aria-checked={hapticsOn}
                aria-label={t.settingsHaptics}
                onClick={toggleHaptics}
              >
                <span className="switch-thumb" />
              </button>
            </div>

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
            {/* 🧏 #250 — GLOBAL accessibility: big text + high contrast. Shared
                with the parent portal via one localStorage key (nv_a11y). */}
            <div className="settings-row-line">
              <span className="settings-row-icon">🔍</span>
              <span className="settings-row-label">
                <span>{t.a11yBigText}</span>
                <span className="settings-row-sub">{t.a11yBigTextSub}</span>
              </span>
              <button
                className={`switch${a11y.bigText ? " on" : ""}`}
                role="switch"
                aria-checked={a11y.bigText}
                aria-label={t.a11yBigText}
                onClick={() => {
                  const next = { ...a11y, bigText: !a11y.bigText };
                  setA11y(next);
                  writeA11y(next);
                  announce(next.bigText ? t.a11yBigTextOn : t.a11yBigTextOff); // #133
                }}
              >
                <span className="switch-thumb" />
              </button>
            </div>
            <div className="settings-row-line">
              <span className="settings-row-icon">🎨</span>
              <span className="settings-row-label">
                <span>{t.a11yHighContrast}</span>
                <span className="settings-row-sub">{t.a11yHighContrastSub}</span>
              </span>
              <button
                className={`switch${a11y.highContrast ? " on" : ""}`}
                role="switch"
                aria-checked={a11y.highContrast}
                aria-label={t.a11yHighContrast}
                onClick={() => {
                  const next = { ...a11y, highContrast: !a11y.highContrast };
                  setA11y(next);
                  writeA11y(next);
                  announce(next.highContrast ? t.a11yHighContrastOn : t.a11yHighContrastOff); // #133
                }}
              >
                <span className="switch-thumb" />
              </button>
            </div>
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
    if (secView !== "none" || !hasParentPin() || pinMode === "change" || pinRequired) {
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
      const secQ = SECURITY_QUESTIONS[Math.min(Math.max(Number(securityQuestionId()) || 0, 0), SECURITY_QUESTIONS.length - 1)];
      const secStepSub = secStep === "pick" ? t.secPickSub : secStep === "answer" ? t.secAnswerSub : "";
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

              {/* #247 — ASK view: recover a forgotten PIN via the security question */}
              {secView === "ask" ? (
                <div className="sec-view">
                  <h2 className="gate-title">{t.secAskTitle}</h2>
                  <p className="gate-sub">{t.secAskSub}</p>
                  <div className="sec-q">
                    <span className="sec-q-label">{t.secQuestion}</span>
                    <span className="sec-q-text">{secQ ? (lang === "bn" ? secQ.bn : secQ.en) : "—"}</span>
                  </div>
                  <input
                    className="sec-input"
                    type="text"
                    value={secAnswer}
                    placeholder={t.secAnswerPlaceholder}
                    autoFocus
                    onChange={(e) => { setSecAnswer(e.target.value); setSecError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") secRecover(); }}
                  />
                  {secError && <p className="gate-error" role="alert">{secError}</p>}
                  <div className="pin-row">
                    <button className="pin-btn" onClick={() => { setSecView("none"); resetSec(); }}>{t.secCancel}</button>
                    <button className="pin-btn pin-btn-primary" onClick={secRecover}>{t.secSave}</button>
                  </div>
                </div>
              ) : secView === "set" ? (
                <div className="sec-view">
                  {/* #247 — SET view: pick a question, then answer + confirm */}
                  <h2 className="gate-title">
                    {secStep === "pick" ? t.secPickTitle : secStep === "answer" ? t.secAnswerTitle : t.secConfirmTitle}
                  </h2>
                  <p className="gate-sub">{secStepSub}</p>
                  {secStep === "pick" && (
                    <div className="sec-questions">
                      {SECURITY_QUESTIONS.map((q, i) => (
                        <button
                          key={i}
                          className={`sec-q-opt${secQid === i ? " on" : ""}`}
                          onClick={() => { setSecQid(i); setSecError(null); }}
                        >
                          {lang === "bn" ? q.bn : q.en}
                        </button>
                      ))}
                    </div>
                  )}
                  {secStep === "answer" && (
                    <input
                      className="sec-input"
                      type="text"
                      value={secAnswer}
                      placeholder={t.secAnswerPlaceholder}
                      autoFocus
                      onChange={(e) => { setSecAnswer(e.target.value); setSecError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") setSecStep("confirm"); }}
                    />
                  )}
                  {secStep === "confirm" && (
                    <input
                      className="sec-input"
                      type="text"
                      value={secConfirm}
                      placeholder={t.secConfirmTitle}
                      autoFocus
                      onChange={(e) => { setSecConfirm(e.target.value); setSecError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") secSave(); }}
                    />
                  )}
                  {secError && <p className="gate-error" role="alert">{secError}</p>}
                  <div className="pin-row">
                    <button className="pin-btn" onClick={secSkip}>
                      {secStep === "pick" ? t.secSkip : t.secCancel}
                    </button>
                    <button
                      className="pin-btn pin-btn-primary"
                      onClick={() => {
                        if (secStep === "pick") { setSecStep("answer"); setSecError(null); }
                        else if (secStep === "answer") {
                          if (!secAnswer.trim()) { setSecError(t.secEmpty); return; }
                          setSecStep("confirm");
                          setSecError(null);
                        } else secSave();
                      }}
                    >
                      {secStep === "confirm" ? t.secSave : t.secNext}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="gate-title">{pinTitle}</h2>
                  <p className="gate-sub">{pinSub}</p>

                  {/* 4 digit dots */}
                  <div className="pin-dots" role="status" aria-label={`${pinDigits.length}/4`}>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={`pin-dot${i < pinDigits.length ? " filled" : ""}`} />
                    ))}
                  </div>

                  {pinError && <p className="gate-error" role="alert">{pinError}</p>}
                  {pinNotice && <p className="gate-notice" role="status">{pinNotice}</p>}

                  {/* keypad — hidden once the pad locks (3 wrong tries in unlock) */}
                  {!pinLocked && (
                    <div className="pin-pad">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                        <button key={d} className="pin-key" onClick={() => appendPinDigit(d)}>{d}</button>
                      ))}
                      <span className="pin-key pin-key-spacer" aria-hidden />
                      <button className="pin-key" onClick={() => appendPinDigit("0")}>0</button>
                      <button className="pin-key pin-key-back" aria-label="⌫" onClick={() => { setPinDigits((v) => v.slice(0, -1)); setPinError(null); setPinNotice(null); }}>⌫</button>
                    </div>
                  )}

                  {/* recovery: forgot PIN / locked pad. With a security question
                      set, "Forgot PIN?" opens the Q&A and resets IN PLACE — no
                      sign-out. Without one, the two-tap sign-out reset remains.
                      Only on the unlock pad (setup has no PIN to forget yet). */}
                  {hasParentPin() && pinMode === "unlock" && (
                    <div className="pin-recovery">
                      {hasSecurityQA() ? (
                        <button className="syllabus-banner-link" onClick={openSecAsk}>{t.pinForgot}</button>
                      ) : (
                        <button className="syllabus-banner-link" onClick={pinForgot}>
                          {pinForgotArmed ? t.pinResetArmed : t.pinForgot}
                        </button>
                      )}
                      <p className="gate-guest-sub">{t.pinForgotSub}</p>
                    </div>
                  )}

                  <p className="gate-privacy">{t.pinKeep}</p>
                </>
              )}
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

              {/* #247 — PIN recovery question. Set/changed from here (the panel
                  is already PIN-verified); when the QA view opens, the pin gate
                  renders it over the panel. */}
              <div className="parent-card settings-signout-card pin-lock-card">
                <div className="parent-head">
                  <span className="parent-name">{t.secPanelTitle}</span>
                  <span className="parent-stats">{hasSecurityQA() ? "✓" : "❓"}</span>
                </div>
                <p className="syllabus-settings-sub">
                  {hasSecurityQA() ? `${t.secPanelHas} — ${t.secPanelSub}` : t.secPanelSub}
                </p>
                <button
                  className="big-btn settings-signout-btn pin-lock-btn"
                  onClick={() => {
                    resetSec();
                    setSecView("set");
                  }}
                >
                  {hasSecurityQA() ? t.secPanelChange : t.secPanelSet}
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
                  const kidTotal = progressUnitCount();
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
                              progressUnitCount()
                                ? Math.round((totalMastered(skillsMap, activeKid.id) / progressUnitCount()) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="parent-sub">
                        {totalMastered(skillsMap, activeKid.id)}/{progressUnitCount()} · {t.starsTotal(stats[activeKid.id]?.stars ?? 0)} · {t.points(stats[activeKid.id]?.score ?? 0)} · {t.sessions(stats[activeKid.id]?.sessions ?? 0)}
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
                      skills={filterSkills}
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

  // #272 — SAFETY: parent kill-switch. When the parent pauses this kid, show a
  // kid-safe "learning break" screen INSTEAD of any play screen (home, worlds,
  // games, everything). `settings.paused` comes from the server AND the
  // on-device cache, so the pause holds across reloads and offline. The resume
  // effect above drops the kid back to a fresh home when it flips off.
  if (settings.paused && kid) {
    return (
      <div className="app">
        <main className="screen pause-screen">
          <div className="pause-sky" aria-hidden="true">
            {["☁️", "⭐", "🌙", "☁️", "⭐", "☁️"].map((e, i) => (
              <span key={i} className={`pause-sky-float f${i}`}>{e}</span>
            ))}
          </div>
          <div className="pause-mascot" role="img" aria-label="Nova resting">
            <Icon name="nova" size={96} />
          </div>
          <h1 className="title">{t.pauseTitle}</h1>
          <p className="pause-body">{t.pauseBody}</p>
          <div className="pause-z" aria-hidden="true">💤</div>
          <p className="pause-note">{t.pauseBackSoon}</p>
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
                  onClick={() => switchKidPreserving(k)}
                >
                  <span className="world-emoji"><KidAvatar kid={k} size={46} /></span>
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
    return (
      <Suspense fallback={<ScreenFallback />}>
        <AddKidForm t={t} lang={lang} onSave={addKid} onCancel={() => setScreen("kidpick")} />
      </Suspense>
    );
  }

  /* #285 — Custom avatar builder: mix-and-match base + hat + glasses + outfit
     to build a unique buddy. Live preview, per-part rows (7 options each +
     "none"), saved per kid, fully offline. */
  if (screen === "avatar" && kid) {
    return (
      <AvatarBuilder
        kid={kid}
        t={t}
        lang={lang}
        onSave={(parts) => {
          updateKidAvatar(kid.id, parts);
          tada();
          speak(lang === "bn" ? t.avatarSaveSpeak(kid.name) : t.avatarSaveSpeak(kid.name));
          setScreen("home");
        }}
        onBack={() => setScreen("home")}
        onNova={() => setScreen("nova")}
      />
    );
  }

  /* ── Mastery Card Album: every mastered lesson = a collectible card. ── */
  if (screen === "cards" && kid) {
    const collected = totalMastered(skillsMap, kid.id);
    const totalCards = journeyStops().length;
    const rank = rankFor(collected, lang);
    return (
      <div className="app">
        <main className="screen cards-screen">
          {/* #248 — quiet-hours dim + 🌙 badge */}
          {quietChrome}
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
          {/* #248 — quiet-hours dim + 🌙 badge */}
          {quietChrome}
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
                          {settings.focus_subject && settings.focus_band === b.id && (
                            <span
                              className="map-focus-pin"
                              title={t.focusChip(
                                FOCUS_SUBJECT_LABELS[settings.focus_subject]?.[lang === "bn" ? "bn" : "en"] ?? settings.focus_subject,
                                b.id
                              )}
                            >
                              📌
                            </span>
                          )}
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

          {/* 🚀 #249 — skip-ahead: "I already know this". Logs an acceleration
              entry (band jump) so the parent portal's plan shows the skip. */}
          {nextSkill && (
            <div className="skip-row">
              <button
                className="skip-chip"
                onClick={() => skipAhead(nextSkill)}
                aria-label={t.skipAheadHint(nextSkill.title)}
              >
                <span className="skip-chip-ico">⏭</span>
                <span className="skip-chip-txt">{t.skipAhead}</span>
              </button>
              {skipNotice && <span className="skip-toast" role="status">{skipNotice}</span>}
            </div>
          )}

          {/* #276 — per-land SKILL TREE: every skill is a leaf on the trunk,
              mastered leaves GLOW, the next lesson pulses, and tapping any leaf
              jumps straight into that lesson. Locale-packed (#131), offline. */}
          <div className="tree-wrap" role="status" aria-label={t.treeTitle}>
            <div className="tree-head">
              <span className="tree-title">{t.treeTitle}</span>
              <span className="tree-hint">{t.treeHint}</span>
            </div>
            <div className="skill-tree">
              <div className="tree-trunk" aria-hidden="true" />
              {bandSkills.map((skill, i) => {
                const st = skillsMap[`${kid.id}:${skill.id}`];
                const pct = st ? Math.round(st.pMastered * 100) : 0;
                const mastered = pct >= MASTERY_THRESHOLD * 100;
                const isNext = nextSkill?.id === skill.id;
                const side = i % 2 === 0 ? "left" : "right";
                const title = lang === "bn" ? skill.titleBn ?? skill.title : skill.title;
                return (
                  <div key={skill.id} className={`tree-row ${side}`}>
                    <button
                      className={`tree-node${mastered ? " done" : isNext ? " next" : " open"}${isNext ? " is-next" : ""}`}
                      onClick={() => startSingleSkill(skill)}
                      aria-label={`${title} · ${mastered ? pct + "%" : isNext ? t.nextBadge : pct + "%"}`}
                    >
                      <span className="tree-node-emoji"><Icon name={skill.subject} size={26} /></span>
                      <span className="tree-node-meta">
                        <span className="tree-node-title">{title}</span>
                        {skill.titleBn ? <span className="tree-node-bn">{skill.titleBn}</span> : null}
                        <span className="tree-node-bar"><span className={`tree-node-fill${mastered ? " done" : ""}`} style={{ width: `${pct}%` }} /></span>
                      </span>
                      <span className="tree-node-state">
                        {mastered ? "✓" : isNext ? "▶" : `${pct}%`}
                      </span>
                      {isNext && <span className="next-badge">{t.nextBadge}</span>}
                    </button>
                    <span className="tree-spacer" aria-hidden="true" />
                  </div>
                );
              })}
            </div>
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
          {/* #248 — quiet-hours dim + 🌙 badge */}
          {quietChrome}
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
    const wk = skillOfWeek(skillsMap, kid.id);
    const ctx = { sessions: badgeStats.sessions, stars: badgeStats.stars, streak: badgeStreak, worlds: fullyMasteredWorlds(skillsMap, kid.id), weekDone: !!wk && skillMastered(skillsMap, kid.id, wk.id) };
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

  /* #289 — Long-term Achievements Book: milestones ACROSS weeks (100 rounds,
     10 skills, streaks, lands, coins, pets). A card pops with a glow when it
     unlocks — the unlock animation. All offline (local stats only). */
  if (screen === "achievements" && kid) {
    const ctx: AchCtx = {
      sessions: achStats.sessions,
      stars: achStats.stars,
      mastered: totalMastered(skillsMap, kid.id),
      streak: achStreak,
      coins: achCoins,
      worlds: fullyMasteredWorlds(skillsMap, kid.id),
      pets: achPets,
      petStage: achPetStage,
    };
    const unlocked = storedAchs;
    const justNew = earnedAchKey ? earnedAchKey.split(",").filter(Boolean) : [];
    const unlockedCount = ACHIEVEMENTS.filter((a) => a.earned(ctx)).length;
    return (
      <div className="app">
        <main className="screen ach-screen">
          <header className="screen-head">
            <button className="icon-btn" onClick={() => setScreen("home")} aria-label={t.back}>‹</button>
            <div className="head-title">
              <h2>{t.achTitle}</h2>
              <p className="head-sub">{t.achSub(unlockedCount, ACHIEVEMENTS.length)}</p>
            </div>
            <button className="icon-btn nova-hud-btn" onClick={goNova} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
          </header>

          <div className="ach-grid">
            {ACHIEVEMENTS.map((a) => {
              const earned = a.earned(ctx);
              const isNew = earned && justNew.includes(a.id);
              return (
                <button
                  key={a.id}
                  className={`ach-card${earned ? " earned" : " locked"}${isNew ? " pop" : ""}`}
                  onClick={() => speak(lang === "bn" ? t.achNewSpeak(kid.name, a.nameBn) : t.achNewSpeak(kid.name, a.name))}
                  aria-label={earned ? t.badgeEarned : t.badgeLocked}
                >
                  <span className="ach-emoji" aria-hidden="true">{earned ? a.emoji : "🔒"}</span>
                  <span className="ach-name">{lang === "bn" ? a.nameBn : a.name}</span>
                  <span className="ach-hint">{lang === "bn" ? a.hintBn : a.hint}</span>
                  <span className={`ach-state${earned ? " earned" : ""}`}>{earned ? t.achUnlocked : t.achLocked}</span>
                </button>
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

  /* 🦉 #684 — the 3D island is its own screen (no Phaser mounts here; the
     R3F canvas owns the WebGL context). onBack2d returns to the 2D Nova home
     where the pet games live. */
  if (screen === "nova3d") {
    return (
      <Suspense fallback={<div className="nova3d-loading" aria-live="polite">{t.islandLoading}</div>}>
        <Nova3DHome
          kidName={kid?.name ?? ""}
          kidId={kid?.id ?? ""}
          onBack2d={() => setScreen("nova")}
          onExit={() => setScreen("home")}
        />
      </Suspense>
    );
  }

  if (screen === "nova" || screen === "playing" || screen === "garden") {
    const inGame = screen === "playing";
    const inGarden = screen === "garden";
    const inNova = screen === "nova";
    return (
      <div className="app game-app">
        {/* #684 — the 3D island is an OPT-IN surface on top of 2D Nova: it
            stops Phaser first (single WebGL context) and falls back if the
            device has no WebGL. The 2D Nova home stays the default. */}
        {inNova && kid && (
          <button
            className="island-fab"
            onClick={() => setScreen("nova3d")}
            aria-label={t.island3dBtn}
            title={t.island3dBtn}
          >
            {t.island3dBtn}
          </button>
        )}
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
              <span className="hud-coins">
                🪙 {novaCoins}
                {coinsCapped && <em className="hud-coins-maxed" title={t.hudCoinsMaxed} aria-label={t.hudCoinsMaxed}>🎯</em>}
              </span>
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
        {/* #1186 — visible engine state: a spinner during the async chunk load,
            and a tap-to-retry when the chunk fails (never a silent blank canvas). */}
        {gameBoot === "error" && (
          <div className="game-boot-error" role="alert">
            <p>{lang === "bn" ? "খেলা শুরু করতে আবার চেষ্টা করো" : "Tap to retry the game"}</p>
            <button onClick={() => setGameBootNonce((n) => n + 1)}>↻</button>
          </div>
        )}
        {gameBoot !== "ready" && gameBoot !== "error" && (
          <div className="game-boot-loading" role="status" aria-label={lang === "bn" ? "খেলা লোড হচ্ছে…" : "Loading game…"}>
            <span className="game-boot-spinner" aria-hidden="true" />
          </div>
        )}
        {/* #292 — Nova reaction pack v2: a floating Nova face bubble for win
            streaks / setbacks / reteach moments. Rendered as a DOM overlay so
            it works over EVERY game scene (no Phaser changes needed). */}
        {novaReaction && inGame && (
          <div key={novaReaction.nonce} className="nova-react" role="status" aria-label={lang === "bn" ? NOVA_REACTIONS[novaReaction.kind].lineBn() : NOVA_REACTIONS[novaReaction.kind].lineEn()}>
            <span className="nova-react-owl" aria-hidden="true"><Icon name="nova" size={44} /></span>
            <span className="nova-react-emoji" aria-hidden="true">{NOVA_REACTIONS[novaReaction.kind].emoji}</span>
            <span className="nova-react-line">{lang === "bn" ? NOVA_REACTIONS[novaReaction.kind].lineBn() : NOVA_REACTIONS[novaReaction.kind].lineEn()}</span>
          </div>
        )}
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

/** In-game "Add a kid" form — no browser prompts. Parent fills name, picks avatar + birth year. */