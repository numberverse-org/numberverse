"use client";

import { useEffect, useState } from "react";
import { fetchShareSnapshot, type ShareSnapshot } from "../../lib/api";

/**
 * #245 — the public share-card page (static route, token passed as `?t=`).
 * A friend/relative opens a per-kid link (`/share/?t=<token>`) and sees the
 * week's AGGREGATE numbers and nothing else.
 *  · Unique link per kid  — each kid has its own unguessable token
 *  · No personal data leak — the API returns only aggregates (no name/avatar/
 *    kid id/skill ids); the token itself carries no readable info
 *  · No tracking — this page makes exactly ONE fetch, no analytics, no pixels
 *  · Static-export friendly — no dynamic route, so the portal's
 *    `output: "export"` build ships it as plain HTML.
 */
export default function SharePage() {
  const token =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("t") ?? "")
      : "";
  const [snap, setSnap] = useState<ShareSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) {
      setFailed(true);
      return;
    }
    let alive = true;
    void fetchShareSnapshot(token).then((s) => {
      if (!alive) return;
      if (s) setSnap(s);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <main className="shell">
      <div className="logo">🔢</div>
      <h1>This week in Numberverse</h1>
      {failed ? (
        <p className="center muted">
          This link isn't active anymore. Ask for a fresh share card — or sign
          in at the parent portal to make one.
        </p>
      ) : !snap ? (
        <p className="center muted">
          <span className="spinner" aria-hidden />Loading this week…
        </p>
      ) : (
        <>
          <p className="center muted small">
            A week of learning, shared by the family. No names, no personal
            details — just the numbers. ✨
          </p>
          <section className="card">
            <div className="stat-tiles">
              <div className="tile">
                <span className="tile-num">{snap.rounds}</span>
                <span className="tile-label">rounds this week</span>
              </div>
              <div className="tile">
                <span className="tile-num">{snap.correct_pct}%</span>
                <span className="tile-label">correct</span>
              </div>
              <div className="tile">
                <span className="tile-num">{snap.minutes}</span>
                <span className="tile-label">minutes played</span>
              </div>
              <div className="tile">
                <span className="tile-num">{snap.active_days}</span>
                <span className="tile-label">days active</span>
              </div>
              <div className="tile">
                <span className="tile-num">{snap.mastered_count}</span>
                <span className="tile-label">skills mastered</span>
              </div>
            </div>
            {snap.top_game && (
              <p className="muted small center" style={{ marginTop: 14 }}>
                Favorite game: {snap.top_game.replace("game-", "").replace(/-/g, " ")}
              </p>
            )}
          </section>
          <p className="center muted small">
            Made with 💜 by Numberverse · numberverse.org
          </p>
        </>
      )}
    </main>
  );
}
