import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-shadows")?.difficultyLevels ?? [4, 4, 5, 5, 6, 6];
const ROUNDS_TO_FINISH = 3;

type Light = "lfl" | "nll" | "nrl" | "lfr";   // far-left-low, near-left-high, near-right-high, far-right-low
type Spot = "fl" | "nl" | "nr" | "fr";

/** Shadow is opposite the light; low light → long (far) shadow, high → short. */
const SHADOW_OF: Record<Light, Spot> = { lfl: "fr", nll: "nr", nrl: "nl", lfr: "fl" };
const LIGHT_EMOJI: Record<Light, string> = { lfl: "🌇", nll: "☀️", nrl: "☀️", lfr: "🌅" };
const OBJECTS = ["🌳", "🧸", "🏰", "⛺"];

/**
 * Light & shadows (#207). A band-2/3 science game predicting where a shadow
 * falls. A light source sits at one of four places and the kid taps the shadow
 * spot on the ground (predict), then the real shadow reveals there (check).
 * Moving the light moves the shadow — low light makes a long far shadow, high
 * light a short near one. Lvl 1–2 use only the two high lights.
 */
export class ShadowGuessScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private locked = false;
  private light: Light = "nll";
  private shadowSpot: Spot = "nr";
  private object = "🌳";
  private spots: { spot: Spot; x: number; y: number; zone: Phaser.GameObjects.Container }[] = [];
  private shadows: { spot: Spot; g: Phaser.GameObjects.Graphics }[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private geom = { w: 0, groundY: 0, objX: 0, objY: 0, light: {} as Record<Light, { x: number; y: number }>, spotX: {} as Record<Spot, number>, spotY: 0 };
  private lightG!: Phaser.GameObjects.Graphics;
  private beamG!: Phaser.GameObjects.Graphics;
  private groundG!: Phaser.GameObjects.Graphics;
  private lightEmoji!: Phaser.GameObjects.Text;
  private objEmoji!: Phaser.GameObjects.Text;

  constructor() {
    super("ShadowGuess");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleShadows"), txt(34, "#ffffff", { bold: true }))
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
    this.lightG = this.add.graphics();
    this.beamG = this.add.graphics();
    this.groundG = this.add.graphics();
    this.lightEmoji = this.add.text(0, 0, "", txt(40, "#ffffff", { shadow: false })).setOrigin(0.5).setDepth(8);
    this.objEmoji = this.add.text(0, 0, "", txt(70, "#ffffff", { shadow: false })).setOrigin(0.5).setDepth(6);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.geom.w = w;
    this.geom.groundY = h * 0.72;
    this.geom.objX = w / 2;
    this.geom.objY = this.geom.groundY - 34;
    const hy = this.geom.groundY - h * 0.4;
    const ly = this.geom.groundY - h * 0.24;
    this.geom.light = {
      lfl: { x: w * 0.18, y: ly },
      nll: { x: w * 0.36, y: hy },
      nrl: { x: w * 0.64, y: hy },
      lfr: { x: w * 0.82, y: ly },
    };
    this.geom.spotX = { fl: w * 0.18, nl: w * 0.36, nr: w * 0.64, fr: w * 0.82 };
    this.geom.spotY = this.geom.groundY + 10;
    this.titleText.setPosition(w / 2, 40);
    this.roundText.setPosition(w / 2, 76);
    this.meter.setPosition(w / 2, 100);
    this.tallyText.setPosition(w - 42, 100);
    this.prompt.setPosition(w / 2, h * 0.13);
    this.prompt.setWordWrapWidth(Math.max(200, w - 60));
    this.drawGround();
    this.drawLight();
    if (this.spots.length) this.positionSpots();
    if (this.objEmoji.text) this.positionScene();
  }

  private positionScene() {
    this.objEmoji.setPosition(this.geom.objX, this.geom.objY);
  }

  private drawGround() {
    // ground band + contact line
    this.groundG.clear();
    this.groundG.fillStyle(0x0b3b6d, 1);
    this.groundG.fillRect(0, this.geom.groundY, this.geom.w, 14);
    this.groundG.lineStyle(3, 0xbfdbfe, 0.6);
    this.groundG.lineBetween(0, this.geom.groundY + 14, this.geom.w, this.geom.groundY + 14);
  }

  private drawLight() {
    const p = this.geom.light[this.light];
    this.lightG.clear();
    this.lightG.fillStyle(0xffd166, 0.5);
    this.lightG.fillCircle(p.x, p.y, 30);
    this.lightG.fillStyle(0xfff3c4, 0.35);
    this.lightG.fillCircle(p.x, p.y, 44);
    this.lightEmoji.setText(LIGHT_EMOJI[this.light]);
    this.lightEmoji.setPosition(p.x, p.y);
  }

  private startRound() {
    this.clearAll();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearQuestion();
    this.locked = false;
    this.object = OBJECTS[Phaser.Math.Between(0, OBJECTS.length - 1)];
    const lights: Light[] = this.levelIndex < 2 ? ["nll", "nrl"] : ["lfl", "nll", "nrl", "lfr"];
    this.light = lights[Phaser.Math.Between(0, lights.length - 1)];
    this.shadowSpot = SHADOW_OF[this.light];
    this.prompt.setText(t("lshQ"));
    speak(
      getAppLang() === "bn" ? "ছায়া কোথায় পড়বে?" : "Where will the shadow be?",
      { lang: getAppLang() === "bn" ? "bn" : "en" }
    );
    this.objEmoji.setText(this.object);
    this.positionScene();
    this.drawLight();
    this.spawnSpots();
  }

  private spawnSpots() {
    const { w } = this.geom;
    const r = Math.min(40, Math.max(30, (w * 0.64) / 8));
    (["fl", "nl", "nr", "fr"] as Spot[]).forEach((spot) => {
      const x = this.geom.spotX[spot];
      const y = this.geom.spotY;
      const ring = this.add.graphics();
      ring.lineStyle(3, 0xbfdbfe, 0.7);
      ring.strokeEllipse(0, 0, r * 1.6, r * 0.55);
      ring.lineStyle(2, 0xffffff, 0.3);
      ring.strokeEllipse(0, 0, r * 1.6, r * 0.55);
      const zone = this.add.container(x, y, [ring]);
      zone.setSize(r * 1.6, r * 0.7);
      zone.setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this.tap(spot, zone));
      this.spots.push({ spot, x, y, zone });
    });
  }

  private positionSpots() {
    this.spots.forEach((s) => s.zone.setPosition(this.geom.spotX[s.spot], this.geom.spotY));
  }

  private tap(spot: Spot, zone: Phaser.GameObjects.Container) {
    if (this.locked) return;
    if (spot === this.shadowSpot) {
      this.locked = true;
      this.correct++;
      pop();
      win();
      this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
      this.floatMsg(t("lshGreat"));
      speak(t("lshSpeak"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.ring(zone, 0x4ade80);
      this.tweens.add({ targets: zone, scale: 1.15, duration: 130, yoyo: true, ease: "Back.easeOut" });
      this.revealShadow(true);
      this.advance();
      return;
    }
    bad();
    this.locked = true;
    this.floatMsg(t("lshHint"));
    this.ring(zone, 0xf87171);
    this.tweens.add({ targets: zone, x: zone.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
    const rightZone = this.spots.find((s) => s.spot === this.shadowSpot)!;
    this.ring(rightZone.zone, 0x4ade80, 0.6);
    this.revealShadow(false);
    this.advance();
  }

  private ring(zone: Phaser.GameObjects.Container, color: number, alpha = 0.9) {
    const g = this.add.graphics();
    g.lineStyle(5, color, alpha);
    g.strokeEllipse(0, 0, zone.getBounds().width + 8, zone.getBounds().height + 8);
    zone.add(g);
    this.time.delayedCall(1000, () => g.destroy());
  }

  /** Predict-then-check: grow the real shadow at the correct spot. */
  private revealShadow(good: boolean) {
    const x = this.geom.spotX[this.shadowSpot];
    const y = this.geom.spotY;
    const long = this.shadowSpot === "fl" || this.shadowSpot === "fr";
    const w = long ? 84 : 46;
    const h = long ? 22 : 12;
    // beam from the light to the shadow spot (light travels in a straight line)
    const p = this.geom.light[this.light];
    this.beamG.clear();
    this.beamG.lineStyle(3, 0xfff3c4, 0.35);
    this.beamG.lineBetween(p.x, p.y, x, y);
    const sh = this.add.graphics();
    sh.fillStyle(0x1e293b, 0.38);
    sh.fillEllipse(x, y, 4, 4);
    this.tweens.add({
      targets: sh,
      scaleX: w / 4,
      scaleY: h / 4,
      duration: 320,
      ease: "Back.easeOut",
      onComplete: () => {
        sh.scaleX = 1;
        sh.scaleY = 1;
        sh.clear();
        sh.fillStyle(good ? 0x334155 : 0x334155, 0.42);
        sh.fillEllipse(x, y, w, h);
      },
    });
    this.shadows.push({ spot: this.shadowSpot, g: sh });
    this.time.delayedCall(2600, () => sh.destroy());
    this.time.delayedCall(1400, () => this.beamG.clear());
  }

  private advance() {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.time.delayedCall(900, () => this.askQuestion());
      return;
    }
    this.finishRound();
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("lshDone")}  ${digit(this.correct)}/${digit(this.total)}`);
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
      .text(this.scale.width / 2, this.scale.height * 0.2, text, txt(26, NV_GOLD, { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearQuestion() {
    this.spots.forEach((s) => s.zone.destroy());
    this.spots = [];
    this.shadows.forEach((s) => s.g.destroy());
    this.shadows = [];
    this.beamG.clear();
  }

  private clearAll() {
    this.clearQuestion();
    this.lightG.clear();
    this.beamG.clear();
    this.lightEmoji.setText("");
    this.objEmoji.setText("");
  }
}

function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

const BN_D = "০১২৩৪৫৬৭৮৯";
