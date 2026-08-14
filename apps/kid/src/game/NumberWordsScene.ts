import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { BANGLA_NUMBER_WORDS } from "./wordBanks";

const LEVELS = GAMES.find((g) => g.id === "game-numberwords")?.difficultyLevels ?? [2, 3, 3, 4, 4, 5];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
/** Stage range per difficulty level — 1-100 in stages (done-when). */
const STAGES = [
  { min: 1, max: 10 },
  { min: 1, max: 20 },
  { min: 11, max: 50 },
  { min: 21, max: 100 },
  { min: 1, max: 100 },
  { min: 1, max: 100 },
];
/** Bangla number words 1-100 (index 0 unused) — #1172 canonical bank. */
const NUM = BANGLA_NUMBER_WORDS;

/**
 * Bangla numbers 1-100 word↔digit (#169).
 * Band 2: stages grow 1-10 → 1-20 → 11-50 → 21-100 → all. Each round the kid
 * maps a word to its digit (একুশ → 21) or a digit to its word, alternating.
 * Near-neighbor distractors keep it a real discrimination. Every correct answer
 * (and every shown word in word→digit mode) is spoken aloud.
 */
export class NumberWordsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private target = 1;
  private mode: "wd" | "dw" = "wd";
  private tiles: { sprite: Phaser.GameObjects.Container; n: number }[] = [];
  private showText!: Phaser.GameObjects.Text;
  private replayBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("NumberWords");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "desert");
    this.titleText = this.add
      .text(0, 0, t("titleNumberWords"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.showText = this.add
      .text(0, 0, "", txt(64, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(3);
    this.replayBtn = modernCardButton(this, 0, 0, 96, 60, "🔊", BTN_ORANGE, 28);
    this.replayBtn.on("pointerdown", () => speak(NUM[this.target], { lang: "bn" }));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.3);
    this.showText.setPosition(width / 2, height * 0.42);
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
    this.mode = this.qInRound % 2 === 0 ? "wd" : "dw";
    const stage = STAGES[Math.min(this.levelIndex, STAGES.length - 1)];
    let n = Phaser.Math.Between(stage.min, stage.max);
    if (n === this.target) n = Math.min(stage.max, n + 1);
    this.target = n;
    this.prompt.set(this.mode === "wd" ? t("nwPromptW") : t("nwPromptD"));
    this.showText.setText(this.mode === "wd" ? NUM[n] : String(n));
    this.showText.setStyle(txt(this.mode === "wd" ? 54 : 72, "#ffffff", { bold: true, outline: true }));
    this.replayBtn.setVisible(this.mode === "wd");
    const optCount = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = this.nearDistractors(n, stage, optCount - 1);
    const bank = [n, ...distract].sort(() => Math.random() - 0.5);
    const gap = this.scale.width / (bank.length + 1);
    const y = this.scale.height - 150 - SAB();
    bank.forEach((num, i) => {
      const label = this.mode === "wd" ? String(num) : NUM[num];
      const cw = this.mode === "wd" ? 110 : 150;
      const tile = modernCardButton(this, gap * (i + 1), y, cw, 84, label, BTN_NEUTRAL, this.mode === "wd" ? 40 : 30, cw - 10);
      tile.on("pointerdown", () => this.tap(tile, num));
      this.tiles.push({ sprite: tile, n: num });
    });
    // Speak every number: word→digit speaks the word up front.
    if (this.mode === "wd") this.time.delayedCall(400, () => speak(NUM[n], { lang: "bn" }));
  }

  private nearDistractors(n: number, stage: { min: number; max: number }, count: number): number[] {
    const candidates = [n - 2, n - 1, n + 1, n + 2, n - 5, n + 5, n - 10, n + 10, n + 20]
      .filter((x) => x >= stage.min && x <= stage.max && x !== n)
      .sort(() => Math.random() - 0.5);
    const out: number[] = [];
    for (const c of candidates) {
      if (out.length >= count) break;
      if (!out.includes(c)) out.push(c);
    }
    // top up from any in-range numbers if the near-neighbour pool ran dry
    while (out.length < count) {
      const x = Phaser.Math.Between(stage.min, stage.max);
      if (x !== n && !out.includes(x)) out.push(x);
    }
    return out;
  }

  private tap(container: Phaser.GameObjects.Container, num: number) {
    if (this.locked) return;
    if (num === this.target) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.tweens.add({ targets: container, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.time.delayedCall(200, () => speak(NUM[this.target], { lang: "bn" }));
      this.floatMsg(t("nwGreat"));
      this.qInRound++;
      this.time.delayedCall(950, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "Listen again — which number is it?",
      hintBn: () => "আবার শোনো — সংখ্যাটা কত?",
      correct: () => this.target,
      options: () => this.tiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.n })),
    });
    this.time.delayedCall(500, () => speak(NUM[this.target], { lang: "bn" }));
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("nwDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.5, text, txt(28, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}
