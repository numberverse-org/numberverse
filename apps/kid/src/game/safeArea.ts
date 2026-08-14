/**
 * Device safe-area insets (px) — notch top, home-indicator bottom, etc.
 * Mirrored from CSS env(safe-area-inset-*) by :root --sat/--sab/--sal/--sar
 * in styles.css.
 *
 * The Phaser canvas is full-bleed (edge-to-edge, under the phone's system UI),
 * so scenes must offset bottom-anchored question/answer rows and prompts by
 * `bottom` to keep them clear of the Samsung home bar / gesture area.
 */
export type SafeInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

const EMPTY: SafeInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * #1099 — getComputedStyle() forces a synchronous layout read. SAB()/SAT() are
 * referenced across ~130 game files and a single scene layout() calls them
 * several times per frame, so the insets are read ONCE into a module singleton
 * and re-read only on resize/orientationchange (and only when they changed).
 */
let cached: SafeInsets | null = null;
let listening = false;

function readInsets(): SafeInsets {
  const cs = getComputedStyle(document.documentElement);
  const parse = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: parse(cs.getPropertyValue("--sat")),
    bottom: parse(cs.getPropertyValue("--sab")),
    left: parse(cs.getPropertyValue("--sal")),
    right: parse(cs.getPropertyValue("--sar")),
  };
}

function changed(next: SafeInsets): boolean {
  return (
    !cached ||
    next.top !== cached.top ||
    next.bottom !== cached.bottom ||
    next.left !== cached.left ||
    next.right !== cached.right
  );
}

function refresh() {
  const next = readInsets();
  if (changed(next)) cached = next;
}

function warm() {
  if (typeof document === "undefined") return;
  if (!cached) cached = readInsets();
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
  }
}

export function safeInsets(): SafeInsets {
  warm();
  return cached ?? EMPTY;
}

/** Convenience accessor for the bottom home-indicator inset (px). */
export const SAB = () => safeInsets().bottom;
/** Convenience accessor for the top notch inset (px). */
export const SAT = () => safeInsets().top;
