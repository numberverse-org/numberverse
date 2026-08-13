// Blue-screen guard: ESM-eval the built kid bundle under a DOM shim.
// The critical goal is that EVERY module's scope initializes without a
// TDZ / ReferenceError crash (the 0.27.1 blue-screen class). React/Phaser
// render errors past createRoot() are shim gaps, not bundle bugs.
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// Resolve to apps/kid/dist regardless of cwd (run from anywhere).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KID_DIST = path.resolve(__dirname, "../apps/kid/dist/assets");

const noop = () => {};
const media = { matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop };
const fakeCtx = {
  globalCompositeOperation: "multiply", fillStyle: "", strokeStyle: "",
  drawImage: noop, fillRect: noop, clearRect: noop, putImageData: noop,
  getImageData: () => null, measureText: () => ({ width: 0 }),
  save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
  beginPath: noop, closePath: noop, fill: noop, stroke: noop,
  moveTo: noop, lineTo: noop, arc: noop, rect: noop, clip: noop, setTransform: noop, transform: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
  getContextAttributes: () => ({}), canvas: {},
};
const doc = { createElement: () => el(), addEventListener: noop, removeEventListener: noop, body: null, head: null, documentElement: null, querySelector: () => null, querySelectorAll: () => [] };
const el = () => new Proxy({
  style: {}, dataset: {}, children: [], nodeType: 1,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  ownerDocument: doc,
}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === "getContext") return () => fakeCtx;
    if (typeof k === "string" && k.startsWith("__react")) return null;
    if (k === "value" || k === "textContent" || k === "innerHTML") return "";
    if (["parentNode", "parentElement", "firstChild", "lastChild", "nextSibling",
         "previousSibling", "childNodes"].includes(k)) return el();
    return noop;
  },
  set() { return true; },
});
doc.body = el(); doc.head = el(); doc.documentElement = el();
Object.defineProperty(doc, "getElementById", { value: () => el(), configurable: true });

globalThis.document = doc;
globalThis.window = {
  addEventListener: noop, removeEventListener: noop, matchMedia: () => media,
  innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, location: { href: "", origin: "", pathname: "/" },
  navigator: { userAgent: "node", language: "en", onLine: true, languages: ["en"] },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
  crypto: globalThis.crypto, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => 1, history: { pushState: noop, replaceState: noop },
};
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
globalThis.matchMedia = () => media;
globalThis.requestAnimationFrame = (cb) => 1;
globalThis.cancelAnimationFrame = noop;
globalThis.screen = { width: 800, height: 600, orientation: { type: "landscape-primary" } };
class MO { constructor() {} observe() {} disconnect() {} takeRecords() { return []; } }
globalThis.MutationObserver = MO;
class IO { constructor() {} observe() {} disconnect() {} unobserve() {} }
globalThis.IntersectionObserver = IO;
globalThis.ResizeObserver = IO;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "", setProperty: noop });
globalThis.requestIdleCallback = (cb) => 1;
globalThis.cancelIdleCallback = () => {};
class ImageShim { constructor() { this.src = ""; this.onload = null; this.onerror = null; } }
globalThis.Image = ImageShim;
globalThis.Audio = class { constructor() {} play() { return Promise.resolve(); } };
globalThis.HTMLCanvasElement = class {};

const dir = pathToFileURL(KID_DIST).href + "/";
const entry = readdirSync(KID_DIST)
  .find((f) => f.startsWith("index-") && f.endsWith(".js"));
if (!entry) { console.error("❌ no entry chunk found"); process.exit(1); }
try {
  await import(dir + entry);
  console.log(`✅ KID BUNDLE MODULE-EVAL OK (${entry}) — no TDZ/blue-screen crash`);
  // Module scope evaluated cleanly — that's the blue-screen gate. Background
  // timers/React-into-fake-DOM noise after this must not fail the check.
  process.exit(0);
} catch (e) {
  console.error(`❌ KID BUNDLE MODULE-EVAL FAILED (${entry}):`);
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}
