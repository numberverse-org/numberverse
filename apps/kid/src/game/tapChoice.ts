import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, BTN_NEUTRAL, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

/**
 * Shared config-driven TAP-THE-RIGHT-CHOICE game engine (#71/#74 parts phase).
 *
 * Shows one item emoji + name in the centre, a grid of choice cards below, and
 * asks a question. The kid taps the matching choice. Wrong taps flash the RIGHT
 * choice green as a gentle hint and the same item is retried. Tiered item pools
 * grow with level (lvl 1–2 → famous tier 1, lvl 3–4 → + tier 2, all at 5+).
 *
 * Each concrete scene is a thin subclass supplying its config. Every i18n key
 * lives as a double-quoted camelCase literal in the scene file (audit scanner).
 */
export interface TapChoice {
  value: string;
  key: string;
  icon: string;
}

export interface TapItem {
  id: string;
  emoji: string;
  value: string;
  tier: number;
}

export interface TapChoiceConfig {
  gameId: string;
  titleKey: string;
  /** "{name} — …?" question, shown + spoken. */
  promptKey: string;
  greatKey: string;
  doneKey: string;
  /** Spoken on correct — the choice label interpolates as {choice}. */
  speakKey: string;
  background: string;
  choices: TapChoice[];
  items: TapItem[];
  nameKeys: Record<string, string>;
  rounds: number;
  cols: number;
}

const BN_D = "০১২৩৪৫৬৭৮৯";
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

export abstract class TapChoiceScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private queue: TapItem[] = [];
  private qIdx = 0;
  private correct = 0;
  private wrongThis = false;
  private busy = false;
  private cards: { c: Phaser.GameObjects.Container; choice: TapChoice }[] = [];
  private itemEmoji!: Phaser.GameObjects.Text;
  private itemName!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private geom = { cardW: 0, cardH: 0, startX: 0, topY: 0, gap: 14 };

  protected abstract cfg(): TapChoiceConfig;

  constructor(key: string) {
    super(key);
  }

  private ladder(): number[] {
    return GAMES.find((g) => g.id === this.cfg().gameId)?.difficultyLevels ?? [];
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    const cfg = this.cfg();
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, cfg.background as never);
    this.titleText = this.add.text(0, 0, t(cfg.titleKey), txt(34, "#ffffff", { bold: true })).setOrigin(0.5);
    this.roundText = this.add.text(0, 0, "", txt(18, "#ffd166", { bold: true })).setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add.text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 })).setOrigin(0.5);
    this.tallyText = this.add.text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true })).setOrigin(0.5);
    this.itemEmoji = this.add.text(0, 0, "✨", txt(84, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.itemName = this.add.text(0, 0, "", txt(24, "#ffffff", { bold: true, outline: true, shadow: false })).setOrigin(0.5);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const cfg = this.cfg();
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.tallyText.setPosition(width - 42, 100);
    this.prompt.setPosition(width / 2, height * 0.16);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.itemEmoji.setPosition(width / 2, height * 0.34);
    this.itemName.setPosition(width / 2, height * 0.34 + 62);

    const gap = 14;
    const cols = cfg.cols;
    const rows = Math.ceil(cfg.choices.length / cols);
    const cardW = Math.max(88, Math.min(180, (width - (cols + 1) * gap) / cols));
    const cardH = 118;
    const totalH = rows * cardH + (rows - 1) * gap;
    const topY = Math.max(height * 0.56, height - totalH - 18 - SAB());
    this.geom = { cardW, cardH, startX: width / 2 - (cols * cardW + (cols - 1) * gap) / 2, topY, gap };
    this.cards.forEach((c, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      c.c.setPosition(this.geom.startX + col * (cardW + gap), topY + row * (cardH + gap) + cardH / 2);
    });
  }

  private queueSize(level: number): number {
    const ladder = this.ladder();
    const n = ladder[Math.min(level, ladder.length - 1)] ?? 4;
    return Math.min(n, this.cfg().items.length);
  }

  private startRound() {
    this.clearRound();
    const cfg = this.cfg();
    const pool = cfg.items.filter((it) => it.tier <= (this.levelIndex < 2 ? 1 : this.levelIndex < 4 ? 2 : 3));
    Phaser.Utils.Array.Shuffle(pool);
    this.queue = pool.slice(0, Math.min(pool.length, this.queueSize(this.levelIndex)));
    this.qIdx = 0;
    this.correct = 0;
    this.wrongThis = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, cfg.rounds);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    this.spawnCards();
    this.showCurrent();
  }

  private spawnCards() {
    this.clearCards();
    const cfg = this.cfg();
    const { cardW, cardH, startX, topY, gap } = this.geom;
    const cols = cfg.cols;
    cfg.choices.forEach((ch, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      this.cards.push({ c: this.makeCard(startX + col * (cardW + gap), topY + row * (cardH + gap) + cardH / 2, ch), choice: ch });
    });
  }

  private makeCard(x: number, y: number, ch: TapChoice): Phaser.GameObjects.Container {
    const { cardW, cardH } = this.geom;
    const bg = this.add.graphics();
    bg.fillStyle(BTN_NEUTRAL.top, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    bg.fillStyle(BTN_NEUTRAL.bottom, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    bg.fillStyle(0x93a3b8, 0.5);
    bg.fillRoundedRect(-cardW / 2, cardH / 2 - 8, cardW, 8, 4);
    const icon = this.add.text(0, -16, ch.icon, txt(44, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    const label = this.add.text(0, 30, t(ch.key), txt(22, "#1e293b", { bold: true, shadow: false, wrap: cardW - 16 })).setOrigin(0.5);
    const c = this.add.container(x, y, [bg, icon, label]);
    c.setSize(cardW, cardH);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", () => {
      if (this.busy) return;
      this.tap(ch);
    });
    return c;
  }

  private showCurrent() {
    const cfg = this.cfg();
    const it = this.queue[this.qIdx];
    this.wrongThis = false;
    this.itemEmoji.setText(it.emoji);
    this.itemName.setText(t(cfg.nameKeys[it.id]));
    const name = t(cfg.nameKeys[it.id]);
    this.prompt.setText(t(cfg.promptKey, { name }));
    speak(t(cfg.promptKey, { name }), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private tap(ch: TapChoice) {
    const cfg = this.cfg();
    const it = this.queue[this.qIdx];
    if (ch.value !== it.value) {
      this.wrongThis = true;
      bad();
      this.floatMsg(t("tapTry"));
      const hit = this.cards.find((c) => c.choice === ch)!;
      this.tweens.add({ targets: hit.c, x: hit.c.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
      const right = this.cards.find((c) => c.choice.value === it.value)!;
      this.flashCard(right, 0x4ade80, 0.45);
      return;
    }
    this.busy = true;
    if (!this.wrongThis) this.correct++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    pop();
    win();
    this.floatMsg(t(cfg.greatKey));
    speak(t(cfg.speakKey, { choice: t(ch.key), name: t(cfg.nameKeys[it.id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    const hit = this.cards.find((c) => c.choice === ch)!;
    this.flashCard(hit, 0x4ade80);
    this.time.delayedCall(750, () => this.advance());
  }

  private flashCard(card: { c: Phaser.GameObjects.Container }, color: number, alpha = 0.9) {
    const g = this.add.graphics();
    const { cardW, cardH } = this.geom;
    g.lineStyle(5, color, alpha);
    g.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    card.c.addAt(g, 0);
    this.time.delayedCall(800, () => g.destroy());
  }

  private advance() {
    this.qIdx++;
    if (this.qIdx < this.queue.length) {
      this.busy = false;
      this.time.delayedCall(200, () => this.showCurrent());
      return;
    }
    this.finishRound();
  }

  private finishRound() {
    const cfg = this.cfg();
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t(cfg.doneKey)}  ${digit(this.correct)}/${digit(this.queue.length)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, cfg.rounds);
    this.onRoundDone?.(this.correct === this.queue.length, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= cfg.rounds) this.roundsDone = 0;
      this.levelIndex++;
      this.busy = false;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.24, text, txt(26, "#ffd166", { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearCards() {
    this.cards.forEach((c) => c.c.destroy());
    this.cards = [];
  }

  private clearRound() {
    this.clearCards();
    this.queue = [];
  }
}
