import Phaser from "phaser";
import { t } from "./i18n";
import { frameText } from "./framing";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win, starPop } from "./audio";
import { speak, bnNumber } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, BTN_PRIMARY, BTN_ORANGE, NV_GOLD } from "./ui";
import { correctCelebrate } from "./celebrate";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-count100")?.difficultyLevels ?? [10, 20, 30, 40, 60, 100];
/** The skill this scene teaches — used for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-count100")?.skillId ?? "count-to-100";

const ROD_H = 26;      // ten-rod height (px)
const ROD_GAP = 8;
const RODS_PER_ROW = 4; // rods wrap after 4 so 100 (10 rods) fits any phone
const UNIT_GAP = 5;

/**
 * Bundle & Count — build a target number up to 100 with place-value rods.
 *
 * The missing band-2 milestone: count-to-50 stops at 50, but NCTB class-2 needs
 * counting to 100 WITH the tens/ones idea. The kid TAPS +1 to add unit cubes
 * (10 ones auto-BUNDLE into a ten-rod — the whole point), and +10 to add a rod
 * directly once levels get big (targets ≥ 40). The rods + ones + a
 * "T tens + O ones = N" readout make the place value visible, and a progress
 * bar fills as the count climbs. Mobile-first, fat targets, no text walls.
 */
export class Count100Scene extends Phaser.Scene {
  private tens = 0;
  private ones = 0;
  private total = 0;
  private levelIndex = 0;
  private levels = LEVELS;
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
  private plus1!: Phaser.GameObjects.Container;
  private plus10!: Phaser.GameObjects.Container;

  constructor() {
    super("Count100");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[] }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    if (data.levels?.length) this.levels = data.levels;

    gameBackground(this, "forest");
    this.titleText = this.add.text(0, 0, t("titleCount100"), txt(30, "#ffffff", { bold: true })).setOrigin(0.5);
    this.roundText = this.add.text(0, 0, "", txt(18, NV_GOLD, { bold: true })).setOrigin(0.5);
    this.progressBar = this.add.graphics();
    this.progressText = this.add.text(0, 0, "", txt(17, "#ffffff", { bold: true })).setOrigin(0.5);
    this.breakdownText = this.add.text(0, 0, "", txt(24, "#ffffff", { bold: true, shadow: true })).setOrigin(0.5);
    this.bundleToast = this.add.text(0, 0, "", txt(20, "#fff3bf", { bold: true })).setOrigin(0.5).setAlpha(0);
    this.materials = this.add.container(0, 0);
    this.instruction = questionPanel(this, 0, 0, { tail: "none" });
    this.plus1 = modernAnswerButton(this, 0, 0, 52, t("count100Plus1"), BTN_ORANGE, { labelSize: 40 });
    this.plus10 = modernAnswerButton(this, 0, 0, 52, t("count100Plus10"), BTN_PRIMARY, { labelSize: 40 });

    this.plus1.on("pointerup", () => this.addOne());
    this.plus10.on("pointerup", () => this.addTen());

    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
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
    const btnY = Math.max(340, height - 132);
    this.titleText.setPosition(width / 2, 44);
    this.roundText.setPosition(width / 2, 82);
    this.progressText.setPosition(width / 2, 106);
    this.breakdownText.setPosition(width / 2, Math.max(140, Math.round(height * 0.21)));
    this.bundleToast.setPosition(width / 2, Math.max(172, Math.round(height * 0.255)));
    this.plus1.setPosition(width / 2 - 120, btnY);
    this.plus10.setPosition(width / 2 + 120, btnY);
    this.instruction.setPosition(width / 2, height - 38 - SAB());
  }

  /** Rods + ones drawing area (between the readout and the buttons). */
  private get playArea() {
    const { width, height } = this.scale;
    const btnY = Math.max(340, height - 132);
    return { x: 12, y: 204, w: Math.max(160, width - 24), h: Math.max(96, btnY - 28 - 204) };
  }

  private get roundTarget(): number {
    const l = this.levels;
    return l[Math.min(this.levelIndex, l.length - 1)];
  }

  private startRound() {
    this.tens = 0;
    this.ones = 0;
    this.total = 0;
    this.startedAt = this.time.now;
    const target = this.roundTarget;
    this.data.set("nv:difficulty", target); // #1061 — reward engine sees round hardness
    this.roundText.setText(frameText("count100Round", SKILL_ID, this.levelIndex, { n: this.levelIndex + 1, target }));
    this.instruction.set(t("count100Make", { n: target }));
    this.refresh();
  }

  private refresh() {
    const target = this.roundTarget;
    this.breakdownText.setText(t("count100Breakdown", { t: this.tens, o: this.ones, n: this.total }));
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
      this.bundleCelebrate();
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
    pop();
    this.speakTotal();
    this.refresh();
    if (this.total >= this.roundTarget) this.roundWin();
  }

  /** 10 ones just became a ten-rod — a chime + a flashy toast makes the moment land. */
  private bundleCelebrate() {
    starPop();
    this.bundleToast.setText(t("count100Bundle")).setAlpha(1).setScale(0.8);
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
    speak(t("count100DoneSpeak", { n: target }), { rate: 0.9 });
    correctCelebrate(this, width / 2, Math.round(height * 0.32));
    this.onRoundDone?.(true, ms, target);
    this.levelIndex++;
    this.time.delayedCall(800, () => this.startRound());
  }

  private updateButtons() {
    const target = this.roundTarget;
    const can1 = this.total + 1 <= target;
    const can10 = this.total + 10 <= target;
    this.setButtonState(this.plus1, can1);
    this.setButtonState(this.plus10, can10);
    this.plus10.setVisible(target >= 40); // early levels FORCE the +1 bundling lesson
  }

  private setButtonState(btn: Phaser.GameObjects.Container, enabled: boolean) {
    btn.setAlpha(enabled ? 1 : 0.35);
    if (enabled) btn.setInteractive();
    else btn.disableInteractive();
  }

  private drawProgress() {
    const w = Math.min(300, this.scale.width - 80);
    const x = this.scale.width / 2;
    const y = 106;
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

  /** Redraw the ten-rods + one-cubes from current tens/ones. */
  private drawMaterials() {
    this.materials.removeAll(true);
    const b = this.playArea;
    const unit = Math.max(20, Math.min(34, Math.floor((b.w - 20) / 10)));
    const rodRows = Math.max(1, Math.ceil(this.tens / RODS_PER_ROW));
    const rodH = Math.min(ROD_H, Math.max(14, Math.floor((b.h - 30) / rodRows)));
    const perRow = Math.min(RODS_PER_ROW, Math.max(1, this.tens));
    const rodW = Math.min(240, Math.floor((b.w - 20 - (perRow - 1) * ROD_GAP) / Math.max(1, perRow)));

    const cx = b.x + b.w / 2;
    const rowsTop = b.y + 6;
    for (let i = 0; i < this.tens; i++) {
      const row = Math.floor(i / RODS_PER_ROW);
      const inRow = i % RODS_PER_ROW;
      const nInRow = Math.min(RODS_PER_ROW, this.tens - row * RODS_PER_ROW);
      const totalW = nInRow * rodW + (nInRow - 1) * ROD_GAP;
      const x0 = cx - totalW / 2 + rodW / 2;
      this.drawRod(x0 + inRow * (rodW + ROD_GAP), rowsTop + row * (rodH + ROD_GAP), rodW, rodH);
    }
    if (this.ones > 0) {
      const onesTop = rowsTop + rodRows * (rodH + ROD_GAP) + 10;
      const totalW = this.ones * unit + (this.ones - 1) * UNIT_GAP;
      const x0 = cx - totalW / 2 + unit / 2;
      for (let i = 0; i < this.ones; i++) this.drawCube(x0 + i * (unit + UNIT_GAP), onesTop + unit / 2, unit);
    }
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
