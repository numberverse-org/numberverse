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

const LEVELS = GAMES.find((g) => g.id === "game-punct")?.difficultyLevels ?? [2, 2, 3, 3, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 96;
const CARD_H = 84;

type Punc = "." | "?" | "!" | ",";
interface Sentence {
  text: string; // sentence WITHOUT ending punctuation
  p: Punc;      // the punctuation it ends with
}
/* 22 sentences (done-when: 20+) — every one ends with । (.), ? or !.
 * "," only ever appears as a wrong option (sentences don't end with commas). */
const SENTENCES: Sentence[] = [
  { text: "আজ স্কুলে যাব", p: "." },
  { text: "মা রান্না করছেন", p: "." },
  { text: "পাখিটি গাছে বসে আছে", p: "." },
  { text: "বৃষ্টি হচ্ছে", p: "." },
  { text: "আমার নাম রাফি", p: "." },
  { text: "সূর্য পশ্চিমে অস্ত যায়", p: "." },
  { text: "ছেলেটি বই পড়ছে", p: "." },
  { text: "দোকানটি বন্ধ", p: "." },
  { text: "তুমি কোথায় যাচ্ছ", p: "?" },
  { text: "এটা কী", p: "?" },
  { text: "তোমার নাম কী", p: "?" },
  { text: "মাছ কি পানিতে থাকে", p: "?" },
  { text: "কে দরজায় টোকা দিচ্ছে", p: "?" },
  { text: "আমরা কি খেলতে যাব", p: "?" },
  { text: "বৃষ্টি কখন হয়", p: "?" },
  { text: "কী সুন্দর ফুল", p: "!" },
  { text: "বড় সাপ", p: "!" },
  { text: "আজ আমার জন্মদিন", p: "!" },
  { text: "কী মজা", p: "!" },
  { text: "জয় বাংলা", p: "!" },
  { text: "বাহ্ চমৎকার", p: "!" },
  { text: "সাবাশ তুমি জিতেছ", p: "!" },
];
const PUNC_GLYPH: Record<Punc, string> = { ".": "।", "?": "?", "!": "!", ",": "," };
const ALL_PUNCS: Punc[] = [".", "?", "!", ","];

/**
 * Bangla Punctuation Placement — যতি চিহ্ন (#164).
 * Band 3 writing: a sentence is shown WITHOUT its end punctuation; the kid taps
 * the right tile (। ? ! ,) and it snaps into place. On correct, the full
 * sentence is READ ALONG with its punctuation (TTS ? and ! intonation), so the
 * kid HEARS the difference a punctuation mark makes. Wrong choices are retired
 * with a sentence-type hint. Levels grow the option set 2 → 3 → 4 tiles.
 */
export class PunctScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private sentence!: Sentence;
  private options: { sprite: Phaser.GameObjects.Container; p: Punc }[] = [];
  private panel!: Phaser.GameObjects.Graphics;
  private sentText!: Phaser.GameObjects.Text;
  private slotBox!: Phaser.GameObjects.Graphics;
  private placedText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Punct");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "kitchen");
    this.titleText = this.add
      .text(0, 0, t("titlePunct"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("puPrompt"));
    this.meter = roundMeter(this);
    this.panel = this.add.graphics().setDepth(1);
    this.sentText = this.add
      .text(0, 0, "", txt(30, "#ffffff", { bold: true, align: "center", wrap: 460 }))
      .setOrigin(0.5)
      .setDepth(2);
    this.slotBox = this.add.graphics().setDepth(2);
    this.placedText = this.add
      .text(0, 0, "", txt(44, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(3);
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
    this.drawSlot();
  }

  private showSentence() {
    const maxW = Math.min(this.scale.width * 0.8, 460);
    this.sentText
      .setStyle(txt(30, "#ffffff", { bold: true, align: "center", wrap: maxW - 40 }))
      .setText(this.sentence.text);
    const y = this.scale.height * 0.24;
    this.sentText.setPosition(this.scale.width / 2, y);
    const b = this.sentText.getBounds();
    this.panel.clear();
    this.panel.fillStyle(0x123d52, 0.72);
    this.panel.fillRoundedRect(b.x - 22, b.y - 20, b.width + 44, b.height + 40, 22);
    this.drawSlot();
  }

  private drawSlot() {
    const { width } = this.scale;
    const x = width / 2 + (this.sentText.width > 0 ? this.sentText.width / 2 + 34 : 0);
    const y = this.scale.height * 0.24;
    this.slotBox.clear();
    this.slotBox.lineStyle(3, 0xffd166, 0.9);
    this.slotBox.strokeRoundedRect(x - 26, y - 30, 52, 60, 12);
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
    this.placedText.setText("");
    let s = SENTENCES[Phaser.Math.Between(0, SENTENCES.length - 1)];
    if (s === this.sentence) s = SENTENCES[(SENTENCES.indexOf(s) + 1) % SENTENCES.length];
    this.sentence = s;
    this.showSentence();
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distracts = ALL_PUNCS.filter((p) => p !== s.p).sort(() => Math.random() - 0.5).slice(0, n - 1);
    const opts = [s.p, ...distracts].sort(() => Math.random() - 0.5);
    const cols = opts.length;
    const gl = gridLayout(this, {
      cols,
      rows: 1,
      preferredW: CARD_W,
      minW: 72,
      widthPad: 40,
      topPad: this.scale.height * 0.46,
      bottomY: this.scale.height - 110 - SAB(),
      cardH: CARD_H,
    });
    opts.forEach((p, i) => {
      const x = gl.startX + i * gl.spacingX;
      const y = gl.cy;
      const c = modernCardButton(this, x, y, gl.cardW, CARD_H, PUNC_GLYPH[p], BTN_PRIMARY, 44);
      c.on("pointerdown", () => this.tap(c, p));
      this.options.push({ sprite: c, p });
    });
  }

  private tap(container: Phaser.GameObjects.Container, p: Punc) {
    if (this.locked) return;
    if (p !== this.sentence.p) {
      hintWrong(this, container, {
        hint: () => this.hintText(this.sentence.p),
        hintBn: () => this.hintTextBn(this.sentence.p),
        correct: () => PUNC_GLYPH[this.sentence.p],
        options: () => this.options.map((o) => ({ sprite: o.sprite, value: PUNC_GLYPH[o.p] })),
      });
      return;
    }
    this.locked = true;
    pop();
    correctButton(container);
    // snap the glyph into the end slot
    this.placedText.setText(PUNC_GLYPH[p]);
    this.placedText.setPosition(this.scale.width / 2 + (this.sentText.width > 0 ? this.sentText.width / 2 + 34 : 0), this.scale.height * 0.24);
    this.placedText.setScale(0.3);
    this.tweens.add({ targets: this.placedText, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.slotBox.clear();
    // read the DIFFERENCE aloud — the sentence with its real punctuation
    speak(`${this.sentence.text}${PUNC_GLYPH[p]}`, { lang: "bn" });
    this.floatSmall(this.scale.width / 2, this.scale.height * 0.31, t("puGreat"));
    this.qInRound++;
    if (this.qInRound >= QUESTIONS_PER_ROUND) {
      this.time.delayedCall(800, () => this.finishRound());
    } else {
      this.time.delayedCall(800, () => this.askQuestion());
    }
  }

  private hintText(p: Punc): string {
    if (p === "?") return "This sentence asks a question — tap the ?";
    if (p === "!") return "This sentence is excited — tap the !";
    return "This sentence states something — tap the ।";
  }

  private hintTextBn(p: Punc): string {
    if (p === "?") return "এটা প্রশ্ন — প্রশ্ন চিহ্ন (?) টিপো";
    if (p === "!") return "এটা বিস্ময় — বিস্ময় চিহ্ন (!) টিপো";
    return "এটা বিবৃত বাক্য — দাঁড়ি (।) টিপো";
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("puDone"));
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
