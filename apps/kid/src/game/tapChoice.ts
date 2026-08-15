import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { hintWrong, hintIntro } from "./hints";
import { txt, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

/**
 * Shared config-driven TAP-THE-RIGHT-CHOICE game engine (#71/#74 parts phase).
 *
 * Shows one item emoji + name in the centre, a grid of choice cards below, and
 * asks a question. The kid taps the matching choice. Wrong taps retire the
 * tapped card, then walk the SAME adaptive hint ladder as every sibling scene
 * (soft nudge → coaching banner → reveal), so the answer is never flashed green
 * on the first miss. Tiered item pools grow with level (lvl 1–2 → famous tier 1,
 * lvl 3–4 → + tier 2, all at 5+).
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
  /** Optional spoken item→answer LINK spoken at round start (the choice value
   *  maps to a key like "you SEE a {name} — tap the eye"). More concrete than
   *  the generic prompt for pre-readers; falls back to promptKey when absent. */
  linkKeys?: Record<string, string>;
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
  /** Soft bubble behind the item emoji so it reads as "the thing" — visually
   *  distinct from the flat rectangular choice cards below (#1238). */
  private itemBubble!: Phaser.GameObjects.Graphics;
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
    this.roundText = this.add.text(0, 0, "", txt(18, NV_GOLD, { bold: true })).setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add.text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 })).setOrigin(0.5);
    this.tallyText = this.add.text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true })).setOrigin(0.5);
    // bubble first so it renders BEHIND the emoji (creation order = draw order)
    this.itemBubble = this.add.graphics();
    this.itemEmoji = this.add.text(0, 0, "✨", txt(84, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.itemName = this.add.text(0, 0, "", txt(24, "#ffffff", { bold: true, outline: true, shadow: false })).setOrigin(0.5);

    onSceneResize(this, () => this.layout());
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
    // soft pill bubble containing the item — round + tinted, unlike the flat
    // rectangular choice cards, so the "thing to match" is unmistakable
    this.itemBubble.clear();
    this.itemBubble.fillStyle(0xffffff, 0.1);
    this.itemBubble.fillRoundedRect(width / 2 - 72, height * 0.34 - 56, 144, 116, 28);
    this.itemBubble.lineStyle(3, 0xffffff, 0.45);
    this.itemBubble.strokeRoundedRect(width / 2 - 72, height * 0.34 - 56, 144, 116, 28);

    const gap = 14;
    const cols = cfg.cols;
    const rows = Math.ceil(cfg.choices.length / cols);
    // #1093 — fit the grid on ANY screen. Before: fixed cardH=118 and
    // topY=max(0.56h, bottom-anchor) — a tall grid (many rows) overflowed past
    // the bottom edge on short phones, and the old cardW floor of 88 clipped
    // wide grids horizontally (5 senses × 88px = 496px on a 360px canvas).
    // Mirror ui.ts gridLayout()'s band-clamping: cap cardW so every col stays
    // on-screen, and shrink cardH so the grid always sits between the item
    // bubble/name and the bottom edge. Current 1-row FiveSenses renders at the
    // same size/position as before (verified); this hardens the base for any
    // future taller config.
    const cardW = Math.min(180, Math.max(52, (width - (cols + 1) * gap) / cols));
    const bandBottom = height - 18 - SAB();
    const bandTop = Math.max(height * 0.56, height * 0.34 + 82); // clears the item bubble + name
    const bandH = Math.max(0, bandBottom - bandTop);
    const cardH = Math.min(118, Math.max(64, Math.floor((bandH - (rows - 1) * gap) / rows)));
    const totalH = rows * cardH + (rows - 1) * gap;
    const topY = bandBottom - totalH; // bottom-anchored: always fits above the bottom edge
    this.geom = { cardW, cardH, startX: width / 2 - (cols * cardW + (cols - 1) * gap) / 2, topY, gap };
    this.cards.forEach((c, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      // + cardW/2 centers each card within its cell (matches the vertical
      // + cardH/2) — without it the first card's left half hangs off-screen.
      c.c.setPosition(this.geom.startX + col * (cardW + gap) + cardW / 2, topY + row * (cardH + gap) + cardH / 2);
    });
  }

  private queueSize(level: number): number {
    const ladder = this.ladder();
    const n = ladder[Math.min(level, ladder.length - 1)] ?? 4;
    return Math.min(n, this.cfg().items.length);
  }

  private startRound() {
    this.clearRound();
    // #1061 — expose this round's difficulty to the shared celebration engine.
    this.data.set("nv:difficulty", this.levelIndex + 1);
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
      this.cards.push({ c: this.makeCard(startX + col * (cardW + gap) + cardW / 2, topY + row * (cardH + gap) + cardH / 2, ch), choice: ch });
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
    // #1093 — content scales with cardH (69px on short phones) so the icon and
    // label never clip outside a shrunken card (the 118px-card y was hard-coded).
    const iconY = Math.round(-cardH * 0.135); // -16 at cardH 118
    const labelY = Math.round(cardH * 0.254); // +30 at cardH 118
    const iconSize = Math.min(44, Math.max(30, Math.round(cardH * 0.42)));
    const icon = this.add.text(0, iconY, ch.icon, txt(iconSize, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    const label = this.add.text(0, labelY, t(ch.key), txt(22, "#1e293b", { bold: true, shadow: false, wrap: cardW - 16 })).setOrigin(0.5);
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
    // #1245 — narrate the ITEM → SENSE link aloud ("A rainbow — you see it with
    // your eyes! Tap the eye") so a pre-reader hears WHY each choice matches.
    // Scenes without linkKeys fall back to the generic prompt speech.
    const linkKey = cfg.linkKeys?.[it.value] ?? cfg.promptKey;
    speak(t(linkKey, { name }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    // #1480 — first-run onboarding: show + speak ONE example of a correct move
    // before the kid can miss this mechanic. hintIntro() keeps it once per scene
    // session, so later items keep the normal prompt narration.
    hintIntro(this, { intro: () => t("tapHint") });
  }

  private tap(ch: TapChoice) {
    const cfg = this.cfg();
    const it = this.queue[this.qIdx];
    if (ch.value !== it.value) {
      this.wrongThis = true;
      // #1479 — route through the SAME adaptive hint ladder every sibling scene
      // uses. Miss #1 is a soft nudge; reveal ("the answer is X") is deferred to
      // miss #2–#4 by Moni confidence instead of flashing green on the first tap.
      const hit = this.cards.find((c) => c.choice === ch)!;
      hintWrong(this, hit.c, {
        hint: () => t("tapHint"),
        hintBn: () => t("tapHint"),
        correct: () => it.value,
        options: () => this.cards.map((c) => ({ sprite: c.c, value: c.choice.value })),
      });
      return;
    }
    this.busy = true;
    if (!this.wrongThis) this.correct++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    pop();
    win();
    // #1198 — the config bases are the pattern: every derived scene gets the
    // full combo reward (confetti/starBurst) for free, not a bare audio blip.
    const hit = this.cards.find((c) => c.choice === ch)!;
    correctCelebrate(this, hit.c.x, hit.c.y);
    this.floatMsg(t(cfg.greatKey));
    speak(t(cfg.speakKey, { choice: t(ch.key), name: t(cfg.nameKeys[it.id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
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
      .text(this.scale.width / 2, this.scale.height * 0.24, text, txt(26, NV_GOLD, { bold: true, outline: true, wrap: 320 }))
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
