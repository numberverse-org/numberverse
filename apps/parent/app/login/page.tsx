"use client";

import { useState } from "react";
import Link from "next/link";
import { login, type LoginResponse } from "../../lib/api";

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
          <Link className="btn" href="/">Open dashboard →</Link>
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
          <p className="hint">Demo parent: demo@numberverse.dev / demo1234</p>
        </form>
      )}
    </main>
  );
}
