import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, bad, win } from "./audio";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { t as tr } from "./i18n";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import { prefersReducedMotion } from "./reducedMotion";
import {
  useKidStore,
  defaultNova,
  todayIso,
  NOVA_DAILY_CAP,
  speciesEmoji,
  challengeQualityCoins,
} from "../store";

const CATCH_FRUIT_PHRASES = ["catchFruitPhrase0", "catchFruitPhrase1", "catchFruitPhrase2", "catchFruitPhrase3"] as const;

/**
 * 🍎 CATCH FRUIT — pet mini-game #597 (docs/plans/104-pet-minigames.md).
 *
 * Nova tosses fruit in an arc; the kid taps it mid-air to catch it into a
 * basket. Each catch pops a heart + speaks "Got it!". Misses fall away with a
 * gentle bad() and simply replay — the score is celebratory, never graded.
 * One coin per round via novaChallengeReward (anti-grind cap aware).
 */



const FRUITS = ["🍎", "🍊", "🍌", "🍇"] as const;
const ROUND_TOSSES = 6; // tosses per round
const GRAVITY = 0.42; // px/frame² @60fps
const UP_SPEED = 9.2; // initial upward px/frame
const FLIGHT_FRAMES = 46; // frames to cross the screen width

interface Toss {
  text: Phaser.GameObjects.Text;
  vx: number;
  vy: number;
}

export class CatchFruitScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private nova!: Phaser.GameObjects.Text;
  private basket!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private tossed = 0;
  private caught = 0;
  private roundDone = false;
  private active: Toss[] = [];
  private spawnBusy = false;


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("CatchFruit");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "sky");
    this.drawHeader();
    this.drawNova();
    this.startRound();
    onSceneResize(this, () => this.layout());
  }



  private drawHeader() {
    const T = tr;
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T("catchFruitTitle"), txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T("catchFruitHint"), txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.score = this.add
      .text(this.scale.width / 2, 108 + SAT(), "🧺 0", txt(22, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.msg = this.add
      .text(this.scale.width / 2, this.scale.height * 0.42, "", txt(18, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(900);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T("petClose"), txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.scale.width / 2, this.scale.height - 100 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(80, "#ffffff"))
      .setOrigin(0.5, 1);
    this.basket = this.add
      .text(this.nova.x, this.nova.y - 6, "🧺", txt(44, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100);
  }

  private startRound() {
    this.tossed = 0;
    this.caught = 0;
    this.roundDone = false;
    this.active = [];
    this.updateScore();
    this.spawnToss();
  }

  private spawnToss() {
    if (this.roundDone || this.tossed >= ROUND_TOSSES) return;
    this.tossed += 1;
    const emoji = FRUITS[Phaser.Math.Between(0, FRUITS.length - 1)];
    const x0 = this.nova.x + Phaser.Math.Between(-70, 70);
    const y0 = this.nova.y - 30;
    const targetX = Phaser.Math.Between(60, this.scale.width - 60);
    const speed = this.reduced ? 0.65 : 1; // gentler arc under reduced motion
    const vx = ((targetX - x0) / FLIGHT_FRAMES) * speed;
    const vy = -UP_SPEED * speed;
    const fruit = this.add
      .text(x0, y0, emoji, txt(44, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(200)
      .setInteractive({ useHandCursor: true });
    const toss: Toss = { text: fruit, vx, vy };
    fruit.on("pointerdown", () => this.catchFruit(toss));
    this.active.push(toss);
  }

  update(_time: number, delta: number) {
    if (this.roundDone) return;
    const dt = Math.min(2.5, delta / 16.667);
    const g = GRAVITY * (this.reduced ? 0.6 : 1);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i];
      t.vy += g * dt;
      t.text.x += t.vx * dt;
      t.text.y += t.vy * dt;
      if (t.text.y > this.scale.height + 40) this.missFruit(t);
    }
  }

  private catchFruit(toss: Toss) {
    this.active = this.active.filter((x) => x !== toss);
    toss.text.disableInteractive();
    const T = tr;
    const basket = this.basket;
    this.tweens.add({
      targets: toss.text,
      x: basket.x,
      y: basket.y - 8,
      scale: 0.4,
      duration: 190,
      ease: "Quad.easeIn",
      onComplete: () => {
        pop();
        toss.text.destroy();
        this.caught += 1;
        this.updateScore();
        this.burstHeart();
        speak(tr(CATCH_FRUIT_PHRASES[Phaser.Math.Between(0, CATCH_FRUIT_PHRASES.length - 1)]));
        this.maybeFinish();
      },
    });
  }

  private missFruit(toss: Toss) {
    this.active = this.active.filter((x) => x !== toss);
    toss.text.destroy();
    if (!this.roundDone) {
      bad();
      this.showMsg(tr("catchFruitMiss"), 900);
      this.maybeFinish();
    }
  }

  private burstHeart() {
    const t = this.add
      .text(this.basket.x, this.basket.y - 30, "💛", txt(30, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(300);
    this.tweens.add({
      targets: t,
      y: t.y - 46,
      alpha: 0,
      scale: 1.6,
      duration: 520,
      ease: "Quad.easeOut",
      onComplete: () => t.destroy(),
    });
    this.tweens.add({ targets: this.basket, scale: 1.18, duration: 90, yoyo: true, repeat: 1 });
  }

  private updateScore() {
    this.score.setText(`🧺 ${this.caught}`);
  }

  private showMsg(text: string, ms: number) {
    this.msg.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({
      targets: this.msg,
      alpha: 0,
      delay: ms,
      duration: 300,
    });
  }

  private maybeFinish() {
    if (this.tossed >= ROUND_TOSSES && this.active.length === 0 && !this.roundDone) {
      this.roundDone = true;
      this.finishRound();
    }
  }

  private finishRound() {
    win();
    // #1194 — quality-tiered: a full-catch round (6/6) is the 2-coin perfect
    // tier, any drop drops to the 1-coin base.
    const quality = this.tossed ? this.caught / this.tossed : 0.5;
    const coins = challengeQualityCoins(quality);
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, coins);
    const T = tr;
    const msgText = granted > 0 ? (quality >= 0.85 ? T("catchFruitPerfect") : T("catchFruitReward")) : T("petCap");
    speak(msgText);
    this.showMsg(msgText, 1600);
    this.time.delayedCall(1800, () => this.startRound());
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn || !this.score) return;
    const T = tr;
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.score.setPosition(this.scale.width / 2, 108 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 100 - SAB());
    this.basket.setPosition(this.nova.x, this.nova.y - 6);
    this.msg.setPosition(this.scale.width / 2, this.scale.height * 0.42);
  }
}
