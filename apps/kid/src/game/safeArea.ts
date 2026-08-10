/**
 * Device safe-area insets (px) — notch top, home-indicator bottom, etc.
 * Mirrored from CSS env(safe-area-inset-*) by :root --sat/--sab/--sal/--sar
 * in styles.css.
 *
 * The Phaser canvas is full-bleed (edge-to-edge, under the phone's system UI),
 * so scenes must offset bottom-anchored question/answer rows and prompts by
 * `bottom` to keep them clear of the Samsung home bar / gesture area.
 */
export function safeInsets(): { top: number; bottom: number; left: number; right: number } {
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

/** Convenience accessor for the bottom home-indicator inset (px). */
export const SAB = () => safeInsets().bottom;
/** Convenience accessor for the top notch inset (px). */
export const SAT = () => safeInsets().top;
