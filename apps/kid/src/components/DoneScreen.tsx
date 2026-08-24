import type React from "react";
import { BANDS, type Band } from "@numberverse/core";
import { useKidStore, speciesEmoji, speciesById } from "../store";
import { worldProgress, totalMastered, rankFor, masteryThresholdFor, moniPlanFor, DONE_CONFETTI, type SkillMap, type Kid, type SessionStep, type JourneyStop } from "../lib/journey";
import { type Lang, type Strings } from "../i18n";
import { click } from "../game/audio";
import type { Screen } from "../App";
import { Icon } from "./Icon";
import CountUp from "./CountUp";

export interface DoneScreenProps {
  world: Band;
  kid: Kid;
  skillsMap: SkillMap;
  lang: Lang;
  stops: JourneyStop[];
  hereIdx: number;
  sessionRef: React.MutableRefObject<SessionStep[]>;
  masteredBeforeRef: React.MutableRefObject<Set<string>>;
  petStageBeforeRef: React.MutableRefObject<number>;
  sessionIdx: number;
  moniFb: "easy" | "hard" | null;
  setMoniFb: (v: "easy" | "hard" | null) => void;
  stars: number;
  score: number;
  petStage: number;
  petSpecies: string;
  quietChrome: React.ReactNode;
  t: Strings;
  novaCoins: number;
  startNextRound: () => void;
  replaySession: () => void;
  openCert: (b: Band) => void;
  goNova: () => void;
  setScreen: (s: Screen) => void;
}

export default function DoneScreen({
  world, kid, skillsMap, lang, stops, hereIdx, sessionRef, masteredBeforeRef, petStageBeforeRef, sessionIdx,
  moniFb, setMoniFb, stars, score, petStage, petSpecies, quietChrome, t, novaCoins,
  startNextRound, replaySession, openCert, goNova, setScreen,
}: DoneScreenProps) {
  const prog = worldProgress(skillsMap, kid.id, world.id);
  const complete = prog.mastered === prog.total;
  const nextWorld = BANDS.find((b) => b.id === world.id + 1);
  const rank = rankFor(totalMastered(skillsMap, kid.id), lang);
  // The "Next round" target — the journey's current stop after this session.
  // If the kid just mastered their skill, this is the NEW skill ahead of them;
  // if not, it's the same one (keep practicing). undefined = journey done.
  const nextStop = (() => {
    const idx = hereIdx;
    return idx < stops.length ? stops[idx] : undefined;
  })();
  // skills that crossed the mastery bar DURING this session → a special cheer
  const newMastered = sessionRef.current.filter(
    (s) => !masteredBeforeRef.current.has(s.skillId) && (skillsMap[`${kid.id}:${s.skillId}`]?.pMastered ?? 0) >= masteryThresholdFor(s.skillId)
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
        <div className="done-stars" role="img" aria-label={t.doneStars(stars)}>
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
        {/* kids-flow — the ONE forward tap sits right under the reward, above all
            the rank/feedback meta, so a kid never has to scan past (or answer) a
            question to keep playing. The "too easy/hard?" voice + rank badge live
            BELOW this now (still available, never blocking the next game). */}
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
          <button className="big-btn" onClick={startNextRound}>
            <span className="play-btn-main">▶ {t.nextRound}</span>
            <span className="play-btn-sub">
              {nextStop.skill.title}
              {(() => { const b = BANDS.find((bb) => bb.id === nextStop.skill.band); return b ? ` · ${b.title}` : ""; })()}
            </span>
          </button>
        ) : (
          <button className="big-btn" onClick={replaySession}>{t.playAgain}</button>
        )}
        {complete && (
          <button className="cert-btn" onClick={() => openCert(world)}>{t.certBtn}</button>
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
        {/* #1048 — kid's own "too easy / too hard" voice. Bumps the signed
            per-skill difficulty delta (±1, clamped ±2) that Moni's planner
            layers on top of the parent strictness. Soft by design: one warm
            confirmation, then the row turns into a "Got it" so it never
            nags. */}
        {(() => {
          const focusSkill = moniPlanFor(kid.id)?.focusSkillId ?? sessionRef.current[sessionIdx]?.skillId;
          if (!focusSkill) return null;
          if (moniFb) {
            return (
              <div className="moni-feedback moni-feedback-ok" role="status">
                {moniFb === "easy" ? "😌 " : "🔥 "}{t.moniFbOk}
              </div>
            );
          }
          return (
            <div className="moni-feedback" role="group" aria-label={t.moniFbQ}>
              <span className="moni-feedback-q">{t.moniFbQ}</span>
              <div className="moni-feedback-btns">
                <button
                  className="ghost-btn"
                  onClick={() => { click(); useKidStore.getState().bumpSkillDelta(kid.id, focusSkill, 1); setMoniFb("easy"); }}
                >
                  😌 {t.moniFbEasy}
                </button>
                <button
                  className="ghost-btn"
                  onClick={() => { click(); useKidStore.getState().bumpSkillDelta(kid.id, focusSkill, -1); setMoniFb("hard"); }}
                >
                  🔥 {t.moniFbHard}
                </button>
              </div>
            </div>
          );
        })()}
        {/* kids-flow — the forward CTA + cert now render ABOVE (right under the
            reward). Only the low-priority navigation links remain down here. */}
        <button className="ghost-btn nova-home-btn" onClick={goNova}><Icon name="nova" size={20} /> {t.novaMeet} · <Icon name="coin" size={15} /> {novaCoins}</button>
        <button className="ghost-btn" onClick={() => setScreen("worlds")}>{t.worldsBtn}</button>
        <button className="ghost-btn" onClick={() => setScreen("home")}>{t.homeBtn}</button>
      </main>
    </div>
  );
}
