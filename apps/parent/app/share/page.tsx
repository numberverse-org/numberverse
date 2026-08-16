import type { Metadata } from "next";
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

// #1784/#1792 — build the share URL from the same single origin source as the
// root layout + share layout (env SITE_URL, default the verified prod host).
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kids.munna-khan.xyz";
const shareUrl = `${SITE_URL}${base}/share/`;

// #1783 — per-route canonical for the public share page. Without this, the
// root layout's canonical (`${base}/`) would inherit here and every `/share/?t=`
// link would canonicalize to the auth-gated dashboard root. This keeps the
// weekly card canonicalized to ITSELF (token-less), which is the URL a crawler
// should index.
export const metadata: Metadata = {
  alternates: { canonical: shareUrl },
};

// #1792 — WebPage structured data, emitted into the static HTML at build time
// (this is a server component). The `?t=` token is deliberately omitted — the
// canonical form is the URL a crawler should index.
const webPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "This week in Numberverse",
  description:
    "A week of learning, shared by the family. No names, no personal details — just the numbers. ✨",
  url: shareUrl,
  inLanguage: "en",
  isPartOf: {
    "@type": "WebSite",
    name: "Numberverse",
    url: `${SITE_URL}${base}/`,
  },
};

export default function SharePage() {
  return (
    <main className="shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <div className="logo">🔢</div>
      <h1>This week in Numberverse</h1>
      <ShareClient />
    </main>
  );
}
