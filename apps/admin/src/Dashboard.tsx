import { useEffect, useState } from "react";
import { useGetIdentity, useLogout } from "react-admin";
import { API } from "./apiBase";
// #849 — the dashboard goes through the shared token-injecting client instead
// of hand-rolling `fetch` + an Authorization header.
import { httpClient } from "./httpClient";
import StoryHealth from "./StoryHealth";

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

const card: React.CSSProperties = {
  background: "linear-gradient(150deg, rgba(124,58,237,0.18), rgba(46,196,182,0.12))",
  border: "1px solid rgba(124,58,237,0.3)",
  borderRadius: 20,
  padding: "18px 16px",
  textAlign: "center",
};
const num: React.CSSProperties = { fontSize: 30, fontWeight: 800, margin: "6px 0 2px" };
const label: React.CSSProperties = { fontSize: 13, color: "#667", fontWeight: 600 };
const box: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 18,
  padding: 20,
  margin: 16,
  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
};

export default function Dashboard() {
  const { identity } = useGetIdentity();
  // #1885 — surface "sign out everywhere": authProvider.logout({logoutAll})
  // revokes every session the API mints (not just this device's), so an admin
  // who lost a device can kill the leaked token from here.
  const logout = useLogout();
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
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Numberverse Console</h1>
          <div style={{ color: "#888" }}>
            {identity?.fullName ? `Signed in as ${identity.fullName}` : "Platform overview"}
          </div>
        </div>
        <button
          onClick={() => {
            if (window.confirm("Sign out on EVERY device? This revokes all active sessions.")) {
              logout({ logoutAll: true });
            }
          }}
          style={{
            background: "none",
            border: "1px solid #ccc",
            color: "#555",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          👋 Sign out everywhere
        </button>
      </div>

      {err && <div style={{ color: "#c62828", marginBottom: 12 }}>{err}</div>}
      {!stats && !err && <div style={{ color: "#888", padding: 30 }}>Loading stats…</div>}

      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
            {tiles.map((t) => (
              <div key={t.title} style={card}>
                <div style={{ fontSize: 28 }}>{t.emoji}</div>
                <div style={num}>{t.value ?? "—"}</div>
                <div style={label}>{t.title}</div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 18, margin: "22px 0 8px" }}>Recent rounds</h2>
          {(stats.recent_events ?? []).length === 0 ? (
            <div style={{ color: "#888" }}>No rounds recorded yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#888", fontSize: 12, textTransform: "uppercase" }}>
                  <th style={{ padding: "6px 4px" }}>Game</th>
                  <th style={{ padding: "6px 4px" }}>Skill</th>
                  <th style={{ padding: "6px 4px" }}>Result</th>
                  <th style={{ padding: "6px 4px" }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_events.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 4px" }}>{e.game_id}</td>
                    <td style={{ padding: "6px 4px" }}>{e.skill_id}</td>
                    <td style={{ padding: "6px 4px" }}>{e.correct ? "✅" : "❌"}</td>
                    <td style={{ padding: "6px 4px", color: "#888" }}>
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
