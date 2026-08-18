import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, answerFlash } from "./ui";
import { SAB } from "./safeArea";
import { makeDraggableTo } from "./gestures";

const LEVELS = GAMES.find((g) => g.id === "game-computer")?.difficultyLevels ?? [3, 3, 4, 4, 5, 5];
const ROUNDS_TO_FINISH = 4;

/** i18n keys — double-quoted camelCase literals the audit scanner sees. */
const PART_KEY: Record<string, string> = {
  Monitor: "csMonitor", Keyboard: "csKeyboard", Mouse: "csMouse", CPU: "csCPU",
  Speaker: "csSpeaker", Printer: "csPrinter", Webcam: "csWebcam", Router: "csRouter",
};
const HABIT_KEY: Record<string, string> = {
  WashHands: "csWashHands", ShortBreak: "csShortBreak", KindWords: "csKindWords",
  GoodPosture: "csGoodPosture", SaveWork: "csSaveWork", SitFar: "csSitFar",
  TouchSocket: "csTouchSocket", SharePassword: "csSharePassword", SpillDrink: "csSpillDrink",
  OpenStranger: "csOpenStranger", TooLong: "csTooLong", SleepLate: "csSleepLate",
};

interface Part { id: string; emoji: string; tier: number }
interface Habit { id: string; emoji: string; safe: boolean; tier: number }

const PARTS: Part[] = [
  { id: "Monitor", emoji: "🖥️", tier: 1 },
  { id: "Keyboard", emoji: "⌨️", tier: 1 },
  { id: "Mouse", emoji: "🖱️", tier: 1 },
  { id: "CPU", emoji: "🖲️", tier: 2 },
  { id: "Speaker", emoji: "🔊", tier: 2 },
  { id: "Printer", emoji: "🖨️", tier: 2 },
  { id: "Webcam", emoji: "📹", tier: 3 },
  { id: "Router", emoji: "📡", tier: 3 },
];

const HABITS: Habit[] = [
  { id: "WashHands", emoji: "🧼", safe: true, tier: 1 },
  { id: "ShortBreak", emoji: "☕", safe: true, tier: 1 },
  { id: "KindWords", emoji: "💬", safe: true, tier: 1 },
  { id: "GoodPosture", emoji: "🧍", safe: true, tier: 2 },
  { id: "SaveWork", emoji: "💾", safe: true, tier: 2 },
  { id: "SitFar", emoji: "🪑", safe: true, tier: 2 },
  { id: "TouchSocket", emoji: "🔌", safe: false, tier: 1 },
  { id: "SharePassword", emoji: "🔑", safe: false, tier: 2 },
  { id: "SpillDrink", emoji: "🥤", safe: false, tier: 2 },
  { id: "OpenStranger", emoji: "👤", safe: false, tier: 3 },
  { id: "TooLong", emoji: "🕰️", safe: false, tier: 3 },
  { id: "SleepLate", emoji: "🌙", safe: false, tier: 3 },
];


type RoundKind = "parts" | "habits";

/**
 * Computer safety (#74). A band-3 ICT digital-literacy game with two alternating
 * phases: tap-the-part (monitor/keyboard/mouse/CPU…) and safe/unsafe habit sort
 * (offline-first: wash hands, take breaks, never touch sockets or share
 * passwords). 100% offline — no network features.
 */
export class ComputerSafetyScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private kind: RoundKind = "parts";
  private queue: string[] = [];
  private qIdx = 0;
  private correct = 0;
  private wrongThis = false;
  private busy = false;
  private partCards: { c: Phaser.GameObjects.Container; id: string }[] = [];
  private bins: { c: Phaser.GameObjects.Container; safe: boolean }[] = [];
  private itemBox!: Phaser.GameObjects.Container;
  private itemEmoji!: Phaser.GameObjects.Text;
  private itemName!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private perch = { x: 0, y: 0 };
  private binGeom = { cardW: 0, cardH: 0, startX: 0, c0: 0, c1: 0 };
  private partGeom = { cardW: 0, cardH: 0, startX: 0, topY: 0, gap: 14 };

  constructor() {
    super("ComputerSafety");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add.text(0, 0, t("csTitle"), txt(34, "#ffffff", { bold: true })).setOrigin(0.5);
    this.roundText = this.add.text(0, 0, "", txt(18, NV_GOLD, { bold: true })).setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add.text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 })).setOrigin(0.5);
    this.tallyText = this.add.text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true })).setOrigin(0.5);

    this.itemBox = this.add.container(0, 0).setDepth(20).setSize(120, 120);
    this.itemEmoji = this.add.text(0, -16, "✨", txt(74, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.itemName = this.add.text(0, 44, "", txt(22, "#ffffff", { bold: true, outline: true, shadow: false })).setOrigin(0.5);
    this.itemBox.add([this.itemEmoji, this.itemName]);
    makeDraggableTo(this, this.itemBox, {
      getTargets: () => this.bins.map((b) => b.c),
      onDrop: (target) => {
        if (this.busy || this.kind !== "habits") return;
        const hit = this.bins.find((b) => b.c === target);
        this.dropOn(hit?.safe ?? null);
      },
    });

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
    this.prompt.setPosition(width / 2, height * 0.14);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.perch = { x: width / 2, y: height * 0.35 };
    this.itemBox.setPosition(this.perch.x, this.perch.y);

    const gap = 14;
    // habits bins: 2×1 row
    const cardW = Math.max(130, Math.min(230, (width - 3 * gap) / 2));
    const cardH = 150;
    const startX = width / 2 - (cardW + gap) / 2;
    const bandTop = height * 0.55;
    const y = Math.max(bandTop, height - cardH - 20 - SAB());
    this.binGeom = { cardW, cardH, startX, c0: y + cardH / 2, c1: y + cardH / 2 };
    this.bins.forEach((b, i) => b.c.setPosition(i === 0 ? startX : startX + cardW + gap, y + cardH / 2));

    // part cards: 2×2 grid
    const pW = Math.max(110, Math.min(190, (width - 3 * gap) / 2));
    const pH = 128;
    const pStart = width / 2 - (pW + gap) / 2;
    const pTop = Math.max(bandTop, height - 2 * pH - gap - 18 - SAB());
    this.partGeom = { cardW: pW, cardH: pH, startX: pStart, topY: pTop, gap };
    this.partCards.forEach((p, i) =>
      p.c.setPosition(pStart + (i % 2) * (pW + gap), pTop + Math.floor(i / 2) * (pH + gap) + pH / 2)
    );
  }

  private startRound() {
    this.clearRound();
    this.kind = this.roundsDone % 2 === 0 ? "parts" : "habits";
    const pool = this.kind === "parts"
      ? PARTS
      : HABITS.filter((h) => h.tier <= (this.levelIndex < 2 ? 1 : this.levelIndex < 4 ? 2 : 3));
    const ids = pool.map((p) => p.id);
    Phaser.Utils.Array.Shuffle(ids);
    this.queue = ids.slice(0, Math.min(ids.length, this.queueSize()));
    this.qIdx = 0;
    this.correct = 0;
    this.wrongThis = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    if (this.kind === "parts") this.spawnPartCards();
    else this.spawnBins();
    this.showCurrent();
  }

  private queueSize(): number {
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)] ?? 4;
    return this.kind === "parts" ? Math.min(n, PARTS.length) : Math.min(n, HABITS.length);
  }

  private spawnPartCards() {
    this.clearCards();
    const { cardW, cardH, startX, topY, gap } = this.partGeom;
    PARTS.forEach((p, i) => {
      this.partCards.push({ c: this.makePartCard(startX + (i % 2) * (cardW + gap), topY + Math.floor(i / 2) * (cardH + gap) + cardH / 2, p), id: p.id });
    });
  }

  private makePartCard(x: number, y: number, p: Part): Phaser.GameObjects.Container {
    const { cardW, cardH } = this.partGeom;
    const bg = this.add.graphics();
    bg.fillStyle(0x0b3b6d, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    bg.fillStyle(0x14538f, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    bg.fillStyle(0x93a3b8, 0.5);
    bg.fillRoundedRect(-cardW / 2, cardH / 2 - 8, cardW, 8, 4);
    const icon = this.add.text(0, -16, p.emoji, txt(44, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    const label = this.add.text(0, 30, t(PART_KEY[p.id]), txt(22, "#e0f2fe", { bold: true, shadow: false, wrap: cardW - 16 })).setOrigin(0.5);
    const c = this.add.container(x, y, [bg, icon, label]);
    c.setSize(cardW, cardH);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", () => {
      if (this.busy || this.kind !== "parts") return;
      this.tapPart(p.id);
    });
    return c;
  }

  private spawnBins() {
    this.clearBins();
    const { cardW, cardH, startX, c0 } = this.binGeom;
    const GAP = 14;
    [
      { safe: true, key: "csBinSafe", icon: "✅" },
      { safe: false, key: "csBinUnsafe", icon: "⚠️" },
    ].forEach((cfg, i) => {
      const x = i === 0 ? startX : startX + cardW + GAP;
      this.bins.push({ c: this.makeBin(x, c0, cfg), safe: cfg.safe });
    });
  }

  private makeBin(x: number, y: number, cfg: { key: string; icon: string }): Phaser.GameObjects.Container {
    const { cardW, cardH } = this.binGeom;
    const bg = this.add.graphics();
    bg.fillStyle(BTN_NEUTRAL.top, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(BTN_NEUTRAL.bottom, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(0x93a3b8, 0.5);
    bg.fillRoundedRect(-cardW / 2, cardH / 2 - 10, cardW, 10, 5);
    const icon = this.add.text(0, -20, cfg.icon, txt(40, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    const label = this.add.text(0, 28, t(cfg.key), txt(24, "#1e293b", { bold: true, shadow: false, wrap: cardW - 20 })).setOrigin(0.5);
    const c = this.add.container(x, y, [bg, icon, label]);
    c.setSize(cardW, cardH);
    c.setInteractive({ useHandCursor: true });
    // TAP-TO-ANSWER — tap the bin to answer instead of dragging (same dropOn).
    c.on("pointerdown", () => this.dropOn((cfg as { safe?: boolean }).safe ?? null));
    return c;
  }

  private showCurrent() {
    const id = this.queue[this.qIdx];
    this.wrongThis = false;
    if (this.kind === "parts") {
      this.itemBox.setVisible(false);
      this.prompt.setText(t("csPartQ", { part: t(PART_KEY[id]) }));
      speak(t("csPartQ", { part: t(PART_KEY[id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      return;
    }
    const habit = HABITS.find((h) => h.id === id)!;
    this.itemBox.setVisible(true);
    this.itemEmoji.setText(habit.emoji);
    this.itemName.setText(t(HABIT_KEY[id]));
    this.itemBox.setPosition(this.perch.x, this.perch.y);
    this.itemBox.setAlpha(1);
    this.itemBox.setScale(1);
    const name = t(HABIT_KEY[id]);
    this.prompt.setText(t("csHabitQ", { name }));
    speak(t("csHabitQ", { name }), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private tapPart(id: string) {
    if (this.queue[this.qIdx] !== id) {
      this.wrongThis = true;
      bad();
      this.floatMsg(t("csTry"));
      const card = this.partCards.find((p) => p.id === id)!;
      this.tweens.add({ targets: card.c, x: card.c.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
      return;
    }
    this.busy = true;
    if (!this.wrongThis) this.correct++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.floatMsg(t("csGreat"));
    speak(t("csPartSpeak", { part: t(PART_KEY[id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    const card = this.partCards.find((p) => p.id === id)!;
    this.flashPart(card.c, 0x4ade80);
    this.time.delayedCall(700, () => this.advance());
  }

  private dropOn(safe: boolean | null) {
    if (this.busy) return; // tap/drop mid-animation must not double-fire
    const id = this.queue[this.qIdx];
    const habit = HABITS.find((h) => h.id === id)!;
    if (safe === null) { this.flyBack(); return; }
    if (safe === habit.safe) {
      const bin = this.bins.find((b) => b.safe === safe)!;
      this.busy = true;
      if (!this.wrongThis) this.correct++;
      this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
      pop();
      win();
      this.floatMsg(t("csGreat"));
      speak(t(safe ? "csVerdictSafe" : "csVerdictUnsafe", { name: t(HABIT_KEY[id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.flashBin(bin, 0x4ade80);
      this.tweens.add({
        targets: this.itemBox, x: bin.c.x, y: bin.c.y, scale: 0.7, alpha: 0.6, duration: 260, ease: "Back.easeIn",
        onComplete: () => this.advance(),
      });
      return;
    }
    this.wrongThis = true;
    bad();
    this.floatMsg(t("csHabitWrong"));
    this.flashBin(this.bins.find((b) => b.safe === safe)!, 0xf87171);
    const right = this.bins.find((b) => b.safe === habit.safe)!;
    this.flashBin(right, 0x4ade80, 0.45);
    this.flyBack();
  }

  private flyBack() {
    this.itemBox.setPosition(this.perch.x, this.perch.y);
    this.itemBox.setScale(1);
    this.itemBox.setAlpha(1);
  }

  private flashBin(bin: { c: Phaser.GameObjects.Container }, color: number, alpha = 0.9) {
    const { cardW, cardH } = this.binGeom;
    answerFlash(this, bin.c, color, {
      w: cardW,
      h: cardH,
      alpha,
      radius: 18,
      glyph: color === 0x4ade80 ? "check" : "cross",
    });
  }

  private flashPart(c: Phaser.GameObjects.Container, color: number) {
    const { cardW, cardH } = this.partGeom;
    answerFlash(this, c, color, {
      w: cardW,
      h: cardH,
      alpha: 0.9,
      duration: 700,
      radius: 16,
      glyph: "check",
    });
  }

  private advance() {
    this.itemBox.setAlpha(1);
    this.itemBox.setScale(1);
    this.qIdx++;
    if (this.qIdx < this.queue.length) {
      this.busy = false;
      this.time.delayedCall(200, () => this.showCurrent());
      return;
    }
    this.finishRound();
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t(this.kind === "parts" ? "csPartDone" : "csHabitDone")}  ${digit(this.correct)}/${digit(this.queue.length)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.queue.length, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.busy = false;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.24, text, NV_GOLD, 26, -24);
  }

  private clearRound() {
    this.clearBins();
    this.clearCards();
    this.queue = [];
  }

  private clearBins() {
    this.bins.forEach((b) => b.c.destroy());
    this.bins = [];
  }

  private clearCards() {
    this.partCards.forEach((p) => p.c.destroy());
    this.partCards = [];
  }
}
