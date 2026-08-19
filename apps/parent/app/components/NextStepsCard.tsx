"use client";

import { NEXT_STEPS_LANGS, type WizardLang } from "../lib/portal";

/**
 * #3023 — post-onboarding "what's next" checklist. Rendered above the report
 * sections for a brand-new account (no kid activity yet) so the parent isn't
 * dropped onto ~26 empty cards. The hide decision is purely presentational and
 * collapsible — dismissed state lives in this component and is surfaced through
 * `onDismiss` so the parent page can persist it (localStorage) across reloads.
 */
export default function NextStepsCard({
  wizLang,
  onDismiss,
}: {
  wizLang: WizardLang;
  onDismiss: () => void;
}) {
  const t = NEXT_STEPS_LANGS[wizLang];
  return (
    <section className="card next-steps" aria-label={t.title}>
      <div className="onboard-head">
        <h2>{t.title}</h2>
        <button type="button" className="btn ghost" onClick={onDismiss}>
          {t.dismiss}
        </button>
      </div>
      <p className="muted">{t.intro}</p>
      <ol className="help-steps">
        <li>{t.step1}</li>
        <li>{t.step2}</li>
        <li>{t.step3}</li>
      </ol>
    </section>
  );
}
