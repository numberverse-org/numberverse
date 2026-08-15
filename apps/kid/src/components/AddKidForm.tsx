import { useState } from "react";
import { Icon, AVATAR_EMOJI, AVATAR_KEYS } from "./Icon";
import type { Lang, Strings } from "../i18n";

export default function AddKidForm({ t, lang, onSave, onCancel }: { t: Strings; lang: Lang; onSave: (name: string, avatar: string, birthYear: number, birthMonth?: number, birthDay?: number) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATAR_KEYS[0]);
  // Full birthday (month + day) — feeds the yearly birthday party. Defaults to
  // today so a parent can just press "+" a few times or leave it as-is.
  const today = new Date();
  const thisYear = today.getFullYear();
  // #1416 — the birth-year bounds must stay relative to TODAY, not a pair of
  // hard-coded years that silently goes stale every January.
  const MIN_BIRTH_YEAR = thisYear - 10;
  const MAX_BIRTH_YEAR = thisYear;
  const [birthYear, setBirthYear] = useState(thisYear - 5);
  const [birthMonth, setBirthMonth] = useState(today.getMonth() + 1);
  const [birthDay, setBirthDay] = useState(today.getDate());
  const maxDay = new Date(thisYear, birthMonth, 0).getDate();
  const canSave = name.trim().length > 0;
  const doSave = () => onSave(name.trim(), AVATAR_EMOJI[avatar] ?? avatar, birthYear, birthMonth, birthDay);

  return (
    <div className="app">
      <main className="screen worlds">
        <header className="screen-head">
          <button className="icon-btn" onClick={onCancel} aria-label={t.backTo(t.whoPlaying)}>‹</button>
          <div className="head-title">
            <h2>{t.addKid}</h2>
            <p className="head-sub">{t.addKidSub}</p>
          </div>
        </header>

        <div className="form-card">
          <label className="form-label">{t.pickBuddy}</label>
          <div className="avatar-row">
            {AVATAR_KEYS.map((a) => (
              <button
                key={a}
                className={`avatar-btn${a === avatar ? " selected" : ""}`}
                onClick={() => setAvatar(a)}
                aria-pressed={a === avatar}
                aria-label={`${t.pickBuddy}: ${t.avatarFaceNames[a] ?? a}`}
              >
                <span aria-hidden="true"><Icon name={a} size={34} /></span>
              </button>
            ))}
          </div>

          <label className="form-label" htmlFor="kid-name">{t.kidsName}</label>
          <input
            id="kid-name"
            className="input-field"
            type="text"
            value={name}
            maxLength={20}
            placeholder={t.namePlaceholder}
            autoFocus
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) doSave();
            }}
          />

          <label className="form-label">{t.birthYear}</label>
          <div className="year-row">
            <button className="year-btn" onClick={() => setBirthYear((y) => Math.max(MIN_BIRTH_YEAR, y - 1))} aria-label="year down">−</button>
            <div className="year-val">
              <span className="year-num">{birthYear}</span>
              <span className="year-age">{t.ageAt(Math.max(0, thisYear - birthYear))}</span>
            </div>
            <button className="year-btn" onClick={() => setBirthYear((y) => Math.min(MAX_BIRTH_YEAR, y + 1))} aria-label="year up">+</button>
          </div>

          {/* full birthday (month + day) — Nova celebrates every year */}
          <label className="form-label">🎂 {lang === "bn" ? "জন্মদিন" : "Birthday"}</label>
          <div className="bday-row">
            <div className="bday-field">
              <span className="bday-label">{t.birthMonth}</span>
              <div className="year-row">
                <button className="year-btn" onClick={() => setBirthMonth((m) => (m <= 1 ? 12 : m - 1))} aria-label="month down">−</button>
                <div className="year-val"><span className="year-num">{birthMonth}</span></div>
                <button className="year-btn" onClick={() => setBirthMonth((m) => (m >= 12 ? 1 : m + 1))} aria-label="month up">+</button>
              </div>
            </div>
            <div className="bday-field">
              <span className="bday-label">{t.birthDay}</span>
              <div className="year-row">
                <button className="year-btn" onClick={() => setBirthDay((d) => Math.max(1, d - 1))} aria-label="day down">−</button>
                <div className="year-val"><span className="year-num">{birthDay}</span></div>
                <button className="year-btn" onClick={() => setBirthDay((d) => Math.min(maxDay, d + 1))} aria-label="day up">+</button>
              </div>
            </div>
          </div>

          <button className="big-btn" disabled={!canSave} onClick={doSave}>
            {t.saveKid(name.trim() || (lang === "bn" ? "বাচ্চা" : "kid"))}
          </button>
        </div>
      </main>
    </div>
  );
}
