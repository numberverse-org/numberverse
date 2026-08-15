import * as fs from "node:fs";
import * as path from "node:path";

/** The shipped kid PWA. Override with NV_E2E_BASE to point the suite at a
 *  staged deployment (same-origin parent portal under /parent/). */
export const E2E_DEFAULT_BASE = "https://kids.munna-khan.xyz";

/** Resolve and validate the deployed base under test. */
export function resolveBaseUrl(): string {
  const raw = (process.env.NV_E2E_BASE ?? E2E_DEFAULT_BASE).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NV_E2E_BASE must be an absolute http(s) URL, got "${raw}".`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`NV_E2E_BASE must use http(s), got "${raw}".`);
  }
  return url.toString().replace(/\/+$/, "");
}

/** The APP_VERSION the deployment is expected to serve. An explicit
 *  NV_E2E_VERSION wins (that is the pin); otherwise the repo's stamped
 *  apps/kid/src/version.ts is the single source of truth. */
export function expectedVersion(): string | null {
  const explicit = process.env.NV_E2E_VERSION?.trim();
  if (explicit) return explicit;
  try {
    const file = path.join(process.cwd(), "apps", "kid", "src", "version.ts");
    const src = fs.readFileSync(file, "utf8");
    const match = /export const APP_VERSION = "([^"]+)"/.exec(src);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
