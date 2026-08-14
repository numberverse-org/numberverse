import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { makeDraggableTo } from "./gestures";

const LEVELS = GAMES.find((g) => g.id === "game-plants")?.difficultyLevels ?? [3, 3, 4, 4, 4, 5];
const ROUNDS_TO_FINISH = 4;

/** i18n keys — double-quoted camelCase literals the audit scanner sees. */
const PART_KEY: Record<string, string> = { Root: "plpRoot", Stem: "plpStem", Leaf: "plpLeaf", Flower: "plpFlower" };
const NEED_KEY: Record<string, string> = {
  Water: "plpWater", Sun: "plpSun", Soil: "plpSoil", Air: "plpAir",
  Candy: "plpCandy", Toy: "plpToy", Phone: "plpPhone", Icecream: "plpIcecream",
};

interface Part { id: string; emoji: string; tier: number }
interface Need { id: string; emoji: string; need: boolean; tier: number }

const PARTS: Part[] = [
  { id: "Root", emoji: "🌱", tier: 1 },
  { id: "Stem", emoji: "🌿", tier: 1 },
  { id: "Leaf", emoji: "🍃", tier: 1 },
  { id: "Flower", emoji: "🌸", tier: 1 },
];

const NEEDS: Need[] = [
  { id: "Water", emoji: "💧", need: true, tier: 1 },
  { id: "Sun", emoji: "☀️", need: true, tier: 1 },
  { id: "Soil", emoji: "🪱", need: true, tier: 2 },
  { id: "Air", emoji: "🌬️", need: true, tier: 2 },
  { id: "Candy", emoji: "🍬", need: false, tier: 1 },
  { id: "Toy", emoji: "🧸", need: false, tier: 2 },
  { id: "Phone", emoji: "📱", need: false, tier: 2 },
  { id: "Icecream", emoji: "🍦", need: false, tier: 3 },
];

/** Plant growth stages as the kid answers correctly: seed → sprout → bloom. */
const GROWTH = ["🌰", "🌱", "🌿", "🌸"];
const STAGE_STEP = 3;

const BN_D = "০১২৩৪৫৬৭৮৯";
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

type RoundKind = "parts" | "needs";

/**
 * Plants — parts & needs (#69). A band-2 science game with two alternating
 * phases: tap-the-part (find root/stem/leaf/flower) and needs-sort (drag what
 * a plant needs into the pot). A seed on screen grows → sprout → bloom as the
 * kid answers correctly.
 */
export class PlantPartsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private kind: RoundKind = "parts";
  private queue: string[] = [];       // item ids for the current round
  private qIdx = 0;
  private correct = 0;
  private wrongThis = false;
  private totalCorrect = 0;
  private busy = false;
  private partCards: { c: Phaser.GameObjects.Container; id: string }[] = [];
  private bins: { c: Phaser.GameObjects.Container; need: boolean }[] = [];
  private itemBox!: Phaser.GameObjects.Container;
  private itemEmoji!: Phaser.GameObjects.Text;
  private itemName!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private growText!: Phaser.GameObjects.Text;
  private growEmoji!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private perch = { x: 0, y: 0 };
  private binGeom = { cardW: 0, cardH: 0, startX: 0, c0: 0, c1: 0 };
  private partGeom = { cardW: 0, cardH: 0, startX: 0, c0: 0, c1: 0 };

  constructor() {
    super("PlantParts");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "forest");
    this.titleText = this.add.text(0, 0, t("plpTitle"), txt(34, "#ffffff", { bold: true })).setOrigin(0.5);
    this.roundText = this.add.text(0, 0, "", txt(18, NV_GOLD, { bold: true })).setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add.text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 })).setOrigin(0.5);
    this.tallyText = this.add.text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true })).setOrigin(0.5);
    this.growEmoji = this.add.text(0, 0, GROWTH[0], txt(48, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.growText = this.add.text(0, 0, "", txt(15, "#a7f3d0", { bold: true, shadow: false })).setOrigin(0.5);

    this.itemBox = this.add.container(0, 0).setDepth(20).setSize(120, 120);
    this.itemEmoji = this.add.text(0, -16, "✨", txt(74, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.itemName = this.add.text(0, 44, "", txt(22, "#ffffff", { bold: true, outline: true, shadow: false })).setOrigin(0.5);
    this.itemBox.add([this.itemEmoji, this.itemName]);
    makeDraggableTo(this, this.itemBox, {
      getTargets: () => this.bins.map((b) => b.c),
      onDrop: (target) => {
        if (this.busy || this.kind !== "needs") return;
        const hit = this.bins.find((b) => b.c === target);
        this.dropOn(hit?.need ?? null);
      },
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
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
    this.growEmoji.setPosition(width / 2, height * 0.2);
    this.growText.setPosition(width / 2, height * 0.2 + 40);
    this.perch = { x: width / 2, y: height * 0.35 };
    this.itemBox.setPosition(this.perch.x, this.perch.y);

    // needs bins: 2×1 row
    const gap = 14;
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
    this.partGeom = { cardW: pW, cardH: pH, startX: pStart, c0: pTop + pH / 2, c1: pTop + pH + gap + pH / 2 };
    this.partCards.forEach((p, i) =>
      p.c.setPosition(i % 2 === 0 ? pStart : pStart + pW + gap, i < 2 ? pTop + pH / 2 : pTop + pH + gap + pH / 2)
    );
  }

  private startRound() {
    this.clearRound();
    this.kind = this.roundsDone % 2 === 0 ? "parts" : "needs";
    const pool = this.kind === "parts"
      ? PARTS
      : NEEDS.filter((n) => n.tier <= (this.levelIndex < 2 ? 1 : this.levelIndex < 4 ? 2 : 3));
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
    return this.kind === "parts" ? Math.min(n, PARTS.length) : Math.min(n, NEEDS.length);
  }

  private spawnPartCards() {
    this.clearCards();
    const { cardW, cardH, startX, c0, c1 } = this.partGeom;
    const GAP = 14;
    PARTS.forEach((p, i) => {
      const x = i % 2 === 0 ? startX : startX + cardW + GAP;
      const y = i < 2 ? c0 : c1;
      this.partCards.push({ c: this.makePartCard(x, y, p), id: p.id });
    });
  }

  private makePartCard(x: number, y: number, p: Part): Phaser.GameObjects.Container {
    const { cardW, cardH } = this.partGeom;
    const bg = this.add.graphics();
    bg.fillStyle(0x14532d, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(0x166534, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(0x93a3b8, 0.5);
    bg.fillRoundedRect(-cardW / 2, cardH / 2 - 10, cardW, 10, 5);
    const icon = this.add.text(0, -18, p.emoji, txt(46, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    const label = this.add.text(0, 30, t(PART_KEY[p.id]), txt(24, "#dcfce7", { bold: true, shadow: false })).setOrigin(0.5);
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
      { need: true, key: "plpBinNeed", icon: "💧", verdict: "plpVerdictNeed" },
      { need: false, key: "plpBinNot", icon: "✋", verdict: "plpVerdictNot" },
    ].forEach((cfg, i) => {
      const x = i === 0 ? startX : startX + cardW + GAP;
      const bin = this.makeBin(x, c0, cfg);
      this.bins.push({ c: bin, need: cfg.need });
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
    return c;
  }

  private showCurrent() {
    const id = this.queue[this.qIdx];
    this.wrongThis = false;
    if (this.kind === "parts") {
      const part = PARTS.find((p) => p.id === id)!;
      this.itemBox.setVisible(false);
      this.prompt.setText(t("plpPartQ", { part: t(PART_KEY[id]) }));
      speak(t("plpPartQ", { part: t(PART_KEY[id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      return;
    }
    const need = NEEDS.find((n) => n.id === id)!;
    this.itemBox.setVisible(true);
    this.itemEmoji.setText(need.emoji);
    this.itemName.setText(t(NEED_KEY[id]));
    this.itemBox.setPosition(this.perch.x, this.perch.y);
    this.itemBox.setAlpha(1);
    this.itemBox.setScale(1);
    const name = t(NEED_KEY[id]);
    this.prompt.setText(t("plpNeedQ", { name }));
    speak(t("plpNeedQ", { name }), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private tapPart(id: string) {
    if (this.queue[this.qIdx] !== id) {
      this.wrongThis = true;
      bad();
      this.floatMsg(t("plpTry"));
      const card = this.partCards.find((p) => p.id === id)!;
      this.tweens.add({ targets: card.c, x: card.c.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
      return;
    }
    const part = PARTS.find((p) => p.id === id)!;
    this.busy = true;
    if (!this.wrongThis) this.correct++;
    this.totalCorrect++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.grow();
    this.floatMsg(t("plpPartGreat", { part: t(PART_KEY[id]) }));
    speak(t("plpPartGreat", { part: t(PART_KEY[id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    const card = this.partCards.find((p) => p.id === id)!;
    this.flashPart(card.c, 0x4ade80);
    this.time.delayedCall(700, () => this.advance());
  }

  private dropOn(need: boolean | null) {
    const id = this.queue[this.qIdx];
    const item = NEEDS.find((n) => n.id === id)!;
    if (need === null) { this.flyBack(); return; }
    if (need === item.need) {
      const bin = this.bins.find((b) => b.need === need)!;
      this.busy = true;
      if (!this.wrongThis) this.correct++;
      this.totalCorrect++;
      this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
      pop();
      win();
      this.grow();
      this.floatMsg(t("plpGreat"));
      speak(t(need ? "plpVerdictNeed" : "plpVerdictNot", { name: t(NEED_KEY[id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.flashBin(bin, 0x4ade80);
      this.tweens.add({
        targets: this.itemBox, x: bin.c.x, y: bin.c.y, scale: 0.7, alpha: 0.6, duration: 260, ease: "Back.easeIn",
        onComplete: () => this.advance(),
      });
      return;
    }
    this.wrongThis = true;
    bad();
    this.floatMsg(t("plpWrong"));
    this.flashBin(this.bins.find((b) => b.need === need)!, 0xf87171);
    const right = this.bins.find((b) => b.need === item.need)!;
    this.flashBin(right, 0x4ade80, 0.45);
    this.flyBack();
  }

  private grow() {
    const stage = Math.min(GROWTH.length - 1, Math.floor(this.totalCorrect / STAGE_STEP));
    this.growEmoji.setText(GROWTH[stage]);
    this.growText.setText(stage >= GROWTH.length - 1 ? t("plpBloom") : t("plpSprout"));
    this.tweens.add({ targets: this.growEmoji, scale: 1.35, duration: 220, yoyo: true, ease: "Back.easeInOut" });
  }

  private flyBack() {
    this.itemBox.setPosition(this.perch.x, this.perch.y);
    this.itemBox.setScale(1);
    this.itemBox.setAlpha(1);
  }

  private flashBin(bin: { c: Phaser.GameObjects.Container }, color: number, alpha = 0.9) {
    const g = this.add.graphics();
    const { cardW, cardH } = this.binGeom;
    g.lineStyle(5, color, alpha);
    g.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bin.c.addAt(g, 0);
    this.time.delayedCall(900, () => g.destroy());
  }

  private flashPart(c: Phaser.GameObjects.Container, color: number) {
    const g = this.add.graphics();
    const { cardW, cardH } = this.partGeom;
    g.lineStyle(5, color, 0.9);
    g.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    c.addAt(g, 0);
    this.time.delayedCall(700, () => g.destroy());
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
    this.floatMsg(`${t("plpDone")}  ${digit(this.correct)}/${digit(this.queue.length)}`);
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
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.28, text, txt(26, NV_GOLD, { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
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
