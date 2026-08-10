import Phaser from "phaser";
import { comboChime } from "./audio";

/**
 * Combo + celebration engine — the "juice" of a correct answer.
 *
 * Every correct tap nudges a per-scene combo counter (reset on any wrong tap
 * and on scene shutdown). As the combo climbs, the feedback escalates:
 *
 *   combo 1 → the scene's own pop + sparkle (base)
 *   combo 2 → "Nice! ✨" floating text
 *   combo 3 → confetti burst + "WOW! 🎉" + rising chime
 *   combo 5 → bigger burst + "AMAZING! 🌟"
 *   combo 7+ → full celebration + "SUPER STAR! ⭐"
 *
 * Kids chase the combo — consecutive correct answers turn into visible,
 * audible fireworks. Wrong answers quietly reset it (learning stays warm).
 */

/** Current combo for a scene (0 = none). Resets on scene shutdown. */
export function comboOf(scene: Phaser.Scene): number {
  let v = scene.data.get("nv:combo") as number | undefined;
  if (v === undefined) {
    v = 0;
    scene.data.set("nv:combo", v);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.data.remove("nv:combo");
      scene.data.remove("nv:combo-fx");
    });
  }
  return v;
}

export function bumpCombo(scene: Phaser.Scene): number {
  const n = comboOf(scene) + 1;
  scene.data.set("nv:combo", n);
  return n;
}

export function resetCombo(scene: Phaser.Scene): void {
  scene.data.set("nv:combo", 0);
  // kill any lingering combo float-text from a previous burst
  const prev = scene.data.get("nv:combo-fx") as Phaser.GameObjects.Text | undefined;
  if (prev && prev.active) {
    scene.tweens.killTweensOf(prev);
    prev.destroy();
  }
  scene.data.remove("nv:combo-fx");
}

/** Soft floating text — "+5", "WOW!", anything. Pops up, drifts, fades. */
export function floatText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color = "#ffd166",
  size = 30,
  vy = -72
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: "'Baloo 2', 'Nunito', system-ui, sans-serif",
      fontSize: `${size}px`,
      color,
      fontStyle: "800",
      stroke: "rgba(4,14,36,0.9)",
      strokeThickness: Math.max(3, Math.round(size / 6)),
      shadow: { offsetX: 0, offsetY: 2, color: "rgba(3,12,34,0.7)", blur: 6, stroke: true, fill: true },
    })
    .setOrigin(0.5)
    .setDepth(5950);
  t.setScale(0.6);
  scene.tweens.add({
    targets: t,
    y: y + vy,
    x: x + Phaser.Math.Between(-18, 18),
    scale: 1.2,
    alpha: 0,
    duration: 950,
    ease: "Quad.easeOut",
    onComplete: () => t.destroy(),
  });
  return t;
}

/** One burst of kid confetti — colored bits fly up, spin, and settle out. */
export function confettiBurst(scene: Phaser.Scene, x: number, y: number, n = 24) {
  const colors = [0xffd166, 0x4cc9f0, 0xff8fa3, 0x2ec4b6, 0xc4b5fd, 0xffb35c];
  for (let i = 0; i < n; i++) {
    const w = Phaser.Math.Between(6, 12);
    const h = Phaser.Math.Between(4, 9);
    const r = scene.add
      .rectangle(x, y, w, h, Phaser.Math.RND.pick(colors))
      .setDepth(5900)
      .setAngle(Phaser.Math.Between(0, 360));
    const ang = Phaser.Math.FloatBetween(-Math.PI, -0.15); // up + sideways
    const speed = Phaser.Math.Between(140, 360);
    const vx = Math.cos(ang) * speed;
    const vUp = Math.abs(Math.sin(ang)) * speed * 0.9;
    scene.tweens.add({
      targets: r,
      x: x + vx,
      y: y - vUp,
      angle: Phaser.Math.Between(-540, 540),
      alpha: 0,
      duration: Phaser.Math.Between(650, 1200),
      ease: "Quad.easeOut",
      onComplete: () => r.destroy(),
    });
  }
}

/** Star burst — a ring of little stars, for the big moments. */
export function starBurst(scene: Phaser.Scene, x: number, y: number, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dist = Phaser.Math.Between(70, 120);
    const s = scene.add
      .text(x, y, "⭐", { fontSize: `${Phaser.Math.Between(16, 26)}px` })
      .setOrigin(0.5)
      .setDepth(5900);
    scene.tweens.add({
      targets: s,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      scale: 0.2,
      alpha: 0,
      duration: 700,
      ease: "Quad.easeOut",
      onComplete: () => s.destroy(),
    });
  }
}

/** The escalating correct-answer celebration. Call from shared correct paths. */
export function correctCelebrate(scene: Phaser.Scene, x: number, y: number) {
  const combo = bumpCombo(scene);
  if (combo < 2) return; // base pop + sparkle handled by the scene itself

  if (combo === 2) {
    floatText(scene, x, y - 40, "Nice! ✨", "#9be1a6", 24);
    return;
  }
  if (combo === 3) {
    comboChime(combo);
    confettiBurst(scene, x, y, 16);
    const t = floatText(scene, x, y - 52, "WOW! 🎉", "#ffd166", 30);
    scene.data.set("nv:combo-fx", t);
    return;
  }
  if (combo === 4 || combo === 5) {
    comboChime(combo);
    confettiBurst(scene, x, y, 26);
    starBurst(scene, x, y, 6);
    const t = floatText(scene, x, y - 58, "AMAZING! 🌟", "#ff8fa3", 32);
    scene.data.set("nv:combo-fx", t);
    return;
  }
  // 6+ → everything
  comboChime(combo);
  confettiBurst(scene, x, y, 38);
  starBurst(scene, x, y, 10);
  const t = floatText(scene, x, y - 64, "SUPER STAR! ⭐", "#c4b5fd", 34);
  scene.data.set("nv:combo-fx", t);
}
