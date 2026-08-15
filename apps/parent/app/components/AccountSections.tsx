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
  NV_DIAG_MAX,
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
  handleCreate: () => void;
  setEditName: Setter<string>;
  setEditAvatar: Setter<string>;
  setEditBirthYear: Setter<number>;
  setShowAdd: Setter<boolean>;
}) {
  if (!showAdd) return null;
  return (
        <section className="card add-kid" id="add-kid">
<h2>Add a new kid</h2>
<div className="avatar-row">
  {AVATARS.map((a) => (
    <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)}>
      {a}
    </button>
  ))}
</div>
<div className="form-grid">
  <label>
    Name
    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Aria" />
  </label>
  <label>
    Birth year
    <input
      type="number"
      min={2010}
      max={2030}
      value={editBirthYear}
      onChange={(e) => setEditBirthYear(Number(e.target.value) || 2021)}
    />
  </label>
</div>
<div className="row-buttons">
  <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleCreate}>
    {busy ? "Adding…" : "Add kid"}
  </button>
  <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
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
  wizLang: WizardLang;
}) {
  // #1545 — two-tap inline confirm for each session revoke (never window.confirm:
  // headless tests can't click through it). Armed = session id awaiting confirm.
  const [revokeArmed, setRevokeArmed] = useState<string | null>(null);
  const t = ACCOUNT_LANGS[wizLang];
  const pwTooLong = pwNew.length > 72;

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
                {s.current ? "This device" : friendlyDevice(s.user_agent)}
                {s.current && <span className="session-current-badge">current</span>}
              </span>
              <span className="muted small">
                {s.user_agent ? friendlyDevice(s.user_agent) : "Unknown device"}
                {s.ip ? ` · ${s.ip}` : ""} · signed in {fmtTime(s.created_at)}
                {!s.current &&
                  (s.last_seen_at
                    ? ` · last seen ${fmtTime(s.last_seen_at)}`
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
  confirmReset: boolean;
  setConfirmReset: Setter<boolean>;
  confirmDelete: boolean;
  setConfirmDelete: Setter<boolean>;
  handleRename: () => void;
  handleReset: () => void;
  handleDelete: () => void;
}) {
  return (
<section className="card danger" id="edit-kid">
  <h2>⚙️ Edit {active.name}</h2>
  <div className="avatar-row">
    {AVATARS.map((a) => (
      <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)}>
        {a}
      </button>
    ))}
  </div>
  <div className="form-grid">
    <label>
      Name
      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={active.name} />
    </label>
    <label>
      Birth year
      <input
        type="number"
        min={2010}
        max={2030}
        value={editBirthYear}
        onChange={(e) => setEditBirthYear(Number(e.target.value) || 2021)}
      />
    </label>
  </div>
  <div className="row-buttons">
    <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleRename}>
      {busy ? "Saving…" : "Save changes"}
    </button>
  </div>

  <hr />
  <div className="danger-row">
    <div>
      <h3>Reset progress</h3>
      <p className="muted small">Wipes all of {active.name}’s mastery and history. The profile stays.</p>
    </div>
    {confirmReset ? (
      <div className="confirm-group">
        <button className="btn danger" disabled={busy} onClick={handleReset}>Yes, reset everything</button>
        <button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
      </div>
    ) : (
      <button className="btn danger-ghost" onClick={() => { setConfirmReset(true); setConfirmDelete(false); }}>Reset progress…</button>
    )}
  </div>

  <div className="danger-row">
    <div>
      <h3>Delete {active.name}</h3>
      <p className="muted small">Permanently removes this profile and all history. This cannot be undone.</p>
    </div>
    {confirmDelete ? (
      <div className="confirm-group">
        <button className="btn danger" disabled={busy} onClick={handleDelete}>Yes, delete</button>
        <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
      </div>
    ) : (
      <button className="btn danger-ghost" onClick={() => { setConfirmDelete(true); setConfirmReset(false); }}>Delete…</button>
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
  <button className="diag-toggle" onClick={() => setDebugOpen((o) => !o)} aria-expanded={debugOpen}>
    {DEBUG_LANGS[wizLang].toggle}
    <span className="diag-caret">{debugOpen ? "▾" : "▸"}</span>
  </button>
  {debugOpen && (
    <div className="diag-body">
      <p className="muted small">{DEBUG_LANGS[wizLang].hint}</p>
      <dl className="diag-grid">
        <div>
          <dt>{DEBUG_LANGS[wizLang].lastSync}</dt>
          <dd>
            {lastSync
              ? new Date(lastSync).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
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
  <button className="help-toggle" onClick={() => setHelpOpen((o) => !o)} aria-expanded={helpOpen}>
    {HELP_LANGS[wizLang].toggle}
    <span className="help-caret">{helpOpen ? "▾" : "▸"}</span>
  </button>
  {helpOpen && (
    <div className="help-body">
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
    </div>
  )}
</section>
  );
}