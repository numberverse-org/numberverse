import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win, starPop } from "./audio";
import { speak, bnNumber } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, BTN_PRIMARY, BTN_ORANGE, BTN_PURPLE, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { correctCelebrate } from "./celebrate";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-build999")?.difficultyLevels ?? [100, 120, 150, 200, 300, 500];

const FLAT = 64;           // hundred-flat side (px) — the 10×10 base-10 block
const ROD_H = 18;          // ten-rod height (px)
const ROD_GAP = 6;
const FLATS_PER_ROW = 2;   // flats wrap after 2 so 5 flats fit any phone
const RODS_PER_ROW = 5;    // rods wrap after 5 (50) — a 999 target = 9 rods
const UNIT_GAP = 5;

/**
 * Build to 999 — the count-to-100 "bundle & count" mechanic extended to
 * HUNDREDS. The kid taps +1 (ones), +10 (ten-rods) and +100 (hundred-flats)
 * to build a target number up to 999. Bundling makes the place value visible:
 * 10 ones → one ten-rod, 10 rods → one hundred-flat (the "10 ones = 1 ten"
 * moment, now twice). Spoken in Bangla too — every add reads the running
 * total aloud in the app's language. Mobile-first, fat targets, no text walls.
 */
export class Build999Scene extends Phaser.Scene {
  private hundreds = 0;
  private tens = 0;
  private ones = 0;
  private total = 0;
  private levelIndex = 0;
  private startedAt = 0;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private breakdownText!: Phaser.GameObjects.Text;
  private bundleToast!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private materials!: Phaser.GameObjects.Container;
  private instruction!: QuestionPanelApi;
  private meter!: RoundMeterApi;
  private plus1!: Phaser.GameObjects.Container;
  private plus10!: Phaser.GameObjects.Container;
  private plus100!: Phaser.GameObjects.Container;

  constructor() {
    super("Build999");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;

    gameBackground(this, "sky");
    this.titleText = this.add.text(0, 0, t("titleBuild999"), txt(30, "#ffffff", { bold: true })).setOrigin(0.5);
    this.roundText = this.add.text(0, 0, "", txt(18, NV_GOLD, { bold: true })).setOrigin(0.5);
    this.progressBar = this.add.graphics();
    this.progressText = this.add.text(0, 0, "", txt(17, "#ffffff", { bold: true })).setOrigin(0.5);
    this.breakdownText = this.add.text(0, 0, "", txt(22, "#ffffff", { bold: true, shadow: true })).setOrigin(0.5);
    this.bundleToast = this.add.text(0, 0, "", txt(20, "#fff3bf", { bold: true })).setOrigin(0.5).setAlpha(0);
    this.materials = this.add.container(0, 0);
    this.instruction = questionPanel(this, 0, 0, { tail: "none" });
    this.meter = roundMeter(this);
    this.plus1 = modernAnswerButton(this, 0, 0, 44, t("build999Plus1"), BTN_ORANGE, { labelSize: 34 });
    this.plus10 = modernAnswerButton(this, 0, 0, 44, t("build999Plus10"), BTN_PRIMARY, { labelSize: 34 });
    this.plus100 = modernAnswerButton(this, 0, 0, 44, t("build999Plus100"), BTN_PURPLE, { labelSize: 34 });

    this.plus1.on("pointerup", () => this.addOne());
    this.plus10.on("pointerup", () => this.addTen());
    this.plus100.on("pointerup", () => this.addHundred());

    onSceneResize(this, () => {
      this.layout();
      this.drawMaterials();
      this.drawProgress();
    });
    this.data.set("nv:noSwipe", true); // no swipe-to-answer target here
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    const btnY = Math.max(380, height - 108);
    this.titleText.setPosition(width / 2, 44);
    this.roundText.setPosition(width / 2, 78);
    this.meter.setPosition(width / 2, 102);
    this.progressText.setPosition(width / 2, 126);
    this.breakdownText.setPosition(width / 2, Math.max(158, Math.round(height * 0.24)));
    this.bundleToast.setPosition(width / 2, Math.max(190, Math.round(height * 0.285)));
    this.plus1.setPosition(width / 2 - 150, btnY);
    this.plus10.setPosition(width / 2, btnY);
    this.plus100.setPosition(width / 2 + 150, btnY);
    this.instruction.setPosition(width / 2, height - 38 - SAB());
  }

  /** Flats/rods/ones drawing area (between the readout and the buttons). */
  private get playArea() {
    const { width, height } = this.scale;
    const btnY = Math.max(380, height - 108);
    return { x: 12, y: 210, w: Math.max(160, width - 24), h: Math.max(120, btnY - 34 - 210) };
  }

  private get roundTarget(): number {
    const l = LEVELS;
    return l[Math.min(this.levelIndex, l.length - 1)];
  }

  private startRound() {
    this.hundreds = 0;
    this.tens = 0;
    this.ones = 0;
    this.total = 0;
    this.startedAt = this.time.now;
    const target = this.roundTarget;
    this.data.set("nv:difficulty", target); // #1061 — reward engine sees round hardness
    this.roundText.setText(t("build999Round", { n: this.levelIndex + 1, target }));
    this.meter.set(0, 3);
    this.instruction.set(t("build999Make", { n: target }));
    this.refresh();
  }

  private refresh() {
    const target = this.roundTarget;
    this.breakdownText.setText(t("build999Breakdown", { h: this.hundreds, t: this.tens, o: this.ones, n: this.total }));
    this.drawProgress();
    this.drawMaterials();
    this.updateButtons();
  }

  private addOne() {
    if (this.total >= this.roundTarget) return;
    this.ones++;
    if (this.ones === 10) {
      this.ones = 0;
      this.tens++;
      this.bundleCelebrate(t("build999Bundle"));
    }
    this.total++;
    pop();
    this.speakTotal();
    this.refresh();
    if (this.total >= this.roundTarget) this.roundWin();
  }

  private addTen() {
    if (this.total + 10 > this.roundTarget) return;
    this.tens++;
    this.total += 10;
    if (this.tens === 10) {
      this.tens = 0;
      this.hundreds++;
      this.bundleCelebrate(t("build999Bundle100"));
    }
    pop();
    this.speakTotal();
    this.refresh();
    if (this.total >= this.roundTarget) this.roundWin();
  }

  private addHundred() {
    if (this.total + 100 > this.roundTarget) return;
    this.hundreds++;
    this.total += 100;
    pop();
    this.speakTotal();
    this.refresh();
    if (this.total >= this.roundTarget) this.roundWin();
  }

  /** 10 of the current unit just became the next bigger block — chime + toast. */
  private bundleCelebrate(msg: string) {
    starPop();
    this.bundleToast.setText(msg).setAlpha(1).setScale(0.8);
    this.tweens.killTweensOf(this.bundleToast);
    this.tweens.add({
      targets: this.bundleToast,
      scale: 1,
      y: this.bundleToast.y - 18,
      duration: 300,
      ease: "Back.easeOut",
    });
    this.time.delayedCall(1400, () => {
      if (!this.bundleToast.active) return;
      this.tweens.add({ targets: this.bundleToast, alpha: 0, duration: 350 });
    });
  }

  private speakTotal() {
    const bn = getAppLang() === "bn";
    speak(bn ? bnNumber(this.total) : String(this.total), { cancel: false });
  }

  private roundWin() {
    const { width, height } = this.scale;
    const target = this.roundTarget;
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    speak(t("build999DoneSpeak", { n: target }), { rate: 0.9 });
    correctCelebrate(this, width / 2, Math.round(height * 0.32));
    this.onRoundDone?.(this.total >= target, ms, target);
    this.levelIndex++;
    this.time.delayedCall(800, () => this.startRound());
  }

  private updateButtons() {
    const target = this.roundTarget;
    const can1 = this.total + 1 <= target;
    const can10 = this.total + 10 <= target;
    const can100 = this.total + 100 <= target;
    this.setButtonState(this.plus1, can1);
    this.setButtonState(this.plus10, can10);
    this.setButtonState(this.plus100, can100);
    this.plus100.setVisible(target >= 200); // early levels force the +1/+10 bundling lesson
  }

  private setButtonState(btn: Phaser.GameObjects.Container, enabled: boolean) {
    btn.setAlpha(enabled ? 1 : 0.35);
    if (enabled) btn.setInteractive();
    else btn.disableInteractive();
  }

  private drawProgress() {
    const w = Math.min(300, this.scale.width - 80);
    const x = this.scale.width / 2;
    const y = 126;
    const target = this.roundTarget;
    const frac = target > 0 ? Math.min(1, this.total / target) : 0;
    this.progressBar.clear();
    this.progressBar.fillStyle(0xffffff, 0.25);
    this.progressBar.fillRoundedRect(x - w / 2, y - 8, w, 16, 8);
    if (frac > 0) {
      this.progressBar.fillStyle(0xffd166, 1);
      this.progressBar.fillRoundedRect(x - w / 2, y - 8, Math.max(16, w * frac), 16, 8);
    }
    this.progressText.setText(`${this.total} / ${target}`);
  }

  /** Redraw the hundred-flats + ten-rods + one-cubes from the running count. */
  private drawMaterials() {
    this.materials.removeAll(true);
    const b = this.playArea;
    const flatRows = Math.max(1, Math.ceil(this.hundreds / FLATS_PER_ROW));
    const flatH = Math.min(FLAT, Math.max(30, Math.floor((b.h - 34) / flatRows)));
    const flatW = flatH;
    const perRowF = Math.min(FLATS_PER_ROW, Math.max(1, this.hundreds));
    const cx = b.x + b.w / 2;
    const top = b.y + 4;

    // hundred-flats (10×10 base-10 blocks)
    for (let i = 0; i < this.hundreds; i++) {
      const row = Math.floor(i / FLATS_PER_ROW);
      const inRow = i % FLATS_PER_ROW;
      const nInRow = Math.min(FLATS_PER_ROW, this.hundreds - row * FLATS_PER_ROW);
      const totalW = nInRow * flatW + (nInRow - 1) * ROD_GAP;
      const x0 = cx - totalW / 2 + flatW / 2;
      this.drawFlat(x0 + inRow * (flatW + ROD_GAP), top + row * (flatH + ROD_GAP), flatW, flatH);
    }

    // ten-rods below the flats
    const rodsTop = top + flatRows * (flatH + ROD_GAP);
    const rodRows = Math.max(1, Math.ceil(this.tens / RODS_PER_ROW));
    const rodH = Math.min(ROD_H, Math.max(12, Math.floor((b.h - (rodsTop - top) - 24) / rodRows)));
    const perRowR = Math.min(RODS_PER_ROW, Math.max(1, this.tens));
    const rodW = Math.min(180, Math.floor((b.w - 20 - (perRowR - 1) * ROD_GAP) / Math.max(1, perRowR)));
    for (let i = 0; i < this.tens; i++) {
      const row = Math.floor(i / RODS_PER_ROW);
      const inRow = i % RODS_PER_ROW;
      const nInRow = Math.min(RODS_PER_ROW, this.tens - row * RODS_PER_ROW);
      const totalW = nInRow * rodW + (nInRow - 1) * ROD_GAP;
      const x0 = cx - totalW / 2 + rodW / 2;
      this.drawRod(x0 + inRow * (rodW + ROD_GAP), rodsTop + row * (rodH + ROD_GAP), rodW, rodH);
    }

    // one-cubes
    if (this.ones > 0) {
      const onesTop = rodsTop + rodRows * (rodH + ROD_GAP);
      const unit = Math.max(18, Math.min(30, Math.floor((b.w - 20) / 10)));
      const totalW = this.ones * unit + (this.ones - 1) * UNIT_GAP;
      const x0 = cx - totalW / 2 + unit / 2;
      for (let i = 0; i < this.ones; i++) this.drawCube(x0 + i * (unit + UNIT_GAP), onesTop + unit / 2, unit);
    }
  }

  private drawFlat(x: number, y: number, w: number, h: number) {
    const g = this.add.graphics();
    g.fillStyle(0x818cf8, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.max(3, Math.round(h * 0.06)));
    g.lineStyle(2, 0xffffff, 0.85);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, Math.max(3, Math.round(h * 0.06)));
    g.lineStyle(1, 0xffffff, 0.4);
    for (let i = 1; i < 10; i++) {
      g.lineBetween(-w / 2 + (w * i) / 10, -h / 2 + 2, -w / 2 + (w * i) / 10, h / 2 - 2);
      g.lineBetween(-w / 2 + 2, -h / 2 + (h * i) / 10, w / 2 - 2, -h / 2 + (h * i) / 10);
    }
    g.setPosition(x, y);
    this.materials.add(g);
  }

  private drawRod(x: number, y: number, w: number, h: number) {
    const g = this.add.graphics();
    g.fillStyle(0x38bdf8, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.max(3, Math.round(h * 0.28)));
    g.lineStyle(2, 0xffffff, 0.85);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, Math.max(3, Math.round(h * 0.28)));
    g.lineStyle(1, 0xffffff, 0.5);
    for (let i = 1; i < 10; i++) {
      g.lineBetween(-w / 2 + (w * i) / 10, -h / 2 + 2, -w / 2 + (w * i) / 10, h / 2 - 2);
    }
    g.setPosition(x, y);
    this.materials.add(g);
  }

  private drawCube(x: number, y: number, u: number) {
    const g = this.add.graphics();
    g.fillStyle(0xffd166, 1);
    g.fillRoundedRect(-u / 2, -u / 2, u, u, Math.max(3, Math.round(u * 0.2)));
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeRoundedRect(-u / 2, -u / 2, u, u, Math.max(3, Math.round(u * 0.2)));
    g.setPosition(x, y);
    this.materials.add(g);
  }
}
