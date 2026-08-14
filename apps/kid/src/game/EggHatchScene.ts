import Phaser from "phaser";
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
  speciesEmoji,
  speciesById,
} from "../store";

/**
 * 🥚 EGG HATCH — pet mini-game #609 (docs/plans/104-pet-minigames.md).
 *
 * A one-time tap-to-hatch ceremony: when a pet's egg is ready (petProgress
 * full / petStage transitions 0→1), the kid taps the egg to hatch it with
 * confetti + speech. Feeds the egg→hatchling transition. No coin — it's a
 * milestone, not a grind. Fires once per pet (guarded via the achievements
 * album with the "pet-hatch" id). If the kid leaves mid-ceremony, the pet is
 * still hatched.
 */

const T = {
  en: {
    title: "🥚 Hatch Time!",
    hint: "Tap the egg to hatch your pet!",
    tap: "Tap the egg!",
    hatching: "Crack crack…!",
    hatched: "It hatched! Say hi to your new pet! 🎉",
    done: "New friend! 🐣✨",
    close: "✕",
  },
  bn: {
    title: "🥚 ডিম ফোটার সময়!",
    hint: "ডিম ছুঁয়ে তোমার পোষা প্রাণী বের করো!",
    tap: "ডিম ছোঁও!",
    hatching: "টক টক…!",
    hatched: "ডিম ফুটেছে! তোমার নতুন পোষা প্রাণী! 🎉",
    done: "নতুন বন্ধু! 🐣✨",
    close: "✕",
  },
} as const;

export class EggHatchScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private reduced = false;
  private hint!: Phaser.GameObjects.Text;
  private egg!: Phaser.GameObjects.Text;
  private baby!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;
  private tapZone!: Phaser.GameObjects.Rectangle;

  private hatched = false;
  private taps = 0;

  constructor() {
    super("EggHatch");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.reduced = prefersReducedMotion();
    gameBackground(this, "candy");
    this.drawHeader();
    this.drawEgg();
    this.input.on("pointerdown", () => this.tapEgg());
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
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
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawEgg() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    const species = speciesById(nova.species);
    // show the species' stage-1 hatchling as the reveal
    this.baby = this.add
      .text(this.scale.width / 2, this.scale.height - 70 - SAB(), speciesEmoji(nova.species, 1), txt(110, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setAlpha(0);
    this.egg = this.add
      .text(this.scale.width / 2, this.scale.height - 70 - SAB(), "🥚", txt(110, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.tapEgg());
  }

  private tapEgg() {
    if (this.hatched) return;
    this.taps += 1;
    pop();
    if (this.taps >= 3) {
      this.hatched = true;
      win();
      this.egg.destroy();
      this.baby.setAlpha(1);
      this.tweens.add({ targets: this.baby, y: this.baby.y - 30, duration: 420, ease: "Back.easeOut" });
      speak(this.t().hatched);
      this.burstEmoji("🎉", 16, 36);
      this.time.delayedCall(600, () => speak(this.t().done));
    } else {
      // egg wobbles — nearly there
      this.tweens.add({ targets: this.egg, angle: Phaser.Math.Between(-6, 6), duration: 90, yoyo: true, repeat: 1 });
      if (this.taps === 1) speak(this.t().hatching);
    }
  }

  private burstEmoji(emoji: string, n: number, size: number) {
    for (let i = 0; i < n; i++) {
      const x = Phaser.Math.Between(40, this.scale.width - 40);
      const y = Phaser.Math.Between(this.scale.height * 0.3, this.scale.height * 0.7);
      const m = this.add
        .text(x, y, emoji, txt(Phaser.Math.Between(20, size), "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(400);
      this.tweens.add({
        targets: m,
        y: m.y - Phaser.Math.Between(40, 80),
        x: m.x + Phaser.Math.Between(-26, 26),
        alpha: 0,
        scale: 1.5,
        duration: Phaser.Math.Between(700, 1100),
        onComplete: () => m.destroy(),
      });
    }
  }

  private layout() {
    if (!this.hint || !this.closeBtn) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    const y = this.scale.height - 70 - SAB();
    if (this.egg) this.egg.setPosition(this.scale.width / 2, y);
    if (this.baby) this.baby.setPosition(this.scale.width / 2, y);
  }
}
