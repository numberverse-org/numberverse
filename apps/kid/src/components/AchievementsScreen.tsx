import type React from "react";
import { ACHIEVEMENTS, totalMastered, fullyMasteredWorlds, type AchCtx, type Kid, type SkillMap } from "../lib/journey";
import { type Lang, type Strings } from "../i18n";
import { speak } from "../game/speech";
import { Icon } from "./Icon";

export interface AchievementsScreenProps {
  kid: Kid;
  skillsMap: SkillMap;
  lang: Lang;
  t: Strings;
  achStats: { stars: number; score: number; sessions: number };
  achStreak: number;
  achCoins: number;
  achPets: number;
  achPetStage: number;
  storedAchs: string[];
  achPopupIds: string[];
  onBack: () => void;
  goNova: () => void;
}

export default function AchievementsScreen({
  kid, skillsMap, lang, t, achStats, achStreak, achCoins, achPets, achPetStage, storedAchs, achPopupIds, onBack, goNova,
}: AchievementsScreenProps) {
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
  const justNew = achPopupIds;
  const unlockedCount = ACHIEVEMENTS.filter((a) => a.earned(ctx)).length;
  return (
    <div className="app">
      <main className="screen ach-screen">
        <header className="screen-head">
          <button className="icon-btn" onClick={onBack} aria-label={t.backTo(t.homeBtn)}>←</button>
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
                onClick={() => speak(earned ? (lang === "bn" ? t.achNewSpeak(kid.name, a.nameBn) : t.achNewSpeak(kid.name, a.name)) : t.achLocked)}
                aria-label={earned ? t.achUnlocked : t.achLocked}
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