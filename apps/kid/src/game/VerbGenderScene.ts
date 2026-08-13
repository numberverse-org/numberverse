import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, type RoundMeterApi } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-verbgender")?.difficultyLevels ?? [4, 4, 6, 6, 8, 8];
const ROUNDS_TO_FINISH = 3;

interface Slot {
  id: number;
  emoji: string; // picture context — character + action
}

/** 12 sentence slots: a pictured subject (male/female) + a verb blank. */
const SLOTS: Slot[] = [
  { id: 1, emoji: "👦⚽" },
  { id: 2, emoji: "👧💃" },
  { id: 3, emoji: "👨📚" },
  { id: 4, emoji: "👩🎤" },
  { id: 5, emoji: "👑🚶" },
  { id: 6, emoji: "👸🚶" },
  { id: 7, emoji: "👨🌾🌾" },
  { id: 8, emoji: "👩🍳🍲" },
  { id: 9, emoji: "🧑⚕️🩺" },
  { id: 10, emoji: "👩⚕️💊" },
  { id: 11, emoji: "👴🪑" },
  { id: 12, emoji: "👵🍚" },
];

/** Static i18n keys so the audit scanner sees every literal (vgSub1..12, vgVb1..12). */
const SUB_KEYS = ["vgSub1", "vgSub2", "vgSub3", "vgSub4", "vgSub5", "vgSub6", "vgSub7", "vgSub8", "vgSub9", "vgSub10", "vgSub11", "vgSub12"];
const VB_KEYS = ["vgVb1", "vgVb2", "vgVb3", "vgVb4", "vgVb5", "vgVb6", "vgVb7", "vgVb8", "vgVb9", "vgVb10", "vgVb11", "vgVb12"];

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Verb match (#218). A band-3 grammar game choosing the verb form that agrees
 * with a pictured subject (ছেলেটি/মেয়েটি, রাজা/রানী, ডাক্তার/নার্স…). The
 * subject + a blank ("ছেলেটি ___") sits under an emoji picture; three verb
 * buttons follow — one correct form, two wrong person/honorific forms. Soft
 * feedback only. Shuffle-bag over all 12 slots guarantees full coverage.
 */
export class VerbGenderScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private bag: number[] = [];
  private bagPos = 0;
  private roundIds: number[] = [];
  private qIdx = 0;
  private current!: Slot;
  private options: number[] = [];
  private wrongs = 0;
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private emojiText!: Phaser.GameObjects.Text;
  private sentenceText!: Phaser.GameObjects.Text;
  private optionBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("VerbGender");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleVerbGender"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, t("vgPick"), txt(28, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.emojiText = this.add.text(0, 0, "", txt(54, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.sentenceText = this.add
      .text(0, 0, "", txt(30, "#ffffff", { bold: true, outline: true, wrap: 330 }))
      .setOrigin(0.5);
    this.buildOptions();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 34);
    this.roundText.setPosition(width / 2, 68);
    this.meter.setPosition(width / 2, 92);
    this.promptText.setPosition(width / 2, height * 0.2);
    this.promptText.setWordWrapWidth(Math.max(220, width - 50));
    this.emojiText.setPosition(width / 2, height * 0.29);
    this.sentenceText.setPosition(width / 2, height * 0.39);
    this.sentenceText.setWordWrapWidth(Math.max(220, width - 50));
    for (const b of this.optionBtns) {
      if (b.width !== Math.min(320, width - 40)) {
        this.buildOptions();
        return;
      }
    }
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.54, height * 0.71, height * 0.88];
    for (let i = 0; i < 3; i++) this.optionBtns[i]?.setPosition(width / 2, ys[i]);
  }

  private buildOptions() {
    const { width, height } = this.scale;
    for (const b of this.optionBtns) b.destroy(true);
    this.optionBtns = [];
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.54, height * 0.71, height * 0.88];
    for (let i = 0; i < 3; i++) {
      const b = modernCardButton(this, width / 2, ys[i], bw, 64, "", BTN_NEUTRAL, 20, bw - 20);
      b.on("pointerdown", () => this.tap(i));
      this.optionBtns.push(b);
    }
  }

  private startRound() {
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    // Round-level dedupe (bag refills mid-round at boundaries).
    this.roundIds = [];
    const used = new Set<number>();
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
    if (this.bagPos >= this.bag.length) {
      const last = this.bag.length ? this.bag[this.bag.length - 1] : -1;
      this.bag = shuffle(SLOTS.map((s) => s.id));
      if (last !== -1 && this.bag[0] === last) this.bag.push(this.bag.shift() as number);
      this.bagPos = 0;
    }
    return this.bag[this.bagPos++];
  }

  private showNext() {
    if (this.qIdx >= this.roundIds.length) {
      this.finishRound();
      return;
    }
    this.current = SLOTS[this.roundIds[this.qIdx] - 1];
    const distractors = shuffle(SLOTS.filter((s) => s.id !== this.current.id).map((s) => s.id)).slice(0, 2);
    this.options = shuffle([this.current.id, ...distractors]);
    this.emojiText.setText(this.current.emoji);
    this.sentenceText.setText(`${t(SUB_KEYS[this.current.id - 1])} ______`);
    for (let i = 0; i < 3; i++) {
      const api = this.optionBtns[i].getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
      api?.setLabel(t(VB_KEYS[this.options[i] - 1]));
    }
    speak(t(SUB_KEYS[this.current.id - 1]), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private tap(i: number) {
    if (this.locked) return;
    const picked = this.options[i];
    if (picked === this.current.id) {
      this.locked = true;
      pop();
      win();
      const sub = t(SUB_KEYS[picked - 1]);
      const verb = t(VB_KEYS[picked - 1]);
      this.floatMsg(`${t("vgGreat")} ${sub} ${verb}`, 0x4ade80);
      speak(`${sub} ${verb}`, { lang: getAppLang() === "bn" ? "bn" : "en" });
      (this.optionBtns[i].getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
      this.time.delayedCall(900, () => {
        this.qIdx++;
        this.showNext();
      });
    } else {
      this.wrongs++;
      bad();
      speak(t("vgGentle"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.floatMsg(t("vgGentle"), 0xf87171);
      this.tweens.add({ targets: this.optionBtns[i], x: this.optionBtns[i].x - 8, duration: 60, yoyo: true, repeat: 2 });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(t("vgDone"), 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongs === 0, ms, this.levelIndex + 1);
    this.time.delayedCall(1700, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.46, text, txt(24, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? "#ffd166" : color === 0x4ade80 ? "#4ade80" : "#f87171")
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 22, alpha: 0, duration: 1300, onComplete: () => m.destroy() });
  }
}
