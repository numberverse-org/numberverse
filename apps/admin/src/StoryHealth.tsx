import { useEffect, useState } from "react";
import { API } from "./apiBase";
// #849 — same shared client; no manual Authorization headers anywhere.
import { httpClient } from "./httpClient";

interface StoryHealthData {
  total: number;
  charts: {
    by_kid: Array<{ rank: number; label: string; stories: number }>;
    by_skill: Array<{ skill_id: string; stories: number }>;
    by_error_kind: Array<{ error_kind: string; stories: number }>;
    by_action: Array<{ action: string; stories: number }>;
    by_day: Array<{ date: string; stories: number }>;
  };
  rate_limit_per_hour: number;
  high_velocity_kids: Array<{
    kid_id: string;
    last_hour: number;
    over_budget_by: number;
  }>;
  sanity: { ok: boolean; warnings: string[] };
}

interface EmbedResult {
  embedded?: number;
  skipped?: number;
}

interface PruneResult {
  pruned: number;
  age_pruned: number;
  cap_pruned: number;
  retention_days: number;
  active_skill_days: number;
  max_stories_per_kid: number;
}

const section: React.CSSProperties = {
  marginTop: 26,
  paddingTop: 18,
  borderTop: "1px solid #eee",
};
const h2: React.CSSProperties = { fontSize: 18, margin: "0 0 10px" };
const sub: React.CSSProperties = { fontSize: 14, fontWeight: 700, margin: "14px 0 6px", color: "#444" };
const button: React.CSSProperties = {
  background: "linear-gradient(120deg,#7c3aed,#2ec4b2)",
  border: "none",
  color: "#fff",
  borderRadius: 10,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
const disabledButton: React.CSSProperties = { ...button, opacity: 0.5, cursor: "not-allowed" };

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(2, (value / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div
        title={label}
        style={{
          width: 180,
          textAlign: "right",
          fontSize: 12,
          color: "#667",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, background: "#f1eefc", borderRadius: 6, height: 16 }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg,#7c3aed,#2ec4b2)",
            borderRadius: 6,
          }}
        />
      </div>
      <div style={{ width: 52, fontSize: 12, color: "#444" }}>{value}</div>
    </div>
  );
}

// #844 — 14-day ingest trend: a vertical bar chart made of plain divs.
function DayTrend({ data }: { data: Array<{ date: string; stories: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.stories));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingTop: 8 }}>
      {data.map((d) => (
        <div
          key={d.date}
          style={{
            flex: 1,
            minWidth: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            height: 150,
            justifyContent: "flex-end",
          }}
        >
          <div style={{ fontSize: 11, color: "#667", marginBottom: 2 }}>{d.stories || ""}</div>
          <div
            style={{
              width: "100%",
              maxWidth: 32,
              height: Math.max(2, (d.stories / max) * 110),
              background: "linear-gradient(180deg,#7c3aed,#2ec4b2)",
              borderRadius: "6px 6px 0 0",
            }}
          />
          <div
            style={{
              fontSize: 10,
              color: "#999",
              marginTop: 4,
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
            }}
          >
            {d.date.slice(5)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StoryHealth() {
  const [health, setHealth] = useState<StoryHealthData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [embedResult, setEmbedResult] = useState<EmbedResult | null>(null);
  const [pruneResult, setPruneResult] = useState<PruneResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setHealth(await httpClient<StoryHealthData>(`${API}/admin/stories/health`));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load story health.");
      }
    })();
  }, []);

  const runEmbed = async () => {
    setEmbedding(true);
    setActionErr(null);
    setEmbedResult(null);
    try {
      setEmbedResult(
        await httpClient<EmbedResult>(`${API}/admin/stories/embed`, { method: "POST" })
      );
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Embed job failed.");
    } finally {
      setEmbedding(false);
    }
  };

  const runPrune = async () => {
    setPruning(true);
    setActionErr(null);
    setPruneResult(null);
    try {
      setPruneResult(
        await httpClient<PruneResult>(`${API}/admin/stories/prune`, { method: "POST" })
      );
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Prune job failed.");
    } finally {
      setPruning(false);
    }
  };

  return (
    <div style={section}>
      <h2 style={h2}>📚 Kotha story health</h2>

      {err && <div style={{ color: "#c62828", marginBottom: 12 }}>{err}</div>}
      {!health && !err && <div style={{ color: "#888", padding: "10px 0" }}>Loading story health…</div>}

      {health && (
        <>
          {/* #844 — sanity verdict: red/amber banner when warnings are present. */}
          <div
            style={{
              background: health.sanity.ok ? "#e9f7ef" : "#fff4e5",
              border: `1px solid ${health.sanity.ok ? "#bfe6cf" : "#ffca7a"}`,
              color: health.sanity.ok ? "#1e7b46" : "#8a5300",
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 14,
            }}
          >
            {health.sanity.ok ? (
              <>✅ {health.total} story(s) ingested — sanity checks passed.</>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {health.sanity.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          {/* #844 — runaway-sync flags. */}
          <div style={sub}>🚨 High-velocity kids (last hour)</div>
          {health.high_velocity_kids.length === 0 ? (
            <div style={{ color: "#888", fontSize: 13 }}>
              None — every kid is under {health.rate_limit_per_hour} stories/hour.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#888", fontSize: 12, textTransform: "uppercase" }}>
                  <th style={{ padding: "6px 4px" }}>Kid</th>
                  <th style={{ padding: "6px 4px" }}>Last hour</th>
                  <th style={{ padding: "6px 4px" }}>Over budget by</th>
                </tr>
              </thead>
              <tbody>
                {health.high_velocity_kids.map((k) => (
                  <tr key={k.kid_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 4px", fontFamily: "monospace", fontSize: 12 }}>{k.kid_id}</td>
                    <td style={{ padding: "6px 4px" }}>{k.last_hour}</td>
                    <td style={{ padding: "6px 4px", color: "#c62828", fontWeight: 700 }}>+{k.over_budget_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={sub}>📈 14-day ingest trend</div>
          {health.charts.by_day.length === 0 ? (
            <div style={{ color: "#888", fontSize: 13 }}>No stories in the last 14 days.</div>
          ) : (
            <DayTrend data={health.charts.by_day} />
          )}

          <div style={sub}>🐞 Stories by error kind</div>
          {health.charts.by_error_kind.length === 0 ? (
            <div style={{ color: "#888", fontSize: 13 }}>No error-kind data yet.</div>
          ) : (
            <div>
              {health.charts.by_error_kind.slice(0, 8).map((e) => (
                <BarRow
                  key={e.error_kind}
                  label={e.error_kind}
                  value={e.stories}
                  max={Math.max(1, ...health.charts.by_error_kind.map((x) => x.stories))}
                />
              ))}
            </div>
          )}

          <div style={sub}>🧭 Stories by action</div>
          {health.charts.by_action.length === 0 ? (
            <div style={{ color: "#888", fontSize: 13 }}>No action data yet.</div>
          ) : (
            <div>
              {health.charts.by_action.slice(0, 8).map((a) => (
                <BarRow
                  key={a.action}
                  label={a.action}
                  value={a.stories}
                  max={Math.max(1, ...health.charts.by_action.map((x) => x.stories))}
                />
              ))}
            </div>
          )}

          <div style={sub}>🧒 Stories per kid (anonymous rank)</div>
          {health.charts.by_kid.length === 0 ? (
            <div style={{ color: "#888", fontSize: 13 }}>No per-kid story data yet.</div>
          ) : (
            <div>
              {health.charts.by_kid.slice(0, 8).map((k) => (
                <BarRow
                  key={k.label}
                  label={k.label}
                  value={k.stories}
                  max={Math.max(1, ...health.charts.by_kid.map((x) => x.stories))}
                />
              ))}
            </div>
          )}

          {/* #844 — manual embed/prune job triggers with inline results. */}
          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            <button style={embedding ? disabledButton : button} onClick={runEmbed} disabled={embedding}>
              {embedding ? "Embedding…" : "Embed stories now"}
            </button>
            <button style={pruning ? disabledButton : button} onClick={runPrune} disabled={pruning}>
              {pruning ? "Pruning…" : "Prune stories now"}
            </button>
          </div>

          {actionErr && <div style={{ color: "#c62828", marginTop: 10 }}>{actionErr}</div>}

          {embedResult && (
            <div style={{ color: "#1e7b46", marginTop: 10 }}>
              Embed done — embedded {embedResult.embedded ?? 0}, skipped {embedResult.skipped ?? 0}.
            </div>
          )}

          {pruneResult && (
            <div style={{ color: "#1e7b46", marginTop: 10 }}>
              Prune done — {pruneResult.pruned} pruned ({pruneResult.age_pruned} age, {pruneResult.cap_pruned} cap).
            </div>
          )}
        </>
      )}
    </div>
  );
}
