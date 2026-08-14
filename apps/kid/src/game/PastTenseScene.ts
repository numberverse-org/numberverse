import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-past")?.difficultyLevels ?? [4, 4, 6, 6, 8, 8];
const ROUNDS_TO_FINISH = 3;

/** 16 irregular verbs (present → past) with a sentence-context blank key. */
const VERBS = [
  { id: 1, base: "go", past: "went", emoji: "🚶", sentKey: "ivS1" },
  { id: 2, base: "see", past: "saw", emoji: "✨", sentKey: "ivS2" },
  { id: 3, base: "eat", past: "ate", emoji: "🍎", sentKey: "ivS3" },
  { id: 4, base: "take", past: "took", emoji: "🧒", sentKey: "ivS4" },
  { id: 5, base: "make", past: "made", emoji: "⛵", sentKey: "ivS5" },
  { id: 6, base: "come", past: "came", emoji: "🏠", sentKey: "ivS6" },
  { id: 7, base: "give", past: "gave", emoji: "🌸", sentKey: "ivS7" },
  { id: 8, base: "run", past: "ran", emoji: "🏃", sentKey: "ivS8" },
  { id: 9, base: "sing", past: "sang", emoji: "🎤", sentKey: "ivS9" },
  { id: 10, base: "swim", past: "swam", emoji: "🏊", sentKey: "ivS10" },
  { id: 11, base: "drink", past: "drank", emoji: "🥤", sentKey: "ivS11" },
  { id: 12, base: "write", past: "wrote", emoji: "✉️", sentKey: "ivS12" },
  { id: 13, base: "read", past: "read", emoji: "📖", sentKey: "ivS13" },
  { id: 14, base: "buy", past: "bought", emoji: "🍞", sentKey: "ivS14" },
  { id: 15, base: "think", past: "thought", emoji: "💭", sentKey: "ivS15" },
  { id: 16, base: "sleep", past: "slept", emoji: "😴", sentKey: "ivS16" },
];

const ALL_PAST = VERBS.map((v) => v.past);

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Past time! (#223). A band-3 grammar game matching irregular verb pairs.
 * Shows the present form ("Today I go 🚶") + a past-time sentence with a blank
 * ("Yesterday I ___ to school."); the kid taps the past tense from 3 options.
 * 16 irregular verbs; shuffle-bag + round-level dedupe; string-distinct options.
 */
export class PastTenseScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private bag: number[] = [];
  private pos = 0;
  private roundIds: number[] = [];
  private qIdx = 0;
  private current!: (typeof VERBS)[number];
  private options: string[] = [];
  private wrongs = 0;
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private emojiText!: Phaser.GameObjects.Text;
  private verbText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private sentenceText!: Phaser.GameObjects.Text;
  private optionBtns: Phaser.GameObjects.Container[] = [];
  private levels: number[] = LEVELS;

  constructor() {
    super("PastTense");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[] }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #1161 — band-6 grammar depth carries its own ladder (more verbs/round).
    this.levels = data.levels ?? LEVELS;
    gameBackground(this, "sunset");
    this.titleText = this.add
      .text(0, 0, t("titleIv"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.emojiText = this.add.text(0, 0, "", txt(54, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.verbText = this.add
      .text(0, 0, "", txt(34, "#a7f3d0", { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5);
    this.promptText = this.add
      .text(0, 0, t("ivPrompt"), txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.sentenceText = this.add
      .text(0, 0, "", txt(24, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.buildOptions();
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 32);
    this.roundText.setPosition(width / 2, 64);
    this.meter.setPosition(width / 2, 88);
    this.emojiText.setPosition(width / 2, height * 0.24);
    this.verbText.setPosition(width / 2, height * 0.33);
    this.verbText.setWordWrapWidth(Math.max(220, width - 50));
    this.promptText.setPosition(width / 2, height * 0.4);
    this.sentenceText.setPosition(width / 2, height * 0.46);
    this.sentenceText.setWordWrapWidth(Math.max(220, width - 50));
    for (const b of this.optionBtns) {
      if (b.width !== Math.min(320, width - 40)) {
        this.buildOptions();
        return;
      }
    }
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.62, height * 0.77, height * 0.92];
    for (let i = 0; i < 3; i++) this.optionBtns[i]?.setPosition(width / 2, ys[i]);
  }

  private buildOptions() {
    const { width, height } = this.scale;
    for (const b of this.optionBtns) b.destroy(true);
    this.optionBtns = [];
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.62, height * 0.77, height * 0.92];
    for (let i = 0; i < 3; i++) {
      const b = modernCardButton(this, width / 2, ys[i], bw, 56, "", BTN_NEUTRAL, 22, bw - 20);
      b.on("pointerdown", () => this.tap(i));
      this.optionBtns.push(b);
    }
  }

  private startRound() {
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const used = new Set<number>();
    this.roundIds = [];
    while (this.roundIds.length < n) {
      const id = this.pickId();
      if (!used.has(id)) {
        used.add(id);
        this.roundIds.push(id);
      }
    }
    this.qIdx = 0;
    this.wrongs = 0;
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.showNext();
  }

  private pickId(): number {
    if (this.pos >= this.bag.length) {
      const last = this.bag.length ? this.bag[this.bag.length - 1] : -1;
      this.bag = shuffle(VERBS.map((v) => v.id));
      if (last !== -1 && this.bag[0] === last) this.bag.push(this.bag.shift() as number);
      this.pos = 0;
    }
    return this.bag[this.pos++];
  }

  private showNext() {
    if (this.qIdx >= this.roundIds.length) {
      this.finishRound();
      return;
    }
    this.current = VERBS[this.roundIds[this.qIdx] - 1];
    const correct = this.current.past;
    const pool = shuffle(ALL_PAST.filter((w) => w !== correct));
    this.options = [correct];
    for (const w of pool) {
      if (this.options.length >= 3) break;
      if (!this.options.includes(w)) this.options.push(w);
    }
    this.options = shuffle(this.options);
    this.emojiText.setText(this.current.emoji);
    this.verbText.setText(`${t("ivVerb")} ${this.current.base}`);
    this.sentenceText.setText(t(this.current.sentKey).replace("{b}", "___"));
    for (let i = 0; i < 3; i++) {
      const api = this.optionBtns[i].getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
      api?.setLabel(this.options[i]);
    }
    speak(this.current.base, { lang: "en" });
  }

  private tap(i: number) {
    if (this.locked) return;
    const picked = this.options[i];
    if (picked === this.current.past) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.floatMsg(`${t("ivGreat")} ${this.current.base} → ${picked}`, 0x4ade80);
      const full = t(this.current.sentKey).replace("{b}", picked);
      this.sentenceText.setText(full);
      speak(full, { lang: getAppLang() === "bn" ? "bn" : "en" });
      (this.optionBtns[i].getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
      this.time.delayedCall(1500, () => {
        this.qIdx++;
        this.showNext();
      });
    } else {
      this.wrongs++;
      bad();
      speak(t("ivGentle"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.floatMsg(t("ivGentle"), 0xf87171);
      this.tweens.add({ targets: this.optionBtns[i], x: this.optionBtns[i].x - 8, duration: 60, yoyo: true, repeat: 2 });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(t("ivDone"), 0xffd166);
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
      .text(this.scale.width / 2, this.scale.height * 0.5, text, txt(24, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? NV_GOLD : color === 0x4ade80 ? NV_GREEN : NV_RED)
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 22, alpha: 0, duration: 1300, onComplete: () => m.destroy() });
  }
}
