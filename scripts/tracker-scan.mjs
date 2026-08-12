#!/usr/bin/env node
/**
 * No-ads gate (#92) — fail CI if an ad/tracker SDK ever lands.
 *
 * Run:  node scripts/tracker-scan.mjs   (from repo root)
 *
 * Two layers, both fail-closed:
 *   1. DEPENDENCIES — every workspace package.json is checked against a
 *      blocklist of ad/analytics/tracker SDK package names (exact, so
 *      `react-admin` can never trip `admin`).
 *   2. ENDPOINTS   — shipped source is scanned for ad/tracker SDK call
 *      shapes and endpoint domains (adsbygoogle, doubleclick.net,
 *      mixpanel.com, fbq(, …).
 *
 * A clear error names the offending package/file + the fingerprint, and the
 * repo path to fix. Mirrors the oracle's AD_SDKS list so both gates agree.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

// Ad/tracker SDK package names (whole-name OR after the @scope/ slash).
const DEP_BLOCKLIST = [
  "adsbygoogle", "react-adsense", "google-adsense", "doubleclick",
  "google-analytics", "react-ga", "react-ga4", "ga-4", "ga4-react",
  "mixpanel", "mixpanel-browser",
  "segment-analytics", "segment",
  "amplitude-js", "amplitude",
  "posthog-js", "posthog",
  "fullstory",
  "hotjar", "react-hotjar",
  "fathom-client", "plausible-tracker",
  "facebook-pixel", "fb-pixel",
  "googlesyndication", "ads", "ad-sense",
];

// Ad/tracker endpoint/SDK call fingerprints (matches the oracle's AD_SDKS).
const AD_SDKS = [
  "adsbygoogle", "doubleclick.net", "googlesyndication", "googletagmanager.com",
  "mixpanel.com", "segment.com", "amplitude.com", "fullstory.com", "hotjar.com",
  "fbq(", "analytics.google", "app-measurement", "telemetry.deeplink", "branch.io",
];

const SHIPPED = [
  join(ROOT, "apps", "kid", "src"),
  join(ROOT, "apps", "parent", "app"),
  join(ROOT, "apps", "parent", "lib"),
  join(ROOT, "apps", "admin", "src"),
  join(ROOT, "packages", "core", "src"),
];

let hits = [];
let depsChecked = 0;

// ── layer 1: dependency names ────────────────────────────────────────────
function walkPackageJsons(dir) {
  let out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next" || ent.name === "dist") continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out = out.concat(walkPackageJsons(p));
    else if (ent.name === "package.json") out.push(p);
  }
  return out;
}
for (const f of walkPackageJsons(ROOT)) {
  let json;
  try { json = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  const deps = { ...(json.dependencies || {}), ...(json.devDependencies || {}), ...(json.peerDependencies || {}) };
  for (const name of Object.keys(deps)) {
    depsChecked++;
    const base = name.includes("/") ? name.split("/")[1] : name;
    if (DEP_BLOCKLIST.includes(base) || DEP_BLOCKLIST.includes(name)) {
      hits.push(`${f.replace(ROOT, ".")}: dependency "${name}" is an ad/tracker SDK`);
    }
  }
}

// ── layer 2: source fingerprints ─────────────────────────────────────────
function* walkSrc(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* walkSrc(p);
    else if (/\.(ts|tsx|js|jsx)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) yield p;
  }
}
for (const dir of SHIPPED) {
  if (!statSync(dir, { throwIfNoEntry: false })) continue;
  for (const f of walkSrc(dir)) {
    const src = readFileSync(f, "utf8");
    for (const sdk of AD_SDKS) {
      if (src.includes(sdk)) {
        const lineNo = src.split("\n").findIndex((l) => l.includes(sdk)) + 1;
        hits.push(`${f.replace(ROOT, ".")}:${lineNo}: ad/tracker fingerprint "${sdk}"`);
      }
    }
  }
}

console.log(`Tracker scan: ${depsChecked} dependencies + shipped source checked`);
if (hits.length) {
  for (const h of hits.slice(0, 20)) console.error(`  ✖ ${h}`);
  console.error(`✖ ${hits.length} ad/tracker hit(s). Remove the dependency/call — Numberverse is 100% ad-free (docs/CONTENT_SAFETY.md §No-ads).`);
  process.exit(1);
}
console.log("✓ no ad/tracker dependencies or endpoints in the tree");
