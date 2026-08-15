import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, win } from "./audio";
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

/**
 * 🎾 FETCH — pet mini-game #606 (docs/plans/104-pet-minigames.md).
 *
 * Tap anywhere to throw the ball; Nova runs to it, brings it back and jumps +
 * cheers. A "good throw" (far enough across the screen) earns an extra coin.
 * Nova ALWAYS returns the ball — no fail state. Reduced-motion shortens and
 * slows the arc + run.
 */



const GRAVITY = 0.34; // ball arc px/frame² @60fps
const FLIGHT_FRAMES = 44;
const GOOD_THROW_FRACTION = 0.6; // throw past 60% width = good

interface Ball {
  text: Phaser.GameObjects.Text;
  vx: number;
  vy: number;
  landY: number;
}

export class FetchScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private nova!: Phaser.GameObjects.Text;
  private ball!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;
  private tapZone!: Phaser.GameObjects.Rectangle;

  private startX = 0;
  private busy = false;
  private active: Ball | null = null;
  private roundDone = false;


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("Fetch");
  }

  // #1003 archetype: challenge
  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "forest");
    this.drawHeader();
    this.drawNova();
    this.ball = this.add.text(this.startX + 46, this.groundY(), "🎾", txt(40, "#ffffff")).setOrigin(0.5, 1);
    // full-screen tap surface — throw the ball wherever you tap.
    // Sits below everything (negative depth) so the close button still wins.
    this.tapZone = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 0.001)
      .setOrigin(0)
      .setDepth(-1)
      .setInteractive();
    this.tapZone.on("pointerdown", (p: Phaser.Input.Pointer) => this.throwBall(p.x));
    this.input.setTopOnly(true);
    onSceneResize(this, () => this.layout());
  }



  private groundY() {
    return this.scale.height - 80 - SAB();
  }

  private drawHeader() {
    const T = tr;
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T("fetchTitle"), txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T("fetchHint"), txt(16, NV_GOLD, { bold: true }))
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
    this.startX = 90;
    this.nova = this.add
      .text(this.startX, this.groundY(), speciesEmoji(nova.species, nova.petStage), txt(80, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100);
  }

  private throwBall(tapX: number) {
    if (this.busy || this.active || this.roundDone) return;
    this.roundDone = true; // one throw per round
    const targetX = Phaser.Math.Clamp(tapX, 70, this.scale.width - 70);
    const x0 = this.startX + 46;
    const y0 = this.groundY();
    const speed = this.reduced ? 0.65 : 1;
    const vx = ((targetX - x0) / FLIGHT_FRAMES) * speed;
    const arcH = Math.max(28, Math.min(110, Math.abs(targetX - x0) * 0.24));
    const vy = -Math.sqrt(2 * GRAVITY * arcH) * speed;
    this.ball.setPosition(x0, y0).setScale(1).setVisible(true);
    const ball: Ball = { text: this.ball, vx, vy, landY: y0 };
    this.active = ball;
  }

  update(_time: number, delta: number) {
    if (!this.active) return;
    const dt = Math.min(2.5, delta / 16.667);
    const b = this.active;
    b.vy += GRAVITY * dt;
    b.text.x += b.vx * dt;
    b.text.y += b.vy * dt;
    if (b.text.y >= b.landY && b.vy > 0) {
      this.active = null;
      b.text.y = b.landY;
      this.novaFetch(b.text.x);
    }
  }

  private novaFetch(targetX: number) {
    this.busy = true;
    const baseY = this.groundY();
    const scale = this.reduced ? 1.4 : 1;
    const goDur = Phaser.Math.Clamp(Math.abs(targetX - this.startX) * 4, 400, 1000) * scale;
    const backDur = Phaser.Math.Clamp(Math.abs(targetX - this.startX) * 4, 400, 1000) * scale;
    this.nova.setDepth(300);
    this.tweens.chain({
      targets: this.nova,
      tweens: [
        // run out to the ball
        { x: targetX, duration: goDur, ease: "Quad.easeInOut" },
        // pick it up (ball shrinks into Nova's mouth)
        {
          targets: this.ball,
          x: targetX,
          y: baseY - 26,
          scale: 0.2,
          duration: 160,
          ease: "Quad.easeIn",
          onComplete: () => {
            pop();
            this.ball.setVisible(false);
          },
        },
        // run back with the ball
        { x: this.startX, duration: backDur, ease: "Quad.easeInOut" },
        // happy hop + cheer
        { y: baseY - 26, duration: 130, yoyo: true, repeat: 1, ease: "Quad.easeOut" },
      ],
      onComplete: () => {
        this.ball.setPosition(this.startX + 46, baseY).setScale(1).setVisible(true);
        this.ball.setDepth(0);
        this.nova.setDepth(100);
        this.busy = false;
        this.roundDone = false;
        this.finishThrow(targetX);
      },
    });
  }

  private finishThrow(targetX: number) {
    win();
    const good = targetX >= this.scale.width * GOOD_THROW_FRACTION;
    // #1194 — quality-tiered via the shared helper: a far "good" throw is the
    // 2-coin perfect tier, any normal throw is the 1-coin base tier.
    const coins = challengeQualityCoins(good ? 1 : 0.5);
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, coins);
    const T = tr;
    const msgText = granted <= 0 ? T("petCap") : good ? T("fetchGood") : T("fetchNormal");
    speak(msgText);
    this.showMsg(msgText, 1600);
  }

  private showMsg(text: string, ms: number) {
    this.msg.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: ms, duration: 300 });
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn) return;
    const T = tr;
    this.tapZone.setSize(this.scale.width, this.scale.height);
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.startX, this.groundY());
    this.ball.setPosition(this.startX + 46, this.groundY());
    this.msg.setPosition(this.scale.width / 2, this.scale.height * 0.42);
  }
}
