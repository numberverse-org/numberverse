/* HomeScreen — the journey-first home for the active kid (extracted from App.tsx, #589).
 * Renders null when no kid is active (App falls through to the picker). */
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  recommendedSkill, journeyState, journeyCurrentIndex, currentSeason, isBirthday, skillMastered,
  worldProgress, worldEmoji, worldUnlocked, totalMastered, subjectForSkill, journeyStops, cardDate,
  rankFor, challengeQ, challengeNovaChance, RANKS, TOUR_STEPS, CHALLENGE_ROUNDS, CHALLENGE_MIN_LEVEL,
  CHALLENGE_MAX_LEVEL, FOCUS_SUBJECT_LABELS, SUBJECT_CARD, worldCards, CONTRAST_TEMPLATES,
  filterSkills, moniPlanFor, SEASON_EMOJI, SEASON_PARTICLES, kidBand, skillTitle, skillDesc,
} from "../lib/journey";
import { STR, bnNum, type Lang, type Strings } from "../i18n";
import { useKidStore, todayIso, dayIsoAgo, NOVA_QUEST_REWARD, NOVA_BIRTHDAY_COINS, NOVA_CALENDAR_REWARDS, NOVA_SPECIES, speciesById, speciesEmoji, questTypeFor, QUEST_TARGETS, type QuestType } from "../store";
import { BANDS, type Band, type Skill } from "@numberverse/core";
import { tada } from "../game/audio";
import { currentFestival } from "../game/locale";
import { speak, getVoiceFunVolume, setVoiceFunVolume, resetVoiceFunVolume, speechStatus } from "../game/speech";
import { Icon } from "./Icon";
import type { KidSettings } from "../api";
import type { SavedSession, SkillMap, ChallengeQ, Kid } from "../lib/journey";
import type { SpeechReadiness } from "../game/speech";
import type { Screen } from "../App";
import { KidAvatar } from "./Avatar";

export interface HomeScreenProps {
  kid: Kid | null;
  lang: Lang;
  skillsMap: SkillMap;
  settings: KidSettings;
  challenge: {
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
  } | null;
  quest: { type: QuestType; progress: number; target: number; done: boolean; today: boolean; reward: number };
  tourStep: number | null;
  projector: boolean;
  neural: ReturnType<typeof speechStatus>["neural"];
  /** #1318 — retry the failed neural-voice download (App re-arms its poll). */
  onRetryNeural: () => void;
  tts: SpeechReadiness | null;
  installEvt: Event | null;
  swActive: boolean;
  scanOpen: boolean;
  scanCode: string;
  scanError: string | null;
  goalMin: number;
  goalNotice: boolean;
  limitNotice: string | null;
  todayPlayed: number;
  weekSkill: Skill | undefined;
  weekDone: boolean;
  bdayClaimed: boolean;
  petFedToday: boolean;
  petProgress: number;
  petSpecies: string;
  petStage: number;
  novaDayStreak: number;
  novaLastDay: string;
  unclaimedBoxes: Skill[];
  freezeCount: number;
  calendar: { pos: number; claimable: boolean; claimedToday: boolean } | null;
  /** #767 — today's coins are capped but a box/calendar bonus is waiting. */
  capWaiting: boolean;
  /** #769 — garden summary for the home teaser (null when no kid). */
  gardenTile: { plants: number; fruits: number; fresh: boolean } | null;
  /** #770 — one un-attempted game to try when today's quest is 'newgame'. */
  freshSkillHint: Skill | null;
  goalPct: number;
  playLimitReached: boolean;
  /** #1453/#1454 — the cap wind-down/sleep veil, rendered over home like quietChrome. */
  capChrome: React.ReactNode;
  /** #1368 — the goal nudge's "take a break" routes to the real break screen. */
  onGoalBreak: () => void;
  launchCardCode: (raw: string) => void;
  voiceFunVol: number;
  neuralFlash: boolean;
  quietChrome: React.ReactNode;
  playRef: React.MutableRefObject<(() => void) | null>;
  savedSessionsRef: React.MutableRefObject<Record<string, SavedSession>>;
  scanCanvasRef: React.RefObject<HTMLCanvasElement>;
  scanVideoRef: React.RefObject<HTMLVideoElement>;
  srLiveRef: React.RefObject<HTMLDivElement>;
  setScreen: (s: Screen) => void;
  setScanCode: (v: string) => void;
  setScanError: (v: string | null) => void;
  setScanOpen: (v: boolean) => void;
  setGoalNotice: (v: boolean) => void;
  setTourStep: React.Dispatch<React.SetStateAction<number | null>>;
  setVoiceFunVolState: (v: number) => void;
  closeChallenge: () => void;
  closeTour: (finished?: boolean) => void;
  installApp: () => void;
  pickChallenge: (i: number) => void;
  resumeSession: (saved: SavedSession) => void;
  snapshotSession: (kidId: string) => void;
  startChallenge: () => void;
  startContrastDrill: (code: string, skillId: string) => void;
  startPlayWorld: (b: Band) => void;
  startSingleSkill: (s: Skill) => void;
  stopScanner: () => void;
  goAchievements: () => void;
  goAvatar: () => void;
  goBadges: () => void;
  goCards: () => void;
  goGarden: () => void;
  goNova: () => void;
  /** Labeled parent-portal door on the home corner — 1 tap → goParent (PIN gate). */
  onParent: () => void;
  /** #1394 — persistent guest-mode warning (local-only progress). */
  guestMode: boolean;
  /** #1391 — one-tap upgrade path for a guest to sign in / create an account. */
  onGuestUpgrade: () => void;
}

export default function HomeScreen({
  kid, lang, skillsMap, settings, challenge, quest, tourStep, projector, neural, onRetryNeural, tts, installEvt,
  swActive, scanOpen, scanCode, scanError, goalMin, goalNotice, limitNotice, todayPlayed, weekSkill,
  weekDone, bdayClaimed, petFedToday, petProgress, petSpecies, petStage, novaDayStreak, novaLastDay,
  unclaimedBoxes, freezeCount, calendar, capWaiting, gardenTile, freshSkillHint, goalPct, playLimitReached, capChrome, onGoalBreak, launchCardCode, voiceFunVol,
  neuralFlash, quietChrome, playRef, savedSessionsRef, scanCanvasRef, scanVideoRef, srLiveRef,
  setScreen, setScanCode, setScanError, setScanOpen, setGoalNotice, setTourStep, setVoiceFunVolState,
  closeChallenge, closeTour, installApp, pickChallenge, resumeSession, snapshotSession, startChallenge,
  startContrastDrill, startPlayWorld, startSingleSkill, stopScanner, goAchievements, goAvatar,
  goBadges, goCards, goGarden, goNova, onParent, guestMode, onGuestUpgrade,
}: HomeScreenProps) {
  const t = STR[lang];
    // #1122 — the journey view (recommended next skill + the stop path around
    // "you are here") is one memoized unit keyed on [skillsMap, kid.id], so an
    // unrelated store tick re-renders Home without re-sweeping the 135-stop
    // journey. Null when no active kid (the picker renders instead).
    const journeyView = useMemo(() => {
      if (!kid) return null;
      const rec = recommendedSkill(skillsMap, kid.id);
      const stops = journeyState(skillsMap, kid.id);
      const doneCount = stops.filter((s) => s.done).length;
      const hereIdx = journeyCurrentIndex(stops);
      return {
        rec,
        stops,
        doneCount,
        hereIdx,
        journeyDone: stops.length > 0 && doneCount === stops.length,
        homeStops: stops.slice(Math.max(0, hereIdx - 2), hereIdx + 3),
      };
    }, [skillsMap, kid]); // kid object is stable App state; only kid-switch re-sweeps
    // Home is JOURNEY-FIRST: Nova greets the kid by name + streak, the kid's
    // avatar stands on their glowing spot on the path, and one tap plays the
    // next stop. No choice-paralysis — the app remembers who's playing.
    // (If no kid is active we fall through to the picker below.)
    if (kid && journeyView) {
      const { rec: recSkill, stops, doneCount, hereIdx, journeyDone, homeStops } = journeyView;
      const onPlay = () => {
        // #253 — if this kid left a mid-game session behind, RESUME it instead
        // of starting fresh (never loses the current session on a kid switch).
        const saved = savedSessionsRef.current[kid.id];
        if (saved && saved.steps.length) {
          resumeSession(saved);
          return;
        }
        if (recSkill) startSingleSkill(recSkill);
        else startPlayWorld(BANDS[0]);
      };
      playRef.current = onPlay; // #136 — projector keyboard nav uses this
      // "You are here" — the current spot on the one learning path. (journeyView
      // above is the memoized source of recSkill/stops/doneCount/hereIdx/etc.)
      // The journey path wears the real season (snow/flowers/fireflies/leaves).
      const season = currentSeason();
      // Streak kindness: a stale flame (missed ≥1 day) is a silent punishment.
      // When the kid returns after a miss, hide the badge and greet warmly —
      // the streak restarts on their first session, no guilt, no lecture.
      const missedDay = !!novaLastDay && novaLastDay !== todayIso() && novaLastDay !== dayIsoAgo(1);
      // #1474 — the streak badge names what TOMORROW pays (the next calendar
      // tile), so the come-back hook is visible at the top, not buried below.
      const nextCalendarCoins = calendar ? NOVA_CALENDAR_REWARDS[calendar.pos % NOVA_CALENDAR_REWARDS.length] : 0;
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
      // #1162 — age-graded reward surface. Bands 1–4 keep the nursery pet;
      // bands 5–7 (ages ~10–15) get a dignified mission bar instead of a
      // "feed the baby animal" ritual. Missing/zero birthYear → band 1 → pet.
      const rewardBand = kidBand(kid);
      const showMission = rewardBand >= 5;
      const kidNova = useKidStore.getState().nova[kid.id];
      const badgeCount = kidNova?.badges?.length ?? 0;
      const achCount = kidNova?.achievements?.length ?? 0;
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
      // #286 — star-of-the-week recap: the trailing 7 days (today back 6),
      // derived PURELY offline from local play. Top skill = the game skill
      // most practiced this week (by attempts among skills practiced in the
      // window); biggest win = new masteries this week, else the standing
      // streak. Spoken option reads it aloud.
      const weekStartIso = dayIsoAgo(6);
      const weekEndIso = todayIso();
      const weekStartMs = Date.parse(weekStartIso);
      const weekEndMs = Date.parse(weekEndIso) + 86399999;
      const weekPlayed = (useKidStore.getState().nova[kid.id]?.days ?? []).filter(
        (d) => d >= weekStartIso && d <= weekEndIso
      );
      const weekSkills = filterSkills.filter(
        (s) =>
          s.game &&
          (skillsMap[`${kid.id}:${s.id}`]?.lastPractice ?? 0) >= weekStartMs &&
          (skillsMap[`${kid.id}:${s.id}`]?.lastPractice ?? 0) <= weekEndMs
      );
      const topSkill = weekSkills
        .slice()
        .sort(
          (a, b) =>
            (skillsMap[`${kid.id}:${b.id}`]?.attempts ?? 0) - (skillsMap[`${kid.id}:${a.id}`]?.attempts ?? 0)
        )[0];
      const masteredWeek = weekSkills.filter((s) => skillMastered(skillsMap, kid.id, s.id)).length;
      const recapWin =
        masteredWeek > 0 ? t.recapWinMastered(masteredWeek) : novaDayStreak >= 3 ? t.recapWinStreak(novaDayStreak) : "";
      const recapSpeakText = topSkill
        ? t.recapSpeak(kid.name, weekPlayed.length, lang === "bn" ? topSkill.titleBn ?? topSkill.title : topSkill.title, recapWin)
        : "";
      return (
        <div className={`app play-app${projector ? " projector-mode" : ""}`}>
          {/* #133 — screen-reader live region: announces game + settings state. */}
          <div id="sr-live" aria-live="polite" className="sr-only" ref={srLiveRef} />
          {/* #248 — quiet-hours dim + 🌙 badge (home + game share this root) */}
          {quietChrome}
          {/* #1453/#1454 — cap wind-down + sleep veil (soft, never blocks) */}
          {capChrome}
          <main className="screen play-screen">
            <div className="play-top">
              <button
                className="kid-chip"
                onClick={() => {
                  snapshotSession(kid.id); // #253 — preserve the in-flight session
                  setScreen("kidpick");
                }}
                aria-label={t.switchKid(kid.avatar, kid.name)}
              >
                <KidAvatar kid={kid} size={30} />
                <span className="kid-chip-name">{kid.name}</span>
                <span className="kid-chip-swap" aria-hidden="true">⇄</span>
              </button>
              <div className="play-top-right">
                {!projector && (
                  <>
                    <button
                      className={`voice-chip${voiceOk === false || neural.state === "error" ? " warn" : ""}${neural.ready ? " neural-ready" : ""}`}
                      onClick={() => setScreen("settings")}
                      aria-label={neural.state === "loading" ? t.voiceNeuralLoading(Math.min(100, Math.round(neural.progress * 100))) : t.settingsVoice}
                      title={neural.state === "loading" ? t.voiceNeuralLoading(Math.min(100, Math.round(neural.progress * 100))) : neural.state === "error" ? t.voiceDlFailed : undefined}
                    >
                      {/* #1409 — downloading chip carries the live % (no more
                          state-less hourglass); then ready/failed as before. */}
                      {neural.state === "loading" ? (
                        <span className="voice-chip-pct" aria-hidden="true">{Math.min(100, Math.round(neural.progress * 100))}</span>
                      ) : (
                        <span className="voice-chip-glyph" aria-hidden="true">{neural.state === "error" ? "⚠️" : voiceOk === false ? "🔇" : neural.ready ? "🎙️" : "🔊"}</span>
                      )}
                      {/* #1397 — the settings trigger says what it is, not just a
                          tooltip: the voice state stays in the glyph, the label
                          keeps it readable for pre-readers and parents alike. */}
                      <span className="voice-chip-label">{t.settingsTitle}</span>
                    </button>
                    {/* #1395 — one settings trigger, not two: the voice-chip
                        already opens Settings and carries the voice state. */}
                    {/* #139 — flashcard QR → mini-game: scan (or type) a card. */}
                    <button
                      className="scan-btn"
                      onClick={() => { setScanCode(""); setScanError(null); setScanOpen(true); }}
                      aria-label={t.scanCard}
                      title={t.scanCard}
                    >
                      <span className="scan-btn-glyph" aria-hidden="true">📷</span>
                      {/* #1397 — the scan trigger says what it does (visible
                          label), instead of relying on the camera glyph alone. */}
                      <span className="scan-btn-label">{t.scanShort}</span>
                    </button>
                    {/* #parent-door — the grown-up corner: ONE labeled tap opens
                        the parent portal. goParent() re-arms the PIN gate, so a
                        kid tapping it lands on the gate — never the analytics. */}
                    <button className="parent-btn" onClick={onParent} aria-label={t.parentDoor}>
                      <span className="parent-btn-emoji" aria-hidden="true">👨‍👩‍👧</span>
                      <span className="parent-btn-label">{t.parentDoor}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* #1394 — guest mode is a persistent state, not a hidden one: a slim
                banner names the local-only risk and offers the upgrade path. */}
            {guestMode && (
              <div className="syllabus-guest-banner home-guest-banner" role="status">
                <span className="syllabus-guest-emoji" aria-hidden="true">👀</span>
                <p className="syllabus-guest-text">
                  {t.guestModeWipe}{" "}
                  <button className="syllabus-banner-link" onClick={onGuestUpgrade}>
                    {t.guestUpgradeCta}
                  </button>
                </p>
              </div>
            )}

            {/* 🎙️ On-device Bangla voice — first-use download banner (live %),
                then a 5s "ready ✓" flash. Appears ONCE; after that the voice is
                cached offline, so kids never see permanent noise. #1318 — a
                failed download (flaky Wi-Fi) shows the honest message + a
                visible Retry instead of silently falling back forever. */}
            {neural.state === "error" ? (
              <div className="voice-dl-banner warn" role="status">
                <span>⚠️ {t.voiceDlFailed}</span>
                <button className="voice-dl-retry" onClick={onRetryNeural}>
                  {t.voiceRetry}
                </button>
              </div>
            ) : neural.state === "loading" ? (
              <div className="voice-dl-banner" role="status">
                🎙️ {t.voiceNeuralLoading(Math.min(100, Math.round(neural.progress * 100)))}
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
                  // #768 — the freeze-token safety net is visible right on the
                  // streak badge, so the kid KNOWS a missed day is covered.
                  <span className="home-streak" role="status" title={freezeCount > 0 ? t.freezePill(freezeCount) : undefined}>
                    🔥 {novaDayStreak}{freezeCount > 0 ? <em className="home-freeze">{t.freezePill(freezeCount)}</em> : null}
                    {calendar && nextCalendarCoins > 0 ? <em className="home-streak-tomorrow">{t.streakTomorrow(nextCalendarCoins)}</em> : null}
                  </span>
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
                    return `${skillTitle(recSkill, lang)} · ${band?.title ?? ""} · ${t.skillsProg(prog.mastered, prog.total)}`;
                  })()}
                </span>
              )}
              {recSkill && (
                <span className="play-btn-desc">
                  {skillDesc(recSkill, lang)} · {t.classLabel(recSkill.classNumber ?? recSkill.band)}
                </span>
              )}
            </button>

            {/* 🏅 #100 — skill of the week: one highlighted skill each week
                (deterministic rotation, offline-safe). Tap it to play; finishing
                it earns the Week Warrior badge. */}
            {weekSkill && (
              <div className={`week-card${weekDone ? " done" : ""}`} role="status" aria-label={t.weekTitle}>
                <span className="week-card-icon" aria-hidden="true">{weekDone ? "🏅" : "🗓️"}</span>
                <div className="week-card-body">
                  <span className="week-card-title">{t.weekTitle}</span>
                  <button className="week-card-skill" onClick={() => startSingleSkill(weekSkill)} aria-label={t.playWith(skillTitle(weekSkill, lang))}>
                    {weekDone ? `✓ ${skillTitle(weekSkill, lang)}` : `▶ ${skillTitle(weekSkill, lang)}`}
                  </button>
                  <span className="week-card-desc">{skillDesc(weekSkill, lang)}</span>
                  <span className="week-card-line">
                    {weekDone ? t.weekDone : t.weekSub} · {t.classLabel(weekSkill.classNumber ?? weekSkill.band)}
                  </span>
                </div>
              </div>
            )}

            {/* #1396 — the living world is VISIBLE, not buried: Nova (the
                friend) and the Garden (the growing thing) get a persistent
                one-tap strip right under the week card, so a kid landing on
                home SEES their owl + garden. Everything else stays in More. */}
            <div className="home-wilds" role="group" aria-label={t.wildsLabel}>
              <button className="wild-tile" onClick={goNova}>
                <span className="wild-tile-emoji" aria-hidden="true"><Icon name="nova" size={26} /></span>
                <span className="wild-tile-label">{t.novaMeet}</span>
              </button>
              <button className="wild-tile" onClick={goGarden}>
                <span className="wild-tile-emoji" aria-hidden="true">🌱</span>
                <span className="wild-tile-label">{t.gardenTile}</span>
                {gardenTile && (gardenTile.plants === 0 && gardenTile.fruits === 0 ? (
                  <span className="wild-tile-sum wild-tile-empty">{t.gardenTileEmpty}</span>
                ) : (
                  <span className="wild-tile-sum">
                    {t.gardenTileSum(gardenTile.plants, gardenTile.fruits)}
                    {gardenTile.fresh && <em className="garden-tile-fresh">{t.gardenTileFresh}</em>}
                  </span>
                ))}
              </button>
            </div>

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

            {/* Daily Quest — the visible "come back every day" goal. The mission
                TYPE rotates per kid per day (play rounds / earn stars / master a
                skill / try a new game), and every type pays the same bonus. When
                the parent's playtime cap already blocks play, a "0/N" bar is an
                unreachable goal → a warm rest line instead, never guilt. */}
            <div className={`quest-chip${quest.done ? " done" : questBlocked ? " rest" : ""}`} role="status">
              <span className="quest-title">{t.questTitle}</span>
              {quest.done ? (
                <span className="quest-line">
                  {t.questDoneText} <span className="quest-reward">{t.questReward(quest.reward)}</span>
                </span>
              ) : questBlocked ? (
                <span className="quest-line">{t.questRest}</span>
              ) : (
                <span className="quest-line">
                  <span className="quest-goal">
                    {quest.type === "rounds" ? t.questTypeRounds(quest.target)
                      : quest.type === "stars" ? t.questTypeStars(quest.target)
                      : quest.type === "master" ? t.questTypeMaster(quest.target)
                      : t.questTypeNewgame(quest.target)}
                  </span>
                  {t.questProgress(Math.min(quest.progress, quest.target), quest.target)}
                  <span className="quest-bar"><span className="quest-fill" style={{ width: `${Math.min(100, (quest.progress / quest.target) * 100)}%` }} /></span>
                </span>
              )}
            </div>
            {/* #770 — a 'newgame' quest day is opaque ("try 1 new game") — name
                ONE un-attempted skill to play, tappable straight into it. When
                every game's been tried, a warm "play anything" fallback instead. */}
            {quest.type === "newgame" && !quest.done && (
              freshSkillHint ? (
                <button className="fresh-skill-hint" onClick={() => startSingleSkill(freshSkillHint)} role="status">
                  <span className="fresh-skill-emoji" aria-hidden="true">🆕</span>
                  <span className="fresh-skill-txt">
                    <span className="fresh-skill-title">{t.questFreshTry}</span>
                    <span className="fresh-skill-name">{lang === "bn" ? freshSkillHint.titleBn ?? freshSkillHint.title : freshSkillHint.title}</span>
                  </span>
                  <span className="fresh-skill-go">{t.questFreshPlay} →</span>
                </button>
              ) : (
                <div className="fresh-skill-hint fresh-skill-none" role="status">
                  <span className="fresh-skill-emoji" aria-hidden="true">🆕</span>
                  <span className="fresh-skill-txt">
                    <span className="fresh-skill-title">{t.questFreshTry}</span>
                    <span className="fresh-skill-name">{t.questFreshNone}</span>
                  </span>
                </div>
              )
            )}
            {/* #281 — 7-day login calendar: a growing coin bonus per consecutive
                play day. One tap per day, fully offline, inside the anti-grind cap.
                Day 1..7 of the cycle; past tiles ✓, today's tile pulses when ready,
                future tiles 🔒. */}
            {calendar ? (
              <div className="cal-chip" role="status" aria-label={t.calendarTitle}>
                <div className="cal-head">
                  <span className="cal-title">{t.calendarTitle}</span>
                  <span className="cal-hint">
                    {freezeCount > 0 && <span className="freeze-pill" title={t.freezePill(freezeCount)}>{t.freezePill(freezeCount)}</span>}
                    {t.calendarHint}
                  </span>
                </div>
                <div className="cal-strip" role="list">
                  {NOVA_CALENDAR_REWARDS.map((coins, i) => {
                    const day = i + 1;
                    const isToday = day === calendar.pos;
                    const past = day < calendar.pos;
                    // #1471 — `calendar.claimedToday` is a whole-day flag (n.calendarDay === today),
                    // NOT a per-tile flag: guard it with `isToday` so claiming today's tile never
                    // flips future un-earned tiles to '✓ done'.
                    const state = isToday && calendar.claimable ? "claim" : past || (isToday && calendar.claimedToday) ? "done" : isToday ? "wait" : "future";
                    return (
                      <button
                        key={day}
                        className={`cal-tile ${state}`}
                        disabled={!isToday || !calendar.claimable}
                        onClick={() => {
                          const before = useKidStore.getState().nova[kid.id]?.freezes ?? 0;
                          const add = useKidStore.getState().novaClaimCalendar(kid.id);
                          const after = useKidStore.getState().nova[kid.id]?.freezes ?? 0;
                          if (add > 0) {
                            tada();
                            speak(t.calendarClaimSpeak(kid.name, add));
                          }
                          if (after > before) speak(t.freezeEarnedSpeak);
                        }}
                        aria-label={isToday ? (calendar.claimable ? t.calendarClaim(coins) : calendar.claimedToday ? t.calendarClaimed : t.calendarHint) : t.calendarLocked}
                      >
                        <span className="cal-tile-top">{past || (isToday && calendar.claimedToday) ? "✓" : isToday ? day : "🔒"}</span>
                        <span className="cal-tile-coin">🪙{coins}</span>
                      </button>
                    );
                  })}
                </div>
                {missedDay && (
                  // #1473 — the strip above keeps the old cycle's checkmarks for a
                  // warm re-entry; this cue explains the streak restarts with today.
                  <span className="cal-fresh">{t.calendarFreshStart}</span>
                )}
                <span className="cal-dayof">{t.calendarDayOf(calendar.pos)}</span>
              </div>
            ) : null}
            {/* Your path — the hero avatar stands on the glowing current node;
                stops behind are ✓, the road ahead is ▶ until it locks 🔒 */}
            <section className={`home-path season-${season}`} aria-label={t.homePath}>
              <div className="home-path-head">
                <span className="home-path-title">🛣️ {t.homePath}</span>
                <span className="season-chip">{SEASON_EMOJI[season]} {season === "snow" ? t.seasonSnow : season === "flowers" ? t.seasonFlowers : season === "fireflies" ? t.seasonFireflies : t.seasonLeaves}</span>
                {/* #1108-followup — the progress + "view journey" link are one
                    right-aligned group: on narrow phones they wrap together as a
                    unit instead of the link falling alone onto its own row. */}
                <div className="home-path-head-right">
                  <span className="home-path-prog">
                    {journeyDone ? t.champion : stops.length ? t.journeyProgress(doneCount, stops.length) : ""}
                  </span>
                  <button className="home-path-link" onClick={() => setScreen("worlds")}>
                    {t.homeViewJourney}
                  </button>
                </div>
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
                          <KidAvatar kid={kid} size={30} />
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


            {limitNotice ? <p className="limit-banner" role="status">{limitNotice}</p> : null}

            {/* 🎯 #256 — gentle daily goal (parent-set): a small progress line on
                home ("nudges toward it") + a once-per-day Nova celebration when
                the goal is reached. Never blocks — both stay fully dismissible. */}
            {goalMin > 0 && (
              <div className="goal-progress" role="status">
                {/* #1369 — show the REAL played minutes, including overshoot past the
                    goal, so more is always visible instead of being clamped to goal/goal. */}
                <span className="goal-progress-line">{t.goalLine(Math.round(todayPlayed * 10) / 10, goalMin)}</span>
                <span className="goal-progress-bar">
                  <span className="goal-progress-fill" style={{ width: `${goalPct}%` }} />
                </span>
              </div>
            )}

            {/* 📌 #257 — parent-set focus pin: the journey leads with this
                subject+world. A gentle reminder of the plan, not a block. */}
            {settings.focus_subject && settings.focus_band && (
              <div className="focus-chip" role="status">
                {t.focusChip(
                  FOCUS_SUBJECT_LABELS[settings.focus_subject]?.[lang === "bn" ? "bn" : "en"] ?? settings.focus_subject,
                  settings.focus_band
                )}
              </div>
            )}
            {goalNotice && (
              <div className="goal-nudge" role="status">
                <p className="goal-nudge-text">{t.goalNudge}</p>
                <div className="goal-nudge-actions">
                  <button
                    className="goal-nudge-btn ghost"
                    onClick={onGoalBreak}
                  >
                    {t.goalNudgeTakeBreak}
                  </button>
                  <button
                    className="goal-nudge-btn primary"
                    onClick={() => setGoalNotice(false)}
                  >
                    {t.goalNudgeKeepGoing}
                  </button>
                </div>
              </div>
            )}


            {/* The pet — the kid's growing friend. Learning feeds it: every
                session, every new mastery, and one daily snack. #1162 — this
                nursery ritual is age-gated: bands 1–4 keep it, bands 5–7 get
                the mission bar below instead. */}
            {showMission ? (
              <div className="mission-card" role="status" aria-label={t.missionTitle}>
                <span className="mission-emoji" aria-hidden="true">🎯</span>
                <div className="mission-meta">
                  <span className="mission-title">{t.missionTitle}</span>
                  <span className="mission-sub">{t.missionSub}</span>
                  <span className="mission-stats" role="list">
                    <span className="mission-stat" role="listitem">{t.missionStreak(novaDayStreak)}</span>
                    <span className="mission-stat" role="listitem">{t.missionBadges(badgeCount)}</span>
                    <span className="mission-stat" role="listitem">{t.missionAchievements(achCount)}</span>
                  </span>
                </div>
                <button className="mission-trophy" onClick={() => setScreen(kid ? "trophyroom" : "kidpick")}>
                  {t.missionTrophy}
                </button>
              </div>
            ) : (
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
            )}

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
                    const res = useKidStore.getState().novaOpenBox(kid.id, unclaimedBoxes.map((s) => ({ id: s.id, band: s.band })));
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

            {/* #767 — the anti-grind cap is a RETENTION moment: today's coins are
                full but a box/calendar bonus is still waiting — so we say "come
                back tomorrow 🌙" and NAME the reward. Nothing is granted or lost;
                the wall reads as a forward-looking wait, never a dead end. */}
            {capWaiting && (
              <div className="cap-waiting" role="status">
                <span className="cap-waiting-emoji" aria-hidden="true">🌙</span>
                <span className="cap-waiting-txt">
                  {t.capFullLine(
                    unclaimedBoxes.length > 0 && calendar?.claimable
                      ? t.capRewardBoth
                      : unclaimedBoxes.length > 0
                        ? t.capRewardBox
                        : t.capRewardCal
                  )}
                </span>
              </div>
            )}

            {/* #286 — star-of-the-week recap: the trailing 7 days, summarized
                for the kid — days played, top skill, biggest win, and a spoken
                option. All offline, from local play. When the week is empty it
                becomes a soft "come play" nudge, never a lecture. */}
            <div className="recap-card" role="status" aria-label={t.recapTitle}>
              <span className="recap-emoji" aria-hidden="true">🌟</span>
              <div className="recap-meta">
                <span className="recap-title">{t.recapTitle}</span>
                {weekPlayed.length > 0 ? (
                  <>
                    <span className="recap-sub">{t.recapSub(weekPlayed.length)}</span>
                    {topSkill && (
                      <span className="recap-line">
                        🏆 {t.recapTopSkill}: {lang === "bn" ? topSkill.titleBn ?? topSkill.title : topSkill.title}
                      </span>
                    )}
                    {recapWin && <span className="recap-win">{recapWin}</span>}
                  </>
                ) : (
                  <span className="recap-sub">{t.recapEmpty}</span>
                )}
              </div>
              {voiceOk && weekPlayed.length > 0 && topSkill && (
                <button className="recap-hear" onClick={() => speak(recapSpeakText)}>
                  {t.recapHear}
                </button>
              )}
            </div>

            {/* #280 — beat-the-owl challenge: an OPTIONAL head-to-head drill
                vs Nova. 5 fair rounds, adaptive questions, coins stay inside
                the daily cap. Kid-safe, offline, no ads. */}
            <button className="challenge-card" onClick={startChallenge} aria-label={t.chCard}>
              <span className="challenge-emoji" aria-hidden="true">⚔️</span>
              <span className="challenge-meta">
                <span className="challenge-title">{t.chTile}</span>
                <span className="challenge-sub">{t.chCard}</span>
              </span>
              <span className="challenge-go">{t.chStart} →</span>
            </button>

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
                {/* Nova + Garden were promoted to the persistent .home-wilds
                    strip above — not repeated here (#1396). */}
                <button className="play-icon" onClick={goCards}>
                  <span className="play-icon-emoji" aria-hidden="true">🏆</span>
                  <span>{t.cardsTile}</span>
                </button>
                <button className="play-icon" onClick={goBadges}>
                  <span className="play-icon-emoji" aria-hidden="true">🏅</span>
                  <span>{t.badgeTile}</span>
                </button>
                <button className="play-icon" onClick={goAchievements}>
                  <span className="play-icon-emoji" aria-hidden="true">📚</span>
                  <span>{t.achTile}</span>
                </button>
                <button className="play-icon" onClick={goAvatar}>
                  <span className="play-icon-emoji" aria-hidden="true">🎨</span>
                  <span>{t.avatarTile}</span>
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

              {/* #288 — kid-friendly voice settings: Nova's loudness, set
                  in-game with one tap + easy reset. Applies to EVERY spoken
                  line on both engines (web + neural). Kid-safe, offline. */}
              {voiceOk && (
                <div className="voice-fun" role="group" aria-label={t.voiceFunTitle}>
                  <span className="voice-fun-title">{t.voiceFunTitle}</span>
                  <div className="voice-fun-btns">
                    {([0.55, 0.9, 1.0] as const).map((v, i) => {
                      const label = i === 0 ? t.voiceFunSoft : i === 1 ? t.voiceFunNormal : t.voiceFunLoud;
                      return (
                        <button
                          key={v}
                          className={`voice-fun-btn${voiceFunVol === v ? " active" : ""}`}
                          onClick={() => {
                            setVoiceFunVolume(v);
                            setVoiceFunVolState(v);
                            speak(lang === "bn" ? "এক দুই তিন!" : "One two three!");
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                    <button
                      className="voice-fun-btn reset"
                      onClick={() => {
                        resetVoiceFunVolume();
                        setVoiceFunVolState(getVoiceFunVolume());
                        speak(lang === "bn" ? "হাই!" : "Hi!");
                      }}
                      aria-label={t.voiceFunReset}
                      title={t.voiceFunReset}
                    >
                      {t.voiceFunReset}
                    </button>
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

          {/* #280 — beat-the-owl drill sheet: Nova vs kid, 5 fair rounds.
              DOM overlay (like #292) so it floats over the home screen with
              zero Phaser changes. */}
          {challenge && (
            <div className="challenge-overlay" onClick={closeChallenge}>
              <div className="challenge-sheet" role="dialog" aria-label={t.chTile} onClick={(e) => e.stopPropagation()}>
                {challenge.won ? (
                  <>
                    <div className="challenge-result" role="status">
                      <span className="challenge-result-emoji" aria-hidden="true">
                        {challenge.won === "win" ? "🏆" : challenge.won === "tie" ? "🤝" : "💪"}
                      </span>
                      <span className="challenge-result-line">
                        {challenge.won === "win"
                          ? t.chWin(kid?.name ?? "")
                          : challenge.won === "tie"
                            ? t.chTie
                            : t.chLose(kid?.name ?? "")}
                      </span>
                      <span className="challenge-scoreline">
                        {t.chYou} {bnNum(challenge.myScore)} · {t.chNova} {bnNum(challenge.novaScore)}
                      </span>
                      {challenge.coins > 0 && (
                        <span className="challenge-coins">{t.chCoins(challenge.coins)}</span>
                      )}
                    </div>
                    <div className="challenge-btns">
                      <button className="big-btn" onClick={startChallenge}>{t.chAgain}</button>
                      <button className="ghost-btn" onClick={closeChallenge}>{t.chClose}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="challenge-top">
                      <span className="challenge-round">{t.chRound(challenge.round, CHALLENGE_ROUNDS)}</span>
                      <span className="challenge-level">{t.chLevel(challenge.level)}</span>
                    </div>
                    <div className="challenge-score" role="status" aria-label={`${t.chYou} ${challenge.myScore}, ${t.chNova} ${challenge.novaScore}`}>
                      <span className="challenge-score-you"><Icon name="nova" size={20} /> <b>{t.chYou}</b> {bnNum(challenge.myScore)}</span>
                      <span className="challenge-vs">VS</span>
                      <span className="challenge-score-nova"><Icon name="nova" size={20} /> <b>{t.chNova}</b> {bnNum(challenge.novaScore)}</span>
                    </div>
                    <div className="challenge-q" aria-label={t.chQuestion}>{challenge.q.text}</div>
                    <div className="challenge-options">
                      {challenge.q.options.map((opt, i) => {
                        const picked = challenge.pick === i;
                        const reveal = challenge.pick !== null;
                        let cls = "challenge-option";
                        if (reveal) {
                          if (i === challenge.q.answer) cls += " reveal";
                          if (picked && challenge.correct) cls += " correct";
                          else if (picked) cls += " wrong";
                        }
                        return (
                          <button
                            key={`${challenge.round}-${i}`}
                            className={cls}
                            disabled={reveal}
                            onClick={() => pickChallenge(i)}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {challenge.pick !== null && (
                      <div className="challenge-feedback" role="status">
                        <span>{challenge.correct ? t.chCorrect : t.chWrong}</span>
                        <span className="challenge-nova-line">{challenge.novaGot ? t.chNovaGot : t.chNovaMiss}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* #356 — first-play tour: 4 skippable steps teaching the core loop.
              Shows once per device; Skip exits without marking done (a future
              session can still finish it). Tapping the dim closes it too. */}
          {tourStep !== null && (
            <div className="tour-overlay" onClick={() => closeTour()}>
              <div
                className="tour-card"
                role="dialog"
                aria-label={t.tourTitle}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="tour-emoji" aria-hidden="true">{TOUR_STEPS[tourStep].emoji}</div>
                <div className="tour-title">
                  {tourStep === 0
                    ? t.tourStep1Title(kid?.name ?? "")
                    : tourStep === 1
                      ? t.tourStep2Title
                      : tourStep === 2
                        ? t.tourStep3Title
                        : t.tourStep4Title}
                </div>
                <div className="tour-body">
                  {tourStep === 0
                    ? t.tourStep1Sub
                    : tourStep === 1
                      ? t.tourStep2Sub
                      : tourStep === 2
                        ? t.tourStep3Sub
                        : t.tourStep4Sub}
                </div>
                <div className="tour-dots" aria-hidden="true">
                  {TOUR_STEPS.map((_, i) => (
                    <span key={i} className={`tour-dot${i === tourStep ? " active" : ""}`} />
                  ))}
                </div>
                <div className="tour-btns">
                  <button className="ghost-btn mini" onClick={() => closeTour()}>{t.tourSkip}</button>
                  {tourStep < TOUR_STEPS.length - 1 ? (
                    <button className="big-btn" onClick={() => setTourStep((s) => (s ?? 0) + 1)}>{t.tourNext}</button>
                  ) : (
                    <button className="big-btn" onClick={() => closeTour(true)}>{t.tourDone}</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    // No active kid → fall through to the picker (below) so a blank screen
    // never appears.
  return null;
}
