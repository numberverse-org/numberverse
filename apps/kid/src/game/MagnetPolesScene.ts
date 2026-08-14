import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, modernCardButton, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-magnets")?.difficultyLevels ?? [4, 4, 5, 5, 6, 6];
const ROUNDS_TO_FINISH = 3;

type Pole = "N" | "S";

/** Opposite poles attract; same poles repel. */
function faceResult(a: Pole, b: Pole): "attract" | "repel" {
  return a === b ? "repel" : "attract";
}

const POLE_COLOR: Record<Pole, number> = { N: 0xef4444, S: 0x3b82f6 };

/**
 * Magnets (#208). A band-2 science game predicting attract/repel. Two magnets
 * face each other with their pole caps visible (red N / blue S); the kid taps
 * Attract or Repel, then WATCHES the movable magnet snap together or bounce
 * back — the "try both ways" check. Lvl 1–2 use one fixed pole set, lvl 3+
 * all four facing combinations.
 */
export class MagnetPolesScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private locked = false;
  private leftPole: Pole = "N";
  private rightPole: Pole = "S";
  private result: "attract" | "repel" = "attract";
  private fixedMagnet!: Phaser.GameObjects.Container;
  private moveMagnet!: Phaser.GameObjects.Container;
  private moveBaseX = 0;
  private spark!: Phaser.GameObjects.Text;
  private buttons: { c: Phaser.GameObjects.Container; value: string }[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private geom = { w: 0, cy: 0, fixedX: 0, moveX: 0, barW: 96, barH: 46 };

  constructor() {
    super("MagnetPoles");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleMagnets"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);

    this.fixedMagnet = this.add.container(0, 0).setDepth(5);
    this.moveMagnet = this.add.container(0, 0).setDepth(6);
    this.spark = this.add.text(0, 0, "✨", txt(46, "#ffffff", { shadow: false })).setOrigin(0.5).setDepth(10).setVisible(false);

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.geom.w = width;
    this.geom.cy = height * 0.42;
    this.geom.fixedX = width * 0.28;
    this.geom.moveX = width * 0.66;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.tallyText.setPosition(width - 42, 100);
    this.prompt.setPosition(width / 2, height * 0.16);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.fixedMagnet.setPosition(this.geom.fixedX, this.geom.cy);
    this.moveMagnet.setPosition(this.geom.moveX, this.geom.cy);
    this.moveBaseX = this.geom.moveX;
    if (this.buttons.length) this.positionButtons();
  }

  private startRound() {
    this.clearRound();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  private askQuestion() {
    this.locked = false;
    const faces: Pole[] = ["N", "S"];
    this.leftPole = faces[Phaser.Math.Between(0, 1)];
    // lvl 1-2 always a mixed pair (attract), lvl 3+ any pair
    this.rightPole = this.levelIndex < 2
      ? (this.leftPole === "N" ? "S" : "N")
      : faces[Phaser.Math.Between(0, 1)];
    this.result = faceResult(this.leftPole, this.rightPole);
    this.prompt.setText(t("mgQ"));
    speak(
      getAppLang() === "bn" ? "টানবে নাকি ঠেলবে?" : "Attract or repel?",
      { lang: getAppLang() === "bn" ? "bn" : "en" }
    );
    this.drawMagnets();
    this.spawnButtons();
  }

  private drawMagnets() {
    this.fixedMagnet.removeAll(true);
    this.moveMagnet.removeAll(true);
    // fixed magnet (left): its RIGHT end faces the movable magnet
    this.fixedMagnet.add(this.magnetGfx(this.leftPole, "right"));
    // movable magnet (right): its LEFT end faces the fixed magnet
    this.moveMagnet.add(this.magnetGfx(this.rightPole, "left"));
    this.moveMagnet.setPosition(this.moveBaseX, this.geom.cy);
    this.moveMagnet.setScale(1);
    this.spark.setVisible(false);
  }

  /** Draw a magnet bar; cap faces "right" (fixed) or "left" (movable). */
  private magnetGfx(pole: Pole, facing: "left" | "right"): Phaser.GameObjects.Container {
    const { barW, barH } = this.geom;
    const g = this.add.graphics();
    const half = barW / 2;
    const capW = barW * 0.32;
    // body
    g.fillStyle(0x334155, 1);
    g.fillRoundedRect(-half, -barH / 2, barW, barH, 10);
    // facing pole cap
    g.fillStyle(POLE_COLOR[pole], 1);
    if (facing === "right") {
      g.fillRoundedRect(half - capW, -barH / 2, capW, barH, { tl: 0, tr: 10, bl: 0, br: 10 });
    } else {
      g.fillRoundedRect(-half, -barH / 2, capW, barH, { tl: 10, tr: 0, bl: 10, br: 0 });
    }
    // pole letter on the cap
    const letter = this.add
      .text(facing === "right" ? half - capW / 2 : -half + capW / 2, 0, pole, txt(24, "#ffffff", { bold: true, shadow: false }))
      .setOrigin(0.5);
    return this.add.container(0, 0, [g, letter]);
  }

  private spawnButtons() {
    this.clearButtons();
    const { width, height } = this.scale;
    const y = height - 70 - SAB();
    const w = Math.max(130, Math.min(180, (width - 3 * 16) / 2));
    const startX = width / 2 - (w + 16) / 2;
    const attract = modernCardButton(this, startX, y, w, 84, t("mgAttract"), BTN_NEUTRAL, 26);
    attract.on("pointerdown", () => this.tap(attract, "attract"));
    this.buttons.push({ c: attract, value: "attract" });
    const repel = modernCardButton(this, startX + w + 16, y, w, 84, t("mgRepel"), BTN_ORANGE, 26);
    repel.on("pointerdown", () => this.tap(repel, "repel"));
    this.buttons.push({ c: repel, value: "repel" });
  }

  private positionButtons() {
    const { width, height } = this.scale;
    const y = height - 70 - SAB();
    const w = Math.max(130, Math.min(180, (width - 3 * 16) / 2));
    const startX = width / 2 - (w + 16) / 2;
    this.buttons.forEach((b, i) => b.c.setPosition(startX + i * (w + 16), y));
  }

  private tap(btn: Phaser.GameObjects.Container, guess: string) {
    if (this.locked) return;
    if (guess === this.result) {
      this.correct++;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.locked = true;
      this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
      this.floatMsg(t("mgGreat"));
      this.highlight(btn, 0x4ade80);
      speak(t(this.result === "attract" ? "mgAttractSpeak" : "mgRepelSpeak"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.runMagnet(this.result, () => this.advance());
      return;
    }
    bad();
    this.locked = true;
    this.floatMsg(t(this.result === "attract" ? "mgAttractSpeak" : "mgRepelSpeak"), 0xf87171);
    this.highlight(btn, 0xf87171);
    this.tweens.add({ targets: btn, x: btn.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
    speak(t(this.result === "attract" ? "mgAttractSpeak" : "mgRepelSpeak"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.runMagnet(this.result, () => this.advance());
  }

  private highlight(btn: Phaser.GameObjects.Container, color: number) {
    const w = btn.getBounds().width;
    const h = btn.getBounds().height;
    const g = this.add.graphics();
    g.lineStyle(5, color, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    btn.add(g);
    this.time.delayedCall(1000, () => g.destroy());
  }

  /** The "try both ways" check: movable magnet snaps together or bounces back. */
  private runMagnet(result: "attract" | "repel", done: () => void) {
    const fixedEdge = this.geom.fixedX + this.geom.barW / 2;
    const touchX = fixedEdge + this.geom.barW / 2; // bars touching
    if (result === "attract") {
      this.tweens.add({
        targets: this.moveMagnet,
        x: touchX,
        duration: 550,
        ease: "Back.easeIn",
        onComplete: () => {
          pop();
          this.spark.setPosition((fixedEdge + touchX) / 2, this.geom.cy).setVisible(true);
          this.tweens.add({ targets: this.spark, alpha: 0, scale: 1.4, duration: 500, onComplete: () => this.spark.setVisible(false).setAlpha(1).setScale(1) });
          this.tweens.add({ targets: this.fixedMagnet, scale: 1.1, duration: 120, yoyo: true, ease: "Back.easeOut" });
          this.time.delayedCall(350, done);
        },
      });
    } else {
      const gapStop = fixedEdge + 34;
      this.tweens.add({
        targets: this.moveMagnet,
        x: gapStop,
        duration: 380,
        ease: "Sine.easeIn",
        onComplete: () => {
          bad();
          this.tweens.add({
            targets: this.moveMagnet,
            x: this.moveBaseX,
            duration: 420,
            ease: "Sine.easeOut",
            onComplete: () => this.time.delayedCall(300, done),
          });
        },
      });
    }
  }

  private advance() {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.time.delayedCall(650, () => this.askQuestion());
      return;
    }
    this.finishRound();
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("mgDone")}  ${digit(this.correct)}/${digit(this.total)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.total, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.3, text, txt(26, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? NV_GOLD : color === 0x4ade80 ? NV_GREEN : NV_RED)
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearButtons() {
    this.buttons.forEach((b) => b.c.destroy());
    this.buttons = [];
  }

  private clearRound() {
    this.clearButtons();
    this.fixedMagnet.removeAll(true);
    this.moveMagnet.removeAll(true);
    this.spark.setVisible(false);
  }
}

function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

const BN_D = "০১২৩৪৫৬৭৮৯";
