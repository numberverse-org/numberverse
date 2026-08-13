import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, type RoundMeterApi } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-digraphs")?.difficultyLevels ?? [10000, 9000, 8000, 7000, 6000, 5000];
const ROUNDS_TO_FINISH = 3;

type Digraph = "sh" | "ch" | "th" | "wh" | "ph";

interface DgWord {
  dg: Digraph;
  emoji: string;
  before: string;
  after: string;
}

/** 25 kid words — 5 per digraph (the digraph is the blank). English phonics. */
const WORDS: DgWord[] = [
  { dg: "sh", emoji: "🚢", before: "", after: "ip" }, // ship
  { dg: "sh", emoji: "🐚", before: "", after: "ell" }, // shell
  { dg: "sh", emoji: "👟", before: "", after: "oe" }, // shoe
  { dg: "sh", emoji: "🏪", before: "", after: "op" }, // shop
  { dg: "sh", emoji: "🐟", before: "fi", after: "" }, // fish
  { dg: "ch", emoji: "🍟", before: "", after: "ip" }, // chip
  { dg: "ch", emoji: "🪑", before: "", after: "air" }, // chair
  { dg: "ch", emoji: "🧀", before: "", after: "eese" }, // cheese
  { dg: "ch", emoji: "🐤", before: "", after: "ick" }, // chick
  { dg: "ch", emoji: "⛓️", before: "", after: "ain" }, // chain
  { dg: "th", emoji: "👍", before: "", after: "umb" }, // thumb
  { dg: "th", emoji: "3️⃣", before: "", after: "ree" }, // three
  { dg: "th", emoji: "🌵", before: "", after: "orn" }, // thorn
  { dg: "th", emoji: "🛁", before: "ba", after: "" }, // bath
  { dg: "th", emoji: "🛤️", before: "pa", after: "" }, // path
  { dg: "wh", emoji: "🐋", before: "", after: "ale" }, // whale
  { dg: "wh", emoji: "🛞", before: "", after: "eel" }, // wheel
  { dg: "wh", emoji: "⚪", before: "", after: "ite" }, // white
  { dg: "wh", emoji: "🥄", before: "", after: "isk" }, // whisk
  { dg: "wh", emoji: "🐎", before: "", after: "ip" }, // whip
  { dg: "ph", emoji: "📱", before: "", after: "one" }, // phone
  { dg: "ph", emoji: "🖼️", before: "", after: "oto" }, // photo
  { dg: "ph", emoji: "🐬", before: "dol", after: "in" }, // dolphin
  { dg: "ph", emoji: "🐘", before: "ele", after: "ant" }, // elephant
  { dg: "ph", emoji: "🏆", before: "tro", after: "y" }, // trophy
];

const DG_ORDER: Digraph[] = ["sh", "ch", "th", "wh", "ph"];
/** Static i18n keys so the audit scanner sees every literal. */
const DG_KEY: Record<Digraph, string> = { sh: "dgSh", ch: "dgCh", th: "dgTh", wh: "dgWh", ph: "dgPh" };

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Digraph match (#220). A band-2 English phonics review consolidating sh/ch/
 * th/wh/ph. A picture + a word with the digraph missing ("__ip" 🚢) is spoken
 * aloud; the kid taps the digraph that makes the word. Every round shows one
 * word per digraph (all 5 guaranteed), and a shrinking timer bar ramps the
 * speed each level — a gentle "Faster!" on timeout, never a penalty.
 */
export class DigraphsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private roundWords: DgWord[] = [];
  private qIdx = 0;
  private current!: DgWord;
  private wrongs = 0;
  private locked = false;
  private timerTween?: Phaser.Tweens.Tween;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private emojiText!: Phaser.GameObjects.Text;
  private wordText!: Phaser.GameObjects.Text;
  private barG!: Phaser.GameObjects.Graphics;
  private fillG!: Phaser.GameObjects.Graphics;
  private dgBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("Digraphs");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleDigraph"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, t("dgPick"), txt(26, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.emojiText = this.add.text(0, 0, "", txt(58, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.wordText = this.add
      .text(0, 0, "", txt(38, "#ffffff", { bold: true, outline: true, wrap: 330 }))
      .setOrigin(0.5);
    this.barG = this.add.graphics().setDepth(20);
    this.fillG = this.add.graphics().setDepth(21);
    this.buildButtons();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 32);
    this.roundText.setPosition(width / 2, 64);
    this.meter.setPosition(width / 2, 88);
    this.promptText.setPosition(width / 2, height * 0.18);
    this.promptText.setWordWrapWidth(Math.max(220, width - 50));
    this.emojiText.setPosition(width / 2, height * 0.27);
    this.wordText.setPosition(width / 2, height * 0.38);
    this.wordText.setWordWrapWidth(Math.max(220, width - 50));
    this.drawTimer(1);
    const bw = Math.min(104, Math.floor((width - 40) / 3));
    const ys = [height * 0.64, height * 0.64, height * 0.64, height * 0.84, height * 0.84];
    const xs = [width / 2 - bw - 14, width / 2, width / 2 + bw + 14, width / 2 - bw / 2 - 7, width / 2 + bw / 2 + 7];
    for (let i = 0; i < 5; i++) {
      this.dgBtns[i]?.setPosition(xs[i], ys[i]);
      this.dgBtns[i]?.setSize(bw, 66);
      if (this.dgBtns[i] && this.dgBtns[i].width !== bw) {
        this.buildButtons();
        return;
      }
    }
  }

  private buildButtons() {
    const { width, height } = this.scale;
    for (const b of this.dgBtns) b.destroy(true);
    this.dgBtns = [];
    const bw = Math.min(104, Math.floor((width - 40) / 3));
    const ys = [height * 0.64, height * 0.64, height * 0.64, height * 0.84, height * 0.84];
    const xs = [width / 2 - bw - 14, width / 2, width / 2 + bw + 14, width / 2 - bw / 2 - 7, width / 2 + bw / 2 + 7];
    for (let i = 0; i < 5; i++) {
      const dg = DG_ORDER[i];
      const b = modernCardButton(this, xs[i], ys[i], bw, 66, t(DG_KEY[dg]), BTN_NEUTRAL, 24);
      b.on("pointerdown", () => this.tap(dg));
      this.dgBtns.push(b);
    }
  }

  private startRound() {
    // one word per digraph — all 5 digraphs guaranteed every round
    this.roundWords = shuffle(DG_ORDER.map((dg) => shuffle(WORDS.filter((w) => w.dg === dg))[0]));
    this.qIdx = 0;
    this.wrongs = 0;
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.showNext();
  }

  private showNext() {
    if (this.qIdx >= this.roundWords.length) {
      this.finishRound();
      return;
    }
    this.current = this.roundWords[this.qIdx];
    this.emojiText.setText(this.current.emoji);
    this.renderBlank();
    speak(`${this.current.before}${this.current.dg}${this.current.after}`, { lang: "en" });
    this.startTimer();
  }

  private renderBlank() {
    this.wordText.setText(`${this.current.before}____${this.current.after}`);
  }

  private word(): string {
    return `${this.current.before}${this.current.dg}${this.current.after}`;
  }

  private drawTimer(frac: number) {
    const { width, height } = this.scale;
    const bw = Math.min(300, width - 60);
    const x = width / 2 - bw / 2;
    const y = height * 0.46;
    const g = this.barG;
    g.clear();
    g.fillStyle(0xffffff, 0.3);
    g.fillRoundedRect(x, y, bw, 10, 5);
    const f = this.fillG;
    f.clear();
    const w = Math.max(0, bw * frac);
    if (w > 0) {
      f.fillStyle(frac > 0.3 ? 0x4ade80 : 0xffd166, 1);
      f.fillRoundedRect(x, y, w, 10, 5);
    }
  }

  private startTimer() {
    const dur = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    if (this.timerTween) this.timerTween.stop();
    this.drawTimer(1);
    const bar = { frac: 1 };
    this.timerTween = this.tweens.add({
      targets: bar,
      frac: 0,
      duration: dur,
      ease: "Linear",
      onUpdate: () => this.drawTimer(bar.frac),
      onComplete: () => {
        if (!this.locked) {
          this.locked = true;
          this.wrongs++;
          bad();
          speak(t("dgSlow"), { lang: getAppLang() === "bn" ? "bn" : "en" });
          this.floatMsg(t("dgSlow"), 0xf87171);
          this.time.delayedCall(900, () => {
            this.qIdx++;
            this.showNext();
          });
        }
      },
    });
  }

  private tap(dg: Digraph) {
    if (this.locked) return;
    if (dg === this.current.dg) {
      this.locked = true;
      if (this.timerTween) this.timerTween.stop();
      this.drawTimer(0);
      pop();
      win();
      this.wordText.setText(this.word());
      this.floatMsg(t("dgGreat"), 0x4ade80);
      speak(this.word(), { lang: "en" });
      this.starBurst();
      this.time.delayedCall(850, () => {
        this.qIdx++;
        this.showNext();
      });
    } else {
      this.wrongs++;
      bad();
      const btn = this.dgBtns[DG_ORDER.indexOf(dg)];
      this.tweens.add({ targets: btn, x: btn.x - 8, duration: 60, yoyo: true, repeat: 2 });
    }
  }

  private starBurst() {
    const { width, height } = this.scale;
    for (let i = 0; i < 5; i++) {
      const s = this.add
        .text(width / 2, height * 0.33, i % 2 === 0 ? "✨" : "⭐", txt(22, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(40);
      this.tweens.add({
        targets: s,
        x: width / 2 + (i % 2 === 0 ? -1 : 1) * (30 + i * 16),
        y: height * 0.33 - 24 - i * 12,
        alpha: 0,
        duration: 800 + i * 50,
        ease: "Sine.easeOut",
        onComplete: () => s.destroy(),
      });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(t("dgDone"), 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongs === 0, ms, this.levelIndex + 1);
    this.time.delayedCall(1500, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.52, text, txt(24, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? "#ffd166" : color === 0x4ade80 ? "#4ade80" : "#f87171")
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 22, alpha: 0, duration: 1300, onComplete: () => m.destroy() });
  }
}
