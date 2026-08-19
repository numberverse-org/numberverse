"use client";

import { a11yStorageKey, a11yToStorage } from "@numberverse/core";
import {
  A11Y_LANGS,
  NOTIF_LANGS,
  SYNC_LANGS,
  THEME_LANGS,
  TOPBAR_LANGS,
  relTime,
  toBnNum,
  type WizardLang,
} from "../lib/portal";
import type { Profile } from "../../lib/api";

/** #1588 — the dashboard topbar: brand, shared a11y toggles, portal/kid sync
 *  chips, the parent-gated notifications toggle, user + sign-out. Extracted
 *  from page.tsx so the dashboard file stays focused on data wiring. */
export default function PortalHeader({
  a11y,
  setA11y,
  theme,
  setTheme,
  online,
  lastSync,
  kidsCount,
  syncingNow,
  manualSync,
  deviceSync,
  notifSupported,
  notifState,
  notifBusy,
  notifAskPass,
  notifPassword,
  setNotifPassword,
  onToggleNotif,
  confirmEnableNotifications,
  cancelNotifAsk,
  notifMsg,
  dismissNotifMsg,
  profile,
  onSignOut,
  wizLang,
  onChangeLang,
}: {
  a11y: { bigText: boolean; highContrast: boolean };
  setA11y: (p: { bigText: boolean; highContrast: boolean }) => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  online: boolean;
  lastSync: number | null;
  kidsCount: number;
  syncingNow: boolean;
  manualSync: () => void;
  deviceSync: { lastSuccessAt: number | null; pendingCount: number; lastError: string | null } | null;
  notifSupported: boolean;
  notifState: "loading" | "on" | "off";
  notifBusy: boolean;
  notifAskPass: boolean;
  notifPassword: string;
  setNotifPassword: (v: string) => void;
  onToggleNotif: () => void;
  confirmEnableNotifications: () => void;
  cancelNotifAsk: () => void;
  notifMsg: { kind: "ok" | "err" | "muted"; text: string } | null;
  dismissNotifMsg: () => void;
  profile: Profile | null;
  onSignOut: () => void;
  wizLang: WizardLang;
  /** #3046 — switch the portal chrome + every section to EN/Bangla after onboarding. */
  onChangeLang: (next: WizardLang) => void;
}) {
  const top = TOPBAR_LANGS[wizLang];
  const S = SYNC_LANGS[wizLang];
  const N = NOTIF_LANGS[wizLang];
  const A = A11Y_LANGS[wizLang];
  const T = THEME_LANGS[wizLang];

  const toggleA11y = (patch: Partial<{ bigText: boolean; highContrast: boolean }>) => {
    const next = { ...a11y, ...patch };
    setA11y(next);
    try {
      localStorage.setItem(a11yStorageKey(), a11yToStorage(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <header className="topbar">
      <span className="brand">
        🔢 <b>Numberverse</b> <span className="muted">{top.parentPortal}</span>
      </span>
      {/* 🧏 #250 — global accessibility toggles (shared with the kid app). */}
      <span className="a11y-toggle-group" role="group" aria-label={A.bigText}>
        <button
          className={`a11y-toggle${a11y.bigText ? " on" : ""}`}
          onClick={() => toggleA11y({ bigText: !a11y.bigText })}
          aria-pressed={a11y.bigText}
          title={A.bigText}
          aria-label={A.bigText}
        >
          🔍 <span className="a11y-toggle-label">{A.bigText}</span>
        </button>
        <button
          className={`a11y-toggle${a11y.highContrast ? " on" : ""}`}
          onClick={() => toggleA11y({ highContrast: !a11y.highContrast })}
          aria-pressed={a11y.highContrast}
          title={A.highContrast}
          aria-label={A.highContrast}
        >
          🎨 <span className="a11y-toggle-label">{A.highContrast}</span>
        </button>
        {/* 🎨 #254 — dashboard light/dark theme toggle (portal-only, persisted). */}
        <button
          className={`a11y-toggle${theme === "light" ? " on" : ""}`}
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          aria-pressed={theme === "light"}
          title={T[theme === "light" ? "lightOn" : "darkOn"]}
          aria-label={T[theme === "light" ? "lightOn" : "darkOn"]}
        >
          {theme === "light" ? "☀️" : "🌙"}{" "}
          <span className="a11y-toggle-label">{T[theme]}</span>
        </button>
        {/* 🌐 #3046 — persistent EN/Bangla toggle. Mirrors the onboarding
            wizard toggle so a parent who finished or skipped onboarding can
            still switch the whole portal language. */}
        <button
          className="a11y-toggle"
          onClick={() => onChangeLang(wizLang === "en" ? "bn" : "en")}
          aria-pressed={wizLang === "bn"}
          title="EN / বাংলা"
          aria-label="EN / বাংলা"
        >
          {"🌐 "}
          <span className="a11y-toggle-label">{wizLang === "en" ? "বাংলা" : "EN"}</span>
        </button>
      </span>
      {/* #85 — sync status chip + manual sync. */}
      <span
        className={`sync-chip${online ? " on" : " off"}`}
        title={
          lastSync && kidsCount > 0
            ? `${S.portal} ${S.synced} ${relTime(lastSync, wizLang)} ${S.ago}`
            : S.justNow
        }
      >
        <span className={`sync-dot ${online ? "ok" : "bad"}`} aria-hidden="true" />
        {online ? S.online : S.offline}
        {lastSync && online && kidsCount > 0 && (
          <span className="sync-when">
            {" · "}
            {S.portal} {S.synced} {relTime(lastSync, wizLang)}
          </span>
        )}
        <button
          className="sync-btn"
          disabled={syncingNow}
          onClick={() => manualSync()}
          aria-label={S.syncNow}
          title={S.syncNow}
        >
          {syncingNow ? S.syncing : S.syncNow}
        </button>
      </span>
      {/* #1553 — the kid DEVICE's sync signal. */}
      {deviceSync && (deviceSync.lastSuccessAt !== null || deviceSync.pendingCount > 0) && (
        <span
          className="sync-chip"
          title={
            deviceSync.lastSuccessAt !== null
              ? `${S.device} · ${S.deviceLastSynced} ⌁ ${relTime(deviceSync.lastSuccessAt, wizLang)} ${S.ago}`
              : S.device
          }
        >
          <span aria-hidden="true">⌁</span>
          <span className="sync-when">{S.device}</span>
          {deviceSync.lastSuccessAt !== null && (
            <span className="sync-when">
              {" · "}
              {S.deviceLastSynced} ⌁ {relTime(deviceSync.lastSuccessAt, wizLang)} {S.ago}
            </span>
          )}
          {deviceSync.pendingCount > 0 && (
            <span style={{ color: "#fbbf24", fontWeight: 800 }}>
              {" · "}⚠{" "}
              {S.pending.replace(
                "{n}",
                wizLang === "bn" ? toBnNum(deviceSync.pendingCount) : String(deviceSync.pendingCount)
              )}
            </span>
          )}
        </span>
      )}
      {/* #1535 — parent-gated notifications opt-in. */}
      <span className="notif-toggle-wrap">
        {!notifSupported ? (
          <span className="notif-muted">{N.unsupported}</span>
        ) : notifState === "loading" ? (
          <span className="notif-muted">{N.loading}</span>
        ) : (
          <>
            <span className={`sync-chip${notifState === "on" ? " on" : ""}`}>
              <span aria-hidden="true">🔔</span>
              <span>{N.label}</span>
              <button
                className="sync-btn"
                disabled={notifBusy}
                aria-pressed={notifState === "on"}
                onClick={() => onToggleNotif()}
                title={notifState === "on" ? N.enabled : N.needParent}
              >
                {notifState === "on" ? N.on : N.off}
              </button>
            </span>
            {notifAskPass && (
              <span className="notif-prompt">
                <span>{N.needParent}</span>
                <span>{N.passwordLabel}</span>
                <input
                  type="password"
                  value={notifPassword}
                  onChange={(e) => setNotifPassword(e.target.value)}
                  placeholder={N.passwordPlaceholder}
                  aria-label={N.passwordLabel}
                  autoFocus
                />
                <button
                  className="btn btn-small"
                  disabled={notifBusy}
                  onClick={() => confirmEnableNotifications()}
                >
                  {notifBusy ? N.verifying : N.confirm}
                </button>
                <button className="btn btn-small ghost" disabled={notifBusy} onClick={cancelNotifAsk}>
                  {N.cancel}
                </button>
              </span>
            )}
            {notifMsg && (
              <span
                className={`notif-msg ${notifMsg.kind === "err" ? "err" : notifMsg.kind === "ok" ? "ok" : "muted"}`}
                role="status"
              >
                {notifMsg.text}
                {notifMsg.kind === "muted" && (
                  <button
                    onClick={dismissNotifMsg}
                    aria-label={N.dismiss}
                    title={N.dismiss}
                    style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", marginLeft: 8, fontSize: 14 }}
                  >
                    ×
                  </button>
                )}
              </span>
            )}
          </>
        )}
      </span>
      <span className="topbar-user" title={profile?.email ?? "signed in"}>
        {profile?.display_name ?? "Parent"} 👨‍👩‍👧
      </span>
      <button className="btn btn-small ghost" onClick={onSignOut}>
        {top.signOut}
      </button>
    </header>
  );
}
