/* Avatar components — KidAvatar (mix-and-match buddy), AvatarBuilder (Customize
 * screen), QuietChrome (#248 quiet-hours dim). Extracted from App.tsx (#589). */
import { useState } from "react";
import { AvatarIcon, Icon, AVATAR_EMOJI, AVATAR_KEYS } from "./Icon";
import { kidParts, AVATAR_PART_OPTIONS, AVATAR_PART_LABELS, type AvatarParts, type Kid } from "../lib/journey";
import type { Lang, Strings } from "../i18n";
/** Render a kid's buddy — the full mix-and-match look when set, else the base sticker. */
export function KidAvatar({ kid, size, className }: { kid: Kid; size: number; className?: string }) {
  const parts = kidParts(kid);
  if (!parts) return <AvatarIcon emoji={kid.avatar} size={size} className={className} />;
  return (
    <span className={`avatar-parts ${className ?? ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <AvatarIcon emoji={parts.base} size={size} className="ap-base" />
      {parts.hat !== "none" && (
        <span className="ap-hat" style={{ fontSize: Math.round(size * 0.44), lineHeight: 1 }}>{parts.hat}</span>
      )}
      {parts.glasses !== "none" && (
        <span className="ap-glasses" style={{ fontSize: Math.round(size * 0.34), lineHeight: 1 }}>{parts.glasses}</span>
      )}
      {parts.outfit !== "none" && (
        <span className="ap-outfit" style={{ fontSize: Math.round(size * 0.3), lineHeight: 1 }}>{parts.outfit}</span>
      )}
    </span>
  );
}

/** #285 — the Customize screen itself (module-level component so its useState
 *  is a proper hook — the App only mounts it when the avatar screen opens). */
export function AvatarBuilder({ kid, t, lang, onSave, onBack, onNova }: {
  kid: Kid;
  t: Strings;
  lang: Lang;
  onSave: (parts: AvatarParts) => void;
  onBack: () => void;
  onNova: () => void;
}) {
  const startParts = kidParts(kid) ?? { base: kid.avatar, hat: "none", glasses: "none", outfit: "none" };
  const [draft, setDraft] = useState<AvatarParts>(startParts);
  const pick = (cat: "hat" | "glasses" | "outfit", val: string) => setDraft((d) => ({ ...d, [cat]: val }));
  const setBase = (base: string) => setDraft((d) => ({ ...d, base }));
  return (
    <div className="app">
      <main className="screen avatar-screen">
        <header className="screen-head">
          <button className="icon-btn" onClick={onBack} aria-label={t.back}>‹</button>
          <div className="head-title">
            <h2>{t.avatarTitle}</h2>
            <p className="head-sub">{t.avatarSub}</p>
          </div>
          <button className="icon-btn nova-hud-btn" onClick={onNova} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
        </header>

        <div className="avatar-preview" role="status" aria-label={t.avatarPreview}>
          <KidAvatar kid={{ ...kid, avatarParts: draft }} size={120} />
        </div>

        <section className="avatar-part" role="group" aria-label={t.avatarFace}>
          <span className="avatar-part-label">{t.avatarFace}</span>
          <div className="avatar-part-row">
            {AVATAR_KEYS.map((a) => (
              <button
                key={a}
                className={`avatar-btn${a === draft.base ? " selected" : ""}`}
                onClick={() => setBase(a)}
                aria-label={`${t.avatarFace}: ${a}`}
              >
                <AvatarIcon emoji={AVATAR_EMOJI[a]} size={34} />
              </button>
            ))}
          </div>
        </section>

        {(["hat", "glasses", "outfit"] as const).map((cat) => (
          <section key={cat} className="avatar-part" role="group" aria-label={AVATAR_PART_LABELS[cat]}>
            <span className="avatar-part-label">{AVATAR_PART_LABELS[cat]} {t.avatarPartsLabels[cat]}</span>
            <div className="avatar-part-row">
              {AVATAR_PART_OPTIONS[cat].map((opt) => (
                <button
                  key={opt}
                  className={`avatar-btn${draft[cat] === opt ? " selected" : ""}`}
                  onClick={() => pick(cat, opt)}
                  aria-label={opt === "none" ? t.avatarNone : opt}
                >
                  {opt === "none" ? t.avatarNone : opt}
                </button>
              ))}
            </div>
          </section>
        ))}

        <button
          className="big-btn avatar-save"
          onClick={() => onSave(draft)}
        >
          {t.avatarSave}
        </button>
      </main>
    </div>
  );
}

/* #248 — quiet-hours chrome: a gentle full-screen dim + the 🌙 moon badge.
 * Rendered inside the main kid screens. Play is NEVER blocked — the badge tap
 * restores full sound for the rest of the session (parent override stays in the
 * portal; this is a kindness, not a bypass). */
export function QuietChrome({ active, dim, overridden, onToggle, label, labelOn }: {
  active: boolean;
  dim: boolean;
  overridden: boolean;
  onToggle: () => void;
  label: string;
  labelOn: string;
}) {
  if (!active) return null;
  return (
    <>
      {dim && <div className="quiet-dim" aria-hidden />}
      <button
        className="quiet-badge"
        onClick={onToggle}
        aria-pressed={overridden}
        aria-label={overridden ? labelOn : label}
        title={overridden ? labelOn : label}
      >
        {overridden ? "🔊" : "🌙"}
        <span>{overridden ? labelOn : label}</span>
      </button>
    </>
  );
}
