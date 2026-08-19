import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * #1781 — Open Graph / Twitter card metadata for the public share page.
 * The root layout (`apps/parent/app/layout.tsx`) defines only the general
 * portal metadata; this route-level layout adds the rich preview tags that
 * WhatsApp/Facebook/LinkedIn/iMessage need to render a card for `/share/`.
 *
 * basePath is /parent in the demo build (empty in local dev), and Next does
 * NOT auto-prefix metadata URLs — so build absolute asset paths from the
 * known public host + base exactly like the root layout builds `${base}/...`.
 */
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const SITE_URL = "https://kids.munna-khan.xyz";

const title = "This week in Numberverse";
const description =
  "A week of learning, shared by the family. No names, no personal details — just the numbers. ✨";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    url: `${SITE_URL}${base}/share/`,
    images: [
      {
        url: `${SITE_URL}${base}/og-share-card.png`,
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "This week in Numberverse",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${SITE_URL}${base}/og-share-card.png`],
  },
};

export default function ShareLayout({ children }: { children: ReactNode }) {
  return children;
}
