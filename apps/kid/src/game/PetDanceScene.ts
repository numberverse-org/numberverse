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
  todayIso,
  NOVA_DAILY_CAP,
  speciesEmoji,
} from "../store";

/**
 * 🪩 DANCE PARTY — pet mini-game #598 (docs/plans/104-pet-minigames.md).
 *
 * Tap to a beat; each tap makes Nova do a dance move (spin, twirl, jump,
 * disco). A simple beat loop keeps the party going. No points, no failure,
 * no timers — pure fun. A full party (enough taps) earns one care coin via
 * novaChallengeReward (anti-grind cap aware).
 */

const T = {
  en: {
    title: "🪩 Dance Party",
    hint: "Tap to the beat — make Nova dance!",
    moves: ["Let's dance! 🕺", "Woohoo! 🎉", "Keep it going! 🔥", "You've got the beat! ⭐"],
    party: "Party time! Nova danced it all out! +1 🪙 🎉",
    cap: "You earned ALL your coins today! 🪙✨",
    close: "✕",
  },
  bn: {
    title: "🪩 ডান্স পার্টি",
    hint: "তালে তালে ছোঁও — নোভাকে নাচাও!",
    moves: ["চল নাচি! 🕺", "উহু! 🎉", "চালিয়ে যাও! 🔥", "তাল পেয়েছ! ⭐"],
    party: "পার্টি টাইম! নোভা নেচে উঠল! +1 🪙 🎉",
    cap: "আজ সব কয়েন জিতেছ! 🪙✨",
    close: "✕",
  },
} as const;

const PARTY_TAPS = 12; // taps to fill the party meter
const MOVES = ["🕺", "🌀", "🦘", "✨", "💃", "🪩"] as const;

export class PetDanceScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private nova!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private meterText!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private taps = 0;
  private beatTimer?: Phaser.Time.TimerEvent;


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("PetDance");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "sunset");
    this.drawHeader();
    this.drawNova();
    this.startBeat();
    this.input.on("pointerdown", () => this.tapDance());
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
    this.meterText = this.add
      .text(this.scale.width / 2, 108 + SAT(), "🎵 0", txt(24, "#ffffff", { bold: true }))
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
      .text(this.scale.width / 2, this.scale.height - 70 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(120, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100);
  }

  /** A gentle beat loop — Nova bounces to it, even without taps. */
  private startBeat() {
    if (this.reduced) {
      // reduced motion: still pulse slowly, no bounce
      this.tweens.add({ targets: this.nova, scale: 1.03, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      return;
    }
    this.beatTimer = this.time.addEvent({
      delay: 520,
      repeat: -1,
      callback: () => {
        this.tweens.add({ targets: this.nova, y: this.nova.y - 10, scale: 1.04, duration: 180, yoyo: true, ease: "Quad.easeOut" });
        pop();
      },
    });
  }

  private tapDance() {
    if (this.taps >= PARTY_TAPS) return;
    this.taps += 1;
    this.meterText.setText(`🎵 ${Math.min(this.taps, PARTY_TAPS)}`);
    this.danceMove();
    if (this.taps % 3 === 0) speak(this.t().moves[Phaser.Math.Between(0, this.t().moves.length - 1)]);
    if (this.taps >= PARTY_TAPS) {
      win();
      const granted = useKidStore.getState().novaChallengeReward(this.kidId, 1);
      speak(granted > 0 ? this.t().party : this.t().cap);
      this.burstEmoji("🎉", 10, 34);
      this.time.delayedCall(2400, () => {
        this.taps = 0;
        this.meterText.setText("🎵 0");
      });
    }
  }

  private danceMove() {
    const move = MOVES[Phaser.Math.Between(0, MOVES.length - 1)];
    this.spawnMove(move);
    this.tweens.add({ targets: this.nova, angle: Phaser.Math.Between(-14, 14), duration: 140, yoyo: true, repeat: 1 });
    this.tweens.add({ targets: this.nova, scale: 1.1, duration: 120, yoyo: true });
  }

  private spawnMove(emoji: string) {
    const x = Phaser.Math.Between(50, this.scale.width - 50);
    const y = Phaser.Math.Between(this.scale.height * 0.35, this.scale.height * 0.6);
    const m = this.add
      .text(x, y, emoji, txt(Phaser.Math.Between(28, 44), "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(300);
    this.tweens.add({
      targets: m,
      y: m.y - Phaser.Math.Between(50, 90),
      x: m.x + Phaser.Math.Between(-30, 30),
      alpha: 0,
      angle: Phaser.Math.Between(-40, 40),
      scale: 1.5,
      duration: Phaser.Math.Between(600, 1000),
      onComplete: () => m.destroy(),
    });
  }

  private burstEmoji(emoji: string, n: number, size: number) {
    for (let i = 0; i < n; i++) this.spawnMove(emoji);
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn || !this.meterText) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.meterText.setPosition(this.scale.width / 2, 108 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 70 - SAB());
  }
}
