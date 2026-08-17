"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signup, type LoginResponse } from "../../lib/api";
import { SIGNUP_LANGS, type SignupLang, nvTrackParent } from "../lib/portal";

/** #1537 — the parent portal's missing self-onboarding path. Same shell/card
 *  styling as /login, but POSTs the signup shape and, on success, stores the
 *  returned token and deep-links the dashboard with ?welcome=1 so the #246
 *  first-run wizard opens for the brand-new (kid-less) account. */
export default function SignupPage() {
  const [lang, setLang] = useState<SignupLang>("en");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<LoginResponse | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("nv_parent_lang");
    if (saved === "en" || saved === "bn") setLang(saved);
  }, []);

  const t = SIGNUP_LANGS[lang];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t.pwTooShort);
      return;
    }
    if (!name.trim()) {
      setError(t.nameRequired);
      return;
    }
    try {
      const res = await signup(email.trim(), password, name.trim());
      localStorage.setItem("nv_parent_token", res.token);
      // #1617 — local-only adoption signal (nothing leaves the device).
      nvTrackParent("signup");
      setOk(res);
    } catch (e) {
      // #1587 — surface the real cause: already-registered email (409), rate
      // limit (429), network failure, or unknown server error.
      const err = e as { status?: unknown; message?: unknown } | null;
      const status = typeof err?.status === "number" ? err.status : null;
      const msg = typeof err?.message === "string" && err.message ? err.message : null;
      if (status === 409) {
        setError(t.errConflict);
      } else if (status === 429) {
        setError(t.errRateLimited);
      } else if (msg && /fetch|network/i.test(msg)) {
        setError(t.errNetwork);
      } else {
        setError(t.err);
      }
    }
  }

  return (
    <main className="shell">
      <div className="logo">🔢</div>
      <h1>Numberverse Parent Portal</h1>
      {ok ? (
        <div className="card">
          <p>
            ✅ {t.success} <strong>{ok.profile.display_name ?? name.trim()}</strong>
          </p>
          {/* #1538 — a new account always routes through the onboarding anchor. */}
          <Link className="btn" href="/?welcome=1">
            {t.openDashboard}
          </Link>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <h2>{t.title}</h2>
          {/* #1606 — real accessible labels AND placeholders (kept so existing
              selectors / visual hints still work), never placeholder-only. */}
          <label>
            {t.nameLabel}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              placeholder={t.namePlaceholder}
            />
          </label>
          <label>
            {t.emailLabel}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder={t.emailPlaceholder}
            />
          </label>
          <label>
            {t.passwordLabel}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder={t.passwordPlaceholder}
            />
          </label>
          {error && <p className="err" role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={!name.trim() || !email.trim() || !password}>
            {t.submit}
          </button>
          <p className="hint">
            <Link href="/login">{t.signInLink}</Link>
          </p>
          <p className="hint center" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="ghost-btn small"
              onClick={() => setLang((prev) => (prev === "en" ? "bn" : "en"))}
            >
              EN / বাংলা
            </button>
          </p>
        </form>
      )}
    </main>
  );
}
