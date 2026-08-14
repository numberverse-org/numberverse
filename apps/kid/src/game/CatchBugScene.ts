import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { gameBackground } from "./backgrounds";
import { txt, correctButton, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-tapdrag")?.difficultyLevels ?? [4, 4, 5, 5, 6, 6];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-tapdrag")?.skillId ?? "ict-tap-drag";
const ROUNDS_TO_FINISH = 3;
const BUGS = ["🐞", "🐛", "🐝", "🐜", "🐌", "🦗"];
const NET_R = 46;

/**
 * Catch the Bugs — tap/drag fine-motor trainer (#234).
 * Band 1 (ages 3–5, ICT). A bug bobs at a random spot; TAP it to catch it.
 * From tier 2 on, a butterfly must be DRAGGED into the net. Gentle scoring:
 * no timer pressure, no penalty — every catch pops a sparkle + cheer, and a
 * missed drop just floats "try again!" and the butterfly glides back.
 * Three tiers (0/1/2 = big → small targets; tap-only → +1 drag → +2 drags).
 */
export class CatchBugScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private tier = 0;
  private tapTotal = 0;
  private tapCaught = 0;
  private dragTotal = 0;
  private dragCaught = 0;
  private netX = 0;
  private netY = 0;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private meter!: RoundMeterApi;
  private net!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("CatchBug");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("titleCatchBug"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.countText = this.add
      .text(0, 0, "", txt(16, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.net = this.add.text(0, 0, "🥅", txt(58, "#ffffff")).setOrigin(0.5).setDepth(2);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 26);
    this.roundText.setPosition(width / 2, 60);
    this.meter.setPosition(width / 2, 88);
    this.countText.setPosition(width / 2, 116);
    this.prompt.setPosition(width / 2, height * 0.17);
    this.netX = width * 0.86;
    this.netY = height * 0.85;
    this.net.setPosition(this.netX, this.netY);
  }

  private startRound() {
    this.tier = Math.min(2, Math.floor(this.levelIndex / 2));
    this.tapTotal = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.dragTotal = this.tier >= 2 ? 2 : this.tier === 1 ? 1 : 0;
    this.tapCaught = 0;
    this.dragCaught = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.updateLeft();
    this.prompt.set(t("catchTap"));
    speak(t("catchTap"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.time.delayedCall(400, () => this.spawnTapBug());
  }

  private updateLeft() {
    const left = this.tapTotal - this.tapCaught + this.dragTotal - this.dragCaught;
    this.countText.setText(t("catchLeft", { n: left }));
  }

  private tapSize() {
    return this.tier === 0 ? 54 : this.tier === 1 ? 44 : 36;
  }
  private tapHit() {
    return this.tier === 0 ? 40 : this.tier === 1 ? 32 : 26;
  }

  private spawnTapBug() {
    if (this.tapCaught >= this.tapTotal) {
      this.startDragPhase();
      return;
    }
    const p = this.randomSpot(true);
    const emoji = BUGS[Math.floor(Math.random() * BUGS.length)];
    const c = this.add.container(p.x, p.y).setDepth(10);
    c.add(this.add.text(0, 0, emoji, txt(this.tapSize(), "#ffffff")).setOrigin(0.5));
    // gentle idle bob — a live bug waits to be caught
    this.tweens.add({
      targets: c,
      y: p.y - 9,
      duration: 500 + Math.random() * 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    c.setSize(this.tapHit() * 2, this.tapHit() * 2);
    c.setInteractive();
    c.on("pointerdown", () => this.catchBug(c));
  }

  private catchBug(c: Phaser.GameObjects.Container) {
    pop();
    correctButton(c);
    c.disableInteractive();
    this.sparkle(c.x, c.y);
    this.floatSmall(c.x, c.y - 34, t("catchGreat"));
    this.tweens.add({
      targets: c,
      scaleX: 0,
      scaleY: 0,
      duration: 220,
      onComplete: () => c.destroy(),
    });
    this.tapCaught++;
    this.updateLeft();
    this.time.delayedCall(260, () => this.spawnTapBug());
  }

  private startDragPhase() {
    if (this.dragTotal === 0) {
      this.finishRound();
      return;
    }
    const key = this.dragTotal > 1 ? "catchDrag2" : "catchDrag";
    this.prompt.set(t(key));
    speak(t(key), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.time.delayedCall(350, () => this.spawnButterfly());
  }

  private spawnButterfly() {
    if (this.dragCaught >= this.dragTotal) {
      this.finishRound();
      return;
    }
    const p = this.randomSpot(true);
    const b = this.add.container(p.x, p.y).setDepth(10);
    b.add(this.add.text(0, 0, "🦋", txt(44, "#ffffff")).setOrigin(0.5));
    b.setSize(52, 52);
    b.setInteractive();
    this.input.setDraggable(b);
    b.on("drag", (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
      b.setPosition(dx, dy);
    });
    b.on("dragend", () => this.dropButterfly(b));
  }

  private dropButterfly(b: Phaser.GameObjects.Container) {
    const dx = b.x - this.netX;
    const dy = b.y - this.netY;
    if (dx * dx + dy * dy <= NET_R * NET_R) {
      pop();
      b.disableInteractive();
      this.dragCaught++;
      this.sparkle(this.netX, this.netY);
      this.floatSmall(this.netX, this.netY - 34, t("catchGreat"));
      this.tweens.add({
        targets: b,
        x: this.netX,
        y: this.netY,
        scaleX: 0,
        scaleY: 0,
        duration: 250,
        onComplete: () => b.destroy(),
      });
      this.updateLeft();
      this.time.delayedCall(350, () => this.spawnButterfly());
    } else {
      // gentle miss — no penalty, just float "try again" + glide back
      const msg = this.add.text(b.x, b.y - 36, t("catchTry"), txt(16, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(30);
      this.tweens.add({
        targets: msg,
        y: msg.y - 30,
        alpha: 0,
        duration: 700,
        onComplete: () => msg.destroy(),
      });
      const p = this.randomSpot(true);
      this.tweens.add({ targets: b, x: p.x, y: p.y, duration: 500, ease: "Sine.easeInOut" });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatBig(t("catchWoo"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  /** A random spot in the play area; `awayNet` keeps it clear of the net. */
  private randomSpot(awayNet: boolean) {
    const { width, height } = this.scale;
    for (let i = 0; i < 20; i++) {
      const x = width * (0.12 + Math.random() * 0.76);
      const y = height * (0.24 + Math.random() * 0.56);
      if (!awayNet) return { x, y };
      if (Math.hypot(x - this.netX, y - this.netY) > 150) return { x, y };
    }
    return { x: width * 0.3, y: height * 0.4 };
  }

  private sparkle(x: number, y: number) {
    const s = this.add.text(x, y, "✨", txt(30, "#ffffff")).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: s,
      y: y - 26,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 500,
      onComplete: () => s.destroy(),
    });
  }

  private floatSmall(x: number, y: number, text: string) {
    const m = this.add.text(x, y, text, txt(18, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: m, y: y - 24, alpha: 0, duration: 800, onComplete: () => m.destroy() });
  }

  private floatBig(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.42, text, txt(30, NV_GOLD, { bold: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 32, alpha: 0, duration: 900, onComplete: () => m.destroy() });
  }
}
