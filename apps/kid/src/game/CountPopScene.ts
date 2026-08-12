import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak, bnNumber } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi } from "./ui";
import { correctCelebrate } from "./celebrate";
import { SAB } from "./safeArea";
import { enableDragToPop } from "./gestures";
import { frameText } from "./framing";

const LEVELS = GAMES.find((g) => g.id === "game-countpop")?.difficultyLevels ?? [3, 4, 5, 7, 10, 12];
/** The skill this scene teaches — used for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-countpop")?.skillId ?? "count-1-10";
/** Per-skill levels are passed in scene data (App resolves the skill's game);
 *  this constant is only the fallback when launched standalone. */
/** Big, thumb-friendly bubble diameter (mobile-first: ≥ 88px visual). */
const BUBBLE_RADIUS = 46;

interface Bubble {
  sprite: Phaser.GameObjects.Container;
  value: number;
}

/**
 * Count & Pop — tap the numbers 1 → N in order.
 * Mobile-first: fills the screen (Scale.RESIZE), fat touch targets,
 * re-lays out on resize, zero text walls (huge numerals).
 */
export class CountPopScene extends Phaser.Scene {
  private bubbles: Bubble[] = [];
  private nextExpected = 1;
  private levelIndex = 0;
  private levels = LEVELS;
  private roundCount = 0;
  private startedAt = 0;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private instruction!: QuestionPanelApi;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("CountPop");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[] }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    if (data.levels?.length) this.levels = data.levels;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleCountPop"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, "#ffd166", {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
        this.instruction = questionPanel(this, 0, 0, { tail: "none" });
    this.instruction.set(t("tapNumbersOrder"));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layout();
      this.reflowBubbles();
    });
    this.layout();
    this.startRound();

    // KID GESTURE — sweep-to-pop: a toddler drags their finger across the
    // bubbles and the NEXT-EXPECTED one bursts (wrong bubbles never punish a
    // sweep — they just don't pop). Bubbles float, so we opt out of the
    // swipe-to-answer layer and use drag-to-pop instead.
    this.data.set("nv:noSwipe", true);
    enableDragToPop(this, (x, y) => {
      const wanted = this.nextExpected;
      for (const b of this.bubbles) {
        if (b.value !== wanted || !b.sprite.active || !b.sprite.visible) continue;
        if (Phaser.Math.Distance.Between(x, y, b.sprite.x, b.sprite.y) < BUBBLE_RADIUS + 8) {
          this.pop(b.sprite, b.value);
          return; // one pop per sweep tick
        }
      }
    });
  }

  private drawBackground() {
    gameBackground(this, "ocean");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 46);
    this.roundText.setPosition(width / 2, 86);
    this.meter.setPosition(width / 2, 108);
    this.instruction.setPosition(width / 2, height - 38 - SAB());
  }

  private get playBounds() {
    const { width, height } = this.scale;
    return {
      x: 10,
      y: 120,
      w: Math.max(140, width - 20),
      h: Math.max(140, height - 120 - 72),
    };
  }

  private get roundTarget(): number {
    const l = this.levels;
    return l[Math.min(this.levelIndex, l.length - 1)];
  }

  private startRound() {
    this.nextExpected = 1;
    this.roundCount = 0;
    this.startedAt = this.time.now;
    this.bubbles.forEach((b) => b.sprite.destroy());
    this.bubbles = [];
    this.roundText.setText(frameText("roundTap", SKILL_ID, this.levelIndex, { n: this.levelIndex + 1, count: this.roundTarget }));
    this.meter.set(this.roundCount, this.roundTarget);
    speak(getAppLang() === "bn"
      ? `এক থেকে ${bnNumber(this.roundTarget)} পর্যন্ত ক্রমানুসারে সংখ্যাগুলো ফুটাও`
      : `Pop the numbers in order, from one to ${this.roundTarget}`);
    this.spawnBubbles();
  }

  private spawnBubbles() {
    const b = this.playBounds;
    const target = this.roundTarget;
    const R = BUBBLE_RADIUS;
    const minSpacing = 2 * R + 4; // centers can never be closer than the diameter + breathing room
    const placed: { x: number; y: number }[] = [];
    // Start comfy, then relax the spacing until EVERY bubble fits. The old fixed
    // spacing (min(w,h)/2.6) was too big for 7–10 bubbles on narrow/wide phones →
    // the placement loop gave up and dumped overlapping bubbles at the last point.
    let spacing = Math.max(104, Math.min(b.w, b.h) / 2.2);
    while (spacing > minSpacing) {
      placed.length = 0;
      let allPlaced = true;
      for (let v = 1; v <= target; v++) {
        let done = false;
        for (let i = 0; i < 500; i++) {
          const px = b.x + R + Math.random() * (b.w - R * 2);
          const py = b.y + R + Math.random() * (b.h - R * 2);
          if (placed.every((p) => Phaser.Math.Distance.Between(p.x, p.y, px, py) > spacing)) {
            placed.push({ x: px, y: py });
            done = true;
            break;
          }
        }
        if (!done) {
          allPlaced = false;
          break;
        }
      }
      if (allPlaced) break;
      spacing -= 6;
    }
    // Deterministic grid fallback — guaranteed non-overlap even in tight bounds.
    if (placed.length < target) {
      placed.length = 0;
      const cols = Math.max(1, Math.ceil(Math.sqrt(target)));
      const rows = Math.ceil(target / cols);
      const p = Math.max(
        minSpacing,
        Math.min(
          (b.w - R * 2) / (cols > 1 ? cols - 1 : 1),
          (b.h - R * 2) / (rows > 1 ? rows - 1 : 1)
        )
      );
      for (let i = 0; i < target; i++) {
        placed.push({
          x: b.x + R + (cols > 1 ? (i % cols) * p : 0),
          y: b.y + R + (rows > 1 ? Math.floor(i / cols) * p : 0),
        });
      }
    }
    placed.forEach((p, i) => this.makeBubble(i + 1, p.x, p.y));
  }

  /** On resize keep popped progress — just clamp surviving bubbles into the new bounds. */
  private reflowBubbles() {
    const b = this.playBounds;
    for (const bb of this.bubbles) {
      const s = bb.sprite;
      s.x = Phaser.Math.Clamp(s.x, b.x + BUBBLE_RADIUS, b.x + b.w - BUBBLE_RADIUS);
      s.y = Phaser.Math.Clamp(s.y, b.y + BUBBLE_RADIUS, b.y + b.h - BUBBLE_RADIUS);
      this.tweens.killTweensOf(s);
      this.bob(s);
    }
  }

  private makeBubble(value: number, x: number, y: number) {
    const c = modernAnswerButton(this, x, y, BUBBLE_RADIUS, String(value), BTN_PRIMARY, { labelSize: BUBBLE_RADIUS + 2 });
    c.on("pointerdown", () => this.pop(c, value));
    this.bubbles.push({ sprite: c, value });
    this.bob(c);
  }

  private bob(c: Phaser.GameObjects.Container) {
    this.tweens.add({
      targets: c,
      y: c.y + Phaser.Math.Between(-10, 10),
      duration: Phaser.Math.Between(1400, 2400),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private pop(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.nextExpected) {
      hintWrong(this, container, {
        hint: () => `Pop the numbers in order — what comes right after ${this.nextExpected - 1}?`,
        hintBn: () => `${this.nextExpected - 1} এর ঠিক পরে কোন সংখ্যাটা আসবে? ক্রমানুসারে ফুটাও`,
        correct: () => this.nextExpected,
        options: () => this.bubbles.map((b) => ({ sprite: b.sprite, value: b.value })),
        // every bubble is a future correct answer → wrong taps shake + RECOVER,
        // never stay crossed or disabled.
        keepOnWrong: true,
      });
      return;
    }
    pop();
    this.nextExpected++;
    speak(getAppLang() === "bn" ? bnNumber(value) : String(value), { cancel: false });
    this.roundCount++;
    this.meter.set(this.roundCount, this.roundTarget);
    const [bx, by] = [container.x, container.y];
    this.bubbles = this.bubbles.filter((b) => b.sprite !== container);
    container.disableInteractive();
    this.tweens.add({
      targets: container,
      scaleX: 0.15,
      scaleY: 0.15,
      alpha: 0,
      duration: 160,
      onComplete: () => container.destroy(),
    });
    this.sparkle(bx, by);
    correctCelebrate(this, bx, by);
    if (this.roundCount >= this.roundTarget) {
      const ms = Math.max(1, this.time.now - this.startedAt);
      win();
      this.onRoundDone?.(true, ms, this.roundTarget);
      this.levelIndex++;
      this.time.delayedCall(700, () => this.startRound());
    }
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
