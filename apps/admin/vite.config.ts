import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev keeps the root base ("/"). The demo/tunnel build sets
// VITE_ADMIN_BASE=/admin/ so the SPA lives under demo.com/admin/ and the
// main nginx can reverse-proxy it cleanly.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" && process.env.VITE_ADMIN_BASE ? process.env.VITE_ADMIN_BASE : "/",
  server: { host: true, port: 5175 },
}));
