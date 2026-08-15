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

const LEVELS = GAMES.find((g) => g.id === "game-rcontrolled")?.difficultyLevels ?? [3, 3, 3, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 150;
const CARD_H = 84;
/** Word families per bossy-R vowel (ar er ir or ur). Each word has exactly one
 * occurrence of its family vowel, so swapping it yields 4 plausible misspellings
 * as distractors (car → cur, cer, cor, cir). */
interface WordItem {
  e: string;
  w: string;
  fam: "ar" | "er" | "ir" | "or" | "ur";
}
const WORDS: WordItem[] = [
  // ar family
  { e: "🚗", w: "car", fam: "ar" },
  { e: "⭐", w: "star", fam: "ar" },
  { e: "🫙", w: "jar", fam: "ar" },
  { e: "🚜", w: "farm", fam: "ar" },
  { e: "🐶", w: "bark", fam: "ar" },
  // er family
  { e: "👩", w: "her", fam: "er" },
  { e: "🌿", w: "fern", fam: "er" },
  { e: "🐯", w: "tiger", fam: "er" },
  { e: "🌊", w: "river", fam: "er" },
  { e: "✉️", w: "letter", fam: "er" },
  // ir family
  { e: "🐦", w: "bird", fam: "ir" },
  { e: "👧", w: "girl", fam: "ir" },
  { e: "👕", w: "shirt", fam: "ir" },
  { e: "🥇", w: "first", fam: "ir" },
  { e: "🥄", w: "stir", fam: "ir" },
  // or family
  { e: "🌽", w: "corn", fam: "or" },
  { e: "🍴", w: "fork", fam: "or" },
  { e: "⛈️", w: "storm", fam: "or" },
  { e: "🐴", w: "horse", fam: "or" },
  { e: "📯", w: "horn", fam: "or" },
  // ur family
  { e: "🐻", w: "fur", fam: "ur" },
  { e: "🔄", w: "turn", fam: "ur" },
  { e: "🔥", w: "burn", fam: "ur" },
  { e: "💊", w: "nurse", fam: "ur" },
  { e: "👛", w: "purse", fam: "ur" },
];

const VOWELS: ("ar" | "er" | "ir" | "or" | "ur")[] = ["ar", "er", "ir", "or", "ur"];
function altSpellings(w: string, fam: string): string[] {
  return VOWELS.filter((v) => v !== fam).map((v) => w.replace(fam, v));
}

/**
 * R-controlled vowels — bossy-R (ar er ir or ur) (#175).
 * Band 2 phonics: hear the word (🔊, English), tap its correct spelling among
 * 3-4 plausible bossy-R misspellings (car vs cur/cer/cor/cir). 5 word families
 * × 5 words. Wrong taps retire that spelling and re-speak the word.
 */
export class RControlledScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private it!: WordItem;
  private tiles: { sprite: Phaser.GameObjects.Container; w: string }[] = [];
  private emojiText!: Phaser.GameObjects.Text;
  private replayBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("RControlled");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleBossyR"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.emojiText = this.add
      .text(0, 0, "", txt(72, "#ffffff", { outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.replayBtn = modernCardButton(this, 0, 0, 96, 60, "🔊", BTN_ORANGE, 28);
    this.replayBtn.on("pointerdown", () => speak(this.it.w, { lang: "en" }));
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
    this.prompt.setPosition(width / 2, height * 0.32);
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
    let it = WORDS[Phaser.Math.Between(0, WORDS.length - 1)];
    if (it.w === this.it?.w) it = WORDS[(WORDS.indexOf(it) + 1) % WORDS.length];
    this.it = it;
    this.emojiText.setText(it.e);
    this.prompt.set(t("brPrompt"));
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = altSpellings(it.w, it.fam).sort(() => Math.random() - 0.5).slice(0, n - 1);
    const bank = [it.w, ...distract].sort(() => Math.random() - 0.5);
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
    bank.forEach((w, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + (row - (rows - 1) / 2) * gl.spacingY, gl.cardW, gl.cardH, w, BTN_NEUTRAL, 30);
      tile.on("pointerdown", () => this.tap(tile, w));
      this.tiles.push({ sprite: tile, w });
    });
    this.time.delayedCall(350, () => speak(it.w, { lang: "en" }));
  }

  private tap(container: Phaser.GameObjects.Container, w: string) {
    if (this.locked) return;
    if (w === this.it.w) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.tweens.add({ targets: container, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.time.delayedCall(200, () => speak(this.it.w, { lang: "en" }));
      this.floatMsg(t("brGreat"));
      this.qInRound++;
      this.time.delayedCall(950, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "Listen for the bossy-R sound!",
      hintBn: () => "bossy-R শব্দটা শুনো!",
      correct: () => this.it.w,
      options: () => this.tiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.w })),
    });
    this.time.delayedCall(500, () => speak(this.it.w, { lang: "en" }));
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("brDone"));
    this.onRoundDone?.(this.qInRound >= QUESTIONS_PER_ROUND, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.6, text, NV_GOLD, 28, -28);
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}
