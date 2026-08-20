/* ─── AccountSections — add/edit kid, account, diagnostics, help (#620) ───
   i18n seam: DEBUG_LANGS / HELP_LANGS keyed by `wizLang`; add a locale key to
   those maps in lib/portal and these cards follow. */
"use client";

import { useState } from "react";
import type { Profile, SessionRow } from "../../lib/api";
import {
  ACCOUNT_LANGS,
  AVATARS,
  DEBUG_LANGS,
  HELP_LANGS,
  KID_FORM_LANGS,
  NV_DIAG_MAX,
  avatarName,
  fmtTime,
  friendlyDevice,
  nvDiagErrors,
  type WizardLang,
} from "../lib/portal";

interface ActiveKid {
  name: string;
}

type Setter<T> = (v: T) => void;
type Updater = (fn: (o: boolean) => boolean) => void;



export function AddKidCard({
  showAdd,
  busy,
  editName,
  editAvatar,
  editBirthYear,
  wizLang,
  handleCreate,
  setEditName,
  setEditAvatar,
  setEditBirthYear,
  setShowAdd,
}: {
  showAdd: boolean;
  busy: boolean;
  editName: string;
  editAvatar: string;
  editBirthYear: number;
  wizLang: WizardLang;
  handleCreate: () => void;
  setEditName: Setter<string>;
  setEditAvatar: Setter<string>;
  setEditBirthYear: Setter<number>;
  setShowAdd: Setter<boolean>;
}) {
  // #1511 — inline range hint for the birth-year field (no magic default).
  const [birthHint, setBirthHint] = useState<string | null>(null);
  // #3055 — track when the field was cleared so it visually mirrors the truth
  // (the committed year) instead of showing a blank that submits a stale value.
  const [draftBlank, setDraftBlank] = useState(false);
  const t = KID_FORM_LANGS[wizLang];
  if (!showAdd) return null;
  return (
        <section className="card add-kid" id="add-kid">
<h2>{t.addTitle}</h2>
<div className="avatar-row" role="group" aria-label={t.nameLabel}>
  {AVATARS.map((a) => (
    <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)} aria-label={avatarName(a, wizLang)} aria-pressed={editAvatar === a}>
      <span aria-hidden="true">{a}</span>
    </button>
  ))}
</div>
<div className="form-grid">
  <label>
    {t.nameLabel}
    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t.namePlaceholder} />
  </label>
  <label>
    {t.birthLabel}
    {/* #1608 — spinbutton semantics + direct keyboard entry (native number
        input: arrow up/down steps, typed values validated below). */}
    <input
      type="number"
      inputMode="numeric"
      min={2010}
      max={2030}
      value={draftBlank ? "" : editBirthYear}
      aria-label={t.birthLabel}
      role="spinbutton"
      aria-valuemin={2010}
      aria-valuemax={2030}
      aria-valuenow={editBirthYear}
      onChange={(e) => {
        // #1511 — keep the last valid value; empty/non-numeric input never
        // snaps to a magic default, and out-of-range shows an inline hint.
        const raw = e.target.value;
        if (raw === "") {
          // #3055 — a cleared field must not silently submit the previous year.
          // State keeps the committed value; the hint says so, and the field
          // shows blank until it loses focus, then re-renders the real year.
          setDraftBlank(true);
          setBirthHint(t.birthClearHint.replace("{year}", String(editBirthYear)));
          return;
        }
        setDraftBlank(false);
        const v = Number(raw);
        if (!Number.isFinite(v)) return;
        if (v < 2010 || v > 2030) {
          const bn = wizLang === "bn";
          setBirthHint(bn ? ACCOUNT_LANGS.bn.birthRangeErr : ACCOUNT_LANGS.en.birthRangeErr);
          return;
        }
        setBirthHint(null);
        setEditBirthYear(v);
      }}
      onBlur={() => setDraftBlank(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" && editBirthYear < 2030) setEditBirthYear(editBirthYear + 1);
        if (e.key === "ArrowDown" && editBirthYear > 2010) setEditBirthYear(editBirthYear - 1);
      }}
    />
    {birthHint && <span className="err inline">{birthHint}</span>}
  </label>
</div>
<div className="row-buttons">
  <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleCreate}>
    {busy ? t.adding : t.addKid}
  </button>
  <button className="btn ghost" onClick={() => setShowAdd(false)}>{t.cancel}</button>
</div>
        </section>
  );
}

export function AccountCard({
  profile,
  displayName,
  setDisplayName,
  pwCurrent,
  setPwCurrent,
  pwNew,
  setPwNew,
  pwConfirm,
  setPwConfirm,
  handleSaveName,
  handleChangePw,
  handleSignoutAll,
  sessions,
  handleRevoke,
  acctBusy,
  acctMsg,
  onSetPassword,
  sessionsLoading,
  onDeleteAccount,
  wizLang,
}: {
  profile: Profile | null;
  displayName: string;
  setDisplayName: Setter<string>;
  pwCurrent: string;
  setPwCurrent: Setter<string>;
  pwNew: string;
  setPwNew: Setter<string>;
  pwConfirm: string;
  setPwConfirm: Setter<string>;
  handleSaveName: () => void;
  handleChangePw: () => void;
  handleSignoutAll: () => void;
  sessions: SessionRow[];
  handleRevoke: (sessionId: string, isCurrent: boolean) => void;
  acctBusy: boolean;
  acctMsg: { kind: "ok" | "err"; text: string } | null;
  /** #1487 — Google accounts call this with the new password only. */
  onSetPassword?: (pw: string) => void;
  /** #1548 — lets the card show a true loading state before sessions arrive. */
  sessionsLoading: boolean;
  /** #980/#1679 — right-to-erasure: confirm the phrase + re-enter the password
   *  (Google accounts may leave the password empty — the API re-verifies a
   *  fresh Google credential instead). */
  onDeleteAccount: (confirmation: string, password: string) => void;
  wizLang: WizardLang;
}) {
  // #1545 — two-tap inline confirm for each session revoke (never window.confirm:
  // headless tests can't click through it). Armed = session id awaiting confirm.
  const [revokeArmed, setRevokeArmed] = useState<string | null>(null);
  // #980/#1679 — delete-account card local state: armed → phrase + password.
  const [delArmed, setDelArmed] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [delPassword, setDelPassword] = useState("");
  const t = ACCOUNT_LANGS[wizLang];
  const pwTooLong = pwNew.length > 72;
  // The server verifies the literal EN phrase in BOTH locales, so the parent
  // must type exactly that (deleteAccountConfirmPh is the same string in bn).
  const deletePhraseOk = delConfirm.trim().toLowerCase() === t.deleteAccountConfirmPh.toLowerCase();
  const deletePwOk = profile?.auth_provider === "google" || delPassword.length > 0;

  const newPasswordFields = (
    <>
      <label>
        {t.newPw}
        <input
          type="password"
          value={pwNew}
          maxLength={72}
          onChange={(e) => setPwNew(e.target.value)}
          autoComplete="new-password"
          placeholder={t.newPwPlaceholder}
        />
        {pwTooLong && <span className="err inline">{t.maxLenHint}</span>}
      </label>
      <label>
        {t.confirmNewPw}
        <input
          type="password"
          value={pwConfirm}
          maxLength={72}
          onChange={(e) => setPwConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </label>
    </>
  );

  return (
<section className="card account" id="account">
  <h2>🔐 Account & security</h2>
  {acctMsg && (
    <p className={acctMsg.kind === "ok" ? "ok-note" : "err"}>{acctMsg.text}</p>
  )}

  <div className="ctrl-block">
    <h3>Display name</h3>
    <p className="muted small">Shown in the portal and on the kid app's sign-in screen.</p>
    <div className="form-grid">
      <label>
        Name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={profile?.display_name ?? "Parent"}
        />
      </label>
    </div>
    <div className="row-buttons">
      <button className="btn primary" disabled={acctBusy || !displayName.trim()} onClick={handleSaveName}>
        {acctBusy ? "Saving…" : "Save name"}
      </button>
    </div>
  </div>

  {profile?.auth_provider === "google" ? (
    // #1487 — a Google-created account has no known current password, so offer
    // a set-password flow instead of a change-password form that can't succeed.
    <div className="ctrl-block">
      <h3>{t.setPwTitle}</h3>
      <p className="muted small">{t.googleSetHint}</p>
      <div className="form-grid">{newPasswordFields}</div>
      <div className="row-buttons">
        <button
          className="btn primary"
          disabled={acctBusy || pwNew.length < 8 || pwNew.length > 72 || pwNew !== pwConfirm}
          onClick={() => onSetPassword?.(pwNew)}
        >
          {acctBusy ? t.saving : t.setPwButton}
        </button>
      </div>
    </div>
  ) : (
    <div className="ctrl-block">
      <h3>{t.changePwTitle}</h3>
      <p className="muted small">{t.changePwHint}</p>
      <div className="form-grid">
        <label>
          {t.currentPw}
          <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        {newPasswordFields}
      </div>
      <div className="row-buttons">
        <button
          className="btn primary"
          disabled={acctBusy || !pwCurrent || pwNew.length < 8 || pwNew.length > 72 || pwNew !== pwConfirm}
          onClick={handleChangePw}
        >
          {acctBusy ? t.saving : t.changePwButton}
        </button>
      </div>
    </div>
  )}

  <div className="ctrl-block">
    <h3>{t.activeLoginsTitle}</h3>
    <p className="muted small">{t.activeLoginsHint}</p>
    {sessionsLoading ? (
      <p className="muted">{t.loading}</p>
    ) : sessions.length === 0 ? (
      <p className="muted">{t.empty}</p>
    ) : (
      <ul className="session-list">
        {sessions.map((s) => (
          <li key={s.id} className="session-row">
            <span className="session-icon">{s.current ? "🖥️" : "📱"}</span>
            <span className="session-meta">
              <span className="session-device">
                {s.current ? t.thisDevice : friendlyDevice(s.user_agent)}
                {s.current && <span className="session-current-badge">{t.currentSession}</span>}
              </span>
              <span className="muted small">
                {s.user_agent ? friendlyDevice(s.user_agent) : t.unknownDevice}
                {s.ip ? ` · ${s.ip}` : ""} · {t.signedIn} {fmtTime(s.created_at, wizLang)}
                {!s.current &&
                  (s.last_seen_at
                    ? ` · ${t.lastSeen} ${fmtTime(s.last_seen_at, wizLang)}`
                    : ` · ${t.noRecentActivity}`)}
              </span>
            </span>
            {revokeArmed === s.id ? (
              <span className="confirm-group">
                <button
                  className="btn btn-small danger"
                  disabled={acctBusy}
                  onClick={() => {
                    setRevokeArmed(null);
                    handleRevoke(s.id, s.current);
                  }}
                >
                  {t.confirmRevoke.replace("{device}", friendlyDevice(s.user_agent))}
                </button>
                <button className="btn btn-small ghost" onClick={() => setRevokeArmed(null)}>
                  {t.cancel}
                </button>
              </span>
            ) : (
              <button
                className="btn btn-small danger-ghost"
                disabled={acctBusy}
                onClick={() => setRevokeArmed(s.id)}
              >
                {s.current ? t.signOutHere : t.signOut}
              </button>
            )}
          </li>
        ))}
      </ul>
    )}
    <div className="row-buttons mt-14">
      <button
        className="btn danger-ghost"
        disabled={acctBusy || sessionsLoading || sessions.length === 0}
        onClick={handleSignoutAll}
      >
        {t.signOutAll}
      </button>
    </div>
  </div>

  {/* #980/#1679 — right-to-erasure: delete the WHOLE account. Two-tap inline
      confirm (never window.confirm) + phrase + password re-entry. */}
  <hr />
  <div className="danger-row delete-account-row">
    <div>
      <h3>{t.deleteAccount}</h3>
      <p className="muted small">{t.deleteAccountSub}</p>
    </div>
    {delArmed ? (
      <div className="delete-account-form">
        <div className="form-grid">
          <label>
            {t.deleteAccountPasswordLabel}
            <input
              type="password"
              value={delPassword}
              onChange={(e) => setDelPassword(e.target.value)}
              autoComplete="current-password"
              disabled={acctBusy}
            />
          </label>
          <label>
            {t.deleteAccountConfirm}
            <input
              value={delConfirm}
              onChange={(e) => setDelConfirm(e.target.value)}
              placeholder={t.deleteAccountConfirmPh}
              disabled={acctBusy}
            />
          </label>
        </div>
        <div className="row-buttons">
          <button
            className="btn danger"
            disabled={acctBusy || !deletePhraseOk || !deletePwOk}
            onClick={() => onDeleteAccount(delConfirm, delPassword)}
          >
            {acctBusy ? t.saving : t.deleteAccountCta}
          </button>
          <button
            className="btn ghost"
            disabled={acctBusy}
            onClick={() => {
              setDelArmed(false);
              setDelConfirm("");
              setDelPassword("");
            }}
          >
            {t.cancel}
          </button>
        </div>
      </div>
    ) : (
      <button
        className="btn danger-ghost"
        disabled={acctBusy}
        onClick={() => setDelArmed(true)}
      >
        {t.deleteAccountCta}
      </button>
    )}
  </div>
</section>
  );
}

export function EditKidCard({
  active,
  busy,
  editName,
  setEditName,
  editAvatar,
  setEditAvatar,
  editBirthYear,
  setEditBirthYear,
  wizLang,
  confirmReset,
  setConfirmReset,
  confirmDelete,
  setConfirmDelete,
  handleRename,
  handleReset,
  handleDelete,
}: {
  active: ActiveKid;
  busy: boolean;
  editName: string;
  setEditName: Setter<string>;
  editAvatar: string;
  setEditAvatar: Setter<string>;
  editBirthYear: number;
  setEditBirthYear: Setter<number>;
  wizLang: WizardLang;
  confirmReset: boolean;
  setConfirmReset: Setter<boolean>;
  confirmDelete: boolean;
  setConfirmDelete: Setter<boolean>;
  handleRename: () => void;
  handleReset: () => void;
  handleDelete: () => void;
}) {
  // #1511 — inline range hint for the birth-year field (no magic default).
  const [birthHint, setBirthHint] = useState<string | null>(null);
  // #3055 — see AddKidCard; keep the field honest when cleared.
  const [draftBlank, setDraftBlank] = useState(false);
  const t = KID_FORM_LANGS[wizLang];
  return (
<section className="card danger" id="edit-kid">
  {/* #1589 — labelled "Edit {name}" so it never reads as a blank "add kid". */}
  <h2>⚙️ {t.editTitle.replace("{name}", active.name)}</h2>
  <div className="avatar-row" role="group" aria-label={t.nameLabel}>
    {AVATARS.map((a) => (
      <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)} aria-label={avatarName(a, wizLang)} aria-pressed={editAvatar === a}>
        <span aria-hidden="true">{a}</span>
      </button>
    ))}
  </div>
  <div className="form-grid">
    <label>
      {t.nameLabel}
      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={active.name} />
    </label>
    <label>
      {t.birthLabel}
      {/* #1608 — spinbutton semantics + direct keyboard entry. */}
      <input
        type="number"
        inputMode="numeric"
        min={2010}
        max={2030}
        value={draftBlank ? "" : editBirthYear}
        aria-label={t.birthLabel}
        role="spinbutton"
        aria-valuemin={2010}
        aria-valuemax={2030}
        aria-valuenow={editBirthYear}
        onChange={(e) => {
          // #1511 — keep the last valid value; empty/non-numeric input never
          // snaps to a magic default, and out-of-range shows an inline hint.
          const raw = e.target.value;
          if (raw === "") {
            // #3055 — a cleared field must not silently submit the previous
            // year; surface a hint and re-render the real year on blur.
            setDraftBlank(true);
            setBirthHint(t.birthClearHint.replace("{year}", String(editBirthYear)));
            return;
          }
          setDraftBlank(false);
          const v = Number(raw);
          if (!Number.isFinite(v)) return;
          if (v < 2010 || v > 2030) {
            const bn = wizLang === "bn";
            setBirthHint(bn ? ACCOUNT_LANGS.bn.birthRangeErr : ACCOUNT_LANGS.en.birthRangeErr);
            return;
          }
          setBirthHint(null);
          setEditBirthYear(v);
        }}
        onBlur={() => setDraftBlank(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && editBirthYear < 2030) setEditBirthYear(editBirthYear + 1);
          if (e.key === "ArrowDown" && editBirthYear > 2010) setEditBirthYear(editBirthYear - 1);
        }}
      />
      {birthHint && <span className="err inline">{birthHint}</span>}
    </label>
  </div>
  <div className="row-buttons">
    <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleRename}>
      {busy ? t.saving : t.saveChanges}
    </button>
  </div>

  <hr />
  <div className="danger-row">
    <div>
      <h3>{t.resetTitle}</h3>
      <p className="muted small">{t.resetHint.replace("{name}", active.name)}</p>
    </div>
    {confirmReset ? (
      <div className="confirm-group">
        <button className="btn danger" disabled={busy} onClick={handleReset}>{t.confirmReset}</button>
        <button className="btn ghost" onClick={() => setConfirmReset(false)}>{t.cancel}</button>
      </div>
    ) : (
      <button className="btn danger-ghost" onClick={() => { setConfirmReset(true); setConfirmDelete(false); }}>{t.resetCta}</button>
    )}
  </div>

  <div className="danger-row">
    <div>
      <h3>{t.deleteTitle.replace("{name}", active.name)}</h3>
      <p className="muted small">{t.deleteHint}</p>
    </div>
    {confirmDelete ? (
      <div className="confirm-group">
        <button className="btn danger" disabled={busy} onClick={handleDelete}>{t.confirmDelete}</button>
        <button className="btn ghost" onClick={() => setConfirmDelete(false)}>{t.cancel}</button>
      </div>
    ) : (
      <button className="btn danger-ghost" onClick={() => { setConfirmDelete(true); setConfirmReset(false); }}>{t.deleteCta}</button>
    )}
  </div>
</section>
  );
}

export function DiagnosticsCard({
  debugOpen,
  setDebugOpen,
  wizLang,
  lastSync,
  swVersion,
  diagCopied,
  exportDiagnostics,
}: {
  debugOpen: boolean;
  setDebugOpen: Updater;
  wizLang: WizardLang;
  lastSync: number | null;
  swVersion: string | null;
  diagCopied: boolean;
  exportDiagnostics: () => void;
}) {
  return (
<section className="card diag-card">
  <button className="diag-toggle" onClick={() => setDebugOpen((o) => !o)} aria-expanded={debugOpen} aria-controls="diag-body">
    {DEBUG_LANGS[wizLang].toggle}
    <span className="diag-caret">{debugOpen ? "▾" : "▸"}</span>
  </button>
  {debugOpen && (
    <div className="diag-body" id="diag-body">
      <p className="muted small">{DEBUG_LANGS[wizLang].hint}</p>
      <dl className="diag-grid">
        <div>
          <dt>{DEBUG_LANGS[wizLang].lastSync}</dt>
          <dd>
            {lastSync
              ? fmtTime(new Date(lastSync).toISOString(), wizLang)
              : DEBUG_LANGS[wizLang].never}
          </dd>
        </div>
        <div>
          <dt>{DEBUG_LANGS[wizLang].online}</dt>
          <dd>
            <span className={`dot ${navigator.onLine ? "ok" : "off"}`} aria-hidden />
            {navigator.onLine ? DEBUG_LANGS[wizLang].online : DEBUG_LANGS[wizLang].offline}
          </dd>
        </div>
        <div>
          <dt>{DEBUG_LANGS[wizLang].serviceWorker}</dt>
          <dd>{swVersion ?? DEBUG_LANGS[wizLang].notInstalled}</dd>
        </div>
        <div>
          <dt>{DEBUG_LANGS[wizLang].voice}</dt>
          <dd>
            {typeof speechSynthesis !== "undefined" && speechSynthesis.getVoices().length > 0
              ? `${speechSynthesis.getVoices().length} ${DEBUG_LANGS[wizLang].voices}`
              : DEBUG_LANGS[wizLang].noVoice}
          </dd>
        </div>
      </dl>
      <h3 className="diag-err-head">{DEBUG_LANGS[wizLang].errors}</h3>
      {nvDiagErrors.length === 0 ? (
        <p className="muted small">{DEBUG_LANGS[wizLang].noErrors}</p>
      ) : (
        <ul className="diag-errors">
          {nvDiagErrors.slice(-NV_DIAG_MAX).reverse().map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <code>{e.at.slice(0, 16)}</code> {e.msg}
            </li>
          ))}
        </ul>
      )}
      <div className="row-buttons">
        <button className="btn ghost small" onClick={() => void exportDiagnostics()}>
          {diagCopied ? DEBUG_LANGS[wizLang].exported : DEBUG_LANGS[wizLang].export}
        </button>
      </div>
    </div>
  )}
</section>
  );
}

export function HelpCard({ helpOpen, setHelpOpen, wizLang }: {
  helpOpen: boolean;
  setHelpOpen: Updater;
  wizLang: WizardLang;
}) {
  return (
<section className="card help-card" id="help">
  <button className="help-toggle" onClick={() => setHelpOpen((o) => !o)} aria-expanded={helpOpen} aria-controls="help-body">
    {HELP_LANGS[wizLang].toggle}
    <span className="help-caret">{helpOpen ? "▾" : "▸"}</span>
  </button>
  {helpOpen && (
    <div className="help-body" id="help-body">
      <h3>{HELP_LANGS[wizLang].installTitle}</h3>
      <ol className="help-steps">
        {[1, 2, 3, 4, 5].map((i) => (
          <li key={i}>{HELP_LANGS[wizLang][`installStep${i}` as keyof typeof HELP_LANGS.en]}</li>
        ))}
      </ol>
      <h3>{HELP_LANGS[wizLang].voiceTitle}</h3>
      <ul className="help-list">
        <li>{HELP_LANGS[wizLang].voiceIos1}</li>
        <li>{HELP_LANGS[wizLang].voiceIos2}</li>
        <li>{HELP_LANGS[wizLang].voiceAnd1}</li>
        <li>{HELP_LANGS[wizLang].voiceAnd2}</li>
      </ul>
      <h3>{HELP_LANGS[wizLang].stampTitle}</h3>
      <ol className="help-steps">
        {[1, 2, 3, 4].map((i) => (
          <li key={i}>{HELP_LANGS[wizLang][`stampStep${i}` as keyof typeof HELP_LANGS.en]}</li>
        ))}
      </ol>
      {/* #1590 — how the kid's device joins (the kid app signs in with the
          parent account — no device code). */}
      <h3>{HELP_LANGS[wizLang].pairTitle}</h3>
      <ol className="help-steps">
        {[1, 2, 3, 4].map((i) => (
          <li key={i}>{HELP_LANGS[wizLang][`pairStep${i}` as keyof typeof HELP_LANGS.en]}</li>
        ))}
      </ol>
      <p className="hint">{HELP_LANGS[wizLang].pairNote}</p>
    </div>
  )}
</section>
  );
}