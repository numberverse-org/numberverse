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

const LEVELS = GAMES.find((g) => g.id === "game-longvowels")?.difficultyLevels ?? [10000, 9000, 8000, 7000, 6000, 5000];
const ROUNDS_TO_FINISH = 3;

type VowelTeam = "ai" | "ay" | "ee" | "ea" | "oa" | "ow" | "ie" | "igh";

interface LvWord {
  team: VowelTeam;
  word: string;
  emoji: string;
}

const TEAMS: VowelTeam[] = ["ai", "ay", "ee", "ea", "oa", "ow", "ie", "igh"];

/** 40 kid words — 5 per long-vowel team. English phonics. */
const WORDS: LvWord[] = [
  { team: "ai", word: "rain", emoji: "🌧️" },
  { team: "ai", word: "tail", emoji: "🦎" },
  { team: "ai", word: "mail", emoji: "✉️" },
  { team: "ai", word: "train", emoji: "🚂" },
  { team: "ai", word: "snail", emoji: "🐌" },
  { team: "ay", word: "day", emoji: "☀️" },
  { team: "ay", word: "play", emoji: "🎾" },
  { team: "ay", word: "say", emoji: "🗣️" },
  { team: "ay", word: "tray", emoji: "🍽️" },
  { team: "ay", word: "stay", emoji: "🏠" },
  { team: "ee", word: "tree", emoji: "🌳" },
  { team: "ee", word: "feet", emoji: "🦶" },
  { team: "ee", word: "bee", emoji: "🐝" },
  { team: "ee", word: "see", emoji: "👀" },
  { team: "ee", word: "green", emoji: "🟢" },
  { team: "ea", word: "sea", emoji: "🌊" },
  { team: "ea", word: "tea", emoji: "🍵" },
  { team: "ea", word: "leaf", emoji: "🍃" },
  { team: "ea", word: "team", emoji: "🏅" },
  { team: "ea", word: "read", emoji: "📖" },
  { team: "oa", word: "boat", emoji: "⛵" },
  { team: "oa", word: "goat", emoji: "🐐" },
  { team: "oa", word: "coat", emoji: "🧥" },
  { team: "oa", word: "road", emoji: "🛣️" },
  { team: "oa", word: "soap", emoji: "🧼" },
  { team: "ow", word: "snow", emoji: "❄️" },
  { team: "ow", word: "crow", emoji: "🐦" },
  { team: "ow", word: "slow", emoji: "🐢" },
  { team: "ow", word: "grow", emoji: "🌱" },
  { team: "ow", word: "bow", emoji: "🎀" },
  { team: "ie", word: "pie", emoji: "🥧" },
  { team: "ie", word: "tie", emoji: "👔" },
  { team: "ie", word: "lie", emoji: "🛏️" },
  { team: "ie", word: "cried", emoji: "😭" },
  { team: "ie", word: "fried", emoji: "🍳" },
  { team: "igh", word: "night", emoji: "🌙" },
  { team: "igh", word: "light", emoji: "💡" },
  { team: "igh", word: "high", emoji: "⛰️" },
  { team: "igh", word: "right", emoji: "➡️" },
  { team: "igh", word: "fight", emoji: "🥊" },
];

/** Per-team shuffle-bags so all 5 words of every team get covered. */
function teamBag(team: VowelTeam): LvWord[] {
  return WORDS.filter((w) => w.team === team);
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Blank the vowel team out of a word for the "r__n" display. */
function blank(w: LvWord): string {
  const i = w.word.indexOf(w.team);
  return `${w.word.slice(0, i)}____${w.word.slice(i + w.team.length)}`;
}

/**
 * Vowel teams (#224). A band-2 English phonics review consolidating the
 * long-vowel teams ai/ay/ee/ea/oa/ow/ie/igh across word families. A picture +
 * a word with the team blanked ("r____n" 🌧️) is spoken aloud; the kid taps the
 * vowel team that makes the word. Every round mixes all 8 teams, and a
 * shrinking timer bar ramps the speed — a gentle "Faster!" on timeout.
 */
export class LongVowelScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private bags: Record<string, number[]> = {};
  private bagPos: Record<string, number> = {};
  private roundWords: LvWord[] = [];
  private qIdx = 0;
  private current!: LvWord;
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
  private teamBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("LongVowel");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleLv"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, t("lvPick"), txt(26, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.emojiText = this.add.text(0, 0, "", txt(58, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.wordText = this.add
      .text(0, 0, "", txt(38, "#ffffff", { bold: true, outline: true, wrap: 330 }))
      .setOrigin(0.5);
    this.barG = this.add.graphics().setDepth(20);
    this.fillG = this.add.graphics().setDepth(21);
    this.buildButtons();
    onSceneResize(this, () => this.layout());
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
    const bw = Math.min(120, Math.floor((width - 40) / 3));
    const ys = [height * 0.62, height * 0.62, height * 0.62, height * 0.82, height * 0.82];
    const xs = [width / 2 - bw - 14, width / 2, width / 2 + bw + 14, width / 2 - bw / 2 - 7, width / 2 + bw / 2 + 7];
    for (let i = 0; i < 5; i++) {
      this.teamBtns[i]?.setPosition(xs[i], ys[i]);
      this.teamBtns[i]?.setSize(bw, 66);
      if (this.teamBtns[i] && this.teamBtns[i].width !== bw) {
        this.buildButtons();
        return;
      }
    }
    // only the first 3 buttons are used this round; hide the last 2
    for (let i = 3; i < 5; i++) this.teamBtns[i]?.setVisible(false);
  }

  private buildButtons() {
    const { width, height } = this.scale;
    for (const b of this.teamBtns) b.destroy(true);
    this.teamBtns = [];
    const bw = Math.min(120, Math.floor((width - 40) / 3));
    const ys = [height * 0.62, height * 0.62, height * 0.62, height * 0.82, height * 0.82];
    const xs = [width / 2 - bw - 14, width / 2, width / 2 + bw + 14, width / 2 - bw / 2 - 7, width / 2 + bw / 2 + 7];
    for (let i = 0; i < 5; i++) {
      const b = modernCardButton(this, xs[i], ys[i], bw, 66, "", BTN_NEUTRAL, 24);
      b.on("pointerdown", () => this.tap(i));
      this.teamBtns.push(b);
    }
  }

  private startRound() {
    // one word per vowel team — all 8 teams guaranteed, mixed order
    this.roundWords = shuffle(TEAMS.map((team) => this.pickWord(team)));
    this.qIdx = 0;
    this.wrongs = 0;
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.showNext();
  }

  private pickWord(team: VowelTeam): LvWord {
    const pool = teamBag(team);
    if (!(this.bagPos[team] < (this.bags[team]?.length ?? 0))) {
      const lastIdx = this.bags[team]?.length ? this.bags[team][this.bags[team].length - 1] : -1;
      const order = shuffle(pool.map((_, i) => i));
      this.bags[team] = order;
      if (lastIdx !== -1 && order[0] === lastIdx) this.bags[team] = order.slice(1).concat(order[0]);
      this.bagPos[team] = 0;
    }
    return pool[this.bags[team][this.bagPos[team]++]];
  }

  private showNext() {
    if (this.qIdx >= this.roundWords.length) {
      this.finishRound();
      return;
    }
    this.current = this.roundWords[this.qIdx];
    const correct = this.current.team;
    const others = shuffle(TEAMS.filter((t) => t !== correct)).slice(0, 2);
    const shown = shuffle([correct, ...others]);
    this.emojiText.setText(this.current.emoji);
    this.wordText.setText(blank(this.current));
    for (let i = 0; i < 5; i++) {
      const btn = this.teamBtns[i];
      if (!btn) continue;
      const api = btn.getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
      if (i < 3) {
        btn.setVisible(true);
        btn.setData("team", shown[i]);
        api?.setLabel(shown[i]);
      } else {
        btn.setVisible(false);
      }
    }
    speak(this.current.word, { lang: "en" });
    this.startTimer();
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
          speak(t("lvSlow"), { lang: getAppLang() === "bn" ? "bn" : "en" });
          this.floatMsg(t("lvSlow"), 0xf87171);
          this.time.delayedCall(900, () => {
            this.qIdx++;
            this.showNext();
          });
        }
      },
    });
  }

  private tap(i: number) {
    if (this.locked || i >= 3) return;
    const api = this.teamBtns[i].getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
    const picked = this.teamBtns[i].getData("team") as string | undefined;
    if (!picked) return;
    if (picked === this.current.team) {
      this.locked = true;
      if (this.timerTween) this.timerTween.stop();
      this.drawTimer(0);
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.wordText.setText(this.current.word);
      this.floatMsg(t("lvGreat"), 0x4ade80);
      speak(this.current.word, { lang: "en" });
      this.starBurst();
      this.time.delayedCall(850, () => {
        this.qIdx++;
        this.showNext();
      });
    } else {
      this.wrongs++;
      bad();
      this.tweens.add({ targets: this.teamBtns[i], x: this.teamBtns[i].x - 8, duration: 60, yoyo: true, repeat: 2 });
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
    this.floatMsg(t("lvDone"), 0xffd166);
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
      .setColor(color === 0xffd166 ? NV_GOLD : color === 0x4ade80 ? NV_GREEN : NV_RED)
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 22, alpha: 0, duration: 1300, onComplete: () => m.destroy() });
  }
}
