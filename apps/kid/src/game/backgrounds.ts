import Phaser from "phaser";
import { SAT } from "./safeArea";
import { txt, NV_COCOA } from "./ui";
import { prefersReducedMotion, onReducedMotionChange } from "./reducedMotion";
import { matureRender } from "./renderBand"; // #1036 — tone down candy/sparkle for older kids

/**
 * Modern, "2026-style" animated game backgrounds — zero assets.
 *
 * No 90s clip-art: no banded fills, no emoji. Instead:
 *  - a perfectly smooth CSS canvas gradient (no color banding),
 *  - large soft aurora blobs drifting slowly (depth / parallax),
 *  - glassy floating shapes (soft circles, rounded squares, rings,
 *    sparkles) that bob + slowly rotate,
 *  - optional twinkling stars for night/space themes.
 * Everything is tint-able white canvas textures, so it's cheap,
 * resize-safe and cleans up on scene shutdown.
 */

export type BgTheme =
  | "ocean" | "space" | "forest" | "candy" | "sky" | "floral"
  | "night" | "sunset" | "kitchen" | "magic" | "desert";

interface Palette {
  top: number;
  bottom: number;
  blobs: number[];   // aurora blob colors
  shape: number;     // floating-shape tint
  stars?: boolean;   // twinkles
}

const PALETTES: Record<BgTheme, Palette> = {
  ocean:   { top: 0x062a4e, bottom: 0x0e8ba6, blobs: [0x2dd4bf, 0x38bdf8, 0x0ea5e9], shape: 0xa7f3d0 },
  space:   { top: 0x0f1027, bottom: 0x2d1b69, blobs: [0x7c3aed, 0x3b82f6, 0xa855f7], shape: 0xc7d2fe, stars: true },
  forest:  { top: 0x0c3b2e, bottom: 0x2fa375, blobs: [0x34d399, 0x6ee7b7, 0x10b981], shape: 0xa7f3d0 },
  candy:   { top: 0x5b21b6, bottom: 0xec4899, blobs: [0xf472b6, 0xa78bfa, 0xf0abfc], shape: 0xfbcfe8 },
  sky:     { top: 0x0b3b6d, bottom: 0x4db8f7, blobs: [0x7dd3fc, 0x60a5fa, 0x93c5fd], shape: 0xe0f2fe },
  floral:  { top: 0x3d1a5c, bottom: 0xf472a6, blobs: [0xf9a8d4, 0x818cf8, 0xf0abfc], shape: 0xfce7f3 },
  night:   { top: 0x0c0a2e, bottom: 0x3b1d6e, blobs: [0x6d28d9, 0x4f46e5, 0x9333ea], shape: 0xc4b5fd, stars: true },
  sunset:  { top: 0x6b1d2a, bottom: 0xf59e0b, blobs: [0xfb923c, 0xfbbf24, 0xf87171], shape: 0xfef3c7 },
  kitchen: { top: 0x431407, bottom: 0xea580c, blobs: [0xf59e0b, 0xfb923c, 0xfbbf24], shape: 0xffedd5 },
  magic:   { top: 0x191037, bottom: 0x6d28d9, blobs: [0x8b5cf6, 0xd946ef, 0xa78bfa], shape: 0xddd6fe, stars: true },
  desert:  { top: 0x78350f, bottom: 0xf0a022, blobs: [0xfbbf24, 0xfcd34d, 0xf97316], shape: 0xfef9c3 },
};

/* ───────────────────────────── helpers ───────────────────────────── */

function hexToRgb(color: number): [number, number, number] {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}

function hexToRgba(color: number, a = 1): string {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r},${g},${b},${a})`;
}

function lerpColor(a: number, b: number, t: number): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return (
    ((Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)) >>>
    0
  );
}

/* ─────────────────── non-blocking texture paint helpers (#1821) ─────────────────── */

/** Yield to the browser so Phaser's game loop + pre-render keep breathing while
 *  a procedural texture is painted in chunks. Falls back to a ~16ms timeout
 *  outside a browser / animation-frame context. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/** Phaser exposes no canvas→CanvasTexture reverse lookup, and the texture
 *  builders here only receive a 2D context (not the scene/texture). So we keep
 *  a WeakMap of every canvas Phaser creates: a light, additive wrap of
 *  `TextureManager.createCanvas` registers each CanvasTexture once without ever
 *  changing what it returns. */
const canvasTextures = new WeakMap<HTMLCanvasElement, Phaser.Textures.CanvasTexture>();
let canvasTexturesWired = false;
function wireCanvasTextureRegistry(): void {
  if (canvasTexturesWired) return;
  canvasTexturesWired = true;
  const proto = (Phaser.Textures.TextureManager as unknown as {
    prototype?: { createCanvas?: (key: string, width?: number, height?: number) => Phaser.Textures.CanvasTexture | null };
  }).prototype;
  if (!proto || typeof proto.createCanvas !== "function") return;
  const orig = proto.createCanvas;
  proto.createCanvas = function (this: Phaser.Textures.TextureManager, key: string, width?: number, height?: number) {
    const tex = orig.call(this, key, width, height);
    if (tex && tex.canvas) canvasTextures.set(tex.canvas, tex);
    return tex;
  };
}
wireCanvasTextureRegistry();

/** After an async texture paint finishes, push the (possibly partially-uploaded)
 *  canvas to the GPU so the finished pixels actually render. Safe no-op if the
 *  canvas wasn't created by Phaser (or the registry couldn't be wired), and a
 *  no-op if the owning texture has been destroyed mid-paint (its canvas is
 *  nulled by Phaser, and the element may have been returned to the CanvasPool). */
function refreshCanvasTexture(ctx: CanvasRenderingContext2D): void {
  const tex = canvasTextures.get(ctx.canvas);
  if (tex && tex.canvas === ctx.canvas) tex.refresh();
}

/* ─────────────────────── smooth gradient texture ─────────────────────── */

function makeGradient(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  top: number,
  bottom: number
): Phaser.Textures.CanvasTexture {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  // #3122 — the RESIZE handler fires in bursts while a phone rotates, and each
  // fire used to remove + re-rasterize the full screen-sized canvas. Reuse the
  // existing texture when its dimensions haven't actually changed, so repeated
  // same-size resizes cost nothing and a rotation rasterizes once per distinct
  // size instead of once per event.
  const current = scene.textures.exists(key)
    ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture)
    : null;
  if (current && current.canvas && current.width === cw && current.height === ch) {
    return current;
  }
  if (current) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, cw, ch)!;
  const ctx = tex.getContext();
  // One true linear gradient — a single CSS fill, so NO visible banding.
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, hexToRgba(top));
  g.addColorStop(0.55, hexToRgba(lerpColor(top, bottom, 0.55)));
  g.addColorStop(1, hexToRgba(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  // soft top light so it never reads flat
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.ellipse(cw / 2, -ch * 0.15, cw * 0.75, ch * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  tex.refresh();
  return tex;
}

/* ─────────────────────── soft textures (cached) ─────────────────────── */

const blobCache = new Map<number, Phaser.Textures.CanvasTexture>();
const blobPainted = new Set<number>();

/** #1744 — the blob cache is module-level, but the CanvasTextures it holds die
 *  with their Phaser game: App destroys + recreates the game when the kid
 *  leaves play, so every cached 512×512 texture from the old game is dead but
 *  would otherwise be pinned here for the app's lifetime (memory grows across
 *  game sessions). svgAssets.ensureAssets() detects a brand-new game and calls
 *  this so each session starts with a clean cache AND a fresh paint (the paint
 *  guard is cleared too — otherwise a recreated game would reuse a dead
 *  texture's "already painted" mark and show a transparent blank blob). */
export function clearBlobCache(): void {
  blobCache.clear();
  blobPainted.clear();
}

/** #1821 — the blob is a soft 512px radial glow. The texture key is created
 *  synchronously (so `scene.add.image` never sees a missing texture), but the
 *  actual radial-gradient fill is painted on a later frame so a scene create
 *  that touches several blob colors never rasterises them all in one tick.
 *  `blobPainted` guards the global cache so we only schedule the paint once.
 *  If the texture has been destroyed before the deferred paint runs (scene
 *  shutdown), the `tex.canvas` guard skips it harmlessly. */
function paintBlobTex(tex: Phaser.Textures.CanvasTexture, color: number): void {
  void (async () => {
    await nextFrame(); // defer the fill off the scene-create synchronous path
    if (!tex.canvas) return; // texture was destroyed (scene shutdown)
    const ctx = tex.getContext();
    const size = tex.width;
    const [r, g, b] = hexToRgb(color);
    ctx.clearRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.2)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    refreshCanvasTexture(ctx);
  })();
}

function getBlobTex(scene: Phaser.Scene, color: number): Phaser.Textures.CanvasTexture {
  let tex = blobCache.get(color);
  if (tex && scene.textures.exists(tex.key)) {
    if (!blobPainted.has(color)) {
      blobPainted.add(color);
      paintBlobTex(tex, color);
    }
    return tex;
  }
  // #1744 — the cached texture died with a previous Phaser game. Drop the stale
  // entry AND its paint guard so the fresh canvas below is actually painted (a
  // lingering "already painted" mark would otherwise leave a transparent blank
  // blob on a recreated game that reuses the same palette color).
  if (tex) {
    blobCache.delete(color);
    blobPainted.delete(color);
  }
  const key = `blob-${color.toString(16)}`;
  const size = 512;
  if (!scene.textures.exists(key)) scene.textures.createCanvas(key, size, size);
  tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  blobCache.set(color, tex);
  if (!blobPainted.has(color)) {
    blobPainted.add(color);
    paintBlobTex(tex, color);
  }
  return tex;
}

/** White shape textures — reuse one canvas each, tinted per theme.
 *  #1821 — the four canvases are created synchronously (so every texture key
 *  exists before `buildBg` places the images), but the actual shape painting is
 *  chunked across frames (one shape per frame + refresh) so a scene create that
 *  touches every shape texture never rasterises all four in a single tick. */
function ensureShapeTex(scene: Phaser.Scene) {
  if (scene.textures.exists("nv-shape-circle")) return;
  const size = 128;
  const make = (key: string): Phaser.Textures.CanvasTexture => {
    scene.textures.createCanvas(key, size, size)!;
    return scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  };
  const circle = make("nv-shape-circle");
  const round = make("nv-shape-round");
  const ring = make("nv-shape-ring");
  const spark = make("nv-shape-spark");
  const alive = (t: Phaser.Textures.CanvasTexture) => t.canvas !== null;

  void (async () => {
    await nextFrame(); // defer every shape off the scene-create synchronous path
    // soft glowing dot
    if (alive(circle)) {
      const c = circle.getContext();
      const cg = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      cg.addColorStop(0, "rgba(255,255,255,0.95)");
      cg.addColorStop(0.6, "rgba(255,255,255,0.3)");
      cg.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = cg;
      c.fillRect(0, 0, size, size);
      refreshCanvasTexture(c);
    }
    await nextFrame();

    // glassy rounded square with soft glow
    if (alive(round)) {
      const r = round.getContext();
      const x = size * 0.22, y = size * 0.22, w = size * 0.56, rad = size * 0.14;
      r.shadowColor = "rgba(255,255,255,0.55)";
      r.shadowBlur = 18;
      r.beginPath();
      r.roundRect(x, y, w, w, rad);
      r.fillStyle = "rgba(255,255,255,0.5)";
      r.fill();
      r.shadowBlur = 0;
      r.strokeStyle = "rgba(255,255,255,0.35)";
      r.lineWidth = 2;
      r.stroke();
      refreshCanvasTexture(r);
    }
    await nextFrame();

    // gradient ring
    if (alive(ring)) {
      const ri = ring.getContext();
      ri.shadowColor = "rgba(255,255,255,0.6)";
      ri.shadowBlur = 14;
      ri.strokeStyle = "rgba(255,255,255,0.75)";
      ri.lineWidth = size * 0.055;
      ri.beginPath();
      ri.arc(size / 2, size / 2, size * 0.32, 0, Math.PI * 2);
      ri.stroke();
      refreshCanvasTexture(ri);
    }
    await nextFrame();

    // 4-point sparkle
    if (alive(spark)) {
      const s = spark.getContext();
      s.shadowColor = "rgba(255,255,255,0.9)";
      s.shadowBlur = 14;
      s.fillStyle = "rgba(255,255,255,0.95)";
      s.beginPath();
      s.moveTo(size / 2, size * 0.06);
      s.lineTo(size * 0.62, size * 0.38);
      s.lineTo(size * 0.94, size / 2);
      s.lineTo(size * 0.62, size * 0.62);
      s.lineTo(size / 2, size * 0.94);
      s.lineTo(size * 0.38, size * 0.62);
      s.lineTo(size * 0.06, size / 2);
      s.lineTo(size * 0.38, size * 0.38);
      s.closePath();
      s.fill();
      refreshCanvasTexture(s);
    }
  })();
}

/* ─────────────────────────── background state ─────────────────────────── */

interface BgState {
  theme: BgTheme;
  gradKey: string;
  root: Phaser.GameObjects.Container;
  grad: Phaser.GameObjects.Image;
  blobs: { img: Phaser.GameObjects.Image }[];
  shapes: { img: Phaser.GameObjects.Image }[];
  stars: Phaser.GameObjects.Image[];
  /** Nova cameo — peeks from the top-right corner, waves on tap. */
  cameo: { root: Phaser.GameObjects.Container; img: Phaser.GameObjects.Image; boopTimer?: Phaser.Time.TimerEvent } | null;
  offReducedMotion?: () => void;
}

const bgState = new WeakMap<Phaser.Scene, BgState>();
const resizeFns = new WeakMap<Phaser.Scene, () => void>();

function startShapeTweens(scene: Phaser.Scene, img: Phaser.GameObjects.Image) {
  scene.tweens.killTweensOf(img);
  if (prefersReducedMotion()) return;
  const bob = Phaser.Math.Between(-22, 22);
  scene.tweens.add({
    targets: img,
    y: (img.y as number) + bob,
    duration: Phaser.Math.Between(2600, 5200),
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
    delay: Phaser.Math.Between(0, 1400),
  });
  scene.tweens.add({
    targets: img,
    angle: Phaser.Math.Between(-32, 32),
    duration: Phaser.Math.Between(6000, 11000),
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
    delay: Phaser.Math.Between(0, 900),
  });
}

/* ─────────────────── Nova cameo (peeks into every lesson scene) ─────────────────── */

/** Realistic great-horned-owl head (matches the shell SVG) — brown dome,
 *  brow-horn tufts, dark-rimmed cream disc, huge amber eyes, dark hooked
 *  beak. No SVG load needed, works offline. */
function texNovaHead(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  // brown head dome
  const head = ctx.createLinearGradient(0, 0, 0, h);
  head.addColorStop(0, "#6b4526");
  head.addColorStop(0.5, NV_COCOA);
  head.addColorStop(1, "#8a5c33");
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.52, w * 0.46, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // feather streaks on the dome
  ctx.fillStyle = "rgba(60,36,18,0.3)";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(cx + i * w * 0.1, h * 0.22, w * 0.02, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // brown brow-horn tufts (the great horned owl's signature)
  const tuft = (dir: 1 | -1) => {
    const tg = ctx.createLinearGradient(0, 0, 0, h * 0.4);
    tg.addColorStop(0, NV_COCOA);
    tg.addColorStop(1, "#4f331b");
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(cx + dir * w * 0.1, h * 0.34);
    ctx.quadraticCurveTo(cx + dir * w * 0.32, h * 0.08, cx + dir * w * 0.24, h * 0.02);
    ctx.quadraticCurveTo(cx + dir * w * 0.16, h * 0.12, cx + dir * w * 0.12, h * 0.34);
    ctx.closePath();
    ctx.fill();
  };
  tuft(1);
  tuft(-1);
  // facial disc — dark rim frame
  ctx.fillStyle = "#4f331b";
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.52, w * 0.36, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b4626";
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.52, w * 0.32, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  // cream lobes
  ctx.fillStyle = "#f0e3c2";
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.16, h * 0.52, w * 0.17, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.16, h * 0.52, w * 0.17, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f4ead0";
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.16, h * 0.52, w * 0.13, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.16, h * 0.52, w * 0.13, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  // "Y" feather lines under the bill
  ctx.strokeStyle = "rgba(122,78,42,0.4)";
  ctx.lineWidth = Math.max(1.2, h * 0.012);
  for (let i = 0; i < 2; i++) {
    const y0 = h * (0.62 + i * 0.055);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.07, y0);
    ctx.lineTo(cx, y0 + h * 0.03);
    ctx.lineTo(cx + w * 0.07, y0);
    ctx.stroke();
  }
  // dark angled brows above the eyes
  ctx.strokeStyle = "#3d2a17";
  ctx.lineWidth = Math.max(2.4, h * 0.028);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.34, h * 0.2);
  ctx.lineTo(cx - w * 0.08, h * 0.32);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.34, h * 0.2);
  ctx.lineTo(cx + w * 0.08, h * 0.32);
  ctx.stroke();
  // eyes — dark orbital ring, huge amber iris, pupil, twin glints
  const eye = (ex: number) => {
    ctx.fillStyle = "#3a2a1c";
    ctx.beginPath();
    ctx.arc(ex, h * 0.46, w * 0.13, 0, Math.PI * 2);
    ctx.fill();
    const ig = ctx.createRadialGradient(ex, h * 0.46, 1, ex, h * 0.46, w * 0.11);
    ig.addColorStop(0, "#ffe37a");
    ig.addColorStop(0.55, "#f4ae3f");
    ig.addColorStop(1, "#b96b0f");
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(ex, h * 0.46, w * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1206";
    ctx.beginPath();
    ctx.arc(ex, h * 0.46, w * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(ex - w * 0.03, h * 0.435, w * 0.024, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(ex + w * 0.026, h * 0.48, w * 0.012, 0, Math.PI * 2);
    ctx.fill();
  };
  eye(cx - w * 0.16);
  eye(cx + w * 0.16);
  // dark hooked beak
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#5a5a50");
  bg.addColorStop(1, "#2a2a24");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.055, h * 0.62);
  ctx.quadraticCurveTo(cx, h * 0.6, cx + w * 0.055, h * 0.62);
  ctx.quadraticCurveTo(cx + w * 0.05, h * 0.7, cx, h * 0.72);
  ctx.quadraticCurveTo(cx - w * 0.05, h * 0.7, cx - w * 0.055, h * 0.62);
  ctx.closePath();
  ctx.fill();
}

/** Build Nova's peek-a-boo cameo in the top-right corner. Returns null when a
 *  scene opts out (NovaScene draws the full character itself). */
function buildNovaCameo(scene: Phaser.Scene): BgState["cameo"] {
  const k = "nv-cameo-head";
  if (!scene.textures.exists(k)) {
    const tex = scene.textures.createCanvas(k, 120, 110)!;
    texNovaHead(tex.getContext(), 120, 110);
    tex.refresh();
  }
  const img = scene.add.image(0, 0, k).setDepth(-6);
  const root = scene.add.container(0, 0, [img]).setDepth(-5);
  root.setSize(90, 84);
  root.setInteractive({ useHandCursor: true });
  // #1036 — the silly 3-tap sneeze easter egg is a nursery flourish: older kids
  // get a calm tap response instead of confetti everywhere.
  const mature = matureRender();
  // Silly easter egg: 3 quick taps → Nova SNEEZES confetti everywhere.
  let sneezes = 0;
  let sneezeTimer: Phaser.Time.TimerEvent | null = null;
  root.on("pointerdown", () => {
    scene.tweens.add({ targets: root, scale: 1.18, duration: 120, yoyo: true, ease: "Back.easeOut" });
    if (mature) return; // older register: no confetti sneeze, no sparkle shower
    sneezes += 1;
    if (sneezeTimer) sneezeTimer.remove();
    sneezeTimer = scene.time.delayedCall(1500, () => {
      sneezes = 0;
    });
    if (sneezes >= 3) {
      sneezes = 0;
      // ACHOO! — a confetti blast + a little sneeze puff
      for (let i = 0; i < 12; i++) {
        const s = scene.add.image(0, 0, "nv-shape-spark").setDepth(-5).setScale(0.5).setTint([0xffd166, 0xff8fa3, 0x4cc9f0, 0x2ec4b6][i % 4]);
        s.setPosition(root.x + Phaser.Math.Between(-44, 44), root.y + Phaser.Math.Between(-36, 20));
        scene.tweens.add({ targets: s, alpha: 0, scale: 1.1, y: s.y + 30, duration: 700, onComplete: () => s.destroy() });
      }
      const achoo = scene.add
        .text(root.x, root.y - 26, "Achoo! 💨", txt(15, "#ffffff", { bold: true, shadow: false }))
        .setDepth(-4)
        .setOrigin(0.5);
      scene.tweens.add({ targets: achoo, y: achoo.y - 24, alpha: 0, duration: 900, onComplete: () => achoo.destroy() });
      return;
    }
    // a tiny sparkle burst so the tap feels rewarded (no speech — lessons talk)
    for (let i = 0; i < 3; i++) {
      const s = scene.add.image(0, 0, "nv-shape-spark").setDepth(-5).setScale(0.5).setTint(0xffd166);
      s.setPosition(root.x + Phaser.Math.Between(-34, 34), root.y + Phaser.Math.Between(-30, 30));
      scene.tweens.add({ targets: s, alpha: 0, scale: 0.9, y: s.y - 18, duration: 500, onComplete: () => s.destroy() });
    }
  });
  // Ambient cameo motion (idle float + periodic peek-a-boo) is started by
  // startBgMotion() so it can be killed/restarted live when the reduced-motion
  // toggle flips mid-scene (#1440).
  return { root, img };
}

/** Start or stop the cameo's ambient motion. Safe to call repeatedly — it
 *  kills any existing float/boop first, then re-creates when motion is on. */
function startCameoMotion(scene: Phaser.Scene, cameo: NonNullable<BgState["cameo"]>) {
  scene.tweens.killTweensOf(cameo.img);
  scene.tweens.killTweensOf(cameo.root);
  cameo.boopTimer?.remove();
  cameo.boopTimer = undefined;
  if (prefersReducedMotion()) return;

  scene.tweens.add({ targets: cameo.img, y: cameo.img.y + 6, duration: 2600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  // periodic peek-a-boo: rise, wiggle, sink (guarded so a stale timer never
  // tweens a destroyed cameo after the scene shut down)
  const boop = () => {
    if (!scene.scene.isActive()) return;
    if (prefersReducedMotion()) return;
    scene.tweens.add({
      targets: cameo.root,
      y: cameo.root.y - 10,
      angle: 4,
      duration: 400,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
      onComplete: () => {
        cameo.boopTimer = scene.time.delayedCall(Phaser.Math.Between(11000, 17000), boop);
      },
    });
  };
  cameo.boopTimer = scene.time.delayedCall(Phaser.Math.Between(6000, 10000), boop);
}

/** Top-right corner placement — below the notch, and clear of the garden grid
 *  (which starts at ~132+SAT) so Nova never covers a growing plant. */
function positionNovaCameo(scene: Phaser.Scene, cameo: NonNullable<BgState["cameo"]>) {
  const { width } = scene.scale;
  const head = cameo.img;
  const s = Phaser.Math.Clamp(width / 420, 0.78, 1.15);
  cameo.root.setScale(s);
  const hw = head.width * s / 2;
  const hh = head.height * s;
  // head's bottom edge lands at 118+SAT — 14px above the garden grid (132+SAT)
  cameo.root.setPosition(width - hw - 8, 118 + SAT() - hh / 2);
}

/** (Re)start every ambient background motion for a scene. Kills first so a
 *  reduced-motion toggle mid-scene takes effect immediately (#1440). */
function startBgMotion(scene: Phaser.Scene, state: BgState) {
  scene.tweens.killTweensOf(state.blobs.map((b) => b.img));
  scene.tweens.killTweensOf(state.shapes.map((s) => s.img));
  scene.tweens.killTweensOf(state.stars);
  if (state.cameo) startCameoMotion(scene, state.cameo);

  if (prefersReducedMotion()) return;

  state.blobs.forEach((b, i) => {
    const img = b.img;
    scene.tweens.add({
      targets: img,
      x: (img.x as number) + Phaser.Math.Between(-70, 70),
      y: (img.y as number) + Phaser.Math.Between(-60, 60),
      duration: Phaser.Math.Between(10000, 19000),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: i * 700,
    });
    scene.tweens.add({
      targets: img,
      scale: (img.scale as number) * Phaser.Math.FloatBetween(0.86, 1.22),
      duration: Phaser.Math.Between(6000, 12000),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: i * 700,
    });
  });

  state.shapes.forEach((s) => startShapeTweens(scene, s.img));

  state.stars.forEach((img) => {
    scene.tweens.add({
      targets: img,
      alpha: Phaser.Math.FloatBetween(0.02, 0.08),
      scale: img.scale * Phaser.Math.FloatBetween(0.7, 1.4),
      duration: Phaser.Math.Between(800, 1800),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: Phaser.Math.Between(0, 1500),
    });
  });
}

function buildBg(scene: Phaser.Scene, theme: BgTheme): BgState {
  ensureShapeTex(scene);
  const pal = PALETTES[theme];
  const { width, height } = scene.scale;

  const root = scene.add.container(0, 0).setDepth(-10); // backdrop — scenes layer decor/content above

  const gradKey = `nv-grad-${scene.scene.key}`;
  const gradTex = makeGradient(scene, gradKey, width, height, pal.top, pal.bottom);
  const grad = scene.add.image(0, 0, gradTex).setOrigin(0, 0).setDisplaySize(width, height);

  // Aurora blobs — big soft glows drifting slowly (parallax depth)
  const blobs: BgState["blobs"] = pal.blobs.map((color) => {
    const img = scene.add.image(
      Phaser.Math.Between(width * 0.08, width * 0.92),
      Phaser.Math.Between(height * 0.12, height * 0.85),
      getBlobTex(scene, color)
    );
    img.setAlpha(0.55);
    img.setScale(Phaser.Math.FloatBetween(0.9, 1.7) * Phaser.Math.Clamp(width / 520, 0.65, 1.8));
    return { img };
  });

  // Glassy floating shapes — soft circles, rounded squares, rings, sparkles.
  // #1036 — the candy sparkle stays in the nursery register; older kids get a
  // calmer field (no 4-point sparkles, fewer shapes overall).
  const mature = matureRender();
  const shapeKinds = mature
    ? ["nv-shape-circle", "nv-shape-round", "nv-shape-ring"]
    : ["nv-shape-circle", "nv-shape-round", "nv-shape-ring", "nv-shape-spark"];
  const baseCount = Phaser.Math.Clamp(Math.round((width * height) / 52000), 8, 16);
  const count = mature ? Math.max(6, Math.round(baseCount * 0.6)) : baseCount;
  const shapes: BgState["shapes"] = [];
  for (let i = 0; i < count; i++) {
    const img = scene.add.image(
      Phaser.Math.Between(14, Math.max(15, width - 14)),
      Phaser.Math.Between(14, Math.max(15, height - 14)),
      shapeKinds[i % shapeKinds.length]
    );
    img.setTint(pal.shape);
    img.setAlpha(Phaser.Math.FloatBetween(0.12, 0.42));
    img.setScale(Phaser.Math.FloatBetween(0.5, 1.6));
    shapes.push({ img });
  }

  // Twinkling stars (night / space / magic)
  const stars: Phaser.GameObjects.Image[] = [];
  if (pal.stars) {
    const starCount = mature ? 8 : 16;
    for (let i = 0; i < starCount; i++) {
      const img = scene.add.image(
        Phaser.Math.Between(10, Math.max(11, width - 10)),
        Phaser.Math.Between(8, Math.max(9, height - 8)),
        "nv-shape-spark"
      );
      img.setTint(0xffffff);
      img.setAlpha(Phaser.Math.FloatBetween(0.1, 0.35));
      img.setScale(Phaser.Math.FloatBetween(0.3, 0.85));
      stars.push(img);
    }
  }

  root.add([grad, ...blobs.map((b) => b.img), ...shapes.map((s) => s.img), ...stars]);

  // Nova peeks from the top-right corner of every lesson scene.
  const cameo = buildNovaCameo(scene);
  if (cameo) positionNovaCameo(scene, cameo);

  const state: BgState = { theme, gradKey, root, grad, blobs, shapes, stars, cameo };
  startBgMotion(scene, state);
  // Live effect: a kid can flip "calm mode" from the in-game HUD without
  // restarting the scene — kill/restart ambient motion immediately.
  state.offReducedMotion = onReducedMotionChange(() => startBgMotion(scene, state));

  // #3122 — a rotation fires RESIZE in a burst (multiple events per frame);
  // rAF-coalesce so the (expensive) gradient re-rasterize + motion restart runs
  // at most once per animation frame with the final dimensions of the burst.
  let resizeRaf = 0;
  const applyResize = () => {
    resizeRaf = 0;
    const { width: w, height: h } = scene.scale;
    const newTex = makeGradient(scene, gradKey, w, h, pal.top, pal.bottom);
    state.grad.setTexture(gradKey).setDisplaySize(w, h);
    state.blobs.forEach((b) => {
      b.img.x = Phaser.Math.Clamp(b.img.x, w * 0.05, w * 0.95);
      b.img.y = Phaser.Math.Clamp(b.img.y, h * 0.1, h * 0.9);
    });
    state.shapes.forEach((s) => {
      s.img.x = Phaser.Math.Clamp(s.img.x, 10, Math.max(11, w - 10));
      s.img.y = Phaser.Math.Clamp(s.img.y, 10, Math.max(11, h - 10));
    });
    state.stars.forEach((st) => {
      st.x = Phaser.Math.Clamp(st.x, 10, Math.max(11, w - 10));
      st.y = Phaser.Math.Clamp(st.y, 8, Math.max(9, h - 8));
    });
    if (state.cameo) positionNovaCameo(scene, state.cameo);
    startBgMotion(scene, state);
  };
  const onResize = () => {
    if (resizeRaf !== 0) return; // already scheduled this frame
    resizeRaf = requestAnimationFrame(() => applyResize());
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  resizeFns.set(scene, onResize);

  // #1746 — the reduced-motion callback lives in a module-level Set and the
  // resize listener lives on the game-level ScaleManager, so BOTH must be
  // released on DESTROY too (a game teardown destroys scenes without a stop).
  // Same SHUTDOWN+DESTROY convention as sceneLifecycle.ts / NovaScene; `once`
  // fires each event at most once and the tornDown guard makes a double-fire a
  // no-op (offReducedMotion is itself idempotent after #1746).
  let tornDown = false;
  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    state.offReducedMotion?.();
    if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf);
    resizeRaf = 0;
    const rf = resizeFns.get(scene);
    if (rf) scene.scale.off(Phaser.Scale.Events.RESIZE, rf);
    scene.tweens.killTweensOf(state.blobs.map((b) => b.img));
    scene.tweens.killTweensOf(state.shapes.map((s) => s.img));
    scene.tweens.killTweensOf(state.stars);
    if (state.cameo) {
      state.cameo.boopTimer?.remove();
      scene.tweens.killTweensOf(state.cameo.root);
      scene.tweens.killTweensOf(state.cameo.img);
      state.cameo.root.destroy();
    }
    if (scene.textures.exists(gradKey)) scene.textures.remove(gradKey);
    bgState.delete(scene);
    resizeFns.delete(scene);
    state.root.destroy();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
  scene.events.once(Phaser.Scenes.Events.DESTROY, teardown);

  return state;
}

/** Draw (or re-draw) a modern animated background for a game scene. */
export function gameBackground(scene: Phaser.Scene, theme: BgTheme) {
  const prev = bgState.get(scene);
  if (prev) {
    if (prev.theme === theme) return;
    const rf = resizeFns.get(scene);
    if (rf) scene.scale.off(Phaser.Scale.Events.RESIZE, rf);
    prev.offReducedMotion?.();
    scene.tweens.killTweensOf(prev.blobs.map((b) => b.img));
    scene.tweens.killTweensOf(prev.shapes.map((s) => s.img));
    scene.tweens.killTweensOf(prev.stars);
    if (prev.cameo) {
      prev.cameo.boopTimer?.remove();
      scene.tweens.killTweensOf(prev.cameo.root);
      scene.tweens.killTweensOf(prev.cameo.img);
      prev.cameo.root.destroy();
    }
    if (scene.textures.exists(prev.gradKey)) scene.textures.remove(prev.gradKey);
    prev.root.destroy();
    bgState.delete(scene);
    resizeFns.delete(scene);
  }
  const st = buildBg(scene, theme);
  bgState.set(scene, st);
}
