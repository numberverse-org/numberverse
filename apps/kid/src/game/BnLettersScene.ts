import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, gridLayout, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-bnletters")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
/** Bangla vowel letters (স্বরবর্ণ) — with English-ish romanization for the parent. */
const SWAROBORNO = [
  { bn: "অ", en: "O" },
  { bn: "আ", en: "Aa" },
  { bn: "ই", en: "I" },
  { bn: "ঈ", en: "Ii" },
  { bn: "উ", en: "U" },
  { bn: "ঊ", en: "Uu" },
  { bn: "ঋ", en: "Ri" },
  { bn: "এ", en: "E" },
  { bn: "ঐ", en: "Oi" },
  { bn: "ও", en: "O" },
  { bn: "ঔ", en: "Ou" },
];
/** Bangla consonant letters (ব্যঞ্জনবর্ণ). */
const BENJONBORNO = [
  { bn: "ক", en: "Ko" },
  { bn: "খ", en: "Kho" },
  { bn: "গ", en: "Go" },
  { bn: "ঘ", en: "Gho" },
  { bn: "ঙ", en: "Ngo" },
  { bn: "চ", en: "Cho" },
  { bn: "ছ", en: "Chho" },
  { bn: "জ", en: "Jo" },
  { bn: "ঝ", en: "Jho" },
  { bn: "ট", en: "To" },
  { bn: "ঠ", en: "Tho" },
  { bn: "ড", en: "Do" },
];
const LETTER_RADIUS = 56;
const ROUNDS_TO_FINISH = 3;

/**
 * Bangla Swaroborno — find the letter the owl says.
 * Band 1 (ages 2–4). Big, fat tap targets; zero text walls (Bangla is visual-first for
 * pre-readers). The target letter is shown at top; kid taps the matching card below.
 */
export class BnLettersScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private mode: "vowels" | "consonants" = "vowels";
  private target!: { bn: string; en: string };
  private cards: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BnLetters");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; mode?: "vowels" | "consonants" }) {
    this.onRoundDone = data.onRoundDone;
    this.mode = data.mode ?? "vowels";
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, this.mode === "consonants" ? "ব্যঞ্জনবর্ণ" : "স্বরবর্ণ", txt(36, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
        this.prompt = questionPanel(this, 0, 0, { tail: "none" });
    this.prompt.set(t("findLetter"));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "floral");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 44);
    this.roundText.setPosition(width / 2, 82);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height - 32 - SAB());
    this.reflowCards();
  }

  private startRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    const letters = this.mode === "consonants" ? BENJONBORNO : SWAROBORNO;
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = letters[Phaser.Math.Between(0, Math.min(n, letters.length) - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.showTarget();
    this.spawnCards(n);
  }

  private showTarget() {
    // The owl + big target letter at the top
    this.prompt.set(t("findLetter", { ch: this.target.bn, hint: this.target.en }));
    speak(`Find the letter ${this.target.bn}. ${this.target.en}`);
  }

  private spawnCards(n: number) {
    const grid = n <= 3 ? { cols: 3, rows: 1 } : n <= 4 ? { cols: 2, rows: 2 } : n <= 6 ? { cols: 3, rows: 2 } : { cols: 4, rows: Math.ceil(n / 4) };
    // use THIS mode's letter pool so distractors match the question
    const letters = this.mode === "consonants" ? BENJONBORNO : SWAROBORNO;
    const opts = [this.target, ...letters.filter((l) => l.bn !== this.target.bn)].slice(0, n).sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: grid.cols,
      rows: grid.rows,
      preferredW: n <= 6 ? LETTER_RADIUS * 2 : LETTER_RADIUS * 1.6,
      minW: 56,
      widthPad: 40,
      topPad: 128,
      bottomY: this.scale.height - 56 - SAB(),
    });
    opts.forEach((letter, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (grid.rows - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, letter.bn, BTN_NEUTRAL, { labelSize: Math.max(24, Math.round(gl.cardW / 1.8)) });
      c.on("pointerdown", () => this.tap(c, letter.bn));
      c.setData("val", letter.bn);
      this.cards.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, bn: string) {
    if (bn !== this.target.bn) {
      hintWrong(this, container, {
        hint: () => `Look for the letter ${this.target.bn} — say it out loud`,
        hintBn: () => `${this.target.bn} অক্ষরটি খুঁজো — জোরে পড়ো`,
        correct: () => this.target.bn,
        options: () => this.cards.map((s) => ({ sprite: s, value: s.getData("val") })),
      });
      return;
    }
    pop();
    correctButton(container);
    this.cards.forEach((c) => c.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private reflowCards() {
    const { width } = this.scale;
    for (const c of this.cards) {
      c.x = Phaser.Math.Clamp(c.x, 30, width - 30);
    }
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, this.randomColor());
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-70, 70),
        y: y + Phaser.Math.Between(-70, 70),
        alpha: 0,
        duration: 520,
        onComplete: () => p.destroy(),
      });
    }
  }

  private randomColor(): number {
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255)
    );
  }
}
