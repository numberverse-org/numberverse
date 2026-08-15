import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import { prefersReducedMotion } from "./reducedMotion";
import { useKidStore, defaultNova, speciesEmoji } from "../store";

/**
 * 🌙 TUCK-IN — pet mini-game #601 (docs/plans/104-pet-minigames.md).
 *
 * A calm bedtime ritual with no points or timers: tap to dim the lights, tuck
 * Nova under a blanket, and say goodnight. Uses the nap/sleepy vibe. No coin —
 * calm > grind. Muted device → the scene completes visually.
 */

const T = {
  en: {
    title: "🌙 Tuck-in",
    hint: "Get Nova ready for bed!",
    dim: "Tap to dim the lights",
    tuck: "Tap to tuck Nova in",
    night: "Tap to say goodnight",
    goodnight: "Goodnight, Nova… sweet dreams! 🌙💤",
    newNight: "🌞 New night",
    close: "✕",
  },
  bn: {
    title: "🌙 রাতে ঘুম",
    hint: "নোভাকে ঘুমের জন্য তৈরি করো!",
    dim: "আলো কমানোর জন্য ছোঁও",
    tuck: "নোভাকে কম্বল দিতে ছোঁও",
    night: "শুভরাত্রি বলতে ছোঁও",
    goodnight: "শুভরাত্রি, নোভা… মিষ্টি স্বপ্ন! 🌙💤",
    newNight: "🌞 নতুন রাত",
    close: "✕",
  },
} as const;

export class TuckInScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private nova!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;
  private dim!: Phaser.GameObjects.Rectangle;
  private blanket!: Phaser.GameObjects.Rectangle;
  private nightText!: Phaser.GameObjects.Text;
  private resetBtn!: Phaser.GameObjects.Text;
  private tapZone!: Phaser.GameObjects.Rectangle;

  private step = 0; // 0 = dim, 1 = tuck, 2 = goodnight
  private done = false;


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("TuckIn");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "sunset");
    this.drawHeader();
    this.drawNova();
    this.wireSteps();
    this.updateCta();
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
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.scale.width / 2, this.scale.height - 40 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(92, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100);
    // blanket — hidden until step 2
    this.blanket = this.add
      .rectangle(this.nova.x, this.nova.y - 6, 120, 26, 0x93c5fd, 0.95)
      .setDepth(150)
      .setVisible(false);
  }

  private wireSteps() {
    this.dim = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a1030, 0).setOrigin(0).setDepth(60);
    this.nightText = this.add
      .text(this.scale.width / 2, this.scale.height * 0.3, "🌙 💤", txt(40, "#ffffff"))
      .setOrigin(0.5)
      .setDepth(400)
      .setAlpha(0);
    this.resetBtn = this.add
      .text(this.scale.width / 2, this.scale.height * 0.82, "", txt(20, NV_GOLD, { bold: true }))
      .setOrigin(0.5)
      .setDepth(500)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });
    // full-screen tap advances the ritual (sits below close)
    this.tapZone = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 0.001)
      .setOrigin(0)
      .setDepth(-1)
      .setInteractive();
    this.tapZone.on("pointerdown", () => this.advance());
    this.input.setTopOnly(true);
  }

  private updateCta() {
    const T = this.t();
    if (this.step === 0) this.hint.setText(T.dim);
    else if (this.step === 1) this.hint.setText(T.tuck);
    else this.hint.setText(T.night);
  }

  private advance() {
    if (this.done) return;
    if (this.step === 0) {
      pop();
      this.step = 1;
      if (this.reduced) this.dim.setFillStyle(0x0a1030, 0.55);
      else this.tweens.add({ targets: this.dim, fillAlpha: 0.55, duration: 700, ease: "Sine.easeOut" });
    } else if (this.step === 1) {
      pop();
      this.step = 2;
      this.blanket.setVisible(true);
      this.blanket.setAlpha(0).setScale(1, 0.2);
      if (this.reduced) this.blanket.setAlpha(0.95).setScale(1, 1);
      else this.tweens.add({ targets: this.blanket, alpha: 0.95, scaleY: 1, duration: 600, ease: "Back.easeOut" });
    } else {
      this.done = true;
      pop();
      const T = this.t();
      speak(T.goodnight);
      if (this.reduced) this.nightText.setAlpha(1);
      else this.tweens.add({ targets: this.nightText, alpha: 1, duration: 500 });
      this.showStars();
      win();
      this.time.delayedCall(1600, () => {
        this.resetBtn.setText(T.newNight).setAlpha(1);
        this.resetBtn.once("pointerdown", () => this.resetNight());
      });
    }
    this.updateCta();
  }

  private showStars() {
    if (this.reduced) return;
    const stars = ["⭐", "✨", "🌟"];
    for (let i = 0; i < 8; i++) {
      const s = this.add
        .text(Phaser.Math.Between(20, this.scale.width - 20), Phaser.Math.Between(90 + SAT(), this.scale.height * 0.5), stars[i % stars.length], txt(22, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(300)
        .setAlpha(0);
      this.tweens.add({ targets: s, alpha: 0.9, y: s.y - 20, duration: 800, delay: i * 120 });
    }
  }

  private resetNight() {
    this.done = false;
    this.step = 0;
    this.resetBtn.setAlpha(0);
    this.nightText.setAlpha(0);
    if (this.reduced) {
      this.dim.setFillStyle(0x0a1030, 0);
      this.blanket.setAlpha(0).setVisible(false);
    } else {
      this.tweens.add({ targets: this.dim, fillAlpha: 0, duration: 500 });
      this.tweens.add({ targets: this.blanket, alpha: 0, duration: 300, onComplete: () => this.blanket.setVisible(false) });
    }
    this.updateCta();
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn) return;
    const T = this.t();
    this.tapZone.setSize(this.scale.width, this.scale.height);
    this.dim.setSize(this.scale.width, this.scale.height);
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 40 - SAB());
    this.blanket.setPosition(this.nova.x, this.nova.y - 6);
    this.nightText.setPosition(this.scale.width / 2, this.scale.height * 0.3);
    this.resetBtn.setPosition(this.scale.width / 2, this.scale.height * 0.82);
  }
}
