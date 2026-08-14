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
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,woff,ttf,otf,png,svg,ico,json,glb,wasm}"],
        // og-card.png is only for social link previews (crawlers), never needed
        // offline — keep it out of the precache so it doesn't burn install bytes.
        globIgnores: ["**/og-card.png"],
        navigateFallback: "/index.html",
        // CRITICAL — the kid SW's scope is "/", so its navigation fallback would
        // intercept EVERY path on this origin and serve the game's index.html —
        // including the sibling apps (/parent portal, /admin console). Without
        // this denylist a parent navigating to the portal in a browser with the
        // installed PWA sees the GAME, not the portal. Let these namespaces fall
        // through to the network (nginx serves the real static exports).
        navigateFallbackDenylist: [/^\/parent\//, /^\/admin\//],
        // The app never fetches remote data (local-first), so precache is all
        // we need — EXCEPT the on-device neural Bangla voice. The piper
        // phonemizer + model are way over the precache size cap (6MB), so they
        // are runtime-cached CacheFirst on first use: the first Bangla session
        // downloads the voice once (~110MB), then it's instant + fully offline.
        // NOTE: workbox RegExpRoute matches against the FULL href (origin +
        // path + query), NOT just pathname — so the pattern must NOT be
        // anchored with ^/voice/ (that silently never matches and forces a
        // re-download on every reload). Match the /voice/ segment mid-href.
        runtimeCaching: [
          {
            urlPattern: /\/voice\/.*$/,
            handler: "CacheFirst",
            options: {
              cacheName: "nv-voice",
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 180, // 6 months — re-fetch after
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // three core + examples (GLTF/KTX2/OrbitControls loaders) + R3F
            if (id.includes("three") || id.includes("@react-three")) return "three-vendor";
            if (id.includes("phaser")) return "phaser-vendor";
          }
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
