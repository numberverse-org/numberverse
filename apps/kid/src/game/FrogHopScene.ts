import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, bnNumber, enNumber } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { assetIcon } from "./svgAssets";
import { txt, modernAnswerButton, correctButton, btnFromColor, gridLayout, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-froghop")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
const ROUNDS_TO_FINISH = 3;
/** Lily-pad teal-green answer buttons. */
const PAD_STYLE = btnFromColor(0x43aa8b);

/**
 * Frog Hop — hop a frog along a number line.
 * Band 1 (ages 2–4, math). Tap the lily pad with the target number and the
 * frog ribbits over to it. Big pads, huge numerals, a real hop — the number
 * line comes alive.
 */
export class FrogHopScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target = 1;
  private pads: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private frog!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("FrogHop");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "ocean");
    this.titleText = this.add
      .text(0, 0, t("titleFrogHop"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.frog = assetIcon(this, "frog", 64).setDepth(500);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layout();
      this.reflowGrid();
    });
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get roundMax(): number {
    return LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
  }

  private gridSpec() {
    const max = this.roundMax;
    const rows = max > 6 ? 2 : 1;
    const cols = Math.ceil(max / rows);
    const gl = gridLayout(this, {
      cols,
      rows,
      preferredW: 104,
      minW: 64,
      widthPad: 24,
      topPad: 150,
      bottomY: this.scale.height - 190 - SAB(),
    });
    return { max, rows, cols, gl };
  }

  private startRound() {
    this.clearPads();
    this.startedAt = this.time.now;
    const max = this.roundMax;
    this.target = Phaser.Math.Between(1, max);
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t("hopTo", { n: this.target }));
    const bn = getAppLang() === "bn";
    speak(t("hopToSpeak", { word: bn ? bnNumber(this.target) : enNumber(this.target) }), { lang: bn ? "bn" : "en" });
    this.spawnPads();
  }

  private spawnPads() {
    const { max, rows, cols, gl } = this.gridSpec();
    const gridH = (rows - 1) * gl.spacingY;
    for (let v = 1; v <= max; v++) {
      const i = v - 1;
      const x = gl.startX + (i % cols) * gl.spacingX;
      const y = gl.cy - gridH / 2 + Math.floor(i / cols) * gl.spacingY;
      const pad = modernAnswerButton(this, x, y, gl.cardW / 2, String(v), PAD_STYLE, { labelSize: Math.max(22, Math.round(gl.cardW * 0.4)) });
      pad.setData("idx", i);
      pad.on("pointerdown", () => this.tap(pad, v));
      this.pads.push({ sprite: pad, value: v });
    }
    // soft water line under the pads so the number line reads as one path
    this.background.lineStyle(3, 0xffffff, 0.35);
    this.background.lineBetween(gl.startX - gl.cardW, gl.cy + gl.cardW / 2 + 14, gl.startX + (cols - 1) * gl.spacingX + gl.cardW, gl.cy + gl.cardW / 2 + 14);
    this.sitFrogOnPad();
  }

  /** The frog lives ON the number line — it perches on pad 1 at round start
   *  (never off-screen, no matter how wide the grid). */
  private sitFrogOnPad() {
    const p = this.pads[0];
    if (!p) return;
    this.tweens.killTweensOf(this.frog);
    this.frog.setPosition(p.sprite.x, p.sprite.y - this.gridSpec().gl.cardW * 0.4);
    this.frog.setAngle(0);
  }

  private reflowGrid() {
    const { max, rows, cols, gl } = this.gridSpec();
    const gridH = (rows - 1) * gl.spacingY;
    for (const p of this.pads) {
      const i = p.sprite.getData("idx") as number;
      p.sprite.setPosition(gl.startX + (i % cols) * gl.spacingX, gl.cy - gridH / 2 + Math.floor(i / cols) * gl.spacingY);
    }
    this.sitFrogOnPad();
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.target) {
      hintWrong(this, container, {
        hint: () => `Count the pads to find ${this.target}!`,
        hintBn: () => `${bnNumber(this.target)} খুঁজে পেতে পাটিগুলো গুনো!`,
        correct: () => this.target,
        options: () => this.pads,
      });
      return;
    }
    pop();
    correctButton(container);
    this.pads.forEach((p) => p.sprite.disableInteractive());
    const restY = container.y - this.gridSpec().gl.cardW * 0.4;
    this.hopFrog(container.x, restY);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(950, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  /** Arc-hop the frog onto a lily pad — up, then down onto it. */
  private hopFrog(x: number, y: number) {
    this.tweens.killTweensOf(this.frog);
    this.frog.setAngle(0);
    this.tweens.add({
      targets: this.frog,
      x,
      y: y - 56,
      duration: 190,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.frog,
          y,
          duration: 160,
          ease: "Quad.easeIn",
          onComplete: () => {
            this.tweens.add({ targets: this.frog, angle: 8, duration: 70, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
          },
        });
      },
    });
  }

  private clearPads() {
    this.pads.forEach((p) => p.sprite.destroy());
    this.pads = [];
    this.background.clear();
  }
}
