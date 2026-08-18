import { useEffect, useState } from "react";
import { filterSkills, masteryThresholdFor, type Kid, type SkillMap } from "../lib/journey";
import type { MistakeState } from "../store";
import { bnNum, type Lang, type Strings } from "../i18n";
import type { Skill } from "@numberverse/core";

/**
 * Print sheets — the parent-facing PRINT side of learning.
 *
 * Two offline-first, print-to-PDF screens (both reused by the parent panel):
 *
 *  · WorksheetScreen (#1338) — pick the skills a kid is struggling with and
 *    print a practice sheet: generated warm-ups for the well-defined fact
 *    drills (count/add/sub/mul/div), a write/trace line for everything else.
 *    No network, no analytics — `window.print()` (Save as PDF) is the renderer.
 *
 *  · FlashcardsScreen (#1345) — print QR cards for picked skills. Each card's
 *    QR encodes `NV:<skillId>`, the SAME code the #139 scan sheet already
 *    decodes (`launchCardCode`), so a kid scans a printed card and lands
 *    straight in that skill's game — fully offline (qrcode is a dynamic
 *    import, precached by the service worker).
 */
type SheetProps = {
  kid: Kid;
  skillsMap: SkillMap;
  mistakes: Record<string, MistakeState>;
  t: Strings;
  lang: Lang;
  onBack: () => void;
};

/** Printable-sheet op classification — what kind of exercise can we honestly
 *  generate for a skill? Unknown → a write/trace line (never wrong answers). */
type Op = "count" | "add" | "sub" | "mul" | "div" | "write";
function opForSkill(s: Skill): Op {
  const g = s.game ?? "";
  if (/^(game-count|game-growcount|game-countsong|game-countpop|game-balloonpop|game-countback|game-froghop)/.test(g)) return "count";
  if (/^(game-add|game-fruitadd|game-fruittree|game-maketen|game-doubles|game-bnbonds|game-addfacts|game-addregroup|game-addsub100|game-regroup|game-build999|game-share)/.test(g)) return "add";
  if (/^(game-sub|game-fruitsub|game-subfacts|game-subborrow)/.test(g)) return "sub";
  if (/^(game-multable|game-array-mult|game-rocketmult)/.test(g)) return "mul";
  if (/^(game-division|game-div-23)/.test(g)) return "div";
  return "write";
}

type Row = { kind: "count"; stars: number } | { kind: "add"; a: number; b: number } | { kind: "sub"; a: number; b: number } | { kind: "mul"; a: number; b: number } | { kind: "div"; a: number; b: number };

/** Deterministic-feeling (Math.random is fine for a one-shot print) set of
 *  warm-ups, scaled to the skill's band so a class-1 sheet stays gentle. */
function genRows(s: Skill, count: number): Row[] {
  const op = opForSkill(s);
  const band = s.band ?? 1;
  const max = band <= 2 ? 10 : band <= 3 ? 20 : band <= 5 ? 50 : 100;
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    if (op === "count") {
      rows.push({ kind: "count", stars: 3 + Math.floor(Math.random() * (band <= 2 ? 6 : 10)) });
    } else if (op === "add") {
      const cap = Math.max(6, Math.min(max, 10 + band * 4));
      const a = 2 + Math.floor(Math.random() * Math.max(2, cap - 4));
      const b = 2 + Math.floor(Math.random() * Math.max(2, cap - a));
      rows.push({ kind: "add", a, b });
    } else if (op === "sub") {
      const a = 6 + Math.floor(Math.random() * Math.max(4, max - 8));
      const b = 1 + Math.floor(Math.random() * (a - 1));
      rows.push({ kind: "sub", a, b });
    } else if (op === "mul") {
      const hi = band <= 3 ? 5 : 9;
      const a = 2 + Math.floor(Math.random() * (hi - 1));
      const b = 2 + Math.floor(Math.random() * (hi - 1));
      rows.push({ kind: "mul", a, b });
    } else if (op === "div") {
      const hi = band <= 3 ? 5 : 9;
      const b = 2 + Math.floor(Math.random() * (hi - 1));
      const q = 2 + Math.floor(Math.random() * (hi - 1));
      rows.push({ kind: "div", a: b * q, b });
    }
  }
  return rows.length ? rows : [{ kind: "add", a: 2, b: 3 }];
}

function opLabel(s: Skill, t: Strings): string {
  const op = opForSkill(s);
  return op === "count" ? t.wsCount : op === "write" ? t.wsWriteTrace : t.wsSolve;
}

function RowView({ row, lang }: { row: Row; lang: Lang }) {
  const n = (x: number) => (lang === "bn" ? bnNum(x) : String(x));
  if (row.kind === "count") {
    return <div className="ws-row ws-row-count">{"★".repeat(row.stars)} <span className="ws-blank">{lang === "bn" ? "______" : "______"}</span></div>;
  }
  const sym = { add: "+", sub: "−", mul: "×", div: "÷" }[row.kind];
  const lhs = row.kind === "div" ? `${n(row.a)} ${sym} ${n(row.b)}` : `${n(row.a)} ${sym} ${n(row.b)}`;
  return <div className="ws-row">{lhs} = <span className="ws-blank">{lang === "bn" ? "________" : "________"}</span></div>;
}

function skillLabel(s: Skill, lang: Lang): string {
  return lang === "bn" && s.titleBn ? s.titleBn : s.title;
}

/* ─────────────────────────── Worksheet (#1338) ─────────────────────────── */

export function WorksheetScreen({ kid, skillsMap, mistakes, t, lang, onBack }: SheetProps) {
  const [selected, setSelected] = useState<Set<string>>(() => seedWorksheet(kid.id, skillsMap, mistakes));
  const [ready, setReady] = useState(false);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const nx = new Set(prev);
      if (nx.has(id)) nx.delete(id);
      else nx.add(id);
      return nx;
    });
  const list = filterSkills.filter((s) => s.game);
  const chosen = list.filter((s) => selected.has(s.id));
  const rowsPerSkill = 5;

  if (ready) {
    return (
      <div className="print-screen" role="document" aria-label={t.wsTitle}>
        <div className="cert-toolbar no-print">
          <button className="icon-btn" onClick={() => setReady(false)} aria-label={t.wsBack}>←</button>
          <span className="cert-toolbar-title">{t.wsTitle}</span>
          <button className="cert-print-btn" onClick={() => window.print()}>{t.wsPrint}</button>
        </div>
        <div className="print-sheet ws-sheet">
          <div className="ws-head">
            <span className="ws-emoji" aria-hidden="true">📝</span>
            <div className="ws-head-txt">
              <span className="ws-title">{t.wsTitle}</span>
              <span className="ws-for">{t.wsFor(kid.name)}</span>
            </div>
            <span className="ws-date">{new Date().toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
          {chosen.length === 0 ? (
            <p className="ws-empty">{t.wsNoSkills}</p>
          ) : (
            <ol className="ws-blocks">
              {chosen.map((s, i) => (
                <li key={s.id} className="ws-block">
                  <div className="ws-block-head">
                    <span className="ws-block-num">{lang === "bn" ? bnNum(i + 1) : String(i + 1)}</span>
                    <span className="ws-block-title">{skillLabel(s, lang)}</span>
                    <span className="ws-block-op">{opLabel(s, t)}</span>
                  </div>
                  {opForSkill(s) === "write" ? (
                    <div className="ws-write"><span className="ws-write-line">{"__________________________________________________"}</span><span className="ws-write-line">{"__________________________________________________"}</span></div>
                  ) : (
                    <div className="ws-rows">
                      {genRows(s, rowsPerSkill).map((r, j) => (
                        <RowView key={j} row={r} lang={lang} />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="screen worlds parent-screen">
        <header className="screen-head">
          <button className="icon-btn" onClick={onBack} aria-label={t.wsBack}>←</button>
          <div className="head-title">
            <h2>{t.wsTitle}</h2>
            <p className="head-sub">{t.wsSub}</p>
          </div>
        </header>
        <p className="ws-pick-hint">{t.wsPickHint} · <span className="ws-count">{t.wsSelected(selected.size)}</span></p>
        <div className="ws-pick-grid">
          {list.map((s) => {
            const st = skillsMap[`${kid.id}:${s.id}`];
            const mastered = (st?.pMastered ?? 0) >= masteryThresholdFor(s.id);
            const wrong = (mistakes[`${kid.id}:${s.id}`]?.wrong ?? 0) > 0;
            const on = selected.has(s.id);
            const tag = wrong ? t.wsNeedsPractice : mastered ? t.wsAll : t.wsUnmastered;
            return (
              <button key={s.id} className={`ws-pick${on ? " on" : ""}`} onClick={() => toggle(s.id)} aria-pressed={on}>
                <span className="ws-pick-title">{skillLabel(s, lang)}</span>
                <span className="ws-pick-tag">{tag}</span>
              </button>
            );
          })}
        </div>
        <button className="big-btn ws-go" disabled={selected.size === 0} onClick={() => setReady(true)}>
          {t.wsPrint}
        </button>
        <p className="ws-print-hint">{t.wsPrintHint}</p>
      </main>
    </div>
  );
}

function seedWorksheet(kidId: string, skillsMap: SkillMap, mistakes: Record<string, MistakeState>): Set<string> {
  // Struggling skills ALWAYS lead (that's the point of the sheet); then pad
  // with unmastered up to a print-friendly count so a fresh profile doesn't
  // default to a 140-skill booklet.
  const struggling: string[] = [];
  const unmastered: string[] = [];
  for (const s of filterSkills) {
    if (!s.game) continue;
    const st = skillsMap[`${kidId}:${s.id}`];
    const wrong = (mistakes[`${kidId}:${s.id}`]?.wrong ?? 0) > 0;
    const isUn = !st || (st.pMastered ?? 0) < masteryThresholdFor(s.id);
    if (wrong) struggling.push(s.id);
    else if (isUn) unmastered.push(s.id);
  }
  return new Set([...struggling, ...unmastered.slice(0, Math.max(0, 12 - struggling.length))]);
}

/* ─────────────────────────── Flashcards (#1345) ─────────────────────────── */

export function FlashcardsScreen({ kid, skillsMap, t, lang, onBack }: Omit<SheetProps, "mistakes">) {
  const [selected, setSelected] = useState<Set<string>>(() => seedFlashcards(kid.id, skillsMap));
  const [ready, setReady] = useState(false);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [drawing, setDrawing] = useState(false);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const nx = new Set(prev);
      if (nx.has(id)) nx.delete(id);
      else nx.add(id);
      return nx;
    });
  const list = filterSkills.filter((s) => s.game);
  const chosen = list.filter((s) => selected.has(s.id));

  // Draw QR codes ONLY when the print sheet opens — dynamic import keeps the
  // main bundle lean and the chunk is service-worker-cached → offline.
  useEffect(() => {
    if (!ready || chosen.length === 0) return;
    let active = true;
    setDrawing(true);
    (async () => {
      try {
        const QR = await import("qrcode");
        const entries: Array<[string, string]> = [];
        for (const s of chosen) {
          const url = await QR.toDataURL(`NV:${s.id}`, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 220,
            color: { dark: "#1d3557", light: "#ffffff" },
          });
          if (!active) return;
          entries.push([s.id, url]);
        }
        if (active) setQrs(Object.fromEntries(entries));
      } catch {
        /* qrcode chunk unavailable — the picker stays usable; print just
           shows the code text (still scannable via manual entry). */
      } finally {
        if (active) setDrawing(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (ready) {
    return (
      <div className="print-screen" role="document" aria-label={t.fcTitle}>
        <div className="cert-toolbar no-print">
          <button className="icon-btn" onClick={() => setReady(false)} aria-label={t.fcBack}>←</button>
          <span className="cert-toolbar-title">{t.fcTitle}</span>
          <button className="cert-print-btn" onClick={() => window.print()} disabled={drawing}>{t.fcPrint}</button>
        </div>
        <div className="print-sheet fc-sheet">
          <div className="ws-head">
            <span className="ws-emoji" aria-hidden="true">🃏</span>
            <div className="ws-head-txt">
              <span className="ws-title">{t.fcTitle}</span>
              <span className="ws-for">{t.fcFor(kid.name)}</span>
            </div>
            <span className="ws-date">{t.fcHow}</span>
          </div>
          {drawing ? (
            <p className="fc-drawing">{t.fcDrawing}</p>
          ) : (
            <div className="fc-grid">
              {chosen.map((s) => {
                const url = qrs[s.id];
                return (
                  <div key={s.id} className="fc-card">
                    <div className="fc-qr">
                      {url ? <img src={url} alt="" width={220} height={220} loading="lazy" decoding="async" /> : <span className="fc-qr-text">NV:{s.id}</span>}
                    </div>
                    <div className="fc-card-title">{skillLabel(s, lang)}</div>
                    <div className="fc-card-code">NV:{s.id}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="screen worlds parent-screen">
        <header className="screen-head">
          <button className="icon-btn" onClick={onBack} aria-label={t.fcBack}>←</button>
          <div className="head-title">
            <h2>{t.fcTitle}</h2>
            <p className="head-sub">{t.fcSub}</p>
          </div>
        </header>
        <p className="ws-pick-hint">{t.fcPickHint} · <span className="ws-count">{t.fcSelected(selected.size)}</span></p>
        <div className="ws-pick-grid">
          {list.map((s) => {
            const on = selected.has(s.id);
            return (
              <button key={s.id} className={`ws-pick${on ? " on" : ""}`} onClick={() => toggle(s.id)} aria-pressed={on}>
                <span className="ws-pick-title">{skillLabel(s, lang)}</span>
              </button>
            );
          })}
        </div>
        <button className="big-btn ws-go" disabled={selected.size === 0} onClick={() => setReady(true)}>
          {t.fcPrint}
        </button>
        <p className="ws-print-hint">{t.fcPrintHint}</p>
      </main>
    </div>
  );
}

function seedFlashcards(kidId: string, skillsMap: SkillMap): Set<string> {
  // Default: up to 24 unmastered skills (a print-friendly deck). If the whole
  // map is mastered, fall back to a fresh spread across the catalog.
  const out = new Set<string>();
  for (const s of filterSkills) {
    if (!s.game) continue;
    const st = skillsMap[`${kidId}:${s.id}`];
    if (!st || (st.pMastered ?? 0) < masteryThresholdFor(s.id)) {
      out.add(s.id);
      if (out.size >= 24) break;
    }
  }
  if (out.size === 0) {
    for (const s of filterSkills.slice(0, 24)) if (s.game) out.add(s.id);
  }
  return out;
}
