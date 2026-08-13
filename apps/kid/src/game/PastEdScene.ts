import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, type RoundMeterApi } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-pasted")?.difficultyLevels ?? [3, 3, 4, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 4;

interface Verb {
  id: number;
  base: string;
  past: string;
  wrongPast: string;
  emoji: string;
  sentEn: string; // contains ___
  sentBn: string; // contains ___
}

/** 10 common regular verbs — each with its -ed form and a tricky wrong form. */
const VERBS: Verb[] = [
  { id: 1, base: "play", past: "played", wrongPast: "plaied", emoji: "⚽", sentEn: "Yesterday I ___ football.", sentBn: "গতকাল আমি ফুটবল ___।" },
  { id: 2, base: "jump", past: "jumped", wrongPast: "jumpt", emoji: "🐸", sentEn: "The frog ___ over the rock.", sentBn: "ব্যাঙটা পাথরের ওপর ___।" },
  { id: 3, base: "walk", past: "walked", wrongPast: "walkd", emoji: "🚶", sentEn: "We ___ to school this morning.", sentBn: "আমরা সকালে স্কুলে হেঁটে ___।" },
  { id: 4, base: "help", past: "helped", wrongPast: "holped", emoji: "🤝", sentEn: "She ___ her little brother.", sentBn: "সে তার ছোট ভাইকে ___।" },
  { id: 5, base: "paint", past: "painted", wrongPast: "paintd", emoji: "🎨", sentEn: "Mumu ___ a rainbow picture.", sentBn: "মুমু রংধনুর ছবি ___।" },
  { id: 6, base: "wash", past: "washed", wrongPast: "washd", emoji: "🍽️", sentEn: "Dad ___ the dishes after dinner.", sentBn: "রাতের খাবারের পর বাবা বাসন ___।" },
  { id: 7, base: "cook", past: "cooked", wrongPast: "cookt", emoji: "🍚", sentEn: "Grandma ___ delicious rice.", sentBn: "দাদি মজার ভাত ___।" },
  { id: 8, base: "call", past: "called", wrongPast: "calld", emoji: "📞", sentEn: "I ___ my friend on the phone.", sentBn: "আমি ফোনে বন্ধুকে ___।" },
  { id: 9, base: "laugh", past: "laughed", wrongPast: "laughd", emoji: "😂", sentEn: "Everyone ___ at the funny joke.", sentBn: "মজার কৌতুকে সবাই ___।" },
  { id: 10, base: "watch", past: "watched", wrongPast: "watchd", emoji: "📺", sentEn: "We ___ a cartoon last night.", sentBn: "গত রাতে আমরা কার্টুন ___।" },
];

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Regular past tense (-ed) (#54).
 * Band 3 grammar: fill the blank in a sentence with the correct -ed form.
 * 10 common verbs (play→played, jump→jumped…). Nova reads the FULL sentence
 * aloud after every correct answer; wrong options are the base form and a
 * misspelled -ed so kids notice the -ed suffix.
 */
export class PastEdScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private bag: number[] = [];
  private pos = 0;
  private current!: Verb;
  private options: string[] = [];
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private promptText!: Phaser.GameObjects.Text;
  private emojiText!: Phaser.GameObjects.Text;
  private sentenceText!: Phaser.GameObjects.Text;
  private optionBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("PastEd");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titlePastEd"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, t("pastEdPrompt"), txt(24, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.emojiText = this.add.text(0, 0, "", txt(56, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.sentenceText = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 330 }))
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
    this.emojiText.setPosition(width / 2, height * 0.27);
    this.sentenceText.setPosition(width / 2, height * 0.39);
    this.sentenceText.setWordWrapWidth(Math.max(220, width - 50));
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.56, height * 0.72, height * 0.88];
    for (let i = 0; i < 3; i++) this.optionBtns[i]?.setPosition(width / 2, ys[i]);
  }

  private buildOptions() {
    const { width, height } = this.scale;
    for (const b of this.optionBtns) b.destroy(true);
    this.optionBtns = [];
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.56, height * 0.72, height * 0.88];
    for (let i = 0; i < 3; i++) {
      const b = modernCardButton(this, width / 2, ys[i], bw, 58, "", BTN_NEUTRAL, 26, bw - 20);
      b.on("pointerdown", () => this.tap(i));
      this.optionBtns.push(b);
    }
  }

  private startRound() {
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const bag: number[] = [];
    for (let i = 0; i < n; i++) bag.push(i % VERBS.length);
    this.bag = shuffle(bag);
    this.pos = 0;
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundsDone = 0;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.ask();
  }

  private ask() {
    this.locked = false;
    const id = this.bag[this.pos % this.bag.length];
    this.current = VERBS[id];
    const s = getAppLang() === "bn" ? this.current.sentBn : this.current.sentEn;
    this.sentenceText.setText(s);
    this.promptText.setText(t("pastEdWhich"));
    this.emojiText.setText(this.current.emoji);
    speak(s.replace("___", "_____"), { lang: getAppLang() === "bn" ? "bn" : "en" });

    this.options = shuffle([this.current.base, this.current.wrongPast, this.current.past]);
    for (let i = 0; i < 3; i++) {
      const api = this.optionBtns[i].getData("nv-btn") as { setLabel: (t: string) => void } | undefined;
      api?.setLabel(this.options[i]);
      const face = this.optionBtns[i].list[0] as Phaser.GameObjects.Image;
      face.setTint(0xffffff);
    }
  }

  private tap(i: number) {
    if (this.locked) return;
    if (this.options[i] !== this.current.past) {
      bad();
      const face = this.optionBtns[i].list[0] as Phaser.GameObjects.Image;
      face.setTint(0xff6b6b);
      this.time.delayedCall(350, () => face.setTint(0xffffff));
      return;
    }
    this.locked = true;
    pop();
    (this.optionBtns[i].getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
    const full = (getAppLang() === "bn" ? this.current.sentBn : this.current.sentEn).replace("___", this.current.past);
    this.sentenceText.setText(full);
    speak(full, { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.pos++;
    this.qInRound++;
    this.time.delayedCall(900, () => {
      if (this.qInRound >= QUESTIONS_PER_ROUND) this.finishRound();
      else this.ask();
    });
  }

  private finishRound() {
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(400, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }
}
