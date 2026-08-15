import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, gridLayout, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { ensureAssets, assetIcon } from "./svgAssets";
import { ALPHABET } from "./englishLiteracy";

const LEVELS = GAMES.find((g) => g.id === "game-enletters")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
// #1176 — the letter-sound targets come from the ONE shared alphabet module.
const LETTERS = ALPHABET;
const CARD_RADIUS = 58;
const ROUNDS_TO_FINISH = 3;

/**
 * English Letters (A–F) — find the letter the owl says, with a picture hint.
 * Band 1 (ages 2–4). Big fat tap targets; zero text walls.
 */
export class EnLettersScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: (typeof LETTERS)[number];
  private cards: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private hintIcon!: Phaser.GameObjects.Container;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("EnLetters");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    ensureAssets(this);
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleEnLetters"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.hintIcon = this.add.container(0, 0);
        this.prompt = questionPanel(this, 0, 0, { tail: "none" });
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "sky");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 44);
    this.roundText.setPosition(width / 2, 82);
    this.meter.setPosition(width / 2, 104);
    this.hintIcon.setPosition(width / 2, height - 100 - SAB());
    this.prompt.setPosition(width / 2, height - 32 - SAB());
    this.reflowCards();
  }

  private startRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = LETTERS[Phaser.Math.Between(0, Math.min(n, LETTERS.length) - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t("findLetter", { ch: this.target.ch, hint: this.target.hint }));
    speak(t("findLetter", { ch: this.target.ch, hint: this.target.hint }));
    this.hintIcon.removeAll(true);
    this.hintIcon.add(assetIcon(this, this.target.icon, 76));
    this.spawnCards(n);
  }

  private spawnCards(n: number) {
    const grid = n <= 3 ? { cols: 3, rows: 1 } : n <= 4 ? { cols: 2, rows: 2 } : n <= 6 ? { cols: 3, rows: 2 } : { cols: 4, rows: Math.ceil(n / 4) };
    const opts = [this.target, ...LETTERS.filter((l) => l.ch !== this.target.ch)].slice(0, n).sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: grid.cols,
      rows: grid.rows,
      preferredW: n <= 6 ? CARD_RADIUS * 2 : CARD_RADIUS * 1.6,
      minW: 56,
      widthPad: 40,
      topPad: 128,
      bottomY: this.scale.height - 150 - SAB(),
    });
    opts.forEach((letter, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (grid.rows - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, letter.ch, BTN_NEUTRAL, { labelSize: Math.max(24, Math.round(gl.cardW / 1.8)) });
      c.on("pointerdown", () => this.tap(c, letter.ch));
      c.setData("val", letter.ch);
      this.cards.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, ch: string) {
    if (ch !== this.target.ch) {
      hintWrong(this, container, {
        hint: () => t("enLettersHint", { ch: this.target.ch }),
        hintBn: () => t("enLettersHint", { ch: this.target.ch }),
        correct: () => this.target.ch,
        options: () => this.cards.map((s) => ({ sprite: s, value: s.getData("val") })),
      });
      return;
    }
    pop();
    correctButton(container);
    this.cards.forEach((c) => c.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private reflowCards() {
    const { width } = this.scale;
    for (const c of this.cards) c.x = Phaser.Math.Clamp(c.x, 30, width - 30);
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, this.randomColor());
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-70, 70),
        y: y + Phaser.Math.Between(-70, 70),
        alpha: 0,
        duration: 520,
        onComplete: () => p.destroy(),
      });
    }
  }

  private randomColor(): number {
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255)
    );
  }
}
