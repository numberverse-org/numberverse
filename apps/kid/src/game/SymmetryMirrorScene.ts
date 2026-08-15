import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-symmetry")?.difficultyLevels ?? [4, 4, 5, 5, 6, 6];
const ROUNDS_TO_FINISH = 3;

interface Design {
  /** 8 rows × 4 chars — the LEFT half of a vertically-symmetric picture. */
  m: string[];
  color: number;
}

/** 13 kid-recognisable pictures with a clear vertical fold. Each is defined by
 *  its left half only; the mirror half is derived, so the "wrong" options are
 *  always other halves — never a broken version of the true one. */
const DESIGNS: Design[] = [
  { m: ["..XX", "XXXX", "XXXX", "XXXX", ".XXX", "..XX", "...X", "...."], color: 0xe11d48 }, // heart
  { m: ["..XX", ".XXX", ".XXX", ".XXX", ".XXX", ".XXX", "XXXX", "...."], color: 0x16a34a }, // pine
  { m: ["..XX", "XXXX", "XXXX", "XXXX", "XXXX", "XXXX", "..XX", "...."], color: 0x2563eb }, // cup
  { m: ["...X", "..XX", ".XXX", "XXXX", "XXXX", "XXXX", "...X", "...X"], color: 0xea580c }, // house
  { m: ["...X", "..XX", "..XX", "...X", "...X", "..XX", "...X", "...."], color: 0xdb2777 }, // tulip
  { m: ["...X", "..XX", ".XXX", "XXXX", "XXXX", ".XXX", "..XX", "...X"], color: 0x0d9488 }, // diamond
  { m: ["XXXX", "XXXX", ".XXX", ".XXX", "....", "...X", "...X", "...X"], color: 0x7c3aed }, // umbrella
  { m: ["...X", "..XX", ".XXX", ".XXX", ".XXX", ".XXX", ".XXX", "XXXX"], color: 0x4f46e5 }, // rocket
  { m: ["..XX", "XXXX", "XXXX", "XXXX", "..XX", "..XX", "..XX", ".X.X"], color: 0x94a3b8 }, // ghost
  { m: [".X..", "..XX", "..X.", "XXXX", "XXXX", "..X.", "..XX", ".X.."], color: 0xf59e0b }, // star
  { m: ["..XX", "XXXX", "XXXX", "..XX", "...X", "...X", "...X", "...."], color: 0xdc2626 }, // mushroom
  { m: ["X...", "X...", "XXXX", "XXXX", "XXXX", "XXXX", "...X", "...X"], color: 0x64748b }, // castle
  { m: ["...X", ".XXX", "XXXX", "XXXX", "XXXX", ".XXX", ".XXX", "..XX"], color: 0xef4444 }, // apple
];

/** The 4×8 mask for the RIGHT half — the exact mirror of the left half. */
function mirror(m: string[]): string[] {
  return m.map((row) => row.split("").reverse().join(""));
}

function same(a: string[], b: string[]): boolean {
  return a.every((row, i) => row === b[i]);
}

/**
 * Symmetry mirror (#203). A band-2 game completing the mirror half of pictures.
 * The left half of a picture is drawn next to a dashed fold line; four right
 * halves are offered and the kid taps the one that is the true mirror. On a
 * correct tap the whole symmetric picture snaps together and is spoken.
 */
export class SymmetryMirrorScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private design: Design = DESIGNS[0];
  private right: string[] = [];
  private cards: { c: Phaser.GameObjects.Container; correct: boolean; ring: Phaser.GameObjects.Graphics }[] = [];
  private pic!: Phaser.GameObjects.Container;
  private picG!: Phaser.GameObjects.Graphics;
  private revealG!: Phaser.GameObjects.Graphics;
  private foldG!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private geom = { cx: 0, picTop: 150, cell: 24 };

  constructor() {
    super("SymmetryMirror");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleSymmetry"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 360 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.pic = this.add.container(0, 0).setDepth(5);
    this.picG = this.add.graphics();
    this.revealG = this.add.graphics();
    this.foldG = this.add.graphics();
    this.pic.add([this.picG, this.revealG, this.foldG]);

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    const cell = Math.min((width * 0.7) / 8, (height * 0.3) / 8, 40);
    this.geom.cell = Math.max(16, Math.floor(cell));
    this.geom.cx = width / 2;
    this.geom.picTop = Math.max(148, Math.min(height * 0.24, height - 300));
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, this.geom.picTop - 28);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.tallyText.setPosition(width - 42, 100);
    if (this.cards.length) {
      const pos = this.cardPositions();
      this.cards.forEach((card, i) => {
        card.c.setPosition(pos[i % 2], pos[2 + Math.floor(i / 2)]);
      });
    }
    this.drawPicture();
    this.drawFold();
  }

  private startRound() {
    this.clearAll();
    this.locked = false;
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

  private askQuestion() {
    this.clearCards();
    this.locked = false;
    // pick a design, never the same picture twice in a row
    let idx = Phaser.Math.Between(0, DESIGNS.length - 1);
    if (DESIGNS.length > 1 && idx === this.lastDesignIdx) idx = (idx + 1) % DESIGNS.length;
    this.lastDesignIdx = idx;
    this.design = DESIGNS[idx];
    this.right = mirror(this.design.m);
    this.prompt.setText(t("syQ"));
    this.drawPicture();

    // options: the true mirror + 3 distinct wrong halves
    const wrongPool: string[][] = [];
    for (const d of DESIGNS) {
      if (d === this.design) continue;
      wrongPool.push(mirror(d.m));
    }
    wrongPool.push(this.design.m); // the classic "put the left half on the right" mistake
    const uniq = wrongPool.filter((w) => !same(w, this.right));
    Phaser.Utils.Array.Shuffle(uniq);
    const opts = [this.right, ...uniq.slice(0, 3)].sort(() => Math.random() - 0.5);

    const pos = this.cardPositions();
    opts.forEach((mask, i) => {
      const x = pos[i % 2];
      const y = pos[2 + Math.floor(i / 2)];
      const card = this.makeCard(x, y, mask);
      const isCorrect = same(mask, this.right);
      const entry = { ...card, correct: isCorrect };
      card.c.on("pointerdown", () => this.tap(entry, isCorrect));
      this.cards.push(entry);
    });
  }

  /** 2×2 grid of right-half cards, fit from the bottom of the screen up. */
  private cardPositions(): number[] {
    const { width, height } = this.scale;
    const gap = 14;
    const cardW = Math.max(100, Math.min(190, (width - 3 * gap) / 2));
    const cardH = 92;
    const startX = width / 2 - (cardW + gap) / 2;
    const bandTop = this.geom.picTop + this.geom.cell * 8 + 14;
    const bandBottom = height - 18 - SAB();
    const totalH = 2 * cardH + gap;
    const topY = Math.max(bandTop, bandBottom - totalH);
    const c0 = topY + cardH / 2;
    const c1 = c0 + cardH + gap;
    this.optGeom = { cardW, cardH, startX, c0, c1 };
    return [startX, startX + cardW + gap, c0, c1];
  }

  private optGeom = { cardW: 0, cardH: 0, startX: 0, c0: 0, c1: 0 };

  private makeCard(x: number, y: number, mask: string[]): { c: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Graphics } {
    const { cardW, cardH } = this.optGeom;
    const bg = this.add.graphics();
    bg.fillStyle(BTN_NEUTRAL.top, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    bg.fillStyle(BTN_NEUTRAL.bottom, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    // subtle bottom shade
    bg.fillStyle(0x93a3b8, 0.5);
    bg.fillRoundedRect(-cardW / 2, cardH / 2 - 8, cardW, 8, 4);

    const grid = this.add.graphics();
    const cell = Math.min((cardW - 20) / 4, (cardH - 16) / 8);
    const gx = -cardW / 2 + (cardW - cell * 4) / 2;
    const gy = -cardH / 2 + (cardH - cell * 8) / 2;
    this.drawHalf(grid, mask, cell, gx, gy, this.design.color, 1);

    const ring = this.add.graphics();
    const c = this.add.container(x, y, [bg, grid, ring]);
    c.setSize(cardW, cardH);
    c.setInteractive({ useHandCursor: true });
    return { c, ring };
  }

  /** Draw a 4×8 half mask as chunky pixel squares. */
  private drawHalf(g: Phaser.GameObjects.Graphics, mask: string[], cell: number, x: number, y: number, color: number, alpha: number) {
    for (let r = 0; r < mask.length; r++) {
      for (let c = 0; c < 4; c++) {
        if (mask[r][c] === "X") {
          g.fillStyle(color, alpha);
          g.fillRoundedRect(x + c * cell, y + r * cell, cell, cell, Math.max(1, cell * 0.12));
        }
      }
    }
  }

  private drawPicture() {
    const { cx, picTop, cell } = this.geom;
    this.picG.clear();
    if (this.design) {
      // left half (cols 0-3), solid
      this.drawHalf(this.picG, this.design.m, cell, cx - 4 * cell, picTop, this.design.color, 1);
      // faint full-width frame so the "blank mirror area" reads as an area
      this.picG.lineStyle(2, 0xffffff, 0.22);
      this.picG.strokeRoundedRect(cx - 4 * cell, picTop, 8 * cell, 8 * cell, 10);
    }
  }

  /** Dashed gold fold line down the mirror axis. */
  private drawFold() {
    const { cx, picTop, cell } = this.geom;
    this.foldG.clear();
    const y0 = picTop - 10;
    const y1 = picTop + 8 * cell + 10;
    this.foldG.lineStyle(3, 0xffd166, 0.9);
    for (let y = y0; y < y1; y += 10) {
      this.foldG.lineBetween(cx, y, cx, Math.min(y + 5, y1));
    }
  }

  private tap(card: { c: Phaser.GameObjects.Container; correct: boolean; ring: Phaser.GameObjects.Graphics }, isCorrect: boolean) {
    if (this.locked) return;
    if (isCorrect) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.correct++;
      this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
      this.floatMsg(t("syGreat"));
      speak(t("sySpeak"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.ring(card.ring, 0x4ade80);
      this.tweens.add({ targets: card.c, scale: 1.08, duration: 130, yoyo: true, ease: "Back.easeOut" });
      this.completePicture();
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    this.floatMsg(t("syHint"));
    this.tweens.add({ targets: card.c, x: card.c.x + 8, duration: 60, yoyo: true, repeat: 4, ease: "Sine.easeInOut" });
    card.c.setAlpha(0.4);
    card.c.disableInteractive();
    // reveal the true mirror faintly in the picture + green ring on the right card
    const rightCard = this.cards.find((k) => k.correct);
    if (rightCard) this.ring(rightCard.ring, 0x4ade80);
    this.revealG.clear();
    this.drawHalf(this.revealG, this.right, this.geom.cell, this.geom.cx, this.geom.picTop, this.design.color, 0.35);
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  /** Complete the picture: draw left + true right at full alpha with a pop. */
  private completePicture() {
    const { cx, picTop, cell } = this.geom;
    this.revealG.clear();
    this.drawHalf(this.revealG, this.right, cell, cx, picTop, this.design.color, 1);
    this.pic.setScale(0.9);
    this.tweens.add({ targets: this.pic, scale: 1, duration: 220, ease: "Back.easeOut" });
  }

  private ring(g: Phaser.GameObjects.Graphics, color: number) {
    const { cardW, cardH } = this.optGeom;
    g.clear();
    g.lineStyle(5, color, 0.95);
    g.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
  }

  private advance(ms: number) {
    this.answered++;
    if (this.answered < this.total) {
      this.qIndex++;
      this.time.delayedCall(1100, () => this.askQuestion());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(`${t("syDone")}  ${digit(this.correct)}/${digit(this.total)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.total, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.3, text, NV_GOLD, 28, -24);
  }

  private lastDesignIdx = -1;

  private clearCards() {
    this.cards.forEach((o) => o.c.destroy());
    this.cards = [];
  }

  private clearAll() {
    this.clearCards();
    this.picG.clear();
    this.revealG.clear();
    this.foldG.clear();
  }

  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
}


