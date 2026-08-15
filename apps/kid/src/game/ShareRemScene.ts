import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-shares2")?.difficultyLevels ?? [4, 5, 6, 8, 8, 10];
const ROUNDS_TO_FINISH = 3;
const AVATARS = ["🧒", "🐱", "🦊", "🐰", "🐻"];


/**
 * Division as sharing lvl 2 (#195).
 * Band 3: extend fair shares to the REMAINDER. Candies in a pile are dealt
 * ROUND-ROBIN into kid plates (sharing animation); the leftover that cannot be
 * dealt evenly is highlighted as "Left over!". The kid then answers "Each kid
 * gets __" (quotient) and "Left over __" (remainder).
 */
export class ShareRemScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private k = 0; // kids
  private q = 0; // each gets
  private r = 0; // remainder
  private candies: Phaser.GameObjects.Arc[] = [];
  private plates: Phaser.GameObjects.Graphics[] = [];
  private plateAvatars: Phaser.GameObjects.Text[] = [];
  private plateX: number[] = [];
  private tiles: { sprite: Phaser.GameObjects.Container; val: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;

  constructor() {
    super("ShareRem");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleShares2"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(28, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.tallyText.setPosition(width / 2, height * 0.8);
    this.prompt.setPosition(width / 2, height * 0.66);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
  }

  private startRound() {
    this.clearTiles();
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

  private maxQ(): number {
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    return lvl < 2 ? 3 : 4;
  }

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    this.k = Phaser.Math.Between(2, 5);
    this.q = Phaser.Math.Between(2, this.maxQ());
    this.r = Phaser.Math.Between(1, this.k - 1); // always a remainder
    const total = this.q * this.k + this.r;
    this.prompt.setText("");
    this.buildShare(total);
    this.playShare();
  }

  private buildShare(total: number) {
    this.candies.forEach((c) => c.destroy());
    this.candies = [];
    this.plates.forEach((p) => p.destroy());
    this.plates = [];
    this.plateAvatars.forEach((a) => a.destroy());
    this.plateAvatars = [];
    const { width, height } = this.scale;
    const pileY = height * 0.3;
    const cols = 6;
    const gap = 24;
    const r = 7;
    const x0 = width / 2 - (Math.min(cols, total) - 1) * gap / 2;
    for (let i = 0; i < total; i++) {
      const c = i % cols;
      const row = Math.floor(i / cols);
      const candy = this.add.circle(x0 + c * gap, pileY + row * gap, r, 0xff6b81).setDepth(5);
      this.candies.push(candy);
    }
    const plateY = height * 0.46;
    this.plateX = [];
    const pw = 44;
    const totalPw = this.k * (pw + 16) - 16;
    const px0 = width / 2 - totalPw / 2;
    for (let i = 0; i < this.k; i++) {
      const x = px0 + i * (pw + 16) + pw / 2;
      this.plateX.push(x);
      const plate = this.add.graphics().setDepth(4);
      plate.fillStyle(0xffffff, 0.28).fillRoundedRect(x - pw / 2, plateY - 12, pw, 30, 8);
      this.plates.push(plate);
      const avatar = this.add.text(x, plateY - 34, AVATARS[i], txt(24, "#ffffff", {})).setOrigin(0.5).setDepth(4);
      this.plateAvatars.push(avatar);
    }
  }

  /** Deal q full rounds round-robin (sharing animation), then highlight the remainder. */
  private playShare() {
    let round = 0;
    const dealOne = (candy: Phaser.GameObjects.Arc, x: number, y: number) => {
      this.tweens.add({ targets: candy, x, y, scale: 0.62, duration: 280, ease: "Sine.easeInOut" });
    };
    const next = () => {
      if (round < this.q) {
        const base = round * this.k;
        for (let kid = 0; kid < this.k; kid++) {
          dealOne(this.candies[base + kid], this.plateX[kid], this.scale.height * 0.46 + 3);
        }
        round++;
        this.time.delayedCall(300, next);
      } else {
        this.finishShare();
      }
    };
    next();
  }

  private finishShare() {
    // highlight the leftover candies (remainder) still in the pile
    const leftover = this.candies.slice(this.q * this.k);
    leftover.forEach((c) => {
      this.tweens.add({ targets: c, scale: 1.45, duration: 220, yoyo: true, ease: "Back.easeOut" });
      this.tweens.add({ targets: c, fillColor: 0x4ade80, duration: 200 });
    });
    this.floatMsg(t("shLeft"));
    speak(t("shLeft"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.time.delayedCall(900, () => {
      this.askStep(1);
    });
  }

  private askStep(s: number) {
    this.clearTiles();
    this.locked = false;

    const target = s === 1 ? this.q : this.r;
    const lo = s === 1 ? 1 : 0;
    const opts = new Set<number>([target]);
    while (opts.size < 4) {
      const d = target + Phaser.Math.Between(-2, 2);
      if (d >= lo && d <= 9) opts.add(d);
    }
    const bank = [...opts].sort(() => Math.random() - 0.5);
    this.prompt.setText(s === 1 ? t("shQ") : t("shR"));

    const gl = gridLayout(this, {
      cols: 4,
      rows: 1,
      preferredW: 110,
      minW: 60,
      widthPad: 12,
      topPad: this.scale.height * 0.78,
      bottomY: this.scale.height - 24 - SAB(),
      cardH: 66,
    });
    bank.forEach((val, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, 66, digit(val), BTN_NEUTRAL, 30);
      tile.on("pointerdown", () => this.tap(tile, val, s));
      this.tiles.push({ sprite: tile, val });
    });
  }

  private tap(tile: Phaser.GameObjects.Container, val: number, s: number) {
    if (this.locked) return;
    const target = s === 1 ? this.q : this.r;
    if (val === target) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.correct++;
      this.tweens.add({ targets: tile, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      if (s === 1) {
        this.floatMsg(t("shGreat"));
        this.time.delayedCall(600, () => this.askStep(2));
      } else {
        const total = this.q * this.k + this.r;
        this.floatMsg(t("shSpeak", { n: digit(total), k: digit(this.k), q: digit(this.q), r: digit(this.r) }));
        speak(t("shSpeak", { n: digit(total), k: digit(this.k), q: digit(this.q), r: digit(this.r) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
        const ms = Math.max(1, this.time.now - this.startedAt);
        this.advance(ms);
      }
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () => digit(target));
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  private advance(ms: number) {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.qIndex++;
      this.time.delayedCall(900, () => this.askQuestion());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(`${t("shDone")}  ${digit(this.correct)}/${digit(this.total)}`);
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
    floatText(this, this.scale.width / 2, this.scale.height * 0.55, text, NV_GOLD, 26, -24);
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}

/** Wrong-answer feedback without hintWrong's "keep on wrong" retirement. */
function hintWrongLocal(scene: Phaser.Scene, tile: Phaser.GameObjects.Container, correct: () => string) {
  scene.tweens.add({ targets: tile, scale: 0.9, duration: 90, yoyo: true, ease: "Sine.easeInOut" });
  tile.setAlpha(0.4);
  tile.disableInteractive();
  const m = scene.add
    .text(tile.x, tile.y - 40, correct(), txt(22, NV_GREEN, { bold: true, outline: true }))
    .setOrigin(0.5)
    .setDepth(40);
  scene.tweens.add({ targets: m, y: m.y - 20, alpha: 0, duration: 700, onComplete: () => m.destroy() });
}
