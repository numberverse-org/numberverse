import Phaser from "phaser";
import { comboChime } from "./audio";
import { t as sceneT } from "./i18n";
import { prefersReducedMotion } from "./reducedMotion";
import { NV_GOLD, NV_PINK, NV_SKY, NV_ORANGE } from "./ui"; // tokenized #591

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
 *   combo 9+ → "MASTERY MOMENT! 🏆" — the ceiling keeps climbing
 *
 * Kids chase the combo — consecutive correct answers turn into visible,
 * audible fireworks. Wrong answers quietly reset it (learning stays warm).
 *
 * #1061/#1062 — the engine also reads the ROUND'S DIFFICULTY (1-based level
 * index) so EFFORT escalates independently of streak: a hard level-4+ problem
 * gets a "Tough one! 💪" nod even on the first correct answer, and the combo
 * words gain a hard-problem register. Callers pass it via the optional
 * `{ difficulty }` arg, or a scene can set `this.data.set("nv:difficulty", n)`
 * once per round and every shared reward path picks it up.
 */

/** A round at this difficulty (or above) counts as a hard problem. */
export const HARD_DIFFICULTY = 4;

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
  color = NV_GOLD,
  size = 30,
  vy = -72
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: "'Baloo 2', 'Noto Sans Bengali', 'Nunito', system-ui, sans-serif",
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

/** One burst of kid confetti — colored bits fly up, spin, and settle out.
 *  Honours reduced motion (#350): no particles, the moment still registers via
 *  the floating text + chime the caller already fires. */
export function confettiBurst(scene: Phaser.Scene, x: number, y: number, n = 24) {
  if (prefersReducedMotion()) return;
  // #784 — NV_* tokens for the colors that have one; the teal/lavender extras
  // are intentional land accents without a token yet.
  const colors = [
    Phaser.Display.Color.HexStringToColor(NV_GOLD).color,
    Phaser.Display.Color.HexStringToColor(NV_SKY).color,
    Phaser.Display.Color.HexStringToColor(NV_PINK).color,
    0x2ec4b6,
    0xc4b5fd,
    Phaser.Display.Color.HexStringToColor(NV_ORANGE).color,
  ];
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

/** Star burst — a ring of little stars, for the big moments. Honours reduced
 *  motion (#350) like confettiBurst. */
export function starBurst(scene: Phaser.Scene, x: number, y: number, n = 10) {
  if (prefersReducedMotion()) return;
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
export function correctCelebrate(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts?: { difficulty?: number }
) {
  const difficulty =
    opts?.difficulty ?? (scene.data.get("nv:difficulty") as number | undefined) ?? 0;
  const hard = difficulty >= HARD_DIFFICULTY;
  const combo = bumpCombo(scene);
  if (combo < 2) {
    // #1062 — EFFORT escalates even at combo 1: a hard problem is a win on its
    // own, so it gets a small star burst + a "Tough one!" nod (the scene's own
    // pop/sparkle still fires on every correct).
    if (hard) {
      starBurst(scene, x, y, 4);
      floatText(scene, x, y - 40, "Tough one! 💪", "#9be1a6", 22);
    }
    return; // base pop + sparkle handled by the scene itself
  }

  // #1199 — surface the STREAK uniformly. Every scene that routes through the
  // shared reward path shows a small "x{n} 🔥" chip floating up above the
  // escalation word, so a 5-in-a-row is visibly a 5-in-a-row everywhere (it
  // used to be tracked by celebrate.ts but only a handful of scenes displayed
  // it — the meter reset on every miss with almost nowhere showing the climb).
  // #1444 — keep the chip high enough that it never stacks/collides with the
  // escalation word below it (both rise from the same tap point).
  floatText(scene, x, y - 116, `x${combo} 🔥`, "#ffe8a3", 20);

  // #1191 — hard-band answers ESCALATE ONE TIER SOONER: a hard problem at
  // combo 3 already reads AMAZING, at combo 5 SUPER STAR. Easy work still has
  // to climb the full ladder — the fireworks stay earned.
  const tier = combo + (hard ? 1 : 0);
  if (tier === 2) {
    floatText(scene, x, y - 40, "Nice! ✨", "#9be1a6", 24);
    return;
  }
  if (tier === 3) {
    comboChime(combo);
    confettiBurst(scene, x, y, 16);
    const t = floatText(scene, x, y - 52, hard ? "WOW! 🔥" : "WOW! 🎉", NV_GOLD, 30);
    scene.data.set("nv:combo-fx", t);
    return;
  }
  if (tier === 4 || tier === 5) {
    comboChime(combo);
    confettiBurst(scene, x, y, hard ? 34 : 26);
    starBurst(scene, x, y, hard ? 9 : 6);
    const t = floatText(scene, x, y - 58, hard ? "AMAZING! 🔥" : "AMAZING! 🌟", NV_PINK, 32);
    scene.data.set("nv:combo-fx", t);
    return;
  }
  // #1445 — the ceiling keeps climbing: a long chain (combo 9+) breaks out of
  // the flat "SUPER STAR" band into a distinct mastery moment with a bigger
  // burst. Hard-problem answers reach it one tier sooner, like every rung.
  if (tier >= 9) {
    comboChime(combo);
    confettiBurst(scene, x, y, hard ? 72 : 54);
    starBurst(scene, x, y, hard ? 20 : 14);
    const fx = floatText(
      scene,
      x,
      y - 68,
      hard ? sceneT("ceMasteryHard") : sceneT("ceMastery"),
      "#ffe8a3",
      38
    );
    scene.data.set("nv:combo-fx", fx);
    return;
  }
  // 6+ → everything (a hard-problem SUPER STAR lands bigger)
  comboChime(combo);
  confettiBurst(scene, x, y, hard ? 50 : 38);
  starBurst(scene, x, y, hard ? 14 : 10);
  const t = floatText(scene, x, y - 64, hard ? "SUPER STAR! 💫🔥" : "SUPER STAR! ⭐", "#c4b5fd", 34);
  scene.data.set("nv:combo-fx", t);
}