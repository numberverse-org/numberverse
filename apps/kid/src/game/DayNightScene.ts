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
import { txt, correctButton, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-daynight")?.difficultyLevels ?? [2, 3, 3, 4, 4, 4];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-daynight")?.skillId ?? "science-day-night";
const ROUNDS_TO_FINISH = 3;
const TWO_PI = Math.PI * 2;

interface WhyQ {
  q: string;
  correct: string;
  wrongs: string[];
}
/* Why-does-it-happen questions (#233). ONE pool — every question carries up to
 * 4 wrongs and the level picks a growing distractor count (#1060): level 1 →
 * 2 wrongs (3 options), 2-3 → 3 wrongs (4 options), 4+ → 4 wrongs (5 options).
 * In EVERY question the true answer is "the Earth spins" — that is what makes
 * day and night. The 4th wrong is a plausible-but-wrong "the Earth really does
 * move" story (orbit / spin-speed / cloud) so the top band is genuinely harder
 * to disambiguate, not just longer. */
const WHY: WhyQ[] = [
  { q: "dayNightWhy", correct: "dayNightSpin", wrongs: ["dayNightSunMove", "dayNightMoonBlock", "dayNightStill", "dayNightSpinSlow"] },
  { q: "dayNightFar", correct: "dayNightNight", wrongs: ["dayNightDay", "dayNightSunMove", "dayNightClouds", "dayNightSunBehind"] },
  { q: "dayNightNear", correct: "dayNightDay", wrongs: ["dayNightNight", "dayNightMoonBlock", "dayNightClouds", "dayNightEarthMove"] },
];

interface Opt {
  key: string;
  isCorrect: boolean;
}

/** Fisher-Yates shuffle (#1060 — ramps pick a growing subset of wrongs). */
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Day & Night — earth rotation → day/night (#233).
 * Band 2 (ages 4–6, science). The sun sits on the LEFT; the Earth spins and a
 * house rides its rim. When the house faces the sun it is DAY, when it turns
 * away it is NIGHT. Early levels freeze the spin and ask "is it day or night
 * here?"; later levels ask WHY it happens (the Earth spins around itself!).
 */
export class DayNightScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private state = 0; // 0 = day/night state round, 1 = why-does-it-happen round
  private houseDay = false; // after settle: true = house in sunshine (day)
  private theta = 0; // house angle around the earth centre (radians)
  private spin!: Phaser.Tweens.Tween;
  private earthG!: Phaser.GameObjects.Graphics;
  private house!: Phaser.GameObjects.Text;
  private sun!: Phaser.GameObjects.Arc;
  private sunRays!: Phaser.GameObjects.Graphics;
  private earthX = 0;
  private earthY = 0;
  private radius = 0;
  private options: { sprite: Phaser.GameObjects.Container; key: string; isCorrect: boolean }[] = [];
  private answerLock = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("DayNight");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "space");
    this.titleText = this.add
      .text(0, 0, t("titleDayNight"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    // the solar system — sun (left) + spinning earth + house on the rim
    this.earthG = this.add.graphics();
    this.house = this.add.text(0, 0, "🏠", txt(26, "#ffffff")).setOrigin(0.5).setDepth(5);
    this.sun = this.add.circle(0, 0, 30, 0xffd166).setDepth(4);
    this.sunRays = this.add.graphics().setDepth(3);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.24);
    this.earthX = width * 0.58;
    this.earthY = height * 0.47;
    this.radius = Math.max(44, Math.min(width, height) * 0.1);
    // sun on the left + a ring of rays
    const sx = width * 0.2, sy = height * 0.47;
    this.sun.setPosition(sx, sy);
    const g = this.sunRays.clear();
    g.lineStyle(4, 0xffd166, 0.9);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TWO_PI;
      g.lineBetween(sx + Math.cos(a) * 38, sy + Math.sin(a) * 38, sx + Math.cos(a) * 52, sy + Math.sin(a) * 52);
    }
    // earth — blue ball, green continent, white axis line, day/night terminator
    const e = this.earthG.clear();
    e.fillStyle(0x3b82f6, 1);
    e.fillCircle(this.earthX, this.earthY, this.radius);
    e.fillStyle(0x34d399, 1);
    e.fillCircle(this.earthX - this.radius * 0.25, this.earthY + this.radius * 0.15, this.radius * 0.34);
    e.lineStyle(2, 0xffffff, 0.6);
    e.strokeCircle(this.earthX, this.earthY, this.radius);
    e.lineStyle(2, 0xffffff, 0.4);
    e.lineBetween(this.earthX, this.earthY - this.radius * 1.35, this.earthX, this.earthY + this.radius * 1.35);
    this.house.setPosition(this.earthX + this.radius * Math.cos(this.theta), this.earthY + this.radius * Math.sin(this.theta));
    this.layoutOptions();
  }

  private get optY() {
    return this.scale.height * 0.78;
  }

  private startRound() {
    this.clearOptions();
    this.answerLock = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    // #1060 — continuous ramp instead of a 2-band gate: the WHY question starts
    // at level 1 (was 2) so state-rounds are just the warm-up, and askWhy() then
    // ramps the distractor count per level inside the why pool.
    this.state = this.levelIndex < 1 ? 0 : 1;
    this.stopSpin();
    this.theta = Math.random() * TWO_PI;
    // state rounds: a brisk spin so the kid can SEE the rotation before we
    // freeze it; why rounds: a slow calm spin keeps the lesson alive behind
    // the question ("the earth is ALWAYS spinning").
    this.startSpin(this.state === 0 ? 1500 : 2800);
    this.time.delayedCall(this.state === 0 ? 1000 : 400, () => this.ask());
  }

  private startSpin(ms: number) {
    this.spin = this.tweens.add({
      targets: this,
      theta: this.theta + TWO_PI,
      duration: ms,
      repeat: -1,
      onUpdate: () => {
        this.house.setPosition(this.earthX + this.radius * Math.cos(this.theta), this.earthY + this.radius * Math.sin(this.theta));
      },
    });
  }

  private stopSpin() {
    if (this.spin) {
      this.spin.stop();
      this.spin = undefined as unknown as Phaser.Tweens.Tween;
    }
  }

  private ask() {
    if (this.state === 0) this.askState();
    else this.askWhy();
  }

  /** Freeze the spin with the house on a sunny or dark side, then ask. */
  private askState() {
    this.houseDay = Math.random() < 0.5;
    this.stopSpin();
    this.tweens.add({
      targets: this,
      theta: this.houseDay ? Math.PI : 0,
      duration: 600,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        this.house.setPosition(this.earthX + this.radius * Math.cos(this.theta), this.earthY + this.radius * Math.sin(this.theta));
      },
      onComplete: () => {
        this.house.setPosition(this.earthX + this.radius * Math.cos(this.theta), this.earthY + this.radius * Math.sin(this.theta));
        this.askQuestion(t("dayNightState"), [
          { key: "dayNightDay", isCorrect: this.houseDay },
          { key: "dayNightNight", isCorrect: !this.houseDay },
        ]);
      },
    });
  }

  private askWhy() {
    // #1060 — distractor count grows with the level (1 → 2 wrongs, 2-3 → 3,
    // 4+ → 4, i.e. 3 → 5 options): a within-band granularity the old `pool =
    // lvl >= 4 ? WHY_4 : WHY_3` 2-bucket switch never had (a kid sat on 3
    // options for levels 2-3 and 4 for 4+, with nothing in between).
    const distractorCount = 2 + Math.min(2, Math.floor(this.levelIndex / 2));
    const q = WHY[Math.floor(Math.random() * WHY.length)];
    const wrongs = shuffle(q.wrongs).slice(0, distractorCount);
    const opts: Opt[] = [
      ...wrongs.map((k) => ({ key: k, isCorrect: false })),
      { key: q.correct, isCorrect: true },
    ];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    this.askQuestion(t(q.q), opts);
  }

  private askQuestion(q: string, opts: Opt[]) {
    this.prompt.set(q);
    const bn = getAppLang() === "bn";
    speak(t(this.state === 0 ? "dayNightStateSpeak" : "dayNightWhySpeak"), { lang: bn ? "bn" : "en" });
    this.spawnOptions(opts);
  }

  private spawnOptions(opts: Opt[]) {
    this.clearOptions();
    const n = opts.length;
    // #1060 — the top WHY band shows 5 options; lay that out in 2 rows so a
    // phone width never overlaps the chips (the old 1-row math assumed ≤4).
    const twoRows = n >= 5;
    const cols = twoRows ? Math.ceil(n / 2) : n;
    const w = Math.max(100, Math.min(170, Math.floor(this.scale.width / (cols + 0.8))));
    const h = 54;
    const gap = this.scale.width / (cols + 1);
    opts.forEach((o, i) => {
      const c = this.add.container(0, 0);
      const g = this.add.graphics();
      g.fillStyle(0x2f4b7c, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
      g.lineStyle(2, 0x6ee7ff, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
      c.add(g);
      const label = this.add
        .text(0, 0, t(o.key), txt(16, "#ffffff", { bold: true, align: "center", wrap: w - 20 }))
        .setOrigin(0.5);
      c.add(label);
      c.setSize(w, h);
      c.setInteractive();
      c.on("pointerdown", () => this.tap(c, o));
      this.options.push({ sprite: c, key: o.key, isCorrect: o.isCorrect });
    });
    this.layoutOptions();
  }

  /** #1060 — position the option chips (1 row for ≤4, 2 rows for 5). */
  private layoutOptions() {
    const n = this.options.length;
    if (!n) return;
    const twoRows = n >= 5;
    const cols = twoRows ? Math.ceil(n / 2) : n;
    const gap = this.scale.width / (cols + 1);
    const h = 54;
    const rowGap = 14;
    const baseY = this.optY - (twoRows ? (h + rowGap) / 2 : 0);
    this.options.forEach((o, i) => {
      const col = twoRows ? i % cols : i;
      const row = twoRows ? Math.floor(i / cols) : 0;
      o.sprite.setPosition(gap * (col + 1), baseY + row * (h + rowGap));
    });
  }

  private tap(container: Phaser.GameObjects.Container, o: Opt) {
    if (this.answerLock) return;
    if (!o.isCorrect) {
      hintWrong(this, container, {
        hint: () =>
          this.state === 0
            ? this.houseDay
              ? "The house is in the sunshine — it's DAY!"
              : "The house turned away from the sun — it's NIGHT!"
            : "The Earth spins around itself — THAT is what makes day and night!",
        hintBn: () =>
          this.state === 0
            ? this.houseDay
              ? "ঘরটি রোদে রয়েছে — এটা দিন!"
              : "ঘরটি সূর্য থেকে দূরে — এটা রাত!"
            : "পৃথিবী নিজের চারদিকে ঘোরে — এ কারণেই দিন-রাত হয়!",
        correct: () => (this.state === 0 ? (this.houseDay ? "🌞" : "🌙") : "🌍"),
        options: () => this.options.map((c) => ({ sprite: c.sprite, value: c.key })),
      });
      return;
    }
    this.answerLock = true;
    pop();
    correctButton(container);
    this.stopSpin();
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearOptions() {
    this.options.forEach((o) => o.sprite.destroy());
    this.options = [];
  }
}
