import Phaser from "phaser";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import { prefersReducedMotion } from "./reducedMotion";
import { useKidStore, defaultNova, todayIso, speciesEmoji } from "../store";

/**
 * 🌙 SLEEP & WAKE — pet mini-game #603 (docs/plans/104-pet-minigames.md).
 *
 * Nova has a light day/night rhythm: at night she dims to zzz/snore; in the
 * morning a tap wakes her with a greeting BY NAME. Persists `awake`/
 * `lastGreeted` in the store (novaSleepWake). Local clock only — a kid playing
 * at night is never blocked, just sees the sleepy state. No coin.
 */

const T = {
  en: {
    title: "🌙 Sleep & Wake",
    hint: "At night Nova sleeps… in the morning she wakes!",
    zzz: "Zzz… 💤",
    wake: (name: string) => `Good morning, ${name}! Nova's awake! ☀️`,
    tapped: "Huh? Whoo? ☀️",
    close: "✕",
  },
  bn: {
    title: "🌙 ঘুম ও জাগরণ",
    hint: "রাতে নোভা ঘুমায়… সকালে জেগে ওঠে!",
    zzz: "ঘুম… 💤",
    wake: (name: string) => `শুভ সকাল, ${name}! নোভা জেগেছে! ☀️`,
    tapped: "হুঁ? হু? ☀️",
    close: "✕",
  },
} as const;

export class SleepWakeScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private reduced = false;
  private hint!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;
  private nova!: Phaser.GameObjects.Text;
  private zzz?: Phaser.GameObjects.Text;

  private asleep = false;
  private name = "";

  constructor() {
    super("SleepWake");
  }

  create(data: { kidId?: string; kidName?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.reduced = prefersReducedMotion();
    gameBackground(this, "night");
    this.name = data?.kidName ?? "";
    this.drawHeader();
    this.drawNova();
    this.applyClockState();
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
    this.status = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, "", txt(20, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setDepth(900);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.scale.width / 2, this.scale.height - 70 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(120, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
  }

  /** Local clock drives the light day/night state (no server time). */
  private applyClockState() {
    const hour = new Date().getHours();
    const night = hour >= 21 || hour < 6;
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    const alreadyAwake = nova.awake ?? true;
    this.asleep = night && alreadyAwake === false ? true : night;
    // persist the light state
    useKidStore.getState().novaSleepWake(this.kidId, !this.asleep);

    if (this.asleep) {
      this.nova.setAlpha(0.55);
      this.zzz = this.add
        .text(this.scale.width / 2 + 70, this.scale.height - 170 - SAB(), this.t().zzz, txt(34, "#ffffff", { bold: true }))
        .setOrigin(0.5)
        .setDepth(200);
      if (!this.reduced) {
        this.tweens.add({ targets: this.zzz, y: this.zzz.y - 24, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
    } else {
      this.wakeGreeting();
    }
  }

  /** Morning wake — tap Nova to wake her (greeting by name, once per day). */
  private wakeGreeting() {
    this.nova.setAlpha(1);
    this.nova.on("pointerdown", () => {
      pop();
      win();
      this.nova.off("pointerdown");
      const st = useKidStore.getState();
      const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
      const today = todayIso();
      const T = this.t();
      const msg = this.name ? T.wake(this.name) : T.tapped;
      if (nova.lastGreeted !== today) speak(msg);
      this.status.setText(msg);
      this.burst("☀️", 10);
      useKidStore.getState().novaSleepWake(this.kidId, true);
    });
  }

  private burst(emoji: string, n: number) {
    for (let i = 0; i < n; i++) {
      const x = Phaser.Math.Between(40, this.scale.width - 40);
      const y = Phaser.Math.Between(this.scale.height * 0.3, this.scale.height * 0.7);
      const m = this.add
        .text(x, y, emoji, txt(Phaser.Math.Between(18, 30), "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(400);
      this.tweens.add({
        targets: m,
        y: m.y - Phaser.Math.Between(40, 80),
        alpha: 0,
        scale: 1.5,
        duration: Phaser.Math.Between(700, 1100),
        onComplete: () => m.destroy(),
      });
    }
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.status.setPosition(this.scale.width / 2, this.scale.height * 0.4);
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 70 - SAB());
    if (this.zzz) this.zzz.setPosition(this.scale.width / 2 + 70, this.scale.height - 170 - SAB());
  }
}
