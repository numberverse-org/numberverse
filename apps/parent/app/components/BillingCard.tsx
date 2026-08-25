/* ─── BillingCard — Parent Plus upgrade / status (#billing) ──────────────
   Shows the account's plan (free → upgrade button; plus → active badge + expiry)
   and drives the bKash Tokenized Checkout flow: create → redirect → callback.

   The kid app only ever reads `plan` from /auth/me; payment is a parent-portal
   concern (bKash redirects are awkward on a kid's phone). When bKash is not
   configured server-side, the routes return 501 and this card shows a
   "coming soon" line instead of a dead upgrade button.
*/
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createBkashPayment,
  getBillingStatus,
  type BillingStatus,
  type Profile,
} from "../../lib/api";
import { BILLING_LANGS, type WizardLang } from "../lib/portal";

function fmtDate(iso: string | null | undefined, lang: WizardLang): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function BillingCard({
  profile,
  token,
  wizLang,
}: {
  profile: Profile | null;
  token: string;
  wizLang: WizardLang;
}) {
  const t = BILLING_LANGS[wizLang];
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isPlus = profile?.plan === "plus";

  // Load billing status once (enabled + price) so the card can gate the button.
  useEffect(() => {
    let alive = true;
    if (!token) return;
    getBillingStatus(token)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [token]);

  // The callback URL: bKash redirects the parent back here after authorizing.
  // Must be the absolute origin + the upgrade callback route under /parent/.
  const callbackUrl = useCallback(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "/parent";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    // The upgrade page is served at /parent/upgrade → upgrade.html in the static
    // export (nginx `try_files $uri.html`). NO trailing slash: a trailing slash
    // would fall through to the dashboard's index.html (see nginx.conf #1782).
    return `${origin}${base}/upgrade`;
  }, []);

  const startPayment = async () => {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await createBkashPayment(token, callbackUrl());
      // bKash hands back an authorize URL — redirect the parent to it. The
      // callback page then completes the payment and returns them here.
      if (res.bkashURL) {
        window.location.href = res.bkashURL;
      } else {
        setErr(t.createErr);
      }
    } catch {
      setErr(t.createErr);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card billing-card" id="billing">
      <h2>💳 {t.plusTitle}</h2>
      <p className="muted">{t.plusSub}</p>

      {isPlus ? (
        <>
          <p className="ok">
            <strong>{t.plusBadge}</strong>
            {profile?.plan_expires_at
              ? ` ${t.expiresAt.replace("{date}", fmtDate(profile.plan_expires_at, wizLang))}`
              : ""}
          </p>
        </>
      ) : (
        <>
          <p className="hint">
            {t.freeBadge} — {t.freeLine}
          </p>

          <div className="billing-includes">
            <h3>{t.includesTitle}</h3>
            <ul>
              <li>✅ {t.include1}</li>
              <li>✅ {t.include2}</li>
              <li>✅ {t.include3}</li>
              <li>✅ {t.include4}</li>
            </ul>
          </div>

          {status?.enabled ? (
            <div className="billing-cta">
              <button
                className="btn primary"
                type="button"
                disabled={busy}
                onClick={() => void startPayment()}
              >
                {busy
                  ? t.redirecting
                  : `${t.upgradeButton} · ৳${status.annual_bdt}/yr`}
              </button>
            </div>
          ) : status === null && !err ? (
            <p className="muted small">{t.statusUnavailable}</p>
          ) : status?.enabled === false ? (
            <p className="muted small">{t.comingSoon}</p>
          ) : null}

          {err && <p className="err">{err}</p>}
        </>
      )}
    </section>
  );
}
