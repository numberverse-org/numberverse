import Phaser from "phaser";
import { bad } from "./audio";
import { speak } from "./speech";
import { resetCombo } from "./celebrate";
import { prefersReducedMotion } from "./reducedMotion";
import { t } from "./i18n";
import { getKidName } from "./kidName";
import { NV_SKY, NV_NAVY } from "./ui"; // tokenized #591

/**
 * Wrong answers are a LEARNING MOMENT, never a punishment.
 * Instead of a harsh buzz + shake, we give a soft nudge and a friendly
 * "Almost! Try again 💪" bubble — so a miss still feels warm and safe.
 */
export function wrongTap(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container | Phaser.GameObjects.Text,
  opts: { tip?: boolean } = {}
) {
  bad();
  // a wrong answer breaks the chain — combo starts fresh next correct tap
  resetCombo(scene);
  // no shake when reduced motion is on (#350) — the warm bubble still shows
  if (!prefersReducedMotion()) {
    scene.tweens.add({
      targets: target,
      x: (target.x as number) - 5,
      duration: 60,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });
  }
  if (opts.tip === false) return;
  // personal touch: a child who hears their own name stays engaged longer
  const name = getKidName();
  speak(t("almost", { name }));
  const msg = t("almostBubble", { name });
  // #1362/#1382 — a wrong-answer nudge must NOT share the sunshine-gold praise
  // color. Give it a soft sky-blue speech bubble with navy text so "almost"
  // reads as "keep trying", never as "great!".
  // #1573 — the bubble was a small (17px) fast-fading blip. It now renders at a
  // readable 24px, floats HIGHER above the answer so the tap never hides it, and
  // lingers long enough to actually read. The fading bubble is also paired with
  // a small PERSISTENT 💪 cue that survives the fade until the next attempt.
  const tx = scene.add
    .text(0, 0, msg, {
      fontSize: "24px",
      color: NV_NAVY,
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: 240 },
    })
    .setOrigin(0.5);
  const padX = 16;
  const padY = 12;
  const bubbleW = Math.max(72, tx.width + padX * 2);
  const bubbleH = Math.max(44, tx.height + padY * 2);
  const bubble = scene.add.graphics();
  bubble.fillStyle(0x0b2545, 0.18);
  bubble.fillRoundedRect(-bubbleW / 2 - 2, -bubbleH / 2 + 5, bubbleW + 4, bubbleH + 4, 20);
  bubble.fillStyle(Phaser.Display.Color.HexStringToColor(NV_SKY).color, 0.96);
  bubble.fillRoundedRect(-bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH, 20);
  bubble.fillTriangle(-7, bubbleH / 2 - 2, 7, bubbleH / 2 - 2, 0, bubbleH / 2 + 11);
  const tip = scene.add.container(target.x, (target.y as number) - 96, [bubble, tx]).setDepth(5000);

  // Persistent "keep trying" cue — a little 💪 that stays put (gently bobbing)
  // after the bubble fades, so a second look still shows "this answer is being
  // nudged". Replaced on the next wrong tap and gone with the scene.
  const prevCue = scene.data.get("nv-almost-cue") as Phaser.GameObjects.Text | undefined;
  if (prevCue && prevCue.active) {
    scene.tweens.killTweensOf(prevCue);
    prevCue.destroy();
  }
  const cueX = target.x + Math.round((target.width || 0) / 2) + 26;
  const cue = scene.add
    .text(cueX, (target.y as number) - 92, "💪", { fontSize: "28px" })
    .setOrigin(0.5)
    .setDepth(4990);
  scene.data.set("nv-almost-cue", cue);
  if (!prefersReducedMotion()) {
    scene.tweens.add({ targets: cue, y: cue.y - 7, duration: 760, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }
  if (!scene.data.get("nv-almost-cue-wired")) {
    scene.data.set("nv-almost-cue-wired", true);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      const c = scene.data.get("nv-almost-cue") as Phaser.GameObjects.Text | undefined;
      if (c && c.active) {
        scene.tweens.killTweensOf(c);
        c.destroy();
      }
    });
  }

  // Bubble: rise gently, HOLD in place, then fade out — total ~2.7s so a
  // 6-year-old has time to read the warm nudge.
  scene.tweens.add({
    targets: tip,
    y: tip.y - 32,
    duration: 480,
    ease: "Quad.easeOut",
  });
  scene.tweens.add({
    targets: tip,
    alpha: 0,
    delay: 1650, // hold readable, then fade
    duration: 700,
    ease: "Quad.easeOut",
    onComplete: () => tip.destroy(),
  });
}