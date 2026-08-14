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

const LEVELS = GAMES.find((g) => g.id === "game-polite")?.difficultyLevels ?? [3, 3, 3, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 150;
const CARD_H = 84;
/** Every scenario card: an emoji scene + the question, one right polite word,
 * and distractors from the other polite words / neutral replies. */
interface Scenario {
  e: string;
  text: string;
  a: string;
  d: string[];
}
const SCENARIOS: Scenario[] = [
  { e: "👵", text: "দিদিমা তোমাকে মিষ্টি দিলেন। তুমি কী বলবে?", a: "ধন্যবাদ", d: ["দুঃখিত", "দাও", "না"] },
  { e: "🎁", text: "বন্ধু তোমাকে উপহার দিল। তুমি কী বলবে?", a: "ধন্যবাদ", d: ["এসো", "থামো", "না"] },
  { e: "📚", text: "শিক্ষক তোমাকে বই দিলেন। তুমি কী বলবে?", a: "ধন্যবাদ", d: ["যাও", "না", "দয়া করে"] },
  { e: "🍬", text: "বড় ভাই তোমাকে চকলেট দিল। তুমি কী বলবে?", a: "ধন্যবাদ", d: ["দুঃখিত", "না", "যাও"] },
  { e: "🚪", text: "বাইরে যেতে চাও, মাকে দরজা খুলতে বলবে। কী বলবে?", a: "দয়া করে", d: ["ধন্যবাদ", "না", "থামো"] },
  { e: "📱", text: "বাবার ফোন নিয়ে খেলতে চাও। কী বলবে?", a: "দয়া করে", d: ["দুঃখিত", "দাও", "এসো"] },
  { e: "🧃", text: "মা, এক গ্লাস পানি চাইবে। কী বলবে?", a: "দয়া করে", d: ["ধন্যবাদ", "যাও", "না"] },
  { e: "🏓", text: "বন্ধুর কাছে ব্যাট চাইবে। কী বলবে?", a: "দয়া করে", d: ["দুঃখিত", "না", "এসো"] },
  { e: "🥛", text: "গ্লাস পড়ে ভেঙে গেল। তুমি কী বলবে?", a: "দুঃখিত", d: ["ধন্যবাদ", "দাও", "থামো"] },
  { e: "👦", text: "ছোট ভাইয়ের খেলনা ভেঙে গেল। তুমি কী বলবে?", a: "দুঃখিত", d: ["দয়া করে", "না", "এসো"] },
  { e: "🚌", text: "বাসে উঠতে গিয়ে কারো গায়ে ঠেকলে। কী বলবে?", a: "দুঃখিত", d: ["ধন্যবাদ", "যাও", "না"] },
  { e: "🙇", text: "বন্ধুর বই মাটিতে পড়ে দাগ দিলে। কী বলবে?", a: "দুঃখিত", d: ["দয়া করে", "থামো", "না"] },
];

/**
 * Polite words — শিষ্টাচার (#173).
 * Band 1: everyday scenarios (👵 দিদিমা… 🚌 বাস) each need the polite reply —
 * ধন্যবাদ / দয়া করে / দুঃখিত. The scenario + question are read aloud (🔊);
 * the kid taps the polite response among 3-4 options. 12 scenario cards.
 */
export class PoliteScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private sc!: Scenario;
  private tiles: { sprite: Phaser.GameObjects.Container; word: string }[] = [];
  private emojiText!: Phaser.GameObjects.Text;
  private replayBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("Polite");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("titlePolite"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.emojiText = this.add
      .text(0, 0, "", txt(64, "#ffffff", { outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.replayBtn = modernCardButton(this, 0, 0, 96, 60, "🔊", BTN_ORANGE, 28);
    this.replayBtn.on("pointerdown", () => speak(this.sc.text, { lang: "bn" }));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.emojiText.setPosition(width / 2, height * 0.24);
    this.prompt.setPosition(width / 2, height * 0.36);
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
    let sc = SCENARIOS[Phaser.Math.Between(0, SCENARIOS.length - 1)];
    if (sc === this.sc) sc = SCENARIOS[(SCENARIOS.indexOf(sc) + 1) % SCENARIOS.length];
    this.sc = sc;
    this.emojiText.setText(sc.e);
    this.prompt.set(sc.text);
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = [...sc.d].sort(() => Math.random() - 0.5).slice(0, n - 1);
    const bank = [sc.a, ...distract].sort(() => Math.random() - 0.5);
    const cols = bank.length <= 4 ? bank.length : 2;
    const rows = bank.length <= 4 ? 1 : 2;
    const gl = gridLayout(this, {
      cols,
      rows,
      preferredW: CARD_W,
      minW: 120,
      widthPad: 20,
      topPad: this.scale.height * 0.5,
      bottomY: this.scale.height - 100 - SAB(),
      cardH: CARD_H,
    });
    bank.forEach((word, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + (row - (rows - 1) / 2) * gl.spacingY, gl.cardW, gl.cardH, word, BTN_NEUTRAL, 26);
      tile.on("pointerdown", () => this.tap(tile, word));
      this.tiles.push({ sprite: tile, word });
    });
    this.time.delayedCall(350, () => speak(sc.text, { lang: "bn" }));
  }

  private tap(container: Phaser.GameObjects.Container, word: string) {
    if (this.locked) return;
    if (word === this.sc.a) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.tweens.add({ targets: container, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.time.delayedCall(200, () => speak(this.sc.a, { lang: "bn" }));
      this.floatMsg(t("plGreat"));
      this.qInRound++;
      this.time.delayedCall(950, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "What's the polite word for this moment?",
      hintBn: () => "এই মুহূর্তে ভদ্র শব্দটা কী?",
      correct: () => this.sc.a,
      options: () => this.tiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.word })),
    });
    this.time.delayedCall(500, () => speak(this.sc.text, { lang: "bn" }));
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("plDone"));
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
