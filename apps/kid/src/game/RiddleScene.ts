import Phaser from "phaser";
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

const LEVELS = GAMES.find((g) => g.id === "game-riddle")?.difficultyLevels ?? [3, 3, 3, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 4;
const CARD_W = 132;
const CARD_H = 108;
/** A kid riddle: emoji answer, spoken clue, a category + first-letter for the
 * hint ladder, and picture distractors (never the right one). */
interface Riddle {
  e: string;
  text: string;
  a: string;
  cat: string;
  letter: string;
  d: string[];
}
const RIDDLES: Riddle[] = [
  { e: "🍌", text: "আমি হলুদ আর বাঁকা, খেতে খুব মিষ্টি। আমি কে?", a: "কলা", cat: "ফল", letter: "ক", d: ["🍎", "🥕", "🍇"] },
  { e: "🐕", text: "আমার চার পা, ঘর পাহারা দিই, ঘেউ ঘেউ বলি। আমি কে?", a: "কুকুর", cat: "পশু", letter: "ক", d: ["🐱", "🐄", "🐔"] },
  { e: "🍎", text: "আমি লাল, গোল, রসে ভরা, প্রতিদিন খাও। আমি কে?", a: "আপেল", cat: "ফল", letter: "আ", d: ["🍊", "🍉", "🍓"] },
  { e: "🐰", text: "আমার দুই কান বড়, গাজর খাই, লাফিয়ে চলি। আমি কে?", a: "খরগোশ", cat: "পশু", letter: "খ", d: ["🐹", "🐢", "🐸"] },
  { e: "☁️", text: "আমি সাদা, আকাশে ভাসি, বৃষ্টি নামাই। আমি কে?", a: "মেঘ", cat: "প্রকৃতি", letter: "ম", d: ["🌞", "🌙", "⭐"] },
  { e: "🦉", text: "আমি দিনে ঘুমাই, রাতে উড়ি, হুট হুট ডাকি। আমি কে?", a: "প্যাঁচা", cat: "পাখি", letter: "প", d: ["🐦", "🦅", "🦜"] },
  { e: "🐒", text: "আমি গাছে থাকি, লেজ দোলাই, কলা খাই। আমি কে?", a: "বানর", cat: "পশু", letter: "ব", d: ["🐼", "🦁", "🐘"] },
  { e: "🐝", text: "আমার ছয় পা, ফুলে বসি, মধু আনি। আমি কে?", a: "মৌমাছি", cat: "পোকা", letter: "ম", d: ["🐞", "🦋", "🕷️"] },
  { e: "🐸", text: "আমি জলে আর ডাঙায় থাকি, সবুজ রঙ, ড্যাব ড্যাব। আমি কে?", a: "ব্যাঙ", cat: "পশু", letter: "ব", d: ["🐢", "🦆", "🐊"] },
  { e: "🌳", text: "আমি দাঁড়িয়ে থাকি, ফুল আর ফল দিই, ছায়া দিই। আমি কে?", a: "গাছ", cat: "গাছপালা", letter: "গ", d: ["🌻", "🍄", "🎋"] },
  { e: "🌈", text: "বৃষ্টির পরে আকাশে আমি রঙিন বাঁকা সেতু। আমি কে?", a: "রংধনু", cat: "প্রকৃতি", letter: "র", d: ["⛈️", "🌫️", "☀️"] },
  { e: "🐘", text: "আমার একটা শুঁড়, বিশাল কান, জল খেতে পছন্দ। আমি কে?", a: "হাতি", cat: "পশু", letter: "হ", d: ["🦏", "🦛", "🐃"] },
  { e: "🚌", text: "আমার চার চাকা, রাস্তায় দৌড়াই, স্কুলে নিয়ে যাই। আমি কে?", a: "বাস", cat: "যানবাহন", letter: "ব", d: ["🚗", "🚲", "🏍️"] },
  { e: "🐔", text: "আমি ডিম পাড়ি, কটকট করি, ভোরে ডেকে তুলি। আমি কে?", a: "মুরগি", cat: "পাখি", letter: "ম", d: ["🦢", "🦃", "🦆"] },
  { e: "💡", text: "আমি চালু করলে বাতি জ্বলে, রাতে ঘর আলো করি। আমি কে?", a: "বাতি", cat: "জিনিস", letter: "ব", d: ["🕯️", "🔥", "🌟"] },
  { e: "📖", text: "আমার ভেতরে ছবি আর গল্প, পড়লে আনন্দ। আমি কে?", a: "বই", cat: "জিনিস", letter: "ব", d: ["📓", "✏️", "🎒"] },
  { e: "⌚", text: "আমি টিক টিক করি, সময় দেখাই, হাতে পরি। আমি কে?", a: "ঘড়ি", cat: "জিনিস", letter: "ঘ", d: ["📱", "🔔", "🧭"] },
  { e: "🌼", text: "বাগানে ফোটে, রঙিন পাতা, মৌমাছি আসে মধুর জন্য। আমি কে?", a: "ফুল", cat: "গাছপালা", letter: "ফ", d: ["🍃", "🍇", "🌰"] },
];

/**
 * Riddle time — ধাঁধা (#174).
 * Band 2: short spoken kid riddles with picture answers. The clue reads itself
 * (🔊 replay), the kid taps the emoji answer. Wrong taps climb a hint ladder:
 * category → first letter → reveal; every wrong tile is retired so the options
 * narrow to the right one. 18 riddles.
 */
export class RiddleScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private wrongCount = 0;
  private rd!: Riddle;
  private tiles: { sprite: Phaser.GameObjects.Container; emoji: string }[] = [];
  private emojiText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private replayBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("Riddle");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleRiddle"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.emojiText = this.add
      .text(0, 0, "❓", txt(72, "#ffffff", { outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.hintText = this.add
      .text(0, 0, "", txt(20, NV_GOLD, { bold: true, align: "center" }))
      .setOrigin(0.5);
    this.replayBtn = modernCardButton(this, 0, 0, 96, 60, "🔊", BTN_ORANGE, 28);
    this.replayBtn.on("pointerdown", () => speak(this.rd.text, { lang: "bn" }));
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
    this.prompt.setPosition(width / 2, height * 0.34);
    this.hintText.setPosition(width / 2, height * 0.5);
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
    this.wrongCount = 0;
    this.hintText.setText("");
    let rd = RIDDLES[Phaser.Math.Between(0, RIDDLES.length - 1)];
    if (rd.text === this.rd?.text) rd = RIDDLES[(RIDDLES.indexOf(rd) + 1) % RIDDLES.length];
    this.rd = rd;
    this.emojiText.setText("❓");
    this.prompt.set(rd.text);
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = [...rd.d].sort(() => Math.random() - 0.5).slice(0, n - 1);
    const bank = [rd.e, ...distract].sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: bank.length,
      rows: 1,
      preferredW: CARD_W,
      minW: 92,
      widthPad: 16,
      topPad: this.scale.height * 0.56,
      bottomY: this.scale.height - 96 - SAB(),
      cardH: CARD_H,
    });
    bank.forEach((emoji, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, gl.cardH, emoji, BTN_NEUTRAL, 44);
      tile.on("pointerdown", () => this.tap(tile, emoji));
      this.tiles.push({ sprite: tile, emoji });
    });
    this.time.delayedCall(350, () => speak(rd.text, { lang: "bn" }));
  }

  private tap(container: Phaser.GameObjects.Container, emoji: string) {
    if (this.locked) return;
    if (emoji === this.rd.e) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.emojiText.setText(this.rd.e);
      this.tweens.add({ targets: container, scale: 1.15, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.time.delayedCall(250, () => speak(this.rd.a, { lang: "bn" }));
      this.floatMsg(t("rdGreat"));
      this.qInRound++;
      this.time.delayedCall(950, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    this.wrongCount++;
    hintWrong(this, container, {
      hint: () => "Think hard — re-read the clue!",
      hintBn: () => "ভেবে দেখো — ক্লুটা আবার শোনো!",
      correct: () => this.rd.e,
      options: () => this.tiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.emoji })),
    });
    if (this.wrongCount === 1) {
      this.hintText.setText(t("rdHintCat", { cat: this.rd.cat }));
      speak(t("rdHintCat", { cat: this.rd.cat }), { lang: "bn" });
    } else if (this.wrongCount === 2) {
      this.hintText.setText(t("rdHintLetter", { l: this.rd.letter }));
      speak(t("rdHintLetter", { l: this.rd.letter }), { lang: "bn" });
    } else {
      // Third miss — reveal and move on.
      this.hintText.setText(t("rdReveal", { a: this.rd.a }));
      speak(t("rdReveal", { a: this.rd.a }), { lang: "bn" });
      this.locked = true;
      this.emojiText.setText(this.rd.e);
      this.tiles.forEach((o) => {
        if (o.emoji === this.rd.e) this.tweens.add({ targets: o.sprite, scale: 1.15, duration: 140, yoyo: true, ease: "Back.easeOut" });
      });
      this.qInRound++;
      this.time.delayedCall(1200, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("rdDone"));
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
