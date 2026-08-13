/** WebGL capability probe (#684). The 3D island is opt-in: if WebGL is
 *  missing or blocked, we never mount the R3F canvas — the 2D Nova home
 *  stays reachable. */
export function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
