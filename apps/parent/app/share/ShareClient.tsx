"use client";

import { useEffect, useState } from "react";
import { fetchShareSnapshot, type ShareSnapshot } from "../../lib/api";

/**
 * #245 + #1782 — client half of the public share-card route. The server shell
 * (`share/page.tsx`) prints the logo + `<h1>` statically so crawlers always
 * see the real headline; this child takes over everything dynamic — reading
 * the `?t=` token from the URL, the page's ONE network fetch, and the
 * loading/failed/stat-tile rendering.
 *  · No tracking — still exactly one fetch, no analytics, no pixels
 */
export default function ShareClient() {
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
    <>
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
              {typeof snap.coins === "number" && snap.coins > 0 && (
                <div className="tile">
                  <span className="tile-num">🪙 {snap.coins}</span>
                  <span className="tile-label">coins in wallet</span>
                </div>
              )}
            </div>
            {snap.minutes_by_day && snap.minutes_by_day.some((m) => m > 0) && (
              <div className="share-minbars" aria-label="minutes played by day this week">
                {snap.minutes_by_day.map((m, i) => (
                  <div key={i} className="share-mincol" title={`${Math.round(m)} min`}>
                    <div
                      className="share-minbar"
                      style={{ height: `${snap.minutes_by_day ? Math.max(4, Math.round((m / Math.max(1, ...snap.minutes_by_day!)) * 48)) : 4}px` }}
                    />
                  </div>
                ))}
              </div>
            )}
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
    </>
  );
}
