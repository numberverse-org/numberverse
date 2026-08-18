import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak, speakMath } from "./speech";
import { prefersReducedMotion } from "./reducedMotion";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, BTN_PRIMARY, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { correctCelebrate } from "./celebrate";
import { SAB } from "./safeArea";
import { ensureAssets, assetIcon } from "./svgAssets";

const LEVELS = GAMES.find((g) => g.id === "game-fruittree")?.difficultyLevels ?? [5, 8, 11, 15, 20, 25];
const ROUNDS_TO_FINISH = 3;

/**
 * Fruit Tree — add apples onto a tree and WATCH it grow.
 * "a apples, add b more → how many?" Tap the total and the b new apples pop
 * onto the tree; with every correct round the tree grows bigger until it's a
 * full, heavy fruit tree. Growth is the reward.
 * Band 2 (ages 4–6). Difficulty = target sum (5 → 25).
 */
export class FruitTreeScene extends Phaser.Scene {
  private target = 0;
  private leftCount = 0;
  private rightCount = 0;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private tree!: Phaser.GameObjects.Container;
  private canopy!: Phaser.GameObjects.Graphics;
  private trunk!: Phaser.GameObjects.Graphics;
  private onCanopy!: Phaser.GameObjects.Graphics;
  private apples: Phaser.GameObjects.Container[] = [];
  private bag!: Phaser.GameObjects.Container;
  private answerButtons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("FruitTree");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    ensureAssets(this);
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleFruitTree"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("howManyApples"));
    this.buildTree();
    onSceneResize(this, () => {
      this.layout();
      this.reflow();
    });
    // #1577 — the +n bag's idle rock dies with the scene.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tweens.killTweensOf(this.bag));
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "floral");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 44);
    this.roundText.setPosition(width / 2, 82);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
    const cx = width / 2;
    const cy = this.playBounds.y + this.playBounds.h * 0.42;
    this.tree.setPosition(cx, cy);
    this.reflow();
  }

  private get playBounds() {
    const { width, height } = this.scale;
    return { x: 12, y: 122, w: Math.max(160, width - 24), h: Math.max(120, height - 122 - 240) };
  }

  private get answersY() {
    const { height } = this.scale;
    return height - 64 - SAB();
  }

  /** A simple, friendly tree: trunk + green canopy that GROWS with each round. */
  private buildTree() {
    this.tree = this.add.container(0, 0);
    this.trunk = this.add.graphics();
    this.canopy = this.add.graphics();
    this.onCanopy = this.add.graphics();
    this.tree.add([this.trunk, this.canopy, this.onCanopy]);
    this.tree.setScale(0.85); // starts small, grows as rounds are won
    // a small pot at the base grounds the tree and reads as "plant"
    const pot = this.add.graphics();
    pot.fillStyle(0x8b5a2b, 1);
    pot.fillRoundedRect(-34, 34, 68, 22, 8);
    this.tree.add(pot);
  }

  private drawTree(stage: number) {
    // stage 0..2 → the tree grows visibly across the 3 rounds of a level
    const k = 0.8 + stage * 0.18;
    const w = 120 * k;
    const h = 96 * k;
    const t = this.playBounds.y + this.playBounds.h * 0.42;
    this.trunk.clear();
    this.trunk.fillStyle(0x7c4a1e, 1);
    this.trunk.fillRoundedRect(-14 * k, 10, 28 * k, 58 * k, 10);
    this.canopy.clear();
    this.canopy.fillStyle(0x2e8b57, 1);
    this.canopy.fillCircle(0, -28 * k, w / 2);
    this.canopy.fillStyle(0x3ba76d, 1);
    this.canopy.fillCircle(-w / 6, -42 * k, w / 3);
    this.canopy.fillCircle(w / 6, -38 * k, w / 3.4);
    this.onCanopy.clear();
    this.onCanopy.lineStyle(4, 0xffd166, 0.9);
    this.onCanopy.strokeCircle(0, -28 * k, w / 2 + 4);
    void t;
  }

  private startRound() {
    this.clearRound();
    const level = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = level;
    this.data.set("nv:difficulty", level); // #1061 — reward engine sees round hardness
    this.leftCount = Phaser.Math.Between(1, Math.max(1, this.target - 1));
    this.rightCount = this.target - this.leftCount;
    this.startedAt = this.time.now;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.roundText.setText(`${t("round", { n: this.levelIndex + 1 })} · ${t("total", { n: this.target })}`);
    this.prompt.set(t("howManyApples"));
    speak(t("howManyApples"), { cancel: false });
    speakMath("add", this.leftCount, this.rightCount);
    this.drawTree(this.roundsDone);
    this.spawnApples(this.leftCount, this.apples, false);
    this.spawnBag(this.rightCount);
    this.spawnAnswers();
  }

  private spawnApples(count: number, into: Phaser.GameObjects.Container[], growIn: boolean) {
    const spots = this.canopySpots(count);
    for (const s of spots) {
      const a = assetIcon(this, "apple", 34);
      a.setPosition(s.x, s.y);
      this.tree.add(a);
      if (growIn) {
        a.setScale(0);
        this.tweens.add({ targets: a, scale: 1, duration: 180, ease: "Back.easeOut" });
      }
      into.push(a);
    }
  }

  private canopySpots(count: number): { x: number; y: number }[] {
    const k = 0.8 + this.roundsDone * 0.18;
    const R = 66 * k; // apple orbit radius (grows with the tree)
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2 + Phaser.Math.Between(-0.2, 0.2);
      const r = R * (0.45 + (i % 3) * 0.22);
      out.push({ x: Math.cos(ang) * r, y: -14 + Math.sin(ang) * r * 0.8 });
    }
    return out;
  }

  /** The "+ b" bag at the tree's feet — these apples fly onto the tree when correct. */
  private spawnBag(count: number) {
    this.bag = this.add.container(this.tree.x, this.tree.y + 74);
    const bx = -Math.min(110, 30 + count * 12);
    const pile = this.add.container(0, 0);
    for (let i = 0; i < count; i++) {
      const a = assetIcon(this, "apple", 26);
      a.setPosition(Phaser.Math.Between(-16, 16), Phaser.Math.Between(-14, 8));
      pile.add(a);
    }
    const label = this.add
      .text(bx, 0, `+${count}`, txt(30, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.bag.add([pile, label]);
    this.bobBag(this.bag);
  }

  private bobBag(bag: Phaser.GameObjects.Container) {
    // #1577 — reduced motion leaves the +n bag resting at its spot.
    if (prefersReducedMotion()) return;
    this.tweens.add({
      targets: bag,
      angle: Phaser.Math.Between(-3, 3),
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private spawnAnswers() {
    const opts = new Set<number>([this.target]);
    let delta = 1;
    while (opts.size < 3) {
      const cand = this.target + (delta % 2 === 1 ? -delta : delta);
      if (cand >= 0 && cand <= this.target + 4) opts.add(cand);
      delta++;
    }
    const values = [...opts].sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    const btnW = Math.min(112, (width - 60) / values.length);
    const spacing = btnW + 12;
    const startX = width / 2 - (spacing * (values.length - 1)) / 2;
    const y = this.answersY;
    values.forEach((value, i) => {
      const c = modernAnswerButton(this, startX + i * spacing, y, btnW / 2, String(value), BTN_PRIMARY, { labelSize: Math.round(btnW / 2.6) });
      c.on("pointerdown", () => this.answer(value, c));
      this.answerButtons.push({ sprite: c, value });
    });
  }

  private answer(value: number, container: Phaser.GameObjects.Container) {
    if (value !== this.target) {
      hintWrong(this, container, {
        hint: "Count ALL the apples — the tree and the bag together",
        hintBn: "সব আপেল একসাথে গুনো — গাছের আর ঝুড়ির মিলিয়ে",
        correct: () => this.target,
        options: () => this.answerButtons,
      });
      return;
    }
    pop();
    container.disableInteractive();
    this.answerButtons.forEach((a) => a.sprite.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    // THE GROWTH: the bag apples fly onto the tree, the tree swells, a ring pulses.
    this.growApplesOntoTree();
    correctCelebrate(this, this.tree.x, this.tree.y - 40);
    this.onRoundDone?.(value === this.target, ms, this.levelIndex + 1);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.time.delayedCall(850, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) {
        this.roundsDone = 0;
        this.levelIndex++;
      }
      this.startRound();
    });
  }

  private growApplesOntoTree() {
    this.bag?.destroy();
    const spots = this.canopySpots(this.target).slice(this.leftCount);
    spots.forEach((s, i) => {
      this.time.delayedCall(i * 70, () => {
        const a = assetIcon(this, "apple", 32);
        a.setPosition(s.x, s.y);
        a.setScale(0);
        this.tree.add(a);
        this.tweens.add({ targets: a, scale: 1, duration: 180, ease: "Back.easeOut" });
        this.apples.push(a);
        pop();
      });
    });
    // the whole tree swells + a golden ring confirms the growth
    this.tweens.add({ targets: this.tree, scaleX: 1.12, scaleY: 1.12, duration: 160, yoyo: true, ease: "Back.easeOut" });
    const ring = this.add.graphics().setDepth(5900);
    ring.lineStyle(5, 0xffd166, 0.9);
    ring.strokeCircle(0, -30, 74);
    ring.setPosition(this.tree.x, this.tree.y - 30);
    this.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
  }

  private clearRound() {
    this.apples.forEach((a) => a.destroy());
    this.apples = [];
    this.tweens.killTweensOf(this.bag);
    this.bag?.destroy();
    this.answerButtons.forEach((a) => a.sprite.destroy());
    this.answerButtons = [];
    this.tweens.killTweensOf(this.tree);
  }

  private reflow() {
    const b = this.playBounds;
    this.apples.forEach((a) => {
      a.x = Phaser.Math.Clamp(a.x, b.x - 80, b.x + b.w + 80);
      a.y = Phaser.Math.Clamp(a.y, b.y - 60, b.y + b.h + 60);
    });
    this.bag?.setPosition(this.tree.x, this.tree.y + 74);
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, this.randomColor());
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-70, 70),
        y: y + Phaser.Math.Between(-70, 70),
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
