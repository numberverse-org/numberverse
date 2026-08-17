import Phaser from "phaser";
import { correctCelebrate } from "./celebrate";
import { assetIcon } from "./svgAssets";
import { starPop } from "./audio";
import { enableSwipeToAnswer } from "./gestures";
import { matureRender } from "./renderBand"; // #1040/#1035 — older-kid font stack
import { prefersReducedMotion } from "./reducedMotion";

/**
 * Modern 2026-style game UI: soft gradient buttons with glass edges,
 * soft shadows, rounded typography — no flat fills or hard outlines.
 */

/* ─────────────────────────── typography ─────────────────────────── */

export interface TxtOpts {
  bold?: boolean;
  align?: "left" | "center" | "right";
  wrap?: number;
  /** Set false to drop the soft drop-shadow (for tiny labels). */
  shadow?: boolean;
  /** Add a dark outline around the glyphs — guarantees readability on ANY
   *  background (some game backgrounds are bright orange/blue/pink where a
   *  plain soft color would vanish). */
  outline?: boolean;
}

/* #1035 — typography scales with the kid's band. Younger bands keep the round,
 * cheerful Baloo 2 display face; bands 5+ (older kids) swap to Nunito as the
 * lead face so lessons stop looking like toddler toys. Bangla still falls
 * through to Noto Sans Bengali in both stacks. */
const FONT_YOUNG = "'Baloo 2', 'Noto Sans Bengali', 'Nunito', system-ui, 'Segoe UI', sans-serif";
const FONT_MATURE = "'Nunito', 'Noto Sans Bengali', system-ui, 'Segoe UI', sans-serif";
function fontStack(): string {
  return matureRender() ? FONT_MATURE : FONT_YOUNG;
}

/** Modern text style: rounded font stack, 1px tracking, soft drop shadow. */
export function txt(size: number, color: string, opts: TxtOpts = {}): Phaser.Types.GameObjects.Text.TextStyle {
  const st: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: fontStack(),
    fontSize: `${size}px`,
    color,
    fontStyle: opts.bold ? "800" : "600",
    align: opts.align ?? "center",
    letterSpacing: 0, // keep 0 — letter-spacing breaks Bangla complex-script shaping
    wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
    shadow:
      opts.shadow === false
        ? undefined
        : {
            offsetX: 0,
            offsetY: size >= 40 ? 5 : 3,
            color: "rgba(3,12,34,0.45)",
            blur: size >= 40 ? 14 : 8,
            stroke: true,
            fill: true,
          },
  };
  if (opts.outline) {
    st.stroke = "rgba(4,14,36,0.85)";
    st.strokeThickness = Math.max(3, Math.round(size / 8));
  }
  return st;
}

/**
 * High-contrast instruction / question text — readable on ANY game background.
 * Near-white fill + a real dark stroke, so it stays legible even on the
 * bright orange (kitchen/sunset/desert), bright blue (sky/ocean) and pink
 * (floral/candy) backgrounds. Use for all "Tap the…" / "Find the…" prompts.
 */
export function promptTxt(size: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: fontStack(),
    fontSize: `${size}px`,
    color: "#ffffff",
    fontStyle: "800",
    align: "center",
    letterSpacing: 0,
    // iOS fix: long Bangla/English prompts (e.g. CountPop's instruction) ran
    // off the right edge of a 390px iPhone. Word-wrap to 340px — only affects
    // lines WIDER than that; short prompts are untouched. Centered + wrapped
    // = never clips the edge, no matter how long the question is.
    wordWrap: { width: 340, useAdvancedWrap: true },
    stroke: "rgba(4,14,36,0.9)",
    strokeThickness: Math.max(3, Math.round(size / 6)),
    shadow: {
      offsetX: 0,
      offsetY: 2,
      color: "rgba(3,12,34,0.7)",
      blur: 6,
      stroke: true,
      fill: true,
    },
  };
}

/** The BIG question text — the thing a kid must notice and understand. 34px
 *  warm white with a heavy navy stroke + soft glow, wrapped to 340px so long
 *  Bangla questions still fit on a phone. Use this (not promptTxt) for the
 *  line that IS the question ("How many in all?", "Find the letter…"). */
export function questionTxt(): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: fontStack(),
    fontSize: "34px",
    color: "#fff8e1",
    fontStyle: "800",
    align: "center",
    letterSpacing: 0, // keep 0 — letter-spacing breaks Bangla complex-script shaping
    wordWrap: { width: 340, useAdvancedWrap: true },
    stroke: "#1d3557",
    strokeThickness: 7,
    shadow: {
      offsetX: 0,
      offsetY: 3,
      color: "rgba(11,22,44,0.85)",
      blur: 8,
      stroke: true,
      fill: true,
    },
  };
}

/* ─────────────────────── app design tokens (#591) ───────────────────────
   Centralized kid-app palette. Scenes/styles reference these named tokens
   instead of scattering hex literals — the oracle's visual-polish guard
   flags any non-palette hex used ≥15×, so new colors must become tokens here
   (and the matching --nv-* var in styles.css :root). Mirrors the parent
   app's --nv-* token set, so both apps share the same named colors. */
export const NV_GOLD = "#ffd166";    // sunshine gold — stars, coins, highlights
export const NV_SKY = "#4cc9f0";     // sky blue — links, playful accents
export const NV_GREEN = "#4ade80";   // success green — correct, growth
export const NV_PINK = "#ff8fa3";    // soft pink — hearts, candy, cute
export const NV_BROWN = "#3b2418";   // dark cocoa — text on light fills
export const NV_NAVY = "#0b2545";    // deep navy — dark surfaces
export const NV_GRAY = "#8d99ae";    // cool gray — muted/secondary
export const NV_INK = "#3b3b3b";     // near-black ink — body text
export const NV_ORANGE = "#ffb35c";  // warm orange — energy
export const NV_RED = "#f87171";     // soft red — errors/warnings
export const NV_MINT = "#7ee8d2";    // mint — bubbles, success tints
export const NV_COCOA = "#7a4e2a";   // cocoa brown — wood, fur, earth

/* ─────────────────────────── button styles ─────────────────────────── */

export interface BtnStyle {
  top: number;
  bottom: number;
  text: string; // label css color
}

export const BTN_PRIMARY = { top: 0x3ee6ff, bottom: 0x0c9ce2, text: "#052e3f" };
export const BTN_NEUTRAL = { top: 0xeaf0f7, bottom: 0xa4b4c8, text: "#1e293b" };
export const BTN_CORRECT = { top: Phaser.Display.Color.HexStringToColor(NV_GREEN).color, bottom: 0x12a150, text: "#052e16" };
export const BTN_ORANGE = { top: Phaser.Display.Color.HexStringToColor(NV_ORANGE).color, bottom: 0xef7a18, text: "#4a2200" };
export const BTN_PURPLE = { top: 0xc4b5fd, bottom: 0x7c3aed, text: "#1b0b3f" };
export const BTN_RED = { top: Phaser.Display.Color.HexStringToColor(NV_PINK).color, bottom: 0xe11d48, text: "#4c0519" };

/** WCAG relative luminance of an 0xRRGGBB color (0..1). */
function relLum(hex: number): number {
  const c = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * c((hex >> 16) & 255) + 0.7152 * c((hex >> 8) & 255) + 0.0722 * c(hex & 255);
}

/** WCAG contrast ratio between two relative luminances. */
function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** Build a button style from an arbitrary hex color (lighten top / deepen bottom). */
export function btnFromColor(hex: number): BtnStyle {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const lighten = (v: number, f: number) => Math.round(v + (255 - v) * f);
  const darken = (v: number, f: number) => Math.round(v * f);
  const top = (lighten(r, 0.35) << 16) | (lighten(g, 0.35) << 8) | lighten(b, 0.35);
  const bottom = (darken(r, 0.55) << 16) | (darken(g, 0.55) << 8) | darken(b, 0.55);
  // Pick the label color by WCAG contrast against the face's MID tone (the
  // `mix(top,bottom,0.45)` the label actually sits on) — a single `lum > 150`
  // sent white text onto green/cyan/teal mid-tones and blended into the face.
  const midLum = relLum(mix(top, bottom, 0.45));
  const dark = "#2b1500", white = "#ffffff";
  const text = contrastRatio(midLum, relLum(0x2b1500)) >= contrastRatio(midLum, relLum(0xffffff)) ? dark : white;
  return { top, bottom, text };
}

/** Small white ✓ badge added to an answer button on correct. Gives a
 *  SHAPE backup to the green flash (#1363) so color-only vision still sees
 *  which answer was right. */
function addCorrectBadge(scene: Phaser.Scene, c: Phaser.GameObjects.Container, x: number, y: number, r: number) {
  const prev = c.getData("nv-correct-badge") as Phaser.GameObjects.Container | undefined;
  if (prev && prev.active) prev.destroy();
  const badge = scene.add.container(x, y).setDepth(30);
  badge.add(scene.add.circle(0, 0, r, 0xffffff, 1).setStrokeStyle(2, 0x0b2545, 1));
  badge.add(scene.add.text(0, 0, "✓", { fontSize: `${Math.round(r * 1.25)}px`, color: "#0b2545", fontStyle: "bold" }).setOrigin(0.5));
  c.add(badge);
  c.setData("nv-correct-badge", badge);
  scene.tweens.add({ targets: badge, scale: 1.35, duration: 180, yoyo: true, ease: "Back.easeOut" });
}

/* ─────────────────────────── face textures ─────────────────────────── */

const faceCache = new Map<string, string>();

function rgb(color: number, a = 1): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${a})`;
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    ((Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)) >>>
    0
  );
}

/**
 * Cached radial-gradient face with a soft drop shadow, top sheen, glass
 * edge ring and bottom depth. Rendered at 2× so it stays crisp on retina.
 */
function faceTex(scene: Phaser.Scene, radius: number, top: number, bottom: number): string {
  const r = Math.max(14, Math.round(radius));
  const key = `nv-face-${r}-${top.toString(16)}-${bottom.toString(16)}`;
  const hit = faceCache.get(key);
  if (hit && scene.textures.exists(hit)) return hit;
  const d = r * 2;
  const s = Math.max(4, Math.round(r * 0.18));
  const size = d + s * 2;
  const tex = scene.textures.createCanvas(key, size * 2, size * 2)!;
  const ctx = tex.getContext();
  const S = size * 2;
  const cx = S / 2, cy = S / 2, R = r * 2;
  ctx.clearRect(0, 0, S, S);
  // soft drop shadow (offset slightly down)
  let g = ctx.createRadialGradient(cx, cy + R * 0.18, R * 0.45, cx, cy + R * 0.18, R * 1.15);
  g.addColorStop(0, "rgba(3,10,28,0.5)");
  g.addColorStop(0.7, "rgba(3,10,28,0.2)");
  g.addColorStop(1, "rgba(3,10,28,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy + R * 0.18, R * 1.15, 0, Math.PI * 2);
  ctx.fill();
  // radial gradient face (light top-left → deep bottom-right)
  g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.34, R * 0.1, cx, cy, R * 1.02);
  g.addColorStop(0, rgb(top));
  g.addColorStop(0.5, rgb(mix(top, bottom, 0.45)));
  g.addColorStop(1, rgb(bottom));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  // top-left sheen
  g = ctx.createRadialGradient(cx - R * 0.34, cy - R * 0.38, 0, cx - R * 0.34, cy - R * 0.38, R * 0.75);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  // glass edge ring
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(2, R * 0.045);
  ctx.beginPath();
  ctx.arc(cx, cy, R - ctx.lineWidth, 0, Math.PI * 2);
  ctx.stroke();
  tex.refresh();
  faceCache.set(key, key);
  return key;
}

/** Same as faceTex but rounded-rectangle (for word cards). */
function cardFaceTex(scene: Phaser.Scene, w: number, h: number, top: number, bottom: number): string {
  const W = Math.max(30, Math.round(w));
  const H = Math.max(24, Math.round(h));
  const key = `nv-card-${W}-${H}-${top.toString(16)}-${bottom.toString(16)}`;
  const hit = faceCache.get(key);
  if (hit && scene.textures.exists(hit)) return hit;
  const tex = scene.textures.createCanvas(key, W * 2, H * 2)!;
  const ctx = tex.getContext();
  const X = W, Y = H;
  const rad = Math.max(10, Math.round(Math.min(W, H) * 0.24));
  ctx.clearRect(0, 0, X * 2, Y * 2);
  // drop shadow
  ctx.shadowColor = "rgba(3,10,28,0.45)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.beginPath();
  ctx.roundRect(0, 0, X * 2, Y * 2, rad * 2);
  ctx.fillStyle = rgb(bottom);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  // gradient body
  const g = ctx.createLinearGradient(0, 0, 0, Y * 2);
  g.addColorStop(0, rgb(top));
  g.addColorStop(1, rgb(bottom));
  ctx.beginPath();
  ctx.roundRect(0, 0, X * 2, Y * 2, rad * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // top sheen
  ctx.beginPath();
  ctx.roundRect(0, 0, X * 2, Y * 0.9, rad * 2);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fill();
  // glass edge
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(1, 1, X * 2 - 2, Y * 2 - 2, rad * 2);
  ctx.stroke();
  tex.refresh();
  faceCache.set(key, key);
  return key;
}

/* ─────────────────────────── button factory ─────────────────────────── */

export interface ModernBtnApi {
  setCorrect(): void;
  setDisabled(): void;
  setLabel(t: string): void;
}

export interface ModernBtnOpts {
  labelSize?: number;
  labelColor?: string;
  /** Wrap label text to this pixel width (for long Bangla answers). */
  wrap?: number;
  /** Render a vector icon from the SVG library instead of a text label. */
  icon?: { key: string; size: number; y?: number; scale?: number };
}

/** Build a modern circular answer button. Returns the interactive Container. */
export function modernAnswerButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  label: string,
  style: BtnStyle = BTN_PRIMARY,
  opts: ModernBtnOpts = {}
): Phaser.GameObjects.Container {
  const r = Math.max(14, Math.round(radius));
  const face = scene.add.image(0, 0, faceTex(scene, r, style.top, style.bottom)).setDisplaySize(r * 2, r * 2);
  const size = opts.labelSize ?? Math.max(16, Math.round(r * 0.62));
  let labelText: Phaser.GameObjects.Text | null = null;
  const children: Phaser.GameObjects.GameObject[] = [face];
  if (opts.icon) {
    children.push(assetIcon(scene, opts.icon.key, opts.icon.size, { y: opts.icon.y, scale: opts.icon.scale }));
  } else {
    labelText = scene.add
      .text(0, 0, label, {
        ...txt(size, opts.labelColor ?? style.text, { bold: true, shadow: false }),
        wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
      })
      .setOrigin(0.5);
    children.push(labelText);
  }
  // kid gesture: swipe-toward-an-answer works in every game automatically
  enableSwipeToAnswer(scene);
  const c = scene.add.container(x, y, children);
  c.setSize(r * 2, r * 2);
  c.setInteractive({ useHandCursor: true });

  const api: ModernBtnApi = {
    setCorrect() {
      face.setTexture(faceTex(scene, r, BTN_CORRECT.top, BTN_CORRECT.bottom)).setDisplaySize(r * 2, r * 2);
      // #783 — the correct-answer pop honours reduced motion: the button still
      // recolors (and flashes) instantly, it just doesn't bounce.
      if (!prefersReducedMotion()) {
        scene.tweens.add({ targets: c, scale: 1.14, duration: 130, yoyo: true, ease: "Back.easeOut" });
      }
      scene.tweens.add({ targets: face, alpha: 0.35, duration: 60, yoyo: true, repeat: 1 });
      addCorrectBadge(scene, c, Math.round(r * 0.7), -Math.round(r * 0.7), Math.max(9, Math.round(r * 0.3)));
    },
    setDisabled() {
      c.disableInteractive();
      c.setAlpha(0.45);
    },
    setLabel(t: string) {
      if (labelText) labelText.setText(t);
    },
  };
  c.setData("nv-btn", api);
  c.setData("nv-label", label); // #785/#1005 — keyboard/SR answer label

  // satisfying press dip
  c.on("pointerdown", () => {
    scene.tweens.add({ targets: c, scale: 0.94, duration: 90, yoyo: true, ease: "Sine.easeInOut" });
  });
  return c;
}

/** Build a modern rounded-rect card button (for word cards). */
export function modernCardButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  style: BtnStyle = BTN_NEUTRAL,
  labelSize = 24,
  wrap?: number,
  optsIcon?: ModernBtnOpts["icon"]
): Phaser.GameObjects.Container {
  const face = scene.add.image(0, 0, cardFaceTex(scene, w, h, style.top, style.bottom)).setDisplaySize(w, h);
  let labelText: Phaser.GameObjects.Text | null = null;
  const children: Phaser.GameObjects.GameObject[] = [face];
  if (optsIcon) {
    children.push(assetIcon(scene, optsIcon.key, optsIcon.size, { y: optsIcon.y, scale: optsIcon.scale }));
  } else {
    labelText = scene.add
      .text(0, 0, label, wrap ? { ...txt(labelSize, style.text, { bold: true, shadow: false }), wordWrap: { width: wrap }, align: "center", lineSpacing: 0 } : txt(labelSize, style.text, { bold: true, shadow: false }))
      .setOrigin(0.5);
    children.push(labelText);
  }
  // kid gesture: swipe-toward-an-answer works in every game automatically
  enableSwipeToAnswer(scene);
  const c = scene.add.container(x, y, children);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });

  const api: ModernBtnApi = {
    setCorrect() {
      face.setTexture(cardFaceTex(scene, w, h, BTN_CORRECT.top, BTN_CORRECT.bottom)).setDisplaySize(w, h);
      // #783 — reduced motion: recolors to green instantly, doesn't bounce.
      if (!prefersReducedMotion()) {
        scene.tweens.add({ targets: c, scale: 1.08, duration: 130, yoyo: true, ease: "Back.easeOut" });
      }
      const badgeR = Math.max(10, Math.round(Math.min(w, h) * 0.16));
      addCorrectBadge(scene, c, Math.round(w / 2 - badgeR - 2), Math.round(-h / 2 + badgeR + 2), badgeR);
    },
    setDisabled() {
      c.disableInteractive();
      c.setAlpha(0.45);
    },
    setLabel(t: string) {
      if (labelText) labelText.setText(t);
    },
  };
  c.setData("nv-btn", api);
  c.setData("nv-label", label); // #785/#1005 — keyboard/SR answer label
  c.on("pointerdown", () => {
    scene.tweens.add({ targets: c, scale: 0.95, duration: 90, yoyo: true, ease: "Sine.easeInOut" });
  });
  return c;
}

/** Wrap a prompt/question text to the canvas width (minus breathing room) so
 *  long Bangla/English questions NEVER overflow the right edge on a phone
 *  (e.g. CountPop's Bangla instruction is ~460px wide on a 390px iPhone).
 *  Call this in layout() too so rotate/resize re-wraps. */
export function wrapPrompt(scene: Phaser.Scene, t: Phaser.GameObjects.Text, pad = 24) {
  t.setWordWrapWidth(Math.max(140, scene.scale.width - pad), true);
  t.setAlign("center");
}

/* ─────────────────────── #1324 — card pooling (GC churn) ───────────────────────
 * Round-based scenes destroy + re-create their option cards every question
 * (~1s apart) — a steady stream of small allocations that shows up as frame
 * jank on low-end phones. cardPool() keeps a fixed pool of modernCardButton
 * containers and RECYCLES them: claim() re-labels + repositions + re-enables,
 * release() hides + disables. The pool grows only to the row's high-water
 * mark, then stops allocating entirely — steady-state rounds make ZERO new
 * GameObjects. The texture (cardFaceTex) was already cached; this kills the
 * per-round object churn that remained. */

export interface CardPool {
  /** Claim a card for a new option (reuses a pooled one, or grows the pool). */
  claim(label: string, x: number, y: number, w: number, h: number, style?: BtnStyle, labelSize?: number): Phaser.GameObjects.Container;
  /** Return a card to the pool (hidden + non-interactive, ready for reuse). */
  release(c: Phaser.GameObjects.Container): void;
  /** Release a whole row of cards at once. */
  releaseAll(cards: Phaser.GameObjects.Container[]): void;
}

export function cardPool(
  scene: Phaser.Scene,
  w: number,
  h: number,
  style: BtnStyle = BTN_NEUTRAL,
  labelSize = 30
): CardPool {
  const free: Phaser.GameObjects.Container[] = [];
  const grow = (): Phaser.GameObjects.Container => {
    const c = modernCardButton(scene, 0, -1000, w, h, "", style, labelSize);
    c.setData("nv-pooled", true);
    c.setVisible(false).disableInteractive();
    free.push(c);
    return c;
  };
  return {
    claim(label, x, y, ww = w, hh = h, s = style, ls = labelSize) {
      const c = free.pop() ?? grow();
      const api = c.getData("nv-btn") as ModernBtnApi | undefined;
      // Same pool geometry → just relabel; a caller with a different w/h/style
      // should build its own pool (keeps this path allocation-free).
      api?.setLabel(label);
      if (ww !== w || hh !== h || s !== style || ls !== labelSize) {
        c.destroy();
        return modernCardButton(scene, x, y, ww, hh, label, s, ls);
      }
      c.setPosition(x, y);
      c.setVisible(true);
      c.setInteractive({ useHandCursor: true });
      return c;
    },
    release(c) {
      if (c.getData("nv-pooled")) {
        c.disableInteractive();
        c.setVisible(false);
        free.push(c);
      } else {
        c.destroy();
      }
    },
    releaseAll(cards) {
      for (const c of cards) this.release(c);
    },
  };
}

/* ─────────────────────────── round-progress meter ─────────────────────────── */

export interface RoundMeterApi {
  /** Redraw with `done` gold stars out of `total`. */
  set(done: number, total: number): void;
  setPosition(x: number, y: number): void;
}

/**
 * A row of progress stars that fills gold as the kid completes rounds.
 * Instant reward — the brain loves watching a meter fill. Only the NEWLY
 * filled star pops (previous ones don't re-fire every rebuild) and a tiny
 * quiet tick plays so progress sounds as good as it looks.
 */
export function roundMeter(scene: Phaser.Scene): RoundMeterApi {
  const container = scene.add.container(0, 0).setDepth(3000);
  let total = 3;
  let prevDone = -1; // -1 forces the very first rebuild
  const rebuild = (done: number) => {
    container.removeAll(true);
    // shrink the stars when the round is long (Count & Pop runs up to 12 pops)
    const R = total <= 4 ? 11 : total <= 6 ? 9 : 7;
    const gap = total <= 4 ? 30 : total <= 6 ? 26 : 22;
    const startX = -((total - 1) * gap) / 2;
    let played = false;
    for (let i = 0; i < total; i++) {
      const filled = i < done;
      const x = startX + i * gap;
      if (filled) {
        if (i >= prevDone) {
          // newly filled star → soft shadow + pop + a quiet tick
          container.add(scene.add.circle(x, 2, R + 1, 0x0b2545, 0.28));
          const star = scene.add
            .circle(x, 0, R, 0xffd166)
            .setStrokeStyle(Math.max(2, Math.round(R * 0.28)), 0xefb419);
          // #783 — the newly-filled star's pop honours reduced motion: the star
          // still fills gold instantly, it just doesn't bounce.
          if (!prefersReducedMotion()) {
            scene.tweens.add({ targets: star, scale: 1.35, duration: 150, yoyo: true, ease: "Back.easeOut" });
          }
          container.add(star);
          if (!played) {
            played = true;
            starPop();
          }
        } else {
          container.add(scene.add.circle(x, 2, R + 1, 0x0b2545, 0.28));
          container.add(scene.add.circle(x, 0, R, 0xffd166).setStrokeStyle(Math.max(2, Math.round(R * 0.28)), 0xefb419));
        }
      } else {
        container.add(
          scene.add.circle(x, 0, R, 0xffffff, 0.28).setStrokeStyle(Math.max(2, Math.round(R * 0.28)), 0xffffff, 0.55)
        );
      }
    }
    prevDone = done;
  };
  return {
    set(done: number, t: number) {
      const totalChanged = t !== total;
      total = Math.max(1, t);
      const next = Math.max(0, Math.min(done, total));
      if (totalChanged || next !== prevDone) rebuild(next);
    },
    setPosition(x, y) {
      container.setPosition(x, y);
    },
  };
}

/* ─────────────────────────── shared card-grid layout ─────────────────────────── */

export interface GridLayout {
  cardW: number;
  /** Card height actually used — for rect grids it may be clamped to the
   *  band on short phones, so scenes must draw with `gl.cardH`, not their
   *  own CARD_H constant. Round grids always have cardH === cardW. */
  cardH: number;
  spacingX: number;
  spacingY: number;
  cy: number;
  startX: number;
}

/**
 * One layout rule for every answer grid in the app — prevents the classic
 * short-phone bug where the last row slides under the prompt/answers.
 *
 * The grid is clamped to the vertical band [topPad, bottomY]: if it's too
 * tall for the screen the cards shrink (never past minW) instead of
 * overflowing, and `cy` centers the grid inside whatever room is left.
 */
export function gridLayout(
  scene: Phaser.Scene,
  opts: {
    cols: number;
    rows: number;
    preferredW: number;
    minW: number;
    widthPad: number;
    topPad: number;
    bottomY: number;
    gapX?: number;
    gapY?: number;
    /** Card height (rect cards only). Defaults to cardW (round buttons). */
    cardH?: number;
    /** Pre-read scene width — lets callers take ONE scale read up front and
     *  reuse it here instead of gridLayout() re-reading scene.scale between
     *  grid writes and per-card texture allocations. */
    width?: number;
    /** Pre-read scene height (see width). */
    height?: number;
  }
): GridLayout {
  const width = opts.width ?? scene.scale.width;
  const height = opts.height ?? scene.scale.height;
  const gapX = opts.gapX ?? 14;
  const gapY = opts.gapY ?? 14;
  let cardW = Math.max(opts.minW, Math.min(opts.preferredW, (width - opts.widthPad) / opts.cols));
  const round = opts.cardH === undefined; // card height = card width (circle buttons)
  // IMPORTANT: for round grids cardH must TRACK cardW, including the shrink
  // below. The old code froze cardH at the pre-shrink width, so the cy band
  // was computed with a card twice as tall as the ones actually drawn → the
  // grid pinned itself too low and its TOP row slid up into the question
  // (and on short phones the last row dropped under the prompt).
  let cardH = round ? cardW : opts.cardH!;
  const band = Math.max(60, opts.bottomY - opts.topPad);
  if (opts.rows > 1) {
    // Shrink cardW until every row's centers AND card heights fit the band.
    // (topPad/bottomY are TRUE grid edges — rows never poke above/below them.)
    // ROUND: rows*(w+gap) ≤ band  →  w ≤ (band-(rows-1)gap)/rows  (solve both sides)
    // RECT:  (rows-1)*(w+gap) + h ≤ band
    const maxSpacingY = round
      ? (band - (opts.rows - 1) * gapY) / opts.rows
      : (band - cardH - (opts.rows - 1) * gapY) / (opts.rows - 1);
    // The scene's minW is a *preferred* floor — a short phone may legitimately
    // need smaller cards to keep the whole grid on screen, so we may shrink
    // below it, but never under the hard floor 40 (below that a kid can't tap).
    cardW = Math.max(40, Math.min(cardW, maxSpacingY));
    if (round) {
      cardH = cardW;
    } else {
      // RECT multi-row: the height of ONE card counts against the band too.
      // After shrinking cardW, also shrink cardH so the FULL grid still fits:
      //   cardH + (rows-1)*(cardW + gapY) ≤ band
      cardH = Math.max(40, Math.min(cardH, band - (opts.rows - 1) * (cardW + gapY)));
      // Now cardH is smaller, so cardW can grow back for the biggest tappable
      // cards — one more pass with the shrunk height.
      const maxSpacingY2 = (band - cardH - (opts.rows - 1) * gapY) / (opts.rows - 1);
      cardW = Math.max(40, Math.min(cardW, maxSpacingY2));
    }
  }
  // Even a single row must fit the band vertically:
  //  · round cards are as tall as they are wide → cardW (hence cardH) ≤ band
  //  · rect cards have a fixed height → clamp it so one row never exceeds band
  if (round) {
    cardW = Math.max(40, Math.min(cardW, band));
    cardH = cardW;
  } else {
    // Clamp the CURRENT cardH (may already be shrunk for rect multi-row) so a
    // single row never exceeds the band. Must NOT be opts.cardH! — that would
    // undo the multi-row shrink above.
    cardH = Math.max(40, Math.min(cardH, band));
  }
  const spacingX = cardW + gapX;
  const spacingY = cardW + gapY;
  const gridH = (opts.rows - 1) * spacingY;
  const minCy = opts.topPad + cardH / 2 + gridH / 2;
  const maxCy = opts.bottomY - cardH / 2 - gridH / 2;
  // When the grid physically can't fit the band (minCy > maxCy), center it in
  // the band so the (tiny) overflow splits evenly top+bottom. The old clamp
  // pinned it to the TOP edge, which threw the last row up to 80px below
  // bottomY — burying it under the prompt on most phones.
  const cy =
    minCy <= maxCy
      ? Phaser.Math.Clamp(height * 0.55, minCy, maxCy)
      : (minCy + maxCy) / 2;
  const startX = width / 2 - (spacingX * (opts.cols - 1)) / 2;
  return { cardW, cardH, spacingX, spacingY, cy, startX };
}

/* ─────────────────────────── prompt pill (icon + text) ─────────────────────────── */

export interface PromptPillApi {
  /** Swap the icon + label (e.g. each round's target shape). */
  set(iconKey: string, text: string): void;
  setPosition(x: number, y: number): void;
}

/**
 * A compact "icon + words" prompt — e.g. [▲] "Tap the triangle!".
 * Critical for Band 1 (ages 2–4): pre-readers can't read "triangle", but the
 * big icon IS the question. Centered as one unit so it never clips an edge.
 */
export function promptPill(scene: Phaser.Scene, initialIcon: string, initialText: string, style: Phaser.Types.GameObjects.Text.TextStyle, iconSize = 42): PromptPillApi {
  const container = scene.add.container(0, 0).setDepth(4000);
  let icon: Phaser.GameObjects.Container | null = null;
  let tx: Phaser.GameObjects.Text | null = null;
  const recenter = () => {
    const textW = tx ? tx.width : 0;
    const totalW = iconSize + 10 + textW;
    if (icon) icon.setPosition(-totalW / 2 + iconSize / 2, 0);
    if (tx) tx.setPosition(-totalW / 2 + iconSize + 10, 0);
  };
  const build = (iconKey: string, text: string) => {
    if (icon) icon.destroy();
    if (tx) tx.destroy();
    icon = assetIcon(scene, iconKey, iconSize);
    tx = scene.add.text(0, 0, text, style).setOrigin(0, 0.5);
    container.add([icon, tx]);
    recenter();
  };
  build(initialIcon, initialText);
  return {
    set(iconKey: string, text: string) {
      build(iconKey, text);
    },
    setPosition(x, y) {
      container.setPosition(x, y);
    },
  };
}

/* ─────────────────────────── state helpers ─────────────────────────── */

/** Flash the container green + pop — used when the kid answers correctly. */
export function correctButton(c: Phaser.GameObjects.Container) {
  const api = c.getData("nv-btn") as ModernBtnApi | undefined;
  api?.setCorrect();
  // combo juice: escalating fireworks as the kid chains correct answers
  correctCelebrate(c.scene, c.x, c.y);
}

/** Add a golden ring + pop without recoloring (color-identity buttons). */
export function ringCorrect(scene: Phaser.Scene, c: Phaser.GameObjects.Container) {
  if (!prefersReducedMotion()) {
    const { width, height } = c.getBounds();
    const rad = Math.max(width, height) / 2;
    const ring = scene.add.circle(c.x, c.y, rad + 6, 0xffd166, 0).setStrokeStyle(5, 0xffd166).setDepth(4000);
    scene.tweens.add({ targets: ring, scale: 1.35, alpha: 0, duration: 420, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    scene.tweens.add({ targets: c, scale: 1.14, duration: 130, yoyo: true, ease: "Back.easeOut" });
  }
  // combo juice: escalating fireworks as the kid chains correct answers
  correctCelebrate(scene, c.x, c.y);
}

/**
 * Shared right/wrong site flash for custom cards and bins that are NOT built
 * with modernAnswerButton/modernCardButton. The stroke is paired with a
 * ✓ (correct) or ✕ (wrong) badge so the verdict never relies on green-vs-red
 * color alone (#1364/#1385).
 */
export function answerFlash(
  scene: Phaser.Scene,
  c: Phaser.GameObjects.Container,
  color: number,
  opts: { w: number; h: number; alpha?: number; duration?: number; radius?: number; glyph?: "check" | "cross" }
) {
  const { w, h } = opts;
  const alpha = opts.alpha ?? 0.9;
  const duration = opts.duration ?? 900;
  const radius = opts.radius ?? 16;
  const g = scene.add.graphics();
  g.lineStyle(6, color, alpha);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  c.addAt(g, 0);
  let mark: Phaser.GameObjects.Text | null = null;
  if (opts.glyph) {
    mark = scene.add
      .text(w / 2 - 16, -h / 2 + 16, opts.glyph === "check" ? "✓" : "✕", {
        fontSize: "28px",
        color: opts.glyph === "check" ? "#052e16" : "#4c0519",
        fontStyle: "bold",
        stroke: "#ffffff",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);
    c.add(mark);
  }
  const cleanup = () => {
    if (g.active) g.destroy();
    if (mark && mark.active) mark.destroy();
  };
  const timer = scene.time.delayedCall(duration, cleanup);
  // #935 — don't rely on the scene clock to fire this on a rapid restart. The
  // old scene's Clock is hibernated on stop, so a pending delayedCall would
  // otherwise survive into the restarted scene; destroy the flash graphics
  // (and drop the timer) explicitly the moment the scene shuts down.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    timer.remove(false);
    cleanup();
  });
}
