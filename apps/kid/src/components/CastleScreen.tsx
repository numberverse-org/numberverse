import type React from "react";
import { BANDS, type Band } from "@numberverse/core";
import { worldProgress, type Kid, type SkillMap } from "../lib/journey";
import { type Strings } from "../i18n";
import { Icon } from "./Icon";

export interface CastleScreenProps {
  kid: Kid;
  skillsMap: SkillMap;
  t: Strings;
  onBack: () => void;
  goNova: () => void;
  openCert: (b: Band) => void;
}

export default function CastleScreen({ kid, skillsMap, t, onBack, goNova, openCert }: CastleScreenProps) {
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
          <button className="icon-btn" onClick={onBack} aria-label={t.backTo(t.homeBtn)}>‹</button>
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