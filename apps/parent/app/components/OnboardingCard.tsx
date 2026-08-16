"use client";

import { AVATARS, WIZARD_LANGS, avatarName, type WizardLang } from "../lib/portal";

interface OnboardingKid {
  id: string;
  name: string;
  avatar?: string | null;
}

/** #246/#1591/#1610 — guided multi-kid onboarding wizard, extracted from
 *  page.tsx (#1588). #1610 — the fields are wrapped in a real <form> so Enter
 *  submits from ANY input (previously only the name field replied to Enter).
 */
export default function OnboardingCard({
  wizLang,
  onChangeLang,
  kids,
  editName,
  setEditName,
  editAvatar,
  setEditAvatar,
  editBirthYear,
  setEditBirthYear,
  onboardBusy,
  onboardErr,
  onSubmit,
  onAddAnother,
  onFinish,
}: {
  wizLang: WizardLang;
  onChangeLang: (next: WizardLang) => void;
  kids: OnboardingKid[];
  editName: string;
  setEditName: (v: string) => void;
  editAvatar: string;
  setEditAvatar: (v: string) => void;
  editBirthYear: number;
  setEditBirthYear: (v: number) => void;
  onboardBusy: boolean;
  onboardErr: string | null;
  onSubmit: () => void;
  onAddAnother: () => void;
  onFinish: () => void;
}) {
  const t = WIZARD_LANGS[wizLang];
  const canSubmit = editName.trim().length > 0 && !onboardBusy;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <section className="card onboarding-card" aria-label={t.title}>
      <div className="onboard-head">
        <h2>{t.title}</h2>
        <button
          type="button"
          className="onboard-lang"
          onClick={() => onChangeLang(wizLang === "en" ? "bn" : "en")}
          title="EN / বাংলা"
        >
          {t.lang}
        </button>
      </div>
      <p className="onboard-step">{kids.length === 0 ? t.step0 : t.stepN}</p>

      <form onSubmit={handleSubmit}>
        <div className="avatar-row" role="group" aria-label={t.nameLabel}>
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a}
              className={`avatar-pick${editAvatar === a ? " on" : ""}`}
              onClick={() => setEditAvatar(a)}
              aria-label={avatarName(a, wizLang)}
              aria-pressed={editAvatar === a}
            >
              <span aria-hidden="true">{a}</span>
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label>
            {t.nameLabel}
            <input
              id="onboard-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={wizLang === "en" ? "e.g. Aria" : "যেমন: আরিয়া"}
              autoComplete="off"
            />
          </label>
          <label>
            {t.birthLabel}
            <input
              type="number"
              min={2010}
              max={2030}
              placeholder="2019"
              value={editBirthYear}
              onChange={(e) => {
                // #1539 — ignore out-of-range / empty input rather than
                // silently snapping it to a wrong default.
                if (e.target.value === "") return;
                const v = Number(e.target.value);
                if (v >= 2010 && v <= 2030) setEditBirthYear(v);
              }}
            />
            {/* #1540 — keep the WHY visible right at the field. */}
            {editBirthYear >= 2010 && editBirthYear <= 2030 && (
              <span className="hint">{t.birthHint}</span>
            )}
          </label>
        </div>
        <div className="row-buttons">
          <button type="submit" className="btn primary" disabled={!canSubmit}>
            {onboardBusy ? t.adding : t.add}
          </button>
        </div>
      </form>

      {onboardErr && <p className="err inline">{onboardErr}</p>}

      {kids.length >= 1 && (
        <div className="onboard-added">
          <div className="onboard-chips">
            {kids.map((k) => (
              <span className="onboard-chip" key={k.id}>
                {k.avatar ?? "🧒"} {k.name}
              </span>
            ))}
          </div>
          <p className="onboard-ok">{t.addedAll}</p>
        </div>
      )}

      <div className="onboard-actions">
        <button
          type="button"
          className="btn ghost"
          disabled={onboardBusy}
          onClick={onAddAnother}
        >
          {t.addAnother}
        </button>
        <button type="button" className="btn primary" disabled={onboardBusy} onClick={onFinish}>
          {kids.length === 0 ? t.notNow : t.finish}
        </button>
      </div>
    </section>
  );
}
