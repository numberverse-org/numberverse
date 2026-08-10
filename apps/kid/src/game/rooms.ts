/**
 * Nova's rooms — 12 procedurally-drawn "2026-style" backdrops (zero image assets).
 * Each room is a full-screen canvas texture: soft gradients + dimensional decor,
 * no 90s clip-art. `draw(ctx, w, h)` paints the whole backdrop.
 */

export interface RoomDef {
  id: string;
  name: string;
  nameBn: string;
  emoji: string;
  /** Floating ambient particles unique to the room. */
  ambient?: "bubbles" | "fireflies" | "stars" | "confetti" | "snow";
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

/* ─────────────────────────── shared canvas helpers ─────────────────────────── */

function fillV(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [string, number][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [c, o] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, x1 > 0 ? 1e4 : 1, 1); // placeholder — real fills call rr/ell after
}

function gradV(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [string, number][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [c, o] of stops) g.addColorStop(o, c);
  return g;
}

function gradR(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, stops: [string, number][]): CanvasGradient {
  const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.05, cx, cy, r);
  for (const [c, o] of stops) g.addColorStop(o, c);
  return g;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function ell(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function sun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2.4);
  g.addColorStop(0, "rgba(255,236,170,0.95)");
  g.addColorStop(0.4, "rgba(255,222,140,0.4)");
  g.addColorStop(1, "rgba(255,222,140,0)");
  ctx.fillStyle = g;
  ell(ctx, x, y, r * 2.4, r * 2.4);
  ctx.fillStyle = "#ffe9a8";
  ell(ctx, x, y, r, r);
}

function moon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r * 2.2);
  g.addColorStop(0, "rgba(255,250,220,0.95)");
  g.addColorStop(0.5, "rgba(255,244,200,0.3)");
  g.addColorStop(1, "rgba(255,244,200,0)");
  ctx.fillStyle = g;
  ell(ctx, x, y, r * 2.2, r * 2.2);
  ctx.fillStyle = "#fff6d8";
  ell(ctx, x, y, r, r);
  ctx.fillStyle = "rgba(220,200,160,0.5)";
  ell(ctx, x - r * 0.3, y - r * 0.2, r * 0.18, r * 0.14);
  ell(ctx, x + r * 0.35, y + r * 0.3, r * 0.12, r * 0.1);
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, canopy: string) {
  // trunk
  ctx.fillStyle = "rgba(120,80,45,0.85)";
  rr(ctx, x - 5 * s, y - 8 * s, 10 * s, 42 * s, 4 * s);
  ctx.fill();
  // canopy blobs
  ctx.fillStyle = canopy;
  ell(ctx, x - 16 * s, y - 30 * s, 20 * s, 22 * s);
  ell(ctx, x + 15 * s, y - 34 * s, 17 * s, 19 * s);
  ell(ctx, x, y - 48 * s, 22 * s, 24 * s);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ell(ctx, x - 8 * s, y - 56 * s, 9 * s, 7 * s);
}

/* ─────────────────────────── the 12 rooms ─────────────────────────── */

export const ROOMS: RoomDef[] = [
  {
    id: "field", name: "Field", nameBn: "মাঠ", emoji: "🌾", ambient: "fireflies",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#8ecdf5", 0], ["#b7e4fb", 0.55], ["#cdeefb", 0.75], ["#a5e3bd", 1]]);
      ctx.fillRect(0, 0, w, h);
      sun(ctx, w * 0.82, h * 0.16, 26);
      // rolling hills
      ctx.fillStyle = "#8fd98a";
      ell(ctx, w * 0.2, h * 0.92, w * 0.42, h * 0.3);
      ctx.fillStyle = "#a8e79f";
      ell(ctx, w * 0.82, h * 0.97, w * 0.5, h * 0.32);
      // ground
      ctx.fillStyle = gradV(ctx, 0, h * 0.78, 0, h, [["#7ed957", 0], ["#5cbf4a", 0.6], ["#42a038", 1]]);
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      for (let x = 0; x < w; x += 24) ell(ctx, x, h * 0.82, 11, 6);
      // flowers
      const fl = ["#ff8fb0", "#ffd166", "#ff9e6d", "#c9a7ff", "#8ef0a0"];
      for (let i = 0; i < 10; i++) {
        const fx = w * (0.06 + i * 0.09) + (i % 2) * w * 0.02;
        const fy = h * (0.8 + ((i * 37) % 9) * 0.012);
        dot(ctx, fx, fy, 5, "rgba(255,255,255,0.95)");
        dot(ctx, fx, fy, 3, fl[i % fl.length]);
      }
      // drifting cloud
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ell(ctx, w * 0.2, h * 0.13, 46, 15);
      ell(ctx, w * 0.27, h * 0.11, 32, 12);
    },
  },
  {
    id: "garden", name: "Garden", nameBn: "বাগান", emoji: "🌷", ambient: "fireflies",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#aee4f7", 0], ["#d8f3fb", 0.6], ["#bfecd0", 1]]);
      ctx.fillRect(0, 0, w, h);
      sun(ctx, w * 0.16, h * 0.15, 22);
      // fence
      ctx.strokeStyle = "rgba(150,110,75,0.8)";
      ctx.lineWidth = 5;
      for (let x = w * 0.06; x < w * 0.94; x += w * 0.07) {
        ctx.beginPath();
        ctx.moveTo(x, h * 0.62);
        ctx.lineTo(x, h * 0.8);
        ctx.stroke();
      }
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(w * 0.04, h * 0.64);
      ctx.lineTo(w * 0.96, h * 0.64);
      ctx.stroke();
      // ground
      ctx.fillStyle = gradV(ctx, 0, h * 0.72, 0, h, [["#7ecf6a", 0], ["#58b548", 1]]);
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      // flower bushes
      const cols = ["#ff6b9d", "#ffb3c6", "#ffd166", "#c4b5fd", "#ff9e6d", "#f4a261"];
      for (let i = 0; i < 7; i++) {
        const bx = w * (0.12 + i * 0.13);
        const by = h * (0.78 + (i % 2) * 0.03);
        ctx.fillStyle = "rgba(56,120,50,0.9)";
        ell(ctx, bx, by + 8, 18, 10);
        ctx.fillStyle = cols[i % cols.length];
        for (let f = 0; f < 5; f++) dot(ctx, bx + (f - 2) * 7, by - (f % 2) * 4, 4, cols[(i + f) % cols.length]);
        dot(ctx, bx, by, 5, "#fff");
      }
    },
  },
  {
    id: "bathroom", name: "Bathroom", nameBn: "বাথরুম", emoji: "🛁", ambient: "bubbles",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#cfe9f4", 0], ["#eaf7fb", 1]]);
      ctx.fillRect(0, 0, w, h);
      // wall tiles
      const ts = 44;
      for (let ty = 0; ty < h * 0.58; ty += ts) {
        for (let tx = 0; tx < w; tx += ts) {
          ctx.fillStyle = (tx / ts + ty / ts) % 2 === 0 ? "rgba(255,255,255,0.4)" : "rgba(180,222,236,0.4)";
          rr(ctx, tx + 2, ty + 2, ts - 4, ts - 4, 7);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      // floor
      ctx.fillStyle = gradV(ctx, 0, h * 0.58, 0, h, [["#7ec8dd", 0], ["#4f9db8", 1]]);
      ctx.fillRect(0, h * 0.58, w, h * 0.42);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      for (let i = 0; i < 12; i++) {
        rr(ctx, w * (i * 0.083) + 4, h * 0.59, w * 0.07, 8, 4);
        ctx.fill();
      }
      // mirror
      ctx.strokeStyle = "rgba(120,150,170,0.6)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(w * 0.86, h * 0.16, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#c8e4f0";
      ctx.beginPath();
      ctx.arc(w * 0.86, h * 0.16, 26, 0, Math.PI * 2);
      ctx.fill();
      // towel
      ctx.fillStyle = "#ff9eb0";
      rr(ctx, w * 0.08, h * 0.26, w * 0.09, h * 0.2, 6);
      ctx.fill();
      ctx.fillStyle = "#ffd166";
      rr(ctx, w * 0.09, h * 0.26, w * 0.07, h * 0.15, 6);
      ctx.fill();
      // bathtub
      ctx.fillStyle = "#ffffff";
      ell(ctx, w * 0.5, h * 0.8, w * 0.3, h * 0.15);
      rr(ctx, w * 0.22, h * 0.62, w * 0.56, h * 0.2, 20);
      ctx.fill();
      ctx.fillStyle = "#9adcf2";
      rr(ctx, w * 0.25, h * 0.64, w * 0.5, h * 0.1, 10);
      ctx.fill();
      // faucet + shower head
      ctx.strokeStyle = "#c9d6de";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(w * 0.34, h * 0.6);
      ctx.lineTo(w * 0.34, h * 0.5);
      ctx.lineTo(w * 0.2, h * 0.5);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      rr(ctx, w * 0.13, h * 0.46, w * 0.1, h * 0.05, 6);
      ctx.fill();
      // bubbles (a few static + ambient handles floating ones)
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w * (0.35 + i * 0.06), h * (0.68 + (i % 2) * 0.03), 7 + i, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  },
  {
    id: "kitchen", name: "Kitchen", nameBn: "রান্নাঘর", emoji: "🍳",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#f7e6c8", 0], ["#fdf3e0", 0.6], ["#e8b07c", 1]]);
      ctx.fillRect(0, 0, w, h);
      // window
      ctx.fillStyle = "#bfe3f5";
      rr(ctx, w * 0.12, h * 0.1, w * 0.2, h * 0.16, 6);
      ctx.fill();
      ctx.strokeStyle = "#8a6a48";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * 0.18);
      ctx.lineTo(w * 0.32, h * 0.18);
      ctx.moveTo(w * 0.22, h * 0.1);
      ctx.lineTo(w * 0.22, h * 0.26);
      ctx.stroke();
      // upper cabinets
      ctx.fillStyle = "#c8905f";
      rr(ctx, w * 0.42, h * 0.1, w * 0.3, h * 0.18, 8);
      ctx.fill();
      ctx.fillStyle = "#b07a4c";
      rr(ctx, w * 0.75, h * 0.1, w * 0.2, h * 0.18, 8);
      ctx.fill();
      dot(ctx, w * 0.5, h * 0.2, 3, "#ffe9c8");
      dot(ctx, w * 0.86, h * 0.2, 3, "#ffe9c8");
      // counter
      ctx.fillStyle = "#8a6a48";
      rr(ctx, 0, h * 0.72, w, h * 0.06, 0);
      ctx.fill();
      ctx.fillStyle = "#6b5136";
      rr(ctx, 0, h * 0.78, w, h * 0.22, 0);
      ctx.fill();
      // stove + pot
      ctx.fillStyle = "#3b4a5a";
      rr(ctx, w * 0.18, h * 0.6, w * 0.22, h * 0.12, 8);
      ctx.fill();
      ctx.fillStyle = "#ff8a5c";
      ell(ctx, w * 0.24, h * 0.63, 12, 4);
      ell(ctx, w * 0.34, h * 0.63, 12, 4);
      ctx.fillStyle = "#4a5a6a";
      rr(ctx, w * 0.27, h * 0.5, w * 0.1, h * 0.12, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.27, h * 0.52);
      ctx.lineTo(w * 0.37, h * 0.52);
      ctx.stroke();
      // fridge
      ctx.fillStyle = "#e9f2f6";
      rr(ctx, w * 0.78, h * 0.36, w * 0.16, h * 0.36, 6);
      ctx.fill();
      ctx.strokeStyle = "#b0c4d0";
      ctx.lineWidth = 3;
      ctx.stroke();
      dot(ctx, w * 0.9, h * 0.46, 3, "#6b7a8a");
      dot(ctx, w * 0.9, h * 0.6, 3, "#6b7a8a");
    },
  },
  {
    id: "bedroom", name: "Bedroom", nameBn: "শোবার ঘর", emoji: "🛏️",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#4a3566", 0], ["#6b4d8f", 0.6], ["#8a6ab0", 1]]);
      ctx.fillRect(0, 0, w, h);
      moon(ctx, w * 0.82, h * 0.14, 20);
      // window with moonlit sky
      ctx.fillStyle = "#3a2c5c";
      rr(ctx, w * 0.1, h * 0.12, w * 0.18, h * 0.16, 6);
      ctx.fill();
      ctx.strokeStyle = "#c9a8e0";
      ctx.lineWidth = 4;
      ctx.stroke();
      dot(ctx, w * 0.16, h * 0.17, 4, "#fff6d8");
      // rug
      ctx.fillStyle = "#c95d8f";
      ell(ctx, w * 0.5, h * 0.9, w * 0.34, h * 0.09);
      ctx.fillStyle = "#e87ba9";
      ell(ctx, w * 0.5, h * 0.9, w * 0.26, h * 0.07);
      // bed
      ctx.fillStyle = "#8a5a3c";
      rr(ctx, w * 0.22, h * 0.62, w * 0.56, h * 0.22, 10);
      ctx.fill();
      ctx.fillStyle = "#fff3e6";
      rr(ctx, w * 0.26, h * 0.58, w * 0.48, h * 0.12, 14);
      ctx.fill();
      ctx.fillStyle = "#a8d8f0";
      rr(ctx, w * 0.3, h * 0.52, w * 0.4, h * 0.1, 12);
      ctx.fill();
      ctx.fillStyle = "#ffd166";
      rr(ctx, w * 0.26, h * 0.74, w * 0.48, h * 0.1, 8);
      ctx.fill();
      // night lamp
      ctx.fillStyle = "#3b2a4a";
      rr(ctx, w * 0.74, h * 0.6, w * 0.02, h * 0.12, 4);
      ctx.fill();
      const lampG = ctx.createRadialGradient(w * 0.75, h * 0.56, 2, w * 0.75, h * 0.56, w * 0.12);
      lampG.addColorStop(0, "rgba(255,214,130,0.9)");
      lampG.addColorStop(1, "rgba(255,214,130,0)");
      ctx.fillStyle = lampG;
      ell(ctx, w * 0.75, h * 0.56, w * 0.12, w * 0.09);
    },
  },
  {
    id: "living", name: "Living Room", nameBn: "বসার ঘর", emoji: "🛋️",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#f4e0c8", 0], ["#f8ecd8", 0.6], ["#d9b38c", 1]]);
      ctx.fillRect(0, 0, w, h);
      // picture frame
      ctx.fillStyle = "#8a6a48";
      rr(ctx, w * 0.12, h * 0.12, w * 0.16, h * 0.14, 6);
      ctx.fill();
      ctx.fillStyle = "#bfe3f5";
      rr(ctx, w * 0.135, h * 0.135, w * 0.13, h * 0.11, 4);
      ctx.fill();
      dot(ctx, w * 0.17, h * 0.16, 4, "#ffe9a8");
      // lamp
      ctx.fillStyle = "#3b2a4a";
      rr(ctx, w * 0.16, h * 0.5, w * 0.03, h * 0.12, 5);
      ctx.fill();
      const lg = ctx.createRadialGradient(w * 0.175, h * 0.46, 3, w * 0.175, h * 0.46, w * 0.13);
      lg.addColorStop(0, "rgba(255,214,130,0.85)");
      lg.addColorStop(1, "rgba(255,214,130,0)");
      ctx.fillStyle = lg;
      ell(ctx, w * 0.175, h * 0.46, w * 0.13, w * 0.1);
      // sofa
      ctx.fillStyle = "#d06b8a";
      rr(ctx, w * 0.32, h * 0.58, w * 0.42, h * 0.2, 16);
      ctx.fill();
      ctx.fillStyle = "#e587a6";
      rr(ctx, w * 0.36, h * 0.52, w * 0.34, h * 0.12, 14);
      ctx.fill();
      ctx.fillStyle = "#c05a7a";
      rr(ctx, w * 0.32, h * 0.66, w * 0.08, h * 0.12, 10);
      ctx.fill();
      rr(ctx, w * 0.66, h * 0.66, w * 0.08, h * 0.12, 10);
      ctx.fill();
      // coffee table
      ctx.fillStyle = "#8a5a3c";
      rr(ctx, w * 0.4, h * 0.8, w * 0.2, h * 0.05, 6);
      ctx.fill();
      rr(ctx, w * 0.42, h * 0.85, w * 0.04, h * 0.06, 4);
      ctx.fill();
      rr(ctx, w * 0.54, h * 0.85, w * 0.04, h * 0.06, 4);
      ctx.fill();
      dot(ctx, w * 0.44, h * 0.775, 5, "#fff");
      dot(ctx, w * 0.56, h * 0.775, 5, "#ffd166");
      // plant
      ctx.fillStyle = "#b0714a";
      rr(ctx, w * 0.78, h * 0.74, w * 0.07, h * 0.1, 8);
      ctx.fill();
      ctx.fillStyle = "#4a9a5a";
      ell(ctx, w * 0.815, h * 0.7, w * 0.06, h * 0.08);
      ell(ctx, w * 0.79, h * 0.66, w * 0.04, h * 0.06);
      ell(ctx, w * 0.84, h * 0.66, w * 0.04, h * 0.06);
    },
  },
  {
    id: "beach", name: "Beach", nameBn: "সৈকত", emoji: "🏖️",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#8fd4f7", 0], ["#cdeefb", 0.55], ["#fff1d6", 1]]);
      ctx.fillRect(0, 0, w, h);
      sun(ctx, w * 0.84, h * 0.14, 26);
      // sea
      ctx.fillStyle = "#5bb6d8";
      ell(ctx, w * 0.5, h * 0.55, w * 0.7, h * 0.18);
      ctx.fillStyle = "#79c8e4";
      ell(ctx, w * 0.5, h * 0.52, w * 0.7, h * 0.12);
      // waves
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(w * (0.2 + i * 0.15), h * 0.5, 10, 0, Math.PI);
        ctx.stroke();
      }
      // sand
      ctx.fillStyle = gradV(ctx, 0, h * 0.58, 0, h, [["#f6df9e", 0], ["#ecc478", 1]]);
      ctx.fillRect(0, h * 0.58, w, h * 0.42);
      dot(ctx, w * 0.12, h * 0.7, 3, "#d8a94f");
      dot(ctx, w * 0.3, h * 0.8, 2, "#d8a94f");
      dot(ctx, w * 0.7, h * 0.68, 3, "#d8a94f");
      // beach ball
      ctx.fillStyle = "#ff5c7a";
      ell(ctx, w * 0.3, h * 0.7, 16, 12);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(w * 0.3, h * 0.7, 12, Math.PI * 0.4, Math.PI * 0.8);
      ctx.fill();
      // palm
      ctx.strokeStyle = "#8a5a3c";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(w * 0.78, h * 0.96);
      ctx.quadraticCurveTo(w * 0.7, h * 0.66, w * 0.62, h * 0.52);
      ctx.stroke();
      ctx.fillStyle = "#3fa34d";
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (i / 6);
        ctx.beginPath();
        ctx.ellipse(w * 0.62 + Math.cos(a) * 40, h * 0.52 + Math.sin(a) * 20, 34, 10, a, 0, Math.PI * 2);
        ctx.fill();
      }
      dot(ctx, w * 0.62, h * 0.5, 8, "#d96a1f");
    },
  },
  {
    id: "forest", name: "Forest", nameBn: "জঙ্গল", emoji: "🌲", ambient: "fireflies",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#16283f", 0], ["#1e3d3a", 0.6], ["#2c5a4a", 1]]);
      ctx.fillRect(0, 0, w, h);
      moon(ctx, w * 0.8, h * 0.12, 18);
      // far trees
      ctx.fillStyle = "rgba(16,38,36,0.6)";
      for (let i = 0; i < 4; i++) {
        const x = w * (0.08 + i * 0.22);
        rr(ctx, x - 3, h * 0.5, 6, h * 0.3, 3);
        ctx.fill();
        ell(ctx, x, h * 0.46, 24, 26);
      }
      // near trees
      tree(ctx, w * 0.18, h * 0.56, 1.3, "#1e4a3c");
      tree(ctx, w * 0.84, h * 0.6, 1.5, "#1a4236");
      tree(ctx, w * 0.05, h * 0.68, 1.1, "#1e4a3c");
      // ground moss
      ctx.fillStyle = gradV(ctx, 0, h * 0.78, 0, h, [["#2c5a4a", 0], ["#1e4638", 1]]);
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (let x = 0; x < w; x += 20) ell(ctx, x, h * 0.84, 9, 4);
      // glowing mushrooms
      for (let i = 0; i < 4; i++) {
        const mx = w * (0.3 + i * 0.14);
        const my = h * (0.82 + (i % 2) * 0.04);
        ctx.fillStyle = "rgba(255,230,180,0.9)";
        ctx.beginPath();
        ctx.arc(mx, my, 4, Math.PI, Math.PI * 2);
        ctx.fill();
        dot(ctx, mx, my, 3, "#ffe6b0");
      }
    },
  },
  {
    id: "space", name: "Space", nameBn: "মহাকাশ", emoji: "🪐", ambient: "stars",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#0b0f2e", 0], ["#1b1757", 0.6], ["#3a2a7a", 1]]);
      ctx.fillRect(0, 0, w, h);
      // stars
      for (let i = 0; i < 60; i++) dot(ctx, Math.random() * w, Math.random() * h * 0.7, Math.random() * 1.6 + 0.4, "rgba(255,255,255,0.85)");
      // shooting star
      const sg = ctx.createLinearGradient(w * 0.2, h * 0.2, w * 0.34, h * 0.28);
      sg.addColorStop(0, "rgba(255,255,255,0.9)");
      sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = sg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.2);
      ctx.lineTo(w * 0.34, h * 0.28);
      ctx.stroke();
      // ringed planet
      ctx.fillStyle = "#f2a93b";
      ell(ctx, w * 0.72, h * 0.24, 44, 44);
      ctx.strokeStyle = "rgba(255,214,130,0.6)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(w * 0.72, h * 0.24, 66, 16, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      // small moon
      ctx.fillStyle = "#c9d4e8";
      ell(ctx, w * 0.2, h * 0.3, 14, 14);
      dot(ctx, w * 0.18, h * 0.29, 3, "#9aa8c4");
      dot(ctx, w * 0.22, h * 0.32, 2, "#9aa8c4");
      // soft nebula glow
      ctx.fillStyle = "rgba(150,80,220,0.25)";
      ell(ctx, w * 0.5, h * 0.78, w * 0.5, h * 0.2);
      ctx.fillStyle = "rgba(60,120,255,0.2)";
      ell(ctx, w * 0.3, h * 0.9, w * 0.4, h * 0.18);
    },
  },
  {
    id: "party", name: "Party", nameBn: "পার্টি", emoji: "🎉", ambient: "confetti",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#6b3fa0", 0], ["#9a4fbf", 0.5], ["#e06b9a", 1]]);
      ctx.fillRect(0, 0, w, h);
      // bunting
      const cols = ["#ffd166", "#ff8fa3", "#8ef0a0", "#7db9ff", "#ffb35c"];
      for (let i = 0; i < 10; i++) {
        const x = w * (i / 10) + w * 0.02;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.moveTo(x, h * 0.1);
        ctx.lineTo(x + w * 0.05, h * 0.1);
        ctx.lineTo(x + w * 0.025, h * 0.18);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.1);
      ctx.lineTo(w, h * 0.1);
      ctx.stroke();
      // balloons
      const bcols = ["#ff5c7a", "#ffd166", "#6bc4ff", "#8ef0a0", "#c9a7ff"];
      for (let i = 0; i < 5; i++) {
        const bx = w * (0.12 + i * 0.18);
        const by = h * (0.3 + (i % 2) * 0.06);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by + 30);
        ctx.quadraticCurveTo(bx + 4, h * 0.55, bx - 2, h * 0.7);
        ctx.stroke();
        const bg = ctx.createRadialGradient(bx - 6, by - 6, 2, bx, by, 28);
        bg.addColorStop(0, "rgba(255,255,255,0.8)");
        bg.addColorStop(0.4, bcols[i]);
        bg.addColorStop(1, "rgba(0,0,0,0.12)");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.ellipse(bx, by, 22, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // confetti dots
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = cols[i % cols.length];
        const cx = Math.random() * w;
        const cy = h * 0.7 + Math.random() * h * 0.28;
        ctx.fillRect(cx, cy, 6, 4);
      }
      // floor
      ctx.fillStyle = "rgba(120,50,110,0.4)";
      ell(ctx, w * 0.5, h * 0.98, w * 0.55, h * 0.05);
    },
  },
  {
    id: "school", name: "School", nameBn: "স্কুল", emoji: "🏫",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#eef4ea", 0], ["#f7f0e0", 0.6], ["#d8b78a", 1]]);
      ctx.fillRect(0, 0, w, h);
      // window
      ctx.fillStyle = "#bfe3f5";
      rr(ctx, w * 0.76, h * 0.1, w * 0.16, h * 0.16, 6);
      ctx.fill();
      ctx.strokeStyle = "#8a6a48";
      ctx.lineWidth = 4;
      ctx.stroke();
      // chalkboard
      ctx.fillStyle = "#5a8a6a";
      rr(ctx, w * 0.14, h * 0.14, w * 0.52, h * 0.3, 8);
      ctx.fill();
      ctx.fillStyle = "#6fa17f";
      rr(ctx, w * 0.16, h * 0.16, w * 0.48, h * 0.26, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "800 22px 'Baloo 2',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("1 + 2 = ?", w * 0.4, h * 0.26);
      ctx.beginPath();
      ctx.arc(w * 0.46, h * 0.26, 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // desk
      ctx.fillStyle = "#b0714a";
      rr(ctx, w * 0.3, h * 0.56, w * 0.4, h * 0.08, 6);
      ctx.fill();
      rr(ctx, w * 0.36, h * 0.64, w * 0.05, h * 0.2, 4);
      ctx.fill();
      rr(ctx, w * 0.59, h * 0.64, w * 0.05, h * 0.2, 4);
      ctx.fill();
      // books on desk
      ctx.fillStyle = "#ff5c7a";
      rr(ctx, w * 0.42, h * 0.5, w * 0.08, h * 0.05, 3);
      ctx.fill();
      ctx.fillStyle = "#6bc4ff";
      rr(ctx, w * 0.5, h * 0.48, w * 0.08, h * 0.07, 3);
      ctx.fill();
      ctx.fillStyle = "#ffd166";
      rr(ctx, w * 0.58, h * 0.49, w * 0.08, h * 0.06, 3);
      ctx.fill();
      // clock
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(w * 0.3, h * 0.5, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8a6a48";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "#3b2a4a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.3, h * 0.5);
      ctx.lineTo(w * 0.3, h * 0.44);
      ctx.moveTo(w * 0.3, h * 0.5);
      ctx.lineTo(w * 0.34, h * 0.5);
      ctx.stroke();
      // floor
      ctx.fillStyle = "rgba(150,110,75,0.25)";
      rr(ctx, 0, h * 0.86, w, h * 0.14, 0);
      ctx.fill();
    },
  },
  {
    id: "rooftop", name: "Rooftop", nameBn: "ছাদ", emoji: "🌃", ambient: "stars",
    draw(ctx, w, h) {
      ctx.fillStyle = gradV(ctx, 0, 0, 0, h, [["#0e1233", 0], ["#202158", 0.55], ["#3a2a6a", 1]]);
      ctx.fillRect(0, 0, w, h);
      moon(ctx, w * 0.78, h * 0.12, 18);
      // city skyline
      const bs = ["#1a1e44", "#22264f", "#151939", "#262a55", "#1e2248"];
      for (let i = 0; i < 6; i++) {
        const bw = w * 0.16;
        const bh = h * (0.3 + (i % 3) * 0.12);
        const bx = w * (i * 0.17 - 0.02);
        ctx.fillStyle = bs[i % bs.length];
        ctx.fillRect(bx, h * 0.78 - bh, bw, h * 0.22 + bh);
        // lit windows
        ctx.fillStyle = "rgba(255,214,130,0.8)";
        for (let wy = 0; wy < 4; wy++) {
          for (let wx = 0; wx < 3; wx++) {
            if ((wy * 7 + wx) % 3 !== 0) ctx.fillRect(bx + 8 + wx * 14, h * 0.78 - bh + 10 + wy * 18, 6, 8);
          }
        }
      }
      // rooftop ledge
      ctx.fillStyle = "#2c2a55";
      rr(ctx, 0, h * 0.82, w, h * 0.18, 10);
      ctx.fill();
      ctx.fillStyle = "#3c3a68";
      rr(ctx, 0, h * 0.8, w, h * 0.04, 6);
      ctx.fill();
      ctx.strokeStyle = "#4c4a7a";
      ctx.lineWidth = 4;
      for (let x = w * 0.06; x < w * 0.94; x += w * 0.11) {
        ctx.beginPath();
        ctx.moveTo(x, h * 0.8);
        ctx.lineTo(x, h * 0.92);
        ctx.stroke();
      }
      // antenna
      ctx.strokeStyle = "#3c3a68";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.8);
      ctx.lineTo(w * 0.2, h * 0.62);
      ctx.stroke();
      dot(ctx, w * 0.2, h * 0.6, 3, "#ff5c7a");
    },
  },
];
