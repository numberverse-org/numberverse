import Phaser from "phaser";
import { floatText } from "./celebrate";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, correctButton, roundMeter, gridLayout, BTN_PRIMARY, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-wordpairs")?.difficultyLevels ?? [3, 3, 4, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 150;
const CARD_H = 84;

type Mode = "antonym" | "synonym";

interface Pair {
  a: string;  // word a
  b: string;  // word b (opposite / same meaning)
  ae: string; // emoji for a
  be: string; // emoji for b
}
/* 22 antonym pairs + 22 synonym pairs (done-when: 20+ each), all everyday
 * kid vocabulary. Each word carries a PICTURE (emoji) so options are
 * picture-backed — the skill is meaning, not decoding. */
const ANTONYMS: Pair[] = [
  { a: "বড়", b: "ছোট", ae: "🐘", be: "🐭" },
  { a: "গরম", b: "ঠান্ডা", ae: "☀️", be: "❄️" },
  { a: "উপরে", b: "নিচে", ae: "⬆️", be: "⬇️" },
  { a: "দ্রুত", b: "ধীর", ae: "🐇", be: "🐢" },
  { a: "দিন", b: "রাত", ae: "☀️", be: "🌙" },
  { a: "লম্বা", b: "খাটো", ae: "🦒", be: "🐹" },
  { a: "সকাল", b: "সন্ধ্যা", ae: "🌅", be: "🌇" },
  { a: "ভয়", b: "সাহস", ae: "😨", be: "🦁" },
  { a: "মিষ্টি", b: "টক", ae: "🍭", be: "🍋" },
  { a: "নতুন", b: "পুরনো", ae: "🆕", be: "👵" },
  { a: "হাসি", b: "কান্না", ae: "😄", be: "😢" },
  { a: "প্রথম", b: "শেষ", ae: "🥇", be: "🏁" },
  { a: "উঁচু", b: "নিচু", ae: "🏔️", be: "🪨" },
  { a: "ভেজা", b: "শুকনো", ae: "🌧️", be: "🌵" },
  { a: "আলো", b: "অন্ধকার", ae: "💡", be: "🌑" },
  { a: "শক্ত", b: "নরম", ae: "🧱", be: "🧸" },
  { a: "ভারী", b: "হালকা", ae: "🪨", be: "🪶" },
  { a: "আস্তে", b: "জোরে", ae: "🔉", be: "📢" },
  { a: "শীত", b: "গ্রীষ্ম", ae: "⛄", be: "🏖️" },
  { a: "সোজা", b: "বাঁকা", ae: "📏", be: "🌀" },
  { a: "পরিষ্কার", b: "নোংরা", ae: "🧼", be: "🧦" },
  { a: "সত্য", b: "মিথ্যা", ae: "✅", be: "❌" },
];
const SYNONYMS: Pair[] = [
  { a: "সুন্দর", b: "চমৎকার", ae: "😍", be: "✨" },
  { a: "ছোট", b: "ক্ষুদ্র", ae: "🐭", be: "🔬" },
  { a: "বড়", b: "বিশাল", ae: "🐘", be: "🏔️" },
  { a: "গরম", b: "উষ্ণ", ae: "🔥", be: "☀️" },
  { a: "ঠান্ডা", b: "শীতল", ae: "❄️", be: "🧊" },
  { a: "দ্রুত", b: "তাড়াতাড়ি", ae: "🚀", be: "⚡" },
  { a: "সুখী", b: "আনন্দিত", ae: "😊", be: "🥳" },
  { a: "দুঃখী", b: "মন খারাপ", ae: "😢", be: "😔" },
  { a: "খুশি", b: "আনন্দ", ae: "😃", be: "🎉" },
  { a: "সহজ", b: "সোজা", ae: "🍰", be: "🪶" },
  { a: "সাহসী", b: "নির্ভীক", ae: "🦁", be: "🦅" },
  { a: "ভয়", b: "আতঙ্ক", ae: "😨", be: "😱" },
  { a: "জল", b: "পানি", ae: "💧", be: "🚰" },
  { a: "খেলা", b: "ক্রীড়া", ae: "⚽", be: "🏆" },
  { a: "বই", b: "পুস্তক", ae: "📖", be: "📚" },
  { a: "ঘর", b: "বাড়ি", ae: "🏠", be: "🏡" },
  { a: "মা", b: "মাতা", ae: "👩", be: "🌸" },
  { a: "গান", b: "সংগীত", ae: "🎵", be: "🎶" },
  { a: "রাগ", b: "ক্রোধ", ae: "😠", be: "😡" },
  { a: "ভালোবাসা", b: "প্রেম", ae: "❤️", be: "💕" },
  { a: "পড়া", b: "পাঠ", ae: "📖", be: "📝" },
  { a: "খাওয়া", b: "আহার", ae: "🍚", be: "🍽️" },
];

/**
 * Bangla Word Pairs — বিপরীত / সমার্থক (#163).
 * Band 2–3 vocabulary: match a word to its OPPOSITE (বিপরীত) or its SAME
 * meaning (সমার্থক). Every word is picture-backed (emoji). Questions alternate
 * antonym ↔ synonym; levels grow the option count 3 → 4. Wrong options are
 * retired gently; correct taps get combo fireworks + the pair is spoken aloud.
 */
export class WordPairsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private qTotal = 0;
  private startedAt = 0;
  private locked = false;
  private mode: Mode = "antonym";
  private targetWord = "";
  private correctWord = "";
  private options: { sprite: Phaser.GameObjects.Container; word: string }[] = [];
  private targetEmoji!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("WordPairs");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "sunset");
    this.titleText = this.add
      .text(0, 0, t("titlePairs"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.targetEmoji = this.add
      .text(0, 0, "", txt(72, "#ffffff", { outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.targetText = this.add
      .text(0, 0, "", txt(46, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(2);
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
    this.targetEmoji.setPosition(width / 2, height * 0.24);
    this.targetText.setPosition(width / 2, height * 0.31);
  }

  private startRound() {
    this.clearOptions();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearOptions();
    this.locked = false;
    this.mode = this.qTotal % 2 === 0 ? "antonym" : "synonym";
    const pool = this.mode === "antonym" ? ANTONYMS : SYNONYMS;
    const p = pool[Phaser.Math.Between(0, pool.length - 1)];
    const flip = Math.random() < 0.5;
    this.targetWord = flip ? p.a : p.b;
    this.correctWord = flip ? p.b : p.a;
    const targetEmoji = flip ? p.ae : p.be;
    this.targetEmoji.setText(targetEmoji);
    this.targetText.setText(this.targetWord);
    this.prompt.set(this.mode === "antonym" ? t("wpAntonym") : t("wpSynonym"));
    speak(`${targetEmoji} ${this.targetWord}`);
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const opts = [this.correctWord, ...this.pickDistractors(this.mode, this.targetWord, this.correctWord, n - 1)]
      .sort(() => Math.random() - 0.5);
    const cols = n <= 3 ? n : 2;
    const rows = n <= 3 ? 1 : 2;
    const gl = gridLayout(this, {
      cols,
      rows,
      preferredW: CARD_W,
      minW: 96,
      widthPad: 40,
      topPad: this.scale.height * 0.46,
      bottomY: this.scale.height - 100 - SAB(),
      cardH: CARD_H,
    });
    opts.forEach((w, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (rows - 1) / 2) * gl.spacingY;
      const c = modernCardButton(this, x, y, gl.cardW, CARD_H, w, BTN_PRIMARY, 30, gl.cardW - 8);
      c.on("pointerdown", () => this.tap(c, w));
      this.options.push({ sprite: c, word: w });
    });
  }

  private pickDistractors(mode: Mode, target: string, correct: string, count: number): string[] {
    const pool = mode === "antonym" ? ANTONYMS : SYNONYMS;
    const used = new Set([target, correct]);
    const all = pool.flatMap((p) => [p.a, p.b]).filter((w) => !used.has(w)).filter((w, i, a) => a.indexOf(w) === i);
    const out: string[] = [];
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    for (const w of shuffled) {
      if (out.length >= count) break;
      out.push(w);
    }
    return out;
  }

  private tap(container: Phaser.GameObjects.Container, word: string) {
    if (this.locked) return;
    if (word !== this.correctWord) {
      hintWrong(this, container, {
        hint: () => t(this.mode === "antonym" ? "wpHintAntonym" : "wpHintSynonym"),
        hintBn: () => t(this.mode === "antonym" ? "wpHintAntonym" : "wpHintSynonym"),
        correct: () => this.correctWord,
        options: () => this.options.map((o) => ({ sprite: o.sprite, value: o.word })),
      });
      return;
    }
    this.locked = true;
    pop();
    correctButton(container);
    speak(`${this.targetWord} — ${this.correctWord}`);
    this.floatSmall(container.x, container.y - 52, t("wpGreat"));
    this.qInRound++;
    this.qTotal++;
    if (this.qInRound >= QUESTIONS_PER_ROUND) {
      this.time.delayedCall(700, () => this.finishRound());
    } else {
      this.time.delayedCall(600, () => this.askQuestion());
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("wpDone"));
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

  private floatSmall(x: number, y: number, text: string) {
    const m = this.add.text(x, y, text, txt(18, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: m, y: y - 24, alpha: 0, duration: 800, onComplete: () => m.destroy() });
  }

  private clearOptions() {
    this.options.forEach((o) => o.sprite.destroy());
    this.options = [];
  }
}
