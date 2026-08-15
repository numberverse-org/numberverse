/**
 * Render-layer maturity flag (#1040).
 *
 * The kid app already maps age → curriculum band in lib/journey (kidBand /
 * bandForAge). Phaser scenes and shared render helpers (ui / backgrounds /
 * celebrate / garden) can't import that module without a cycle (journey.ts
 * imports game/ui), so the ACTIVE band is mirrored here once per kid switch by
 * App.tsx. Everything in the render layer reads `matureRender()` to decide
 * whether to use the younger "nursery" surface (bands 1–4) or the older-kid
 * register (bands 5–7).
 */

let currentBand = 1;

/** Mirror the active kid's age band into the render layer (1–7, clamped). */
export function setRenderBand(band: number): void {
  const n = Number.isFinite(band) ? Math.round(band) : 1;
  currentBand = Math.min(7, Math.max(1, n));
}

/** The band the render layer is currently styling for (default 1). */
export function getRenderBand(): number {
  return currentBand;
}

/** True when the active kid is in the older-kid register (band 5+, ~10yo+). */
export function matureRender(): boolean {
  return currentBand >= 5;
}
