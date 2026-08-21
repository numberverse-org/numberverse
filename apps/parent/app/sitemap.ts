import type { MetadataRoute } from "next";

// #2646 — Next 15 requires metadata routes to opt into static export explicitly.
export const dynamic = "force-static";

// #1785 — static sitemap for the parent portal's public pages, emitted by Next
// at export time (output:"export" → out/sitemap.xml under the basePath).
// URLs are built from SITE_URL + basePath (the same single origin source used
// by the root layout and the share layout). The /share/ entry omits the per-kid
// `?t=` token because that token would create infinitely many distinct URLs —
// this is the canonical form a crawler should index.
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kids.munna-khan.xyz";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}${base}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}${base}/share/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
