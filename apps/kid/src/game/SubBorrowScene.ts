import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-subborrow")?.difficultyLevels ?? [5, 6, 8, 8, 10, 10];
const ROUNDS_TO_FINISH = 3;


/**
 * 2-digit subtraction with borrowing (visual) (#193).
 * Band 2 written-method twin of AddRegroupScene. Every question forces a
 * borrow: STEP 1 shows the minuend blocks, a green bar BREAKS into 10 ones
 * (borrow animation + chip) so 52 becomes 4|12, kid subtracts the ones;
 * STEP 2 subtracts the tens. Blocks and digits update after the borrow.
 */
export class SubBorrowScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private step = 1;
  private tM = 0; // minuend tens
  private oM = 0; // minuend ones
  private tS = 0; // subtrahend tens
  private oS = 0; // subtrahend ones
  private oRes = 0; // result ones
  private tRes = 0; // result tens
  private afterBorrow = false;
  private tiles: { sprite: Phaser.GameObjects.Container; val: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private tallyText!: Phaser.GameObjects.Text;
  private stepText!: Phaser.GameObjects.Text;
  private gfxBox!: Phaser.GameObjects.Graphics;
  private gfxBlocks!: Phaser.GameObjects.Graphics;
  private a1t!: Phaser.GameObjects.Text;
  private a1o!: Phaser.GameObjects.Text;
  private a2t!: Phaser.GameObjects.Text;
  private a2o!: Phaser.GameObjects.Text;
  private minusText!: Phaser.GameObjects.Text;
  private ansT!: Phaser.GameObjects.Text;
  private ansO!: Phaser.GameObjects.Text;
  private borrowChip!: Phaser.GameObjects.Container;
  private boxX = 0;
  private boxY = 0;
  private tensX = 0;
  private onesX = 0;
  private yAdd1 = 0;
  private yAdd2 = 0;
  private yBorrow = 0;
  private yAns = 0;

  constructor() {
    super("SubBorrow");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "space");
    this.titleText = this.add
      .text(0, 0, t("titleSubBorrow"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.stepText = this.add
      .text(0, 0, "", txt(22, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.gfxBox = this.add.graphics().setDepth(4);
    this.gfxBlocks = this.add.graphics().setDepth(5);

    this.a1t = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.a1o = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.minusText = this.add.text(0, 0, "−", txt(24, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.a2t = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.a2o = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.ansT = this.add.text(0, 0, "?", txt(34, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5).setAlpha(0.4);
    this.ansO = this.add.text(0, 0, "?", txt(34, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5).setAlpha(0.4);

    this.borrowChip = this.add.container(0, 0).setDepth(6).setVisible(false);
    const chip = this.add.graphics();
    chip.fillStyle(0xffa94d, 1).fillRoundedRect(-16, -16, 32, 32, 8);
    this.borrowChip.add(chip);
    const chipTxt = this.add.text(0, 0, "1", txt(22, "#ffffff", { bold: true })).setOrigin(0.5);
    this.borrowChip.add(chipTxt);

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.tallyText.setPosition(width / 2, height * 0.28);
    this.stepText.setPosition(width / 2, height * 0.36);
    this.boxX = width / 2 - 110;
    this.boxY = height * 0.13;
    this.tensX = this.boxX + 55;
    this.onesX = this.boxX + 165;
    this.yAdd1 = this.boxY + 26;
    this.yAdd2 = this.boxY + 56;
    this.yBorrow = this.boxY + 88;
    this.yAns = this.boxY + 118;
    this.a1t.setPosition(this.tensX, this.yAdd1);
    this.a1o.setPosition(this.onesX, this.yAdd1);
    this.minusText.setPosition(this.boxX + 18, this.yAdd2);
    this.a2t.setPosition(this.tensX, this.yAdd2);
    this.a2o.setPosition(this.onesX, this.yAdd2);
    this.ansT.setPosition(this.tensX, this.yAns);
    this.ansO.setPosition(this.onesX, this.yAns);
    this.borrowChip.setPosition(this.onesX, this.yBorrow);
    this.drawBox();
    this.drawBlocks();
  }

  private drawBox() {
    const g = this.gfxBox;
    g.clear();
    const bx = this.boxX;
    const by = this.boxY;
    const bw = 220;
    const bh = 150;
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeRect(bx, by, bw, bh);
    g.lineBetween(bx + 110, by, bx + 110, by + bh);
    g.lineBetween(bx, by + 74, bx + bw, by + 74);
    const colX = this.step === 1 ? this.onesX : this.tensX;
    g.fillStyle(0xffffff, 0.14);
    g.fillRect(colX - 26, by + 4, 52, 66);
  }

  private startRound() {
    this.clearTiles();
    this.locked = false;
    this.data.set("nv:difficulty", this.levelIndex + 1); // #1061 — reward engine sees round hardness
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.qIndex = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  private tensMax(): number {
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    if (lvl < 2) return 4;
    if (lvl < 4) return 6;
    return 8;
  }

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    this.step = 1;
    this.afterBorrow = false;
    this.borrowChip.setVisible(false);
    this.ansT.setText("?").setAlpha(0.4);
    this.ansO.setText("?").setAlpha(0.4);
    const tm = this.tensMax();
    this.tM = Phaser.Math.Between(3, tm); // ≥3 so tens result ≥ 1 (2-digit answer)
    this.tS = Phaser.Math.Between(1, this.tM - 2); // keep tens result ≥ 1
    this.oM = Phaser.Math.Between(0, 8);
    this.oS = Phaser.Math.Between(this.oM + 1, 9); // always borrow
    this.oRes = this.oM + 10 - this.oS;
    this.tRes = this.tM - 1 - this.tS;
    this.a1t.setText(digit(this.tM));
    this.a1o.setText(digit(this.oM));
    this.a2t.setText(digit(this.tS));
    this.a2o.setText(digit(this.oS));
    this.askStep(1);
  }

  private askStep(s: number) {
    this.clearTiles();
    this.locked = false;
    this.step = s;
    this.drawBox();
    this.drawBlocks();
    const target = s === 1 ? this.oRes : this.tRes;
    const opts = new Set<number>([target]);
    while (opts.size < 4) {
      const d = target + Phaser.Math.Between(-3, 3);
      if (d >= 0 && d <= 9) opts.add(d);
    }
    const bank = [...opts].sort(() => Math.random() - 0.5);
    this.stepText.setText(s === 1 ? t("boStep1") : t("boStep2"));

    const gl = gridLayout(this, {
      cols: 4,
      rows: 1,
      preferredW: 120,
      minW: 64,
      widthPad: 16,
      topPad: this.scale.height * 0.62,
      bottomY: this.scale.height - 40 - SAB(),
      cardH: 84,
    });
    bank.forEach((val, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, 84, digit(val), BTN_NEUTRAL, 34);
      tile.on("pointerdown", () => this.tap(tile, val, s));
      this.tiles.push({ sprite: tile, val });
    });
  }

  /** Base-10 blocks: bars for tens, cubes for ones (pre-borrow or post-borrow state). */
  private drawBlocks() {
    const g = this.gfxBlocks;
    g.clear();
    const { width, height } = this.scale;
    const cy = height * 0.46;
    const bars = this.afterBorrow ? this.tM - 1 : this.tM;
    const cubes = this.afterBorrow ? this.oM + 10 : this.oM;
    const barW = 34;
    const barH = 12;
    const gap = 6;
    const size = 12;
    const cGap = 13;
    const barTotal = bars;
    const bx = width / 2 - ((barTotal - 1) * (barW + gap)) / 2;
    for (let i = 0; i < barTotal; i++) {
      g.fillStyle(0x7dd3fc, 1).fillRoundedRect(bx + i * (barW + gap), cy, barW, barH, 3);
    }
    const cX0 = width / 2 - ((cubes - 1) * cGap) / 2 - 6;
    for (let i = 0; i < cubes; i++) {
      g.fillStyle(0x7dd3fc, 1).fillRect(cX0 + i * cGap, cy + 20, size, size);
    }
  }

  /** Borrow: one green bar lifts off the tens column and breaks into 10 ones. */
  private borrowAnim() {
    const { height } = this.scale;
    const startY = height * 0.46;
    const bar = this.add.rectangle(this.tensX, startY, 34, 12, 0x4ade80).setDepth(9);
    this.tweens.add({
      targets: bar,
      x: this.onesX,
      y: this.yBorrow,
      duration: 550,
      ease: "Sine.easeInOut",
      onComplete: () => {
        bar.destroy();
        const group = this.add.container(this.onesX, this.yBorrow).setDepth(9);
        const size = 9;
        const gap = 12;
        const x0 = -((4 * gap) / 2);
        for (let i = 0; i < 10; i++) {
          const r = Math.floor(i / 5);
          const c = i % 5;
          group.add(this.add.rectangle(x0 + c * gap, -8 + r * gap, size, size, 0x4ade80));
        }
        this.tweens.add({
          targets: group,
          y: height * 0.46 + 10,
          duration: 420,
          ease: "Bounce.easeOut",
          onComplete: () => {
            group.destroy();
            this.afterBorrow = true;
            this.a1t.setText(digit(this.tM - 1));
            this.a1o.setText(digit(this.oM + 10)).setColor(NV_GREEN);
            this.borrowChip.setVisible(true);
            this.drawBlocks();
            pop();
            this.tweens.add({ targets: this.borrowChip, scale: 1.3, duration: 160, yoyo: true, ease: "Back.easeOut" });
            this.floatMsg(t("boBorrow"), this.onesX, this.yBorrow - 40);
            speak(t("boBorrow"), { lang: getAppLang() === "bn" ? "bn" : "en" });
          },
        });
      },
    });
  }

  private tap(tile: Phaser.GameObjects.Container, val: number, s: number) {
    if (this.locked) return;
    const target = s === 1 ? this.oRes : this.tRes;
    if (val === target) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, tile.x, tile.y); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.tweens.add({ targets: tile, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      if (s === 1) {
        this.ansO.setText(digit(target)).setAlpha(1);
        this.borrowAnim();
        this.time.delayedCall(1550, () => this.askStep(2));
      } else {
        this.ansT.setText(digit(target)).setAlpha(1);
        const full = this.tRes * 10 + this.oRes;
        this.floatMsg(t("boSub", { x: digit(this.tM - 1), y: digit(this.tS), n: digit(this.tRes) }), this.scale.width / 2, this.scale.height * 0.56);
        speak(digit(full), { lang: getAppLang() === "bn" ? "bn" : "en" });
        const ms = Math.max(1, this.time.now - this.startedAt);
        this.advance(ms);
      }
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () => digit(target));
    if (s === 1) {
      this.floatMsg(t("boSub", { x: digit(this.oM + 10), y: digit(this.oS), n: digit(target) }), this.scale.width / 2, this.scale.height * 0.56);
      this.time.delayedCall(1400, () => this.askStep(1));
    } else {
      this.time.delayedCall(1100, () => this.askStep(2));
    }
  }

  private advance(ms: number) {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.qIndex++;
      this.time.delayedCall(900, () => this.askQuestion());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(`${t("boDone")}  ${digit(this.correct)}/${digit(this.total)}`, this.scale.width / 2, this.scale.height * 0.56);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.total, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, x: number, y: number) {
    floatText(this, x, y, text, NV_GOLD, 24, -24);
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}

/** Wrong-answer feedback without hintWrong's "keep on wrong" retirement. */
function hintWrongLocal(scene: Phaser.Scene, tile: Phaser.GameObjects.Container, correct: () => string) {
  scene.tweens.add({ targets: tile, scale: 0.9, duration: 90, yoyo: true, ease: "Sine.easeInOut" });
  tile.setAlpha(0.4);
  tile.disableInteractive();
  const m = scene.add
    .text(tile.x, tile.y - 40, correct(), txt(22, NV_GREEN, { bold: true, outline: true }))
    .setOrigin(0.5)
    .setDepth(40);
  scene.tweens.add({ targets: m, y: m.y - 20, alpha: 0, duration: 700, onComplete: () => m.destroy() });
}
