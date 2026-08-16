"use client";

import Link from "next/link";
import { TOPBAR_LANGS, type WizardLang } from "../lib/portal";

/** #1588 — the pre-auth shell (session checking / anon). Rendered only while
 *  `authState !== "ok"` so no parent data ever leaks before the token is
 *  validated. Kept out of page.tsx so the dashboard file stays focused. */
export default function AuthGate({
  authState,
  authNote,
  wizLang,
}: {
  authState: "checking" | "ok" | "anon";
  authNote: string | null;
  wizLang: WizardLang;
}) {
  const t = TOPBAR_LANGS[wizLang];
  return (
    <main className="shell">
      <div className="logo">🔢</div>
      <h1>{t.parentPortal}</h1>
      {authState === "checking" ? (
        <p className="center muted">
          <span className="spinner" aria-hidden />
          {t.checkingSession}
        </p>
      ) : (
        <>
          <p className="center muted">{t.signInManage}</p>
          {authNote && <p className="center err mt-8">{authNote}</p>}
        </>
      )}
      <div className="center mt-24">
        {authState === "checking" ? (
          <Link className="btn btn-small ghost" href="/login">
            {t.signInInstead}
          </Link>
        ) : (
          <Link className="btn" href="/login">
            {t.goToLogin}
          </Link>
        )}
      </div>
    </main>
  );
}
