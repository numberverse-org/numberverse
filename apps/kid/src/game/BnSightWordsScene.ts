import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, correctButton, roundMeter, gridLayout, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-bnsightwords")?.difficultyLevels ?? [6, 6, 8, 8, 9, 9];
/** Per-word countdown ms. 0 = no timer (levels 0-1 stay gentle). */
const TIMER_MS = [0, 0, 7000, 7000, 5500, 5500];
/** How long the highlight ring stays on the popped word (0 = until tapped). */
const RING_MS = [0, 0, 1200, 1200, 650, 650];
const ROUNDS_TO_FINISH = 3;
const CARD_W = 120;
const CARD_H = 78;
const BAR_H = 14;

interface WallItem {
  sprite: Phaser.GameObjects.Container;
  word: string;
  done: boolean;
}

/* The 48 most common short Bangla sight words (দেখে বলো — whole-word recall).
 * The first 26 are the everyday "must-know" set used for the easy levels;
 * levels 2+ draw from the full wall. All are 1–2 syllable high-frequency words
 * kids meet in books and conversation (আমি, তুমি, সে, না…). */
const EASY_WORDS = [
  "আমি", "তুমি", "সে", "আমরা", "তারা", "মা", "বাবা", "ভাই", "বোন", "দাদা",
  "নানি", "যাও", "এসো", "খাও", "দাও", "দেখো", "শোনো", "বলো", "চলো", "না",
  "হ্যাঁ", "এক", "দুই", "তিন", "চার", "পাঁচ",
];
const ALL_WORDS = [
  ...EASY_WORDS,
  "আছে", "নেই", "এবং", "কিন্তু", "যদি", "তাই", "খুব", "সব", "কে", "কী",
  "কেন", "কোথায়", "কখন", "পড়ো", "লিখো", "করো", "নাও", "বই", "পানি", "ভাত",
  "ফুল", "গাছ",
];

/**
 * Bangla Sight Word Wall — দেখে বলো (#159).
 * Band 1–2 speed-reading: a wall of short high-frequency Bangla words. One word
 * POPS (ring + bounce + warm spoken Bangla); the kid taps it to hear it read
 * aloud — whole-word recall, not letter-by-letter. Levels grow the wall (6 → 9
 * words), shrink the pop-highlight before it fades, and add a soft countdown
 * (7s → 5.5s) that gently skips a word on timeout — never a harsh fail.
 */
export class BnSightWordsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private streak = 0;
  private startedAt = 0;
  private locked = false;
  private wall: WallItem[] = [];
  private queue: number[] = [];
  private targetIdx = -1;
  private target = "";
  private timer?: Phaser.Time.TimerEvent;
  private barX = 0;
  private barY = 0;
  private barW = 0;
  private gridTop = 0;
  private gridBottom = 0;
  private track!: Phaser.GameObjects.Graphics;
  private timerFill!: Phaser.GameObjects.Graphics;
  private ring!: Phaser.GameObjects.Graphics;
  private streakText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BnSightWords");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleSightWall"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.streakText = this.add
      .text(0, 0, "", txt(18, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("sightWallPrompt"));
    this.meter = roundMeter(this);
    this.track = this.add.graphics();
    this.timerFill = this.add.graphics().setDepth(3);
    this.ring = this.add.graphics().setDepth(6);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.streakText.setPosition(width / 2, 128);
    this.prompt.setPosition(width / 2, Math.max(168, height * 0.15));
    this.barX = width / 2;
    this.barY = Math.max(Math.max(168, height * 0.15) + 44, height * 0.24);
    this.barW = Math.min(width * 0.7, 380);
    this.gridTop = Math.max(this.barY + 50, height * 0.3);
    this.gridBottom = height - 168 - SAB();
    const tm = TIMER_MS[Math.min(this.levelIndex, TIMER_MS.length - 1)];
    this.track.setAlpha(tm > 0 ? 1 : 0);
    this.timerFill.clear();
    const t = this.track.clear();
    t.fillStyle(0x1d3557, 1);
    t.fillRoundedRect(this.barX - this.barW / 2, this.barY - BAR_H / 2, this.barW, BAR_H, BAR_H / 2);
    t.lineStyle(2, 0xffffff, 0.5);
    t.strokeRoundedRect(this.barX - this.barW / 2, this.barY - BAR_H / 2, this.barW, BAR_H, BAR_H / 2);
  }

  private startRound() {
    this.clearWall();
    this.startedAt = this.time.now;
    this.streak = 0;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.streakText.setText(t("sightWallStreak", { n: 0 }));
    this.spawnWall();
    this.queue = this.wall.map((_, i) => i).sort(() => Math.random() - 0.5);
    this.locked = false;
    this.askQuestion();
  }

  private spawnWall() {
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const pool = this.levelIndex < 2 ? EASY_WORDS : ALL_WORDS;
    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, n);
    const grid = n <= 6 ? { cols: 3, rows: 2 } : n <= 8 ? { cols: 4, rows: 2 } : { cols: 3, rows: 3 };
    const gl = gridLayout(this, {
      cols: grid.cols,
      rows: grid.rows,
      preferredW: CARD_W,
      minW: 64,
      widthPad: 40,
      topPad: this.gridTop,
      bottomY: this.gridBottom,
      cardH: CARD_H,
    });
    picked.forEach((w, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (grid.rows - 1) / 2) * gl.spacingY;
      const c = modernCardButton(this, x, y, gl.cardW, CARD_H, w, BTN_PRIMARY, 30, gl.cardW - 6);
      c.on("pointerdown", () => this.tap(c, w));
      this.wall.push({ sprite: c, word: w, done: false });
    });
  }

  private askQuestion() {
    if (this.locked) return;
    const idx = this.queue.shift();
    if (idx === undefined) {
      this.finishRound();
      return;
    }
    this.targetIdx = idx;
    const item = this.wall[idx];
    this.target = item.word;
    const card = item.sprite;
    this.showRing(card);
    this.tweens.add({ targets: card, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
    speak(this.target, { lang: "bn" });
    const ringMs = RING_MS[Math.min(this.levelIndex, RING_MS.length - 1)];
    if (ringMs > 0) {
      this.time.delayedCall(ringMs, () => {
        if (this.targetIdx === idx && !item.done) this.ring.clear();
      });
    }
    this.startTimer();
  }

  private showRing(card: Phaser.GameObjects.Container) {
    const w = card.width;
    const h = card.height;
    this.ring.clear();
    this.ring.lineStyle(6, 0xffd166, 1);
    this.ring.strokeRoundedRect(card.x - w / 2, card.y - h / 2, w, h, 18);
    this.ring.lineStyle(2, 0xffffff, 0.9);
    this.ring.strokeRoundedRect(card.x - w / 2 - 5, card.y - h / 2 - 5, w + 10, h + 10, 24);
  }

  private startTimer() {
    this.stopTimer();
    const ms = TIMER_MS[Math.min(this.levelIndex, TIMER_MS.length - 1)];
    this.timerFill.clear();
    if (ms <= 0) return;
    const start = this.time.now;
    this.timer = this.time.addEvent({
      delay: 33,
      loop: true,
      callback: () => {
        const p = 1 - Math.min(1, (this.time.now - start) / ms);
        this.timerFill.clear();
        this.timerFill.fillStyle(0x6ee7ff, 1);
        this.timerFill.fillRoundedRect(this.barX - this.barW / 2, this.barY - BAR_H / 2, Math.max(2, this.barW * p), BAR_H, BAR_H / 2);
        if (p <= 0) {
          this.timer?.remove();
          this.timer = undefined;
          this.onTimeout();
        }
      },
    });
  }

  private stopTimer() {
    if (this.timer) {
      this.timer.remove();
      this.timer = undefined;
    }
  }

  private onTimeout() {
    if (this.locked) return;
    this.locked = true;
    this.stopTimer();
    this.ring.clear();
    this.streak = 0;
    this.streakText.setText(t("sightWallStreak", { n: 0 }));
    this.floatMsg(t("sightWallTimeout"));
    this.time.delayedCall(700, () => this.askQuestion());
  }

  private tap(container: Phaser.GameObjects.Container, word: string) {
    if (this.locked) return;
    if (word !== this.target) {
      this.streak = 0;
      this.streakText.setText(t("sightWallStreak", { n: 0 }));
      hintWrong(this, container, {
        hint: () => `The popped word is "${this.target}" — tap it!`,
        hintBn: () => `ওঠা শব্দটি "${this.target}" — সেটা টিপো!`,
        correct: () => this.target,
        options: () => this.wall.filter((o) => !o.done).map((o) => ({ sprite: o.sprite, value: o.word })),
      });
      return;
    }
    this.locked = true;
    this.stopTimer();
    this.ring.clear();
    pop();
    correctButton(container);
    speak(this.target, { lang: "bn" });
    this.streak++;
    this.streakText.setText(t("sightWallStreak", { n: this.streak }));
    this.floatSmall(container.x, container.y - 52, t("sightWallGreat"));
    this.wall[this.targetIdx].done = true;
    this.time.delayedCall(480, () => this.askQuestion());
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("sightWallDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.55, text, txt(26, NV_GOLD, { bold: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 900, onComplete: () => m.destroy() });
  }

  private floatSmall(x: number, y: number, text: string) {
    const m = this.add.text(x, y, text, txt(18, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: m, y: y - 24, alpha: 0, duration: 800, onComplete: () => m.destroy() });
  }

  private clearWall() {
    this.wall.forEach((o) => o.sprite.destroy());
    this.wall = [];
    this.queue = [];
    this.ring.clear();
  }
}
