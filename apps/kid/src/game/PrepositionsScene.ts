import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-prepositions")?.difficultyLevels ?? [0, 0, 0, 0, 0, 0];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const BOX_W = 150;
const BOX_H = 100;
/** The 8 prepositions taught by drag-to-place. */
const PREPS = ["in", "on", "under", "behind", "in front of", "next to", "above", "between"];
const OBJECTS = [
  { e: "🐱", name: "cat" },
  { e: "🐶", name: "dog" },
  { e: "🐦", name: "bird" },
  { e: "🐸", name: "frog" },
  { e: "🐭", name: "mouse" },
  { e: "🦆", name: "duck" },
  { e: "⚽", name: "ball" },
  { e: "⭐", name: "star" },
];

/**
 * Prepositions (in, on, under, behind …) (#180).
 * Band 2 grammar: a SPOKEN instruction ("Put the cat ON the box!") and the kid
 * DRAGS the object to the right spot. 8 prepositions, each a distinct drop zone
 * around the box — in (inside the crate outline), on (top edge), under (below),
 * behind (peeking from behind the solid box), in front of (over it), next to,
 * above, and between (between two boxes). Wrong drops snap back + re-speak.
 */
export class PrepositionsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private prep = "on";
  private obj!: { e: string; name: string };
  private objGo?: Phaser.GameObjects.Text;
  private tx = 0;
  private ty = 0;
  private radius = 45;
  private boxes: Phaser.GameObjects.Graphics[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("Prepositions");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "kitchen");
    this.titleText = this.add
      .text(0, 0, t("titlePreps"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.input.on("drag", (_p: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject, x: number, y: number) => {
      const obj = go as Phaser.GameObjects.Text;
      if (this.locked) return;
      obj.setPosition(x, y);
    });
    this.input.on("dragend", (_p: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject) => {
      const obj = go as Phaser.GameObjects.Text;
      if (this.locked) return;
      this.drop(obj);
    });
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
  }

  private drawBox(x: number, y: number, outline: boolean) {
    const g = this.add.graphics();
    g.setDepth(5);
    if (outline) {
      g.lineStyle(7, 0xc68b59, 1);
      g.strokeRoundedRect(x - BOX_W / 2, y - BOX_H / 2, BOX_W, BOX_H, 12);
    } else {
      g.fillStyle(0x8a5a3b, 1);
      g.fillRoundedRect(x - BOX_W / 2, y - BOX_H / 2, BOX_W, BOX_H, 12);
      g.lineStyle(4, 0x5d3a1f, 1);
      g.strokeRoundedRect(x - BOX_W / 2, y - BOX_H / 2, BOX_W, BOX_H, 12);
    }
    this.boxes.push(g);
  }

  private startRound() {
    this.destroyRound();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.destroyRound();
    this.locked = false;
    let prep = PREPS[Phaser.Math.Between(0, PREPS.length - 1)];
    if (prep === this.prep) prep = PREPS[(PREPS.indexOf(prep) + 1) % PREPS.length];
    this.prep = prep;
    this.obj = OBJECTS[Phaser.Math.Between(0, OBJECTS.length - 1)];
    const cx = this.scale.width / 2;
    const cy = this.scale.height * 0.42;
    const outline = prep === "in";
    // reference boxes: two for "between", one for everything else
    if (prep === "between") {
      this.drawBox(cx, cy, false);
      this.drawBox(cx - 130, cy, false);
      this.tx = cx - 65;
      this.ty = cy;
    } else {
      this.drawBox(cx, cy, outline);
      if (prep === "in") { this.tx = cx; this.ty = cy; }
      else if (prep === "on") { this.tx = cx; this.ty = cy - BOX_H / 2 - 30; }
      else if (prep === "under") { this.tx = cx; this.ty = cy + BOX_H / 2 + 30; }
      else if (prep === "behind") { this.tx = cx; this.ty = cy - BOX_H / 4; }
      else if (prep === "in front of") { this.tx = cx; this.ty = cy; }
      else if (prep === "next to") { this.tx = cx + BOX_W / 2 + 40; this.ty = cy; }
      else if (prep === "above") { this.tx = cx; this.ty = cy - BOX_H / 2 - 95; }
    }
    // the draggable object starts bottom-left, above the safe area
    this.objGo = this.add
      .text(this.scale.width * 0.18, this.scale.height * 0.8, this.obj.e, txt(56, "#ffffff", { outline: true }))
      .setOrigin(0.5)
      .setDepth(7);
    if (prep === "behind") this.objGo.setDepth(3);
    this.objGo.setInteractive();
    this.input.setDraggable(this.objGo);
    const sentence = `Put the ${this.obj.name} ${prep} ${prep === "between" ? "boxes" : "box"}!`;
    this.prompt.set(sentence);
    this.time.delayedCall(350, () => speak(sentence, { lang: "en" }));
  }

  private drop(obj: Phaser.GameObjects.Text) {
    const dist = Phaser.Math.Distance.Between(obj.x, obj.y, this.tx, this.ty);
    if (dist <= this.radius) {
      this.locked = true;
      pop();
      win();
      obj.disableInteractive();
      this.tweens.add({ targets: obj, x: this.tx, y: this.ty, scale: 1.15, duration: 160, ease: "Back.easeOut", onComplete: () => this.tweens.add({ targets: obj, scale: 1, duration: 140 }) });
      const sentence = `The ${this.obj.name} is ${this.prep} ${this.prep === "between" ? "the boxes" : "the box"}!`;
      this.time.delayedCall(300, () => speak(sentence, { lang: "en" }));
      this.floatMsg(t("ppGreat"));
      this.qInRound++;
      this.time.delayedCall(1100, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    bad();
    this.tweens.add({ targets: obj, x: this.scale.width * 0.18, y: this.scale.height * 0.8, duration: 180, ease: "Back.easeOut" });
    const sentence = `Put the ${this.obj.name} ${this.prep} ${this.prep === "between" ? "boxes" : "box"}!`;
    this.time.delayedCall(450, () => speak(sentence, { lang: "en" }));
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("ppDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.3, text, txt(28, "#ffd166", { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private destroyRound() {
    this.boxes.forEach((b) => b.destroy());
    this.boxes = [];
    if (this.objGo) {
      this.input.setDraggable(this.objGo, false);
      this.objGo.destroy();
      this.objGo = undefined;
    }
  }
}
