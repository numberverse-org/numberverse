import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-compounds-en")?.difficultyLevels ?? [3, 3, 4, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const SLOT_W = 108;
const SLOT_H = 58;

/** One English compound: picture + the two halves that build it. */
interface Compound {
  e: string;
  full: string;
  left: string;
  right: string;
}

/** 16 compounds (done-when ≥15): picture-context, left+right halves, distinct. */
const COMPOUNDS: Compound[] = [
  { e: "🌈", full: "rainbow", left: "rain", right: "bow" },
  { e: "🌻", full: "sunflower", left: "sun", right: "flower" },
  { e: "🦋", full: "butterfly", left: "butter", right: "fly" },
  { e: "⭐", full: "starfish", left: "star", right: "fish" },
  { e: "🧁", full: "cupcake", left: "cup", right: "cake" },
  { e: "🪥", full: "toothbrush", left: "tooth", right: "brush" },
  { e: "🏀", full: "basketball", left: "basket", right: "ball" },
  { e: "⚽", full: "football", left: "foot", right: "ball" },
  { e: "⛄", full: "snowman", left: "snow", right: "man" },
  { e: "🥞", full: "pancake", left: "pan", right: "cake" },
  { e: "🍉", full: "watermelon", left: "water", right: "melon" },
  { e: "🍍", full: "pineapple", left: "pine", right: "apple" },
  { e: "🪼", full: "jellyfish", left: "jelly", right: "fish" },
  { e: "🐝", full: "honeybee", left: "honey", right: "bee" },
  { e: "🧑‍🚒", full: "fireman", left: "fire", right: "man" },
  { e: "📚", full: "bookshelf", left: "book", right: "shelf" },
];

/**
 * English compound words — tap BOTH halves to build the word (#183).
 * Band 2: a picture + spoken word; the kid taps the first half, then the second
 * half (from a scrambled bank). A correct pair fuses into the full word. 16
 * compounds, bank = 2×LEVEL (6 or 8 halves in 2 rows).
 */
export class CompoundEnScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private word!: Compound;
  private slot1Val: string | null = null;
  private slot2Val: string | null = null;
  private bank: { tile: Phaser.GameObjects.Container; val: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private emojiText!: Phaser.GameObjects.Text;
  private replayBtn!: Phaser.GameObjects.Container;
  private slot1!: Phaser.GameObjects.Text;
  private slot2!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  constructor() {
    super("CompoundEn");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleCompoundsEn"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.emojiText = this.add
      .text(0, 0, "", txt(70, "#ffffff", { outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.prompt = questionPanel(this, 0, 0);
    this.replayBtn = modernCardButton(this, 0, 0, 96, 60, "🔊", BTN_ORANGE, 28);
    this.replayBtn.on("pointerdown", () => speak(this.word.full, { lang: "en" }));
    this.slot1 = this.add.text(0, 0, "?", txt(26, "#ffffff", { bold: true })).setOrigin(0.5);
    this.slot2 = this.add.text(0, 0, "?", txt(26, "#ffffff", { bold: true })).setOrigin(0.5);
    this.resultText = this.add.text(0, 0, "", txt(26, "#ffffff", { bold: true })).setOrigin(0.5);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.emojiText.setPosition(width / 2, height * 0.2);
    this.prompt.setPosition(width / 2, height * 0.34);
    this.replayBtn.setPosition(width - 64, 120);
    // slot row: [first] + [second] = result
    const cy = height * 0.46;
    this.slot1.setPosition(width / 2 - 70, cy);
    this.slot2.setPosition(width / 2 + 70, cy);
    this.resultText.setPosition(width / 2, cy + SLOT_H);
  }

  private startRound() {
    this.clearBank();
    this.locked = false;
    this.slot1Val = null;
    this.slot2Val = null;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.slot1.setText("?").setStyle(txt(26, "#ffffff", { bold: true })).setOrigin(0.5);
    this.slot2.setText("?").setStyle(txt(26, "#ffffff", { bold: true })).setOrigin(0.5);
    this.resultText.setText("");
    this.prompt.set(t("ceFirst"));

    let word = COMPOUNDS[Phaser.Math.Between(0, COMPOUNDS.length - 1)];
    if (word === this.word) word = COMPOUNDS[(COMPOUNDS.indexOf(word) + 1) % COMPOUNDS.length];
    this.word = word;
    this.emojiText.setText(word.e);

    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)]; // halves per side
    // unique decoy pools (halves repeat across compounds: ball, cake, man, fish …)
    const leftPool = [...new Set(COMPOUNDS.filter((c) => c.left !== word.left).map((c) => c.left))];
    const rightPool = [...new Set(COMPOUNDS.filter((c) => c.right !== word.right).map((c) => c.right))];
    const lefts = shuffle([word.left, ...shuffle(leftPool).slice(0, n - 1)]);
    const rights = shuffle([word.right, ...shuffle(rightPool).slice(0, n - 1)]);
    const bankVals = shuffle([...lefts, ...rights]);

    const gl = gridLayout(this, {
      cols: n,
      rows: 2,
      preferredW: 130,
      minW: 84,
      widthPad: 16,
      topPad: this.scale.height * 0.56,
      bottomY: this.scale.height - 40 - SAB(),
    });
    bankVals.forEach((val, i) => {
      const row = Math.floor(i / n);
      const col = i % n;
      const tile = modernCardButton(
        this,
        gl.startX + col * gl.spacingX,
        gl.cy + (row - 0.5) * gl.spacingY,
        gl.cardW,
        gl.cardH,
        val,
        BTN_NEUTRAL,
        22
      );
      tile.on("pointerdown", () => this.tap(tile, val));
      this.bank.push({ tile, val });
    });
    this.time.delayedCall(350, () => speak(word.full, { lang: "en" }));
  }

  private tap(tile: Phaser.GameObjects.Container, val: string) {
    if (this.locked) return;
    // slot 1 first — must be the target's LEFT half
    if (this.slot1Val === null) {
      if (val === this.word.left) {
        pop();
        this.slot1Val = val;
        this.slot1.setText(val).setStyle(txt(24, "#052e3f", { bold: true })).setOrigin(0.5);
        this.markUsed(tile);
        this.prompt.set(t("ceSecond"));
        this.time.delayedCall(250, () => speak(val, { lang: "en" }));
        return;
      }
      hintWrong(this, tile, {
        hint: () => `Tap the FIRST half of ${this.word.full}`,
        hintBn: () => `${this.word.full} শব্দের প্রথম অংশটা চাপো`,
        correct: () => this.word.left,
        options: () => this.bank.filter((o) => o.tile !== tile).map((o) => ({ sprite: o.tile, value: o.val })),
      });
      return;
    }
    // slot 2 — must be the target's RIGHT half
    if (val === this.word.right) {
      this.slot2Val = val;
      this.slot2.setText(val).setStyle(txt(24, "#052e3f", { bold: true })).setOrigin(0.5);
      this.markUsed(tile);
      this.solve();
      return;
    }
    hintWrong(this, tile, {
      hint: () => `Tap the SECOND half of ${this.word.full}`,
      hintBn: () => `${this.word.full} শব্দের দ্বিতীয় অংশটা চাপো`,
      correct: () => this.word.right,
      options: () => this.bank.filter((o) => o.tile !== tile).map((o) => ({ sprite: o.tile, value: o.val })),
    });
  }

  private solve() {
    this.locked = true;
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.resultText.setText(`${this.word.left} + ${this.word.right} = ${this.word.full}`).setStyle(txt(26, NV_GOLD, { bold: true, outline: true })).setOrigin(0.5);
    this.floatMsg(t("ceGreat"));
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.slot1Val === this.word.left && this.slot2Val === this.word.right, ms, this.levelIndex + 1);
    this.time.delayedCall(350, () => speak(this.word.full, { lang: "en" }));
    this.time.delayedCall(1400, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.floatMsg(t("ceDone"));
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private markUsed(tile: Phaser.GameObjects.Container) {
    tile.setAlpha(0.35);
    tile.disableInteractive();
    this.tweens.add({ targets: tile, scale: 1.08, duration: 140, yoyo: true, ease: "Back.easeOut" });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.62, text, NV_GOLD, 28, -28);
  }

  private clearBank() {
    this.bank.forEach((b) => b.tile.destroy());
    this.bank = [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
