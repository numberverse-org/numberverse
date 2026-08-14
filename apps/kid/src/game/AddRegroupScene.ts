import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-addregroup")?.difficultyLevels ?? [5, 6, 8, 8, 10, 10];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/**
 * 2-digit addition with regrouping (visual) (#192).
 * Band 2 written-method game with base-10 block support for carrying.
 * STEP-BY-STEP: add the ones, regroup 10 ones into 1 ten (animation + carry
 * chip), then add the tens + carry. Blocks show the current column: ones cubes
 * in step 1, tens bars + carry bar in step 2.
 */
export class AddRegroupScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private step = 1;
  private tensA = 0;
  private onesA = 0;
  private tensB = 0;
  private onesB = 0;
  private onesSum = 0;
  private onesDigit = 0;
  private tensDigit = 0;
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
  private plusText!: Phaser.GameObjects.Text;
  private ansT!: Phaser.GameObjects.Text;
  private ansO!: Phaser.GameObjects.Text;
  private carryChip!: Phaser.GameObjects.Container;
  private boxX = 0;
  private boxY = 0;
  private tensX = 0;
  private onesX = 0;
  private yAdd1 = 0;
  private yAdd2 = 0;
  private yCarry = 0;
  private yAns = 0;

  constructor() {
    super("AddRegroup");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "kitchen");
    this.titleText = this.add
      .text(0, 0, t("titleAddRegroup"), txt(34, "#ffffff", { bold: true }))
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

    // written-method digits
    this.a1t = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.a1o = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.plusText = this.add.text(0, 0, "+", txt(24, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.a2t = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.a2o = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5);
    this.ansT = this.add.text(0, 0, "?", txt(34, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5).setAlpha(0.4);
    this.ansO = this.add.text(0, 0, "?", txt(34, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5).setAlpha(0.4);

    this.carryChip = this.add.container(0, 0).setDepth(6).setVisible(false);
    const chip = this.add.graphics();
    chip.fillStyle(0x4ade80, 1).fillRoundedRect(-16, -16, 32, 32, 8);
    this.carryChip.add(chip);
    const chipTxt = this.add.text(0, 0, "1", txt(22, "#ffffff", { bold: true })).setOrigin(0.5);
    this.carryChip.add(chipTxt);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
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
    this.yCarry = this.boxY + 88;
    this.yAns = this.boxY + 118;
    this.a1t.setPosition(this.tensX, this.yAdd1);
    this.a1o.setPosition(this.onesX, this.yAdd1);
    this.plusText.setPosition(this.boxX + 18, this.yAdd2);
    this.a2t.setPosition(this.tensX, this.yAdd2);
    this.a2o.setPosition(this.onesX, this.yAdd2);
    this.ansT.setPosition(this.tensX, this.yAns);
    this.ansO.setPosition(this.onesX, this.yAns);
    this.carryChip.setPosition(this.tensX, this.yCarry);
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
    // active-column highlight
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
    if (lvl < 2) return 3;
    if (lvl < 4) return 5;
    return 7; // max 7 so tensDigit = tensA + tensB + 1 stays ≤ 9 (2-digit result)
  }

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    this.step = 1;
    this.carryChip.setVisible(false);
    this.ansT.setText("?").setAlpha(0.4);
    this.ansO.setText("?").setAlpha(0.4);
    const tm = this.tensMax();
    this.tensA = Phaser.Math.Between(1, tm);
    this.tensB = Phaser.Math.Between(1, Math.min(tm, 8 - this.tensA));
    // ones always carry: sum >= 10
    const o1 = Phaser.Math.Between(2, 9);
    this.onesA = o1;
    this.onesB = Phaser.Math.Between(10 - o1, 9);
    this.onesSum = this.onesA + this.onesB;
    this.onesDigit = this.onesSum % 10;
    this.tensDigit = this.tensA + this.tensB + 1;
    this.a1t.setText(digit(this.tensA));
    this.a1o.setText(digit(this.onesA));
    this.a2t.setText(digit(this.tensB));
    this.a2o.setText(digit(this.onesB));
    this.askStep(1);
  }

  private askStep(s: number) {
    this.clearTiles();
    this.locked = false;
    this.step = s;
    this.drawBox();
    this.drawBlocks();
    const target = s === 1 ? this.onesDigit : this.tensDigit;
    const lo = s === 1 ? 0 : 1;
    const opts = new Set<number>([target]);
    while (opts.size < 4) {
      const d = target + Phaser.Math.Between(-3, 3);
      if (d >= lo && d <= 9) opts.add(d);
    }
    const bank = [...opts].sort(() => Math.random() - 0.5);
    this.stepText.setText(s === 1 ? t("arStep1") : t("arStep2"));

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

  /** Base-10 blocks for the current step: ones cubes (step 1), tens bars + carry (step 2). */
  private drawBlocks() {
    const g = this.gfxBlocks;
    g.clear();
    const { width, height } = this.scale;
    const cy = height * 0.46;
    if (this.step === 1) {
      const size = 12;
      const gap = 14;
      const total = this.onesA + this.onesB;
      const x0 = width / 2 - ((total - 1) * gap) / 2 - 12;
      let k = 0;
      for (let i = 0; i < this.onesA; i++, k++) {
        g.fillStyle(0x7dd3fc, 1).fillRect(x0 + k * gap, cy, size, size);
      }
      for (let i = 0; i < this.onesB; i++, k++) {
        g.fillStyle(0xc4b5fd, 1).fillRect(x0 + k * gap, cy, size, size);
      }
    } else {
      const barW = 34;
      const barH = 12;
      const gap = 6;
      const total = this.tensA + this.tensB + 1;
      const x0 = width / 2 - ((total - 1) * (barW + gap)) / 2;
      let k = 0;
      for (let i = 0; i < this.tensA; i++, k++) {
        g.fillStyle(0x7dd3fc, 1).fillRoundedRect(x0 + k * (barW + gap), cy, barW, barH, 3);
      }
      for (let i = 0; i < this.tensB; i++, k++) {
        g.fillStyle(0xc4b5fd, 1).fillRoundedRect(x0 + k * (barW + gap), cy, barW, barH, 3);
      }
      g.fillStyle(0x4ade80, 1).fillRoundedRect(x0 + k * (barW + gap), cy, barW, barH, 3);
    }
  }

  /** Regroup: 10 ones cubes lift from the ones column and pop a carry chip. */
  private regroupAnim() {
    const { height } = this.scale;
    const startY = height * 0.46;
    const group = this.add.container(0, 0).setDepth(9);
    const size = 8;
    const gap = 10;
    const x0 = -((4 * gap) / 2);
    for (let i = 0; i < 10; i++) {
      const r = Math.floor(i / 5);
      const c = i % 5;
      const rect = this.add.rectangle(x0 + c * gap, -8 + r * gap, size, size, 0x4ade80);
      group.add(rect);
    }
    group.setPosition(this.onesX, startY);
    const chipPos = { x: this.tensX, y: this.yCarry };
    this.tweens.add({
      targets: group,
      x: chipPos.x,
      y: chipPos.y,
      scale: 0.55,
      duration: 650,
      ease: "Back.easeIn",
      onComplete: () => {
        group.destroy();
        this.carryChip.setVisible(true);
        pop();
        this.tweens.add({ targets: this.carryChip, scale: 1.3, duration: 160, yoyo: true, ease: "Back.easeOut" });
        this.floatMsg(t("arCarry"), this.tensX, this.yCarry - 40);
        speak(t("arCarry"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      },
    });
  }

  private tap(tile: Phaser.GameObjects.Container, val: number, s: number) {
    if (this.locked) return;
    const target = s === 1 ? this.onesDigit : this.tensDigit;
    if (val === target) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, tile.x, tile.y); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.tweens.add({ targets: tile, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      if (s === 1) {
        this.ansO.setText(digit(target)).setAlpha(1);
        this.regroupAnim();
        this.time.delayedCall(950, () => this.askStep(2));
      } else {
        this.ansT.setText(digit(target)).setAlpha(1);
        const full = this.tensDigit * 10 + this.onesDigit;
        this.floatMsg(t("arSum", { t: digit(this.tensA), t2: digit(this.tensB), c: digit(1), n: digit(this.tensDigit) }), this.scale.width / 2, this.scale.height * 0.56);
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
      this.floatMsg(t("arHint1", { x: digit(this.onesA), y: digit(this.onesB), s: digit(this.onesSum), d: digit(target) }), this.scale.width / 2, this.scale.height * 0.56);
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
    this.floatMsg(`${t("arDone")}  ${digit(this.correct)}/${digit(this.total)}`, this.scale.width / 2, this.scale.height * 0.56);
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
    const m = this.add
      .text(x, y, text, txt(24, NV_GOLD, { bold: true, outline: true, wrap: 300 }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
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
