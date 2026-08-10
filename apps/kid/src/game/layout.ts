import Phaser from "phaser";
import { SAB } from "./safeArea";

export interface AnswerRow {
  /** Circle radius that fits `count` buttons on the current canvas width. */
  radius: number;
  /** Vertical center of the row (near the bottom of the canvas). */
  y: number;
  /** X position for the i-th button (the row is centered as a whole). */
  xFor: (i: number) => number;
}

/**
 * Layout an answer row that ALWAYS fits the canvas width.
 * `maxRadius` is the preferred (largest) radius; the row shrinks automatically
 * when `count` buttons would overflow a narrow phone screen (e.g. 4 buttons of
 * r=50 on a 390px screen used to spill past the right edge).
 */
export function answerRow(
  scene: Phaser.Scene,
  count: number,
  maxRadius: number,
  gap = 12,
  bottomPad = 64
): AnswerRow {
  const { width, height } = scene.scale;
  const available = width - 20; // 10px breathing room each side
  const radius = Math.min(maxRadius, Math.max(28, (available - gap * (count - 1)) / (count * 2)));
  const spacing = radius * 2 + gap;
  const startX = width / 2 - (spacing * (count - 1)) / 2;
  // bottomPad is measured from the canvas edge — the canvas is full-bleed now,
  // so lift the row above the phone home-indicator/gesture area too.
  return { radius, y: height - bottomPad - SAB(), xFor: (i) => startX + i * spacing };
}
