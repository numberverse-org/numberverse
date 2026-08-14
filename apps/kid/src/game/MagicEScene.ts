import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-magice")?.difficultyLevels ?? [3, 3, 3, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 132;
const CARD_H = 92;
/** A silent-e transformation: short CVC word → long CVCe word (cap → cape). */
interface Transform {
  s: string;
  l: string;
  e: string;
}
const TRANSFORMS: Transform[] = [
  { s: "cap", l: "cape", e: "🦸" },
  { s: "tap", l: "tape", e: "📼" },
  { s: "kit", l: "kite", e: "🪁" },
  { s: "pin", l: "pine", e: "🌲" },
  { s: "man", l: "mane", e: "🦁" },
  { s: "not", l: "note", e: "📝" },
  { s: "hop", l: "hope", e: "🙏" },
  { s: "rob", l: "robe", e: "🧖" },
  { s: "cub", l: "cube", e: "🧊" },
  { s: "tub", l: "tube", e: "🧴" },
  { s: "cut", l: "cute", e: "🐣" },
  { s: "bit", l: "bite", e: "🦷" },
  { s: "dim", l: "dime", e: "🪙" },
  { s: "fin", l: "fine", e: "👍" },
  { s: "rid", l: "ride", e: "🚴" },
  { s: "can", l: "cane", e: "🦯" },
];

const VOWELS = ["a", "e", "i", "o", "u"];

/**
 * Silent-e magic (make-a-word) (#176).
 * Band 2 phonics: a CVC word (cap) becomes a long-vowel word (cape) when the
 * magic-e sticks to the end. The kid taps the magic letter among 3-4 vowels;
 * a correct tap fuses "cap"+"e" → "cape" (the e glows gold), the picture pops,
 * and the long word is spoken. 16 transformations.
 */
export class MagicEScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private tr!: Transform;
  private letterTiles: { sprite: Phaser.GameObjects.Container; ch: string }[] = [];
  private baseText!: Phaser.GameObjects.Text;
  private eSlot!: Phaser.GameObjects.Container;
  private eText!: Phaser.GameObjects.Text;
  private emojiText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("MagicE");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleMagicE"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.emojiText = this.add
      .text(0, 0, "", txt(68, "#ffffff", { outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.promptText = this.add
      .text(0, 0, t("mePrompt"), txt(20, NV_GOLD, { bold: true, align: "center" }))
      .setOrigin(0.5);
    // Word box: base word + a dashed slot for the magic letter.
    this.eSlot = this.add.container(0, 0);
    const slotBg = this.add.graphics();
    slotBg.lineStyle(3, 0xffd166, 1);
    slotBg.strokeRoundedRect(-26, -34, 52, 68, 12);
    this.eSlot.add(slotBg);
    this.eText = this.add.text(0, 0, "?", txt(40, NV_GOLD, { bold: true })).setOrigin(0.5);
    this.eSlot.add(this.eText);
    this.baseText = this.add.text(0, 0, "", txt(48, "#ffffff", { bold: true, outline: true })).setOrigin(0, 0.5);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.emojiText.setPosition(width / 2, height * 0.18);
    this.promptText.setPosition(width / 2, height * 0.5);
    const boxY = height * 0.36;
    // base word just left of center, slot just right
    this.baseText.setPosition(width / 2 - 42, boxY);
    this.eSlot.setPosition(width / 2 + 42, boxY);
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
    let tr = TRANSFORMS[Phaser.Math.Between(0, TRANSFORMS.length - 1)];
    if (tr.s === this.tr?.s) tr = TRANSFORMS[(TRANSFORMS.indexOf(tr) + 1) % TRANSFORMS.length];
    this.tr = tr;
    this.emojiText.setText(tr.e);
    this.baseText.setText(tr.s);
    this.eText.setText("?").setColor(NV_GOLD);
    this.eSlot.setScale(1);
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const others = VOWELS.filter((v) => v !== "e").sort(() => Math.random() - 0.5).slice(0, n - 1);
    const bank = ["e", ...others].sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: bank.length,
      rows: 1,
      preferredW: CARD_W,
      minW: 92,
      widthPad: 16,
      topPad: this.scale.height * 0.58,
      bottomY: this.scale.height - 96 - SAB(),
      cardH: CARD_H,
    });
    bank.forEach((ch, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, gl.cardH, ch, BTN_NEUTRAL, 40);
      tile.on("pointerdown", () => this.tap(tile, ch));
      this.letterTiles.push({ sprite: tile, ch });
    });
    this.time.delayedCall(350, () => {
      speak(tr.s, { lang: "en" });
      this.time.delayedCall(900, () => speak(tr.l, { lang: "en" }));
    });
  }

  private tap(container: Phaser.GameObjects.Container, ch: string) {
    if (this.locked) return;
    if (ch === "e") {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      // The magic-e reveal: the e flies into the slot, fuses, and glows gold.
      this.eText.setText("e").setColor(NV_GOLD);
      this.tweens.add({ targets: this.eSlot, scale: 1.25, duration: 160, yoyo: true, ease: "Back.easeOut" });
      this.tweens.add({ targets: container, scale: 1.15, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.tweens.add({ targets: this.emojiText, scale: 1.2, duration: 160, yoyo: true, ease: "Back.easeOut" });
      this.time.delayedCall(250, () => speak(this.tr.l, { lang: "en" }));
      this.floatMsg(t("meGreat"));
      this.qInRound++;
      this.time.delayedCall(1000, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "The magic letter makes a new word!",
      hintBn: () => "জাদুর অক্ষরটা নতুন শব্দ বানায়!",
      correct: () => "e",
      options: () => this.letterTiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.ch })),
    });
    this.tweens.add({ targets: this.eSlot, x: this.eSlot.x - 6, duration: 40, yoyo: true, repeat: 3 });
    this.time.delayedCall(500, () => {
      speak(this.tr.s, { lang: "en" });
      this.time.delayedCall(800, () => speak(this.tr.l, { lang: "en" }));
    });
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("meDone"));
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
    this.letterTiles.forEach((o) => o.sprite.destroy());
    this.letterTiles = [];
  }
}
