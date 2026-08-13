import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-timewords")?.difficultyLevels ?? [0, 0, 1, 1, 2, 2];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 140;
const CARD_H = 104;
/** The three time words in temporal order — the answer sequence. */
const ORDER = ["গতকাল", "আজ", "আগামীকাল"];
/** Event sets: each has exactly one yesterday/today/tomorrow event. */
interface TEvent { word: string; e: string }
const EVENT_SETS: TEvent[][] = [
  [{ word: "গতকাল", e: "🎂" }, { word: "আজ", e: "📚" }, { word: "আগামীকাল", e: "🏖️" }],
  [{ word: "গতকাল", e: "🌧️" }, { word: "আজ", e: "⚽" }, { word: "আগামীকাল", e: "🐟" }],
  [{ word: "গতকাল", e: "👵" }, { word: "আজ", e: "🛒" }, { word: "আগামীকাল", e: "🚗" }],
  [{ word: "গতকাল", e: "🌙" }, { word: "আজ", e: "☀️" }, { word: "আগামীকাল", e: "⭐" }],
  [{ word: "গতকাল", e: "🎁" }, { word: "আজ", e: "🍛" }, { word: "আগামীকাল", e: "🎉" }],
  [{ word: "গতকাল", e: "📖" }, { word: "আজ", e: "🎨" }, { word: "আগামীকাল", e: "🏊" }],
];
/** Extra time words that never belong on today's timeline (distractors, level+). */
const DISTRACTORS: TEvent[] = [
  { word: "গত সপ্তাহ", e: "🌳" },
  { word: "আগামী সপ্তাহ", e: "🚲" },
  { word: "গত মাস", e: "🏡" },
  { word: "আগামী মাস", e: "✈️" },
];

/**
 * Time words ordering — কাল-আজ-আগামীকাল (#171).
 * Band 1: three calendar boxes on a timeline (past → now → future). Three event
 * cards (each stamped with a time word) are shuffled; the kid taps them in
 * temporal order (গতকাল → আজ → আগামীকাল). Each card flies to its calendar slot
 * and the time word is spoken. Higher levels add off-timeline distractor words
 * (গত সপ্তাহ…) that get retired when tapped.
 */
export class TimeWordsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private placed = 0;
  private set!: TEvent[];
  private cards: { sprite: Phaser.GameObjects.Container; word: string; e: string }[] = [];
  private boxes: { g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("TimeWords");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleTimeWords"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("twPrompt"));
    this.meter = roundMeter(this);
    for (let i = 0; i < 3; i++) {
      const g = this.add.graphics().setDepth(1);
      const label = this.add.text(0, 0, "", txt(24, "#0b2545", { bold: true })).setOrigin(0.5).setDepth(2);
      this.boxes.push({ g, label });
    }
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.2);
    const bx = [width * 0.2, width * 0.5, width * 0.8];
    const by = height * 0.38;
    this.boxes.forEach((b, i) => {
      b.g.clear();
      // calendar visual: white body, gold binding bar, dashed line
      b.g.fillStyle(0xffffff, 0.95);
      b.g.fillRoundedRect(bx[i] - 78, by - 62, 156, 124, 12);
      b.g.fillStyle(0xffd166, 1);
      b.g.fillRoundedRect(bx[i] - 78, by - 62, 156, 20, { tl: 12, tr: 12, bl: 0, br: 0 });
      b.g.lineStyle(2, 0xb8860b, 1);
      b.g.strokeRoundedRect(bx[i] - 78, by - 62, 156, 124, 12);
      b.g.lineStyle(1, 0xd8a022, 0.6);
      b.g.lineBetween(bx[i] - 60, by + 18, bx[i] + 60, by + 18);
      b.label.setPosition(bx[i], by - 34);
    });
  }

  private startRound() {
    this.clearCards();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearCards();
    this.locked = false;
    this.placed = 0;
    this.boxes.forEach((b) => b.label.setText(""));
    const setIdx = Phaser.Math.Between(0, EVENT_SETS.length - 1);
    this.set = EVENT_SETS[setIdx];
    const nD = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = [...DISTRACTORS].sort(() => Math.random() - 0.5).slice(0, nD);
    const bank = [...this.set, ...distract].sort(() => Math.random() - 0.5);
    const gap = this.scale.width / (bank.length + 1);
    const y = this.scale.height - 130 - SAB();
    bank.forEach((ev, i) => {
      const card = modernCardButton(this, gap * (i + 1), y, CARD_W, CARD_H, ev.e + " " + ev.word, BTN_NEUTRAL, 26, CARD_W - 10);
      card.on("pointerdown", () => this.tap(card, ev));
      this.cards.push({ sprite: card, word: ev.word, e: ev.e });
    });
  }

  private tap(container: Phaser.GameObjects.Container, ev: TEvent) {
    if (this.locked) return;
    const expected = ORDER[this.placed];
    if (ev.word === expected) {
      pop();
      container.disableInteractive();
      container.setDepth(5);
      const bx = [this.scale.width * 0.2, this.scale.width * 0.5, this.scale.width * 0.8][this.placed];
      const by = this.scale.height * 0.38;
      this.tweens.add({
        targets: container,
        x: bx,
        y: by,
        scale: 0.92,
        duration: 260,
        ease: "Back.easeOut",
        onComplete: () => {
          this.boxes[this.placed].label.setText(ev.e + " " + ev.word);
          speak(ev.word, { lang: "bn" });
          container.setVisible(false);
        },
      });
      this.placed++;
      if (this.placed >= 3) {
        this.locked = true;
        win();
        this.floatMsg(t("twGreat"));
        this.qInRound++;
        this.time.delayedCall(1100, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      }
      return;
    }
    const isDistractor = !this.set.some((x) => x.word === ev.word);
    hintWrong(this, container, {
      keepOnWrong: !isDistractor,
      hint: () => "Which came first — yesterday, today, or tomorrow?",
      hintBn: () => "কোনটা আগে — গতকাল, আজ, না আগামীকাল?",
      correct: () => expected,
      options: () => this.cards.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.word })),
    });
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("twDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.56, text, txt(28, "#ffd166", { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearCards() {
    this.cards.forEach((o) => o.sprite.destroy());
    this.cards = [];
  }
}
