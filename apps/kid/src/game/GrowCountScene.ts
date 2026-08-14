import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak, bnNumber } from "./speech";
import { getAppLang } from "./locale";
import { t } from "./i18n";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, BTN_PRIMARY, BTN_NEUTRAL, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { correctCelebrate } from "./celebrate";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-growcount")?.difficultyLevels ?? [3, 4, 5, 7, 9, 12];
const ROUNDS_TO_FINISH = 3;
/** The reward plant's stage emoji — it grows one step per correct round. */
const PLANT_EMOJI = ["🌱", "🌿", "🪴", "🌷"];
const SEED_RADIUS = 34;

/**
 * Plant & Count — tap seeds into the soil one by one; the reward plant in the
 * middle GROWS with every correct round (seed → sprout → pot → bloom). A
 * living, visible "you did it" for counting, so growth is the reward.
 * Band 1 (ages 2–4). Difficulty = how many seeds to plant.
 */
export class GrowCountScene extends Phaser.Scene {
  private target = 0;
  private planted = 0;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private seeds: { sprite: Phaser.GameObjects.Container; planted: boolean }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private counterText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private rewardPlant!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("GrowCount");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleGrowCount"), txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.counterText = this.add
      .text(0, 0, "", txt(22, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    // the living reward — grows one stage per correct round
    this.rewardPlant = this.add
      .text(0, 0, PLANT_EMOJI[0], txt(76, "#ffffff"))
      .setOrigin(0.5);
    onSceneResize(this, () => {
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
    this.roundText.setPosition(width / 2, 84);
    this.meter.setPosition(width / 2, 106);
    this.counterText.setPosition(width / 2, height - 118 - SAB());
    this.rewardPlant.setPosition(width / 2, this.playBounds.y + 52);
  }

  private get playBounds() {
    const { width, height } = this.scale;
    return {
      x: 14,
      y: 128,
      w: Math.max(160, width - 28),
      h: Math.max(140, height - 128 - 150),
    };
  }

  private startRound() {
    this.clearRound();
    this.target = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.data.set("nv:difficulty", this.target); // #1061 — reward engine sees round hardness
    this.planted = 0;
    this.startedAt = this.time.now;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.updateCounter();
    speak(
      getAppLang() === "bn"
        ? `${bnNumber(this.target)}টা বীজ বোনো`
        : `Plant ${this.target} seeds`
    );
    this.spawnSeeds();
  }

  private spawnSeeds() {
    const b = this.playBounds;
    // Seeds live in the soil strip BELOW the reward plant (which owns the top).
    const strip = { x: b.x, y: b.y + 100, w: b.w, h: Math.max(90, b.h - 100) };
    const total = this.target + 3; // a few spare so counting is a real search
    const placed: { x: number; y: number }[] = [];
    const minSpacing = SEED_RADIUS * 2 + 6;
    for (let i = 0; i < total; i++) {
      let done = false;
      for (let t = 0; t < 400; t++) {
        const px = strip.x + SEED_RADIUS + Math.random() * Math.max(1, strip.w - SEED_RADIUS * 2);
        const py = strip.y + SEED_RADIUS + Math.random() * Math.max(1, strip.h - SEED_RADIUS * 2);
        if (placed.every((p) => Phaser.Math.Distance.Between(p.x, p.y, px, py) > minSpacing)) {
          placed.push({ x: px, y: py });
          done = true;
          break;
        }
      }
      if (!done) break;
    }
    // grid fallback — guaranteed no overlap in tight bounds
    if (placed.length < total) {
      placed.length = 0;
      const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
      const rows = Math.ceil(total / cols);
      const p = Math.max(minSpacing, Math.min((strip.w - 8) / (cols > 1 ? cols - 1 : 1), (strip.h - 8) / (rows > 1 ? rows - 1 : 1)));
      for (let i = 0; i < total; i++) {
        placed.push({
          x: strip.x + 6 + (cols > 1 ? (i % cols) * p : 0),
          y: strip.y + 6 + (rows > 1 ? Math.floor(i / cols) * p : 0),
        });
      }
    }
    placed.forEach((p, i) => this.makeSeed(p.x, p.y));
  }

  private makeSeed(x: number, y: number) {
    const c = modernAnswerButton(this, x, y, SEED_RADIUS, "🌰", BTN_NEUTRAL, { labelSize: 30 });
    c.on("pointerdown", () => this.plantSeed(c));
    this.seeds.push({ sprite: c, planted: false });
    this.bob(c);
  }

  private plantSeed(container: Phaser.GameObjects.Container) {
    const seed = this.seeds.find((s) => s.sprite === container);
    if (!seed) return;
    if (seed.planted) {
      // warm nudge — that spot's taken, find a fresh one
      bad();
      this.tweens.add({
        targets: container,
        x: (container.x as number) - 5,
        duration: 60,
        yoyo: true,
        repeat: 2,
        ease: "Sine.easeInOut",
      });
      speak(getAppLang() === "bn" ? "এটা বোনা হয়ে গেছে — নতুনটা বাছো" : "Already planted — pick a fresh one");
      return;
    }
    seed.planted = true;
    pop();
    this.planted++;
    // the seed sprouts in place — visible, satisfying growth
    const sprout = this.add
      .text(container.x, container.y, "🌱", txt(34, "#ffffff"))
      .setOrigin(0.5);
    container.disableInteractive();
    container.setAlpha(0);
    this.tweens.add({ targets: sprout, scale: 1.6, duration: 160, yoyo: true, ease: "Back.easeOut" });
    speak(getAppLang() === "bn" ? bnNumber(this.planted) : String(this.planted), { cancel: false });
    this.updateCounter();
    if (this.planted >= this.target) {
      const ms = Math.max(1, this.time.now - this.startedAt);
      win();
      this.roundsDone++; // count first so the FIRST win already grows the plant
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      this.growReward();
      correctCelebrate(this, this.rewardPlant.x, this.rewardPlant.y + 10);
      this.onRoundDone?.(true, ms, this.target);
      this.time.delayedCall(700, () => {
        if (this.roundsDone >= ROUNDS_TO_FINISH) {
          this.roundsDone = 0;
          this.levelIndex++;
        }
        this.startRound();
      });
    }
  }

  /** The reward plant visibly grows after a correct round. */
  private growReward() {
    const stage = Math.min(PLANT_EMOJI.length - 1, this.roundsDone);
    this.rewardPlant.setText(PLANT_EMOJI[stage]);
    this.rewardPlant.setScale(0.6);
    this.tweens.add({ targets: this.rewardPlant, scale: 1, duration: 320, ease: "Back.easeOut" });
  }

  private updateCounter() {
    const bn = getAppLang() === "bn";
    this.counterText.setText(
      t("seedCount", {
        planted: bn ? bnNumber(this.planted) : this.planted,
        target: bn ? bnNumber(this.target) : this.target,
      })
    );
  }

  private bob(c: Phaser.GameObjects.Container) {
    this.tweens.add({
      targets: c,
      y: (c.y as number) + Phaser.Math.Between(-4, 4),
      duration: Phaser.Math.Between(1300, 2100),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private clearRound() {
    this.seeds.forEach((s) => s.sprite.destroy());
    this.seeds = [];
  }

  private reflow() {
    const b = this.playBounds;
    this.seeds.forEach((s) => {
      if (!s.sprite.active) return;
      s.sprite.x = Phaser.Math.Clamp(s.sprite.x, b.x + SEED_RADIUS, b.x + b.w - SEED_RADIUS);
      s.sprite.y = Phaser.Math.Clamp(s.sprite.y, b.y + 100 + SEED_RADIUS, b.y + b.h - SEED_RADIUS);
    });
  }
}
