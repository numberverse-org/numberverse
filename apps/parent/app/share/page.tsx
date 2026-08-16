import ShareClient from "./ShareClient";

/**
 * #245 + #1782 — the public share-card page (static route, token passed as `?t=`).
 * A friend/relative opens a per-kid link (`/share/?t=<token>`) and sees the
 * week's AGGREGATE numbers and nothing else.
 *  · Unique link per kid  — each kid has its own unguessable token
 *  · No personal data leak — the API returns only aggregates (no name/avatar/
 *    kid id/skill ids); the token itself carries no readable info
 *  · No tracking — this page makes exactly ONE fetch, no analytics, no pixels
 *  · Static-export friendly — no dynamic route, so the portal's
 *    `output: "export"` build ships it as plain HTML.
 *
 * This file is a SERVER component shell (no "use client"): it renders the
 * visible static frame (logo + real `<h1>`) at build time so scrapers never
 * depend on a client fetch to see the headline, and the OG/Twitter metadata
 * lives on the sibling `share/layout.tsx`. All dynamic work (token read,
 * aggregate fetch, stat tiles) stays in the `ShareClient` child.
 */
export default function SharePage() {
  return (
    <main className="shell">
      <div className="logo">🔢</div>
      <h1>This week in Numberverse</h1>
      <ShareClient />
    </main>
  );
}
