import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { win, playNote, pop } from "./audio";
import { speak, bnNumber, enNumber } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { assetIcon } from "./svgAssets";
import { txt, modernAnswerButton, BTN_PRIMARY, btnFromColor, ringCorrect, gridLayout, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { enableDragToPop } from "./gestures";

const LEVELS = GAMES.find((g) => g.id === "game-countsong")?.difficultyLevels ?? [3, 5, 7, 8, 9, 10];
const ROUNDS_TO_FINISH = 3;
/** The Counting Song: a rising C-major scale — 1 → C4 … 10 → E5. Every number
 *  is its own note, so the kid literally PLAYS the melody by tapping in order. */
const NOTES = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25];
const BEAT_MS = 580;
const BN_D = "০১২৩৪৫৬৭৮৯";
/** Sunny-song button colors (a different color per row feels like a toy). */
const BTN_STYLES = [BTN_PRIMARY, btnFromColor(0xf97316), btnFromColor(0x22c55e), btnFromColor(0xeab308)];

function bdDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => BN_D[Number(d)]);
}

/**
 * Nova's Counting Song — a musical counting game.
 * Band 1 (ages 2–4, math). Nova SINGS the numbers 1..N as a rising melody with
 * a bouncing ball (each number lights up + a bell note plays + TTS counts
 * along). Then the kid sings it back by tapping or SWEEPING the number buttons
 * in order — every tap plays its note, so they build the melody themselves.
 * Finish the round and Nova plays the whole song as a reward + says the kid's
 * NAME. Music + counting + sequencing = the oldest trick in the toddler book.
 */
export class CountingSongScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private nextExpected = 1;
  private busy = true;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private kidName = "";
  private nova!: Phaser.GameObjects.Container;
  private novaY = 0;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("CountingSong");
  }

  create(data: {
    onRoundDone: (correct: boolean, ms: number, difficulty: number) => void;
    startLevelIndex?: number;
    kidName?: string;
  }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.kidName = data.kidName ?? "";
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("songTitle"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.nova = assetIcon(this, "owl", 46);
    // Nova is the coach: stuck on your turn? Tap her and she hums the tune again.
    this.nova.setSize(70, 70);
    this.nova.setInteractive({ useHandCursor: true });
    this.nova.on("pointerdown", () => {
      if (!this.busy) this.humMelody();
    });
    this.novaY = 0;
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layout();
      this.reflowGrid();
    });
    this.layout();
    this.startRound();

    // KID GESTURE — sweep-to-play: a toddler drags a finger across the number
    // buttons and the NEXT number plays its note. It's an instrument. Swipe-to-
    // answer is OFF (sequencing game) — a swipe toward a future number must
    // never fire it early, so taps/sweeps go through the order guard instead.
    this.data.set("nv:noSwipe", true);
    enableDragToPop(this, (x, y) => {
      const wanted = this.nextExpected;
      const b = this.buttons.find((e) => e.value === wanted);
      if (!b) return;
      const s = b.sprite;
      if (
        s.active && s.visible && s.input?.enabled &&
        Phaser.Math.Distance.Between(x, y, s.x, s.y) < this.roundRadius() + 8
      ) {
        this.onPlay(s, wanted);
      }
    });
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
    this.nova.setPosition(width / 2, 122);
    this.novaY = 122;
  }

  private get roundTarget(): number {
    return LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
  }

  private roundRadius(): number {
    return this.gridSpec().gl.cardW / 2;
  }

  private gridSpec() {
    const n = this.roundTarget;
    const cols = n <= 5 ? n : 5;
    const rows = Math.ceil(n / cols);
    const gl = gridLayout(this, {
      cols,
      rows,
      preferredW: 104,
      minW: 62,
      widthPad: 24,
      topPad: 158,
      bottomY: this.scale.height - 190 - SAB(),
      gapX: 12,
      gapY: 14,
    });
    return { n, rows, cols, gl };
  }

  private startRound() {
    this.clearButtons();
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.spawnButtons();
    this.sing();
  }

  private spawnButtons() {
    const { n, rows, cols, gl } = this.gridSpec();
    const gridH = (rows - 1) * gl.spacingY;
    for (let v = 1; v <= n; v++) {
      const i = v - 1;
      const x = gl.startX + (i % cols) * gl.spacingX;
      const y = gl.cy - gridH / 2 + Math.floor(i / cols) * gl.spacingY;
      const style = BTN_STYLES[Math.floor(i / cols) % BTN_STYLES.length];
      const label = getAppLang() === "bn" ? bdDigits(v) : String(v);
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, label, style, {
        labelSize: Math.max(24, Math.round(gl.cardW * 0.42)),
      });
      c.setData("idx", i);
      c.on("pointerdown", () => this.onPlay(c, v));
      this.buttons.push({ sprite: c, value: v });
    }
  }

  private reflowGrid() {
    const { rows, cols, gl } = this.gridSpec();
    const gridH = (rows - 1) * gl.spacingY;
    for (const b of this.buttons) {
      const i = b.sprite.getData("idx") as number;
      b.sprite.setPosition(gl.startX + (i % cols) * gl.spacingX, gl.cy - gridH / 2 + Math.floor(i / cols) * gl.spacingY);
    }
  }

  /** Phase 1 — Nova sings 1..N: note + bounce + count-along TTS, one per beat. */
  private sing() {
    this.busy = true;
    const n = this.roundTarget;
    this.prompt.set(t("songListen"));
    speak(t("songListen"));
    this.tweens.killTweensOf(this.nova);
    this.tweens.add({
      targets: this.nova,
      y: this.novaY - 9,
      duration: BEAT_MS / 2,
      yoyo: true,
      repeat: n * 2,
      ease: "Sine.easeInOut",
    });
    for (let i = 1; i <= n; i++) {
      this.time.delayedCall(i * BEAT_MS - BEAT_MS / 2, () => {
        if (!this.scene.isActive()) return;
        this.playBeat(i);
      });
    }
    this.time.delayedCall(n * BEAT_MS + 320, () => {
      if (!this.scene.isActive()) return;
      this.busy = false;
      this.nextExpected = 1;
      this.startedAt = this.time.now;
      this.prompt.set(t("songNowYou"));
      speak(t("songNowYou"));
    });
  }

  private humming = false;

  /** Nova's coach-mode: hum the whole tune (notes + bounces only, no TTS, no
   *  state change) so a stuck kid hears the melody again without losing place. */
  private humMelody() {
    if (this.humming) return;
    this.humming = true;
    const n = this.roundTarget;
    this.tweens.killTweensOf(this.nova);
    this.tweens.add({
      targets: this.nova,
      y: this.novaY - 9,
      duration: 200,
      yoyo: true,
      repeat: n * 2,
      ease: "Sine.easeInOut",
    });
    for (let i = 1; i <= n; i++) {
      this.time.delayedCall(i * 460, () => {
        if (!this.scene.isActive()) return;
        playNote(NOTES[(i - 1) % NOTES.length], 0.45, "triangle", 0.13);
        this.bounce(i);
      });
    }
    this.time.delayedCall(n * 460 + 240, () => {
      this.humming = false;
    });
  }

  /** Play one number: its bell note + bouncing ball + the number spoken aloud. */
  private playBeat(v: number) {
    pop();
    playNote(NOTES[(v - 1) % NOTES.length], 0.5, "triangle", 0.14);
    const bn = getAppLang() === "bn";
    speak(bn ? bnNumber(v) : enNumber(v), { cancel: false });
    this.bounce(v);
  }

  private bounce(v: number) {
    const b = this.buttons.find((x) => x.value === v);
    if (!b) return;
    this.tweens.add({
      targets: b.sprite,
      scaleX: b.sprite.scaleX * 1.18,
      scaleY: b.sprite.scaleY * 1.18,
      duration: 120,
      yoyo: true,
      ease: "Back.easeOut",
    });
    // golden ring flash on the singing number
    const ring = this.add
      .circle(b.sprite.x, b.sprite.y, b.sprite.displayWidth / 2 + 6, 0xffd166, 0)
      .setStrokeStyle(5, 0xffd166)
      .setDepth(4000);
    this.tweens.add({
      targets: ring,
      scale: 1.4,
      alpha: 0,
      duration: 420,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  /** Phase 2 — the kid's turn. Only the NEXT number in the melody is correct;
   *  every number is a future answer, so wrong taps shake + recover, never
   *  retire (keepOnWrong) — exactly like Count & Pop's sequencing. */
  private onPlay(container: Phaser.GameObjects.Container, value: number) {
    if (this.busy) return;
    if (value !== this.nextExpected) {
      hintWrong(this, container, {
        hint: () => `Sing in order — what number comes after ${this.nextExpected - 1}?`,
        hintBn: () => `${this.nextExpected - 1} এর পর কোন সংখ্যাটা আসে? ক্রমানুসারে গাও`,
        correct: () => this.nextExpected,
        options: () => this.buttons,
        keepOnWrong: true,
      });
      return;
    }
    this.playBeat(value);
    ringCorrect(this, container);
    container.disableInteractive();
    this.nextExpected++;
    if (this.nextExpected > this.roundTarget) {
      this.finishRound();
    }
  }

  /** The whole melody plays back as the reward, then Nova cheers the kid by NAME. */
  private finishRound() {
    const n = this.roundTarget;
    for (let i = 1; i <= n; i++) {
      playNote(NOTES[(i - 1) % NOTES.length], 0.55, "triangle", 0.15, (i - 1) * 0.5);
    }
    this.tweens.killTweensOf(this.nova);
    this.tweens.add({ targets: this.nova, y: this.novaY - 12, duration: 150, yoyo: true, repeat: n * 2, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: this.nova, angle: 10, duration: 180, yoyo: true, repeat: n * 2, ease: "Sine.easeInOut" });
    const bn = getAppLang() === "bn";
    const name = this.kidName || (bn ? "বন্ধু" : "friend");
    this.time.delayedCall((n + 1) * 500, () => {
      if (!this.scene.isActive()) return;
      speak(t("greatSinging", { name }), { lang: bn ? "bn" : "en" });
    });
    // fanfare AFTER the last note so the melody stays the star (no clash)
    this.time.delayedCall(n * 500, () => {
      if (!this.scene.isActive()) return;
      win();
    });
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall((n + 1) * 500 + 2200, () => {
      if (!this.scene.isActive()) return;
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
  }
}
