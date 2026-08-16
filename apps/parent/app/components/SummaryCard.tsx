"use client";

import { ACCOUNT_LANGS, TOPBAR_LANGS, type WizardLang } from "../lib/portal";

interface ActiveKid {
  name: string;
  avatar?: string | null;
  birth_year?: number | null;
}

/** #1588 — the progress-summary header (avatar, name, mastered / in-progress /
 *  coverage bar) plus the #1513 unsaved-settings switch guard. Extracted from
 *  page.tsx so the dashboard file stays focused on data wiring. */
export default function SummaryCard({
  active,
  masteredCount,
  inProgressCount,
  catalogCount,
  wizLang,
  pendingSwitchId,
  onConfirmSwitch,
  onCancelSwitch,
}: {
  active: ActiveKid;
  masteredCount: number;
  inProgressCount: number;
  catalogCount: number;
  wizLang: WizardLang;
  pendingSwitchId: string | null;
  onConfirmSwitch: () => void;
  onCancelSwitch: () => void;
}) {
  const A = ACCOUNT_LANGS[wizLang];
  const pct = catalogCount ? Math.round((masteredCount / catalogCount) * 100) : 0;
  return (
    <section className="card summary">
      {pendingSwitchId && (
        <div className="confirm-group unsaved-confirm" role="alert">
          <span className="muted">{A.unsavedConfirm}</span>
          <button className="btn btn-small primary" onClick={onConfirmSwitch}>
            {A.unsavedContinue}
          </button>
          <button className="btn btn-small ghost" onClick={onCancelSwitch}>
            {A.unsavedCancel}
          </button>
        </div>
      )}
      <div className="summary-head">
        <span className="big-avatar" aria-hidden="true">{active.avatar ?? "🧒"}</span>
        <div className="summary-meta">
          <h2>
            {active.name}{" "}
            <small>
              ({TOPBAR_LANGS[wizLang].born} {active.birth_year ?? "—"})
            </small>
          </h2>
          {/* #1523 — in-progress = attempted-but-not-mastered. */}
          <p className="muted">
            {A.summaryMastered.replace("{n}", String(masteredCount))} ·{" "}
            {A.summaryInProgress.replace("{n}", String(inProgressCount))}
          </p>
          <p className="muted small">
            {A.summaryCoverage
              .replace("{pct}", String(pct))
              .replace("{mastered}", String(masteredCount))
              .replace("{total}", String(catalogCount))}
          </p>
        </div>
      </div>
      <div className="overall-bar">
        <div className="overall-fill" style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
