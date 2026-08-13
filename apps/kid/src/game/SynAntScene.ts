import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, type RoundMeterApi } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-synant")?.difficultyLevels ?? [6, 6, 8, 8, 10, 10];
const ROUNDS_TO_FINISH = 3;

type Mode = "syn" | "ant";

interface Pair {
  id: number;
  word: string;
  pair: string;
  emoji: string;
}

/** 16 synonym pairs (word → same meaning). */
const SYN: Pair[] = [
  { id: 1, word: "happy", pair: "glad", emoji: "😊" },
  { id: 2, word: "big", pair: "large", emoji: "🐘" },
  { id: 3, word: "small", pair: "tiny", emoji: "🐜" },
  { id: 4, word: "quick", pair: "fast", emoji: "🐇" },
  { id: 5, word: "sad", pair: "unhappy", emoji: "😢" },
  { id: 6, word: "begin", pair: "start", emoji: "🚀" },
  { id: 7, word: "end", pair: "finish", emoji: "🏁" },
  { id: 8, word: "pretty", pair: "beautiful", emoji: "🌸" },
  { id: 9, word: "angry", pair: "mad", emoji: "😠" },
  { id: 10, word: "clever", pair: "smart", emoji: "🦉" },
  { id: 11, word: "easy", pair: "simple", emoji: "🍰" },
  { id: 12, word: "hard", pair: "difficult", emoji: "🧗" },
  { id: 13, word: "shout", pair: "yell", emoji: "📣" },
  { id: 14, word: "laugh", pair: "giggle", emoji: "😂" },
  { id: 15, word: "look", pair: "watch", emoji: "👀" },
  { id: 16, word: "run", pair: "sprint", emoji: "🏃" },
];

/** 16 antonym pairs (word → opposite). */
const ANT: Pair[] = [
  { id: 1, word: "big", pair: "small", emoji: "🐘" },
  { id: 2, word: "hot", pair: "cold", emoji: "🔥" },
  { id: 3, word: "fast", pair: "slow", emoji: "🚀" },
  { id: 4, word: "happy", pair: "sad", emoji: "😊" },
  { id: 5, word: "up", pair: "down", emoji: "⬆️" },
  { id: 6, word: "open", pair: "close", emoji: "🚪" },
  { id: 7, word: "tall", pair: "short", emoji: "🌳" },
  { id: 8, word: "day", pair: "night", emoji: "☀️" },
  { id: 9, word: "wet", pair: "dry", emoji: "💦" },
  { id: 10, word: "full", pair: "empty", emoji: "🍽️" },
  { id: 11, word: "light", pair: "dark", emoji: "💡" },
  { id: 12, word: "new", pair: "old", emoji: "🌱" },
  { id: 13, word: "clean", pair: "dirty", emoji: "🧼" },
  { id: 14, word: "quiet", pair: "loud", emoji: "🤫" },
  { id: 15, word: "win", pair: "lose", emoji: "🏆" },
  { id: 16, word: "early", pair: "late", emoji: "⏰" },
];

/** Every answer word (for distractor options). */
const ALL_PAIRS = [...SYN.map((p) => p.pair), ...ANT.map((p) => p.pair)];

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Same or opposite? (#221). A band-3 vocabulary game matching synonyms and
 * antonyms. A target word + emoji shows with a mode pill ("Same meaning" /
 * "Opposite"); the kid taps the matching word from three options. 16 synonym +
 * 16 antonym pairs; each round mixes both modes (half/half) so kids practice
 * each. Shuffle-bags over both pair sets guarantee coverage.
 */
export class SynAntScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private synBag: number[] = [];
  private synPos = 0;
  private antBag: number[] = [];
  private antPos = 0;
  private roundTargets: { mode: Mode; target: Pair }[] = [];
  private qIdx = 0;
  private current!: { mode: Mode; target: Pair };
  private options: string[] = [];
  private wrongs = 0;
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private emojiText!: Phaser.GameObjects.Text;
  private wordText!: Phaser.GameObjects.Text;
  private optionBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("SynAnt");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleSynAnt"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.modeText = this.add
      .text(0, 0, "", txt(20, "#1d3557", { bold: true }))
      .setOrigin(0.5)
      .setPadding(14, 6);
    this.promptText = this.add
      .text(0, 0, t("saPrompt"), txt(26, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.emojiText = this.add.text(0, 0, "", txt(54, "#ffffff", { shadow: false })).setOrigin(0.5);
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
    this.modeText.setPosition(width / 2, height * 0.16);
    this.promptText.setPosition(width / 2, height * 0.22);
    this.promptText.setWordWrapWidth(Math.max(220, width - 50));
    this.emojiText.setPosition(width / 2, height * 0.3);
    this.wordText.setPosition(width / 2, height * 0.4);
    this.wordText.setWordWrapWidth(Math.max(220, width - 50));
    for (const b of this.optionBtns) {
      if (b.width !== Math.min(320, width - 40)) {
        this.buildOptions();
        return;
      }
    }
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
      const b = modernCardButton(this, width / 2, ys[i], bw, 64, "", BTN_NEUTRAL, 22, bw - 20);
      b.on("pointerdown", () => this.tap(i));
      this.optionBtns.push(b);
    }
  }

  private startRound() {
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const k = Math.ceil(n / 2);
    // half synonyms + half antonyms, both from shuffle-bags, mixed order.
    // Round-level dedupe: a bag refill mid-round must never repeat an id
    // already shown this round.
    const used = new Set<string>();
    const synTargets = Array.from({ length: k }, () => {
      const id = this.pickSyn(used);
      used.add(`syn:${id}`);
      return { mode: "syn" as Mode, target: SYN[id - 1] };
    });
    const antTargets = Array.from({ length: n - synTargets.length }, () => {
      const id = this.pickAnt(used);
      used.add(`ant:${id}`);
      return { mode: "ant" as Mode, target: ANT[id - 1] };
    });
    this.roundTargets = shuffle([...synTargets, ...antTargets]);
    this.qIdx = 0;
    this.wrongs = 0;
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.showNext();
  }

  private pickSyn(used: Set<string>): number {
    for (;;) {
      if (this.synPos >= this.synBag.length) {
        const last = this.synBag.length ? this.synBag[this.synBag.length - 1] : -1;
        this.synBag = shuffle(SYN.map((p) => p.id));
        if (last !== -1 && this.synBag[0] === last) this.synBag.push(this.synBag.shift() as number);
        this.synPos = 0;
      }
      const id = this.synBag[this.synPos++];
      if (!used.has(`syn:${id}`)) return id;
    }
  }

  private pickAnt(used: Set<string>): number {
    for (;;) {
      if (this.antPos >= this.antBag.length) {
        const last = this.antBag.length ? this.antBag[this.antBag.length - 1] : -1;
        this.antBag = shuffle(ANT.map((p) => p.id));
        if (last !== -1 && this.antBag[0] === last) this.antBag.push(this.antBag.shift() as number);
        this.antPos = 0;
      }
      const id = this.antBag[this.antPos++];
      if (!used.has(`ant:${id}`)) return id;
    }
  }

  private showNext() {
    if (this.qIdx >= this.roundTargets.length) {
      this.finishRound();
      return;
    }
    this.current = this.roundTargets[this.qIdx];
    const correct = this.current.target.pair;
    const pool = shuffle(ALL_PAIRS.filter((w) => w !== correct));
    this.options = [correct];
    for (const w of pool) {
      if (this.options.length >= 3) break;
      if (!this.options.includes(w)) this.options.push(w);
    }
    this.options = shuffle(this.options);
    this.modeText.setText(this.current.mode === "syn" ? t("saSyn") : t("saAnt"));
    this.modeText.setBackgroundColor(this.current.mode === "syn" ? "#7dd3fc" : "#fdba74");
    this.emojiText.setText(this.current.target.emoji);
    this.wordText.setText(this.current.target.word);
    for (let i = 0; i < 3; i++) {
      const api = this.optionBtns[i].getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
      api?.setLabel(this.options[i]);
    }
    speak(this.current.target.word, { lang: "en" });
  }

  private tap(i: number) {
    if (this.locked) return;
    const picked = this.options[i];
    if (picked === this.current.target.pair) {
      this.locked = true;
      pop();
      win();
      this.floatMsg(`${t("saGreat")} ${this.current.target.word} → ${picked}`, 0x4ade80);
      speak(`${this.current.target.word} — ${picked}`, { lang: "en" });
      (this.optionBtns[i].getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
      this.time.delayedCall(950, () => {
        this.qIdx++;
        this.showNext();
      });
    } else {
      this.wrongs++;
      bad();
      speak(t("saGentle"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.floatMsg(t("saGentle"), 0xf87171);
      this.tweens.add({ targets: this.optionBtns[i], x: this.optionBtns[i].x - 8, duration: 60, yoyo: true, repeat: 2 });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(t("saDone"), 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongs === 0, ms, this.levelIndex + 1);
    this.time.delayedCall(1600, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.48, text, txt(24, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? "#ffd166" : color === 0x4ade80 ? "#4ade80" : "#f87171")
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 22, alpha: 0, duration: 1300, onComplete: () => m.destroy() });
  }
}
