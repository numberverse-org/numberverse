"use client";

import { TOPBAR_LANGS, WIZARD_LANGS, type WizardLang } from "../lib/portal";

/** #1591 — the no-kids empty state. "Add your first kid" fast-path plus a
 *  re-openable setup guide so "Not now" is never a permanent dead-end. */
export default function EmptyState({
  wizLang,
  onAddFirst,
  onRerunSetup,
}: {
  wizLang: WizardLang;
  onAddFirst: () => void;
  onRerunSetup: () => void;
}) {
  const t = WIZARD_LANGS[wizLang];
  const top = TOPBAR_LANGS[wizLang];
  return (
    <div className="empty-state">
      <p className="hint center">{t.noKidsDone}</p>
      <div className="row-buttons center">
        <button className="btn primary" onClick={onAddFirst}>
          ＋ {top.addYourFirstKid}
        </button>
        <button className="btn ghost" onClick={onRerunSetup}>
          ✨ {top.rerunSetup}
        </button>
      </div>
    </div>
  );
}
