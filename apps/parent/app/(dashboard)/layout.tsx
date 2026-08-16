import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * #1791 — the auth-gated dashboard (route `/`) is a login shell that robots
 * cannot use, so it must be `noindex`. This is a ROUTE-LEVEL layout scoped to
 * the `(dashboard)` route group ONLY — it MUST NOT live on the root layout,
 * because the public `/share/` page (and its weekly card) has to stay
 * indexable. The site `robots.ts` also `Disallow`s everything but `/share/`.
 *
 * basePath is /parent in the demo build (empty in local dev); metadata URLs are
 * NOT auto-prefixed by Next, so the canonical is built from the origin + base
 * exactly like the root layout builds `${base}/...`.
 */
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kids.munna-khan.xyz";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: `${SITE_URL}${base}/` },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
