import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-irregulars")?.difficultyLevels ?? [4, 4, 6, 6, 8, 8];
const ROUNDS_TO_FINISH = 3;

interface Pair {
  id: number;
  one: string;
  many: string;
  emoji: string;
}

/** 14 irregular plurals: internal vowel change, -en, and no-change (sheep/fish/deer). */
const PAIRS: Pair[] = [
  { id: 1, one: "foot", many: "feet", emoji: "🦶" },
  { id: 2, one: "tooth", many: "teeth", emoji: "🦷" },
  { id: 3, one: "mouse", many: "mice", emoji: "🐭" },
  { id: 4, one: "child", many: "children", emoji: "👶" },
  { id: 5, one: "man", many: "men", emoji: "👨" },
  { id: 6, one: "woman", many: "women", emoji: "👩" },
  { id: 7, one: "person", many: "people", emoji: "🧑‍🤝‍🧑" },
  { id: 8, one: "goose", many: "geese", emoji: "🪿" },
  { id: 9, one: "sheep", many: "sheep", emoji: "🐑" },
  { id: 10, one: "fish", many: "fish", emoji: "🐟" },
  { id: 11, one: "ox", many: "oxen", emoji: "🐂" },
  { id: 12, one: "deer", many: "deer", emoji: "🦌" },
  { id: 13, one: "leaf", many: "leaves", emoji: "🍂" },
  { id: 14, one: "knife", many: "knives", emoji: "🔪" },
];

/** Every plural word (for distractor options). */
const ALL_PLURALS = PAIRS.map((p) => p.many);

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Make it plural! (#222). A band-3 grammar game practicing irregular plurals.
 * Shows one noun + emoji ("one foot 🦶") and asks for the plural ("two ___?").
 * 14 pairs cover internal-change (foot→feet), -en (ox→oxen) and no-change
 * (sheep→sheep). Shuffle-bag + round-level dedupe; 3 string-distinct options.
 */
export class IrregularPluralsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private bag: number[] = [];
  private pos = 0;
  private roundIds: number[] = [];
  private qIdx = 0;
  private current!: Pair;
  private options: string[] = [];
  private wrongs = 0;
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private promptText!: Phaser.GameObjects.Text;
  private emojiText!: Phaser.GameObjects.Text;
  private wordText!: Phaser.GameObjects.Text;
  private optionBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("IrregularPlurals");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleIp"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, t("ipPrompt"), txt(26, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
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
    this.promptText.setPosition(width / 2, height * 0.2);
    this.promptText.setWordWrapWidth(Math.max(220, width - 50));
    this.emojiText.setPosition(width / 2, height * 0.28);
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
      this.bag = shuffle(PAIRS.map((p) => p.id));
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
    this.current = PAIRS[this.roundIds[this.qIdx] - 1];
    const correct = this.current.many;
    const pool = shuffle(ALL_PLURALS.filter((w) => w !== correct));
    this.options = [correct];
    for (const w of pool) {
      if (this.options.length >= 3) break;
      if (!this.options.includes(w)) this.options.push(w);
    }
    this.options = shuffle(this.options);
    this.emojiText.setText(this.current.emoji);
    this.wordText.setText(this.current.one);
    for (let i = 0; i < 3; i++) {
      const api = this.optionBtns[i].getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
      api?.setLabel(this.options[i]);
    }
    speak(`${this.current.one}`, { lang: "en" });
  }

  private tap(i: number) {
    if (this.locked) return;
    const picked = this.options[i];
    if (picked === this.current.many) {
      this.locked = true;
      pop();
      win();
      this.floatMsg(`${t("ipGreat")} ${this.current.one} → ${picked}`, 0x4ade80);
      speak(`one ${this.current.one}, two ${picked}`, { lang: "en" });
      (this.optionBtns[i].getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
      this.time.delayedCall(950, () => {
        this.qIdx++;
        this.showNext();
      });
    } else {
      this.wrongs++;
      bad();
      speak(t("ipGentle"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.floatMsg(t("ipGentle"), 0xf87171);
      this.tweens.add({ targets: this.optionBtns[i], x: this.optionBtns[i].x - 8, duration: 60, yoyo: true, repeat: 2 });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(t("ipDone"), 0xffd166);
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
      .setColor(color === 0xffd166 ? NV_GOLD : color === 0x4ade80 ? NV_GREEN : NV_RED)
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 22, alpha: 0, duration: 1300, onComplete: () => m.destroy() });
  }
}
