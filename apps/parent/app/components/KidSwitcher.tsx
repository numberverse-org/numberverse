"use client";

import { TOPBAR_LANGS, type WizardLang } from "../lib/portal";

interface KidChip {
  id: string;
  name: string;
  avatar?: string | null;
  birth_year?: number | null;
}

/** #1588 — the kid switcher row (+ add-kid fast path), extracted from
 *  page.tsx so the dashboard file stays focused on data wiring. */
export default function KidSwitcher({
  kids,
  activeId,
  onSwitch,
  onToggleAdd,
  wizLang,
}: {
  kids: KidChip[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onToggleAdd: () => void;
  wizLang: WizardLang;
}) {
  const t = TOPBAR_LANGS[wizLang];
  return (
    <section className="kids-row" aria-label={t.addKid}>
      {kids.map((k) => {
        const isActive = k.id === activeId;
        return (
          <button
            key={k.id}
            className={`kid-chip${isActive ? " on" : ""}`}
            onClick={() => onSwitch(k.id)}
            aria-pressed={isActive}
          >
            <span className="kid-avatar" aria-hidden="true">{k.avatar ?? "🧒"}</span>
            <span className="kid-name">{k.name}</span>
            <span className="kid-year">{k.birth_year ?? "—"}</span>
          </button>
        );
      })}
      <button
        className="kid-chip add"
        onClick={onToggleAdd}
        aria-label={t.addKid}
      >
        <span className="kid-avatar" aria-hidden="true">＋</span>
        <span className="kid-name">{t.addKid}</span>
      </button>
    </section>
  );
}
