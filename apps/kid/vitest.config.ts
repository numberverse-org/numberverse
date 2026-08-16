import { defineConfig } from "vitest/config";

// Kid-app unit-test config. The app's vite.config.ts loads the VitePWA plugin
// (service-worker injection) — NOT needed under test, so tests run against this
// minimal config. `environment: "node"` keeps pure logic tests fast; the store
// tests opt into jsdom per-file via the `// @vitest-environment jsdom` banner.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
