import Phaser from "phaser";
import { ASSETS } from "../assets/svgs";

/**
 * SVG → Phaser texture bridge.
 *
 * SVGs can't be loaded by Phaser's loader directly, so we hand them to an
 * <img> (data-URI), draw onto a canvas texture and register it. The BootScene
 * calls ensureAssets() the moment the game boots, so by the time the first
 * lesson appears every icon is usually already a crisp texture.
 *
 * assetIcon() returns a swap-in-place Container: it starts as the fallback
 * emoji (so the lesson is playable even on first paint) and upgrades to the
 * vector texture the instant the SVG lands. No scene logic needed — call it
 * exactly like add.text.
 */

const TEXTURE_SIZE = 256; // 2× downscaled per-icon → crisp on retina
const textureKey = (key: string) => `nv-svg-${key}`;
const loaded = new Map<string, string>(); // asset key → texture key
const inFlight = new Set<string>(); // asset keys whose <img> is still loading
const failed = new Set<string>(); // SVGs that refused to rasterize → keep emoji
const waiters = new Map<string, (() => void)[]>(); // asset key → upgrade callbacks

function dataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function fireWaiters(key: string) {
  const list = waiters.get(key);
  if (!list) return;
  waiters.delete(key);
  for (const cb of list) {
    try {
      cb();
    } catch {
      /* one broken waiter must not break the others */
    }
  }
}

/**
 * Start loading any SVG that isn't already loaded (idempotent).
 * Self-healing across game lifecycles: App destroys + recreates the Phaser
 * game when the kid leaves play, which wipes the texture manager — so every
 * "already loaded" entry is re-validated against the LIVE texture manager and
 * re-rasterized when the old texture is gone.
 */
export function ensureAssets(scene: Phaser.Scene): void {
  // Brand-new game? (App destroys + recreates the game when leaving play.)
  // Drop any in-flight loads aimed at the old game's dead textures.
  const first = Object.keys(ASSETS)[0];
  if (!scene.textures.exists(textureKey(first)) && inFlight.size > 0) {
    inFlight.clear();
    waiters.clear();
  }
  for (const key of Object.keys(ASSETS)) {
    if (failed.has(key)) continue;
    if (!ASSETS[key].svg) continue; // static PNG sprites are not SVG-rasterizable
    const cached = loaded.get(key);
    if (cached) {
      if (scene.textures.exists(cached)) continue;
      loaded.delete(key); // texture died with a previous game → reload below
    }
    if (inFlight.has(key)) continue;
    const tex = scene.textures.createCanvas(textureKey(key), TEXTURE_SIZE, TEXTURE_SIZE);
    if (!tex) continue;
    const ctx = tex.getContext();
    inFlight.add(key);
    const img = new Image();
    img.onload = () => {
      try {
        ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
        ctx.drawImage(img, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
        tex.refresh();
        loaded.set(key, textureKey(key));
        failed.delete(key);
      } catch {
        /* SVG that failed to rasterize → keep the emoji fallback */
      }
      inFlight.delete(key);
      fireWaiters(key);
    };
    img.onerror = () => {
      inFlight.delete(key);
      failed.add(key);
      fireWaiters(key);
    };
    img.src = dataUri(ASSETS[key].svg);
  }
}

export interface IconOpts {
  /** Vertical offset from the container origin (for icon-above-label layouts). */
  y?: number;
  /** Extra scale boost beyond `size` (e.g. shapes sit better a touch smaller). */
  scale?: number;
}

/**
 * A self-upgrading icon: emoji text now, vector texture when ready.
 * Returns a Container so scenes can drop it anywhere (even inside a button).
 */
export function assetIcon(scene: Phaser.Scene, key: string, size: number, opts: IconOpts = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(0, opts.y ?? 0);
  const asset = ASSETS[key];
  const px = Math.max(14, Math.round(size * (opts.scale ?? 1)));
  // the SVGs are square except Nova (160×210) — don't stretch her into a blob
  const ph = Math.max(14, Math.round(px / (asset?.aspect ?? 1)));

  const addTexture = () => {
    const tk = loaded.get(key);
    if (!tk || !scene.textures.exists(tk)) return;
    c.removeAll(true); // drop emoji/older texture safely (no live-iteration destroy)
    c.add(scene.add.image(0, 0, tk).setDisplaySize(px, ph));
  };

  const tk = loaded.get(key);
  if (tk && scene.textures.exists(tk)) {
    c.add(scene.add.image(0, 0, tk).setDisplaySize(px, ph));
  } else {
    c.add(
      scene.add
        .text(0, 0, asset?.emoji ?? "❓", { fontSize: `${Math.round(px * 0.92)}px` })
        .setOrigin(0.5)
    );
    ensureAssets(scene);
    if (!waiters.has(key)) waiters.set(key, []);
    waiters.get(key)!.push(addTexture);
  }
  return c;
}

/** True once an SVG has been rasterized into a texture (for tests/intro). */
export function hasAssetTexture(key: string): boolean {
  return loaded.has(key);
}
