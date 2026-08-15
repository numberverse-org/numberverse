import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-watercycle")?.difficultyLevels ?? [3, 4, 4, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;

interface Stage {
  id: string; // Water | Vapor | Cloud | Rain
  emoji: string;
}

/** The 4 steps of the water cycle, in the order the kid must tap. */
const STAGES: Stage[] = [
  { id: "Water", emoji: "💧" },
  { id: "Vapor", emoji: "♨️" },
  { id: "Cloud", emoji: "☁️" },
  { id: "Rain", emoji: "🌧️" },
];

/** Static i18n keys so the audit scanner sees every literal. */
const NAME_KEY: Record<string, string> = {
  Water: "wcWater", Vapor: "wcVapor", Cloud: "wcCloud", Rain: "wcRain",
};

/** Descriptive spoken line for each completed step. */
const STEP_SPEAK: Record<string, string> = {
  Water: "wcWaterSpeak", Vapor: "wcVaporSpeak", Cloud: "wcCloudSpeak", Rain: "wcRainSpeak",
};

/**
 * Water cycle (#209). A band-2 science game ordering the four steps of the
 * water cycle — water collects in the pond → the sun turns it to vapor → vapor
 * rises into a cloud → the cloud rains back down. The kid taps the shuffled
 * step cards in the right order; each correct tap animates the cartoon scene
 * (pond sparkle, rising steam, cloud growing in, raindrops) and lights the
 * step on the timeline. Lvl 1 sequences water→vapor→cloud, lvl 2+ adds rain.
 */
export class WaterCycleScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private stages: Stage[] = [];
  private placed = 0;
  private wrongs = 0;
  private busy = false;
  private cards: { c: Phaser.GameObjects.Container; stage: Stage; done: boolean }[] = [];
  private timeline: { key: string; t: Phaser.GameObjects.Text }[] = [];
  private particles: Phaser.GameObjects.Text[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private pondG!: Phaser.GameObjects.Graphics;
  private sunG!: Phaser.GameObjects.Graphics;
  private cloudG!: Phaser.GameObjects.Graphics;
  private geom = { sunX: 0, sunY: 0, cloudX: 0, cloudY: 0, pondX: 0, pondY: 0 };
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;

  constructor() {
    super("WaterCycle");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleCycle"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);

    this.pondG = this.add.graphics();
    this.sunG = this.add.graphics();
    this.cloudG = this.add.graphics().setAlpha(0);

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.tallyText.setPosition(width - 42, 100);
    this.prompt.setPosition(width / 2, height * 0.8);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.geom = {
      sunX: Math.max(width * 0.8, width - 60),
      sunY: 185,
      cloudX: width / 2,
      cloudY: 195,
      pondX: width / 2,
      pondY: height * 0.66,
    };
    this.drawSun();
    this.drawPond();
    this.drawCloud();
    if (this.timeline.length) this.positionTimeline();
    if (this.cards.length) this.positionCards();
  }

  private startRound() {
    this.clearRound();
    const count = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.stages = STAGES.slice(0, Math.max(2, count));
    this.placed = 0;
    this.wrongs = 0;
    this.busy = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.placed)}/${digit(this.stages.length)}`);
    this.buildTimeline();
    this.spawnCards();
    this.resetScene();
    this.showQuestion();
  }

  private buildTimeline() {
    this.timeline.forEach((e) => e.t.destroy());
    this.timeline = [];
    const { width } = this.scale;
    const n = this.stages.length;
    const gap = 46;
    const startX = width / 2 - (gap * (n - 1)) / 2;
    this.stages.forEach((st, i) => {
      const tx = this.add
        .text(startX + i * gap, 130, st.emoji, txt(26, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setAlpha(0.22);
      this.timeline.push({ key: st.id, t: tx });
    });
  }

  private positionTimeline() {
    const { width } = this.scale;
    const n = this.stages.length;
    const gap = 46;
    const startX = width / 2 - (gap * (n - 1)) / 2;
    this.timeline.forEach((e, i) => e.t.setPosition(startX + i * gap, 130));
  }

  private spawnCards() {
    this.clearCards();
    const shuffled = [...this.stages].sort(() => Math.random() - 0.5);
    const { width, height } = this.scale;
    const n = shuffled.length;
    const r = Math.max(26, Math.min(34, (width - 8 - (n - 1) * 10) / (2 * n)));
    const spacing = r * 2 + 10;
    const startX = width / 2 - (spacing * (n - 1)) / 2;
    const y = height - 70 - SAB();
    shuffled.forEach((st, i) => {
      const c = this.add.container(startX + i * spacing, y);
      const g = this.add.graphics();
      g.fillStyle(0x0284c7, 1);
      g.fillCircle(0, 0, r);
      g.fillStyle(0x38bdf8, 1);
      g.fillCircle(0, -r * 0.18, r * 0.96);
      c.add(g);
      const emoji = this.add.text(0, 0, st.emoji, txt(r * 1.05, "#ffffff", { shadow: false })).setOrigin(0.5);
      c.add(emoji);
      c.setSize(r * 2, r * 2);
      c.setInteractive({ useHandCursor: true });
      const entry = { c, stage: st, done: false };
      c.on("pointerdown", () => this.tap(entry, st));
      this.cards.push(entry);
    });
  }

  private positionCards() {
    const { width, height } = this.scale;
    const n = this.cards.length;
    const r = Math.max(26, Math.min(34, (width - 8 - (n - 1) * 10) / (2 * n)));
    const spacing = r * 2 + 10;
    const startX = width / 2 - (spacing * (n - 1)) / 2;
    const y = height - 70 - SAB();
    this.cards.forEach((card, i) => card.c.setPosition(startX + i * spacing, y));
  }

  /** Hide the cloud + clear leftover particles for a fresh cartoon. */
  private resetScene() {
    this.cloudG.setAlpha(0);
    this.cloudG.setScale(1);
    this.clearParticles();
  }

  private showQuestion() {
    const expected = this.stages[this.placed];
    this.prompt.setText(t("wcQ", { step: t(NAME_KEY[expected.id]) }));
    speak(t("wcSpeak", { step: t(NAME_KEY[expected.id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private tap(card: { c: Phaser.GameObjects.Container; stage: Stage; done: boolean }, stage: Stage) {
    if (this.busy) return;
    const expected = this.stages[this.placed];
    if (stage.id !== expected.id) {
      this.wrongs++;
      bad();
      this.floatMsg(t("wcQ", { step: t(NAME_KEY[expected.id]) }), 0xf87171);
      this.tweens.add({ targets: card.c, x: card.c.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
      return;
    }
    this.busy = true;
    this.placed++;
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    card.done = true;
    card.c.disableInteractive();
    this.tweens.add({ targets: card.c, scale: 1.15, duration: 140, yoyo: true, ease: "Back.easeOut" });
    this.tallyText.setText(`${digit(this.placed)}/${digit(this.stages.length)}`);
    const tl = this.timeline.find((e) => e.key === stage.id);
    if (tl) tl.t.setAlpha(1);
    this.floatMsg(t("wcGreat"), 0x4ade80);
    speak(t(STEP_SPEAK[stage.id]), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.showStep(stage);
    this.time.delayedCall(600, () => {
      this.busy = false;
      if (this.placed < this.stages.length) this.showQuestion();
      else this.finishRound();
    });
  }

  /** Animate the cartoon scene for the completed step. */
  private showStep(stage: Stage) {
    switch (stage.id) {
      case "Water": this.sparklePond(); break;
      case "Vapor": this.riseSteam(); break;
      case "Cloud": this.growCloud(); break;
      case "Rain": this.fallRain(); break;
    }
  }

  private sparklePond() {
    const { pondX, pondY } = this.geom;
    for (let i = 0; i < 5; i++) {
      const s = this.spawnParticle("✨", pondX + (i - 2) * 26 + (i % 2 === 0 ? 6 : -6), pondY - 6 + (i % 3) * 8, 20);
      this.tweens.add({ targets: s, y: s.y - 26, alpha: 0, duration: 700 + i * 60, ease: "Sine.easeOut" });
    }
  }

  private riseSteam() {
    const { pondX, pondY, cloudX, cloudY } = this.geom;
    for (let i = 0; i < 4; i++) {
      const s = this.spawnParticle("💨", pondX + (i - 1.5) * 22, pondY - 20, 30);
      s.setAlpha(0.9);
      this.tweens.add({
        targets: s,
        y: cloudY + 20,
        x: cloudX + (i - 1.5) * 18,
        alpha: 0,
        duration: 850 + i * 90,
        ease: "Sine.easeOut",
      });
    }
  }

  private growCloud() {
    this.cloudG.setAlpha(1);
    this.cloudG.setScale(0.25);
    this.tweens.add({ targets: this.cloudG, scale: 1, duration: 480, ease: "Back.easeOut" });
  }

  private fallRain() {
    const { cloudX, cloudY, pondX, pondY } = this.geom;
    for (let i = 0; i < 14; i++) {
      const d = this.spawnParticle("💧", cloudX + (i - 6.5) * 9, cloudY + 14, 18);
      this.tweens.add({
        targets: d,
        y: pondY - 10,
        x: pondX + (i - 6.5) * 12 + (i % 2 === 0 ? 8 : -8),
        duration: 700 + (i % 4) * 90,
        delay: (i % 5) * 60,
        ease: "Sine.easeIn",
      });
    }
  }

  /** A short-lived cartoon particle; destroyed on round reset if still tweening. */
  private spawnParticle(emoji: string, x: number, y: number, size: number): Phaser.GameObjects.Text {
    const p = this.add.text(x, y, emoji, txt(size, "#ffffff", {})).setOrigin(0.5).setDepth(12);
    this.particles.push(p);
    return p;
  }

  private clearParticles() {
    this.particles.forEach((p) => p.destroy());
    this.particles = [];
  }

  /** Big smiling sun with rays, up in the corner of the sky. */
  private drawSun() {
    const { sunX, sunY } = this.geom;
    this.sunG.clear();
    const r = 30;
    this.sunG.fillStyle(0xffd166, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      this.sunG.fillTriangle(
        sunX + Math.cos(a - 0.16) * (r + 7), sunY + Math.sin(a - 0.16) * (r + 7),
        sunX + Math.cos(a + 0.16) * (r + 7), sunY + Math.sin(a + 0.16) * (r + 7),
        sunX + Math.cos(a) * (r + 22), sunY + Math.sin(a) * (r + 22)
      );
    }
    this.sunG.fillStyle(0xfbbf24, 1);
    this.sunG.fillCircle(sunX, sunY, r);
    this.sunG.fillStyle(0x9a3412, 1);
    this.sunG.fillCircle(sunX - 9, sunY - 4, 2.6);
    this.sunG.fillCircle(sunX + 9, sunY - 4, 2.6);
    this.sunG.lineStyle(2.4, 0x9a3412, 1);
    this.sunG.beginPath();
    this.sunG.arc(sunX, sunY + 6, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    this.sunG.strokePath();
  }

  /** Grassy bank + blue pond at the bottom of the cartoon scene. */
  private drawPond() {
    const { pondX, pondY } = this.geom;
    this.pondG.clear();
    this.pondG.fillStyle(0x4ade80, 1);
    this.pondG.fillEllipse(pondX, pondY + 16, 300, 46);
    this.pondG.fillStyle(0x22c55e, 1);
    this.pondG.fillEllipse(pondX, pondY + 20, 260, 34);
    this.pondG.fillStyle(0x38bdf8, 1);
    this.pondG.fillEllipse(pondX, pondY, 230, 58);
    this.pondG.fillStyle(0x7dd3fc, 0.8);
    this.pondG.fillEllipse(pondX - 22, pondY - 10, 130, 26);
    // little reeds on the banks
    this.pondG.fillStyle(0x16a34a, 1);
    this.pondG.fillTriangle(pondX - 118, pondY + 6, pondX - 112, pondY + 6, pondX - 115, pondY - 22);
    this.pondG.fillTriangle(pondX + 112, pondY + 6, pondX + 118, pondY + 6, pondX + 115, pondY - 22);
  }

  /** Puffy white cloud drawn once; revealed by the cloud step. */
  private drawCloud() {
    const { cloudX, cloudY } = this.geom;
    this.cloudG.clear();
    this.cloudG.fillStyle(0xffffff, 0.95);
    this.cloudG.fillCircle(cloudX - 34, cloudY + 8, 26);
    this.cloudG.fillCircle(cloudX, cloudY - 2, 34);
    this.cloudG.fillCircle(cloudX + 34, cloudY + 8, 26);
    this.cloudG.fillCircle(cloudX, cloudY + 14, 22);
    this.cloudG.fillStyle(0xdbeafe, 0.6);
    this.cloudG.fillCircle(cloudX - 34, cloudY + 10, 18);
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("wcDone")}  ${digit(this.placed)}/${digit(this.stages.length)}`, 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongs === 0, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.34, text, `#${color.toString(16).padStart(6, "0")}`, 26, -24);
  }

  private clearCards() {
    this.cards.forEach((o) => o.c.destroy());
    this.cards = [];
  }

  private clearRound() {
    this.clearCards();
    this.clearParticles();
    this.timeline.forEach((e) => e.t.destroy());
    this.timeline = [];
  }
}


