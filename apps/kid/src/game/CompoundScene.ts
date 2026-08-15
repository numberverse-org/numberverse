import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_PRIMARY, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { correctCelebrate , floatText } from "./celebrate";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-compounds")?.difficultyLevels ?? [2, 2, 2, 3, 3, 3];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 118;
const CARD_H = 74;

interface Compound {
  a: string;  // first part
  b: string;  // second part
  word: string; // a + b
  e: string;  // emoji clue for the whole compound
}
/* 18 compounds (done-when: 15+) — everyday fused words whose two parts are
 * both real small words. The first 6 form the easy pool for levels 0-1. */
const COMPOUNDS: Compound[] = [
  { a: "গোলাপ", b: "ফুল", word: "গোলাপফুল", e: "🌹" },
  { a: "মধু", b: "মাছি", word: "মধুমাছি", e: "🐝" },
  { a: "ঘর", b: "বাড়ি", word: "ঘরবাড়ি", e: "🏠" },
  { a: "দিন", b: "রাত", word: "দিনরাত", e: "🌗" },
  { a: "জামা", b: "কাপড়", word: "জামাকাপড়", e: "👕" },
  { a: "ভাই", b: "বোন", word: "ভাইবোন", e: "👫" },
  { a: "ছেলে", b: "মেয়ে", word: "ছেলেমেয়ে", e: "🧒" },
  { a: "হাত", b: "পা", word: "হাতপা", e: "🖐️" },
  { a: "চোখ", b: "মুখ", word: "চোখমুখ", e: "😊" },
  { a: "ডাল", b: "ভাত", word: "ডালভাত", e: "🍲" },
  { a: "মাছ", b: "ভাত", word: "মাছভাত", e: "🐟" },
  { a: "শীত", b: "কাল", word: "শীতকাল", e: "⛄" },
  { a: "বসন্ত", b: "কাল", word: "বসন্তকাল", e: "🌸" },
  { a: "সকাল", b: "সন্ধ্যা", word: "সকালসন্ধ্যা", e: "🌇" },
  { a: "হাসি", b: "খুশি", word: "হাসিখুশি", e: "😄" },
  { a: "ওঠা", b: "নামা", word: "ওঠানামা", e: "⬆️" },
  { a: "দুধ", b: "ভাত", word: "দুধভাত", e: "🥛" },
  { a: "টাকা", b: "পয়সা", word: "টাকাপয়সা", e: "💰" },
];
const EASY = COMPOUNDS.slice(0, 6);

/**
 * Bangla Compound Building — যোগে যোগে শব্দ (#165).
 * Band 2: a compound's emoji clue is shown; the kid taps the TWO small words
 * that join to make it (গোলাপ + ফুল → গোলাপফুল). Each part snaps into its slot
 * and is spoken; when both land the new word pops in and is spoken aloud.
 * Distractors grow 2 → 3 by level; a correct word tapped out of order is
 * coached gently (keepOnWrong), a wrong word is retired.
 */
export class CompoundScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private c!: Compound;
  private placed: (string | null)[] = [null, null];
  private tiles: { sprite: Phaser.GameObjects.Container; word: string }[] = [];
  private clueEmoji!: Phaser.GameObjects.Text;
  private slotA!: Phaser.GameObjects.Graphics;
  private slotB!: Phaser.GameObjects.Graphics;
  private placedTextA!: Phaser.GameObjects.Text;
  private placedTextB!: Phaser.GameObjects.Text;
  private fusedText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Compound");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("titleCompound"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("cpPrompt"));
    this.meter = roundMeter(this);
    this.clueEmoji = this.add
      .text(0, 0, "", txt(84, "#ffffff", { outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.slotA = this.add.graphics().setDepth(1);
    this.slotB = this.add.graphics().setDepth(1);
    this.placedTextA = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(3);
    this.placedTextB = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(3);
    this.fusedText = this.add
      .text(0, 0, "", txt(40, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(3);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.4);
    this.clueEmoji.setPosition(width / 2, height * 0.22);
    this.fusedText.setPosition(width / 2, height * 0.3);
    const sy = height * 0.34;
    const sx = width / 2;
    this.slotA.clear();
    this.slotB.clear();
    this.slotA.lineStyle(3, 0xffd166, 0.7);
    this.slotA.strokeRoundedRect(sx - 96, sy - 34, 88, 68, 14);
    this.slotB.lineStyle(3, 0xffd166, 0.7);
    this.slotB.strokeRoundedRect(sx + 8, sy - 34, 88, 68, 14);
    this.placedTextA.setPosition(sx - 52, sy);
    this.placedTextB.setPosition(sx + 52, sy);
  }

  private startRound() {
    this.clearTiles();
    this.data.set("nv:difficulty", this.levelIndex + 1); // #1061 — reward engine sees round hardness
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    this.placed = [null, null];
    this.placedTextA.setText("");
    this.placedTextB.setText("");
    this.fusedText.setText("");
    let c = (this.levelIndex < 2 ? EASY : COMPOUNDS)[Phaser.Math.Between(0, (this.levelIndex < 2 ? EASY : COMPOUNDS).length - 1)];
    if (c === this.c) {
      const pool = this.levelIndex < 2 ? EASY : COMPOUNDS;
      c = pool[(pool.indexOf(c) + 1) % pool.length];
    }
    this.c = c;
    this.clueEmoji.setText(c.e);
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = this.pickDistractors(c, n);
    const bank = [c.a, c.b, ...distract].sort(() => Math.random() - 0.5);
    const gap = this.scale.width / (bank.length + 1);
    const y = this.scale.height - 140 - SAB();
    bank.forEach((w, i) => {
      const tile = modernCardButton(this, gap * (i + 1), y, CARD_W, CARD_H, w, BTN_NEUTRAL, 26, CARD_W - 8);
      tile.on("pointerdown", () => this.tap(tile, w));
      this.tiles.push({ sprite: tile, word: w });
    });
  }

  private pickDistractors(c: Compound, count: number): string[] {
    const used = new Set([c.a, c.b]);
    const pool = COMPOUNDS.filter((x) => x !== c)
      .flatMap((x) => [x.a, x.b])
      .filter((w) => !used.has(w))
      .filter((w, i, a) => a.indexOf(w) === i);
    const out: string[] = [];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    for (const w of shuffled) {
      if (out.length >= count) break;
      out.push(w);
    }
    return out;
  }

  private tap(container: Phaser.GameObjects.Container, word: string) {
    if (this.locked) return;
    if (word === this.c.a && this.placed[0] === null) {
      // first part lands in slot A
      this.place(container, 0);
      return;
    }
    if (word === this.c.b && this.placed[0] !== null && this.placed[1] === null) {
      // second part lands in slot B — compound complete
      this.place(container, 1);
      this.time.delayedCall(420, () => this.complete());
      return;
    }
    // wrong word, or the second part tapped before the first — gentle coaching
    const outOfOrder = word === this.c.b && this.placed[0] === null;
    hintWrong(this, container, {
      keepOnWrong: outOfOrder,
      hint: () => (outOfOrder ? "Tap the FIRST word first!" : "That word doesn't belong in this picture!"),
      hintBn: () => (outOfOrder ? "আগে প্রথম শব্দটা টিপো!" : "এই শব্দটা এ ছবিতে নেই!"),
      correct: () => this.placed[0] === null ? this.c.a : this.c.b,
      options: () => this.tiles.filter((o) => this.placed[0] === null || this.placed[1] === null).map((o) => ({ sprite: o.sprite, value: o.word })),
    });
  }

  private place(container: Phaser.GameObjects.Container, slot: number) {
    pop();
    container.disableInteractive();
    container.setDepth(4);
    const tx = this.scale.width / 2 + (slot === 0 ? -52 : 52);
    const ty = this.scale.height * 0.34;
    this.tweens.add({
      targets: container,
      x: tx,
      y: ty,
      scale: 1.06,
      duration: 240,
      ease: "Back.easeOut",
      onComplete: () => {
        const word = slot === 0 ? this.c.a : this.c.b;
        this.placed[slot] = word;
        speak(word, { lang: "bn" });
        if (slot === 0) this.placedTextA.setText(word);
        else this.placedTextB.setText(word);
      },
    });
  }

  private complete() {
    this.locked = true;
    win();
    this.fusedText.setText(this.c.word);
    correctCelebrate(this, this.fusedText.x, this.fusedText.y);
    this.tweens.add({ targets: this.fusedText, scale: 1.18, duration: 160, yoyo: true, ease: "Back.easeOut" });
    speak(this.c.word, { lang: "bn" });
    this.floatMsg(t("cpGreat"));
    this.qInRound++;
    if (this.qInRound >= QUESTIONS_PER_ROUND) {
      this.time.delayedCall(1100, () => this.finishRound());
    } else {
      this.time.delayedCall(1100, () => this.askQuestion());
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("cpDone"));
    this.onRoundDone?.(this.qInRound >= QUESTIONS_PER_ROUND, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.58, text, NV_GOLD, 28, -28);
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}
