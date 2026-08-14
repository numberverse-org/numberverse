import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-contracts")?.difficultyLevels ?? [3, 3, 3, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 170;
const CARD_H = 84;
/** A contraction → its two-word (or one-word) full form. */
interface Contract {
  c: string;
  f: string;
}
const CONTRACTS: Contract[] = [
  { c: "I'm", f: "I am" },
  { c: "don't", f: "do not" },
  { c: "can't", f: "cannot" },
  { c: "won't", f: "will not" },
  { c: "isn't", f: "is not" },
  { c: "aren't", f: "are not" },
  { c: "wasn't", f: "was not" },
  { c: "weren't", f: "were not" },
  { c: "haven't", f: "have not" },
  { c: "hasn't", f: "has not" },
  { c: "hadn't", f: "had not" },
  { c: "didn't", f: "did not" },
  { c: "doesn't", f: "does not" },
  { c: "couldn't", f: "could not" },
  { c: "wouldn't", f: "would not" },
  { c: "shouldn't", f: "should not" },
  { c: "I'll", f: "I will" },
  { c: "we'll", f: "we will" },
  { c: "they'll", f: "they will" },
  { c: "I've", f: "I have" },
  { c: "we've", f: "we have" },
  { c: "let's", f: "let us" },
  { c: "that's", f: "that is" },
  { c: "it's", f: "it is" },
];

/**
 * Contractions (I'm, don't, can't) (#178).
 * Band 3 grammar: match a contraction to its full two-word form and back.
 * Rounds alternate direction (contraction → words, words → contraction). The
 * target is shown big and spoken aloud; a correct match re-reads the pair.
 * 24 contractions.
 */
export class ContractsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private ct!: Contract;
  private toFull = true;
  private tiles: { sprite: Phaser.GameObjects.Container; val: string }[] = [];
  private wordText!: Phaser.GameObjects.Text;
  private replayBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("Contracts");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleContracts"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.wordText = this.add
      .text(0, 0, "", txt(48, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("ctPrompt"));
    this.replayBtn = modernCardButton(this, 0, 0, 96, 60, "🔊", BTN_ORANGE, 28);
    this.replayBtn.on("pointerdown", () => speak(this.toFull ? this.ct.c : this.ct.f, { lang: "en" }));
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.wordText.setPosition(width / 2, height * 0.22);
    this.prompt.setPosition(width / 2, height * 0.42);
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
    let ct = CONTRACTS[Phaser.Math.Between(0, CONTRACTS.length - 1)];
    if (ct.c === this.ct?.c) ct = CONTRACTS[(CONTRACTS.indexOf(ct) + 1) % CONTRACTS.length];
    this.ct = ct;
    this.toFull = Math.random() < 0.5;
    const target = this.toFull ? ct.c : ct.f;
    this.wordText.setText(target);
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    // distractors = the other side of OTHER contractions (never this one's pair)
    const others = CONTRACTS.filter((o) => o.c !== ct.c);
    const pool = this.toFull ? others.map((o) => o.f) : others.map((o) => o.c);
    const correct = this.toFull ? ct.f : ct.c;
    const distract = [...new Set(pool.filter((p) => p !== correct))].sort(() => Math.random() - 0.5).slice(0, n - 1);
    const bank = [correct, ...distract].sort(() => Math.random() - 0.5);
    const cols = bank.length <= 4 ? bank.length : 2;
    const rows = bank.length <= 4 ? 1 : 2;
    const gl = gridLayout(this, {
      cols,
      rows,
      preferredW: CARD_W,
      minW: 110,
      widthPad: 16,
      topPad: this.scale.height * 0.52,
      bottomY: this.scale.height - 96 - SAB(),
      cardH: CARD_H,
    });
    bank.forEach((val, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + (row - (rows - 1) / 2) * gl.spacingY, gl.cardW, gl.cardH, val, BTN_NEUTRAL, 28);
      tile.on("pointerdown", () => this.tap(tile, val));
      this.tiles.push({ sprite: tile, val });
    });
    this.time.delayedCall(350, () => speak(target, { lang: "en" }));
  }

  private tap(container: Phaser.GameObjects.Container, val: string) {
    if (this.locked) return;
    const correct = this.toFull ? this.ct.f : this.ct.c;
    if (val === correct) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.tweens.add({ targets: container, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      // read the whole match aloud: "can't … cannot"
      this.time.delayedCall(200, () => {
        speak(this.ct.c, { lang: "en" });
        this.time.delayedCall(700, () => speak(this.ct.f, { lang: "en" }));
      });
      this.floatMsg(t("ctGreat"));
      this.qInRound++;
      this.time.delayedCall(1000, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "Match the short form to its words!",
      hintBn: () => "ছোট রূপটাকে সঠিক জোড়ার সাথে মেলাও!",
      correct: () => correct,
      options: () => this.tiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.val })),
    });
    this.time.delayedCall(500, () => speak(this.toFull ? this.ct.c : this.ct.f, { lang: "en" }));
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("ctDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.6, text, txt(28, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}
