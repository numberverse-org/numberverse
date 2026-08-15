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
      // #1321 — "prompt" (not autoUpdate): a fresh deploy installs a new SW
      // that WAITS. The boot's update banner is the prompt to refresh; tapping
      // "Update" sends SKIP_WAITING (via virtual:pwa-register's updateSW) and
      // the page reloads onto the new build. autoUpdate's immediate takeover +
      // abrupt reload was #1225; prompt mode is the kid-safe version.
      registerType: "prompt",
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
        // #993 — og-card.png must be precached too: og:image points at the live
        // host, and a shared link opened offline should still show its card.
        // png covers the shipped file; jpg/jpeg/webp keep the glob ready for
        // any future og-card format without a config edit.
        globPatterns: ["**/*.{js,css,html,woff2,woff,ttf,otf,png,jpg,jpeg,webp,svg,ico,json,glb,wasm}"],
        // #991 — the 5 MiB cap applies ONLY to the precache glob above (the
        // ~2.2 MB index chunk, app shell, fonts, icons, etc.). The ~110 MB
        // neural voice model and other /voice/ runtime assets deliberately
        // BYPASS this cap via the explicit CacheFirst route in src/sw.ts
        // (VOICE_MAX_CACHE_BYTES = 150 MiB). A future 'size cleanup' must NOT
        // collapse these two paths — the voice model is the dominant byte cost
        // and needs its own guard.
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
  // #879 — the main entry bundle must stay lean: react, zustand and core are
  // pinned into named vendor chunks instead of flowing into the default entry
  // chunk unpredictably. three/@react-three/* stay OUT of this config entirely:
  // Nova3DHome is lazy in App.tsx (#880), so three.js/fiber only ever ride the
  // lazy nova3d chunk.
  build: {
    // #881 — the code-split i18n loader uses a deliberate top-level await so the
    // first render always has the ACTIVE language synchronously in STR. TLA
    // needs an ES2022 output target (the default es2020/chrome87 target rejects
    // it at build time).
    target: "es2022",
    // #879 — any chunk over 500 kB (pre-gzip) triggers the Vite size warning,
    // so a heavy dep sneaking back into the entry is caught at build time.
    chunkSizeWarningLimit: 500,
    // #691 — keep the island + games genuinely lazy: no modulepreload links
    // (they made the nova3d/phaser chunks fetch on every cold start; the
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
          // #879 — @numberverse/core is a workspace symlink; Vite resolves it
          // to the real /packages/core/ path (no node_modules segment), so it
          // must be matched before the node_modules guard below.
          if (
            id.includes("@numberverse/core") ||
            id.includes("/packages/core/")
          ) return "core";
          if (id.includes("node_modules")) {
            // #879 — react + react-dom (and react/jsx-runtime, which shares
            // the node_modules/react path) form the entry's runtime chunk.
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/")
            ) return "react";
            // #879 — zustand is the local-first state runtime; keep it out of
            // the entry so store changes don't re-touch the boot chunk.
            if (id.includes("node_modules/zustand/")) return "state";
            // #1217 — three core + examples (GLTF/KTX2/OrbitControls loaders)
            // ONLY. @react-three/fiber stays out so R3F's React dependency is
            // NOT pulled into three-vendor (that would make the entry share
            // React through three-vendor → three.js fetched on every cold
            // start). three is only ever imported by the lazy Nova3D island,
            // so this chunk is pulled lazily alongside it — keeping the island
            // chunk under the 1MiB oracle budget (#879).
            if (id.includes("node_modules/three")) return "three-vendor";
            // Phaser engine + scenes stay in their own dynamic-import chunk
            // (gameHost.ts boot() already lazy-loads it — DO NOT change).
            if (id.includes("phaser")) return "phaser-vendor";
          }
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
