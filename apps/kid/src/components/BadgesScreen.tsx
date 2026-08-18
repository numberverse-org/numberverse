import type React from "react";
import { BADGES, fullyMasteredWorlds, skillMastered, type BadgeCtx, type BadgeDef, type Kid, type SkillMap } from "../lib/journey";
import { type Lang, type Strings } from "../i18n";
import { speak } from "../game/speech";
import { Icon } from "./Icon";

export interface BadgesScreenProps {
  kid: Kid;
  skillsMap: SkillMap;
  lang: Lang;
  t: Strings;
  weekSkill: { id: string } | undefined;
  badgeStats: { stars: number; score: number; sessions: number };
  badgeStreak: number;
  onBack: () => void;
  goNova: () => void;
}

export default function BadgesScreen({
  kid, skillsMap, lang, t, weekSkill, badgeStats, badgeStreak, onBack, goNova,
}: BadgesScreenProps) {
  const wk = weekSkill; // #1122 — reuse the shared memoized week skill
  const ctx: BadgeCtx = { sessions: badgeStats.sessions, stars: badgeStats.stars, streak: badgeStreak, worlds: fullyMasteredWorlds(skillsMap, kid.id), weekDone: !!wk && skillMastered(skillsMap, kid.id, wk.id) };
  const rows = BADGES.map((b) => ({ b, earned: b.earned(ctx), prog: b.progress(ctx) }));
  const earnedCount = rows.filter((r) => r.earned).length;
  // #1371 — when nothing is earned yet, pick the closest locked badge so the
  // book opens with one concrete next step instead of a wall of padlocks.
  const nextBadge = rows.reduce<{ b: BadgeDef; prog: { current: number; target: number }; ratio: number } | null>((best, r) => {
    if (r.earned) return best;
    const ratio = r.prog.target > 0 ? r.prog.current / r.prog.target : (r.prog.current > 0 ? 1 : 0);
    if (!best || ratio > best.ratio) return { b: r.b, prog: r.prog, ratio };
    return best;
  }, null);
  return (
    <div className="app">
      <main className="screen badges-screen">
        <header className="screen-head">
          <button className="icon-btn" onClick={onBack} aria-label={t.backTo(t.homeBtn)}>←</button>
          <div className="head-title">
            <h2>{t.badgeTitle}</h2>
            <p className="head-sub">{t.badgeSub(earnedCount, BADGES.length)}</p>
          </div>
          <button className="icon-btn nova-hud-btn" onClick={goNova} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
        </header>

        {earnedCount === 0 && nextBadge && (
          <div className="badge-first" role="status">
            <span className="badge-first-emoji" aria-hidden="true">{nextBadge.b.emoji}</span>
            <div className="badge-first-body">
              <span className="badge-first-title">{t.badgeFirstTitle}</span>
              <span className="badge-first-name">{lang === "bn" ? nextBadge.b.nameBn : nextBadge.b.name}</span>
              <span className="badge-first-hint">{lang === "bn" ? nextBadge.b.hintBn : nextBadge.b.hint}</span>
              <span className="badge-first-progress">{t.badgeProgress(nextBadge.prog.current, nextBadge.prog.target)}</span>
            </div>
          </div>
        )}

        <div className="badge-grid">
          {rows.map(({ b, earned, prog }) => {
            return (
              <button
                key={b.id}
                className={`badge-card${earned ? " earned" : " locked"}`}
                onClick={() => speak(earned ? (lang === "bn" ? t.badgeNewSpeak(kid.name, b.nameBn) : t.badgeNewSpeak(kid.name, b.name)) : t.badgeLocked)}
                aria-label={earned ? t.badgeEarned : `${t.badgeLocked} · ${t.badgeProgress(prog.current, prog.target)}`}
              >
                <span className="badge-emoji" aria-hidden="true">{earned ? b.emoji : "🔒"}</span>
                <span className="badge-name">{lang === "bn" ? b.nameBn : b.name}</span>
                <span className="badge-hint">{lang === "bn" ? b.hintBn : b.hint}</span>
                <span className={`badge-state${earned ? " earned" : ""}`}>{earned ? t.badgeEarned : t.badgeProgress(prog.current, prog.target)}</span>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}