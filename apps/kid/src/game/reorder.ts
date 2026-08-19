import Phaser from "phaser";
import { digit } from "./i18n";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { questionPanel, type QuestionPanelApi } from "./question";
import { hintIntro } from "./hints";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, type GridLayout, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

/**
 * Shared DRAG-REORDER game engine (#1146).
 *
 * A drag-to-place scene: the kid drags item cards onto a row of ordered slots
 * (or into labelled target zones — the same drag plumbing powers both). The
 * base owns the whole pointer dragstart/drag/dragend lifecycle, the
 * per-round challenge countdown (#1158), and the correct/wrong celebration
 * bookkeeping, so each concrete scene only supplies its content.
 *
 * Default flow (swap-reorder, e.g. alphabet / days / story order):
 *   · a row of numbered slots is laid out from the ladder
 *   · shuffled item cards sit in the slots
 *   · dragging a card onto another slot swaps the two; when every card is in
 *     its home slot the round solves
 *   · correct → pop + win + correctCelebrate + onRoundDone(true, ms, level)
 *   · wrong placements simply bounce back so the kid can keep trying
 *
 * Target-drop scenes (CVC build / word families / village-city) override
 * dealRound() and onDrop() and reuse the same drag + challenge + round loop.
 *
 * Each concrete scene is a thin subclass supplying cfg() + content hooks.
 * Every i18n key lives as a double-quoted camelCase literal in the scene file
 * so the audit scanner sees it.
 */

/** A single draggable card / tile. */
export interface DragReorderItem {
  /** Machine identity (word, letter, family, …). */
  value: string;
  /** Primary label drawn on the card. */
  label: string;
  /** Optional emoji drawn above the label. */
  emoji?: string;
  /** Optional second line (e.g. the other language's label). */
  sub?: string;
  /** For target-drop scenes: the target value this item belongs to. */
  targetValue?: string;
}

/** A drop target: an ordered slot, bucket or zone. */
export interface DragTarget {
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Optional rendered object owned by this target (destroyed with the round). */
  obj?: Phaser.GameObjects.Container | Phaser.GameObjects.Zone;
}

/** Live draggable card state. */
export interface DragCard {
  obj: Phaser.GameObjects.Container;
  item: DragReorderItem;
  homeX: number;
  homeY: number;
  /** Slot index this card currently occupies (-1 for a free tray card). */
  slot: number;
  placed: boolean;
}

export interface DragReorderConfig {
  /** The game id whose difficulty ladder this scene follows. */
  gameId: string;
  /** i18n header key. */
  titleKey: string;
  /** i18n question bubble (omitted → no question bubble, e.g. word families). */
  promptKey?: string;
  /** i18n praise message. */
  greatKey: string;
  /** i18n level-complete message. */
  doneKey: string;
  /** gameBackground() theme. */
  background: string;
  /** Rounds to finish per level. */
  rounds: number;
  /** Card height for the slot row. */
  cardH: number;
  /** Speech language for the spoken victory line. */
  speakLang?: "en" | "bn";
  /** Show the done message when a level wraps (default true). */
  announceDone?: boolean;
  /** "swap" = cards live in a locked row and swap places (default);
   *  "free" = cards follow the finger to any target. */
  dragMode?: "swap" | "free";
  /** Scale pop applied while a card is being dragged (default 1.12). */
  dragScale?: number;
  /** Slot number colour (default gold). */
  stepColor?: string;
  /** Slot number font size (default 18). */
  stepSize?: number;
  /** Slot number vertical offset above the slot (default 20). */
  stepOffset?: number;
  /** Swap-row grid tuning — all optional with sensible defaults. */
  slotPreferredW?: (n: number) => number;
  slotMinW?: number;
  slotWidthPad?: number;
  slotGapX?: number;
  slotTopPadRatio?: number;
  slotBottomPad?: number;
  /** Card label size as a function of card width (default: shrink small cards). */
  labelSize?: (w: number) => number;
}

/** Scene-start data contract (matches the App's game.scene.start payload). */
export interface DragReorderData {
  onRoundDone: (correct: boolean, ms: number, difficulty: number) => void;
  startLevelIndex?: number;
  mode?: string;
  skill?: string;
  challenge?: boolean;
  levels?: number[];
}

const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure
export abstract class DragReorderScene extends Phaser.Scene {
  protected levelIndex = 0;
  protected roundsDone = 0;
  protected startedAt = 0;
  protected locked = false;
  protected challenge = false;
  protected challengeDone = false;
  protected challengeTimer?: Phaser.Time.TimerEvent;
  protected challengeBar?: Phaser.GameObjects.Rectangle;
  protected onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;

  protected titleText!: Phaser.GameObjects.Text;
  protected roundText!: Phaser.GameObjects.Text;
  protected meter!: RoundMeterApi;
  protected prompt?: QuestionPanelApi;

  protected cards: DragCard[] = [];
  protected targets: DragTarget[] = [];
  protected order: number[] = [];
  protected slotX: number[] = [];
  protected slotCy = 0;
  protected stepLabels: Phaser.GameObjects.Text[] = [];
  /** #1999 — tap-to-answer fallback: the card a kid tapped first (awaiting a
   *  second tap to place it). Null when nothing is selected. */
  protected selectedCard: DragCard | null = null;
  /** #1999 — true between dragstart and the pointerup that follows dragend, so
   *  the tap fallback never double-fires after a tiny (<8px) drag. */
  protected dragActive = false;

  protected abstract cfg(): DragReorderConfig;

  constructor(key: string) {
    super(key);
  }

  protected ladder(): number[] {
    return GAMES.find((g) => g.id === this.cfg().gameId)?.difficultyLevels ?? [];
  }

  /**
   * #934 — shared cleanup hook. Phaser never calls a user `shutdown()`
   * automatically, so the base wires its own SHUTDOWN listener. Derived scenes
   * get one consistent teardown point (override + call super).
   */
  protected shutdown() {
    // The challenge countdown is the one shared, non-Phaser-managed resource:
    // drop the pending timer + bar tween before the scene hibernates.
    this.disarmChallenge();
  }

  /** Parse scene-specific data fields (mode/skill/…) BEFORE cfg() is read. */
  protected prepare(_data: DragReorderData) {}

  /** Create scene-specific UI AFTER the background but BEFORE the shared chrome. */
  protected onCreate(_data: DragReorderData) {}

  protected titleString(): string {
    return t(this.cfg().titleKey);
  }

  protected promptString(): string {
    const key = this.cfg().promptKey ?? "";
    return key ? t(key) : "";
  }

  protected speechLang(): "en" | "bn" {
    return this.cfg().speakLang ?? (getAppLang() === "bn" ? "bn" : "en");
  }

  create(data: DragReorderData) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.challenge = !!data.challenge;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    this.prepare(data);
    const cfg = this.cfg();
    gameBackground(this, cfg.background as never);
    this.onCreate(data);
    this.titleText = this.add
      .text(0, 0, this.titleString(), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    if (cfg.promptKey) {
      this.prompt = questionPanel(this, 0, 0);
      this.prompt.set(this.promptString());
    }
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    onSceneResize(this, () => this.layout());
    this.registerDrag();
    this.registerTap();
    this.layout();
    this.startRound();
  }

  /** The whole drag lifecycle lives here — never re-implemented per scene. */
  private registerDrag() {
    this.input.on("dragstart", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDragStart(p, obj));
    this.input.on("drag", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDrag(p, obj));
    this.input.on("dragend", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDragEnd(p, obj));
  }

  protected layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    if (this.prompt) this.prompt.setPosition(width / 2, height * 0.22);
    this.layoutContent();
  }

  protected layoutContent() {}

  protected startRound() {
    this.clearRound();
    this.locked = false;
    this.selectedCard = null;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, this.cfg().rounds);
    // #1061 — expose this round's difficulty to the shared celebration engine.
    this.data.set("nv:difficulty", this.levelIndex + 1);
    this.dealRound();
    this.armChallenge();
  }

  /** #1999 — TAP-TO-ANSWER fallback (mirrors binSort's pointerdown). Registered
   *  ONCE in create(), not per round: a scene-level pointerup that hit-tests by
   *  coordinates, so it works uniformly for swap-mode (tap card → tap card) and
   *  free-mode scenes (tap tray card → tap slot/zone) INCLUDING VillageCity,
   *  whose zones are drawn graphics with no interactive `obj`. */
  protected registerTap() {
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (this.locked) return;
      if (this.dragActive) {
        // a drag just ended (onDragEnd already placed it) — don't also treat the
        // release as a tap. Reset for the next interaction.
        this.dragActive = false;
        return;
      }
      const dx = p.x - p.downX;
      const dy = p.y - p.downY;
      if (Math.hypot(dx, dy) > 8) return; // genuine drag, not a tap
      const card = this.hitCard(p.x, p.y);
      if (card) {
        this.onCardTap(card);
        return;
      }
      // Empty-space tap: place a selected card into the nearest target/zone.
      if (this.selectedCard) {
        const sel = this.selectedCard;
        const target = this.targetAt(p.x, p.y);
        this.clearSelection();
        if (target) this.onDrop(sel, target);
      }
    });
    this.input.on("pointercancel", () => {
      this.dragActive = false;
    });
  }

  /** The non-placed card under a point, if any (tap target hit-test). */
  protected hitCard(x: number, y: number): DragCard | null {
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      if (c.placed) continue;
      if (c.obj.getBounds().contains(x, y)) return c;
    }
    return null;
  }

  /** Nearest target/zone under a point (null when far from all). */
  protected targetAt(x: number, y: number): DragTarget | null {
    let best: DragTarget | null = null;
    let bestD = Infinity;
    const pad = 24;
    for (const target of this.targets) {
      const rx = target.w / 2 + pad;
      const ry = target.h / 2 + pad;
      const dx = Math.max(Math.abs(x - target.x) - rx, 0);
      const dy = Math.max(Math.abs(y - target.y) - ry, 0);
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = target;
      }
    }
    return bestD > 60 ? null : best;
  }

  /** Tap #1 selects the card; tap #2 (another card or empty space) places it. */
  protected onCardTap(card: DragCard) {
    if (this.locked) return;
    if (this.selectedCard === card) {
      this.clearSelection();
      return;
    }
    if (this.selectedCard) {
      if (this.cfg().dragMode === "free") {
        // Free mode: you place a tray card into a TARGET, not onto another card.
        // Tapping a second tray card just re-selects it.
        this.clearSelection();
        this.selectCard(card);
        return;
      }
      // Swap mode: place the selected card onto the tapped card's slot.
      const sel = this.selectedCard;
      this.clearSelection();
      this.onDrop(sel, this.nearestTarget(card.obj));
    } else {
      this.selectCard(card);
    }
  }

  protected selectCard(card: DragCard) {
    this.selectedCard = card;
    card.obj.setDepth(20);
    this.tweens.add({ targets: card.obj, scale: this.cfg().dragScale ?? 1.12, duration: 90, ease: "Sine.easeOut" });
  }

  protected clearSelection() {
    const c = this.selectedCard;
    this.selectedCard = null;
    if (!c) return;
    c.obj.setDepth(10);
    this.tweens.add({ targets: c.obj, scale: 1, duration: 90, ease: "Sine.easeInOut" });
  }

  /** Build the round: slots + shuffled cards (default swap-reorder flow). */
  protected dealRound() {
    const cfg = this.cfg();
    const items = this.roundItems();
    const n = items.length;
    this.order = Array.from({ length: n }, (_, i) => i);
    // shuffle until NOT already in order — every round needs a real move
    while (this.order.every((v, i) => v === i)) {
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Phaser.Math.Between(0, i);
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    }

    const gl = this.slotGrid(n);
    this.slotCy = gl.cy;
    this.slotX = Array.from({ length: n }, (_, i) => gl.startX + i * gl.spacingX);
    for (let i = 0; i < n; i++) {
      this.stepLabels.push(this.makeStepLabel(i, this.slotX[i], gl.cy));
    }

    this.cards = this.order.map((itemIdx, slot) => {
      const card = this.makeCard(items[itemIdx], this.slotX[slot], gl.cy, gl.cardW, cfg.cardH);
      this.input.setDraggable(card);
      return { obj: card, item: items[itemIdx], homeX: this.slotX[slot], homeY: gl.cy, slot, placed: false };
    });
    this.targets = this.slotX.map((sx, i) => ({
      value: String(i),
      x: sx,
      y: this.slotCy,
      w: gl.cardW,
      h: cfg.cardH,
    }));

    // Phase 4 — the reorder prompt is shown but was never SPOKEN, leaving
    // pre-readers on AlphaOrder/BanglaDays/Story silent. Speak it once per
    // round, and give a one-time "how to answer" cue (drag the card into order).
    if (this.prompt) {
      const line = this.promptString();
      if (line) speak(line, { lang: this.speechLang() });
    }
    hintIntro(this, { intro: () => t("sortHint") });
  }

  /** Correct-order items for this round (swap-reorder scenes). */
  protected roundItems(): DragReorderItem[] {
    return [];
  }

  protected slotGrid(n: number): GridLayout {
    const cfg = this.cfg();
    return gridLayout(this, {
      cols: n,
      rows: 1,
      preferredW: cfg.slotPreferredW ? cfg.slotPreferredW(n) : n <= 4 ? 180 : 140,
      minW: cfg.slotMinW ?? 52,
      widthPad: cfg.slotWidthPad ?? 14,
      gapX: cfg.slotGapX,
      topPad: this.scale.height * (cfg.slotTopPadRatio ?? 0.42),
      bottomY: this.scale.height - (cfg.slotBottomPad ?? 50) - SAB(),
      cardH: cfg.cardH,
    });
  }

  protected makeStepLabel(i: number, x: number, cy: number): Phaser.GameObjects.Text {
    const cfg = this.cfg();
    return this.add
      .text(
        x,
        cy - cfg.cardH / 2 - (cfg.stepOffset ?? 20),
        digit(i + 1),
        txt(cfg.stepSize ?? 18, cfg.stepColor ?? NV_GOLD, { bold: true, outline: true })
      )
      .setOrigin(0.5);
  }

  protected makeCard(item: DragReorderItem, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const cfg = this.cfg();
    const fs = cfg.labelSize ? cfg.labelSize(w) : w < 72 ? 12 : 16;
    return modernCardButton(this, x, y, w, h, item.label, BTN_NEUTRAL, fs, w - 8);
  }

  protected cardFor(obj: Phaser.GameObjects.Container): DragCard | undefined {
    return this.cards.find((c) => c.obj === obj);
  }

  protected onDragStart(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    const card = this.cardFor(obj);
    if (!card) return;
    this.dragActive = true; // #1999 — suppress the tap fallback on the release
    obj.setDepth(30);
    this.tweens.add({ targets: obj, scale: this.cfg().dragScale ?? 1.12, duration: 90, ease: "Sine.easeOut" });
  }

  protected onDrag(p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    const card = this.cardFor(obj);
    if (!card) return;
    if (this.cfg().dragMode === "free") {
      obj.x = p.x;
      obj.y = p.y;
      return;
    }
    obj.x = Phaser.Math.Clamp(p.x, this.slotX[0] - 40, this.slotX[this.slotX.length - 1] + 40);
    obj.y = this.slotCy;
  }

  protected onDragEnd(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    const card = this.cardFor(obj);
    if (!card) return;
    obj.setDepth(10);
    this.tweens.add({ targets: obj, scale: 1, duration: 90, ease: "Sine.easeInOut" });
    this.onDrop(card, this.nearestTarget(obj));
  }

  /** Nearest drop target under the dragged card (null when far from all). */
  protected nearestTarget(obj: Phaser.GameObjects.Container): DragTarget | null {
    let best: DragTarget | null = null;
    let bestD = Infinity;
    const pad = 24;
    for (const target of this.targets) {
      const rx = target.w / 2 + pad;
      const ry = target.h / 2 + pad;
      const dx = Math.max(Math.abs(obj.x - target.x) - rx, 0);
      const dy = Math.max(Math.abs(obj.y - target.y) - ry, 0);
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = target;
      }
    }
    return bestD > 60 ? null : best;
  }

  /** Default swap-reorder drop: swap the dragged card with the target slot. */
  protected onDrop(card: DragCard, target: DragTarget | null) {
    if (!target) {
      this.snapCard(card);
      return;
    }
    const to = this.targets.indexOf(target);
    const from = card.slot;
    if (to === from) {
      this.snapCard(card);
      return;
    }

    [this.order[from], this.order[to]] = [this.order[to], this.order[from]];
    [this.cards[from], this.cards[to]] = [this.cards[to], this.cards[from]];
    this.cards[from].slot = from;
    this.cards[to].slot = to;

    const other = this.cards[from];
    this.tweens.add({ targets: card.obj, x: this.slotX[to], duration: 130, ease: "Back.easeOut" });
    this.tweens.add({ targets: other.obj, x: this.slotX[from], duration: 130, ease: "Back.easeOut" });

    this.glowCards();
    if (this.isSolved()) this.onSolved();
  }

  /** Glow every card already in its home slot (instant check). */
  protected glowCards() {
    for (let i = 0; i < this.cards.length; i++) {
      const face = this.cards[i].obj.list[0] as Phaser.GameObjects.Image;
      face.setTint(this.order[i] === i ? 0x4ade80 : 0xffffff);
    }
  }

  protected isSolved(): boolean {
    return this.order.every((v, i) => v === i);
  }

  protected snapCard(card: DragCard) {
    this.tweens.add({ targets: card.obj, x: this.slotX[card.slot], y: this.slotCy, duration: 120, ease: "Sine.easeInOut" });
  }

  protected bounceCard(card: DragCard) {
    this.tweens.add({ targets: card.obj, x: card.homeX, y: card.homeY, scale: 1, duration: 130, ease: "Sine.easeInOut" });
  }

  protected onSolved() {
    this.locked = true;
    this.markSolved();
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    if (this.prompt) this.prompt.set(this.promptGreat());
    this.floatMsg(this.greatMessage());
    this.time.delayedCall(300, () => speak(this.speakLine(), { lang: this.speechLang() }));
    this.finishRound(true);
  }

  protected promptGreat(): string {
    return t(this.cfg().greatKey);
  }

  protected greatMessage(): string {
    return t(this.cfg().greatKey);
  }

  protected doneMessage(): string {
    return t(this.cfg().doneKey);
  }

  protected speakLine(): string {
    return this.cards.map((c) => c.item.label).join(", ");
  }

  protected markSolved() {
    this.challengeDone = true;
    this.disarmChallenge();
  }

  protected finishRound(correct: boolean) {
    this.markSolved();
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, this.cfg().rounds);
    this.onRoundDone?.(correct, ms, this.levelIndex + 1);
    this.time.delayedCall(this.advanceDelay(), () => this.advance());
  }

  protected advanceDelay(): number {
    return 1400;
  }

  protected advance() {
    const cfg = this.cfg();
    if (this.roundsDone >= cfg.rounds) {
      if (cfg.announceDone !== false) this.floatMsg(this.doneMessage());
      this.roundsDone = 0;
    }
    this.levelIndex++;
    this.startRound();
  }

  /** #1158 — challenge-mode countdown: a gold bar drains over 15s; time-up
   *  records a failed round and deals the next one. No reveal — the older kid
   *  races the clock and feels the miss through the combo/coin economy. */
  protected armChallenge() {
    if (!this.challenge) return;
    if (this.challengeTimer) this.challengeTimer.remove(false);
    this.challengeDone = false;
    const bar = this.challengeBar;
    if (bar) {
      this.tweens.killTweensOf(bar);
      bar.setPosition(20, 122).setSize(Math.min(this.scale.width - 40, 320), 6).setScale(1, 1).setAlpha(1);
      this.tweens.add({ targets: bar, scaleX: 0, duration: CHALLENGE_SECONDS * 1000, ease: "Linear.easeNone" });
    }
    this.challengeTimer = this.time.delayedCall(CHALLENGE_SECONDS * 1000, () => {
      if (this.challengeDone) return;
      this.challengeDone = true;
      this.roundsDone++;
      this.meter.set(this.roundsDone, this.cfg().rounds);
      if (this.roundsDone >= this.cfg().rounds) this.roundsDone = 0;
      this.onRoundDone?.(false, CHALLENGE_SECONDS * 1000, this.levelIndex + 1);
      this.levelIndex++;
      this.startRound();
    });
  }

  protected disarmChallenge() {
    if (this.challengeTimer) {
      this.challengeTimer.remove(false);
      this.challengeTimer = undefined;
    }
    if (this.challengeBar) {
      this.tweens.killTweensOf(this.challengeBar);
      this.challengeBar.setAlpha(0);
    }
  }

  protected floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.44, text, txt(26, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 26, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  protected clearRound() {
    this.cards.forEach((c) => c.obj.destroy());
    this.cards = [];
    this.stepLabels.forEach((l) => l.destroy());
    this.stepLabels = [];
    this.targets.forEach((target) => target.obj?.destroy());
    this.targets = [];
    this.order = [];
    this.slotX = [];
  }
}
