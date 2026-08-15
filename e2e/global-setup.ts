import { expectedVersion, resolveBaseUrl } from "./lib/e2eEnv";

/** Fetch text with a hard timeout (the tunnel edge can lag a fresh deploy). */
async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Mirror release.sh's post-deploy smoke: the APP_VERSION stamp may live in the
 *  boot chunk OR the lazy App chunk it dynamic-imports. */
async function deployedServesVersion(base: string, version: string): Promise<boolean> {
  const bust = `nv${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const html = await fetchText(`${base}/?${bust}`);
  const boot = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0];
  if (!boot) return false;
  let js = await fetchText(`${base}/${boot}?${bust}`);
  if (js.includes(version)) return true;
  const appChunk = /App-[A-Za-z0-9_-]+\.js/.exec(js)?.[0];
  if (!appChunk) return false;
  js = await fetchText(`${base}/assets/${appChunk}?${bust}`);
  return js.includes(version);
}

/** #930 — staged-deployment gate. Every e2e run proves the host under test is
 *  serving the version we think it is before a single browser opens, instead
 *  of silently testing a stale deploy. */
export default async function globalSetup(): Promise<void> {
  if (process.env.NV_E2E_SKIP_VERSION_CHECK === "1") return;
  const version = expectedVersion();
  if (!version) return;
  const base = resolveBaseUrl();
  const ok = await deployedServesVersion(base, version);
  if (!ok) {
    throw new Error(
      `Staged-deployment check failed: ${base} does not serve version ${version}. ` +
        `Set NV_E2E_VERSION to pin the expected version, or NV_E2E_SKIP_VERSION_CHECK=1 to bypass (local dev only).`
    );
  }
}
