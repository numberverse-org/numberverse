/** @type {import('next').NextConfig} */
// The demo/tunnel build sets NEXT_PUBLIC_BASE_PATH=/parent so the parent
// portal lives under demo.com/parent/ behind the shared nginx. Local dev
// (no env) keeps the root basePath.
//
// output:"export" makes `next build` emit a fully static `out/` (every page
// here is a client component), so the deploy is just files on nginx — no node
// server, no ports, nothing to babysit on the box.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
};
export default nextConfig;
