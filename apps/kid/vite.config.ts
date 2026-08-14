import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Numberverse — a PWA from the start:
//  - Fully offline: every script/style/icon is precached, and the app is
//    local-first (zustand → localStorage), so a kid on a Samsung can open it
//    from the home screen with NO network at all.
//  - Installable: standalone, portrait, kid-friendly theme.
//  - No ads, no tracking, no network calls — privacy is the moat, offline is a bonus.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // #264/#1234 — injectManifest (hand-written sw.ts): the offline-first
      // contract needs a NEVER-reject /api handler (cached GET replay + synthetic
      // 503 for queued mutations) that workbox generateSW's runtimeCaching cannot
      // express. The SW source lives in src/sw.ts and is bundled into dist/sw.js.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Numberverse — Math Playground",
        short_name: "Numberverse",
        description:
          "Adaptive math games for kids. Playful, private, no ads — works offline.",
        lang: "en",
        dir: "ltr",
        // "fullscreen" removes ALL browser chrome when opened from the home
        // screen (no URL bar, no status bar) — a kid taps the icon and is in
        // the app. iOS Safari ignores this and uses the meta tags instead.
        display: "fullscreen",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        id: "/",
        theme_color: "#0b2545",
        background_color: "#0b2545",
        categories: ["education", "kids", "games"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,woff2,woff,ttf,otf,png,svg,ico,json,glb,wasm}"],
        // og-card.png is only for social link previews (crawlers), never needed
        // offline — keep it out of the precache so it doesn't burn install bytes.
        globIgnores: ["**/og-card.png"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // NOTE: the /voice CacheFirst + /api never-reject handler + navigation
        // fallback (with the /parent /admin denylist) are implemented IN the SW
        // itself (src/sw.ts) — injectManifest mode doesn't auto-inject routes.
      },
      devOptions: {
        enabled: false, // never service-worker during local dev (stale-cache footguns)
      },
    }),
  ],
  // #691 — the 3D island must never force a >1MB chunk download. three.js +
  // R3F move to their own cacheable vendor chunk, so the lazy island chunk
  // stays small and the vendor chunk survives island app updates.
  build: {
    // #691 — keep the island + games genuinely lazy: no modulepreload links
    // (they made three-vendor/phaser-vendor fetch on every cold start; the
    // lazy chunks should download only when a kid actually enters them).
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // #1217 — the CommonJS default-export interop helper (\0commonjsHelpers)
          // is used by EVERY CJS module (react, react/jsx-runtime, phaser, …).
          // If Rollup hosts it inside phaser-vendor, then the BOOT chunk (which
          // needs it for react/jsx-runtime) statically imports phaser-vendor →
          // 1.4 MB of Phaser must download+execute before the splash paints.
          // Give the helper its own tiny chunk so boot only ever touches it.
          if (id.includes("commonjsHelpers")) return "vendor-cjs";
          if (id.includes("node_modules")) {
            // three core + examples (GLTF/KTX2/OrbitControls loaders) ONLY.
            // @react-three/fiber stays out so R3F's React dependency is NOT
            // pulled into three-vendor (that made the entry share React
            // through three-vendor → three.js fetched on every cold start).
            if (id.includes("node_modules/three")) return "three-vendor";
            if (id.includes("phaser")) return "phaser-vendor";
          }
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
