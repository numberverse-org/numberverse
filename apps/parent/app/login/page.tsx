"use client";

import { useState } from "react";
import Link from "next/link";
import { login, validateToken, type LoginResponse } from "../../lib/api";

// Demo-mode only: the seeded demo@numberverse.dev account is REAL on the box
// (a live kid + plus subscription). Advertising its credentials on a production
// build invites anyone to sign in as the demo parent. Only show the hint when
// the build opts in (NEXT_PUBLIC_DEMO_MODE=1); production default is OFF.
// #800 — the seeded demo password is operator-owned (NV_DEMO_PASSWORD), so the
// hint reads the matching build-time value instead of a hardcoded secret.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "demo1234";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<LoginResponse | null>(null);

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
        setError("Signed in, but we couldn't confirm the session — try again.");
        return;
      }
      localStorage.setItem("nv_parent_token", res.token);
      setOk(res);
    } catch {
      setError("Sign in failed — check email and password.");
    }
  }

  return (
    <main className="shell">
      <div className="logo">🔢</div>
      <h1>Numberverse Parent Portal</h1>
      {ok ? (
        <div className="card">
          <p>✅ Signed in as <strong>{ok.profile.display_name}</strong></p>
          {/* #1538 — a browser that never finished onboarding is the cheap
              first-run signal: route login through the welcome anchor. */}
          <Link className="btn" href={localStorage.getItem("nv_parent_onboarded") ? "/" : "/?welcome=1"}>
            Open dashboard →
          </Link>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <input
            type="email"
            placeholder="Parent email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="err">{error}</p>}
          <button className="btn" type="submit">Sign in</button>
          {/* #1537 — self-onboarding entry point for brand-new parents. */}
          <p className="hint">
            <Link href="/signup">Create account</Link> · <span>অ্যাকাউন্ট তৈরি করুন</span>
          </p>
          {/* #1542 — privacy context at the exact moment a parent types PII.
              No lang toggle on this page, so English + a short Bangla sibling. */}
          <p className="hint">
            Your email is used only to sign you in and keep your child&apos;s progress synced.
            No ads, no tracking — you can export or delete your{" "}
            <Link href="/#on-device">data</Link> anytime.
          </p>
          <p className="hint">
            আপনার ইমেইল শুধু সাইন ইন করতে এবং বাচ্চার অগ্রগতি সিঙ্ক রাখতে ব্যবহৃত হয়।
            কোনো বিজ্ঞাপন নেই, ট্র্যাকিং নেই — আপনি চাইলে যেকোনো সময় ডেটা এক্সপোর্ট বা মুছে ফেলতে পারেন।
          </p>
          {DEMO_MODE && <p className="hint">Demo parent: demo@numberverse.dev / {DEMO_PASSWORD}</p>}
        </form>
      )}
    </main>
  );
}
