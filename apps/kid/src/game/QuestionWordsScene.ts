import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-qwords")?.difficultyLevels ?? [3, 3, 4, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 150;
const CARD_H = 84;
/** A question-word slot: picture context + a sentence with a ___ blank. */
interface QSlot {
  e: string;
  s: string;
  a: string;
}
const QWORDS = ["who", "what", "where", "when", "why", "how", "whose"];
const SLOTS: QSlot[] = [
  { e: "🎂", s: "___ is your birthday?", a: "when" },
  { e: "👧", s: "___ is your best friend?", a: "who" },
  { e: "🍎", s: "___ is your favorite fruit?", a: "what" },
  { e: "🏠", s: "___ do you live?", a: "where" },
  { e: "🎉", s: "___ do we celebrate Pohela Boishakh?", a: "why" },
  { e: "🚌", s: "___ do you go to school?", a: "how" },
  { e: "🧑", s: "___ is your teacher?", a: "who" },
  { e: "⏰", s: "___ do you wake up?", a: "when" },
  { e: "📚", s: "___ book is this?", a: "whose" },
  { e: "🐟", s: "___ do you eat fish?", a: "why" },
  { e: "🏞️", s: "___ is Cox's Bazar?", a: "where" },
  { e: "🎨", s: "___ is your favorite color?", a: "what" },
  { e: "🚲", s: "___ do you ride a bike?", a: "how" },
  { e: "👕", s: "___ shirt is on the floor?", a: "whose" },
  { e: "🏫", s: "___ is the school?", a: "where" },
  { e: "🦁", s: "___ is the king of the jungle?", a: "who" },
  { e: "⚽", s: "___ game do you like?", a: "what" },
  { e: "🌧️", s: "___ does it rain the most in Bangladesh?", a: "when" },
  { e: "🛍️", s: "___ did you buy this?", a: "where" },
  { e: "🎁", s: "___ gave you this gift?", a: "who" },
  { e: "✏️", s: "___ pencil is this?", a: "whose" },
  { e: "🍦", s: "___ flavor do you want?", a: "what" },
];

/**
 * Question words (who what where when why) (#181).
 * Band 2/3 grammar: a picture context + a sentence with a ___ blank; the kid
 * taps the right question word. The sentence is spoken (blank paused), and a
 * correct tap fills it and re-reads the whole question aloud. 22 slots.
 */
export class QuestionWordsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private slot!: QSlot;
  private tiles: { sprite: Phaser.GameObjects.Container; val: string }[] = [];
  private emojiText!: Phaser.GameObjects.Text;
  private replayBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("QWords");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "floral");
    this.titleText = this.add
      .text(0, 0, t("titleQWords"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.emojiText = this.add
      .text(0, 0, "", txt(64, "#ffffff", { outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.prompt = questionPanel(this, 0, 0);
    this.replayBtn = modernCardButton(this, 0, 0, 96, 60, "🔊", BTN_ORANGE, 28);
    this.replayBtn.on("pointerdown", () => speak(this.slot.s.replace("___", ""), { lang: "en" }));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.emojiText.setPosition(width / 2, height * 0.2);
    this.prompt.setPosition(width / 2, height * 0.36);
    this.replayBtn.setPosition(width - 64, 120);
  }

  private startRound() {
    this.clearTiles();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    let slot = SLOTS[Phaser.Math.Between(0, SLOTS.length - 1)];
    if (slot.s === this.slot?.s) slot = SLOTS[(SLOTS.indexOf(slot) + 1) % SLOTS.length];
    this.slot = slot;
    this.emojiText.setText(slot.e);
    this.prompt.set(slot.s);
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = QWORDS.filter((w) => w !== slot.a).sort(() => Math.random() - 0.5).slice(0, n - 1);
    const bank = [slot.a, ...distract].sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: bank.length,
      rows: 1,
      preferredW: CARD_W,
      minW: 110,
      widthPad: 16,
      topPad: this.scale.height * 0.52,
      bottomY: this.scale.height - 96 - SAB(),
      cardH: CARD_H,
    });
    bank.forEach((val, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, gl.cardH, val, BTN_NEUTRAL, 30);
      tile.on("pointerdown", () => this.tap(tile, val));
      this.tiles.push({ sprite: tile, val });
    });
    this.time.delayedCall(350, () => speak(slot.s.replace("___", ""), { lang: "en" }));
  }

  private tap(container: Phaser.GameObjects.Container, val: string) {
    if (this.locked) return;
    if (val === this.slot.a) {
      this.locked = true;
      pop();
      win();
      const filled = this.slot.s.replace("___", this.slot.a);
      this.prompt.set(filled);
      this.tweens.add({ targets: container, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.time.delayedCall(250, () => speak(filled, { lang: "en" }));
      this.floatMsg(t("qwGreat"));
      this.qInRound++;
      this.time.delayedCall(1100, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "Ask the question — which word fits?",
      hintBn: () => "প্রশ্নটা জিজ্ঞেস করো — কোন শব্দটা মানাবে?",
      correct: () => this.slot.a,
      options: () => this.tiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.val })),
    });
    this.time.delayedCall(500, () => speak(this.slot.s.replace("___", ""), { lang: "en" }));
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("qwDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.6, text, txt(28, "#ffd166", { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}
