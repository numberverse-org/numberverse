/* ─── Parent Plus — bKash callback (#billing) ────────────────────────────
   bKash redirects the parent back here (the callbackURL minted by
   /billing/bkash/create) with a `paymentID` query param after the parent
   authorizes the payment. This page completes it: POST execute → on success the
   API activates the subscription (plan="plus") and we bounce the parent to the
   dashboard.

   Static-export friendly: a client component, no dynamic route — bKash lands
   on /parent/upgrade/?paymentID=… which the export ships as upgrade.html.
*/
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { executeBkashPayment } from "../../lib/api";
import { BILLING_LANGS, type WizardLang } from "../lib/portal";

type Phase = "working" | "done" | "failed" | "missing";

export default function UpgradePage() {
  const [lang, setLang] = useState<WizardLang>("en");
  const [phase, setPhase] = useState<Phase>("working");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nv_parent_lang");
      if (saved === "en" || saved === "bn") setLang(saved);
    } catch {
      /* ignore — default en */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const token = (() => {
      try {
        return localStorage.getItem("nv_parent_token");
      } catch {
        return null;
      }
    })();

    const paymentID =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("paymentID")
        : null;

    if (!token || !paymentID) {
      setPhase("missing");
      return;
    }

    executeBkashPayment(token, paymentID)
      .then((res) => {
        if (!alive) return;
        // The API returns plan="plus" when the subscription activated.
        if (res.plan === "plus") setPhase("done");
        else setPhase("failed");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg =
          e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
            ? ((e as { message: string }).message)
            : null;
        setErr(msg);
        setPhase("failed");
      });

    return () => {
      alive = false;
    };
  }, []);

  const t = BILLING_LANGS[lang];

  return (
    <main className="shell">
      <div className="logo">🔢</div>
      <h1>💳 {t.plusTitle}</h1>

      {phase === "working" && (
        <p className="center muted">
          <span className="spinner" aria-hidden />
          {t.redirecting}
        </p>
      )}

      {phase === "done" && (
        <div className="card">
          <p className="ok">
            <strong>{t.plusBadge}</strong>
          </p>
          <div className="center mt-24">
            <Link className="btn primary" href="/">
              ✅ {t.plusBadge}
            </Link>
          </div>
        </div>
      )}

      {phase === "failed" && (
        <div className="card">
          <p className="err">{t.createErr}</p>
          {err && <p className="muted small">{err}</p>}
          <div className="center mt-24">
            <Link className="btn" href="/">
              ← {t.freeBadge}
            </Link>
          </div>
        </div>
      )}

      {phase === "missing" && (
        <div className="card">
          <p className="muted">{t.createErr}</p>
          <div className="center mt-24">
            <Link className="btn" href="/">
              ← {t.freeBadge}
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
