import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import { prefersReducedMotion } from "./reducedMotion";
import {
  useKidStore,
  defaultNova,
  NOVA_BIRTHDAY_COINS,
  speciesEmoji,
  speciesById,
} from "../store";

/**
 * 🎂 PET BIRTHDAY — pet mini-game #615 (docs/plans/104-pet-minigames.md).
 *
 * A party scene with cake + confetti when a pet reaches grown (petStage 3),
 * tying to NOVA_BIRTHDAY_COINS (awarded once at the stage-3 boundary via the
 * store). Once per pet (guarded on petStage). Reduced-motion → gentle
 * confetti, no screen shake.
 */

const T = {
  en: {
    title: "🎂 Pet Birthday!",
    hint: "Tap the cake to celebrate Nova's big day!",
    cake: "Tap the cake!",
    party: "Happy birthday, Nova! 🎉🎂",
    coins: `Party gift: +${"$"} coins! 🎁`,
    cap: "You earned ALL your coins today! 🪙✨",
    close: "✕",
  },
  bn: {
    title: "🎂 পোষা প্রাণীর জন্মদিন!",
    hint: "নোভার বড় দিন উদযাপন করতে কেক ছোঁও!",
    cake: "কেক ছোঁও!",
    party: "শুভ জন্মদিন, নোভা! 🎉🎂",
    coins: `পার্টির উপহার: +${"$"} কয়েন! 🎁`,
    cap: "আজ সব কয়েন জিতেছ! 🪙✨",
    close: "✕",
  },
} as const;

export class PetBirthdayScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private reduced = false;
  private hint!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;
  private cake!: Phaser.GameObjects.Text;
  private nova!: Phaser.GameObjects.Text;

  private celebrated = false;

  constructor() {
    super("PetBirthday");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.reduced = prefersReducedMotion();
    gameBackground(this, "sunset");
    this.drawHeader();
    this.drawStage();
    this.input.on("pointerdown", () => this.tapCake());
    onSceneResize(this, () => this.layout());
  }

  private t() {
    return this.lang === "bn" ? T.bn : T.en;
  }

  private drawHeader() {
    const T = this.t();
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T.title, txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T.hint, txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.msg = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, "", txt(20, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setDepth(900);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawStage() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    const species = speciesById(nova.species);
    this.nova = this.add
      .text(this.scale.width / 2, this.scale.height - 70 - SAB(), speciesEmoji(nova.species, 3), txt(100, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(50);
    this.cake = this.add
      .text(this.scale.width / 2, this.scale.height - 40 - SAB(), "🎂", txt(72, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
    // a gentle idle bounce for the cake
    if (!this.reduced) {
      this.tweens.add({ targets: this.cake, y: this.cake.y - 6, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private tapCake() {
    if (this.celebrated) return;
    this.celebrated = true;
    pop();
    win();
    speak(this.t().party);
    this.burstEmoji("🎉", 18, 36);
    this.burstEmoji("🎂", 6, 30);
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, NOVA_BIRTHDAY_COINS);
    if (granted > 0) {
      const msgText = (this.lang === "bn" ? T.bn.coins : T.en.coins).replace("$", String(granted));
      speak(msgText);
      this.msg.setText(msgText);
    } else {
      speak(this.t().cap);
      this.msg.setText(this.t().cap);
    }
    this.time.delayedCall(2500, () => this.msg.setText(""));
  }

  private burstEmoji(emoji: string, n: number, size: number) {
    for (let i = 0; i < n; i++) {
      const x = Phaser.Math.Between(30, this.scale.width - 30);
      const y = Phaser.Math.Between(this.scale.height * 0.3, this.scale.height * 0.72);
      const m = this.add
        .text(x, y, emoji, txt(Phaser.Math.Between(18, size), "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(400);
      this.tweens.add({
        targets: m,
        y: m.y - Phaser.Math.Between(36, 80),
        x: m.x + Phaser.Math.Between(-24, 24),
        alpha: 0,
        scale: 1.4,
        duration: Phaser.Math.Between(700, 1100),
        onComplete: () => m.destroy(),
      });
    }
  }

  private layout() {
    if (!this.hint || !this.closeBtn) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.msg.setPosition(this.scale.width / 2, this.scale.height * 0.4);
    this.closeBtn.setPosition(26, 30 + SAT());
    const y = this.scale.height - 40 - SAB();
    if (this.cake) this.cake.setPosition(this.scale.width / 2, y);
    if (this.nova) this.nova.setPosition(this.scale.width / 2, this.scale.height - 70 - SAB());
  }
}
