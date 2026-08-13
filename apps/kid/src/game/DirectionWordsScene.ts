import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-directionwords")?.difficultyLevels ?? [3, 3, 4, 4, 5, 5];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const GRID = 4; // 4x4
const CELL = 56;
const GAP = 6;
/** The four direction words (done-when: 4 directions). */
interface Dir { key: string; label: string; arrow: string; dx: number; dy: number }
const DIRS: Dir[] = [
  { key: "up", label: "উপরে", arrow: "↑", dx: 0, dy: -1 },
  { key: "down", label: "নিচে", arrow: "↓", dx: 0, dy: 1 },
  { key: "left", label: "বামে", arrow: "←", dx: -1, dy: 0 },
  { key: "right", label: "ডানে", arrow: "→", dx: 1, dy: 0 },
];
const sameOrBack = (a: Dir, b: Dir) => a.key === b.key || (a.dx === -b.dx && a.dy === -b.dy);

/**
 * Direction words — উপরে-নিচে-ডানে-বামে (#172).
 * Band 1: a character (🐱) sits on a 4x4 grid. A SPOKEN instruction tells which
 * way to go ("উপরে যাও"). The kid taps the matching direction button and the
 * character hops one cell; wrong taps shake + repeat the word. Follow the whole
 * path to the ⭐ goal. Path length grows 3 → 5 by level.
 */
export class DirectionWordsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private path: { x: number; y: number }[] = [];
  private stepIdx = 0;
  private inst!: Dir;
  private char!: Phaser.GameObjects.Text;
  private goal!: Phaser.GameObjects.Text;
  private gridG!: Phaser.GameObjects.Graphics;
  private instText!: Phaser.GameObjects.Text;
  private buttons: { sprite: Phaser.GameObjects.Container; dir: Dir }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("DirectionWords");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleDirection"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("dwPrompt"));
    this.meter = roundMeter(this);
    this.instText = this.add
      .text(0, 0, "", txt(40, "#ffd166", { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(3);
    this.gridG = this.add.graphics().setDepth(0);
    this.char = this.add.text(0, 0, "🐱", txt(40, "#ffffff", {})).setOrigin(0.5).setDepth(2);
    this.goal = this.add.text(0, 0, "⭐", txt(40, "#ffffff", {})).setOrigin(0.5).setDepth(1);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.16);
    this.instText.setPosition(width / 2, height * 0.26);
    this.drawGrid();
  }

  private cellPos(gx: number, gy: number) {
    const total = GRID * CELL + (GRID - 1) * GAP;
    const ox = this.scale.width / 2 - total / 2;
    const oy = this.scale.height * 0.46 - total / 2;
    return { x: ox + gx * (CELL + GAP) + CELL / 2, y: oy + gy * (CELL + GAP) + CELL / 2 };
  }

  private drawGrid() {
    this.gridG.clear();
    this.gridG.fillStyle(0x123d52, 0.35);
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const p = this.cellPos(gx, gy);
        this.gridG.fillRoundedRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL, 8);
      }
    }
  }

  private startRound() {
    this.clearButtons();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearButtons();
    this.locked = false;
    this.path = this.makePath(LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)]);
    this.stepIdx = 0;
    const start = this.cellPos(this.path[0].x, this.path[0].y);
    this.char.setPosition(start.x, start.y);
    this.char.setVisible(true);
    const goalP = this.cellPos(this.path[this.path.length - 1].x, this.path[this.path.length - 1].y);
    this.goal.setPosition(goalP.x, goalP.y);
    this.goal.setVisible(true);
    this.showInstruction();
    this.buildButtons();
  }

  private makePath(steps: number): { x: number; y: number }[] {
    const p: { x: number; y: number }[] = [{ x: Phaser.Math.Between(0, GRID - 1), y: Phaser.Math.Between(0, GRID - 1) }];
    let last: Dir | null = null;
    for (let i = 0; i < steps; i++) {
      let d: Dir;
      let guard = 0;
      do {
        d = DIRS[Phaser.Math.Between(0, 3)];
        const next = { x: p[p.length - 1].x + d.dx, y: p[p.length - 1].y + d.dy };
        const inGrid = next.x >= 0 && next.x < GRID && next.y >= 0 && next.y < GRID;
        const ok = inGrid && (last === null || !sameOrBack(d, last));
        if (ok) { p.push(next); last = d; break; }
        guard++;
      } while (guard < 20);
      // safety: if we can't find a step (shouldn't happen on a 4x4), just retry a random in-grid step
      if (p.length === i + 1) {
        const opts = DIRS.filter((dd) => {
          const nx = p[p.length - 1].x + dd.dx;
          const ny = p[p.length - 1].y + dd.dy;
          return nx >= 0 && nx < GRID && ny >= 0 && ny < GRID && (last === null || !sameOrBack(dd, last));
        });
        const d = opts[Phaser.Math.Between(0, opts.length - 1)];
        p.push({ x: p[p.length - 1].x + d.dx, y: p[p.length - 1].y + d.dy });
        last = d;
      }
    }
    return p;
  }

  private showInstruction() {
    if (this.stepIdx >= this.path.length - 1) return;
    const dx = this.path[this.stepIdx + 1].x - this.path[this.stepIdx].x;
    const dy = this.path[this.stepIdx + 1].y - this.path[this.stepIdx].y;
    this.inst = DIRS.find((d) => d.dx === dx && d.dy === dy)!;
    this.instText.setText(this.inst.arrow + " " + this.inst.label + " যাও");
    this.time.delayedCall(350, () => speak(this.inst.label + " যাও", { lang: "bn" }));
  }

  private buildButtons() {
    this.clearButtons();
    const { width, height } = this.scale;
    const bx = width / 2;
    const by = height - 160 - SAB();
    const pad = 96;
    const layout: [number, number][] = [
      [bx - pad, by - 58],
      [bx + pad, by - 58],
      [bx - pad, by + 58],
      [bx + pad, by + 58],
    ];
    DIRS.forEach((d, i) => {
      const btn = modernCardButton(this, layout[i][0], layout[i][1], 150, 92, d.arrow + " " + d.label, BTN_NEUTRAL, 28);
      btn.on("pointerdown", () => this.tap(btn, d));
      this.buttons.push({ sprite: btn, dir: d });
    });
  }

  private tap(container: Phaser.GameObjects.Container, d: Dir) {
    if (this.locked) return;
    if (d.key === this.inst.key) {
      pop();
      const from = this.cellPos(this.path[this.stepIdx].x, this.path[this.stepIdx].y);
      const to = this.cellPos(this.path[this.stepIdx + 1].x, this.path[this.stepIdx + 1].y);
      this.tweens.add({
        targets: this.char,
        x: to.x,
        y: to.y,
        duration: 240,
        ease: "Quad.easeOut",
        onComplete: () => {
          this.stepIdx++;
          if (this.stepIdx >= this.path.length - 1) {
            // reached the goal
            this.locked = true;
            win();
            this.tweens.add({ targets: this.goal, scale: 1.4, duration: 200, yoyo: true });
            this.floatMsg(t("dwGreat"));
            this.qInRound++;
            this.time.delayedCall(1000, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
          } else {
            this.clearButtons();
            this.buildButtons();
            this.showInstruction();
          }
        },
      });
      return;
    }
    hintWrong(this, container, {
      hint: () => "Listen again — which way?",
      hintBn: () => "আবার শোনো — কোন দিকে?",
      correct: () => this.inst.key,
      options: () => this.buttons.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.dir.key })),
    });
    this.time.delayedCall(500, () => speak(this.inst.label + " যাও", { lang: "bn" }));
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("dwDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.78, text, txt(28, "#ffd166", { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearButtons() {
    this.buttons.forEach((o) => o.sprite.destroy());
    this.buttons = [];
  }
}
