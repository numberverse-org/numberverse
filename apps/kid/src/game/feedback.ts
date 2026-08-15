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
  const tx = scene.add
    .text(0, 0, msg, {
      fontSize: "17px",
      color: NV_NAVY,
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: 240 },
    })
    .setOrigin(0.5);
  const padX = 14;
  const padY = 9;
  const bubbleW = Math.max(64, tx.width + padX * 2);
  const bubbleH = Math.max(38, tx.height + padY * 2);
  const bubble = scene.add.graphics();
  bubble.fillStyle(0x0b2545, 0.18);
  bubble.fillRoundedRect(-bubbleW / 2 - 2, -bubbleH / 2 + 5, bubbleW + 4, bubbleH + 4, 20);
  bubble.fillStyle(Phaser.Display.Color.HexStringToColor(NV_SKY).color, 0.96);
  bubble.fillRoundedRect(-bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH, 20);
  bubble.fillTriangle(-7, bubbleH / 2 - 2, 7, bubbleH / 2 - 2, 0, bubbleH / 2 + 11);
  const tip = scene.add.container(target.x, (target.y as number) - 64, [bubble, tx]).setDepth(5000);
  scene.tweens.add({
    targets: tip,
    y: tip.y - 46,
    alpha: 0,
    duration: 950,
    ease: "Quad.easeOut",
    onComplete: () => tip.destroy(),
  });
}