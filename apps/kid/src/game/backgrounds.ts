import Phaser from "phaser";
import { SAT } from "./safeArea";
import { txt, NV_COCOA } from "./ui";
import { prefersReducedMotion, onReducedMotionChange } from "./reducedMotion";

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

/* ─────────────────────── smooth gradient texture ─────────────────────── */

function makeGradient(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  top: number,
  bottom: number
): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
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

function getBlobTex(scene: Phaser.Scene, color: number): Phaser.Textures.CanvasTexture {
  let tex = blobCache.get(color);
  if (tex && scene.textures.exists(tex.key)) return tex;
  const key = `blob-${color.toString(16)}`;
  const size = 512;
  if (!scene.textures.exists(key)) scene.textures.createCanvas(key, size, size);
  tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  const ctx = tex.getContext();
  const [r, g, b] = hexToRgb(color);
  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.2)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  blobCache.set(color, tex);
  return tex;
}

/** White shape textures — reuse one canvas each, tinted per theme. */
function ensureShapeTex(scene: Phaser.Scene) {
  if (scene.textures.exists("nv-shape-circle")) return;
  const make = (key: string, draw: (ctx: CanvasRenderingContext2D, s: number) => void) => {
    const size = 128;
    scene.textures.createCanvas(key, size, size)!;
    const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext();
    draw(ctx, size);
    tex.refresh();
  };
  // soft glowing dot
  make("nv-shape-circle", (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.6, "rgba(255,255,255,0.3)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  // glassy rounded square with soft glow
  make("nv-shape-round", (ctx, s) => {
    const x = s * 0.22, y = s * 0.22, w = s * 0.56, r = s * 0.14;
    ctx.shadowColor = "rgba(255,255,255,0.55)";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(x, y, w, w, r);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  // gradient ring
  make("nv-shape-ring", (ctx, s) => {
    ctx.shadowColor = "rgba(255,255,255,0.6)";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = s * 0.055;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  });
  // 4-point sparkle
  make("nv-shape-spark", (ctx, s) => {
    ctx.shadowColor = "rgba(255,255,255,0.9)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.06);
    ctx.lineTo(s * 0.62, s * 0.38);
    ctx.lineTo(s * 0.94, s / 2);
    ctx.lineTo(s * 0.62, s * 0.62);
    ctx.lineTo(s / 2, s * 0.94);
    ctx.lineTo(s * 0.38, s * 0.62);
    ctx.lineTo(s * 0.06, s / 2);
    ctx.lineTo(s * 0.38, s * 0.38);
    ctx.closePath();
    ctx.fill();
  });
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
  // Silly easter egg: 3 quick taps → Nova SNEEZES confetti everywhere.
  let sneezes = 0;
  let sneezeTimer: Phaser.Time.TimerEvent | null = null;
  root.on("pointerdown", () => {
    scene.tweens.add({ targets: root, scale: 1.18, duration: 120, yoyo: true, ease: "Back.easeOut" });
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

  // Glassy floating shapes — soft circles, rounded squares, rings, sparkles
  const shapeKinds = ["nv-shape-circle", "nv-shape-round", "nv-shape-ring", "nv-shape-spark"];
  const count = Phaser.Math.Clamp(Math.round((width * height) / 52000), 8, 16);
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
    for (let i = 0; i < 16; i++) {
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

  const onResize = () => {
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
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  resizeFns.set(scene, onResize);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    state.offReducedMotion?.();
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
  });

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
