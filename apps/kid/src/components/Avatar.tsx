/* Avatar components — KidAvatar (mix-and-match buddy), AvatarBuilder (Customize
 * screen), QuietChrome (#248 quiet-hours dim). Extracted from App.tsx (#589). */
import { useState } from "react";
import { AvatarIcon, Icon, AVATAR_EMOJI, AVATAR_KEYS } from "./Icon";
import { kidParts, AVATAR_PART_OPTIONS, AVATAR_PART_LABELS, type AvatarParts, type Kid } from "../lib/journey";
import type { Lang, Strings } from "../i18n";
import { speak } from "../game/speech";
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
  const savedParts = kidParts(kid);
  const startParts: AvatarParts = savedParts ?? {
    base: AVATAR_KEYS.find((k) => k === kid.avatar || AVATAR_EMOJI[k] === kid.avatar) ?? kid.avatar,
    hat: "none",
    glasses: "none",
    outfit: "none",
  };
  const [draft, setDraft] = useState<AvatarParts>(startParts);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [pendingExit, setPendingExit] = useState<null | { go: () => void }>(null);
  const [announce, setAnnounce] = useState("");

  const dirty =
    draft.base !== startParts.base ||
    draft.hat !== startParts.hat ||
    draft.glasses !== startParts.glasses ||
    draft.outfit !== startParts.outfit;

  const announcePick = (category: string, option: string) => {
    const line = t.avatarPicked(category, option);
    setAnnounce(line);
    speak(line, { lang });
  };
  const partName = (opt: string) => (opt === "none" ? t.avatarNone : (t.avatarPartNames[opt] ?? opt));
  const pick = (cat: "hat" | "glasses" | "outfit", val: string) => {
    setDraft((d) => ({ ...d, [cat]: val }));
    announcePick(t.avatarPartsLabels[cat], partName(val));
  };
  const setBase = (base: string) => {
    setDraft((d) => ({ ...d, base }));
    announcePick(t.avatarFace, t.avatarFaceNames[base] ?? base);
  };
  const confirmLeave = (go: () => void) => () => {
    if (dirty) {
      setPendingExit({ go });
      setUnsavedOpen(true);
    } else {
      go();
    }
  };
  return (
    <div className="app">
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
      <main className="screen avatar-screen">
        <header className="screen-head">
          <button className="icon-btn" onClick={confirmLeave(onBack)} aria-label={t.back}>‹</button>
          <div className="head-title">
            <h2>{t.avatarTitle}</h2>
            <p className="head-sub">{t.avatarSub}</p>
          </div>
          <button className="icon-btn nova-hud-btn" onClick={confirmLeave(onNova)} aria-label={t.novaMeet}><Icon name="nova" size={24} /></button>
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
                aria-pressed={a === draft.base}
                aria-label={`${t.avatarFace}: ${t.avatarFaceNames[a] ?? a}`}
              >
                <span aria-hidden="true"><AvatarIcon emoji={AVATAR_EMOJI[a]} size={34} /></span>
              </button>
            ))}
          </div>
        </section>

        {(["hat", "glasses", "outfit"] as const).map((cat) => (
          <section key={cat} className="avatar-part" role="group" aria-label={t.avatarPartsLabels[cat]}>
            <span className="avatar-part-label">{AVATAR_PART_LABELS[cat]} {t.avatarPartsLabels[cat]}</span>
            <div className="avatar-part-row">
              {AVATAR_PART_OPTIONS[cat].map((opt) => (
                <button
                  key={opt}
                  className={`avatar-btn${draft[cat] === opt ? " selected" : ""}`}
                  onClick={() => pick(cat, opt)}
                  aria-pressed={draft[cat] === opt}
                  aria-label={`${t.avatarPartsLabels[cat]}: ${partName(opt)}`}
                >
                  <span aria-hidden="true">{opt === "none" ? t.avatarNone : opt}</span>
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

      {unsavedOpen && (
        <div className="avatar-confirm-overlay" onClick={() => { setPendingExit(null); setUnsavedOpen(false); }}>
          <div
            className="avatar-confirm-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t.avatarUnsavedTitle}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="avatar-confirm-emoji" aria-hidden="true">🎨</span>
            <h3 className="avatar-confirm-title">{t.avatarUnsavedTitle}</h3>
            <p className="avatar-confirm-body">{t.avatarUnsavedBody}</p>
            <div className="avatar-confirm-actions">
              <button className="big-btn" onClick={() => { setPendingExit(null); setUnsavedOpen(false); }}>
                {t.avatarUnsavedKeep}
              </button>
              <button className="ghost-btn" onClick={() => { setUnsavedOpen(false); pendingExit?.go(); }}>
                {t.avatarUnsavedDiscard}
              </button>
            </div>
          </div>
        </div>
      )}
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
