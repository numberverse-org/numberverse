import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-plurals")?.difficultyLevels ?? [4, 4, 6, 6, 8, 8];
const ROUNDS_TO_FINISH = 3;

interface Pair {
  id: number;
  one: string;
  many: string;
  emoji: string;
  rule: string; // "s" | "es" | "ies" — shown as the rule demo
}

/** 21 regular plurals across the three rule groups (-s / -es / -ies). */
const PAIRS: Pair[] = [
  // -s (add s)
  { id: 1, one: "cat", many: "cats", emoji: "🐱", rule: "s" },
  { id: 2, one: "dog", many: "dogs", emoji: "🐶", rule: "s" },
  { id: 3, one: "book", many: "books", emoji: "📚", rule: "s" },
  { id: 4, one: "ball", many: "balls", emoji: "⚽", rule: "s" },
  { id: 5, one: "car", many: "cars", emoji: "🚗", rule: "s" },
  { id: 6, one: "apple", many: "apples", emoji: "🍎", rule: "s" },
  { id: 7, one: "star", many: "stars", emoji: "⭐", rule: "s" },
  { id: 8, one: "bird", many: "birds", emoji: "🐦", rule: "s" },
  // -es (add es after s/x/ch/sh)
  { id: 9, one: "box", many: "boxes", emoji: "📦", rule: "es" },
  { id: 10, one: "bus", many: "buses", emoji: "🚌", rule: "es" },
  { id: 11, one: "dish", many: "dishes", emoji: "🍽️", rule: "es" },
  { id: 12, one: "watch", many: "watches", emoji: "⌚", rule: "es" },
  { id: 13, one: "fox", many: "foxes", emoji: "🦊", rule: "es" },
  { id: 14, one: "brush", many: "brushes", emoji: "🖌️", rule: "es" },
  { id: 15, one: "glass", many: "glasses", emoji: "🥛", rule: "es" },
  // -ies (consonant + y → ies)
  { id: 16, one: "baby", many: "babies", emoji: "👶", rule: "ies" },
  { id: 17, one: "candy", many: "candies", emoji: "🍬", rule: "ies" },
  { id: 18, one: "butterfly", many: "butterflies", emoji: "🦋", rule: "ies" },
  { id: 19, one: "cherry", many: "cherries", emoji: "🍒", rule: "ies" },
  { id: 20, one: "bunny", many: "bunnies", emoji: "🐰", rule: "ies" },
  { id: 21, one: "puppy", many: "puppies", emoji: "🐶", rule: "ies" },
];

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** e.g. rule "ies" → "one puppy — change y to -ies!" */
function ruleDemo(rule: string): string {
  if (rule === "es") return t("plurRuleEs");
  if (rule === "ies") return t("plurRuleIes");
  return t("plurRuleS");
}

/**
 * Regular plurals (#53).
 * Band 2 grammar: see one noun + emoji ("one cat 🐱"), tap the correct
 * plural ("two ___?"). A rule demo line teaches each group as it appears:
 * add -s (cats), add -es (boxes), change y → -ies (babies). Shuffle-bag +
 * round-level dedupe; 3 string-distinct options; wrong taps get a gentle hint.
 */
export class PluralsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private bag: number[] = [];
  private pos = 0;
  private current!: Pair;
  private options: string[] = [];
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private promptText!: Phaser.GameObjects.Text;
  private ruleText!: Phaser.GameObjects.Text;
  private emojiText!: Phaser.GameObjects.Text;
  private wordText!: Phaser.GameObjects.Text;
  private optionBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("Plurals");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titlePlurals"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, t("plurPrompt"), txt(24, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.ruleText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true, wrap: 320 }))
      .setOrigin(0.5);
    this.emojiText = this.add.text(0, 0, "", txt(56, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.wordText = this.add
      .text(0, 0, "", txt(40, "#ffffff", { bold: true, outline: true, wrap: 330 }))
      .setOrigin(0.5);
    this.buildOptions();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 32);
    this.roundText.setPosition(width / 2, 64);
    this.meter.setPosition(width / 2, 88);
    this.promptText.setPosition(width / 2, height * 0.17);
    this.promptText.setWordWrapWidth(Math.max(220, width - 50));
    this.ruleText.setPosition(width / 2, height * 0.245);
    this.ruleText.setWordWrapWidth(Math.max(220, width - 50));
    this.emojiText.setPosition(width / 2, height * 0.32);
    this.wordText.setPosition(width / 2, height * 0.43);
    this.wordText.setWordWrapWidth(Math.max(220, width - 50));
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.57, height * 0.72, height * 0.87];
    for (let i = 0; i < 3; i++) this.optionBtns[i]?.setPosition(width / 2, ys[i]);
  }

  private buildOptions() {
    const { width, height } = this.scale;
    for (const b of this.optionBtns) b.destroy(true);
    this.optionBtns = [];
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.57, height * 0.72, height * 0.87];
    for (let i = 0; i < 3; i++) {
      const b = modernCardButton(this, width / 2, ys[i], bw, 58, "", BTN_NEUTRAL, 24, bw - 20);
      b.on("pointerdown", () => this.tap(i));
      this.optionBtns.push(b);
    }
  }

  private startRound() {
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const bag: number[] = [];
    for (let i = 0; i < n; i++) bag.push(i % PAIRS.length);
    this.bag = shuffle(bag);
    this.pos = 0;
    this.roundsDone = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.ask();
  }

  private ask() {
    this.locked = false;
    const id = this.bag[this.pos % this.bag.length];
    this.current = PAIRS[id];
    const label = getAppLang() === "bn" ? t("plurOne", { w: this.current.one }) : `one ${this.current.one}`;
    this.promptText.setText(label);
    this.ruleText.setText(ruleDemo(this.current.rule));
    this.emojiText.setText(this.current.emoji);
    this.wordText.setText(this.current.many);
    speak(`${this.current.one}, ${this.current.many}`, { lang: "en" });

    const others = PAIRS.filter((p) => p.many !== this.current.many).map((p) => p.many);
    this.options = shuffle(others).slice(0, 2);
    this.options.push(this.current.many);
    this.options = shuffle(this.options);
    for (let i = 0; i < 3; i++) {
      const api = this.optionBtns[i].getData("nv-btn") as { setLabel: (t: string) => void } | undefined;
      api?.setLabel(this.options[i]);
      const face = this.optionBtns[i].list[0] as Phaser.GameObjects.Image;
      face.setTint(0xffffff);
    }
  }

  private tap(i: number) {
    if (this.locked) return;
    const v = this.options[i];
    if (v !== this.current.many) {
      bad();
      const face = this.optionBtns[i].list[0] as Phaser.GameObjects.Image;
      face.setTint(0xff6b6b);
      this.time.delayedCall(350, () => face.setTint(0xffffff));
      return;
    }
    this.locked = true;
    pop();
    (this.optionBtns[i].getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
    speak(this.current.many, { lang: "en" });
    this.pos++;
    this.time.delayedCall(650, () => {
      if (this.pos >= this.bag.length) this.finishRound();
      else this.ask();
    });
  }

  private finishRound() {
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(500, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }
}
