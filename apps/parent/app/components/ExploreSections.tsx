/* ─── ExploreSections — games/compare/printables (#620) ─── */
"use client";

import type { Kid } from "../../lib/api";
import type { WorksheetProblem } from "../../lib/worksheet";

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



export function GamesCard({ active, coverageBySubject, coveragePct, coveragePlayed, coverageTotal, untriedGames }: {
  active: ActiveKid;
  coverageBySubject: CoverageSubject[];
  coveragePct: number;
  coveragePlayed: number;
  coverageTotal: number;
  untriedGames: UntriedGame[];
}) {
  return (
<section className="card coverage-card" id="games">
  <h2>🎮 Games to try</h2>
  <p className="muted small">
    Which of the catalog’s games {active.name} has played — and which are still
    waiting. Derived from the dashboard’s already-loaded progress, so it works offline.
  </p>
  <div className="coverage-summary">
    <span className="coverage-total">{coveragePlayed} of {coverageTotal} games played</span>
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
    <p className="muted">All games played — {active.name} is a full explorer! 🎉</p>
  ) : (
    <ul className="coverage-list">
      {untriedGames.map((g) => (
        <li key={g.skill.id} className="coverage-row">
          <span className="coverage-title">
            {g.skill.title}
            {g.skill.titleBn ? <span className="muted small"> · {g.skill.titleBn}</span> : null}
          </span>
          <span className="coverage-band">World {g.skill.band}</span>
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
}: {
  kids: Kid[];
  cmpAId: string;
  cmpBId: string;
  setCmpA: (v: string) => void;
  setCmpB: (v: string) => void;
  mtrA: { avatar: string; name: string };
  mtrB: { avatar: string; name: string };
  compareRows: CompareRow[];
}) {
  if (kids.length < 2) return null;
  return (
  <section className="card compare-card" id="compare">
    <h2>⚖️ Compare two kids</h2>
    <p className="muted small">
      How {mtrA.name} and {mtrB.name} stack up, metric by metric. Everything here is
      read from the dashboard’s already-loaded data — it works offline.
    </p>
    <div className="compare-pickers">
      <select aria-label="First kid to compare" value={cmpAId} onChange={(e) => setCmpA(e.target.value)}>
        {kids.map((k) => (
          <option key={k.id} value={k.id}>
            {k.avatar} {k.name}
          </option>
        ))}
      </select>
      <span className="vs">vs</span>
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
          <th>Metric</th>
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

export function WorksheetCard({ active, sheet, sheetBusy, handleWorksheet, setSheet }: {
  active: ActiveKid;
  sheet: SheetView | null;
  sheetBusy: boolean;
  handleWorksheet: () => Promise<void> | void;
  setSheet: (s: SheetView | null) => void;
}) {
  return (
<section className="card worksheet-card" id="worksheet">
  <h2>📄 Printable worksheet</h2>
  <p className="muted small">
    A practice sheet built from what {active.name} hasn't mastered yet — perfect for offline
    homework. Print or save as PDF (your browser's Print dialog).
  </p>
  <div className="worksheet-actions">
    <button className="btn" disabled={sheetBusy} onClick={() => void handleWorksheet()}>
      {sheetBusy ? "Building…" : "🖨️ Build worksheet"}
    </button>
    {sheet && (
      <button className="btn ghost-btn" onClick={() => window.print()}>Print / save PDF</button>
    )}
    {sheet && (
      <button className="btn ghost-btn" onClick={() => setSheet(null)}>Close</button>
    )}
  </div>
  {sheet && (
    <p className="muted small mt-8">
      {sheet.items.length} practice lines for {sheet.name} · generated {sheet.date} · tap Print for a clean A4 sheet.
    </p>
  )}
</section>
  );
}

export function FlashcardsCard({ active, qrCards, qrBusy, handleQRCards, setQrCards }: {
  active: ActiveKid;
  qrCards: { length: number } | null;
  qrBusy: boolean;
  handleQRCards: () => Promise<void> | void;
  setQrCards: (c: null) => void;
}) {
  return (
<section className="card worksheet-card" id="flashcards">
  <h2>🎴 Flashcard QR cards</h2>
  <p className="muted small">
    Printable QR codes for the games {active.name} has played. A kid scans a card
    (or types its code) in the app to jump straight into that mini-game — works offline.
  </p>
  <div className="worksheet-actions">
    <button className="btn" disabled={qrBusy} onClick={() => void handleQRCards()}>
      {qrBusy ? "Building…" : "🎴 Build QR cards"}
    </button>
    {qrCards && qrCards.length > 0 && (
      <button className="btn ghost-btn" onClick={() => window.print()}>Print / save PDF</button>
    )}
    {qrCards && (
      <button className="btn ghost-btn" onClick={() => setQrCards(null)}>Close</button>
    )}
  </div>
  {qrCards && qrCards.length === 0 && (
    <p className="muted small mt-8">
      No games played yet — {active.name} needs a session first (mastery builds from rounds).
    </p>
  )}
</section>
  );
}