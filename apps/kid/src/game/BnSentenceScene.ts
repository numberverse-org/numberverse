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

const LEVELS = GAMES.find((g) => g.id === "game-bnsentence")?.difficultyLevels ?? [3, 4, 5, 6, 7, 8];
/** 3 through 8-word sentences so every level of the ladder has a real pool. */
const SENTENCES = [
  // 3 words
  { words: ["আমি", "ভাত", "খাই"] },
  { words: ["সে", "স্কুলে", "যায়"] },
  { words: ["বাবা", "বাজারে", "গেল"] },
  { words: ["মা", "রুটি", "বানান"] },
  { words: ["আমার", "নাম", "রাফি"] },
  { words: ["পাখি", "গাছে", "বসে"] },
  { words: ["আজ", "বৃষ্টি", "হবে"] },
  // 4 words
  { words: ["আমি", "নদীতে", "সাঁতার", "কাটি"] },
  { words: ["সে", "প্রতিদিন", "স্কুলে", "যায়"] },
  { words: ["বাবা", "বাজারে", "মাছ", "কিনলেন"] },
  // 5 words
  { words: ["আমার", "ছোট", "বোন", "গান", "গায়"] },
  { words: ["কাল", "সকালে", "আমরা", "মাঠে", "যাব"] },
  { words: ["রফিক", "তার", "দাদার", "সাথে", "হাসে"] },
  // 6 words
  { words: ["আজ", "স্কুলে", "নতুন", "বন্ধু", "এসেছে", "আমাদের"] },
  { words: ["মা", "রান্নাঘরে", "মাছ", "রান্না", "করছেন", "খুব"] },
  // 7 words
  { words: ["সকালে", "পাখিরা", "গাছে", "বসে", "মধুর", "গান", "গায়"] },
  // 8 words
  { words: ["দাদা", "আজ", "বাজারে", "গিয়ে", "তাজা", "মাছ", "কিনে", "এনেছেন"] },
];
const CARD_W = 96;
const CARD_H = 56;
const ROUNDS_TO_FINISH = 3;

/**
 * Bangla Sentence Builder — tap the words in the right order.
 * Band 5 (ages 10–13). Read + build simple Bangla sentences.
 */
export class BnSentenceScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private sentence!: string[];
  private shuffled!: string[];
  private built: string[] = [];
  private cards: { sprite: Phaser.GameObjects.Container; word: string; used: boolean }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private buildText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BnSentence");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleBnSentence"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.buildText = this.add
      .text(0, 0, "______", { ...txt(34, "#ffffff", {bold: true}), wordWrap: { width: 320 }, align: "center", lineSpacing: 6 })
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("tapWordsOrder"));
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "sunset");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.buildText.setPosition(width / 2, height * 0.26);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height * 0.58;
  }

  private startRound() {
    this.clearCards();
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const cands = SENTENCES.filter((s) => s.words.length === n);
    const chosen = cands.length ? Phaser.Math.RND.pick(cands) : Phaser.Math.RND.pick(SENTENCES);
    this.sentence = chosen.words;
    this.shuffled = [...chosen.words].sort(() => Math.random() - 0.5);
    this.built = [];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.buildText.setText("______");
    speak(this.sentence.join(" "));
    this.spawnCards();
  }

  private spawnCards() {
    const n = this.shuffled.length;
    // 7–8 words wrap to a 2-row grid so long sentences stay on a phone screen.
    const cols = n >= 7 ? 4 : n;
    const gl = gridLayout(this, {
      cols,
      rows: Math.ceil(n / cols),
      preferredW: CARD_W,
      minW: 48,
      widthPad: 40,
      topPad: this.scale.height * 0.26 + 60,
      bottomY: this.scale.height - 172 - SAB(),
      gapX: 8,
      gapY: 8,
      cardH: CARD_H,
    });
    const cardW = gl.cardW;
    const labelSize = n >= 7 ? 14 : n >= 6 ? 15 : n >= 5 ? 17 : 20;
    this.shuffled.forEach((word, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (Math.ceil(n / cols) - 1) / 2) * gl.spacingY;
      const c = modernCardButton(this, x, y, cardW, gl.cardH, word, BTN_NEUTRAL, labelSize, cardW - 6);
      c.on("pointerdown", () => this.tap(c, word));
      this.cards.push({ sprite: c, word, used: false });
    });
  }

  private tap(container: Phaser.GameObjects.Container, word: string) {
    const expected = this.sentence[this.built.length];
    if (word !== expected) {
      hintWrong(this, container, {
        hint: "Which word comes next in the sentence? Read it from the start",
        hintBn: "বাক্যে এরপর কোন শব্দটি আসবে? শুরু থেকে পড়ে দেখো",
        correct: () => this.sentence[this.built.length],
        options: () =>
          this.cards
            .filter((c) => !c.used)
            .map((c) => ({ sprite: c.sprite, value: c.word })),
      });
      return;
    }
    pop();
    const card = this.cards.find((c) => c.word === word && !c.used);
    if (card) {
      card.used = true;
      correctButton(card.sprite);
      card.sprite.disableInteractive();
    }
    this.built.push(word);
    this.buildText.setText(this.built.join(" "));
    if (this.built.length === this.sentence.length) {
      this.sparkle(container.x, container.y);
      win();
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      this.onRoundDone?.(true, ms, this.levelIndex + 1);
      this.time.delayedCall(900, () => {
        if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
        this.levelIndex++;
        this.startRound();
      });
    }
  }

  private clearCards() {
    this.cards.forEach((c) => c.sprite.destroy());
    this.cards = [];
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
