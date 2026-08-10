import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speakMath } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, BTN_RED, BTN_PURPLE, BTN_ORANGE, BTN_PRIMARY, correctButton, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-balloonpop")?.difficultyLevels ?? [10, 12, 14, 16, 18, 20];
const ROUNDS_TO_FINISH = 3;
const BALLOON_RADIUS = 48;
const STYLES = [BTN_RED, BTN_PURPLE, BTN_ORANGE, BTN_PRIMARY];

interface Balloon {
  sprite: Phaser.GameObjects.Container;
  value: number;
  baseX: number;
  baseY: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Balloon Pop — pop the balloon with the right sum before it drifts away.
 * Band 2 (ages 4–6, math). Arcade addition: four balloons bob gently in the
 * sky, each hiding an answer. Pop the right one; wrong ones deflate and sink.
 */
export class BalloonPopScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private a = 1;
  private b = 1;
  private balloons: Balloon[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BalloonPop");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleBalloon"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layout();
      this.reflowBalloons();
    });
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get roundMax(): number {
    return LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
  }

  private startRound() {
    this.clearBalloons();
    this.startedAt = this.time.now;
    const max = this.roundMax;
    // a + b = sum, both addends ≥ 2 so it's real addition with room to vary
    const sum = Phaser.Math.Between(6, max);
    this.a = Phaser.Math.Between(2, sum - 2);
    this.b = sum - this.a;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(`${this.a} + ${this.b} = ?`);
    speakMath("add", this.a, this.b);
    this.spawnBalloons(sum);
  }

  private spawnBalloons(target: number) {
    // 4 unique answer options built around the target
    const raw = [target, target + 1, target - 1, target + 2];
    const opts = shuffle(raw).map((v, i) => ({ v, i })).filter((o, idx, arr) => arr.findIndex((x) => x.v === o.v) === idx && o.v > 0).slice(0, 4);
    const { width, height } = this.scale;
    const baseY = height * 0.42;
    const xs = [0.2, 0.4, 0.6, 0.8].map((f) => width * f);
    opts.forEach((o, i) => {
      const x = xs[i];
      const style = STYLES[i % STYLES.length];
      const c = modernAnswerButton(this, x, baseY, BALLOON_RADIUS, String(o.v), style, { labelSize: BALLOON_RADIUS - 8 });
      // balloon knot + string
      const knot = this.add.text(0, BALLOON_RADIUS - 2, "⌄", { fontSize: "24px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5, 1);
      const str = this.add.graphics();
      str.lineStyle(3, 0xffffff, 0.7);
      str.lineBetween(0, BALLOON_RADIUS + 4, 0, BALLOON_RADIUS + 34);
      c.add([knot, str]);
      c.on("pointerdown", () => this.tap(c, o.v));
      const b: Balloon = { sprite: c, value: o.v, baseX: x, baseY };
      this.balloons.push(b);
      this.bob(b);
    });
  }

  private bob(b: Balloon) {
    this.tweens.add({
      targets: b.sprite,
      y: b.baseY + Phaser.Math.Between(-16, 16),
      angle: Phaser.Math.Between(-5, 5),
      duration: Phaser.Math.Between(1500, 2600),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private reflowBalloons() {
    const { width, height } = this.scale;
    const baseY = height * 0.42;
    const xs = [0.2, 0.4, 0.6, 0.8].map((f) => width * f);
    this.balloons.forEach((b, i) => {
      b.baseX = xs[i];
      b.baseY = baseY;
      this.tweens.killTweensOf(b.sprite);
      b.sprite.setPosition(b.baseX, b.baseY);
      b.sprite.setAngle(0);
      this.bob(b);
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    const target = this.a + this.b;
    if (value !== target) {
      hintWrong(this, container, {
        hint: () => t("balloonAsk", { a: this.a, b: this.b }),
        hintBn: () => t("balloonAsk", { a: this.a, b: this.b }),
        correct: () => target,
        options: () => this.balloons,
      });
      // wrong balloon sinks a little before it deflates
      this.tweens.add({ targets: container, y: container.y + 18, duration: 120, ease: "Quad.easeIn" });
      return;
    }
    pop();
    correctButton(container);
    this.balloons.forEach((bb) => bb.sprite.disableInteractive());
    const [bx, by] = [container.x, container.y];
    this.tweens.add({
      targets: container,
      scale: 0.05,
      alpha: 0,
      y: by - 30,
      duration: 220,
      ease: "Back.easeIn",
    });
    this.sparkle(bx, by);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(850, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearBalloons() {
    this.balloons.forEach((b) => b.sprite.destroy());
    this.balloons = [];
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 18; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, this.randomColor());
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-80, 80),
        y: y + Phaser.Math.Between(-80, 80),
        alpha: 0,
        duration: 520,
        onComplete: () => p.destroy(),
      });
    }
  }

  private randomColor(): number {
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255)
    );
  }
}
