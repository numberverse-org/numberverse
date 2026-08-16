import type { MetadataRoute } from "next";

// #1786 — the parent portal is an auth-gated login shell; robots cannot log in,
// so everything under `/` is Disallowed. The public /share/ weekly card stays
// indexable via an explicit Allow. Because the portal ships under basePath
// (`/parent` in the demo build), the Allow uses `${base}/share/` so it matches
// the real URL. The sitemap line points crawlers at the static sitemap.xml.
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kids.munna-khan.xyz";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: `${base}/share/`,
        disallow: "/",
      },
    ],
    sitemap: `${SITE_URL}${base}/sitemap.xml`,
  };
}
