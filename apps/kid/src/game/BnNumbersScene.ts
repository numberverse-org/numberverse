import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, BTN_PRIMARY, BTN_ORANGE, roundMeter, gridLayout, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { BANGLA_DIGITS } from "./wordBanks";

const LEVELS = GAMES.find((g) => g.id === "game-bnnumbers")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
// #1172 — the digit glyphs + spoken names come from the shared number bank.
const DIGITS = BANGLA_DIGITS;
const CARD_RADIUS = 54;
const ROUNDS_TO_FINISH = 3;

/**
 * Bangla Numbers — hear the number word, tap the matching Bangla digit.
 * Band 1 (ages 2–4). ০–৯ listen-and-tap digit recognition. The big 🔊
 * speaker button re-says the number, so tiny fingers can hear it again
 * without a grown-up. Teaches digit shape ↔ spoken Bangla name.
 */
export class BnNumbersScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: (typeof DIGITS)[number];
  private cards: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private speaker!: Phaser.GameObjects.Container;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BnNumbers");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleBnNumbers"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    // Replay button — a big fat 🔊 so the kid can hear the number again.
    this.speaker = this.add.container(0, 0);
    const spk = modernAnswerButton(this, 0, 0, 34, "🔊", BTN_ORANGE, { labelSize: 34 });
    spk.on("pointerdown", () => this.sayNumber());
    this.speaker.add(spk);
    this.prompt = questionPanel(this, 0, 0, { tail: "none" });
    this.prompt.set(t("listenNumber"));
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private sayNumber() {
    speak(this.target.word);
  }

  private drawBackground() {
    gameBackground(this, "sky");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 44);
    this.roundText.setPosition(width / 2, 82);
    this.meter.setPosition(width / 2, 104);
    this.speaker.setPosition(width / 2, height - 110 - SAB());
    this.prompt.setPosition(width / 2, height - 32 - SAB());
    this.reflowCards();
  }

  private startRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = DIGITS[Phaser.Math.Between(0, Math.min(n, DIGITS.length) - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t("listenNumber"));
    this.sayNumber();
    this.spawnCards(n);
  }

  private spawnCards(n: number) {
    const grid = n <= 3 ? { cols: 3, rows: 1 } : n <= 4 ? { cols: 2, rows: 2 } : n <= 6 ? { cols: 3, rows: 2 } : { cols: 4, rows: Math.ceil(n / 4) };
    const opts = [this.target, ...DIGITS.filter((d) => d.ch !== this.target.ch)].slice(0, n).sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: grid.cols,
      rows: grid.rows,
      preferredW: n <= 6 ? CARD_RADIUS * 2 : CARD_RADIUS * 1.6,
      minW: 56,
      widthPad: 40,
      topPad: 128,
      bottomY: this.scale.height - 150 - SAB(),
    });
    opts.forEach((digit, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (grid.rows - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, digit.ch, BTN_PRIMARY, { labelSize: Math.max(28, Math.round(gl.cardW / 1.8)) });
      c.on("pointerdown", () => this.tap(c, digit.ch));
      c.setData("val", digit.ch);
      this.cards.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, ch: string) {
    if (ch !== this.target.ch) {
      hintWrong(this, container, {
        hint: () => "Listen — which number did Nova say?",
        hintBn: () => "শোনো — নোভা কোন সংখ্যাটা বলেছে?",
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
