import Phaser from "phaser";
import { t } from "./i18n";
import { frameText } from "./framing";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { bnNumber, enNumber, speak, speakAnswer, speakMath } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";
import { ensureAssets, assetIcon } from "./svgAssets";

const LEVELS = GAMES.find((g) => g.id === "game-fruitadd-10")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
/** Per-skill ladders are passed in scene data (one game per skill scope — add/sub within 10
 *  and within 20 each have their own game id); this constant is only the standalone fallback. */
/** Skill seed for framing rotation — the scene covers add+sub across bands, so
 *  the mode drives which skill's phrasing rotates. */
const FRAME_SEED = (mode: "add" | "sub") => (mode === "add" ? "add-within-10" : "sub-within-10");
/** SVG fruit set — crisp on every device, identical across phones. */
const FRUIT = ["apple", "banana", "grapes", "strawberry", "orange"];
const FRUIT_RADIUS = 44;
const ROUNDS_TO_FINISH = 3;

/**
 * Fruit Addition / Subtraction — see fruit in a BASKET, tap the total.
 * Band 2 (ages 4–6). Mobile-first, fat tap targets, zero text walls.
 * Difficulty = target sum (5 → 20).
 *
 * CONCEPT-TEACHING FIRST: when `teach: true` (first exposure to + or −), the
 * very first round is a narrated "basket math" demo — apples DROP into the
 * basket one-by-one (add) or FLY OUT (sub) while the voice counts them, with a
 * big + / − symbol shown. Only after the kid answers that demo question do the
 * real drills begin. This is what makes "+" and "−" a MEANINGFUL action
 * (putting together / taking away), not abstract symbols.
 */
export class FruitAddScene extends Phaser.Scene {
  private leftCount = 0;
  private rightCount = 0;
  private target = 0;
  private levelIndex = 0;
  private levels = LEVELS;
  private roundsDone = 0;
  private startedAt = 0;
  private mode: "add" | "sub" = "add";
  private minusText: Phaser.GameObjects.Text | null = null;
  private symbolText: Phaser.GameObjects.Text | null = null;
  private leftGroup: Phaser.GameObjects.Container[] = [];
  private rightGroup: Phaser.GameObjects.Container[] = [];
  private answerButtons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;
  // Basket Math — teach round + basket visuals for every round.
  private basket!: Phaser.GameObjects.Graphics;
  private basketZone: { x: number; y: number; w: number; h: number } | null = null;
  private teachMode = false;
  private taught = false;
  private teaching = false;

  constructor() {
    super("FruitAdd");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; mode?: "add" | "sub"; teach?: boolean; levels?: number[] }) {
    this.onRoundDone = data.onRoundDone;
    this.mode = data.mode ?? "add";
    this.levelIndex = data.startLevelIndex ?? 0;
    if (data.levels?.length) this.levels = data.levels;
    this.teachMode = !!data.teach;
    this.taught = false;
    this.teaching = false;
    ensureAssets(this);
    this.background = this.add.graphics();
    this.drawBackground();
    this.basket = this.add.graphics();
    this.titleText = this.add
      .text(0, 0, t("titleFruitAdd"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, "#ffd166", {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    // The QUESTION is the big thing — 34px, warm, impossible to miss.
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(frameText("howManyFruit", FRAME_SEED(this.mode), 0));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layout();
      this.reflow();
    });
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "forest");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 44);
    this.roundText.setPosition(width / 2, 82);
    this.meter.setPosition(width / 2, 104);
    // Question floats high (above the basket) and BIG — the kid sees it first.
    this.prompt.setPosition(width / 2, Math.max(150, height * 0.30));
  }

  private get playBounds() {
    const { width, height } = this.scale;
    // Fruit area ends well above the prompt + answer row so nothing overlaps
    return { x: 12, y: 122, w: Math.max(140, width - 24), h: Math.max(100, height - 280) };
  }

  private get answersY() {
    const { height } = this.scale;
    return height - 64 - SAB();
  }

  private startRound() {
    this.clearRound();
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    this.startedAt = this.time.now;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    // FIRST exposure to + or − → run the narrated Basket Math demo round.
    if (this.teachMode && !this.taught) {
      this.startTeach(level);
      return;
    }
    this.drawBasket();
    if (this.mode === "sub") {
      // "total − taken = ?" — fruit in the basket, a big −n symbol, tap the
      // difference. The per-skill ladder already caps the total to the skill's
      // scope (within-10 → ≤10, within-20 → ≤20) so the fruit stay countable.
      this.leftCount = level;
      this.rightCount = Phaser.Math.Between(1, Math.max(1, this.leftCount - 1));
      this.target = this.leftCount - this.rightCount;
      this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
      this.prompt.set(`${this.leftCount} − ${this.rightCount} = ?`);
      // (equation is pure numbers — nothing to translate)
      speakMath("sub", this.leftCount, this.rightCount, { concrete: true });
      this.basketFruit(this.leftGroup, this.leftCount);
      this.showMinusChip(this.rightCount);
    } else {
      // split target into two non-zero groups → BOTH live in the basket, so the
      // kid SEES them put together.
      this.target = level;
      this.leftCount = Phaser.Math.Between(1, Math.max(1, this.target - 1));
      this.rightCount = this.target - this.leftCount;
      this.roundText.setText(`${t("round", { n: this.levelIndex + 1 })} · ${t("total", { n: this.target })}`);
      this.prompt.set(frameText("howManyFruit", FRAME_SEED(this.mode), this.levelIndex));
      speakMath("add", this.leftCount, this.rightCount, { concrete: true });
      this.basketFruit(this.leftGroup, this.leftCount);
      this.basketFruit(this.rightGroup, this.rightCount, true);
      this.showPlusChip(this.leftCount, this.rightCount);
    }
    this.spawnAnswers();
  }

  /** Draw the wicker basket (bottom-center of the play area). Every round uses
   *  it — the basket IS the mental model for "put together" (add) and "take
   *  away" (sub). */
  private drawBasket() {
    const b = this.playBounds;
    const w = Math.min(b.w - 24, 320);
    const h = 120;
    const x = this.scale.width / 2 - w / 2;
    const y = b.y + b.h - h; // basket bottom sits at the bottom of the play area
    this.basketZone = { x, y, w, h };
    const g = this.basket;
    g.clear();
    // body + inner shade
    g.fillStyle(0xb5651d, 1);
    g.fillRoundedRect(x, y + 12, w, h - 12, 12);
    g.fillStyle(0x9a4d12, 1);
    g.fillRoundedRect(x + 10, y + 16, w - 20, h - 20, 10);
    // weave lines
    g.lineStyle(2, 0x7a3b12, 0.7);
    for (let i = 1; i <= 4; i++) {
      const yy = y + 16 + (i * (h - 24)) / 5;
      g.lineBetween(x + 8, yy, x + w - 8, yy);
    }
    // rim (lighter)
    g.fillStyle(0xd98e2b, 1);
    g.fillRoundedRect(x - 6, y, w + 12, 16, 8);
    g.fillStyle(0x8b4513, 1);
    g.fillRoundedRect(x + 3, y + 5, w - 6, 7, 3);
  }

  /** Place `count` fruit in a tidy grid INSIDE the basket. `rightGroup` (the
   *  "+ more" set in add mode) gets a slightly different row so two groups are
   *  countable side-by-side. */
  private basketFruit(group: Phaser.GameObjects.Container[], count: number, rightSide = false) {
    const z = this.basketZone;
    if (!z) return;
    const iconSize = count > 8 ? 42 : 52;
    const cols = Math.max(2, Math.min(4, Math.ceil(count / 2)));
    const rows = Math.ceil(count / cols);
    const spacingX = Math.min(60, (z.w - 26) / cols);
    const spacingY = Math.min(52, (z.h - 40) / rows);
    const startX = z.x + z.w / 2 - ((cols - 1) * spacingX) / 2 + (rightSide ? spacingX * 0.25 : -spacingX * 0.25);
    const startY = z.y + 24 + ((rows - 1) * spacingY) / 2;
    for (let i = 0; i < count; i++) {
      const c = this.add.container(startX + (i % cols) * spacingX, startY + Math.floor(i / cols) * spacingY);
      c.add(assetIcon(this, "apple", iconSize));
      group.push(c);
    }
  }

  /** Big −n chip floating above the basket — "take n away". */
  private showMinusChip(count: number) {
    const z = this.basketZone;
    if (!z) return;
    this.minusText = this.add
      .text(z.x + z.w / 2, z.y - 34, `−${count}`, txt(72, "#ff6b6b", {bold: true, outline: true}))
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: this.minusText,
      y: z.y - 40,
      duration: Phaser.Math.Between(1200, 2200),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** Big +n chip above the basket for add mode. */
  private showPlusChip(a: number, b: number) {
    const z = this.basketZone;
    if (!z) return;
    this.symbolText = this.add
      .text(z.x + z.w / 2, z.y - 34, `+${b}`, txt(60, "#4ade80", {bold: true, outline: true}))
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: this.symbolText,
      y: z.y - 40,
      duration: Phaser.Math.Between(1200, 2200),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    void a;
  }

  /** ── THE CONCEPT-TEACHING ROUND ─────────────────────────────────────
   *  The kid's very first taste of + or −: apples DROP INTO the basket
   *  one-by-one (add) or FLY OUT (sub), the big symbol appears, the voice
   *  counts every apple — THEN the question is asked. Seeing the operation
   *  happen (put-together / take-away) is what makes the symbol meaningful. */
  private startTeach(level: number) {
    this.teaching = true;
    this.taught = true; // once per session — drills follow immediately
    this.drawBasket();
    const bn = getAppLang() === "bn";
    // gentle demo numbers (small, countable)
    if (this.mode === "sub") {
      this.leftCount = Math.min(level, 6);
      this.rightCount = Phaser.Math.Between(1, Math.min(2, this.leftCount - 1));
      this.target = this.leftCount - this.rightCount;
    } else {
      this.leftCount = Phaser.Math.Between(2, Math.min(3, level));
      this.rightCount = Phaser.Math.Between(1, Math.min(2, level - this.leftCount));
      this.target = this.leftCount + this.rightCount;
    }
    this.roundText.setText(t("letsLearn"));
    this.prompt.set(this.mode === "sub" ? t("watchGoAway") : t("watchGoIn"));

    const z = this.basketZone!;
    const cols = Math.max(2, Math.min(4, Math.ceil(this.leftCount / 2)));
    const rows = Math.ceil(this.leftCount / cols);
    const spacingX = Math.min(60, (z.w - 26) / cols);
    const spacingY = Math.min(52, (z.h - 40) / rows);
    const startX = z.x + z.w / 2 - ((cols - 1) * spacingX) / 2;
    const startY = z.y + 24 + ((rows - 1) * spacingY) / 2;
    const drop = (x: number, y: number, group: Phaser.GameObjects.Container[]) => {
      const c = this.add.container(x, y - 90).setAlpha(0);
      c.add(assetIcon(this, "apple", 52));
      group.push(c);
      this.tweens.add({ targets: c, y, alpha: 1, duration: 380, ease: "Bounce.easeOut" });
    };

    if (this.mode === "sub") {
      speak(t("thereAreWatch", { n: bn ? bnNumber(this.leftCount) : enNumber(this.leftCount) }));
      let ms = 1200;
      for (let i = 0; i < this.leftCount; i++) {
        const n = i + 1;
        const x = startX + (i % cols) * spacingX;
        const y = startY + Math.floor(i / cols) * spacingY;
        this.time.delayedCall(ms, () => {
          drop(x, y, this.leftGroup);
          speak(bn ? bnNumber(n) : enNumber(n), { cancel: false });
        });
        ms += 700;
      }
      // show the −n, then the last n apples fly out of the basket
      this.time.delayedCall(ms + 200, () => {
        this.showMinusChip(this.rightCount);
        speak(t("takeAway", { n: bn ? bnNumber(this.rightCount) : enNumber(this.rightCount) }));
      });
      const leaveIdx = this.leftCount - this.rightCount;
      this.time.delayedCall(ms + 900, () => {
        for (let i = 0; i < this.rightCount; i++) {
          const c = this.leftGroup[leaveIdx + i];
          if (!c) continue;
          this.time.delayedCall(i * 500, () => {
            this.tweens.add({ targets: c, y: c.y + 140, alpha: 0, duration: 600, ease: "Quad.easeIn" });
            speak(bn ? bnNumber(this.rightCount - i) : enNumber(this.rightCount - i), { cancel: false });
          });
        }
        this.time.delayedCall(this.rightCount * 500 + 350, () => {
          // the flown-out apples are gone — recount what's left
          const alive = this.leftGroup.filter(Boolean).slice(0, leaveIdx);
          this.leftGroup.splice(0, this.leftGroup.length, ...alive);
          this.prompt.set(`${this.leftCount} − ${this.rightCount} = ?`);
          speakMath("sub", this.leftCount, this.rightCount, { concrete: true });
          this.spawnAnswers();
        });
      });
    } else {
      speak(t("putInBasket"));
      let ms = 1200;
      for (let i = 0; i < this.leftCount; i++) {
        const n = i + 1;
        const x = startX + (i % cols) * spacingX;
        const y = startY + Math.floor(i / cols) * spacingY;
        this.time.delayedCall(ms, () => {
          drop(x, y, this.leftGroup);
          speak(bn ? bnNumber(n) : enNumber(n), { cancel: false });
        });
        ms += 700;
      }
      // +b chip, then the second group drops in
      this.time.delayedCall(ms + 200, () => {
        this.showPlusChip(this.leftCount, this.rightCount);
        speak(t("plusMore", { n: bn ? bnNumber(this.rightCount) : enNumber(this.rightCount) }));
      });
      const rc = Math.max(1, this.rightCount);
      const cols2 = Math.max(2, Math.min(4, Math.ceil(rc / 2)));
      const rows2 = Math.ceil(rc / cols2);
      const spacingX2 = Math.min(60, (z.w - 26) / cols2);
      const spacingY2 = Math.min(52, (z.h - 40) / rows2);
      const startX2 = z.x + z.w / 2 - ((cols2 - 1) * spacingX2) / 2;
      const startY2 = z.y + 24 + ((rows2 - 1) * spacingY2) / 2 + 6;
      let t2 = ms + 800;
      for (let i = 0; i < rc; i++) {
        const n = this.leftCount + i + 1;
        const x = startX2 + (i % cols2) * spacingX2;
        const y = startY2 + Math.floor(i / cols2) * spacingY2;
        this.time.delayedCall(t2, () => {
          drop(x, y, this.rightGroup);
          speak(bn ? bnNumber(n) : enNumber(n), { cancel: false });
        });
        t2 += 700;
      }
      this.time.delayedCall(t2 + 200, () => {
        this.prompt.set(frameText("howManyInAll", FRAME_SEED(this.mode), this.levelIndex));
        speakMath("add", this.leftCount, this.rightCount, { concrete: true });
        this.spawnAnswers();
      });
    }
  }

  private clearRound() {
    [...this.leftGroup, ...this.rightGroup, ...this.answerButtons.map((a) => a.sprite)].forEach((s) => s?.destroy());
    this.minusText?.destroy();
    this.minusText = null;
    this.symbolText?.destroy();
    this.symbolText = null;
    this.leftGroup = [];
    this.rightGroup = [];
    this.answerButtons = [];
    this.basket.clear();
  }

  private spawnAnswers() {
    // answer options: target, target±1, target-2 (all ≥ 0, distinct)
    const opts = new Set<number>([this.target]);
    let delta = 1;
    while (opts.size < 3) {
      const cand = this.target + (delta % 2 === 1 ? -delta : delta);
      if (cand >= 0 && cand <= this.target + 4) opts.add(cand);
      delta++;
    }
    const values = [...opts].sort(() => Math.random() - 0.5);
    const b = this.playBounds;
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
        // sub-mode hint was WRONG before ("count ALL") — in subtraction the kid
        // must count what's LEFT after the −n, not everything.
        hint:
          this.mode === "sub"
            ? () => t("countLeft", { n: enNumber(this.rightCount) })
            : () => t("countAll"),
        hintBn:
          this.mode === "sub"
            ? () => t("countLeft", { n: bnNumber(this.rightCount) })
            : () => t("countAll"),
        correct: () => this.target,
        options: () => this.answerButtons,
      });
      return;
    }
    pop();
    correctButton(container);
    this.answerButtons.forEach((a) => a.sprite.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.target);
    if (this.teaching) {
      // ── Teach round done → celebrate the equation, then REAL drills ──
      this.teaching = false;
      const bn = getAppLang() === "bn";
      const eq = this.mode === "add"
        ? `${this.leftCount} + ${this.rightCount} = ${this.target}`
        : `${this.leftCount} − ${this.rightCount} = ${this.target}`;
      this.prompt.set(eq);
      const n = (v: number) => (bn ? bnNumber(v) : enNumber(v));
      speak(
        this.mode === "add"
          ? t("plusEquals", { x: n(this.leftCount), y: n(this.rightCount), z: n(this.target) })
          : t("minusEquals", { x: n(this.leftCount), y: n(this.rightCount), z: n(this.target) })
      );
      this.time.delayedCall(2000, () => {
        if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
        this.levelIndex = 0; // drills start at the gentle level
        this.startRound();
      });
      return;
    }
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) {
        this.roundsDone = 0;
        this.levelIndex = 0;
        // reset to round 1 of next level each play session
      }
      this.levelIndex++;
      this.startRound();
    });
  }

  private bob(c: Phaser.GameObjects.Container) {
    this.tweens.add({
      targets: c,
      y: c.y + Phaser.Math.Between(-6, 6),
      duration: Phaser.Math.Between(1200, 2200),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
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

  private reflow() {
    // keep everything on-screen after rotate/resize (fruit no longer sit in fixed halves)
    const b = this.playBounds;
    [...this.leftGroup, ...this.rightGroup].forEach((c) => {
      c.x = Phaser.Math.Clamp(c.x, b.x + 16, b.x + b.w - 16);
      c.y = Phaser.Math.Clamp(c.y, b.y + 16, b.y + b.h - 16);
    });
  }
}
