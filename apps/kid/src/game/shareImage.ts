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
import { isAllowedExternalUrl, stripPngMetadata } from "@numberverse/core";
import { NV_GOLD, NV_MINT, NV_NAVY, NV_SKY } from "./ui"; // tokenized #591

// #3152 — the share cards were drawn in system-ui. The Baloo 2 / Nunito faces
// are already loaded in the kid document, so the canvas can use them for the
// Latin copy (matching the on-screen brand) instead of the bare system face.
// The two stacks mirror ui.ts's young/mature fallback order: the webfont first,
// then Noto Sans Bengali (so Bangla world titles / taglines shape in the brand
// face), then the system fallbacks. ui-serif is reserved for the certificate
// card below (its keepsake look is intentionally serif).
const FONT_DISPLAY = `'Baloo 2', 'Noto Sans Bengali', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif`;
const FONT_BODY = `'Nunito', 'Noto Sans Bengali', system-ui, -apple-system, 'Segoe UI', sans-serif`;

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
 *  (1080×1350) — the shape WhatsApp previews best.
 *
 *  #1817/#1818 — the card is big (1080×1350) and the Bangla text needs
 *  per-glyph shaping, so we ASYNC it: the paint is chunked across frames by
 *  yielding between draw phases. On a low-end device this stops the full-card
 *  paint from stalling the main thread (esp. while PhotoBoothScene / the game
 *  loop is running). Resolves the canvas when the last phase is painted; the
 *  pixels are byte-for-byte identical to the old synchronous draw. */
export async function renderShareCard(canvas: HTMLCanvasElement, d: ShareCardData): Promise<HTMLCanvasElement> {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, W, H);

  // ── background: deep navy + aurora blobs (matches the app shell) ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, NV_NAVY);
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
  // phase 1/4 done — let the browser breathe before the text-heavy pass
  await nextFrame();

  // ── header wordmark ──
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 56px ${FONT_DISPLAY}`;
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
  // phase 2/4 done — avatar badge painted, yield before the name + stats
  await nextFrame();

  // ── name (#1827 #2850: shrink-to-fit then ellipsize so a long Bangla name
  //     never clips off either edge of the canvas) ──
  ctx.font = `800 76px ${FONT_DISPLAY}`;
  ctx.fillStyle = "#ffffff";
  const nameFit = capName(ctx, d.name, W - 120, 40);
  ctx.font = `800 ${nameFit.font}px ${FONT_DISPLAY}`;
  ctx.fillText(nameFit.text, cx, cy + R + 90);

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
    ctx.font = `700 52px ${FONT_DISPLAY}`;
    ctx.fillStyle = NV_GOLD;
    ctx.fillText(String(v), x + tileW / 2, tilesY + 128);
    ctx.font = `600 30px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(d.statsLabels[i], x + tileW / 2, tilesY + 176);
  });
  // phase 3/4 done — stat tiles painted, yield before the worlds column
  await nextFrame();

  // ── worlds progress ──
  // #2848 — the worlds column used a fixed 92px pitch anchored near the bottom,
  // so with all 8 worlds rows 2+ were drawn below the 1350px edge (invisible)
  // and row 1 overlapped the footer. Measure the room available above the
  // footer band, size compact rows, and fit as many as the space allows; the
  // remainder is surfaced with a "+N more" line instead of silently hiding the
  // kid's progress. The footer anchors below the last drawn row, never at a
  // hardcoded H-130.
  const wTitleY = tilesY + tileH + 92;
  ctx.font = `700 44px ${FONT_DISPLAY}`;
  ctx.fillStyle = "#9be7ff";
  ctx.fillText(d.worldsTitle, cx, wTitleY);

  const rowsY = wTitleY + 64;
  const total = d.worlds.length;
  // Footer band: reserve enough room for a (possibly wrapped) tagline above the
  // card margin so the worlds column and the footer can never collide.
  const footerBand = 150;
  const avail = H - footerBand - rowsY;
  // Compact row: a 40px text line + a thin 8px bar (+4px gap) = ~52px/row.
  const rowTextH = 40;
  const barH = 8;
  const ROW_H = rowTextH + 14;
  const barX = 200;
  const barMax = W - 240;
  const showCount = Math.max(1, Math.floor(avail / ROW_H));
  const pitch = ROW_H;
  d.worlds.slice(0, showCount).forEach((w, i) => {
    const y = rowsY + i * pitch;
    const emojiX = 120;
    ctx.font = "30px 'Apple Color Emoji','Segoe UI Emoji',sans-serif";
    ctx.fillText(w.emoji, emojiX, y + rowTextH / 2 + 4);
    // title
    ctx.textAlign = "left";
    ctx.font = `600 30px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    const title = w.title.length > 22 ? w.title.slice(0, 21) + "…" : w.title;
    ctx.fillText(title, barX, y + rowTextH / 2);
    // count
    ctx.textAlign = "right";
    ctx.font = `700 28px ${FONT_DISPLAY}`;
    ctx.fillStyle = NV_GOLD;
    ctx.fillText(`${w.mastered}/${w.total}`, barMax, y + rowTextH / 2);
    ctx.textAlign = "center";
    // bar
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    rr(ctx, barX, y + rowTextH + 6, barMax - barX, barH, 5);
    ctx.fill();
    const pct = w.total > 0 ? w.mastered / w.total : 0;
    ctx.fillStyle = pct >= 1 ? NV_MINT : NV_SKY;
    rr(ctx, barX, y + rowTextH + 6, Math.max(14, (barMax - barX) * pct), barH, 5);
    ctx.fill();
  });
  // Surfaced remainder: the worlds that don't fit get a "+N more" line so a
  // multi-world kid's progress is never silently dropped off-canvas.
  let drawnBottom = rowsY + showCount * pitch;
  if (total > showCount) {
    const moreY = drawnBottom;
    ctx.font = `600 30px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`+${total - showCount} more`, cx, moreY);
    drawnBottom = moreY + 40;
  }
  // phase 4/4 done — worlds column painted, final yield before the footer
  await nextFrame();

  // ── footer tagline — anchored below the last drawn row so the fitted worlds
  //    column can never overlap it (falls back to the old margin for a short
  //    list where the natural anchor is higher up). ──
  const footY = Math.max(drawnBottom + 20, H - 130);
  ctx.font = `500 36px ${FONT_BODY}`;
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  wrapText(ctx, d.footer, W / 2, footY, W - 160, 50);

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
 *  printable look (cream sheet, gold double border) but phone-sized.
 *
 *  #1817/#1818 — async + chunked across frames just like renderShareCard so the
 *  big paint never blocks the main thread on a share tap. Resolves the canvas
 *  with byte-identical pixels to the old synchronous draw. */
export async function renderCertCard(canvas: HTMLCanvasElement, d: ShareCertData): Promise<HTMLCanvasElement> {
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
  // phase 1/4 done — sheet + gold border, yield before the lettering
  await nextFrame();

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
  // phase 2/4 done — owls + title, yield before the name block
  await nextFrame();

  // certifies / name / mastered
  ctx.font = "500 40px ui-serif, Georgia, serif";
  ctx.fillStyle = "#6a5430";
  ctx.fillText(d.certifies, cx, 400);
  ctx.font = "900 96px ui-serif, Georgia, serif";
  ctx.fillStyle = "#3a2a17";
  // #1827 #2850 — shrink-to-fit then ellipsize so a long Bangla name never
  // clips off the cream sheet's two edges.
  const certNameFit = capName(ctx, d.name, W - 240, 44);
  ctx.font = `900 ${certNameFit.font}px ui-serif, Georgia, serif`;
  ctx.fillText(certNameFit.text, cx, 500);
  ctx.font = "500 40px ui-serif, Georgia, serif";
  ctx.fillStyle = "#6a5430";
  ctx.fillText(d.mastered, cx, 590);

  // world
  ctx.font = "800 60px ui-serif, Georgia, serif";
  ctx.fillStyle = "#b84538";
  ctx.fillText(d.worldTitle, cx, 680);
  // phase 3/4 done — name + world, yield before the skill list
  await nextFrame();

  // skill count + list — show every mastered skill the on-screen cert shows
  // (up to six), with a tighter line height so the block still clears the
  // signature and footer below.
  ctx.font = "600 38px ui-serif, Georgia, serif";
  ctx.fillStyle = "#8a6a1f";
  ctx.fillText(d.skillCount, cx, 760);
  const listY = 800;
  const skillLineH = 40;
  const shownSkills = d.skills.slice(0, 6);
  shownSkills.forEach((s, i) => {
    const label = (s.titleBn && s.titleBn !== s.title) ? `${s.title} (${s.titleBn})` : s.title;
    // #3152 — the skill list is Latin+Bangla mixed copy; give it the brand
    // body stack (with Noto Sans Bengali) so Bangla skill names shape correctly.
    ctx.font = `500 33px ${FONT_BODY}`;
    ctx.fillStyle = "#5a4a28";
    wrapText(ctx, `•  ${label}`, cx, listY + i * skillLineH, W - 280, skillLineH);
  });
  // phase 4/4 done — skill list painted, yield before signature/footer
  await nextFrame();

  // withNova — sits just below the last list line, never past 1050
  const linesEnd = listY + shownSkills.length * skillLineH + 55;
  const withY = Math.max(960, Math.min(linesEnd, 1050));
  ctx.font = "500 35px ui-serif, Georgia, serif";
  ctx.fillStyle = "#6a5430";
  ctx.fillText(d.withNova, cx, withY);

  // footer: date on the left, Nova's signature on the right (like a real cert)
  const footY = 1120;
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

  // tagline — anchored so the last wrapped line lands at H-72, keeping the
  // whole Bangla 3-line footer on-canvas instead of clipping past 1350.
  ctx.font = `500 30px ${FONT_BODY}`;
  ctx.fillStyle = "rgba(90,74,40,0.7)";
  const footerLineH = 38;
  const footerLines = wrapLines(ctx, d.footer, W - 200);
  const footerStartY = H - 72 - (footerLines.length - 1) * footerLineH;
  wrapText(ctx, d.footer, cx, footerStartY, W - 200, footerLineH);

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

/** #1827 / #2850 — a very long kid name overflows the card. Measure the name
 *  and shrink the font until it fits the available width (down to a readable
 *  floor), then ellipsize anything still too wide so a 30+ glyph Bangla name
 *  stays fully on-canvas instead of clipping symmetrically off both edges.
 *  Never mutates stored data — it only shapes the drawn string. */
function capName(
  ctx: CanvasRenderingContext2D,
  name: string,
  maxW: number,
  minFont: number
): { text: string; font: number } {
  // Best-effort when measureText is unavailable (e.g. a minimal test canvas).
  if (typeof ctx.measureText !== "function") {
    return { text: name.slice(0, 24), font: minFont };
  }
  const base = maxFontPx(ctx);
  let font = base;
  while (font > minFont) {
    ctx.font = fontPx(ctx, font);
    if (ctx.measureText(name).width <= maxW) return { text: name, font };
    font -= 2;
  }
  // Even the floor doesn't fit — ellipsize to fit at the floor size.
  ctx.font = fontPx(ctx, minFont);
  const chars = Array.from(name);
  let text = name;
  while (chars.length && ctx.measureText(text + "…").width > maxW) {
    chars.pop();
    text = chars.join("");
  }
  return { text: chars.length ? text + "…" : "…", font: minFont };
}

/** Read the capName base font size off the current ctx.font (px only). */
function maxFontPx(ctx: CanvasRenderingContext2D): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
  return m ? Number(m[1]) : 76;
}

/** Write the ctx.font stack at a specific px size, preserving face/size order. */
function fontPx(ctx: CanvasRenderingContext2D, px: number): string {
  return ctx.font.replace(/(\d+(?:\.\d+)?)px/, `${px}px`);
}

/** #1817/#1818 — yield to the browser between card draw phases so a 1080×1350
 *  paint never blocks a whole frame on the main (game) thread. Degrades to a
 *  ~16ms setTimeout outside a browser/animation frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/** Break `text` into lines that each fit `maxW`. Words that are themselves
 *  wider than `maxW` (common with long Bangla compounds) are split character
 *  by character so every returned line is drawable at full width. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (ctx.measureText(word).width > maxW) {
      if (line) { lines.push(line); line = ""; }
      let piece = "";
      for (const ch of Array.from(word)) {
        const test = piece + ch;
        if (ctx.measureText(test).width > maxW && piece) {
          lines.push(piece);
          piece = ch;
        } else {
          piece = test;
        }
      }
      if (piece) line = piece;
      continue;
    }
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Center-wrap text on multiple lines (for the taglines). Every line is drawn
 *  centered on `cx`, including character-split fragments of a single long word. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, startY: number, maxW: number, lineH: number): string[] {
  ctx.textAlign = "center";
  const lines = wrapLines(ctx, text, maxW);
  lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineH));
  return lines;
}

/** Encode options for the share-card renderers (#1731). */
export interface CanvasBlobOptions {
  /** Output format. Default "png" — the lossless, byte-perfect format every
   *  share target (WhatsApp, iMessage, email) renders, and the one whose
   *  metadata we can strip (#93). "webp" is ~3-5× smaller for the 1080×1350
   *  cards at a quality level; "jpeg" is the fallback for very large cards
   *  where even WebP is overkill. */
  format?: "png" | "webp" | "jpeg";
  /** Lossy quality 0–1, used for "webp"/"jpeg" only (ignored for "png"). */
  quality?: number;
}

/** Turn a canvas into a share blob — PNG by default, with an opt-in WebP/JPEG
 *  format + quality for the cases that want a smaller card (#1731).
 *
 *  PNG (the default) keeps zero identifying metadata (#93): `stripPngMetadata`
 *  (from @numberverse/core) drops every tEXt/zTXt/iTXt/eXIf chunk, so a share
 *  card never carries a kid's name, a path, or EXIF into WhatsApp. WebP/JPEG
 *  output from a canvas carries no such container metadata, so those bytes pass
 *  through untouched — if a browser can't encode the requested format it falls
 *  back to PNG, which the `b.type === "image/png"` branch strips as usual.
 *
 *  #1817 — renderShareCard/renderCertCard are now async; this accepts either
 *  an already-resolved canvas or the promise itself, so both old (sync) and
 *  new (await) call sites stay valid. The metadata strip is unchanged (#1819). */
export async function canvasToBlob(
  canvas: HTMLCanvasElement | Promise<HTMLCanvasElement>,
  opts: CanvasBlobOptions = {}
): Promise<Blob> {
  const cv = await canvas;
  const format = opts.format ?? "png";
  return new Promise((resolve, reject) => {
    cv.toBlob((b) => {
      if (!b) { reject(new Error(`canvas toBlob(${format}) failed`)); return; }
      if (b.type === "image/png") {
        b.arrayBuffer()
          .then((ab) => resolve(new Blob([stripPngMetadata(ab)], { type: "image/png" })))
          .catch(reject);
      } else {
        resolve(b);
      }
    }, `image/${format}`, opts.quality);
  });
}

export type ShareResult = "shared" | "downloaded" | "unsupported" | "cancelled";

/** A fallback action the UI can surface after a native-share is unavailable:
 *  the PNG was downloaded and, when a WhatsApp caption URL is provided, the
 *  caller should render it as a tappable "Open WhatsApp" link (a real user
 *  gesture, so the popup is never blocked). */
export interface ShareFallback {
  kind: "downloaded";
  /** null when the caption URL was absent or blocked by the allowlist. */
  waUrl: string | null;
  filename: string;
}

/** #2855 — trigger the PNG download that accompanies the desktop fallback. A
 *  programmatic anchor click carries no user gesture, so a follow-up wa.me
 *  `window.open` would be popup-blocked; instead we do the download here and
 *  hand the (optionally allowlisted) waUrl back to the caller to surface as a
 *  visible, tappable "Open WhatsApp" link. Returns the resolved waUrl (or
 *  null). */
function downloadPng(blob: Blob, filename: string, waUrl: string): string | null {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href as string), 4000);
  // #790 — core is pure (no browser globals): the allowlist check lives in
  // core, while any window.open / anchor lives here in the kid app.
  return waUrl && isAllowedExternalUrl(waUrl) ? waUrl : null;
}

/**
 * Share a PNG: native Web Share API with the FILE (opens the device share sheet
 * incl. WhatsApp — the parent just picks WhatsApp and posts). If the user
 * dismisses the sheet (AbortError) it resolves "cancelled" (no forced download,
 * no reward). If the file share isn't supported (desktop), it downloads the PNG
 * and hands back the allowed waUrl so the UI can render a visible "Open
 * WhatsApp" link — a real tap gesture replaces the old gesture-less
 * `window.open`, which desktop browsers silently popup-block. Resolves the
 * outcome.
 */
export async function sharePng(
  blob: Blob,
  filename: string,
  caption: string,
  waUrl: string
): Promise<ShareResult | ShareFallback> {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename, text: caption });
      return "shared";
    }
  } catch (err) {
    // AbortError = user cancelled the sheet — not a failure, and NOT a fallback
    // trigger. Skip the download so a kid is never rewarded for a share that
    // didn't happen. Any other rejection still falls through to the download
    // fallback (unchanged legacy behavior).
    if (isAbortError(err)) return "cancelled";
  }
  try {
    const allowed = downloadPng(blob, filename, waUrl);
    return { kind: "downloaded", waUrl: allowed, filename };
  } catch {
    return "unsupported";
  }
}

/** Web Share's user-cancel rejection is a DOMException named "AbortError"; a
 *  non-standard environment may reject with a plain Error carrying that
 *  message. Either way it means the parent dismissed the sheet. */
function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return err instanceof Error && err.name === "AbortError";
}

/** WhatsApp share URL with just text (no image — the caption companions the
 *  downloaded PNG on desktop, or is the share-sheet text on mobile). */
export function waTextUrl(caption: string): string {
  return `https://wa.me/?text=${encodeURIComponent(caption)}`;
}