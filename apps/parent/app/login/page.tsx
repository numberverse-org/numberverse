"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { login, validateToken, type LoginResponse } from "../../lib/api";
import { LOGIN_LANGS, type LoginLang, nvTrackParent } from "../lib/portal";

// Demo-mode only: the seeded demo@numberverse.dev account is REAL on the box
// (a live kid + plus subscription). Advertising its credentials on a production
// build invites anyone to sign in as the demo parent. Only show the hint when
// the build opts in (NEXT_PUBLIC_DEMO_MODE=1); production default is OFF.
// #800 — the seeded demo password is operator-owned (NV_DEMO_PASSWORD), so the
// hint reads the matching build-time value instead of a hardcoded secret.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "demo1234";

export default function LoginPage() {
  const [lang, setLang] = useState<LoginLang>("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<LoginResponse | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("nv_parent_lang");
    if (saved === "en" || saved === "bn") setLang(saved);
  }, []);

  // #3020 — flip locale AND persist nv_parent_lang so the Dashboard (and a
  // reload / the signup page) inherit the choice, matching the wizard's toggle.
  function toggleLang() {
    setLang((prev) => {
      const next = prev === "en" ? "bn" : "en";
      try {
        localStorage.setItem("nv_parent_lang", next);
      } catch {
        /* private browsing — the in-memory choice still applies this session */
      }
      return next;
    });
  }

  const t = LOGIN_LANGS[lang];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await login(email, password);
      // #1538 — a 200 from login() is not proof the dashboard will accept the
      // token. Validate it once, exactly like page.tsx does on mount, before we
      // store it; if we can't confirm it, fail loudly instead of storing a token
      // that will bounce on the dashboard.
      const verdict = await validateToken(res.token);
      if (verdict !== "ok") {
        localStorage.removeItem("nv_parent_token");
        setError(t.errSession);
        return;
      }
      localStorage.setItem("nv_parent_token", res.token);
      // #1617 — local-only adoption signal (nothing leaves the device).
      nvTrackParent("login");
      setOk(res);
    } catch (e) {
      // #1587 — surface the real cause: bad credentials (401), rate limit
      // (429), network failure, or unknown server error.
      const err = e as { status?: unknown; message?: unknown } | null;
      const status = typeof err?.status === "number" ? err.status : null;
      const msg = typeof err?.message === "string" && err.message ? err.message : null;
      if (status === 401) {
        setError(t.errInvalid);
      } else if (status === 429) {
        setError(t.errRateLimited);
      } else if (msg && /fetch|network/i.test(msg)) {
        setError(t.errNetwork);
      } else {
        setError(t.errUnknown);
      }
    }
  }

  return (
    <main className="shell">
      <div className="logo">🔢</div>
      <h1>{t.title}</h1>
      {ok ? (
        <div className="card">
          <p>
            ✅ {t.signedInAs} <strong>{ok.profile.display_name}</strong>
          </p>
          {/* #1538 — a browser that never finished onboarding is the cheap
              first-run signal: route login through the welcome anchor. */}
          <Link className="btn" href={localStorage.getItem("nv_parent_onboarded") ? "/" : "/?welcome=1"}>
            {t.openDashboard}
          </Link>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          {/* #1606 — real accessible labels AND placeholders (kept so existing
              selectors / visual hints still work), never placeholder-only. */}
          <label>
            {t.emailLabel}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder={t.emailLabel}
            />
          </label>
          <label>
            {t.passwordLabel}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder={t.passwordLabel}
            />
          </label>
          {error && <p className="err" role="alert">{error}</p>}
          <button className="btn" type="submit">{t.signIn}</button>
          {/* #1537 — self-onboarding entry point. */}
          <p className="hint">
            <Link href="/signup">{t.createAccount}</Link> · <span>{t.createAccountBn}</span>
          </p>
          {/* #1586 — honest recovery message: no SMTP, so no self-serve reset.
              The admin console is the only path. */}
          <p className="hint">
            <strong>{t.recoveryTitle}</strong> {t.recoveryBody}
          </p>
          {/* #1598 — privacy context (EN + BN sibling). */}
          <p className="hint">{t.privacy1}</p>
          <p className="hint">{t.privacy2}</p>
          {DEMO_MODE && (
            <p className="hint">
              {t.demoMode}: demo@numberverse.dev / {DEMO_PASSWORD}
            </p>
          )}
          <p className="hint center" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="ghost-btn small"
              onClick={toggleLang}
            >
              EN / বাংলা
            </button>
          </p>
        </form>
      )}
    </main>
  );
}
