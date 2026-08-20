import type React from "react";
import { BANDS, type Band, type Skill } from "@numberverse/core";
import { useKidStore, type Plan } from "../store";
import { worldUnlocked, worldProgress, unlockGap, landBossBeaten, landBossUnlocked, recommendedSkill, rankFor, totalMastered, skillTitle, skillDesc, UNLOCK_THRESHOLD, WORLD_LANDS, filterMaxBand, FOCUS_SUBJECT_LABELS, type SkillMap, type Kid, type JourneyStop, type ChallengeQ } from "../lib/journey";
import { bnNum, type Lang, type Strings } from "../i18n";
import type { KidSettings } from "../api";
import type { Screen } from "../App";
import { Icon, AvatarIcon } from "./Icon";

type LandBoss = {
  band: number;
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
};
/** #1164 — land-boss duel length: longer than the casual owl challenge (5). */
const BOSS_ROUNDS = 7;

export interface WorldsScreenProps {
  kid: Kid | null;
  skillsMap: SkillMap;
  stops: JourneyStop[];
  hereIdx: number;
  quietChrome: React.ReactNode;
  onBack: () => void;
  t: Strings;
  lang: Lang;
  mapView: boolean;
  setMapView: (v: boolean) => void;
  journeyView: boolean;
  setJourneyView: (v: boolean) => void;
  viewTabRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  openWorld: (b: Band) => void;
  tapPremiumWorld: (b: Band, e: React.MouseEvent<HTMLButtonElement>) => void;
  tapLockedWorld: (b: Band, more: number, prevTitle: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  startSingleSkill: (s: Skill) => void;
  startPlayWorld: (b: Band) => void;
  plan: Plan;
  settings: KidSettings;
  goTrophyRoom: () => void;
  goNova: () => void;
  landBoss: LandBoss | null;
  bossRef: React.RefObject<HTMLDivElement>;
  startBoss: (band: number) => void;
  pickBoss: (i: number) => void;
  closeBoss: () => void;
}

export default function WorldsScreen({
  kid, skillsMap, stops, hereIdx, quietChrome, onBack, t, lang, mapView, setMapView, journeyView, setJourneyView,
  viewTabRefs, openWorld, tapPremiumWorld, tapLockedWorld, startSingleSkill, startPlayWorld, plan, settings,
  goTrophyRoom, goNova, landBoss, bossRef, startBoss, pickBoss, closeBoss,
}: WorldsScreenProps) {
  const allComplete = BANDS.every((b) => worldUnlocked(skillsMap, kid!.id, b.id));
  const doneCount = stops.filter((s) => s.done).length;
  const journeyDone = doneCount === stops.length;
  const curStop = stops.find((s) => s.current);
  const novaNow = kid ? useKidStore.getState().nova[kid.id] : undefined;
  return (
    <div className="app">
      <main className="screen worlds">
        {/* #248 — quiet-hours dim + 🌙 badge */}
        {quietChrome}
        <header className="screen-head">
          <button className="icon-btn" onClick={onBack} aria-label={t.backTo(t.homeBtn)}>←</button>
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

        {/* #1569 — "Play next" is pinned to a FIXED footer so it never scrolls
            out of reach on the journey rail. The wrapper is a full-width
            gradient scrim; the button itself stays a normal big-btn (its own
            glow pulse). The content below gets a bottom spacer so the last
            stop is never hidden behind the footer. */}
        {(curStop || journeyDone) && (
          <div
            className="journey-play-footer"
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 40,
              display: "flex",
              justifyContent: "center",
              padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
              background: "linear-gradient(180deg, rgba(10,18,36,0) 0%, rgba(10,18,36,0.92) 40%)",
              pointerEvents: "none",
            }}
          >
            {curStop ? (
              <button
                className="big-btn play-now"
                style={{ pointerEvents: "auto", margin: 0 }}
                onClick={() => startSingleSkill(curStop.skill)}
              >
                {t.playNext(lang === "bn" ? curStop.skill.titleBn ?? curStop.skill.title : curStop.skill.title)}
              </button>
            ) : journeyDone ? (
              (() => {
                const rec = recommendedSkill(skillsMap, kid!.id);
                return rec ? (
                  <button
                    className="big-btn play-now"
                    style={{ pointerEvents: "auto", margin: 0 }}
                    onClick={() => startSingleSkill(rec)}
                  >
                    {t.beatYourBest ?? t.playNext(lang === "bn" ? rec.titleBn ?? rec.title : rec.title)}
                  </button>
                ) : (
                  <button
                    className="big-btn play-now"
                    style={{ pointerEvents: "auto", margin: 0 }}
                    onClick={() => startPlayWorld(BANDS[0])}
                  >
                    {t.practiceAgain}
                  </button>
                );
              })()
            ) : null}
          </div>
        )}

        <div
          className="view-toggle"
          role="tablist"
          aria-label={t.viewTabs}
          onKeyDown={(e) => {
            const order = ["map", "journey", "worlds"];
            const idx = mapView ? 0 : journeyView ? 1 : 2;
            const move = (nextIdx: number) => {
              const key = order[(nextIdx + order.length) % order.length];
              viewTabRefs.current.get(key)?.click();
              viewTabRefs.current.get(key)?.focus();
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
                move(order.length - 1);
                break;
            }
          }}
        >
          <button
            role="tab"
            aria-selected={mapView}
            aria-controls="view-panel-map"
            tabIndex={mapView ? 0 : -1}
            ref={(el) => {
              if (el) viewTabRefs.current.set("map", el);
              else viewTabRefs.current.delete("map");
            }}
            className={`view-toggle-btn${mapView ? " on" : ""}`}
            onClick={() => { setMapView(true); setJourneyView(false); }}
          >
            🗺️ {t.mapTab}
          </button>
          <button
            role="tab"
            aria-selected={!mapView && journeyView}
            aria-controls="view-panel-journey"
            tabIndex={!mapView && journeyView ? 0 : -1}
            ref={(el) => {
              if (el) viewTabRefs.current.set("journey", el);
              else viewTabRefs.current.delete("journey");
            }}
            className={`view-toggle-btn${!mapView && journeyView ? " on" : ""}`}
            onClick={() => { setJourneyView(true); setMapView(false); }}
          >
            🛣️ {t.journey}
          </button>
          <button
            role="tab"
            aria-selected={!mapView && !journeyView}
            aria-controls="view-panel-worlds"
            tabIndex={!mapView && !journeyView ? 0 : -1}
            ref={(el) => {
              if (el) viewTabRefs.current.set("worlds", el);
              else viewTabRefs.current.delete("worlds");
            }}
            className={`view-toggle-btn${!mapView && !journeyView ? " on" : ""}`}
            onClick={() => { setJourneyView(false); setMapView(false); }}
          >
            🏘️ {t.worldsLabel}
          </button>
        </div>

        {mapView ? (
          <div id="view-panel-map" role="tabpanel" aria-label={t.mapTab} className="world-map">
            {/* A winding road through all five lands — the kid's avatar sits
                on the current land, mastered lands glow, locked ones await. */}
            {/* #3147 — the road is drawn by .map-road's own dashed border; the
                five empty .map-road-dot spans were invisible dead markup (0 CSS
                rules) and are removed. */}
            <div className="map-road" aria-hidden="true" />
            {BANDS.map((b, i) => {
              const prog = worldProgress(skillsMap, kid!.id, b.id);
              const premiumLocked = plan !== "plus" && b.id > 2;
              const unlocked = worldUnlocked(skillsMap, kid!.id, b.id) && !premiumLocked;
              const prev = BANDS.find((x) => x.id === b.id - 1);
              const prevProg = prev ? worldProgress(skillsMap, kid!.id, prev.id) : null;
              // #1485 — the SAME unlockGap helper as land-detail: honest
              // remaining (0 allowed) instead of map clamping to "1 more".
              const gate = prev ? unlockGap(prevProg!, UNLOCK_THRESHOLD) : { needed: 0, more: 0, ready: true };
              const more = unlocked ? 0 : gate.more;
              const capped = filterMaxBand != null && b.id > filterMaxBand;
              const complete = prog.total > 0 && prog.mastered === prog.total;
              const isHere = curStop?.skill.band === b.id;
              const land = WORLD_LANDS[b.id];
              const prevTitle = prev ? (lang === "bn" ? prev.titleBn ?? prev.title : prev.title) : "";
              return (
                <div key={b.key} className={`map-island-wrap${isHere ? " here" : ""}`}>
                  <span className="map-island-deco" aria-hidden="true">
                    {land.deco.map((d, di) => (
                      <span key={di} className={`map-deco d${di}`} style={{ animationDelay: `${di * 0.6}s` }}>{d}</span>
                    ))}
                  </span>
                  <button
                    className={`map-island${unlocked ? "" : " locked"}${complete ? " complete" : ""}`}
                    aria-disabled={!unlocked}
                    onClick={(e) => {
                      if (unlocked) {
                        openWorld(b);
                        return;
                      }
                      if (premiumLocked) {
                        tapPremiumWorld(b, e);
                        return;
                      }
                      tapLockedWorld(b, more, prevTitle, e);
                    }}
                    aria-label={b.title}
                    style={{ ["--c1" as string]: land.c1, ["--c2" as string]: land.c2, ["--c3" as string]: land.c3 }}
                  >
                    <span className="map-island-badge">
                      {complete ? <Icon name="trophy" size={30} /> : unlocked ? <Icon name={b.key} size={30} /> : "🔒"}
                    </span>
                    <span className="map-island-meta">
                      <span className="map-island-name">
                        {lang === "bn" ? b.titleBn ?? b.title : b.title}
                        {isHere && (
                          <span className="map-here-chip" style={{ animation: "jPulse 1.8s ease-in-out infinite" }}>
                            📍 {t.mapHere}
                          </span>
                        )}
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
                          ? prog.total === 0
                            ? t.worldNoLessons
                            : complete
                              ? t.worldComplete
                              : t.mapLandProg(prog.mastered, prog.total)
                          : premiumLocked
                            ? t.premiumLockedSub
                            : capped
                              ? t.worldLockedCap
                              : gate.ready
                                ? t.readyFor(lang === "bn" ? b.titleBn ?? b.title : b.title)
                                : t.masterMoreIn(gate.more, prevTitle)}
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
          <div id="view-panel-journey" role="tabpanel" aria-label={t.journey} className="journey-scroll">
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
              const bandComplete = bandProg.total > 0 && bandProg.mastered === bandProg.total;
              const nextBand = BANDS.find((x) => x.id === band.id + 1);
              const bossBeaten = landBossBeaten(novaNow, band.id);
              const bossReady = !bossBeaten && landBossUnlocked(skillsMap, kid!.id, band.id);
              return (
                <section key={band.key} className="journey-region">
                  <div
                    className="journey-region-head"
                    style={{ ["--c1" as string]: land.c1, ["--c2" as string]: land.c2, ["--c3" as string]: land.c3, ["--c2-22" as string]: land.c2_22 }}
                  >
                    <span className="journey-region-emoji">{bandComplete ? <Icon name="trophy" size={20} /> : <Icon name={band.key} size={20} />}</span>
                    <span className="journey-region-name">{band.title}</span>
                    <span className="journey-region-count">{bandProg.total === 0 ? t.worldNoLessons : t.skillsProg(bandProg.mastered, bandProg.total)}</span>
                    {bossBeaten ? (
                      <span className="boss-beaten" title={lang === "bn" ? t.bossBeatenBn : t.bossBeaten}>
                        {lang === "bn" ? t.bossBeatenBn : t.bossBeaten}
                      </span>
                    ) : bossReady ? (
                      <button className="boss-btn" onClick={() => startBoss(band.id)} aria-label={lang === "bn" ? t.bossBtnBn : t.bossBtn}>
                        {lang === "bn" ? t.bossBtnBn : t.bossBtn}
                      </button>
                    ) : null}
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
                          aria-label={skillTitle(st.skill, lang)}
                        >
                          <span className="j-node">
                            {st.done ? "✓" : st.current ? <Icon name="nova" size={18} /> : st.unlocked ? "▶" : "🔒"}
                          </span>
                          <span className="j-card">
                            <span className="j-emoji"><Icon name={st.skill.subject} size={26} /></span>
                            <span className="j-meta">
                              <span className="j-title">{skillTitle(st.skill, lang)}</span>
                              <span className="j-desc">{skillDesc(st.skill, lang)}</span>
                              <span className="j-sub">
                                {st.done
                                  ? t.mastered
                                  : st.current
                                    ? t.journeyTapHint
                                    : st.unlocked
                                      ? t.classLabel(st.skill.classNumber ?? st.skill.band)
                                      : t.journeyLocked}
                              </span>
                            </span>
                            {st.current && (
                              <span
                                className="j-play-chip"
                                role="img"
                                aria-label={t.mapHere}
                                style={{ width: "auto", padding: "0 12px", borderRadius: 999, animation: "jPulse 1.8s ease-in-out infinite" }}
                              >
                                📍 {t.mapHere}
                              </span>
                            )}
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
            <div id="view-panel-worlds" role="tabpanel" aria-label={t.worldsLabel} className="world-list">
              {BANDS.map((b) => {
                const prog = worldProgress(skillsMap, kid!.id, b.id);
                const unlocked = worldUnlocked(skillsMap, kid!.id, b.id);
                const prev = BANDS.find((x) => x.id === b.id - 1);
                // To unlock THIS world, the kid must master skills in the PREVIOUS world.
                // So the "more needed" count comes from prev's progress, not this world's.
                const prevProg = prev ? worldProgress(skillsMap, kid!.id, prev.id) : null;
                // #1485 — one gate helper, honest remaining (0 allowed).
                const gate = prev ? unlockGap(prevProg!, UNLOCK_THRESHOLD) : { needed: 0, more: 0, ready: true };
                const more = unlocked ? 0 : gate.more;
                const capped = filterMaxBand != null && b.id > filterMaxBand;
                const complete = prog.total > 0 && prog.mastered === prog.total;
                const land = WORLD_LANDS[b.id];
                const bossBeaten = landBossBeaten(novaNow, b.id);
                const bossReady = !bossBeaten && landBossUnlocked(skillsMap, kid!.id, b.id);
                return (
                  <div key={b.key} className="world-card-wrap">
                    <button
                      className={`world-card${unlocked ? "" : " locked"}${complete ? " complete" : ""}`}
                      disabled={!unlocked}
                      onClick={() => openWorld(b)}
                      style={{ ["--c1" as string]: land.c1, ["--c2" as string]: land.c2 }}
                    >
                      <span className="world-emoji">{complete ? <Icon name="trophy" size={40} /> : <Icon name={b.key} size={40} />}</span>
                      <span className="world-meta">
                        <span className="world-name">{lang === "bn" ? b.titleBn ?? b.title : b.title}</span>
                        <span className="world-age">
                          {unlocked
                            ? prog.total === 0
                              ? t.worldNoLessons
                              : complete
                                ? t.worldComplete
                                : t.skillsProg(prog.mastered, prog.total)
                            : capped
                              ? t.worldLockedCap
                              : gate.ready
                                ? t.readyFor(lang === "bn" ? b.titleBn ?? b.title : b.title)
                                : t.masterMoreIn(gate.more, prev ? (lang === "bn" ? prev.titleBn ?? prev.title : prev.title) : (lang === "bn" ? "আগের জগৎ" : "the last world"))}
                        </span>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${prog.pct}%`, background: `linear-gradient(90deg, ${land.c2}, ${land.c3})` }} />
                        </div>
                      </span>
                      <span className="world-state">{unlocked ? "▶" : "🔒"}</span>
                    </button>
                    {bossBeaten ? (
                      <span className="boss-beaten" title={lang === "bn" ? t.bossBeatenBn : t.bossBeaten}>
                        {lang === "bn" ? t.bossBeatenBn : t.bossBeaten}
                      </span>
                    ) : bossReady ? (
                      <button className="boss-btn" onClick={() => startBoss(b.id)} aria-label={lang === "bn" ? t.bossBtnBn : t.bossBtn}>
                        {lang === "bn" ? t.bossBtnBn : t.bossBtn}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {allComplete && <div className="badge">{t.champion}</div>}
          </>
        )}
        {/* #1569 — room for the pinned play-next footer (never covers the last stop). */}
        {(curStop || journeyDone) && <div style={{ height: 118 }} aria-hidden="true" />}
      </main>

      {/* #1164 — intermediate land-boss duel sheet (fixed overlay, same
          DOM/celebration language as the owl challenge but its own state). */}
      {landBoss && (
        <div className="challenge-overlay" onClick={closeBoss}>
          <div className="challenge-sheet" role="dialog" aria-label={lang === "bn" ? t.bossBtnBn : t.bossBtn} onClick={(e) => e.stopPropagation()} ref={bossRef}>
            {landBoss.won ? (
              <>
                <div className="challenge-result" role="status">
                  <span className="challenge-result-emoji" aria-hidden="true">
                    {landBoss.won === "win" ? "🏆" : landBoss.won === "tie" ? "🤝" : "💪"}
                  </span>
                  <span className="challenge-result-line">
                    {landBoss.won === "win"
                      ? lang === "bn" ? t.bossWinBn : t.bossWin
                      : landBoss.won === "tie"
                        ? t.bossTie
                        : t.bossLose}
                  </span>
                  <span className="challenge-scoreline">
                    {t.chYou} {bnNum(landBoss.myScore)} · {t.chNova} {bnNum(landBoss.novaScore)}
                  </span>
                  {landBoss.coins > 0 && (
                    <span className="challenge-coins">{t.chCoins(landBoss.coins)}</span>
                  )}
                </div>
                <div className="challenge-btns">
                  <button className="big-btn" onClick={() => startBoss(landBoss.band)}>{t.chAgain}</button>
                  <button className="ghost-btn" onClick={closeBoss}>{t.chClose}</button>
                </div>
              </>
            ) : (
              <>
                <div className="challenge-top">
                  <span className="challenge-round">{t.chRound(landBoss.round, BOSS_ROUNDS)}</span>
                  <span className="challenge-level">{t.chLevel(landBoss.level)}</span>
                </div>
                <div className="challenge-score" role="status" aria-label={`${t.chYou} ${landBoss.myScore}, ${t.chNova} ${landBoss.novaScore}`}>
                  <span className="challenge-score-you"><Icon name="nova" size={20} /> <b>{t.chYou}</b> {bnNum(landBoss.myScore)}</span>
                  <span className="challenge-vs">VS</span>
                  <span className="challenge-score-nova"><Icon name="nova" size={20} /> <b>{t.chNova}</b> {bnNum(landBoss.novaScore)}</span>
                </div>
                <div className="challenge-q" aria-label={t.chQuestion}>{landBoss.q.text}</div>
                <div className="challenge-options">
                  {landBoss.q.options.map((opt, i) => {
                    const picked = landBoss.pick === i;
                    const reveal = landBoss.pick !== null;
                    let cls = "challenge-option";
                    if (reveal) {
                      if (i === landBoss.q.answer) cls += " reveal";
                      if (picked && landBoss.correct) cls += " correct";
                      else if (picked) cls += " wrong";
                    }
                    return (
                      <button
                        key={`${landBoss.round}-${i}`}
                        className={cls}
                        disabled={reveal}
                        onClick={() => pickBoss(i)}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {landBoss.pick !== null && (
                  <div className="challenge-feedback" role="status">
                    <span>{landBoss.correct ? t.chCorrect : t.chWrong}</span>
                    <span className="challenge-nova-line">{landBoss.novaGot ? t.chNovaGot : t.chNovaMiss}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
