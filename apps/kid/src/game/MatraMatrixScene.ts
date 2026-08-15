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

const LEVELS = GAMES.find((g) => g.id === "game-matramatrix")?.difficultyLevels ?? [3, 3, 3, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 118;
const CARD_H = 88;

/** One real word whose FIRST matra is the challenge — the matra slot sits
 * between `head` and `rest`; `word === head + matra + rest` (Bangla shaping
 * attaches the matra to the head consonant for display). */
interface MatraWord {
  m: string;    // the matra glyph
  name: string; // the matra's spoken name (আ-কার…)
  word: string;
  head: string;
  rest: string;
  e: string;    // picture context
}
/* 10 matra combos — one word per matra (done-when: 8+). All everyday words. */
const MATRA_WORDS: MatraWord[] = [
  { m: "া", name: "আ-কার", word: "কাটা", head: "ক", rest: "টা", e: "✂️" },
  { m: "ি", name: "ই-কার", word: "মিল", head: "ম", rest: "ল", e: "🏭" },
  { m: "ী", name: "ঈ-কার", word: "বীজ", head: "ব", rest: "জ", e: "🌱" },
  { m: "ু", name: "উ-কার", word: "ফুল", head: "ফ", rest: "ল", e: "🌸" },
  { m: "ূ", name: "ঊ-কার", word: "দূরে", head: "দ", rest: "রে", e: "🏞️" },
  { m: "ে", name: "এ-কার", word: "খেলা", head: "খ", rest: "লা", e: "⚽" },
  { m: "ো", name: "ও-কার", word: "রোদ", head: "র", rest: "দ", e: "☀️" },
  { m: "ৈ", name: "ঐ-কার", word: "কৈ", head: "ক", rest: "", e: "🐟" },
  { m: "ৌ", name: "ঔ-কার", word: "নৌকা", head: "ন", rest: "কা", e: "⛵" },
  { m: "ৃ", name: "ঋ-কার", word: "কৃপণ", head: "ক", rest: "পণ", e: "🤑" },
];
const EASY = MATRA_WORDS.slice(0, 4);

/**
 * Matra Matrix — মাত্রা মিশ্রণ (#167).
 * Band 2: mixed matras INSIDE real words (word context, not isolated matras).
 * A picture clue + the word with its matra slot empty (ক [◻] টা) are shown;
 * the kid taps the matra that completes the word. On success the matra snaps
 * into the slot, the full word pops in, and BOTH the word and the matra name
 * are spoken. Distractors are other matras; wrong taps retire.
 */
export class MatraMatrixScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private mw!: MatraWord;
  private tiles: { sprite: Phaser.GameObjects.Container; m: string }[] = [];
  private clueEmoji!: Phaser.GameObjects.Text;
  private headText!: Phaser.GameObjects.Text;
  private restText!: Phaser.GameObjects.Text;
  private placedMatra!: Phaser.GameObjects.Text;
  private slotBox!: Phaser.GameObjects.Graphics;
  private fullWordText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("MatraMatrix");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "night");
    this.titleText = this.add
      .text(0, 0, t("titleMatra"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("mmPrompt"));
    this.meter = roundMeter(this);
    this.clueEmoji = this.add
      .text(0, 0, "", txt(76, "#ffffff", { outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.headText = this.add.text(0, 0, "", txt(56, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(3);
    this.restText = this.add.text(0, 0, "", txt(56, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(3);
    this.placedMatra = this.add.text(0, 0, "", txt(48, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(4);
    this.slotBox = this.add.graphics().setDepth(2);
    this.fullWordText = this.add
      .text(0, 0, "", txt(54, NV_GOLD, { bold: true, outline: true }))
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
    this.prompt.setPosition(width / 2, height * 0.42);
    this.clueEmoji.setPosition(width / 2, height * 0.2);
    // word row: head [slot] rest
    this.headText.setPosition(width / 2 - 92, height * 0.32);
    this.restText.setPosition(width / 2 + 92, height * 0.32);
    this.slotBox.clear();
    this.slotBox.lineStyle(3, 0xffd166, 0.8);
    this.slotBox.fillStyle(0x123d52, 0.5);
    this.slotBox.fillRoundedRect(width / 2 - 44, height * 0.32 - 38, 88, 76, 14);
    this.slotBox.strokeRoundedRect(width / 2 - 44, height * 0.32 - 38, 88, 76, 14);
    this.placedMatra.setPosition(width / 2, height * 0.32);
    this.fullWordText.setPosition(width / 2, height * 0.4);
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
    this.placedMatra.setText("");
    this.fullWordText.setText("");
    const pool = this.levelIndex < 2 ? EASY : MATRA_WORDS;
    let mw = pool[Phaser.Math.Between(0, pool.length - 1)];
    if (mw === this.mw) mw = pool[(pool.indexOf(mw) + 1) % pool.length];
    this.mw = mw;
    this.clueEmoji.setText(mw.e);
    this.headText.setText(mw.head);
    this.restText.setText(mw.rest);
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = MATRA_WORDS.filter((x) => x.m !== mw.m)
      .map((x) => x.m)
      .sort(() => Math.random() - 0.5)
      .slice(0, n - 1);
    const bank = [mw.m, ...distract].sort(() => Math.random() - 0.5);
    const gap = this.scale.width / (bank.length + 1);
    const y = this.scale.height - 150 - SAB();
    bank.forEach((m, i) => {
      const tile = modernCardButton(this, gap * (i + 1), y, CARD_W, CARD_H, m, BTN_NEUTRAL, 46);
      tile.on("pointerdown", () => this.tap(tile, m));
      this.tiles.push({ sprite: tile, m });
    });
  }

  private tap(container: Phaser.GameObjects.Container, m: string) {
    if (this.locked) return;
    if (m === this.mw.m) {
      this.locked = true;
      pop();
      container.disableInteractive();
      this.tweens.add({
        targets: container,
        x: this.scale.width / 2,
        y: this.scale.height * 0.32,
        scale: 0.9,
        duration: 260,
        ease: "Back.easeOut",
        onComplete: () => {
          container.setVisible(false);
          this.placedMatra.setText(m);
          win();
          correctCelebrate(this, this.scale.width / 2, this.scale.height * 0.32);
          this.time.delayedCall(420, () => {
            this.fullWordText.setText(this.mw.word);
            speak(this.mw.word, { lang: "bn" });
            this.time.delayedCall(650, () => speak(this.mw.name, { lang: "bn" }));
            this.floatMsg(t("mmGreat"));
          });
        },
      });
      this.qInRound++;
      this.time.delayedCall(1500, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "That matra doesn't make this word — try again!",
      hintBn: () => "এই মাত্রায় শব্দটা হবে না — আবার চেষ্টা করো!",
      correct: () => this.mw.m,
      options: () => this.tiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.m })),
    });
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("mmDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.5, text, NV_GOLD, 28, -28);
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}
