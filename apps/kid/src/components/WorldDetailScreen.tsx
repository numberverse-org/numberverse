import type React from "react";
import { BANDS, type Band, type Skill } from "@numberverse/core";
import { worldProgress, filterSkills, nextUnmasteredSkill, challengeEligible, unlockGap, UNLOCK_THRESHOLD, worldUnlocked, filterMaxBand, WORLD_LANDS, masteryDisplayPct, masteryThresholdFor, skillTitle, skillDesc, type SkillMap, type Kid } from "../lib/journey";
import { type Lang, type Strings } from "../i18n";
import { Icon } from "./Icon";

export interface WorldDetailScreenProps {
  world: Band;
  kid: Kid;
  skillsMap: SkillMap;
  onBack: () => void;
  t: Strings;
  lang: Lang;
  startPlayWorld: (b: Band) => void;
  startSingleSkill: (s: Skill) => void;
  skipAhead: (s: Skill) => void;
  skipNotice: string | null;
}

export default function WorldDetailScreen({
  world, kid, skillsMap, onBack, t, lang, startPlayWorld, startSingleSkill, skipAhead, skipNotice,
}: WorldDetailScreenProps) {
  const prog = worldProgress(skillsMap, kid.id, world.id);
  const bandSkills = filterSkills.filter((s) => s.band === world.id && s.game);
  const nextSkill = nextUnmasteredSkill(skillsMap, kid.id, world.id);
  const complete = prog.total > 0 && prog.mastered === prog.total;
  // #1400 — a completed world offers 'beat your best' when it has any EXPERT
  // skill (pMastered ≥ 0.92). sessionForWorld turns that into a pure
  // challenge-replay session instead of re-sweeping the whole land.
  const hasChallengeReplay = complete && bandSkills.some((s) => challengeEligible(skillsMap, kid.id, s.id));
  const nextWorld = BANDS.find((b) => b.id === world.id + 1);
  // #1485 — same unlockGap helper as the map; #1486 — gate the "ready" text
  // on worldUnlocked so a parent difficulty cap never promises a locked land.
  const gap = unlockGap(prog, UNLOCK_THRESHOLD);
  const nextUnlocked = nextWorld ? worldUnlocked(skillsMap, kid.id, nextWorld.id) : false;
  const nextCapped = nextWorld != null && filterMaxBand != null && nextWorld.id > filterMaxBand;
  const land = WORLD_LANDS[world.id];
  return (
    <div className="app">
      <main className="screen worlds">
        <header
          className="screen-head worlddetail-head"
          style={{ ["--c1" as string]: land.c1, ["--c2" as string]: land.c2, ["--c3" as string]: land.c3, ["--c2-22" as string]: land.c2_22 }}
        >
          <span className="worlddetail-deco" aria-hidden="true">
            {land.deco.map((d, di) => (
              <span key={di} className={`worlddetail-deco-item d${di}`} style={{ animationDelay: `${di * 0.6}s` }}>{d}</span>
            ))}
          </span>
          <button className="icon-btn" onClick={onBack} aria-label={t.backTo(t.worldsLabel)}>‹</button>
          <div className="head-title">
            <h2><Icon name={world.key} size={26} /> {lang === "bn" ? world.titleBn ?? world.title : world.title}</h2>
            <p className="head-sub">{prog.total === 0 ? t.worldNoLessons : t.worldAges(world.ageRange, prog.mastered, prog.total)}</p>
          </div>
        </header>

        <div className="world-progress-card">
          <div className="progress-bar big">
            <div className="progress-fill" style={{ width: `${prog.pct}%` }} />
          </div>
          {prog.total === 0 ? (
            <div className="badge">{t.worldNoLessons}</div>
          ) : prog.mastered === prog.total ? (
            <div className="badge">{t.worldComplete}</div>
          ) : nextWorld ? (
            <p className="unlock-hint">
              {nextUnlocked ? (
                <>{t.readyFor(nextWorld.title)} <Icon name={nextWorld.key} size={18} /></>
              ) : nextCapped ? (
                t.worldLockedCap
              ) : gap.more > 0 ? (
                <>{t.masterMoreToUnlock(gap.more, nextWorld.title)} <Icon name={nextWorld.key} size={18} /></>
              ) : (
                t.worldLockedCap
              )}
            </p>
          ) : null}
        </div>

        <button className="big-btn" onClick={() => startPlayWorld(world)}>
          {nextSkill ? t.playNext(nextSkill.title) : hasChallengeReplay ? t.beatYourBest : t.practiceAgain}
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
              const pct = masteryDisplayPct(st, skill.id);
              const mastered = !!st && st.pMastered >= masteryThresholdFor(skill.id);
              const isNext = nextSkill?.id === skill.id;
              const side = i % 2 === 0 ? "left" : "right";
              const title = skillTitle(skill, lang);
              return (
                <div key={skill.id} className={`tree-row ${side}`}>
                  <button
                    className={`tree-node${mastered ? " done" : isNext ? " next" : " open"}${isNext ? " is-next" : ""}`}
                    onClick={() => startSingleSkill(skill)}
                    aria-label={`${title} · ${t.classLabel(skill.classNumber ?? skill.band)} · ${mastered ? pct + "%" : isNext ? t.nextBadge : pct + "%"}`}
                  >
                    <span className="tree-node-emoji"><Icon name={skill.subject} size={26} /></span>
                    <span className="tree-node-meta">
                      <span className="tree-node-title">{title}</span>
                      {skill.titleBn ? <span className="tree-node-bn">{skill.titleBn}</span> : null}
                      <span className="tree-node-desc">{skillDesc(skill, lang)}</span>
                      <span className="tree-node-class">{t.classLabel(skill.classNumber ?? skill.band)}</span>
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
