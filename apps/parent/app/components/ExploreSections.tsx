/* ─── ExploreSections — games/compare/printables (#620) ───
   i18n seam: EXPLORE_LANGS keyed by `wizLang`; add a locale key to that map in
   lib/portal and these cards follow. */
"use client";

import type { Kid } from "../../lib/api";
import type { WorksheetProblem } from "../../lib/worksheet";
import { EXPLORE_LANGS, type WizardLang } from "../lib/portal";

interface ActiveKid {
  name: string;
}

interface CoverageSubject {
  id: string;
  emoji: string;
  label: string;
  tried: number;
  total: number;
}

interface UntriedGame {
  skill: { id: string; title: string; titleBn?: string | null; band: number };
}

interface CompareRow {
  label: string;
  a: string;
  b: string;
  higher: string | null;
}

interface SheetView {
  name: string;
  items: WorksheetProblem[];
  date: string;
}



export function GamesCard({ active, coverageBySubject, coveragePct, coveragePlayed, coverageTotal, untriedGames, wizLang }: {
  active: ActiveKid;
  coverageBySubject: CoverageSubject[];
  coveragePct: number;
  coveragePlayed: number;
  coverageTotal: number;
  untriedGames: UntriedGame[];
  wizLang: WizardLang;
}) {
  const L = EXPLORE_LANGS[wizLang];
  return (
<section className="card coverage-card" id="games">
  <h2>{L.gamesTitle}</h2>
  <p className="muted small">
    {L.gamesHint.replace("{name}", active.name)}
  </p>
  <div className="coverage-summary">
    <span className="coverage-total">{L.gamesPlayed.replace("{played}", String(coveragePlayed)).replace("{total}", String(coverageTotal))}</span>
    <div className="bar big">
      <div className={`fill${coveragePct === 100 ? " done" : ""}`} style={{ width: `${coveragePct}%` }} />
    </div>
  </div>
  {coverageBySubject.map((sub) => {
    const pct = sub.total ? Math.round((sub.tried / sub.total) * 100) : 0;
    return (
      <div key={sub.id} className="coverage-subject">
        <span className="coverage-subject-label">
          {sub.emoji} {sub.label} <span className="muted small">{sub.tried}/{sub.total}</span>
        </span>
        <div className="bar">
          <div className={`fill${pct === 100 ? " done" : ""}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  })}
  {untriedGames.length === 0 ? (
    <p className="muted">{L.gamesDone.replace("{name}", active.name)}</p>
  ) : (
    <ul className="coverage-list">
      {untriedGames.map((g) => (
        <li key={g.skill.id} className="coverage-row">
          <span className="coverage-title">
            {g.skill.title}
            {g.skill.titleBn ? <span className="muted small"> · {g.skill.titleBn}</span> : null}
          </span>
          <span className="coverage-band">{L.world.replace("{band}", String(g.skill.band))}</span>
        </li>
      ))}
    </ul>
  )}
</section>
  );
}

export function CompareCard({
  kids,
  cmpAId,
  cmpBId,
  setCmpA,
  setCmpB,
  mtrA,
  mtrB,
  compareRows,
  wizLang,
}: {
  kids: Kid[];
  cmpAId: string;
  cmpBId: string;
  setCmpA: (v: string) => void;
  setCmpB: (v: string) => void;
  mtrA: { avatar: string; name: string };
  mtrB: { avatar: string; name: string };
  compareRows: CompareRow[];
  wizLang: WizardLang;
}) {
  if (kids.length < 2) return null;
  const L = EXPLORE_LANGS[wizLang];
  return (
  <section className="card compare-card" id="compare">
    <h2>{L.compareTitle}</h2>
    <p className="muted small">
      {L.compareHint.replace("{a}", mtrA.name).replace("{b}", mtrB.name)}
    </p>
    <div className="compare-pickers">
      <select aria-label="First kid to compare" value={cmpAId} onChange={(e) => setCmpA(e.target.value)}>
        {kids.map((k) => (
          <option key={k.id} value={k.id}>
            {k.avatar} {k.name}
          </option>
        ))}
      </select>
      <span className="vs">{L.vs}</span>
      <select aria-label="Second kid to compare" value={cmpBId} onChange={(e) => setCmpB(e.target.value)}>
        {kids.map((k) => (
          <option key={k.id} value={k.id}>
            {k.avatar} {k.name}
          </option>
        ))}
      </select>
    </div>
    <table className="compare-table">
      <thead>
        <tr>
          <th>{L.metric}</th>
          <th>{mtrA.avatar} {mtrA.name}</th>
          <th>{mtrB.avatar} {mtrB.name}</th>
        </tr>
      </thead>
      <tbody>
        {compareRows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className={r.higher === "a" ? "cmp-lead" : ""}>{r.a}</td>
            <td className={r.higher === "b" ? "cmp-lead" : ""}>{r.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
  );
}

export function WorksheetCard({ active, sheet, sheetBusy, handleWorksheet, setSheet, wizLang }: {
  active: ActiveKid;
  sheet: SheetView | null;
  sheetBusy: boolean;
  handleWorksheet: () => Promise<void> | void;
  setSheet: (s: SheetView | null) => void;
  wizLang: WizardLang;
}) {
  const L = EXPLORE_LANGS[wizLang];
  return (
<section className="card worksheet-card" id="worksheet">
  <h2>{L.worksheetTitle}</h2>
  <p className="muted small">
    {L.worksheetHint.replace("{name}", active.name)}
  </p>
  <div className="worksheet-actions">
    <button className="btn" disabled={sheetBusy} onClick={() => void handleWorksheet()}>
      {sheetBusy ? L.building : L.buildWorksheet}
    </button>
    {sheet && (
      <button className="btn ghost-btn" onClick={() => window.print()}>{L.printPdf}</button>
    )}
    {sheet && (
      <button className="btn ghost-btn" onClick={() => setSheet(null)}>{L.close}</button>
    )}
  </div>
  {sheet && (
    <p className="muted small mt-8">
      {L.sheetMeta.replace("{n}", String(sheet.items.length)).replace("{name}", sheet.name).replace("{date}", sheet.date)}
    </p>
  )}
</section>
  );
}

export function FlashcardsCard({ active, qrCards, qrBusy, handleQRCards, setQrCards, wizLang }: {
  active: ActiveKid;
  qrCards: { length: number } | null;
  qrBusy: boolean;
  handleQRCards: () => Promise<void> | void;
  setQrCards: (c: null) => void;
  wizLang: WizardLang;
}) {
  const L = EXPLORE_LANGS[wizLang];
  return (
<section className="card worksheet-card" id="flashcards">
  <h2>{L.flashcardsTitle}</h2>
  <p className="muted small">
    {L.flashcardsHint.replace("{name}", active.name)}
  </p>
  <div className="worksheet-actions">
    <button className="btn" disabled={qrBusy} onClick={() => void handleQRCards()}>
      {qrBusy ? L.building : L.buildQrCards}
    </button>
    {qrCards && qrCards.length > 0 && (
      <button className="btn ghost-btn" onClick={() => window.print()}>{L.printPdf}</button>
    )}
    {qrCards && (
      <button className="btn ghost-btn" onClick={() => setQrCards(null)}>{L.close}</button>
    )}
  </div>
  {qrCards && qrCards.length === 0 && (
    <p className="muted small mt-8">
      {L.noGamesPlayed.replace("{name}", active.name)}
    </p>
  )}
</section>
  );
}