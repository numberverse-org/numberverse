#!/usr/bin/env node
/**
 * scripts/e2e-preview.mjs — local PR-bundle preview proxy for the Numberverse
 * e2e suite.
 *
 * The shipped e2e run (ci.yml offline-e2e) targets the LIVE deployed site
 * (https://kids.munna-khan.xyz) and the #930 version gate aborts when the live
 * host does not serve the version stamped in apps/kid/src/version.ts — so a PR
 * whose stamp differs from live can never exercise its OWN bundles. This script
 * stands the PR's LOCAL builds behind ONE origin so Playwright can run the real
 * specs against the actual artifacts:
 *
 *   :8081/parent/*  (and :8081/admin/* when the admin bundle is built)
 *       → parent portal on :3000
 *   everything else (/, /assets/*, /fonts/*, /sw.js, /api/*, …)
 *       → kid PWA on :4173 (`vite preview`)
 *
 * The single-origin rule matters: e2e/cross-app.spec.ts proves the kid ↔ parent
 * journey through ONE shared localStorage origin (nv_parent_token), exactly the
 * production nginx setup.
 *
 * Parent server on :3000:
 *   The portal is built with Next `output: "export"` (static HTML in
 *   apps/parent/out — the same files nginx serves under /parent/ in
 *   production), so `next start` refuses to run ("does not work with
 *   output: export"). The script still ATTEMPTS `pnpm --filter parent start`
 *   first (the task spec; it becomes the server if the export mode ever
 *   changes) and falls back to an embedded static file server for
 *   apps/parent/out that mirrors the production nginx try_files chain
 *   ($uri → $uri.html → $uri/ → /parent/index.html).
 *
 * Usage (from the repo root, after `pnpm --filter kid build` and
 * `NEXT_PUBLIC_BASE_PATH=/parent pnpm --filter parent build`):
 *   NV_E2E_BASE=http://127.0.0.1:8081 NV_E2E_SKIP_VERSION_CHECK=1 \
 *     node scripts/e2e-preview.mjs & pnpm exec playwright test
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = Number(process.env.NV_E2E_PROXY_PORT) || 8081;
// #playable — the parent/kid backend ports are env-overridable so the sweep can
// run on a dev box where another service already owns the default (e.g. Docker
// Desktop squats :3000). CI leaves these unset → the documented defaults.
const PARENT_PORT = Number(process.env.NV_E2E_PARENT_PORT) || 3000;
const KID_PORT = Number(process.env.NV_E2E_KID_PORT) || 4173;

const KID_DIST = path.join(ROOT, "apps", "kid", "dist");
const PARENT_OUT = path.join(ROOT, "apps", "parent", "out");
const ADMIN_DIST = path.join(ROOT, "apps", "admin", "dist");
const ADMIN_BUILT = existsSync(path.join(ADMIN_DIST, "index.html"));

const children = new Set();
const servers = new Set();
let shuttingDown = false;

const log = (...args) => console.log("[e2e-preview]", ...args);
const err = (...args) => console.error("[e2e-preview]", ...args);

/* ── helpers ─────────────────────────────────────────────────────────── */

function waitForPort(port, host = PROXY_HOST, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  const tryConnect = () =>
    new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(500);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
    });
  return (async () => {
    for (;;) {
      if (await tryConnect()) return true;
      if (Date.now() > deadline) return false;
      await new Promise((r) => setTimeout(r, 250));
    }
  })();
}

function startChild(label, command, args) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own process group → cleanup can kill the whole tree
  });
  children.add(child);
  child.stdout.on("data", (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[${label}] ${d}`));
  child.on("exit", (code, signal) => {
    children.delete(child);
    log(`child "${label}" exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
  });
  return child;
}

async function killChildTree(child) {
  try {
    process.kill(-child.pid, "SIGTERM"); // whole process group
  } catch {
    /* group already gone */
  }
  try {
    child.kill("SIGTERM");
  } catch {
    /* already dead */
  }
}

/* ── parent portal server (:3000) ────────────────────────────────────── */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".onnx": "application/octet-stream",
  ".data": "application/octet-stream",
};

function sendFile(req, res, file) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  const st = statSync(file);
  const headers = { "Content-Type": type, "Content-Length": st.size };
  if (path.basename(file) === "sw.js") headers["Cache-Control"] = "no-store";
  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

/**
 * Serve apps/parent/out exactly the way production nginx serves the static
 * portal under /parent/ (infra/deploy/nginx.conf):
 *   location /parent/ { try_files $uri $uri.html $uri/ /parent/index.html; }
 *   location = /parent { return 302 /parent/; }
 */
function serveParentStatic(req, res) {
  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
    pathname = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  if (pathname === "/parent" || pathname === "/admin") {
    res.writeHead(302, { Location: `${pathname}/` });
    res.end();
    return;
  }

  let rel = pathname;
  if (pathname.startsWith("/parent/") || pathname.startsWith("/admin/")) {
    const prefix = pathname.startsWith("/parent/") ? "/parent" : "/admin";
    rel = pathname.slice(prefix.length) || "/";
  }

  const candidates = [rel, `${rel}.html`, path.posix.join(rel, "index.html"), "/index.html"];
  for (const cand of candidates) {
    const target = path.normalize(path.join(PARENT_OUT, cand));
    if (target !== PARENT_OUT && !target.startsWith(PARENT_OUT + path.sep)) continue; // no escaping out/
    if (!existsSync(target)) continue;
    const st = statSync(target);
    if (st.isDirectory()) {
      const index = path.join(target, "index.html");
      if (existsSync(index)) {
        sendFile(req, res, index);
        return;
      }
      continue;
    }
    sendFile(req, res, target);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function startStaticParentServer() {
  const server = http.createServer(serveParentStatic);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PARENT_PORT, PROXY_HOST, () => {
      servers.add(server);
      resolve(server);
    });
  });
}

/** Bring up :3000 — try `pnpm --filter parent start` first, then fall back to
 *  the static export server when Next refuses (output: "export"). */
async function bootParent(parentNext) {
  const portOpen = waitForPort(PARENT_PORT);
  const childExited = new Promise((resolve) =>
    parentNext.once("exit", (code, signal) => resolve({ code, signal }))
  );
  const winner = await Promise.race([
    childExited.then((r) => ({ kind: "exited", ...r })),
    portOpen.then((ok) => ({ kind: ok ? "portOpen" : "portTimeout" })),
  ]);

  if (winner.kind === "portOpen") {
    // Give `next start` a beat to fail AFTER binding (e.g. EADDRINUSE against a
    // stray process on :3000) so we don't mistake a dead child for a live one.
    await new Promise((r) => setTimeout(r, 500));
    if (parentNext.exitCode === null && parentNext.signalCode === null) {
      log(`parent: "next start" is serving on :${PARENT_PORT}`);
      return;
    }
    log(`parent: port ${PARENT_PORT} probe won but the next process exited (code=${parentNext.exitCode ?? "null"}) — using the static out/ server`);
  } else if (winner.kind === "exited") {
    log(
      `parent: "next start" exited (code=${winner.code ?? "null"}, signal=${winner.signal ?? "null"}) — ` +
        `the portal is an output:export site, so serving apps/parent/out statically on :${PARENT_PORT}`
    );
  } else {
    err(`parent: "next start" never opened :${PARENT_PORT}; using the static out/ server instead`);
  }

  await killChildTree(parentNext);
  await startStaticParentServer();
  log(`parent: static export server listening on :${PARENT_PORT} (mirrors production nginx try_files)`);
}

/* ── single-origin proxy (:8081) ─────────────────────────────────────── */

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function startProxy() {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, `http://${PROXY_HOST}:${PROXY_PORT}`).pathname;
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad request");
      return;
    }
    const toParent =
      pathname.startsWith("/parent") || (ADMIN_BUILT && pathname.startsWith("/admin"));
    const targetPort = toParent ? PARENT_PORT : KID_PORT;
    const headers = { ...req.headers, host: req.headers.host ?? `${PROXY_HOST}:${targetPort}` };
    const proxyReq = http.request(
      `http://${PROXY_HOST}:${targetPort}${req.url}`,
      { method: req.method, headers },
      (proxyRes) => {
        const outHeaders = { ...proxyRes.headers };
        for (const h of HOP_BY_HOP) delete outHeaders[h];
        res.writeHead(proxyRes.statusCode ?? 502, outHeaders);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", (e) => {
      err(`proxy to :${targetPort} failed for ${req.url}: ${e.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end(`Bad gateway: ${e.message}`);
    });
    req.pipe(proxyReq);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PROXY_PORT, PROXY_HOST, () => {
      servers.add(server);
      resolve(server);
    });
  });
}

/* ── lifecycle ───────────────────────────────────────────────────────── */

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal} — tearing down preview servers`);
  for (const child of [...children]) killChildTree(child);
  for (const server of servers) {
    try {
      server.close();
    } catch {
      /* not listening */
    }
  }
  // Force-kill anything that ignored the group SIGTERM, then exit.
  setTimeout(() => {
    for (const child of [...children]) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* gone */
      }
      try {
        child.kill("SIGKILL");
      } catch {
        /* gone */
      }
    }
    process.exit(0);
  }, 500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

/* ── main ────────────────────────────────────────────────────────────── */

async function main() {
  if (!existsSync(path.join(KID_DIST, "index.html"))) {
    err(`kid build not found — run \`pnpm --filter kid build\` first (looked for ${path.join(KID_DIST, "index.html")})`);
    process.exit(1);
  }
  if (!existsSync(path.join(PARENT_OUT, "index.html"))) {
    err(`parent build not found — run \`NEXT_PUBLIC_BASE_PATH=/parent pnpm --filter parent build\` first (looked for ${path.join(PARENT_OUT, "index.html")})`);
    process.exit(1);
  }

  log(`routing /parent${ADMIN_BUILT ? " and /admin" : ""} → :${PARENT_PORT}, everything else → :${KID_PORT}`);

  const kidPreview = startChild(
    "kid",
    "pnpm",
    ["--filter", "kid", "exec", "vite", "preview", "--port", String(KID_PORT), "--strictPort", "--host", PROXY_HOST]
  );
  const parentNext = startChild("parent", "pnpm", ["--filter", "parent", "start"]);

  // Wait for the kid to be reachable OR to crash (race — never wait for both).
  const kidExit = new Promise((resolve) =>
    kidPreview.once("exit", (code, signal) => resolve({ code, signal }))
  );
  const kidResult = await Promise.race([
    waitForPort(KID_PORT).then((ok) => ({ kind: ok ? "up" : "timeout" })),
    kidExit.then((r) => ({ kind: "exit", ...r })),
  ]);
  if (kidResult.kind === "exit") {
    err(`kid: vite preview exited before opening :${KID_PORT} (code=${kidResult.code ?? "null"} signal=${kidResult.signal ?? "null"})`);
    await shutdown("exit");
    process.exit(1);
  }
  if (kidResult.kind === "timeout") {
    err(`kid: vite preview never opened :${KID_PORT} within timeout`);
    await shutdown("exit");
    process.exit(1);
  }
  log(`kid: vite preview is serving ${KID_DIST} on :${KID_PORT}`);

  await bootParent(parentNext);

  await startProxy();
  log(`ready → http://${PROXY_HOST}:${PROXY_PORT} (live URL for NV_E2E_BASE)`);

  // Lightweight self-check so CI logs show the two routes are live.
  try {
    const kidStatus = await fetch(`http://${PROXY_HOST}:${PROXY_PORT}/`).then((r) => r.status);
    const parentStatus = await fetch(`http://${PROXY_HOST}:${PROXY_PORT}/parent/login`).then((r) => r.status);
    log(`probe: GET / → ${kidStatus}, GET /parent/login → ${parentStatus}`);
  } catch (e) {
    err(`self-check probe failed: ${e.message}`);
  }
}

main().catch(async (e) => {
  err("fatal:", e);
  await shutdown("fatal");
  process.exit(1);
});
