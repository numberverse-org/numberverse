import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, speakMath, bnNumber, enNumber } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";
import { answerRow } from "./layout";
import { assetIcon } from "./svgAssets";
import { getAppLang } from "./locale";

const LEVELS = GAMES.find((g) => g.id === "game-share")?.difficultyLevels ?? [2, 3, 4, 5, 6, 8];
/** Level → divisor set. Single divisors first (sharing visible), then mixed. */
const DIVISORS: number[][] = [
  [2],        // L0: ÷2 only
  [3],        // L1: ÷3 only
  [4],        // L2: ÷4 only
  [5],        // L3: ÷5 only
  [6, 7],     // L4: mixed — sharing bridge, then number mode
  [8, 10],    // L5: mixed hard
];
const BUTTON_RADIUS = 50;
const ROUNDS_TO_FINISH = 3;
const PLATE_COLORS = [0xffd166, 0x4cc9f0, 0x2ec4b6, 0xff6b6b, 0x8ecae6, 0x90be6d, 0xffb35c, 0xc4b5fd, 0xf9844a, 0x06d6a0];

/**
 * Fair Shares — "watch apples share into baskets" (division by fair-sharing).
 * Band 3 (ages 6–8). The divisor ramps per level: 2 → 3 → 4 → 5 → 6-7 → 8-10.
 *
 * SHARING ANIMATION → NUMBER MODE (the teaching idea):
 *   single-divisor levels animate EVERY round: `dividend` apples fly one-by-one
 *   into `divisor` baskets round-robin (each basket gets the same count — FAIR),
 *   then the voice says "q in each basket!" and the equation flips to a question.
 *   The first mixed round still shares as the concrete bridge, then later mixed
 *   rounds go abstract with a "Now without the sharing!" cue. teach:true (first
 *   exposure or mastery-gate remediation) keeps the sharing on so re-teaching is
 *   concrete.
 */
export class FairShareScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private teachMode = false;
  private showShare = true;
  private prevShowShare = true;
  private divisor = 2;
  private dividend = 0;
  private answer = 0; // quotient
  private sharing = false;
  private shareToken = 0;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private shareG!: Phaser.GameObjects.Container;
  private platesG!: Phaser.GameObjects.Graphics;
  private plateCenters: { x: number; y: number }[] = [];

  constructor() {
    super("FairShare");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; teach?: boolean }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.teachMode = !!data.teach;
    this.shareG = this.add.container(0, 0);
    this.platesG = this.add.graphics();
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleShare"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.factText = this.add
      .text(0, 0, "", txt(52, "#ffd166", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.toastText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, shadow: true }))
      .setOrigin(0.5)
      .setAlpha(0);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("howManyEach"));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layout();
      this.drawPlates();
    });
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.factText.setPosition(width / 2, Math.max(130, Math.round(height * 0.25)));
    this.toastText.setPosition(width / 2, this.factText.y + 38);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  /** Area between the equation and the answer buttons (sharing stage). */
  private get shareArea() {
    const { width, height } = this.scale;
    const top = this.factText.y + 48;
    const bottom = Math.min(height - 196, Math.round(height * 0.64));
    return { x: 10, w: Math.max(120, width - 20), top, bottom, h: Math.max(64, bottom - top) };
  }

  private startRound() {
    this.clearRound();
    this.sharing = false;
    ++this.shareToken;
    const idx = Math.min(this.levelIndex, DIVISORS.length - 1);
    const set = DIVISORS[idx];
    this.divisor = Phaser.Math.RND.pick(set);
    this.prevShowShare = this.showShare;
    // Sharing → number mode: single-divisor levels share; first mixed bridges;
    // later mixed goes abstract. teach:true = concrete.
    this.showShare = this.teachMode || set.length === 1 || this.levelIndex <= 4;
    // keep the sharing stage countable: high divisors get small quotients
    const qMax = this.divisor > 4 ? 3 : this.divisor > 2 ? 4 : 6;
    const q = Phaser.Math.Between(2, this.showShare ? qMax : 9);
    this.dividend = this.divisor * q;
    this.answer = q;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.factText.setText(`${this.dividend} ÷ ${this.divisor} = ?`);
    speakMath("div", this.dividend, this.divisor);
    if (this.showShare) {
      this.playShare();
    } else {
      if (this.prevShowShare) this.flipToast(t("noShare"));
      this.prompt.set(t("howManyEach"));
      this.spawnButtons();
    }
  }

  /** Draw the `divisor` baskets (circles) in 1-2 rows and record their centers. */
  private drawPlates() {
    this.platesG.clear();
    this.plateCenters = [];
    if (!this.showShare) return; // number mode has no baskets to draw
    const g = this.shareArea;
    const perRow = this.divisor <= 5 ? this.divisor : Math.ceil(this.divisor / 2);
    const rows = Math.ceil(this.divisor / perRow);
    const radius = this.divisor > 5 ? 22 : 30;
    const gap = 14;
    const yBase = g.bottom - radius - 8;
    for (let r = 0; r < rows; r++) {
      const n = r === rows - 1 ? this.divisor - r * perRow : perRow;
      const rowW = n * (radius * 2) + (n - 1) * gap;
      const xr = this.scale.width / 2 - rowW / 2;
      const y = yBase - (rows - 1 - r) * (radius * 2 + 14);
      for (let c = 0; c < n; c++) {
        const cx = xr + c * (radius * 2 + gap) + radius;
        const pi = r * perRow + c;
        this.platesG.fillStyle(PLATE_COLORS[pi % PLATE_COLORS.length], 0.25);
        this.platesG.fillCircle(cx, y, radius);
        this.platesG.lineStyle(3, Phaser.Display.Color.HexStringToColor("#ffffff").color, 0.9);
        this.platesG.strokeCircle(cx, y, radius);
        this.plateCenters.push({ x: cx, y });
      }
    }
  }

  /** ── THE SHARING ANIMATION ────────────────────────────────────────────
   *  `dividend` apples fly one-by-one into the baskets round-robin — every
   *  basket visibly ends up with the SAME count (fair!). Then the voice says
   *  "q in each basket!" and the question is asked. Seeing fair-sharing happen
   *  is what makes the ÷ symbol meaningful. */
  private playShare() {
    this.sharing = true;
    const tok = ++this.shareToken;
    const n = this.dividend;
    const d = this.divisor;
    const bn = getAppLang() === "bn";
    const word = (x: number) => (bn ? bnNumber(x) : enNumber(x));
    this.prompt.set(t("watchShare", { n, d }));
    speak(t("watchShareSpeak", { n: word(n), d: word(d) }));
    this.drawPlates();

    // source pile of apples (compact grid just under the equation)
    const g = this.shareArea;
    const itemSize = n > 20 ? 16 : n > 12 ? 20 : 24;
    const cell = itemSize + 6;
    const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(n))));
    const srcW = cols * cell;
    const srcX = this.scale.width / 2 - srcW / 2 + cell / 2;
    const srcY = g.top + 16 + cell / 2;
    const items: Phaser.GameObjects.Container[] = [];
    for (let i = 0; i < n; i++) {
      const c = this.add.container(srcX + (i % cols) * cell, srcY + Math.floor(i / cols) * cell);
      c.add(assetIcon(this, "apple", itemSize + 6));
      this.shareG.add(c);
      items.push(c);
    }

    // round-robin fly: item i → basket (i % d), the i-th apple inside it
    const cellIn = 18;
    const perPlate = this.answer;
    const pRows = Math.ceil(perPlate / 2);
    const offY = ((pRows - 1) * cellIn) / 2;
    for (let i = 0; i < n; i++) {
      const c = items[i];
      const p = this.plateCenters[i % d];
      const j = Math.floor(i / d); // 0..perPlate-1 inside its basket
      const tx = p.x + (j % 2) * cellIn - cellIn / 2;
      const ty = p.y - 8 + Math.floor(j / 2) * cellIn - offY;
      this.time.delayedCall(i * 240, () => {
        if (tok !== this.shareToken || !this.scene.isActive()) return;
        pop();
        this.tweens.add({ targets: c, x: tx, y: ty, duration: 300, ease: "Quad.easeInOut" });
      });
    }

    // after the last apple lands: ring the baskets + "q in each basket!"
    this.time.delayedCall(n * 240 + 340, () => {
      if (tok !== this.shareToken || !this.scene.isActive()) return;
      this.ringBaskets();
      this.toastText.setText(t("shareEach", { q: this.answer })).setAlpha(1).setScale(0.8);
      this.tweens.killTweensOf(this.toastText);
      this.tweens.add({ targets: this.toastText, scale: 1, duration: 240, ease: "Back.easeOut" });
      speak(t("shareEachSpeak", { q: word(this.answer) }), { cancel: false });
      this.time.delayedCall(950, () => {
        if (tok !== this.shareToken || !this.scene.isActive()) return;
        this.toastText.setAlpha(0);
        this.prompt.set(t("howManyEach"));
        speakMath("div", this.dividend, this.divisor);
        this.sharing = false;
        this.spawnButtons();
      });
    });
  }

  /** Pulse a ring around every basket to show they are all equal (fair). */
  private ringBaskets() {
    for (const p of this.plateCenters) {
      const ring = this.add.graphics().setDepth(5);
      ring.fillStyle(Phaser.Display.Color.HexStringToColor("#ffd166").color, 0.25);
      ring.fillCircle(p.x, p.y, 38);
      ring.lineStyle(4, Phaser.Display.Color.HexStringToColor("#ffd166").color, 1);
      ring.strokeCircle(p.x, p.y, 38);
      this.tweens.add({
        targets: ring,
        alpha: 0,
        scale: 1.35,
        duration: 600,
        delay: Math.random() * 200,
        ease: "Sine.easeInOut",
        onComplete: () => ring.destroy(),
      });
    }
  }

  private flipToast(msg: string) {
    const tok = ++this.flipToken;
    this.toastText.setText(msg).setAlpha(1).setScale(0.7);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({ targets: this.toastText, scale: 1, duration: 240, ease: "Back.easeOut" });
    this.time.delayedCall(2000, () => {
      if (tok !== this.flipToken || !this.toastText.active) return;
      this.tweens.add({ targets: this.toastText, alpha: 0, duration: 400 });
    });
  }
  private flipToken = 0;

  private spawnButtons() {
    const opts = new Set<number>([this.answer]);
    let delta = 1;
    while (opts.size < 4) {
      const cand = Math.max(1, this.answer + (delta % 2 === 1 ? -delta : delta));
      if (cand !== this.answer) opts.add(cand);
      delta++;
    }
    const values = [...opts].sort(() => Math.random() - 0.5);
    const { radius, y, xFor } = answerRow(this, values.length, BUTTON_RADIUS);
    values.forEach((value, i) => {
      const c = modernAnswerButton(this, xFor(i), y, radius, String(value));
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.answer) {
      hintWrong(this, container, {
        hint: () => this.showShare
          ? `Each basket has ${this.answer} — ${this.dividend} shared into ${this.divisor} baskets`
          : `Think how many ${this.divisor}s fit into ${this.dividend}`,
        hintBn: () => this.showShare
          ? `প্রতিটা ঝুড়িতে ${bnNumber(this.answer)}টা — ${bnNumber(this.dividend)} কে ${bnNumber(this.divisor)}টা ঝুড়িতে ভাগ`
          : `ভাবো — ${bnNumber(this.dividend)}-এর মধ্যে ${bnNumber(this.divisor)} কতবার যায়`,
        correct: () => this.answer,
        options: () => this.buttons,
      });
      return;
    }
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)]);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearRound() {
    this.shareG.removeAll(true);
    this.platesG.clear();
    this.plateCenters = [];
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
    this.toastText.setAlpha(0);
    ++this.shareToken; // cancel any in-flight share timers
    ++this.flipToken;
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, PLATE_COLORS[i % PLATE_COLORS.length]);
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
}
