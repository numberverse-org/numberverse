import { useEffect, useState } from "react";
import { useGetIdentity, useLogout } from "react-admin";
import { API } from "./apiBase";
// #849 — the dashboard goes through the shared token-injecting client instead
// of hand-rolling `fetch` + an Authorization header.
import { httpClient } from "./httpClient";
import StoryHealth from "./StoryHealth";
import { useDarkMode } from "./useDarkMode";

interface Stats {
  profiles: number;
  kids: number;
  skills: number;
  content_items: number;
  progress_events: number;
  subscriptions: number;
  recent_events: Array<{
    id: number;
    skill_id?: string;
    game_id?: string;
    correct?: boolean;
    created_at?: string;
  }>;
}

export default function Dashboard() {
  const { identity } = useGetIdentity();
  // #1885 — surface "sign out everywhere": authProvider.logout({logoutAll})
  // revokes every session the API mints (not just this device's), so an admin
  // who lost a device can kill the leaked token from here.
  const logout = useLogout();
  const { dark, toggle } = useDarkMode();
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // #849 — token injection + error detail handling now live in httpClient.
        setStats(await httpClient<Stats>(`${API}/admin/stats`));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load stats.");
      }
    })();
  }, []);

  const tiles = [
    { emoji: "👨‍👩‍👧", title: "Parents", value: stats?.profiles },
    { emoji: "🧒", title: "Kids", value: stats?.kids },
    { emoji: "🎯", title: "Skills", value: stats?.skills },
    { emoji: "📦", title: "Content", value: stats?.content_items },
    { emoji: "🎮", title: "Rounds", value: stats?.progress_events },
    { emoji: "💳", title: "Subscriptions", value: stats?.subscriptions },
  ];

  return (
    <div className="nv-console">
      <div className="nv-console-header">
        <div>
          <h1 className="nv-console-title">Numberverse Console</h1>
          <div className="nv-console-subtitle">
            {identity?.fullName ? `Signed in as ${identity.fullName}` : "Platform overview"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="nv-btn" onClick={toggle} title="Toggle dark/light theme">
            {dark ? "☀️" : "🌙"}
          </button>
          <button
            className="nv-btn"
            onClick={() => {
              if (window.confirm("Sign out on EVERY device? This revokes all active sessions.")) {
                logout({ logoutAll: true });
              }
            }}
          >
            👋 Sign out everywhere
          </button>
        </div>
      </div>

      {err && <div style={{ color: "var(--nv-err)", marginBottom: 12 }}>{err}</div>}
      {!stats && !err && <div className="nv-loading">Loading stats…</div>}

      {stats && (
        <>
          <div className="nv-tiles">
            {tiles.map((t) => (
              <div key={t.title} className="nv-tile">
                <div className="nv-tile-emoji">{t.emoji}</div>
                <div className="nv-tile-num">{t.value ?? "—"}</div>
                <div className="nv-tile-label">{t.title}</div>
              </div>
            ))}
          </div>

          <h2 className="nv-section-title">Recent rounds</h2>
          {(stats.recent_events ?? []).length === 0 ? (
            <div className="nv-muted">No rounds recorded yet.</div>
          ) : (
            <table className="nv-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Skill</th>
                  <th>Result</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_events.map((e) => (
                  <tr key={e.id}>
                    <td>{e.game_id}</td>
                    <td>{e.skill_id}</td>
                    <td>{e.correct ? "✅" : "❌"}</td>
                    <td className="nv-muted">
                      {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* #844 — rich story-lake surface (health, runaway-sync flags, embed/prune jobs). */}
      <StoryHealth />
    </div>
  );
}
