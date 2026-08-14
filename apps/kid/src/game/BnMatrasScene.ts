import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { answerRow } from "./layout";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-bnmatras")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
/** Base letter + matra → combined form. রেফ, ং etc. kept simple for kids. */
const MATRAS = [
  { base: "ক", matra: "া", combined: "কা", hint: "া" },
  { base: "ক", matra: "ি", combined: "কি", hint: "ি" },
  { base: "ক", matra: "ী", combined: "কী", hint: "ী" },
  { base: "ক", matra: "ু", combined: "কু", hint: "ু" },
  { base: "ক", matra: "ূ", combined: "কূ", hint: "ূ" },
  { base: "ক", matra: "ে", combined: "কে", hint: "ে" },
  { base: "ক", matra: "ো", combined: "কো", hint: "ো" },
  { base: "গ", matra: "া", combined: "গা", hint: "া" },
  { base: "ম", matra: "া", combined: "মা", hint: "া" },
  { base: "ম", matra: "ি", combined: "মি", hint: "ি" },
  { base: "ব", matra: "া", combined: "বা", hint: "া" },
  { base: "স", matra: "ু", combined: "সু", hint: "ু" },
  { base: "ন", matra: "া", combined: "না", hint: "া" },
  { base: "ত", matra: "ু", combined: "তু", hint: "ু" },
];
/** #20 — Bangla conjuncts (যুক্তবর্ণ): two letters fuse into one glyph. Same
 *  "combine" mechanic as matras, with a conjunct pool instead. Class 5 reading
 *  hits these constantly (ক্ষ ঞ্জ ঙ্ক ণ্ড). */
const CONJUNCTS = [
  { base: "ক", base2: "ষ", combined: "ক্ষ", hint: "ক্ষ" },
  { base: "ক", base2: "খ", combined: "খ্খ", hint: "খ্খ" },
  { base: "জ", base2: "্ঞ", combined: "জ্ঞ", hint: "জ্ঞ" },
  { base: "ক", base2: "ক", combined: "ক্ক", hint: "ক্ক" },
  { base: "ত", base2: "্ত", combined: "ত্ত", hint: "ত্ত" },
  { base: "ঙ", base2: "্ক", combined: "ঙ্ক", hint: "ঙ্ক" },
  { base: "ণ", base2: "্ড", combined: "ণ্ড", hint: "ণ্ড" },
  { base: "ম", base2: "্প", combined: "ম্প", hint: "ম্প" },
  { base: "ল", base2: "্ল", combined: "ল্ল", hint: "ল্ল" },
  { base: "স", base2: "্থ", combined: "স্থ", hint: "স্থ" },
  { base: "ন", base2: "্ত", combined: "ন্ত", hint: "ন্ত" },
  { base: "শ", base2: "্চ", combined: "শ্চ", hint: "শ্চ" },
  { base: "প", base2: "্র", combined: "প্র", hint: "প্র" },
  { base: "ব", base2: "্র", combined: "ব্র", hint: "ব্র" },
];
/** #759 — matra WORDS: join two SYLLABLES (the second carrying a matra) into a
 *  whole word. The band-3 decoding bridge between band-2 matra-matrix
 *  (ক+◻+টা=কাটা) and band-4 bn-matras (ক+া=কা): the kid now READS the word by
 *  joining its syllable halves — কা + টা = কাটা. Same combine mechanic. */
const WORDS: { parts: [string, string]; combined: string }[] = [
  { parts: ["কা", "টা"], combined: "কাটা" },
  { parts: ["গা", "ছ"], combined: "গাছ" },
  { parts: ["মা", "ছ"], combined: "মাছ" },
  { parts: ["হা", "তি"], combined: "হাতি" },
  { parts: ["ন", "দী"], combined: "নদী" },
  { parts: ["ক", "লা"], combined: "কলা" },
  { parts: ["ব", "ই"], combined: "বই" },
  { parts: ["তা", "রা"], combined: "তারা" },
  { parts: ["সু", "খ"], combined: "সুখ" },
  { parts: ["বা", "টি"], combined: "বাটি" },
  { parts: ["চা", "ল"], combined: "চাল" },
  { parts: ["সা", "রি"], combined: "সারি" },
  { parts: ["রো", "দ"], combined: "রোদ" },
  { parts: ["বে", "ড়া"], combined: "বেড়া" },
];
/** A combine fact — matras, conjuncts OR words share the same 2→1 shape. */
type CombineFact = { parts: [string, string]; combined: string; hint: string };
const MATRA_FACTS: CombineFact[] = MATRAS.map((m) => ({ parts: [m.base, m.matra], combined: m.combined, hint: m.hint }));
const CONJUNCT_FACTS: CombineFact[] = CONJUNCTS.map((c) => ({ parts: [c.base, c.base2], combined: c.combined, hint: c.hint }));
const WORD_FACTS: CombineFact[] = WORDS.map((w) => ({ parts: w.parts, combined: w.combined, hint: w.combined }));
const BUTTON_RADIUS = 56;
const ROUNDS_TO_FINISH = 3;

/**
 * Bangla Matras — combine a letter with its matra.
 * Band 4 (ages 8–10). Shows "ক + া = ?" and kid taps the combined letter.
 */
export class BnMatrasScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private conjunctMode = false;
  private wordsMode = false;
  private facts: CombineFact[] = MATRA_FACTS;
  private target!: CombineFact;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BnMatras");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; mode?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #20 — conjuncts mode (bn-conjuncts) shares the combine mechanic.
    this.conjunctMode = data.mode === "conjuncts";
    // #759 — words mode (bn-matra-words, band 3) shares it too: syllable→word.
    this.wordsMode = data.mode === "words";
    this.facts = this.wordsMode ? WORD_FACTS : this.conjunctMode ? CONJUNCT_FACTS : MATRA_FACTS;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t(this.wordsMode ? "titleBnMatraWords" : this.conjunctMode ? "titleBnConjunct" : "titleBnMatras"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.factText = this.add
      .text(0, 0, "", txt(this.wordsMode ? 48 : 56, NV_GOLD, {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t(this.wordsMode ? "tapMatraWords" : this.conjunctMode ? "tapConjunct" : "tapMatra"));
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "floral");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.factText.setPosition(width / 2, height * 0.42);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private startRound() {
    this.clearButtons();
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = this.facts[Phaser.Math.Between(0, this.facts.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.factText.setText(`${this.target.parts[0]} + ${this.target.parts[1]} = ?`);
    speak(this.target.combined);
    this.spawnButtons(n);
  }

  private spawnButtons(n: number) {
    const opts = [this.target, ...this.facts.filter((m) => m.combined !== this.target.combined)]
      .slice(0, n)
      .sort(() => Math.random() - 0.5);
    // answerRow always fits the canvas width (shrinks radius on narrow phones)
    // and lifts the row above the phone home-indicator area.
    const { radius, y, xFor } = answerRow(this, opts.length, BUTTON_RADIUS, 12);
    opts.forEach((m, i) => {
      const c = modernAnswerButton(this, xFor(i), y, radius, m.combined, BTN_PRIMARY, {
        labelSize: Math.max(28, Math.round(radius * 0.68)),
      });
      c.on("pointerdown", () => this.tap(c, m.combined));
      this.buttons.push({ sprite: c, value: m.combined });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: string) {
    if (value !== this.target.combined) {
      hintWrong(this, container, {
        hint: "Match the sound to the letter it belongs with",
        hintBn: "শব্দটির সাথে মিলিয়ে সঠিক অক্ষরটি বেছে নাও",
        correct: () => this.target.combined,
        options: () => this.buttons,
      });
      return;
    }
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
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

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
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
