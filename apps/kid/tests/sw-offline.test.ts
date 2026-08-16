import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Structural/static scans of the service-worker + neural-voice source, mirroring
// the repo's accepted pattern for Phaser/service-worker-adjacent modules
// (see scenes.test.ts / scene-caches.test.ts). The SW cannot boot in jsdom, so
// we assert the shipped source enforces the offline-cache contract.
// ---------------------------------------------------------------------------
const KID_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (f: string): string => readFileSync(join(KID_SRC, f), "utf8");
const sw = read("sw.ts");
const voice = read("game/neuralVoice.ts");

const VOICE_URLS_WITH_V = [
  "piper_phonemize.js",
  "piper_phonemize.wasm",
  "piper_phonemize.data",
  "piper_worker.js",
  "bn_BD-google-medium.onnx",
  "bn_BD-google-medium.onnx.json",
  "ort.min.js",
];
const ORT_WASM = "ort-wasm-simd.wasm"; // unversioned by design (rename-on-change)

describe("sw.ts — /api routes every HTTP method (#1651)", () => {
  it("does not hand registerRoute a bare two-arg (GET-default) /api route", () => {
    // The old bug: registerRoute(matcher, handler) had no method arg → workbox
    // defaulted to GET and the mutation 503 branch was dead code. We must not
    // regress to a single method-less register for the boundary.
    const noMethodApi = sw.match(
      /registerRoute\(\s*\(\{\s*url\s*\}\)\s*=>\s*url\.pathname\.startsWith\("\/api\/"\),\s*apiNetworkBoundary\s*\)/
    );
    expect(noMethodApi).toBeNull();
  });

  it("registers the /api boundary under GET, POST, PUT, PATCH and DELETE", () => {
    expect(sw).toMatch(/const API_METHODS = \["GET", "POST", "PUT", "PATCH", "DELETE"\] as const;/);
    expect(sw).toMatch(/for \(const method of API_METHODS\)\s*\{\s*registerRoute\(\s*\(\{ url \}\)/s);
    // The mutation 503 envelope must still be emitted for non-GETs.
    expect(sw).toMatch(/Mutation offline/);
    expect(sw).toMatch(/return offlineEnvelope\(\);/);
  });
});

describe("sw.ts — voice size guard with no Content-Length (#1657/#1662)", () => {
  it("only admits a real 200 into nv-voice (no opaque status 0)", () => {
    expect(sw).toMatch(/if \(!response \|\| response\.status !== 200\) return null;/);
    // The statuses:[0,200] allowlist must be gone — opaque 0 is never cached.
    expect(sw).not.toMatch(/statuses:\s*\[0,\s*200\]/);
    expect(sw).toMatch(/statuses:\s*\[200\]/);
  });

  it("streams and counts the body when Content-Length is absent, rejecting over the cap", () => {
    expect(sw).toMatch(/response\.body\.getReader\(\)/);
    expect(sw).toMatch(/reader\.read\(\)/);
    expect(sw).toMatch(/total \+= value\.byteLength/);
    expect(sw).toMatch(/if \(total > VOICE_MAX_CACHE_BYTES\)/);
    expect(sw).toMatch(/await reader\.cancel\(\)/);
    expect(sw).toMatch(/return null; \/\/ over the cap/);
    // The verifiable-length path still returns the original response untouched.
    expect(sw).toMatch(/if \(Number\.isFinite\(bytes\) && bytes > VOICE_MAX_CACHE_BYTES\) return null;/);
    expect(sw).toMatch(/return response;/);
  });
});

describe("sw.ts — staleness marker + bounded nv-api (#1658/#1659)", () => {
  it("replays an offline /api cache hit with X-NV-Offline:1 + Date/Age", () => {
    expect(sw).toMatch(/function staleEnvelope\(cached: Response\): Response/);
    expect(sw).toMatch(/headers\.set\("X-NV-Offline", "1"\)/);
    expect(sw).toMatch(/headers\.set\("Date", date\)/);
    expect(sw).toMatch(/headers\.set\("Age", "0"\)/);
    expect(sw).toMatch(/if \(cached\) return staleEnvelope\(cached\);/);
  });

  it("bounds nv-api with maxEntries + maxAge and trims oldest-first", () => {
    expect(sw).toMatch(/const API_MAX_ENTRIES = 40;/);
    expect(sw).toMatch(/const API_MAX_AGE_MS = 7 \* 24 \* 60 \* 60 \* 1000;/);
    expect(sw).toMatch(/async function trimApiCache\(cache: Cache, now: number\)/);
    expect(sw).toMatch(/now - e\.t > API_MAX_AGE_MS/);
    expect(sw).toMatch(/if \(count <= API_MAX_ENTRIES\) break;/);
    // every successful GET is stamped with a cache time for the TTL sweep.
    expect(sw).toMatch(/headers\.set\("X-NV-Cached-At", String\(now\)\)/);
  });
});

describe("neuralVoice.ts — every voice URL is cache-busted (#1652)", () => {
  it("appends ?v= to the phonemizer files (previously bare URLs)", () => {
    for (const name of ["piper_phonemize.js", "piper_phonemize.wasm", "piper_phonemize.data"]) {
      const line = voice.split("\n").find((l) => l.includes(name) && l.includes("BASE +"));
      expect(line, `line referencing ${name}`).toBeTruthy();
      expect(line!).toContain('?v=" + VOICE_V');
    }
  });

  it("appends ?v= to every versioned voice asset", () => {
    for (const name of ["piper_worker.js", "bn_BD-google-medium.onnx", "bn_BD-google-medium.onnx.json", "ort.min.js"]) {
      const line = voice.split("\n").find((l) => l.includes(name) && l.includes("?v="));
      expect(line, `versioned line referencing ${name}`).toBeTruthy();
      expect(line!).toContain('?v=" + VOICE_V');
    }
  });

  it("every ALL_VOICE URL either carries ?v= or is the documented ORT_WASM rename-on-change exception", () => {
    // The ONLY unversioned voice URL allowed is ort-wasm (ORT 1.17's loader
    // string-concats its own filename — caching must use the same unversioned
    // key, so engine changes RENAME the file instead). It must carry an
    // explicit rename note; anything else unversioned fails.
    for (const name of VOICE_URLS_WITH_V) {
      const line = voice.split("\n").find((l) => l.includes(name) && l.includes("?v="));
      expect(line!, `versioned line referencing ${name}`).toContain('?v=" + VOICE_V');
    }
    const wasmLine = voice.split("\n").find((l) => l.includes(ORT_WASM));
    expect(wasmLine).toBeTruthy();
    expect(wasmLine!).not.toContain("?v=");
    expect(voice).toMatch(/rename the file instead/); // documented exception
  });
});
