import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-ordinals")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
const ROUNDS_TO_FINISH = 3;
const ANIMALS = ["🐰", "🐢", "🐹", "🐸", "🦊", "🐻", "🐼", "🦄", "🐶", "🐱"];
const CARD_W = 62;
const CARD_H = 58;

/** Localized ordinal word for a finish position. Static t() literals so the
 *  audit scanner sees every ord1..ord10 key as used. */
function ordWord(pos: number): string {
  switch (pos) {
    case 1: return t("ord1");
    case 2: return t("ord2");
    case 3: return t("ord3");
    case 4: return t("ord4");
    case 5: return t("ord5");
    case 6: return t("ord6");
    case 7: return t("ord7");
    case 8: return t("ord8");
    case 9: return t("ord9");
    default: return t("ord10");
  }
}

interface Runner {
  pos: number; // finish position (1 = winner)
  c: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Graphics;
  bob?: Phaser.Tweens.Tween;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ordinal race (#216). A band-2 Bangla game ordering runners with ordinal
 * words. A finish-line row of N runners stands in their finishing order (the
 * winner touching the checkered flag). A spoken + written ordinal word
 * ("দ্বিতীয়" / "second") asks "Who is …?" and the kid taps the runner in that
 * position — counting from the finish. Each round asks EVERY position in the
 * race exactly once, so ordinals 1..N are all covered (all 10 at lvl 6).
 */
export class OrdinalsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private questions: number[] = [];
  private qIdx = 0;
  private targetPos = 0;
  private runners: Runner[] = [];
  private wrongs = 0;
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private tapText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private flagG!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Ordinals");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sunset");
    this.titleText = this.add
      .text(0, 0, t("titleOrd"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, "", txt(40, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tapText = this.add
      .text(0, 0, t("ordTap"), txt(18, "#ffe8a3", { bold: true }))
      .setOrigin(0.5);
    this.flagG = this.add.graphics().setDepth(20);

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 36);
    this.roundText.setPosition(width / 2, 70);
    this.meter.setPosition(width / 2, 94);
    this.promptText.setPosition(width / 2, height * 0.26);
    this.promptText.setWordWrapWidth(Math.max(220, width - 50));
    this.tapText.setPosition(width / 2, height * 0.34);
    this.placeRunners();
  }

  private startRound() {
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.questions = shuffle(Array.from({ length: n }, (_, i) => i + 1));
    this.qIdx = 0;
    this.wrongs = 0;
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.buildRunners(n);
    this.askNext();
  }

  private buildRunners(n: number) {
    // kill the previous race
    for (const r of this.runners) {
      if (r.bob) r.bob.stop();
      r.c.destroy(true);
    }
    this.runners = [];
    const animals = shuffle([...ANIMALS]).slice(0, n);
    // position p (winner = 1) sits closest to the finish flag on the right
    const lanes = Array.from({ length: n }, (_, i) => i); // left→right
    for (const lane of lanes) {
      const pos = n - lane; // rightmost lane = position 1
      const face = this.add.graphics().setDepth(12);
      const emoji = this.add
        .text(0, -4, animals[lane], txt(30, "#ffffff", { shadow: false }))
        .setOrigin(0.5);
      const c = this.add.container(0, 0, [face, emoji]);
      c.setSize(CARD_W, CARD_H);
      c.setInteractive({ useHandCursor: true });
      const bob = this.tweens.add({
        targets: c,
        y: "+=4",
        duration: 700 + lane * 90,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      c.on("pointerdown", () => this.tap(pos));
      this.paintRunner(face, 0xffffff);
      const runner: Runner = { pos, c, face, bob };
      this.runners.push(runner);
    }
    this.placeRunners();
  }

  /** Put the runners in a row (position 1 = rightmost, by the finish flag). */
  private placeRunners() {
    const { width, height } = this.scale;
    const n = Math.max(1, this.runners.length);
    const laneW = Math.min(CARD_W, (width - 110) / n);
    const startX = (width - n * laneW) / 2;
    const rowY = height * 0.58;
    for (const r of this.runners) {
      const lane = n - r.pos; // left→right lane for this position
      r.c.setPosition(startX + lane * laneW + laneW / 2, rowY);
      r.face.setScale(laneW / CARD_W, 1);
    }
    this.drawFinishFlag(startX + n * laneW + 14, rowY);
  }

  private drawFinishFlag(x: number, rowY: number) {
    const g = this.flagG;
    g.clear();
    const poleH = CARD_H + 22;
    g.fillStyle(0x0b2545, 1);
    g.fillRoundedRect(x - 3, rowY - poleH, 6, poleH, 3);
    // checkered flag
    g.fillStyle(0xffffff, 1);
    g.fillRect(x + 3, rowY - poleH, 34, 22);
    g.fillStyle(0x0b2545, 1);
    const s = 11;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2 === 0) g.fillRect(x + 3 + j * s, rowY - poleH + i * s, s, s);
      }
    }
  }

  private paintRunner(g: Phaser.GameObjects.Graphics, color: number) {
    g.clear();
    g.fillStyle(color, 0.95);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14);
    g.lineStyle(2, 0x1d3557, 0.35);
    g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14);
  }

  private askNext() {
    if (this.qIdx >= this.questions.length) {
      this.finishRound();
      return;
    }
    this.targetPos = this.questions[this.qIdx];
    const word = ordWord(this.targetPos);
    this.promptText.setText(t("ordFind", { ord: word }));
    speak(t("ordFind", { ord: word }), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private tap(pos: number) {
    if (this.locked) return;
    if (pos === this.targetPos) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      const runner = this.runners.find((r) => r.pos === pos)!;
      this.paintRunner(runner.face, 0x4ade80);
      this.tweens.add({ targets: runner.c, scale: 1.22, duration: 150, yoyo: true, ease: "Back.easeOut" });
      this.floatMsg(t("ordRight", { ord: ordWord(pos) }), 0x4ade80);
      speak(t("ordRight", { ord: ordWord(pos) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.starBurst(runner.c.x, runner.c.y);
      this.time.delayedCall(900, () => {
        this.qIdx++;
        this.askNext();
      });
    } else {
      this.wrongs++;
      bad();
      speak(t("ordHint"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.floatMsg(t("ordHint"), 0xf87171);
      const runner = this.runners.find((r) => r.pos === pos)!;
      this.paintRunner(runner.face, 0xff8fa3);
      this.tweens.add({ targets: runner.c, x: runner.c.x - 8, duration: 60, yoyo: true, repeat: 2 });
      this.time.delayedCall(400, () => this.paintRunner(runner.face, 0xffffff));
      // pulse the finish flag so the kid knows where counting starts
      this.tweens.add({ targets: this.flagG, scaleX: 1.15, scaleY: 1.15, duration: 220, yoyo: true });
    }
  }

  private starBurst(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const s = this.add
        .text(x, y, i % 2 === 0 ? "⭐" : "✨", txt(22, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(40);
      this.tweens.add({
        targets: s,
        x: x + (i % 2 === 0 ? -1 : 1) * (30 + i * 16),
        y: y - 24 - i * 12,
        alpha: 0,
        duration: 800 + i * 50,
        ease: "Sine.easeOut",
        onComplete: () => s.destroy(),
      });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(t("ordDone"), 0xffd166);
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
    floatText(this, this.scale.width / 2, this.scale.height * 0.44, text, `#${color.toString(16).padStart(6, "0")}`, 24, -22);
  }
}
