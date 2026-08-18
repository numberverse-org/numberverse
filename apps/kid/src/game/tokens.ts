/**
 * 🎨 Shared color tokens — the single source for the kid app's named colors.
 *
 * These lived in ui.ts, but ui.ts imports `correctCelebrate` from celebrate.ts
 * and celebrate.ts imports the tokens from ui.ts — a hard runtime import cycle
 * (#1939). Moving the constants here (and re-exporting from ui.ts so the 167
 * existing importers keep working unchanged) breaks the cycle: celebrate.ts
 * imports from this leaf module, ui.ts imports celebrate, no back-edge.
 *
 * Keep these in sync with the `--nv-*` vars in styles/boot.css `:root`.
 */
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
