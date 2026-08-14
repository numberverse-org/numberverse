import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, bnNumber, enNumber } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { assetIcon } from "./svgAssets";
import { txt, ringCorrect, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-balance")?.difficultyLevels ?? [5, 6, 8, 10, 12, 14];
/** Weight gap per level — the higher the level, the closer the counts get. */
const GAPS = [3, 3, 2, 2, 1, 1];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

function bdDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => BN_D[Number(d)]);
}

type Side = "left" | "right";

/**
 * Balance — which side of the seesaw is heavier?
 * Band 2 (ages 4–6, science). Each side holds a bucket of apples with a number
 * badge. More apples = heavier: the plank tilts down on the winning side.
 * Levels shrink the gap (3 apart → 1 apart) so counting stays the challenge.
 */
export class BalanceScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private leftCount = 1;
  private rightCount = 1;
  private heavierSide: Side = "left";
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private seesaw!: Phaser.GameObjects.Container;
  private leftBucket!: Phaser.GameObjects.Container;
  private rightBucket!: Phaser.GameObjects.Container;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Balance");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("titleBalance"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    onSceneResize(this, () => {
      this.layout();
      this.buildSeesaw();
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

  private startRound() {
    this.startedAt = this.time.now;
    this.pickWeights();
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t("balanceAsk"));
    speak(t("balanceAsk"));
    this.buildSeesaw();
  }

  private pickWeights() {
    const max = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const gap = GAPS[Math.min(this.levelIndex, GAPS.length - 1)];
    const heavier = Phaser.Math.Between(gap + 1, max);
    const lighter = heavier - gap;
    const leftIsHeavy = Math.random() < 0.5;
    this.leftCount = leftIsHeavy ? heavier : lighter;
    this.rightCount = leftIsHeavy ? lighter : heavier;
    this.heavierSide = leftIsHeavy ? "left" : "right";
  }

  private buildSeesaw() {
    if (this.seesaw) this.seesaw.destroy();
    this.background.clear();
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = Math.min(height * 0.6, height - 190 - SAB());
    const L = Math.min(360, width - 60);
    const bucketW = Math.min(150, L / 2 - 30);
    const bucketH = 118;

    this.seesaw = this.add.container(cx, cy);
    // plank
    const plank = this.add.graphics();
    plank.fillStyle(0xb07d4f, 1);
    plank.fillRoundedRect(-L / 2, -12, L, 24, 10);
    plank.lineStyle(3, 0x7c4a21, 1);
    plank.strokeRoundedRect(-L / 2, -12, L, 24, 10);
    plank.lineStyle(2, 0xe8c39e, 0.9);
    plank.lineBetween(-L / 2 + 10, -8, L / 2 - 10, -8);
    this.seesaw.add(plank);

    // pivot triangle + ground (static layer, doesn't tilt)
    this.background.fillStyle(0x0b2545, 1);
    this.background.fillTriangle(cx - 20, cy + 30, cx + 20, cy + 30, cx, cy + 12);
    this.background.lineStyle(4, 0xffffff, 0.5);
    this.background.lineBetween(cx - 130, cy + 46, cx + 130, cy + 46);
    this.background.lineStyle(2, 0x2ec4b6, 0.9);
    this.background.lineBetween(cx - 130, cy + 42, cx + 130, cy + 42);

    const sideX = L / 2 - bucketW / 2 - 8;
    this.leftBucket = this.makeBucket(-sideX, -(12 + bucketH / 2), bucketW, bucketH, this.leftCount, "left");
    this.rightBucket = this.makeBucket(sideX, -(12 + bucketH / 2), bucketW, bucketH, this.rightCount, "right");
    this.seesaw.add([this.leftBucket, this.rightBucket]);
    this.leftBucket.on("pointerdown", () => this.tap(this.leftBucket, "left"));
    this.rightBucket.on("pointerdown", () => this.tap(this.rightBucket, "right"));
  }

  private makeBucket(x: number, y: number, w: number, h: number, count: number, side: Side): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    // frosted basket body
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.2);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    g.lineStyle(3, 0xffffff, 0.85);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    c.add(g);
    // apples — size scaled to fit the bucket width
    const cols = Math.min(5, Math.ceil(count / 2));
    const rows = Math.ceil(count / cols);
    const icon = Math.max(14, Math.min(26, Math.floor((w - 16) / cols) - 4));
    for (let i = 0; i < count; i++) {
      const ix = -((cols - 1) * (icon + 4)) / 2 + (i % cols) * (icon + 4);
      const iy = -h / 2 + 24 + Math.floor(i / cols) * (icon + 4) + icon / 2;
      c.add(assetIcon(this, "apple", icon).setPosition(ix, iy));
    }
    // count badge
    const badge = this.add
      .text(0, h / 2 - 26, bdDigits(count), txt(30, "#ffffff", { bold: true, outline: true, shadow: false }))
      .setOrigin(0.5);
    c.add(badge);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c.setData("side", side);
    return c;
  }

  private tap(bucket: Phaser.GameObjects.Container, side: Side) {
    if (side !== this.heavierSide) {
      // fun physics feedback: the plank dips toward the tapped side briefly
      const dip = side === "left" ? 5 : -5;
      this.tweens.add({ targets: this.seesaw, angle: dip, duration: 200, ease: "Quad.easeOut", yoyo: true, repeat: 1 });
      hintWrong(this, bucket, {
        hint: () => t("balanceCountHint"),
        hintBn: () => t("balanceCountHint"),
        correct: () => this.heavierSide,
        options: () => [
          { sprite: this.leftBucket, value: "left" },
          { sprite: this.rightBucket, value: "right" },
        ],
      });
      return;
    }
    pop();
    ringCorrect(this, bucket);
    this.leftBucket.disableInteractive();
    this.rightBucket.disableInteractive();
    // plank tilts down on the winning side
    const tilt = side === "left" ? 8 : -8;
    this.tweens.add({ targets: this.seesaw, angle: tilt, duration: 450, ease: "Back.easeOut" });
    const bn = getAppLang() === "bn";
    const num = (n: number) => (bn ? bnNumber(n) : enNumber(n));
    const heavier = Math.max(this.leftCount, this.rightCount);
    const lighter = Math.min(this.leftCount, this.rightCount);
    speak(t("balanceHeavier", { x: num(heavier), y: num(lighter) }), { lang: bn ? "bn" : "en" });
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(950, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }
}
