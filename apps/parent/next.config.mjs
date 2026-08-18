/** @type {import('next').NextConfig} */
// The demo/tunnel build sets NEXT_PUBLIC_BASE_PATH=/parent so the parent
// portal lives under demo.com/parent/ behind the shared nginx. Local dev
// (no env) keeps the root basePath.
//
// output:"export" makes `next build` emit a fully static `out/` (every page
// here is a client component), so the deploy is just files on nginx — no node
// server, no ports, nothing to babysit on the box.
//
// #1728 — `images.unoptimized: true` is REQUIRED here, not a mistake. Next's
// on-demand image optimizer is a server feature; with output:"export" there is
// no server, so next/image can only render with unoptimized:true or a custom
// loader. The portal uses no next/image today, so there is nothing to optimize
// and this stays on. If a future page needs optimized images under static
// export, add a custom loader (e.g. a CDN) and point next/image at it — do NOT
// flip this flag off, the export build fails the moment any <Image> appears.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
};
export default nextConfig;
