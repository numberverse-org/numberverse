/**
 * Share images — pretty PNG cards rendered straight to <canvas>, no DOM, no
 * dependencies, fully offline. Powers two share buttons:
 *   · Parent panel "Share progress" → a weekly-style card (avatar, stats,
 *     world bars) the parent can post to WhatsApp;
 *   · Certificate "Share" → a keepsake card for a mastered world.
 *
 * WHY CANVAS: the share target is WhatsApp (the BD parent channel) — a PNG
 * image travels better than a link. html2canvas would bloat the bundle for a
 * style we fully control; canvas 2D is ~1KB of code and deterministic.
 *
 * Flow (per share):
 *   renderToCanvas() → toBlob() → try Web Share API with the FILE (native
 *   Android/iOS share sheet, incl. WhatsApp) → fallback download + wa.me text.
 *
 * #267 — the wa.me fallback goes through the core external-link allowlist
 * (https only), so no app can ever be launched from the share flow.
 */
import { openExternal, stripPngMetadata } from "@numberverse/core";

export interface ShareCardData {
  title: string;          // "🎉 Numberverse" (or local brand)
  name: string;           // kid's name
  avatar: string;         // emoji avatar
  stars: number;
  score: number;
  sessions: number;
  statsLabels: [string, string, string]; // ["Stars","Points","Sessions"]
  worlds: Array<{ emoji: string; title: string; mastered: number; total: number }>;
  worldsTitle: string;    // "Worlds"
  footer: string;         // tagline
}

/** Draw the parent-panel "Share progress" card onto `canvas`. Portrait 4:5
 *  (1080×1350) — the shape WhatsApp previews best. Returns the canvas. */
export function renderShareCard(canvas: HTMLCanvasElement, d: ShareCardData): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, W, H);

  // ── background: deep navy + aurora blobs (matches the app shell) ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b2545");
  bg.addColorStop(1, "#152a4e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const blob = (x: number, y: number, r: number, c: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(120, 180, 320, "rgba(255,94,178,0.28)");
  blob(W - 120, H - 260, 380, "rgba(76,201,240,0.30)");
  blob(W * 0.5, H * 0.35, 260, "rgba(46,196,182,0.18)");

  // ── header wordmark ──
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 56px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(d.title, W / 2, 120);

  // ── avatar badge ──
  const R = 170;
  const cx = W / 2;
  const cy = 330;
  const ring = ctx.createLinearGradient(0, cy - R, 0, cy + R);
  ring.addColorStop(0, "rgba(255,209,102,0.9)");
  ring.addColorStop(1, "rgba(255,159,67,0.5)");
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0d1f3c";
  ctx.beginPath();
  ctx.arc(cx, cy, R - 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "148px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  ctx.fillText(d.avatar, cx, cy + 6);

  // ── name ──
  ctx.font = "800 76px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(d.name, cx, cy + R + 90);

  // ── stat tiles ──
  const tileW = 300;
  const tileH = 200;
  const gap = 24;
  const tilesX = (W - (tileW * 3 + gap * 2)) / 2;
  const tilesY = cy + R + 210;
  const statVals = [d.stars, d.score, d.sessions];
  const statEmoji = ["⭐", "🧠", "🕹️"];
  statVals.forEach((v, i) => {
    const x = tilesX + i * (tileW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    rr(ctx, x, tilesY, tileW, tileH, 26);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    rr(ctx, x, tilesY, tileW, tileH, 26);
    ctx.stroke();
    ctx.font = "64px 'Apple Color Emoji','Segoe UI Emoji',sans-serif";
    ctx.fillText(statEmoji[i], x + tileW / 2, tilesY + 60);
    ctx.font = "700 52px system-ui, sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(String(v), x + tileW / 2, tilesY + 128);
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(d.statsLabels[i], x + tileW / 2, tilesY + 176);
  });

  // ── worlds progress ──
  const wTitleY = tilesY + tileH + 92;
  ctx.font = "700 44px system-ui, sans-serif";
  ctx.fillStyle = "#9be7ff";
  ctx.fillText(d.worldsTitle, cx, wTitleY);

  const rowsY = wTitleY + 70;
  const rowH = 66;
  const barX = 200;
  const barMax = W - 240;
  d.worlds.forEach((w, i) => {
    const y = rowsY + i * (rowH + 26);
    const emojiX = 120;
    ctx.font = "44px 'Apple Color Emoji','Segoe UI Emoji',sans-serif";
    ctx.fillText(w.emoji, emojiX, y + rowH / 2 + 4);
    // title
    ctx.textAlign = "left";
    ctx.font = "600 34px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    const title = w.title.length > 22 ? w.title.slice(0, 21) + "…" : w.title;
    ctx.fillText(title, barX, y + rowH / 2);
    // bar
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    rr(ctx, barX, y + rowH + 12, barMax - barX, 18, 9);
    ctx.fill();
    const pct = w.total > 0 ? w.mastered / w.total : 0;
    ctx.fillStyle = pct >= 1 ? "#7ee8d2" : "#4cc9f0";
    rr(ctx, barX, y + rowH + 12, Math.max(18, (barMax - barX) * pct), 18, 9);
    ctx.fill();
    // count
    ctx.textAlign = "right";
    ctx.font = "700 32px system-ui, sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(`${w.mastered}/${w.total}`, barMax, y + rowH / 2);
    ctx.textAlign = "center";
  });

  // ── footer tagline ──
  ctx.font = "500 36px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  wrapText(ctx, d.footer, W / 2, H - 130, W - 160, 50);

  return canvas;
}

export interface ShareCertData {
  title: string;          // "Certificate of Achievement"
  certifies: string;      // "This certifies that"
  name: string;
  mastered: string;       // "has proudly mastered"
  worldTitle: string;
  skillCount: string;     // "5 skills"
  withNova: string;       // "in Numberverse, guided by Nova the Owl"
  signed: string;         // "Nova the Owl"
  dateLabel: string;      // "Date"
  date: string;
  skills: Array<{ title: string; titleBn?: string }>;
  footer: string;
}

/** Draw the certificate share card. Portrait 4:5 (1080×1350) — keeps the
 *  printable look (cream sheet, gold double border) but phone-sized. */
export function renderCertCard(canvas: HTMLCanvasElement, d: ShareCertData): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, W, H);

  // outer bg
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#23304a");
  bg.addColorStop(1, "#141a2c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // cream sheet
  ctx.fillStyle = "#fffdf5";
  rr(ctx, 36, 36, W - 72, H - 72, 30);
  ctx.fill();
  // gold double border
  ctx.strokeStyle = "#c9a24b";
  ctx.lineWidth = 4;
  rr(ctx, 72, 72, W - 144, H - 144, 18);
  ctx.stroke();
  ctx.strokeStyle = "rgba(201,162,75,0.55)";
  ctx.lineWidth = 2;
  rr(ctx, 90, 90, W - 180, H - 180, 14);
  ctx.stroke();

  const cx = W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // owls + title
  ctx.font = "56px 'Apple Color Emoji','Segoe UI Emoji',sans-serif";
  ctx.fillText("🦉", cx - 130, 190);
  ctx.fillText("🦉", cx + 130, 190);
  ctx.font = "900 52px ui-serif, Georgia, serif";
  ctx.fillStyle = "#8a6a1f";
  ctx.fillText(d.title, cx, 290);

  // certifies / name / mastered
  ctx.font = "500 40px ui-serif, Georgia, serif";
  ctx.fillStyle = "#6a5430";
  ctx.fillText(d.certifies, cx, 400);
  ctx.font = "900 96px ui-serif, Georgia, serif";
  ctx.fillStyle = "#3a2a17";
  ctx.fillText(d.name, cx, 500);
  ctx.font = "500 40px ui-serif, Georgia, serif";
  ctx.fillStyle = "#6a5430";
  ctx.fillText(d.mastered, cx, 590);

  // world
  ctx.font = "800 60px ui-serif, Georgia, serif";
  ctx.fillStyle = "#b84538";
  ctx.fillText(d.worldTitle, cx, 680);

  // skill count + list (cap at 4 so the card never overflows)
  ctx.font = "600 38px ui-serif, Georgia, serif";
  ctx.fillStyle = "#8a6a1f";
  ctx.fillText(d.skillCount, cx, 770);
  const listY = 845;
  const shown = d.skills.slice(0, 4);
  shown.forEach((s, i) => {
    const label = (s.titleBn && s.titleBn !== s.title) ? `${s.title} (${s.titleBn})` : s.title;
    ctx.font = "500 33px system-ui, sans-serif";
    ctx.fillStyle = "#5a4a28";
    wrapText(ctx, `•  ${label}`, cx, listY + i * 48, W - 280, 40);
  });

  // withNova — sits just below the last list line, never past 1080
  const linesEnd = listY + shown.length * 48 + 70;
  const withY = Math.max(960, Math.min(linesEnd, 1080));
  ctx.font = "500 35px ui-serif, Georgia, serif";
  ctx.fillStyle = "#6a5430";
  ctx.fillText(d.withNova, cx, withY);

  // footer: date on the left, Nova's signature on the right (like a real cert)
  const footY = 1170;
  ctx.font = "600 34px ui-serif, Georgia, serif";
  ctx.fillStyle = "#8a6a1f";
  ctx.textAlign = "left";
  ctx.fillText(`${d.dateLabel}: ${d.date}`, 150, footY + 26);
  ctx.textAlign = "right";
  ctx.font = "56px 'Apple Color Emoji','Segoe UI Emoji',sans-serif";
  ctx.fillText("🦉", W - 150, footY - 24);
  ctx.font = "700 34px ui-serif, Georgia, serif";
  ctx.fillStyle = "#3a2a17";
  ctx.fillText(d.signed, W - 150, footY + 44);
  ctx.textAlign = "center";

  ctx.font = "500 30px system-ui, sans-serif";
  ctx.fillStyle = "rgba(90,74,40,0.7)";
  wrapText(ctx, d.footer, cx, H - 58, W - 200, 38);

  return canvas;
}

/* ─────────────────────────────── shared helpers ─────────────────────────────── */

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr2 = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr2, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr2);
  ctx.arcTo(x + w, y + h, x, y + h, rr2);
  ctx.arcTo(x, y + h, x, y, rr2);
  ctx.arcTo(x, y, x + w, y, rr2);
  ctx.closePath();
}

/** Center-wrap text on multiple lines (for the taglines). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, startY: number, maxW: number, lineH: number) {
  const words = text.split(" ");
  let line = "";
  let y = startY;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, y);
      line = w;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, y);
}

/** Turn a canvas into a PNG blob — with zero identifying metadata (#93).
 *  `stripPngMetadata` (from @numberverse/core) drops every tEXt/zTXt/iTXt/
 *  eXIf chunk, so a share card never carries a kid's name, a path, or EXIF
 *  into WhatsApp. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) { reject(new Error("canvas toBlob failed")); return; }
      b.arrayBuffer()
        .then((ab) => resolve(new Blob([stripPngMetadata(ab)], { type: "image/png" })))
        .catch(reject);
    }, "image/png");
  });
}

export type ShareResult = "shared" | "downloaded" | "unsupported";

/**
 * Share a PNG: native Web Share API with the FILE (opens the device share sheet
 * incl. WhatsApp — the parent just picks WhatsApp and posts). If the file share
 * isn't supported (desktop), download the PNG AND open wa.me with the caption
 * text so the parent can attach it in one tap. Resolves the outcome.
 */
export async function sharePng(
  blob: Blob,
  filename: string,
  caption: string,
  waUrl: string
): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename, text: caption });
      return "shared";
    }
  } catch {
    // AbortError = user cancelled the sheet — not a failure worth surfacing.
  }
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href as string), 4000);
    if (waUrl) openExternal(waUrl, "_blank");
    return "downloaded";
  } catch {
    return "unsupported";
  }
}

/** WhatsApp share URL with just text (no image — the caption companions the
 *  downloaded PNG on desktop, or is the share-sheet text on mobile). */
export function waTextUrl(caption: string): string {
  return `https://wa.me/?text=${encodeURIComponent(caption)}`;
}
