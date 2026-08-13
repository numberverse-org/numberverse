import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, type RoundMeterApi } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-idioms")?.difficultyLevels ?? [4, 4, 6, 6, 8, 8];
const ROUNDS_TO_FINISH = 3;

interface Idiom {
  id: number;
  phrase: string; // Bangla idiom text — always Bangla script (the vocabulary taught)
  emoji: string;
}

/** 12 simple Bangla idioms (বাগধারা) — kid-friendly, with emoji picture hints. */
const IDIOMS: Idiom[] = [
  { id: 1, phrase: "তালগাছে কুমড়ো", emoji: "🌴🎃" },
  { id: 2, phrase: "চোখে আঙুল দিয়ে দেখা", emoji: "👁️" },
  { id: 3, phrase: "দুধে-ভাতে থাকা", emoji: "🥛🍚" },
  { id: 4, phrase: "গায়ে ফুঁ দিয়ে বেড়ানো", emoji: "💨" },
  { id: 5, phrase: "আকাশ-পাতাল", emoji: "🌤️🌙" },
  { id: 6, phrase: "টু শব্দ নেই", emoji: "🤫" },
  { id: 7, phrase: "মাথা খাটানো", emoji: "🧠" },
  { id: 8, phrase: "কান খাড়া করা", emoji: "👂" },
  { id: 9, phrase: "হাত খালি", emoji: "🙌" },
  { id: 10, phrase: "মুখ ভার করা", emoji: "😠" },
  { id: 11, phrase: "পেটের কথা", emoji: "🤐" },
  { id: 12, phrase: "সোনায় সোহাগা", emoji: "✨" },
];

/** Static i18n keys so the audit scanner sees every literal (idM1..12, idE1..12). */
const MEAN_KEYS = ["idM1", "idM2", "idM3", "idM4", "idM5", "idM6", "idM7", "idM8", "idM9", "idM10", "idM11", "idM12"];
const EX_KEYS = ["idE1", "idE2", "idE3", "idE4", "idE5", "idE6", "idE7", "idE8", "idE9", "idE10", "idE11", "idE12"];

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Bangla idioms (#217). A band-3 vocabulary game matching simple Bangla idioms
 * to kid-friendly meanings. Each idiom shows with an emoji picture hint and is
 * spoken aloud; three meaning buttons (one correct + two others) follow, and a
 * 🔊 replay speaks a kid-friendly example sentence. Shuffle-bag guarantees all
 * 12 idioms are met. Meanings/examples are localized (EN/BN); the idiom phrase
 * stays Bangla script — that's the vocabulary being taught.
 */
export class IdiomsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private bag: number[] = [];
  private bagPos = 0;
  private roundIds: number[] = [];
  private qIdx = 0;
  private current!: Idiom;
  private options: number[] = []; // 3 meaning option ids
  private wrongs = 0;
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private cardG!: Phaser.GameObjects.Graphics;
  private emojiText!: Phaser.GameObjects.Text;
  private idiomText!: Phaser.GameObjects.Text;
  private replayBtn!: Phaser.GameObjects.Container;
  private optionBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("Idioms");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "floral");
    this.titleText = this.add
      .text(0, 0, t("titleIdiom"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, t("idMeans"), txt(28, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.cardG = this.add.graphics().setDepth(10);
    this.emojiText = this.add.text(0, 0, "", txt(44, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.idiomText = this.add
      .text(0, 0, "", txt(30, "#1d3557", { bold: true, wrap: 300 }))
      .setOrigin(0.5);
    this.replayBtn = modernCardButton(this, 0, 0, 150, 52, `🔊 ${t("idReplay")}`, BTN_NEUTRAL, 16);
    this.replayBtn.on("pointerdown", () => this.speakExample());
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
    this.promptText.setPosition(width / 2, height * 0.24);
    this.promptText.setWordWrapWidth(Math.max(220, width - 50));
    this.paintCard();
    this.replayBtn.setPosition(width / 2 + 130, height * 0.28);
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.44, height * 0.63, height * 0.82];
    for (let i = 0; i < 3; i++) {
      if (this.optionBtns[i]) {
        this.optionBtns[i].setPosition(width / 2, ys[i]);
        if (this.optionBtns[i].width !== bw) {
          this.buildOptions(); // width changed → rebuild faces at the new size
          return;
        }
      }
    }
  }

  /** Create (or recreate) the 3 meaning buttons at the current canvas width. */
  private buildOptions() {
    const { width, height } = this.scale;
    for (const b of this.optionBtns) b.destroy(true);
    this.optionBtns = [];
    const bw = Math.min(320, width - 40);
    const ys = [height * 0.44, height * 0.63, height * 0.82];
    for (let i = 0; i < 3; i++) {
      const b = modernCardButton(this, width / 2, ys[i], bw, 64, "", BTN_NEUTRAL, 20, bw - 20);
      b.on("pointerdown", () => this.tap(i));
      this.optionBtns.push(b);
    }
  }

  private paintCard() {
    const { width, height } = this.scale;
    const cw = Math.min(340, width - 60);
    const ch = 120;
    const cx = width / 2;
    const cy = height * 0.315;
    const g = this.cardG;
    g.clear();
    g.fillStyle(0xffffff, 0.96);
    g.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 18);
    g.lineStyle(3, 0x1d3557, 0.3);
    g.strokeRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 18);
    this.emojiText.setPosition(cx, cy - 30);
    this.idiomText.setPosition(cx, cy + 26);
    this.idiomText.setWordWrapWidth(cw - 30);
    this.idiomText.setFontSize(this.idiomText.text.length > 14 ? 24 : 30);
  }

  private startRound() {
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    // Round-level dedupe: the shuffle-bag refills mid-round at boundaries, so
    // a fresh bag could repeat an idiom already shown THIS round. Skip picks
    // already in the round — a full bag of 12 always has enough fresh ids.
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

  /** Shuffle-bag over all 12 idioms — every 12 picks shows all 12 exactly once. */
  private pickId(): number {
    if (this.bagPos >= this.bag.length) {
      const last = this.bag.length ? this.bag[this.bag.length - 1] : -1;
      this.bag = shuffle(IDIOMS.map((d) => d.id));
      if (last !== -1 && this.bag[0] === last) {
        this.bag.push(this.bag.shift() as number); // avoid boundary repeat
      }
      this.bagPos = 0;
    }
    return this.bag[this.bagPos++];
  }

  private showNext() {
    if (this.qIdx >= this.roundIds.length) {
      this.finishRound();
      return;
    }
    this.current = IDIOMS[this.roundIds[this.qIdx] - 1];
    const distractors = shuffle(IDIOMS.filter((d) => d.id !== this.current.id).map((d) => d.id)).slice(0, 2);
    this.options = shuffle([this.current.id, ...distractors]);
    this.emojiText.setText(this.current.emoji);
    this.idiomText.setText(this.current.phrase);
    this.paintCard();
    for (let i = 0; i < 3; i++) {
      const api = this.optionBtns[i].getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
      api?.setLabel(t(MEAN_KEYS[this.options[i] - 1]));
    }
    speak(this.current.phrase, { lang: "bn" }); // the idiom is always Bangla
  }

  private speakExample() {
    speak(t(EX_KEYS[this.current.id - 1]), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private tap(i: number) {
    if (this.locked) return;
    const picked = this.options[i];
    if (picked === this.current.id) {
      this.locked = true;
      pop();
      win();
      const word = t(MEAN_KEYS[picked - 1]);
      this.floatMsg(`${t("idGreat")} ${word}`, 0x4ade80);
      speak(word, { lang: getAppLang() === "bn" ? "bn" : "en" });
      (this.optionBtns[i].getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
      this.time.delayedCall(900, () => {
        this.qIdx++;
        this.showNext();
      });
    } else {
      this.wrongs++;
      bad();
      speak(t("idGentle"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.floatMsg(t("idGentle"), 0xf87171);
      this.tweens.add({ targets: this.optionBtns[i], x: this.optionBtns[i].x - 8, duration: 60, yoyo: true, repeat: 2 });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(t("idDone"), 0xffd166);
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
      .text(this.scale.width / 2, this.scale.height * 0.34, text, txt(24, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? "#ffd166" : color === 0x4ade80 ? "#4ade80" : "#f87171")
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 22, alpha: 0, duration: 1300, onComplete: () => m.destroy() });
  }
}
