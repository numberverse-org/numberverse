import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, modernAnswerButton, correctButton, ringCorrect, roundMeter, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-bnpronouns")?.difficultyLevels ?? [3, 3, 4, 4, 5, 5];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 3;
const PRONOUNS = ["আমি", "তুমি", "সে", "আমরা", "তোমরা", "তারা"];

/** Sentence slots with a blank (`____`). `hint` is who is speaking, `a` the pronoun. */
const SENTENCES: { s: string; a: string; hint: string; en: string }[] = [
  { s: "____ ভাত খাই।", a: "আমি", hint: "🧒", en: "____ eat rice." },
  { s: "____ স্কুলে যায়।", a: "সে", hint: "👦", en: "____ goes to school." },
  { s: "____ বই পড়ি।", a: "আমি", hint: "👧", en: "____ read a book." },
  { s: "____ মাছ ধরো?", a: "তুমি", hint: "🎣", en: "____ catch fish?" },
  { s: "____ গান গাই।", a: "আমরা", hint: "👧👦", en: "____ sing." },
  { s: "____ কোথায় যাও?", a: "তুমি", hint: "🚶", en: "____ go where?" },
  { s: "____ বাজারে গেল।", a: "সে", hint: "🧔", en: "____ went to market." },
  { s: "____ মাঠে খেলি।", a: "আমরা", hint: "🧒🧒", en: "____ play in the field." },
  { s: "____ বৃষ্টিতে ভিজে।", a: "তারা", hint: "👧👦", en: "____ get wet in the rain." },
  { s: "____ কাকে ডাকো?", a: "তোমরা", hint: "📣", en: "____ call whom?" },
  { s: "____ মিছরি ভালোবাসি।", a: "আমি", hint: "🍬", en: "____ love sweets." },
  { s: "____ ক্লাসে বসে।", a: "তারা", hint: "👧👧", en: "____ sit in class." },
];

/**
 * Bangla pronouns (#48).
 * Band 3 grammar: fill the blank in a Bangla sentence with the right pronoun
 * (আমি / তুমি / সে / আমরা / তোমরা / তারা). A picture hint shows WHO is
 * speaking; Nova reads the full sentence aloud after every correct answer.
 */
export class PronounScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private target!: { s: string; a: string; hint: string; en: string };
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private hintText!: Phaser.GameObjects.Text;
  private sentenceText!: Phaser.GameObjects.Text;
  private answers: { sprite: Phaser.GameObjects.Container; value: string }[] = [];

  constructor() {
    super("Pronoun");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titlePronoun"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.hintText = this.add
      .text(0, 0, "", txt(64, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.sentenceText = this.add
      .text(0, 0, "", txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5).setDepth(2);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.14);
    this.hintText.setPosition(width / 2, height * 0.28);
    this.sentenceText.setPosition(width / 2, height * 0.44);
  }

  private startRound() {
    this.clearRound();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearRound();
    this.locked = false;
    let w = SENTENCES[Phaser.Math.Between(0, SENTENCES.length - 1)];
    if (this.target && w.s === this.target.s) {
      w = SENTENCES[(SENTENCES.indexOf(w) + 1) % SENTENCES.length];
    }
    this.target = w;
    this.prompt.set(t("pronounPrompt"));
    this.hintText.setText(w.hint);
    this.sentenceText.setText(w.s);

    const opts = [w.a, ...PRONOUNS.filter((p) => p !== w.a)].sort(() => Math.random() - 0.5).slice(0, 4);
    const n = opts.length;
    const gap = this.scale.width / (n + 1);
    const bw = Math.min(150, this.scale.width / (n + 0.5) - 14);
    const by = this.scale.height - 84 - SAB();
    opts.forEach((value, i) => {
      const c = modernAnswerButton(this, gap * (i + 1), by, bw / 2, value, BTN_PRIMARY, { labelSize: 22 });
      c.on("pointerdown", () => this.tap(c, value));
      this.answers.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: string) {
    if (this.locked) return;
    if (value !== this.target.a) {
      hintWrong(this, container, {
        hint: () => `Think about who is speaking: ${this.target.en.replace("____", "…")}`,
        hintBn: () => `কে কথা বলছে ভাবো — ছবিটা দেখো!`,
        correct: () => this.target.a,
        options: () => this.answers.map((o) => ({ sprite: o.sprite, value: o.value })),
      });
      return;
    }
    this.locked = true;
    pop();
    correctButton(container);
    ringCorrect(this, container);
    const full = this.target.s.replace("____", this.target.a);
    this.sentenceText.setText(full);
    speak(full, { lang: "bn" });
    this.prompt.set(t("pronounGreat"));
    this.qInRound++;
    this.time.delayedCall(700, () => {
      if (this.qInRound >= QUESTIONS_PER_ROUND) this.finishRound();
      else this.askQuestion();
    });
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(400, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearRound() {
    this.answers.forEach((o) => o.sprite.destroy());
    this.answers = [];
  }
}
