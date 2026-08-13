import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-solidmatch")?.difficultyLevels ?? [4, 5, 6, 8, 8, 10];
const ROUNDS_TO_FINISH = 3;

type SolidKind = "cube" | "cuboid" | "cylinder" | "sphere" | "cone" | "pyramid";
type FaceKind = "square" | "rect" | "circle" | "triangle";

/** The four pairings the kid must learn (square→cube etc.). */
const FACE_OF: Record<SolidKind, FaceKind> = {
  cube: "square",
  cuboid: "rect",
  cylinder: "circle",
  pyramid: "triangle",
  sphere: "circle",
  cone: "circle",
};

const SOLID_NAMES: SolidKind[] = ["cube", "cuboid", "cylinder", "sphere", "cone", "pyramid"];
const FACES: FaceKind[] = ["square", "rect", "circle", "triangle"];

/** Static keys so the audit scanner sees the i18n literals (template calls aren't statically matched). */
const SOLID_NAMES_STR: Record<SolidKind, string> = {
  cube: "solidCube",
  cuboid: "solidCuboid",
  cylinder: "solidCylinder",
  sphere: "solidSphere",
  cone: "solidCone",
  pyramid: "solidPyramid",
};
const FACE_NAMES_STR: Record<FaceKind, string> = {
  square: "faceSquare",
  rect: "faceRect",
  circle: "faceCircle",
  triangle: "faceTriangle",
};

/**
 * Flat faces & solids (#202).
 * Band 2/3: match 2D faces to 3D solids on rotating previews.
 *  · SOLID→FACE (even): a big rotating solid (cube/cuboid/cylinder/pyramid);
 *    tap the flat shape that is one of its faces.
 *  · FACE→SOLID (odd): a big flat face stamp; tap the solid that has it. All six
 *    solids appear as options (sphere + cone are the "wrong" solids for these
 *    four faces — they have no square/rect/triangle face).
 * The 6 solids are drawn in pseudo-3D and spin gently on a turntable.
 */
export class SolidMatchScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private dirA = true; // solid → face
  private targetSolid: SolidKind = "cube";
  private targetFace: FaceKind = "square";
  private cards: { sprite: Phaser.GameObjects.Container; val: string; correct: boolean }[] = [];
  private previews: Phaser.GameObjects.Container[] = [];
  private spins: Phaser.Tweens.Tween[] = [];
  private big!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;

  constructor() {
    super("SolidMatch");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleSolid"), txt(34, "#ffffff", { bold: true }))
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
    this.big = this.add.container(0, 0).setDepth(5);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.15);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.tallyText.setPosition(width / 2, height * 0.58);
    this.big.setPosition(width / 2, height * 0.4);
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
    this.clearAll();
    this.locked = false;
    this.dirA = this.qIndex % 2 === 0;
    if (this.dirA) {
      const targets: SolidKind[] = ["cube", "cuboid", "cylinder", "pyramid"];
      this.targetSolid = targets[Phaser.Math.Between(0, targets.length - 1)];
      this.targetFace = FACE_OF[this.targetSolid];
      this.prompt.setText(t("sfQ", { solid: t(SOLID_NAMES_STR[this.targetSolid]) }));
      this.showBigSolid(this.targetSolid, 40);
      // options: the 4 flat faces
      const opts = FACES.map((f) => f).sort(() => Math.random() - 0.5);
      const gl = gridLayout(this, {
        cols: 2, rows: 2, preferredW: 180, minW: 104, widthPad: 16,
        topPad: this.scale.height * 0.62, bottomY: this.scale.height - 24 - SAB(), cardH: 78,
      });
      opts.forEach((f, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const btn = this.faceCard(gl.startX + col * gl.spacingX, gl.cy + row * gl.spacingY, gl.cardW, 78, f);
        const isCorrect = f === this.targetFace;
        btn.on("pointerdown", () => this.tap(btn, t(FACE_NAMES_STR[f]), isCorrect));
        this.cards.push({ sprite: btn, val: t(FACE_NAMES_STR[f]), correct: isCorrect });
      });
    } else {
      this.targetFace = FACES[Phaser.Math.Between(0, FACES.length - 1)];
      this.targetSolid = (SOLID_NAMES.find((s) => FACE_OF[s] === this.targetFace) ?? "cube") as SolidKind;
      this.prompt.setText(t("sfFace"));
      this.showBigFace(this.targetFace, 40);
      // options: the correct solid + 3 random others (all six possible)
      const pool = SOLID_NAMES.filter((s) => s !== this.targetSolid);
      pool.sort(() => Math.random() - 0.5);
      const opts = [this.targetSolid, pool[0], pool[1], pool[2]].sort(() => Math.random() - 0.5);
      const gl = gridLayout(this, {
        cols: 2, rows: 2, preferredW: 180, minW: 104, widthPad: 16,
        topPad: this.scale.height * 0.62, bottomY: this.scale.height - 24 - SAB(), cardH: 78,
      });
      opts.forEach((s, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const btn = this.solidCard(gl.startX + col * gl.spacingX, gl.cy + row * gl.spacingY, gl.cardW, 78, s);
        const isCorrect = s === this.targetSolid;
        btn.on("pointerdown", () => this.tap(btn, t(SOLID_NAMES_STR[s]), isCorrect));
        this.cards.push({ sprite: btn, val: t(SOLID_NAMES_STR[s]), correct: isCorrect });
      });
    }
  }

  private showBigSolid(kind: SolidKind, s: number) {
    this.big.removeAll(true);
    const g = this.add.graphics();
    this.drawSolid(g, kind, s);
    this.big.add(g);
    this.spin(this.big);
  }

  private showBigFace(face: FaceKind, s: number) {
    this.big.removeAll(true);
    const g = this.add.graphics();
    this.drawFace(g, face, s);
    this.big.add(g);
  }

  /** A 2×2 card with a drawn face + label. */
  private faceCard(x: number, y: number, w: number, h: number, face: FaceKind): Phaser.GameObjects.Container {
    const btn = modernCardButton(this, x, y, w, h, t(FACE_NAMES_STR[face]), BTN_NEUTRAL, 20);
    const g = this.add.graphics();
    this.drawFace(g, face, Math.min(w * 0.28, 24));
    g.setPosition(0, -16);
    btn.add(g);
    return btn;
  }

  /** A 2×2 card with a small spinning solid. */
  private solidCard(x: number, y: number, w: number, h: number, kind: SolidKind): Phaser.GameObjects.Container {
    const btn = modernCardButton(this, x, y, w, h, t(SOLID_NAMES_STR[kind]), BTN_NEUTRAL, 18);
    const g = this.add.graphics();
    this.drawSolid(g, kind, Math.min(w * 0.16, 22));
    const sol = this.add.container(0, -14, [g]).setDepth(6);
    btn.add(sol);
    this.spin(sol);
    return btn;
  }

  /** Fake-3D turntable: scaleX oscillates 1 → -1 so the solid appears to spin. */
  private spin(target: Phaser.GameObjects.Container) {
    const tw = this.tweens.addCounter({
      from: 0,
      to: 360,
      duration: 5200,
      repeat: -1,
      onUpdate: (tween) => {
        const v = tween.getValue() ?? 0;
        const c = Math.cos((v * Math.PI) / 180);
        target.setScale(Math.abs(c) < 0.12 ? 0.12 : c, 1);
      },
    });
    this.spins.push(tw);
  }

  private tap(tile: Phaser.GameObjects.Container, val: string, isCorrect: boolean) {
    if (this.locked) return;
    if (isCorrect) {
      this.locked = true;
      pop();
      win();
      this.correct++;
      const solidName = t(SOLID_NAMES_STR[this.targetSolid]);
      const faceName = t(FACE_NAMES_STR[this.targetFace]);
      this.floatMsg(t("sfGreat"));
      speak(t("sfSpeak", { solid: solidName, face: faceName }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.tweens.add({ targets: tile, scale: 1.1, duration: 140, yoyo: true, ease: "Back.easeOut" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () =>
      this.dirA ? t(FACE_NAMES_STR[this.targetFace]) : t(SOLID_NAMES_STR[this.targetSolid])
    );
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  private advance(ms: number) {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.qIndex++;
      this.time.delayedCall(1000, () => this.askQuestion());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(`${t("sfDone")}  ${digit(this.correct)}/${digit(this.total)}`);
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
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, text, txt(28, NV_GOLD, { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearAll() {
    this.cards.forEach((o) => o.sprite.destroy());
    this.cards = [];
    this.previews.forEach((p) => p.destroy());
    this.previews = [];
    this.spins.forEach((s) => s.remove());
    this.spins = [];
    this.big.removeAll(true);
  }

  /* ── pseudo-3D solid drawing (each centred, ~2.2s wide × ~2s tall) ── */

  private drawSolid(g: Phaser.GameObjects.Graphics, kind: SolidKind, s: number) {
    switch (kind) {
      case "cube":
        this.drawBox(g, s, s, s * 0.5, 0x2ec4b6, 0x6ee7de, 0x179d8f);
        break;
      case "cuboid":
        this.drawBox(g, s * 1.3, s * 0.85, s * 0.45, 0xf97316, 0xfdba74, 0xc2410c);
        break;
      case "cylinder":
        this.drawCylinder(g, s * 0.5, s * 1.2, 0x8b5cf6, 0xc4b5fd, 0x6d28d9);
        break;
      case "sphere":
        this.drawSphere(g, s * 0.62, 0x60a5fa, 0xbfdbfe, 0x1d4ed8);
        break;
      case "cone":
        this.drawCone(g, s * 0.55, s * 1.35, 0x22c55e, 0x86efac, 0x15803d);
        break;
      case "pyramid":
        this.drawPyramid(g, s * 0.95, s * 1.1, s * 0.4, 0xf43f5e, 0xfb7185, 0xe11d48);
        break;
    }
  }

  private drawBox(g: Phaser.GameObjects.Graphics, w: number, h: number, d: number, front: number, top: number, left: number) {
    const F0 = { x: -w / 2, y: -h / 2 };
    const F1 = { x: w / 2, y: -h / 2 };
    const F2 = { x: w / 2, y: h / 2 };
    const F3 = { x: -w / 2, y: h / 2 };
    const B0 = { x: -w / 2 + d, y: -h / 2 - d * 0.5 };
    const B1 = { x: w / 2 + d, y: -h / 2 - d * 0.5 };
    const B2 = { x: w / 2 + d, y: h / 2 - d * 0.5 };
    const B3 = { x: -w / 2 + d, y: h / 2 - d * 0.5 };
    g.fillStyle(top, 1);
    g.fillPoints([F0, F1, B1, B0], true);
    g.fillStyle(left, 1);
    g.fillPoints([F0, F3, B3, B0], true);
    g.fillStyle(front, 1);
    g.fillPoints([F0, F1, F2, F3], true);
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokePoints([F0, F1, B1, B0], true);
    g.strokePoints([F0, F3, B3, B0], true);
    g.strokePoints([F0, F1, F2, F3], true);
  }

  private drawCylinder(g: Phaser.GameObjects.Graphics, rx: number, h: number, body: number, topC: number, base: number) {
    const topY = -h / 2;
    const botY = h / 2;
    const ry = rx * 0.55;
    g.fillStyle(base, 1);
    g.fillEllipse(0, botY, rx * 2, ry * 2);
    g.fillStyle(body, 1);
    g.fillRect(-rx, topY, rx * 2, h);
    g.fillStyle(body, 1);
    g.fillRect(-rx, botY - ry, rx * 2, ry);
    g.fillStyle(topC, 1);
    g.fillEllipse(0, topY, rx * 2, ry * 2);
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokeEllipse(0, topY, rx * 2, ry * 2);
    g.lineStyle(2, 0xffffff, 0.35);
    g.lineBetween(-rx, topY, -rx, botY);
    g.lineBetween(rx, topY, rx, botY);
  }

  private drawSphere(g: Phaser.GameObjects.Graphics, r: number, main: number, hi: number, sh: number) {
    g.fillStyle(main, 1);
    g.fillCircle(0, 0, r);
    g.fillStyle(sh, 0.5);
    g.fillEllipse(0, r * 0.35, r * 1.8, r * 0.8);
    g.fillStyle(hi, 0.9);
    g.fillEllipse(-r * 0.35, -r * 0.42, r * 0.7, r * 0.45);
    g.lineStyle(2, 0xffffff, 0.8);
    g.strokeCircle(0, 0, r);
  }

  private drawCone(g: Phaser.GameObjects.Graphics, rx: number, h: number, body: number, baseC: number, rim: number) {
    const apexY = -h / 2;
    const baseY = h / 2;
    const ry = rx * 0.5;
    g.fillStyle(baseC, 1);
    g.fillEllipse(0, baseY, rx * 2, ry * 2);
    g.fillStyle(body, 1);
    g.fillTriangle(0, apexY, -rx, baseY, rx, baseY);
    g.fillStyle(baseC, 1);
    g.fillEllipse(0, baseY, rx * 2, ry * 2);
    g.fillStyle(body, 1);
    g.fillRect(-rx, baseY - ry, rx * 2, ry);
    g.lineStyle(2, 0xffffff, 0.7);
    g.lineBetween(0, apexY, -rx, baseY);
    g.lineBetween(0, apexY, rx, baseY);
    g.strokeEllipse(0, baseY, rx * 2, ry * 2);
    void rim;
  }

  private drawPyramid(g: Phaser.GameObjects.Graphics, w: number, h: number, d: number, faceA: number, faceB: number, baseC: number) {
    const apex = { x: 0, y: -h / 2 };
    const bFront = { x: 0, y: h / 2 };
    const bLeft = { x: -w / 2, y: h / 2 - d * 0.5 };
    const bRight = { x: w / 2, y: h / 2 - d * 0.5 };
    const bBack = { x: 0, y: h / 2 - d * 1.1 };
    g.fillStyle(baseC, 1);
    g.fillPoints([bFront, bLeft, bBack, bRight], true);
    g.fillStyle(faceA, 1);
    g.fillTriangle(apex.x, apex.y, bLeft.x, bLeft.y, bFront.x, bFront.y);
    g.fillStyle(faceB, 1);
    g.fillTriangle(apex.x, apex.y, bFront.x, bFront.y, bRight.x, bRight.y);
    g.lineStyle(2, 0xffffff, 0.7);
    g.lineBetween(apex.x, apex.y, bLeft.x, bLeft.y);
    g.lineBetween(apex.x, apex.y, bRight.x, bRight.y);
    g.lineBetween(apex.x, apex.y, bFront.x, bFront.y);
    g.lineBetween(bLeft.x, bLeft.y, bBack.x, bBack.y);
    g.lineBetween(bRight.x, bRight.y, bBack.x, bBack.y);
  }

  /* ── 2D flat-face stamps ── */

  private drawFace(g: Phaser.GameObjects.Graphics, face: FaceKind, s: number) {
    g.fillStyle(0xfbbf24, 1);
    g.lineStyle(3, 0xffffff, 0.9);
    switch (face) {
      case "square":
        g.fillRect(-s / 2, -s / 2, s, s);
        g.strokeRect(-s / 2, -s / 2, s, s);
        break;
      case "rect":
        g.fillRect(-s * 0.7, -s * 0.4, s * 1.4, s * 0.8);
        g.strokeRect(-s * 0.7, -s * 0.4, s * 1.4, s * 0.8);
        break;
      case "circle":
        g.fillCircle(0, 0, s * 0.55);
        g.strokeCircle(0, 0, s * 0.55);
        break;
      case "triangle":
        g.fillTriangle(0, -s * 0.6, -s * 0.6, s * 0.5, s * 0.6, s * 0.5);
        g.lineBetween(0, -s * 0.6, -s * 0.6, s * 0.5);
        g.lineBetween(-s * 0.6, s * 0.5, s * 0.6, s * 0.5);
        g.lineBetween(s * 0.6, s * 0.5, 0, -s * 0.6);
        break;
    }
  }
}

function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

const BN_D = "০১২৩৪৫৬৭৮৯";

/** Wrong-answer feedback without hintWrong's "keep on wrong" retirement. */
function hintWrongLocal(scene: Phaser.Scene, tile: Phaser.GameObjects.Container, correct: () => string) {
  scene.tweens.add({ targets: tile, scale: 0.9, duration: 90, yoyo: true, ease: "Sine.easeInOut" });
  tile.setAlpha(0.4);
  tile.disableInteractive();
  const m = scene.add
    .text(tile.x, tile.y - 40, correct(), txt(20, NV_GREEN, { bold: true, outline: true }))
    .setOrigin(0.5)
    .setDepth(40);
  scene.tweens.add({ targets: m, y: m.y - 20, alpha: 0, duration: 700, onComplete: () => m.destroy() });
}
