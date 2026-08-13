import Phaser from "phaser";
import { bad } from "./audio";
import { speak } from "./speech";
import { resetCombo } from "./celebrate";
import { prefersReducedMotion } from "./reducedMotion";
import { t } from "./i18n";
import { getKidName } from "./kidName";
import { NV_GOLD } from "./ui";  // tokenized #591

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
  const tip = scene.add
    .text(target.x, (target.y as number) - 64, msg, {
      fontSize: "17px",
      color: NV_GOLD,
      fontStyle: "bold",
      stroke: "#1d3557",
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(5000);
  scene.tweens.add({
    targets: tip,
    y: tip.y - 46,
    alpha: 0,
    duration: 950,
    ease: "Quad.easeOut",
    onComplete: () => tip.destroy(),
  });
}