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
import { ensureAssets } from "./svgAssets";
import { BANGLA_KID_WORDS, BANGLA_FAMILY_WORDS } from "./wordBanks";

const LEVELS = GAMES.find((g) => g.id === "game-bnwords")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
export type BnWord = { bn: string; en: string; icon: string };
// #1168 — the read-scene words are the CANONICAL bank (the same spelling the
// spelling-builder and riddle answers use), filtered to the picture-icon set.
const WORDS: BnWord[] = BANGLA_KID_WORDS.filter((w) => w.icon).map(({ bn, en, icon }) => ({ bn, en, icon: icon! }));
/** Family members — same read-the-word-tap-the-picture game, family vocab.
 *  Icons are pure-emoji assets (no SVG), so they render instantly and never
 *  need rasterizing. Mode "family" is set by App for the bn-family-words skill. */
export const FAMILY_WORDS: BnWord[] = BANGLA_FAMILY_WORDS.filter((w) => w.icon).map(({ bn, en, icon }) => ({ bn, en, icon: icon! }));
const CARD_RADIUS = 56;
const ROUNDS_TO_FINISH = 3;

/**
 * Bangla Words — read the Bangla word, tap the matching picture.
 * Band 3 (ages 6–8). Builds reading fluency with real words + emoji pictures.
 */
export class BnWordsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: BnWord;
  private words: BnWord[] = WORDS;
  private cards: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private wordText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BnWords");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; mode?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    // Mode "family" swaps the word list (bn-family-words skill reuses this scene).
    if (data.mode === "family") this.words = FAMILY_WORDS;
    ensureAssets(this);
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, data.mode === "family" ? t("titleBnFamilyWords") : t("titleBnWords"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.wordText = this.add
      .text(0, 0, "", txt(56, NV_GOLD, {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("readWordTapPic"));
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "floral");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.wordText.setPosition(width / 2, height * 0.28);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = this.words[Phaser.Math.Between(0, this.words.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.wordText.setText(this.target.bn);
    speak(this.target.bn);
    this.spawnCards(n);
  }

  private spawnCards(n: number) {
    const grid = n <= 3 ? { cols: 3, rows: 1 } : n <= 4 ? { cols: 2, rows: 2 } : n <= 6 ? { cols: 3, rows: 2 } : { cols: 4, rows: Math.ceil(n / 4) };
    const opts = [this.target, ...this.words.filter((w) => w.bn !== this.target.bn)].slice(0, n).sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: grid.cols,
      rows: grid.rows,
      preferredW: n <= 6 ? CARD_RADIUS * 2 : CARD_RADIUS * 1.6,
      minW: 56,
      widthPad: 40,
      topPad: Math.round(this.scale.height * 0.28 + 40),
      bottomY: this.scale.height - 172 - SAB(),
    });
    opts.forEach((word, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (grid.rows - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, "", BTN_NEUTRAL, { icon: { key: word.icon, size: Math.max(28, Math.round(gl.cardW * 0.6)) } });
      c.on("pointerdown", () => this.tap(c, word.bn));
      c.setData("val", word.bn);
      this.cards.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, bn: string) {
    if (bn !== this.target.bn) {
      hintWrong(this, container, {
        hint: "Match the picture to the Bangla word — sound it out",
        hintBn: "ছবির সাথে বাংলা শব্দটি মিলাও — পড়ে দেখো",
        correct: () => this.target.bn,
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
    this.onRoundDone?.(bn === this.target.bn, ms, this.levelIndex + 1);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
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
