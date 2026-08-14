/**
 * 🦉 #690 — dynamic render resolution for the island.
 *
 * three renders at CSS size × pixelRatio. Under sustained load we drop the
 * ratio a step (half-res + CSS upscale on very low-end phones); when frames
 * recover we climb back. This is the single biggest mobile perf lever and it
 * never blocks input — the mesh/LOD budget (#688) is unchanged.
 *
 * Budgets (measured over a 60-frame window, delta = ms per frame):
 *   • sustained slow (> 22 ms ≈ < 45 fps)  → -0.25 dpr, floor 0.6
 *   • sustained fast (< 13 ms ≈ > 75 fps)  → +0.25 dpr, cap 1.5
 *   • reduced-motion guests start lower (0.75) and never climb past 1.25 —
 *     fewer pixels to push is friendlier to battery and vestibular-sensitive
 *     low-end devices.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

const MIN_DPR = 0.6;
const MAX_DPR = 1.5;
const REDUCED_MAX = 1.25;
const REDUCED_START = 0.75;
const STEP = 0.25;
const SLOW_MS = 22;
const FAST_MS = 13;
const WINDOW = 60;

export function DynamicResolution({ reduced }: { reduced: boolean }) {
  const gl = useThree((s) => s.gl);
  const budget = useRef<number[]>([]);
  const target = useRef(reduced ? REDUCED_START : 1);
  const started = useRef(false);

  useFrame((_, delta) => {
    const list = budget.current;
    list.push(delta * 1000);
    if (list.length < WINDOW) return;
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    list.length = 0;

    if (!started.current) {
      started.current = true;
      gl.setPixelRatio(target.current);
      return;
    }
    const cap = reduced ? REDUCED_MAX : MAX_DPR;
    let next = target.current;
    if (avg > SLOW_MS) next = Math.max(MIN_DPR, next - STEP);
    else if (avg < FAST_MS) next = Math.min(cap, next + STEP);
    if (next !== target.current) {
      target.current = next;
      gl.setPixelRatio(next);
    }
  });
  return null;
}
