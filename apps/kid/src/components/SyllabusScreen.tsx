import type React from "react";
import { useState } from "react";
import { BANDS, SKILLS, type Band, type Skill } from "@numberverse/core";
import { parentName, hasParentSession } from "../api";
import { totalMastered, progressUnitCount, worldProgress, progressUnitsInBand, WORLD_LANDS, masteryDisplayPct, masteryThresholdFor, loadKids, type SkillMap, type Kid } from "../lib/journey";
import { type Lang, type Strings } from "../i18n";
import type { Screen } from "../App";
import { Icon } from "./Icon";

/** #1075 — the catalog's subject chips (all six subjects a parent can filter by). */
const CATALOG_SUBJECTS = ["math", "bangla", "english", "science", "bgs", "ict"] as const;

export interface SyllabusScreenProps {
  kid: Kid | null;
  skillsMap: SkillMap;
  lang: Lang;
  t: Strings;
  onGoAddKid: (returnTo?: Screen) => void;
  onBack: () => void;
  setScreen: (s: Screen) => void;
  gateReturn: React.MutableRefObject<Screen>;
  startSingleSkill: (s: Skill) => void;
}

export default function SyllabusScreen({
  kid, skillsMap, lang, t, onGoAddKid, onBack, setScreen, gateReturn, startSingleSkill,
}: SyllabusScreenProps) {
  const pName = parentName();
  const masteredCount = kid ? totalMastered(skillsMap, kid.id) : 0;
  // #1207-#1216 — skills that are tiers of ONE family count once, so the
  // syllabus's "X mastered / Y" matches the one-concept number the kid sees.
  const totalCount = progressUnitCount();
  const goStart = () => {
    const list = loadKids();
    if (list.length === 0) {
      onGoAddKid("syllabus");
      return;
    }
    setScreen(kid ? "home" : "kidpick");
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
  // #1075 — catalog search + subject filter (parent-facing syllabus grid). A
  // text match on title/titleBn/description plus six subject chips; band
  // progress bars stay unfiltered so the plan never lies about the band.
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const query = q.trim().toLowerCase();
  const matchesFilter = (s: Skill) => {
    if (subject && s.subject !== subject) return false;
    if (!query) return true;
    const hay = `${s.title} ${s.titleBn ?? ""} ${s.description ?? ""} ${s.descriptionBn ?? ""}`.toLowerCase();
    return hay.includes(query);
  };
  const filteredTotal = SKILLS.filter((s) => matchesFilter(s)).length;
  const activeChip: React.CSSProperties = {
    background: "var(--nv-sky, #4cc9f0)",
    borderColor: "var(--nv-sky, #4cc9f0)",
    color: "#06283d",
    textShadow: "none",
  };
  return (
    <div className="app">
      <main className="screen worlds parent-screen">
        <header className="screen-head">
          <button className="icon-btn" onClick={onBack} aria-label={t.backTo(t.welcomeTitle)}>←</button>
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

          {/* #1075 — catalog search + subject filter bar (parent-facing) */}
          <div className="catalog-filter" role="group" aria-label={t.catalogSubject} style={{ display: "flex", flexDirection: "column", gap: 10, margin: "0 0 14px" }}>
            <input
              className="input-field"
              type="search"
              placeholder={t.catalogSearch}
              aria-label={t.catalogSearch}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="catalog-filter-chips" role="group" aria-label={t.catalogSubject} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                className={`syllabus-chip${subject === "" ? " on" : ""}`}
                onClick={() => setSubject("")}
                style={subject === "" ? activeChip : undefined}
              >
                {t.catalogAll}
              </button>
              {CATALOG_SUBJECTS.map((sub) => (
                <button
                  type="button"
                  key={sub}
                  className={`syllabus-chip${subject === sub ? " on" : ""}`}
                  onClick={() => setSubject(subject === sub ? "" : sub)}
                  style={subject === sub ? activeChip : undefined}
                >
                  {t.catalogSubjects[sub]}
                </button>
              ))}
            </div>
          </div>

          {/* ── EYE-CATCHING WORLD GRID ── each world is a card tinted with
               its own land colors; lessons are a grid of tappable tiles. */}
          {filteredTotal === 0 && (
            <p className="catalog-no-match" role="status" style={{ textAlign: "center", opacity: 0.85, margin: "12px 0" }}>{t.catalogNoMatch}</p>
          )}
          {BANDS.map((b) => {
            const skills = SKILLS.filter((s) => s.band === b.id && matchesFilter(s));
            if (!skills.length) return null;
            const p = kid ? worldProgress(skillsMap, kid.id, b.id) : { mastered: 0, total: progressUnitsInBand(b.id), pct: 0 };
            const palette = WORLD_LANDS[b.id] ?? { c1: "#0b3d2e", c2: "#2f9e6e", c3: "#c8f2c9", c2_22: "rgba(47,158,110,0.16)", deco: ["🌱"] };
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
                    const pct = masteryDisplayPct(ms, s.id);
                    const mastered = !!ms && ms.pMastered >= masteryThresholdFor(s.id);
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
                        <span className="syllabus-tile-class">{t.classLabel(s.classNumber ?? s.band)}</span>
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
