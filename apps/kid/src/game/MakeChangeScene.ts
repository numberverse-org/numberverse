import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak, bnNumber, enNumber, cancelSpeech } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_CORRECT, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-makechange")?.difficultyLevels ?? [4, 5, 6, 8, 8, 10];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ৳৫০, English kids ৳50. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/** The note tray always makes every multiple of 5 from 5 to 95 exactly. */
const TRAY = [50, 20, 20, 10, 10, 5];
const NOTE_COLORS: Record<number, number> = { 5: 0xd9a441, 10: 0x2e8b57, 20: 0x3569c8, 50: 0x8e44ad, 100: 0xd64541 };

interface NoteTile {
  c: Phaser.GameObjects.Container;
  denom: number;
  ring: Phaser.GameObjects.Shape;
  on: boolean;
}

/**
 * Making change with ৳ notes (#199, #66).
 * Band 3: three rotating questions —
 *  · CHANGE — a ৳50/৳100 note is shown with a price chip; the kid computes the
 *    change (৳50 − ৳32 = ৳18) and taps it from 4 cards. The spoken equation
 *    "fifty minus thirty-two is eighteen" ties the note to the subtraction.
 *  · MAKE   — "Tap notes to make ৳45" (FREE mode): the kid taps ৳5/৳10/৳20/৳50
 *    notes off a tray (live ৳ total), then ✅ checks. Any combo is accepted.
 *  · FEWEST (#66) — "Make ৳70 with the FEWEST notes!": the same tray, but only
 *    the minimum note count wins. A non-minimal attempt resets the tray with a
 *    "try the big notes first" nudge; a second miss REVEALS the greedy combo
 *    (biggest-first) so the lesson always completes.
 * Every note tapped speaks its name — "পঞ্চাশ টাকার নোট" / "fifty taka note".
 * Real ৳5 coin + ৳10/20/50/100 note visuals (Bangladesh colours).
 */
export class MakeChangeScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private changeMode = true; // mode 0: change; mode 1: make (free); mode 2: fewest
  private fewestMode = false;
  private fewestMin = 0;
  private fewestMisses = 0;
  private noteCount = 0;
  private pay = 50;
  private p = 30;
  private c = 20;
  private lastQ = ""; // "${mode}:${p}" to avoid repeats
  private cards: { sprite: Phaser.GameObjects.Container; val: string; correct: boolean }[] = [];
  private tray: NoteTile[] = [];
  private noteVisual!: Phaser.GameObjects.Container;
  private priceText!: Phaser.GameObjects.Text;
  private totalText!: Phaser.GameObjects.Text;
  private checkBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;

  constructor() {
    super("MakeChange");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleChange"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.priceText = this.add
      .text(0, 0, "", txt(22, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.totalText = this.add
      .text(0, 0, "", txt(30, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.checkBtn = modernCardButton(this, 0, 0, 150, 74, "✅", BTN_CORRECT, 30);
    this.checkBtn.on("pointerdown", () => this.checkMake());
    this.checkBtn.setVisible(false);
    this.noteVisual = this.add.container(0, 0).setDepth(5);
    this.noteVisual.setVisible(false);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.15);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.priceText.setPosition(width / 2, height * 0.24);
    this.tallyText.setPosition(width / 2, height * 0.48);
    this.totalText.setPosition(width / 2, height * 0.42);
    this.checkBtn.setPosition(width / 2, height - 64 - SAB());
    if (this.changeMode) {
      this.noteVisual.setPosition(width / 2, height * 0.35);
    } else {
      this.layoutTray();
    }
  }

  private startRound() {
    this.clearAll();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.qIndex = 0;
    this.lastQ = "";
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearAll();
    this.locked = false;
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    const bn = getAppLang() === "bn";
    let guard = 0;
    let mode = 0;
    do {
      mode = this.qIndex % 3;
      this.changeMode = mode === 0;
      this.fewestMode = mode === 2;
      if (mode === 0) this.genChange(lvl);
      else if (mode === 2) this.genFewest(lvl);
      else this.genMake(lvl);
      guard++;
    } while (this.lastQ === `${mode}:${this.p}` && guard < 30);
    this.lastQ = `${mode}:${this.p}`;

    if (this.changeMode) {
      this.prompt.setText(t("chQ", { pay: digit(this.pay) }));
      this.priceText.setText(t("chPrice", { p: digit(this.p) }));
      this.priceText.setVisible(true);
      this.showBigNote(this.pay);
      this.noteVisual.setVisible(true);
      this.spawnChangeCards(lvl);
    } else if (this.fewestMode) {
      this.fewestMin = this.greedyMin(this.p);
      this.fewestMisses = 0;
      this.noteCount = 0;
      this.prompt.setText(t("chFewest", { p: digit(this.p) }));
      this.priceText.setVisible(false);
      this.noteVisual.setVisible(false);
      this.totalText.setText(`৳${digit(0)} · ${t("fewestCount", { n: digit(0) })}`);
      this.totalText.setVisible(true);
      this.buildTray();
      this.layoutTray();
      this.checkBtn.setVisible(false);
      speak(t("chFewestSpeak", { p: bn ? bnNumber(this.p) : enNumber(this.p) }), { lang: bn ? "bn" : "en" });
    } else {
      this.prompt.setText(t("chMake", { p: digit(this.p) }));
      this.priceText.setVisible(false);
      this.noteVisual.setVisible(false);
      this.totalText.setText(`৳${digit(0)}`);
      this.totalText.setVisible(true);
      this.buildTray();
      this.layoutTray();
      this.checkBtn.setVisible(true);
    }
  }

  /** Change question: pay with ৳50 (lvl<4) or ৳50/৳100 (lvl≥4). */
  private genChange(lvl: number) {
    if (lvl < 4) {
      this.pay = 50;
      this.p = Phaser.Math.Between(2, 9) * 5; // ৳10..৳45 → change ৳5..৳40
    } else {
      this.pay = Math.random() < 0.5 ? 50 : 100;
      const maxM = this.pay === 50 ? 9 : 20; // lvl≥4 allows exact pay (change ৳0)
      this.p = Phaser.Math.Between(1, maxM) * 5;
    }
    this.c = this.pay - this.p;
  }

  /** Make question: every multiple of 5 from 10..95 is buildable from TRAY. */
  private genMake(lvl: number) {
    const max = lvl < 2 ? 40 : lvl < 4 ? 70 : 95;
    this.p = Phaser.Math.Between(2, max / 5) * 5;
  }

  /** Fewest question: same targets — the lesson is WHICH notes you pick. */
  private genFewest(lvl: number) {
    const max = lvl < 2 ? 40 : lvl < 4 ? 70 : 95;
    this.p = Phaser.Math.Between(2, max / 5) * 5;
  }

  /** Fewest note count for a target, greedy biggest-first over the TRAY. */
  private greedyMin(target: number): number {
    const tray = [...TRAY].sort((a, b) => b - a);
    let rem = target, n = 0;
    for (const d of tray) if (rem >= d) { rem -= d; n++; }
    return n;
  }

  /** The greedy combo (denom list) that hits the target in the fewest notes. */
  private greedyCombo(target: number): number[] {
    const tray = [...TRAY].sort((a, b) => b - a);
    const out: number[] = [];
    let rem = target;
    for (const d of tray) if (rem >= d) { rem -= d; out.push(d); }
    return out;
  }

  private spawnChangeCards(lvl: number) {
    const cands: number[] = [];
    for (let v = 0; v <= this.pay; v += 5) if (v !== this.c) cands.push(v);
    cands.sort(() => Math.random() - 0.5);
    const mk = (v: number) => `৳${digit(v)}`;
    const opts = [mk(this.c), mk(cands[0]), mk(cands[1]), mk(cands[2])].sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: 2,
      rows: 2,
      preferredW: 160,
      minW: 110,
      widthPad: 16,
      topPad: this.scale.height * 0.56,
      bottomY: this.scale.height - 24 - SAB(),
      cardH: 68,
    });
    opts.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + row * gl.spacingY, gl.cardW, 68, s, BTN_NEUTRAL, 30);
      const isCorrect = s === mk(this.c);
      tile.on("pointerdown", () => this.tap(tile, s, isCorrect));
      this.cards.push({ sprite: tile, val: s, correct: isCorrect });
    });
  }

  private tap(tile: Phaser.GameObjects.Container, str: string, isCorrect: boolean) {
    if (this.locked) return;
    if (isCorrect) {
      this.locked = true;
      pop();
      win();
      this.correct++;
      this.floatMsg(t("chGreat"));
      const bn = getAppLang() === "bn";
      speak(t("chSpeak", {
        pay: bn ? bnNumber(this.pay) : enNumber(this.pay),
        p: bn ? bnNumber(this.p) : enNumber(this.p),
        c: bn ? bnNumber(this.c) : enNumber(this.c),
      }), { lang: bn ? "bn" : "en" });
      this.tweens.add({ targets: tile, scale: 1.1, duration: 140, yoyo: true, ease: "Back.easeOut" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () => `৳${digit(this.c)}`);
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  private buildTray() {
    this.tray.forEach((o) => o.c.destroy());
    this.tray = [];
    TRAY.forEach((denom) => {
      const tile = denom === 5 ? this.makeCoin() : this.makeNote(denom);
      tile.c.on("pointerdown", () => this.toggleTray(tile));
      this.tray.push(tile);
    });
  }

  private layoutTray() {
    const { width, height } = this.scale;
    const n = this.tray.length;
    const noteW = Math.min(56, (width - 40 - 4 * 8) / 6);
    const noteH = 38;
    const coinR = 26;
    const spacing = Math.max(noteW + 8, coinR * 2 + 12);
    const totalW = spacing * (n - 1) + Math.max(noteW, coinR * 2);
    const x0 = width / 2 - totalW / 2;
    const y = height * 0.3;
    this.tray.forEach((tile, i) => {
      const cx = x0 + i * spacing + (tile.denom === 5 ? coinR : noteW) / 2;
      tile.c.setPosition(cx, y);
    });
  }

  private makeNote(denom: number): NoteTile {
    const w = 56;
    const h = 38;
    const color = NOTE_COLORS[denom] ?? 0x6b7280;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    g.lineStyle(2, 0xffffff, 0.85);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    g.lineStyle(1.5, 0xffffff, 0.5);
    g.strokeRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 4);
    const label = this.add.text(0, 0, `৳${digit(denom)}`, txt(18, "#ffffff", { bold: true })).setOrigin(0.5);
    const c = this.add.container(0, 0, [g, label]).setDepth(5);
    const ring = this.add.rectangle(0, 0, w + 10, h + 10).setStrokeStyle(5, 0x4ade80, 1).setVisible(false);
    c.add(ring);
    c.setSize(w + 12, h + 12);
    c.setInteractive({ useHandCursor: true });
    return { c, denom, ring, on: false };
  }

  private makeCoin(): NoteTile {
    const r = 26;
    const g = this.add.graphics();
    g.fillStyle(0xd9a441, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(3, 0xfff3c4, 0.9);
    g.strokeCircle(0, 0, r);
    g.lineStyle(2, 0xb07920, 1);
    g.strokeCircle(0, 0, r - 4);
    const label = this.add.text(0, 0, digit(5), txt(16, "#7a4f00", { bold: true })).setOrigin(0.5);
    const c = this.add.container(0, 0, [g, label]).setDepth(5);
    const ring = this.add.circle(0, 0, r + 5).setStrokeStyle(5, 0x4ade80, 1).setVisible(false);
    c.add(ring);
    c.setSize(r * 2 + 12, r * 2 + 12);
    c.setInteractive({ useHandCursor: true });
    return { c, denom: 5, ring, on: false };
  }

  private toggleTray(tile: NoteTile) {
    if (this.locked) return;
    tile.on = !tile.on;
    tile.ring.setVisible(tile.on);
    pop();
    this.sayNote(tile.denom);
    const on = this.tray.filter((o) => o.on);
    const sum = on.reduce((s, o) => s + o.denom, 0);
    this.noteCount = on.length;
    if (this.fewestMode) {
      this.totalText.setText(`৳${digit(sum)} · ${t("fewestCount", { n: digit(this.noteCount) })}`);
      if (sum === this.p) this.evaluateFewest();
    } else {
      this.totalText.setText(`৳${digit(sum)}`);
    }
  }

  /** Speak a note's NAME in the app language — the #66 "Bangla note names spoken". */
  private sayNote(denom: number) {
    const bn = getAppLang() === "bn";
    cancelSpeech();
    speak(`${bn ? bnNumber(denom) : enNumber(denom)} ${t("noteWord")}`);
  }

  /** FEWEST check: hit the target AND with the minimum number of notes. */
  private evaluateFewest() {
    if (this.locked) return;
    const bn = getAppLang() === "bn";
    if (this.noteCount === this.fewestMin) {
      this.locked = true;
      win();
      this.correct++;
      const n = bn ? bnNumber(this.noteCount) : enNumber(this.noteCount);
      this.floatMsg(t("fewestGreat", { n }), 0x4ade80);
      speak(t("fewestGreat", { n }), { lang: bn ? "bn" : "en" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    // Not fewest — first miss nudges toward the big notes, second reveals them.
    this.fewestMisses++;
    if (this.fewestMisses < 2) {
      bad();
      this.locked = true;
      this.floatMsg(t("fewestTry", {
        p: bn ? bnNumber(this.p) : enNumber(this.p),
        n: bn ? bnNumber(this.noteCount) : enNumber(this.noteCount),
        min: bn ? bnNumber(this.fewestMin) : enNumber(this.fewestMin),
      }), 0xffd166);
      this.time.delayedCall(1800, () => {
        this.resetTray();
        this.locked = false;
      });
    } else {
      this.revealFewest();
    }
  }

  /** Teaching reveal: switch on the greedy combo, speak its names, count as learned. */
  private revealFewest() {
    const bn = getAppLang() === "bn";
    this.locked = true;
    const need: Record<number, number> = {};
    const combo = this.greedyCombo(this.p);
    for (const d of combo) need[d] = (need[d] ?? 0) + 1;
    this.tray.forEach((tile) => {
      if (need[tile.denom] > 0) {
        tile.on = true;
        tile.ring.setVisible(true);
        need[tile.denom]--;
        this.tweens.add({ targets: tile.c, scale: 1.15, duration: 320, yoyo: true, ease: "Back.easeOut" });
      }
    });
    this.noteCount = combo.length;
    this.totalText.setText(`৳${digit(this.p)} · ${t("fewestCount", { n: digit(this.noteCount) })}`);
    const names = combo.map((d) => `${bn ? bnNumber(d) : enNumber(d)} ${t("noteWord")}`).join(", ");
    const vars = { p: bn ? bnNumber(this.p) : enNumber(this.p), n: bn ? bnNumber(combo.length) : enNumber(combo.length), names };
    win();
    this.floatMsg(t("fewestReveal", vars), 0x4ade80);
    speak(t("fewestReveal", vars), { lang: bn ? "bn" : "en" });
    this.correct++;
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.time.delayedCall(2200, () => this.advance(ms));
  }

  /** Turn every tray note back off (FEWEST "try again" reset). */
  private resetTray() {
    this.tray.forEach((t) => { t.on = false; t.ring.setVisible(false); });
    this.noteCount = 0;
    this.totalText.setText(`৳${digit(0)} · ${t("fewestCount", { n: digit(0) })}`);
  }

  private checkMake() {
    if (this.locked) return;
    const sum = this.tray.filter((o) => o.on).reduce((s, o) => s + o.denom, 0);
    if (sum === this.p) {
      this.locked = true;
      win();
      this.correct++;
      this.floatMsg(t("chGreat"), 0x4ade80);
      const bn = getAppLang() === "bn";
      speak(t("chMakeSpeak", { p: bn ? bnNumber(this.p) : enNumber(this.p) }), { lang: bn ? "bn" : "en" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    this.floatMsg(t("chHint", { p: digit(this.p) }), 0xffd166);
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  /** Big note visual for the CHANGE question (৳50 or ৳100). */
  private showBigNote(denom: number) {
    this.noteVisual.removeAll(true);
    const w = 96;
    const h = 60;
    const color = NOTE_COLORS[denom] ?? 0x6b7280;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 5);
    const label = this.add.text(0, 0, `৳${digit(denom)}`, txt(28, "#ffffff", { bold: true })).setOrigin(0.5);
    this.noteVisual.add([g, label]);
    this.noteVisual.setPosition(this.scale.width / 2, this.scale.height * 0.35);
  }

  private advance(ms: number) {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.qIndex++;
      this.time.delayedCall(1000, () => this.askQuestion());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(`${t("chDone")}  ${digit(this.correct)}/${digit(this.total)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.total, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.42, text, txt(26, `#${color.toString(16).padStart(6, "0")}`, { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearAll() {
    this.cards.forEach((o) => o.sprite.destroy());
    this.cards = [];
    this.tray.forEach((o) => o.c.destroy());
    this.tray = [];
    this.noteVisual.removeAll(true);
    this.noteVisual.setVisible(false);
    this.priceText.setVisible(false);
    this.totalText.setVisible(false);
    this.checkBtn.setVisible(false);
    this.fewestMode = false;
    this.noteCount = 0;
  }
}

/** Wrong-answer feedback without hintWrong's "keep on wrong" retirement. */
function hintWrongLocal(scene: Phaser.Scene, tile: Phaser.GameObjects.Container, correct: () => string) {
  scene.tweens.add({ targets: tile, scale: 0.9, duration: 90, yoyo: true, ease: "Sine.easeInOut" });
  tile.setAlpha(0.4);
  tile.disableInteractive();
  const m = scene.add
    .text(tile.x, tile.y - 40, correct(), txt(20, NV_GREEN, { bold: true, outline: true }))
    .setOrigin(0.5)
    .setDepth(40);
  scene.tweens.add({ targets: m, y: m.y - 20, alpha: 0, duration: 700, onComplete: () => m.destroy() });
}
