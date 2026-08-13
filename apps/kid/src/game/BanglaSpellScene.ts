import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_PRIMARY, BTN_NEUTRAL, correctButton, ringCorrect, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-bnspelling")?.difficultyLevels ?? [2, 3, 3, 4, 4, 5];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 3;
/** Band-1 kid words. `letters` are the spelling units as they appear on a tile
 *  (base letter + attached matra sign) — the way NCTB kids spell aloud. */
const WORDS: { emoji: string; word: string; letters: string[] }[] = [
  { emoji: "🍌", word: "কলা", letters: ["ক", "লা"] },
  { emoji: "📖", word: "বই", letters: ["ব", "ৈ"] },
  { emoji: "🍚", word: "ভাত", letters: ["ভা", "ত"] },
  { emoji: "🌺", word: "ফুল", letters: ["ফু", "ল"] },
  { emoji: "🥭", word: "আম", letters: ["আ", "ম"] },
  { emoji: "👩", word: "মা", letters: ["মা"] },
  { emoji: "🐯", word: "বাঘ", letters: ["বা", "ঘ"] },
  { emoji: "🐟", word: "মাছ", letters: ["মা", "ছ"] },
  { emoji: "🥚", word: "ডিম", letters: ["ডি", "ম"] },
  { emoji: "🏠", word: "বাড়ি", letters: ["বা", "ড়ি"] },
  { emoji: "🚂", word: "রেল", letters: ["রে", "ল"] },
  { emoji: "🌳", word: "গাছ", letters: ["গা", "ছ"] },
  { emoji: "🪁", word: "ঘুড়ি", letters: ["ঘু", "ড়ি"] },
  { emoji: "🐘", word: "হাতি", letters: ["হা", "তি"] },
  { emoji: "🌧️", word: "বৃষ্টি", letters: ["বৃ", "ষ্টি"] },
  { emoji: "☀️", word: "রোদ", letters: ["রো", "দ"] },
  { emoji: "⛰️", word: "পাহাড়", letters: ["পা", "হা", "ড়"] },
  { emoji: "🍉", word: "তরমুজ", letters: ["ত", "র", "মু", "জ"] },
  { emoji: "🦆", word: "হাঁস", letters: ["হাঁ", "স"] },
  { emoji: "🛶", word: "নৌকা", letters: ["নৌ", "কা"] },
  { emoji: "🍯", word: "মধু", letters: ["ম", "ধু"] },
  { emoji: "🐚", word: "ঝিনুক", letters: ["ঝি", "নু", "ক"] },
];
/** Common Bangla spelling units used as distractors. */
const DISTRACTORS = ["খা", "গো", "চা", "টি", "পো", "যা", "শে", "ড়া", "টি", "ঁ", "।"];

/**
 * Bangla spelling builder (#44).
 * Band 1: hear a kid word (Nova speaks it), then tap its spelling units from
 * a letter-tile tray in order. Each correct tap fills the next slot; wrong
 * taps get a gentle hintWrong nudge. Levels control how many distractor tiles
 * are mixed in (2 → 4).
 */
export class BanglaSpellScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private target!: { emoji: string; word: string; letters: string[] };
  private solvedCount = 0;
  private slots: Phaser.GameObjects.Container[] = [];
  private tiles: { sprite: Phaser.GameObjects.Container; letter: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private emojiText!: Phaser.GameObjects.Text;

  constructor() {
    super("BanglaSpell");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "floral");
    this.titleText = this.add
      .text(0, 0, t("titleBnSpell"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.emojiText = this.add
      .text(0, 0, "", txt(72, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.16);
    this.emojiText.setPosition(width / 2, height * 0.32);
  }

  private startRound() {
    this.clearRound();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearRound();
    this.locked = false;
    this.solvedCount = 0;
    // pick a word, avoid repeating the previous target
    let w = WORDS[Phaser.Math.Between(0, WORDS.length - 1)];
    if (this.target && w.word === this.target.word) {
      w = WORDS[(WORDS.indexOf(w) + 1) % WORDS.length];
    }
    this.target = w;
    this.emojiText.setText(w.emoji);
    this.prompt.set(t("spellPrompt"));
    speak(w.word, { lang: "bn" });

    const n = w.letters.length;
    const { width, height } = this.scale;
    const slotW = Math.min(96, width / (n + 0.6) - 12);
    const slotY = height * 0.5;
    const gap = width / (n + 1);
    for (let i = 0; i < n; i++) {
      const c = modernCardButton(this, gap * (i + 1), slotY, slotW, 62, "·", BTN_NEUTRAL, 26, slotW - 8);
      this.slots.push(c);
    }

    // tile tray = correct letters + distractor count from level (2..4)
    const distractors = DISTRACTORS.filter((d) => !w.letters.includes(d)).sort(() => Math.random() - 0.5);
    const extra = Math.min(LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)], 4);
    const tray = [...w.letters, ...distractors.slice(0, extra)].sort(() => Math.random() - 0.5);
    const tw = Math.min(76, width / (tray.length + 0.6) - 10);
    const ty = height - 84 - SAB();
    const tgap = width / (tray.length + 1);
    tray.forEach((letter, i) => {
      const c = modernCardButton(this, tgap * (i + 1), ty, tw, 60, letter, BTN_PRIMARY, 22, tw - 8);
      c.on("pointerdown", () => this.tap(c, letter));
      this.tiles.push({ sprite: c, letter });
    });
  }

  private tap(container: Phaser.GameObjects.Container, letter: string) {
    if (this.locked) return;
    const expected = this.target.letters[this.solvedCount];
    if (letter !== expected) {
      hintWrong(this, container, {
        hint: () => `Which letter comes next in ${this.target.word}?`,
        hintBn: () => `${this.target.word} শব্দে কোন অক্ষরটা পরের?`,
        correct: () => expected,
        options: () => this.tiles.map((o) => ({ sprite: o.sprite, value: o.letter })),
      });
      return;
    }
    pop();
    correctButton(container);
    ringCorrect(this, container);
    this.tiles = this.tiles.filter((o) => o.sprite !== container);
    container.setAlpha(0.4).setInteractive(false);
    const slot = this.slots[this.solvedCount];
    slot.destroy();
    const label = this.add
      .text(slot.x, slot.y, letter, txt(26, "#4ade80", { bold: true }))
      .setOrigin(0.5).setDepth(5);
    this.slots[this.solvedCount] = label as unknown as Phaser.GameObjects.Container;
    this.solvedCount++;
    if (this.solvedCount >= this.target.letters.length) {
      this.locked = true;
      win();
      speak(this.target.word, { lang: "bn" });
      this.prompt.set(t("spellGreat", { w: this.target.word }));
      this.floatMsg(this.target.word);
      this.qInRound++;
      this.time.delayedCall(700, () => {
        if (this.qInRound >= QUESTIONS_PER_ROUND) this.finishRound();
        else this.askQuestion();
      });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(400, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.72, text, txt(30, "#ffd166", { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 800, onComplete: () => m.destroy() });
  }

  private clearRound() {
    this.slots.forEach((s) => s.destroy());
    this.slots = [];
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}
