import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, correctButton, roundMeter, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-conjunctfind")?.difficultyLevels ?? [12, 11, 10, 9, 8, 7];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-conjunctfind")?.skillId ?? "bn-conjunct-find";
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 3;
const BAR_H = 16;

interface ConjFact {
  c: string; // conjunct glyph
  w: string; // example word containing it
}
/* The most common Bangla conjuncts, each in a real kid-friendly word (#158).
 * 25 total — the 12 most common ones form the easy pool for levels 0-1. */
const ALL_CONJ: ConjFact[] = [
  { c: "ক্ষ", w: "পক্ষ" },
  { c: "ঞ্জ", w: "অঞ্জলি" },
  { c: "ঙ্ক", w: "অঙ্ক" },
  { c: "ণ্ড", w: "মণ্ডল" },
  { c: "ঙ্খ", w: "শঙ্খ" },
  { c: "ক্ত", w: "মুক্ত" },
  { c: "ষ্ট", w: "মিষ্টি" },
  { c: "ন্ত", w: "শান্ত" },
  { c: "স্প", w: "স্পষ্ট" },
  { c: "ল্ল", w: "বিল্লি" },
  { c: "ত্ত", w: "সত্তর" },
  { c: "ত্ম", w: "আত্মা" },
  { c: "প্প", w: "টিপ্পনী" },
  { c: "ম্ম", w: "সম্মান" },
  { c: "ন্ন", w: "অন্ন" },
  { c: "ড্ড", w: "হাড্ডি" },
  { c: "জ্জ", w: "উজ্জ্বল" },
  { c: "ঙ্গ", w: "সঙ্গ" },
  { c: "ঞ্চ", w: "পঞ্চ" },
  { c: "ষ্ণ", w: "তৃষ্ণা" },
  { c: "ত্থ", w: "উত্থান" },
  { c: "শ্ন", w: "প্রশ্ন" },
  { c: "ল্প", w: "গল্প" },
  { c: "র্য", w: "সূর্য" },
  { c: "ন্দ", w: "বিন্দু" },
];
const EASY_CONJ = ALL_CONJ.filter((f) => ["ক্ষ", "ঞ্জ", "ঙ্ক", "ণ্ড", "ঙ্গ", "ল্প", "ষ্ট", "ন্ত", "ক্ত", "স্প", "শ্ন", "ন্দ"].includes(f.c));

/**
 * Bangla Conjunct Speed Drill (#158).
 * Band 3 (ages 6–8, reading). A conjunct (ক্ষ) is shown big; three words
 * appear; tap the word that CONTAINS the conjunct. A timer bar counts down —
 * answer in time to grow your streak 🔥; a timeout or miss resets it gently
 * (no harsh fail). hintWrong escalates hints on repeated misses (nudge →
 * coaching → reveal). Levels speed up the timer 12s → 7s.
 */
export class ConjunctFindScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private streak = 0;
  private startedAt = 0;
  private target!: ConjFact;
  private locked = false;
  private cards: { sprite: Phaser.GameObjects.Container; c: string }[] = [];
  private timer?: Phaser.Time.TimerEvent;
  private barX = 0;
  private barY = 0;
  private barW = 0;
  private track!: Phaser.GameObjects.Graphics;
  private timerFill!: Phaser.GameObjects.Graphics;
  private targetText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("ConjunctFind");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "floral");
    this.titleText = this.add
      .text(0, 0, t("titleConjunctFind"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.streakText = this.add
      .text(0, 0, "", txt(18, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.targetText = this.add
      .text(0, 0, "", txt(84, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.track = this.add.graphics();
    this.timerFill = this.add.graphics().setDepth(3);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.streakText.setPosition(width / 2, 132);
    this.prompt.setPosition(width / 2, height * 0.16);
    this.targetText.setPosition(width / 2, height * 0.36);
    this.barX = width / 2;
    this.barY = height * 0.48;
    this.barW = Math.min(width * 0.7, 380);
    const t = this.track.clear();
    t.fillStyle(0x1d3557, 1);
    t.fillRoundedRect(this.barX - this.barW / 2, this.barY - BAR_H / 2, this.barW, BAR_H, BAR_H / 2);
    t.lineStyle(2, 0xffffff, 0.5);
    t.strokeRoundedRect(this.barX - this.barW / 2, this.barY - BAR_H / 2, this.barW, BAR_H, BAR_H / 2);
  }

  private startRound() {
    this.clearCards();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  /** Target + 2 unambiguous distractors (no word contains BOTH conjuncts). */
  private pickOptions(): { target: ConjFact; cards: ConjFact[] } {
    const pool = this.levelIndex >= 2 ? ALL_CONJ : EASY_CONJ;
    const target = pool[Phaser.Math.Between(0, pool.length - 1)];
    const others = [...pool].filter((f) => f.c !== target.c).sort(() => Math.random() - 0.5);
    const picks: ConjFact[] = [];
    for (const o of others) {
      if (picks.length >= 2) break;
      if (target.w.includes(o.c)) continue; // target word also shows this conjunct → confuse
      if (o.w.includes(target.c)) continue; // distractor word also has the target → two correct cards
      picks.push(o);
    }
    for (const o of others) {
      if (picks.length >= 2) break;
      if (!picks.includes(o)) picks.push(o);
    }
    const cards = [target, ...picks].sort(() => Math.random() - 0.5);
    return { target, cards };
  }

  private askQuestion() {
    this.clearCards();
    this.locked = false;
    const { target, cards } = this.pickOptions();
    this.target = target;
    this.prompt.set(t("conjWhich", { c: target.c }));
    speak(t("conjWhichSpeak", { c: target.c }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.targetText.setText(target.c);
    this.startTimer();
    const n = cards.length;
    const gap = this.scale.width / (n + 1);
    const cardW = Math.min(140, this.scale.width / (n + 0.6) - 12);
    const cardY = this.scale.height - 64 - SAB();
    cards.forEach((f, i) => {
      const c = modernCardButton(this, gap * (i + 1), cardY, cardW, 86, f.w, BTN_PRIMARY, 26, cardW - 8);
      c.on("pointerdown", () => this.tap(c, f.c));
      this.cards.push({ sprite: c, c: f.c });
    });
  }

  private startTimer() {
    this.stopTimer();
    const dur = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)] * 1000;
    const start = this.time.now;
    this.timer = this.time.addEvent({
      delay: 33,
      loop: true,
      callback: () => {
        const p = 1 - Math.min(1, (this.time.now - start) / dur);
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
    this.streak = 0;
    this.streakText.setText(t("conjStreak", { n: 0 }));
    this.floatMsg(t("conjTimeout"));
    this.time.delayedCall(700, () => {
      this.askQuestion();
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: string) {
    if (this.locked) return;
    if (value !== this.target.c) {
      this.streak = 0;
      this.streakText.setText(t("conjStreak", { n: 0 }));
      hintWrong(this, container, {
        hint: () => `The conjunct is in the word '${this.target.w}'!`,
        hintBn: () => `যুক্তবর্ণটি '${this.target.w}' শব্দে আছে!`,
        correct: () => this.target.c,
        options: () => this.cards.map((o) => ({ sprite: o.sprite, value: o.c })),
      });
      return;
    }
    this.locked = true;
    this.stopTimer();
    pop();
    correctButton(container);
    this.streak++;
    this.streakText.setText(t("conjStreak", { n: this.streak }));
    this.floatSmall(container.x, container.y - 52, t("conjGreat"));
    this.qInRound++;
    if (this.qInRound >= QUESTIONS_PER_ROUND) {
      this.time.delayedCall(300, () => this.finishRound());
    } else {
      this.time.delayedCall(500, () => this.askQuestion());
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("conjWoo"));
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

  private clearCards() {
    this.cards.forEach((o) => o.sprite.destroy());
    this.cards = [];
  }
}
