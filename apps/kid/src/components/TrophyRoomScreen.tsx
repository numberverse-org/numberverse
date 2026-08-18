import type React from "react";
import { BANDS } from "@numberverse/core";
import { worldProgress, type Kid, type SkillMap } from "../lib/journey";
import { type Lang, type Strings } from "../i18n";
import { Icon } from "./Icon";

export interface TrophyRoomScreenProps {
  kid: Kid;
  skillsMap: SkillMap;
  lang: Lang;
  t: Strings;
  onBack: () => void;
  goNova: () => void;
}

export default function TrophyRoomScreen({ kid, skillsMap, lang, t, onBack, goNova }: TrophyRoomScreenProps) {
  const rows = BANDS.map((b) => {
    const p = worldProgress(skillsMap, kid.id, b.id);
    return { band: b, earned: p.total > 0 && p.mastered === p.total, mastered: p.mastered, total: p.total };
  });
  const trophyCount = rows.filter((r) => r.earned).length;
  return (
    <div className="app">
      <main className="screen tr-screen">
        <header className="screen-head">
          <button className="icon-btn" onClick={onBack} aria-label={t.backTo(t.homeBtn)}>←</button>
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