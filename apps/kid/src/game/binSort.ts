import Phaser from "phaser";
import { digit } from "./i18n";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, answerFlash } from "./ui";
import { SAB } from "./safeArea";
import { makeDraggableTo } from "./gestures";
import { ladderValue, poolTierFor, roundsForLevel, nextLevelIndex, timeForLevel } from "./difficulty";

/**
 * Shared config-driven SORT-INTO-BINS game engine (#68/#72/#73/#77).
 *
 * A drag-to-bin scene: the kid drags each item emoji into one of 2 or 4 bins.
 * Correct lands the item with a spoken "{name} {verdict}"; wrong returns the
 * item to its perch and flashes the RIGHT bin green as a hint. Tiered item
 * pools grow with level DEMAND-DRIVEN: each level's queue size opens exactly
 * the tiers needed to serve it (#1056), rounds-to-finish grows with the level
 * (#1057), and the level itself ramps on live success — two clean rounds step
 * up, two missed ease back (#1059). Scenes may opt into a shrinking per-item
 * countdown (timePerItemMs) for a shared speed ramp (#1058).
 *
 * Each concrete scene is a thin subclass supplying its config (title/prompt/
 * feedback i18n keys + bins + item list). Every key lives as a double-quoted
 * camelCase literal in the scene file so the audit scanner sees it.
 */
export interface SortBin {
  /** Machine value items match against. */
  value: string;
  /** i18n label key for the bin. */
  key: string;
  /** Bin icon emoji. */
  icon: string;
  /** i18n spoken-verdict template on a correct drop, e.g. "{name} is living!". */
  verdictKey: string;
}

export interface SortItem {
  id: string;
  emoji: string;
  value: string;
  /** 1..3 — pool grows with level (1 = famous first). */
  tier: number;
}

export interface BinSortConfig {
  /** The game id whose difficulty ladder this scene follows. */
  gameId: string;
  /** i18n header key. */
  titleKey: string;
  /** i18n question template: "{name} — …?" (shown + spoken). */
  promptKey: string;
  /** i18n praise float message. */
  greatKey: string;
  /** i18n round-end message. */
  doneKey: string;
  /** i18n spoken hint on wrong (name the right bin's verdict). */
  speakWrongKey: string;
  /** gameBackground() theme. */
  background: string;
  bins: SortBin[];
  items: SortItem[];
  /** item id → i18n name key. */
  nameKeys: Record<string, string>;
  /** 2×1 row (2 bins), 2×2 grid (4 bins) or 3+2 grid (5 bins). */
  grid: 2 | 4 | 5;
  /** Rounds to finish at the EASIEST level — the engine grows it with the
   *  adaptive level (#1057). */
  rounds: number;
  /** Optional shrinking-time window per level (ms), e.g. [14000,13000,…].
   *  When present each item is timed; the countdown tightens as difficulty
   *  rises (#1058). Absent → untimed scene. */
  timePerItemMs?: number[];
}

export abstract class BinSortScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private queue: SortItem[] = [];
  private qIdx = 0;
  private correct = 0;
  private wrongThisItem = false;
  private busy = false;
  // #1059 — live success-rate ramp (replaces the unconditional levelIndex++).
  private perfectStreak = 0;
  private imperfectStreak = 0;
  // #1057 — the rounds-to-finish target for the CURRENT level (grows with it).
  private roundsTarget = 3;
  // #1058 — optional per-item countdown (timeBar + tween).
  private timeBar!: Phaser.GameObjects.Graphics;
  private timerTween?: Phaser.Tweens.Tween;
  private bins: { c: Phaser.GameObjects.Container; bin: SortBin }[] = [];
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

  protected abstract cfg(): BinSortConfig;

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
  protected shutdown() {}

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    const cfg = this.cfg();
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    gameBackground(this, cfg.background as never);
    this.titleText = this.add
      .text(0, 0, t(cfg.titleKey), txt(34, "#ffffff", { bold: true }))
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
    // #1058 — countdown bar sits just under the dragged item, above the bins.
    this.timeBar = this.add.graphics().setDepth(30);

    this.itemBox = this.add.container(0, 0).setDepth(20).setSize(120, 120);
    this.itemEmoji = this.add.text(0, -16, "✨", txt(74, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.itemName = this.add.text(0, 44, "", txt(22, "#ffffff", { bold: true, outline: true, shadow: false })).setOrigin(0.5);
    this.itemBox.add([this.itemEmoji, this.itemName]);
    makeDraggableTo(this, this.itemBox, {
      getTargets: () => this.bins.map((b) => b.c),
      onDrop: (target) => {
        if (this.busy) return;
        const hit = this.bins.find((b) => b.c === target);
        this.dropOn(hit?.bin ?? null);
      },
    });

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
    this.prompt.setPosition(width / 2, height * 0.14);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.perch = { x: width / 2, y: height * 0.35 };
    this.itemBox.setPosition(this.perch.x, this.perch.y);

    const gap = 14;
    if (cfg.grid === 2) {
      const cardW = Math.max(130, Math.min(230, (width - 3 * gap) / 2));
      const cardH = 150;
      const startX = width / 2 - (cardW + gap) / 2;
      const bandTop = height * 0.55;
      const y = Math.max(bandTop, height - cardH - 20 - SAB());
      this.binGeom = { cardW, cardH, startX, c0: y + cardH / 2, c1: y + cardH / 2 };
      this.bins.forEach((b, i) => b.c.setPosition(i === 0 ? startX : startX + cardW + gap, y + cardH / 2));
    } else if (cfg.grid === 5) {
      const cardW = Math.max(96, Math.min(150, (width - 4 * gap) / 3));
      const cardH = 118;
      const startX = width / 2 - (cardW + gap);
      const bandTop = height * 0.5;
      const bandBottom = height - 18 - SAB();
      const totalH = 2 * cardH + gap;
      const topY = Math.max(bandTop, bandBottom - totalH);
      const c0 = topY + cardH / 2;
      const row5 = width / 2 - cardW / 2 - gap / 2;
      this.binGeom = { cardW, cardH, startX, c0, c1: c0 + cardH + gap };
      this.bins.forEach((b, i) =>
        b.c.setPosition(
          i < 3 ? startX + i * (cardW + gap) : row5 + (i - 3) * (cardW + gap),
          i < 3 ? c0 : c0 + cardH + gap
        )
      );
    } else {
      const cardW = Math.max(100, Math.min(200, (width - 3 * gap) / 2));
      const cardH = 124;
      const startX = width / 2 - (cardW + gap) / 2;
      const bandTop = height * 0.5;
      const bandBottom = height - 18 - SAB();
      const totalH = 2 * cardH + gap;
      const topY = Math.max(bandTop, bandBottom - totalH);
      const c0 = topY + cardH / 2;
      this.binGeom = { cardW, cardH, startX, c0, c1: c0 + cardH + gap };
      this.bins.forEach((b, i) =>
        b.c.setPosition(i % 2 === 0 ? startX : startX + cardW + gap, i < 2 ? c0 : c0 + cardH + gap)
      );
    }
  }

  private queueSize(level: number): number {
    const cfg = this.cfg();
    const ladder = this.ladder();
    // #1056 — ladderValue keeps growing past the ladder ceiling so a level
    // past 5-6 is never byte-identical to the one before it.
    const n = ladderValue(ladder, level) ?? cfg.bins.length + 2;
    return Math.min(n, cfg.items.length);
  }

  /** Tier counts [tier1, tier2, tier3] for the scene's item pool. */
  private countByTier(): [number, number, number] {
    const by: [number, number, number] = [0, 0, 0];
    for (const it of this.cfg().items) by[it.tier - 1] += 1;
    return by;
  }

  private startRound() {
    this.clearRound();
    // #1061 — expose this round's difficulty to the shared celebration engine.
    this.data.set("nv:difficulty", this.levelIndex + 1);
    const cfg = this.cfg();
    // #1056 — the tier pool is DEMAND-driven: open exactly the tiers whose
    // cumulative count serves this level's queue size (a real step each level,
    // replacing the coarse 3-band `levelIndex < 2 ? 1 : < 4 ? 2 : 3` filter).
    const want = this.queueSize(this.levelIndex);
    const maxTier = poolTierFor(want, this.countByTier());
    const pool = cfg.items.filter((it) => it.tier <= maxTier);
    Phaser.Utils.Array.Shuffle(pool);
    this.queue = pool.slice(0, Math.min(pool.length, want));
    this.qIdx = 0;
    this.correct = 0;
    this.wrongThisItem = false;
    this.startedAt = this.time.now;
    // #1057 — rounds-to-finish grows with the adaptive level.
    this.roundsTarget = roundsForLevel(cfg.rounds, this.levelIndex);
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, this.roundsTarget);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    this.spawnBins();
    this.showCurrent();
  }

  private spawnBins() {
    this.clearBins();
    const cfg = this.cfg();
    const { cardW, cardH, startX, c0, c1 } = this.binGeom;
    const GAP = 14;
    cfg.bins.forEach((bin, i) => {
      let x: number;
      let y: number;
      if (cfg.grid === 2) {
        x = i === 0 ? startX : startX + cardW + GAP;
        y = c0;
      } else if (cfg.grid === 5) {
        const row5 = this.scale.width / 2 - cardW / 2 - GAP / 2;
        x = i < 3 ? startX + i * (cardW + GAP) : row5 + (i - 3) * (cardW + GAP);
        y = i < 3 ? c0 : c1;
      } else {
        x = i % 2 === 0 ? startX : startX + cardW + GAP;
        y = i < 2 ? c0 : c1;
      }
      this.bins.push({ c: this.makeBin(x, y, bin), bin });
    });
  }

  private makeBin(x: number, y: number, bin: SortBin): Phaser.GameObjects.Container {
    const { cardW, cardH } = this.binGeom;
    const bg = this.add.graphics();
    bg.fillStyle(BTN_NEUTRAL.top, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(BTN_NEUTRAL.bottom, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(0x93a3b8, 0.5);
    bg.fillRoundedRect(-cardW / 2, cardH / 2 - 10, cardW, 10, 5);
    const icon = this.add.text(0, -20, bin.icon, txt(40, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    const label = this.add.text(0, 28, t(bin.key), txt(24, "#1e293b", { bold: true, shadow: false, wrap: cardW - 20 })).setOrigin(0.5);
    const c = this.add.container(x, y, [bg, icon, label]);
    c.setSize(cardW, cardH);
    c.setInteractive({ useHandCursor: true });
    return c;
  }

  private showCurrent() {
    const cfg = this.cfg();
    const it = this.queue[this.qIdx];
    this.wrongThisItem = false;
    this.itemEmoji.setText(it.emoji);
    this.itemName.setText(t(cfg.nameKeys[it.id]));
    this.itemBox.setPosition(this.perch.x, this.perch.y);
    this.itemBox.setAlpha(1);
    this.itemBox.setScale(1);
    const name = t(cfg.nameKeys[it.id]);
    this.prompt.setText(t(cfg.promptKey, { name }));
    speak(t(cfg.promptKey, { name }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    // #1058 — per-item countdown when the scene opts into the shared time ramp.
    const timeMs = timeForLevel(cfg.timePerItemMs, this.levelIndex);
    this.drawTimeBar(timeMs ? 1 : 0);
    if (timeMs) this.startItemTimer(timeMs);
  }

  /** #1058 — start the per-item countdown (bar already drawn full by caller). */
  private startItemTimer(timeMs: number) {
    if (this.timerTween) {
      this.timerTween.stop();
      this.timerTween = undefined;
    }
    const bar = { frac: 1 };
    this.timerTween = this.tweens.add({
      targets: bar,
      frac: 0,
      duration: timeMs,
      ease: "Linear",
      onUpdate: () => this.drawTimeBar(bar.frac),
      onComplete: () => {
        this.timerTween = undefined;
        if (this.busy || this.qIdx >= this.queue.length) return;
        this.onItemTimeout();
      },
    });
  }

  /** Stop + hide the countdown. `keep` lets callers redraw (showCurrent). */
  private stopItemTimer(keep = false) {
    if (this.timerTween) {
      this.timerTween.stop();
      this.timerTween = undefined;
    }
    if (!keep) this.drawTimeBar(0);
  }

  private drawTimeBar(frac: number) {
    const w = Math.min(240, this.scale.width - 80);
    const x = this.scale.width / 2 - w / 2;
    const y = this.scale.height * 0.46;
    this.timeBar.clear();
    if (frac <= 0) return;
    this.timeBar.fillStyle(0xffffff, 0.3);
    this.timeBar.fillRoundedRect(x, y, w, 8, 4);
    this.timeBar.fillStyle(frac > 0.3 ? 0x4ade80 : 0xffd166, 1);
    this.timeBar.fillRoundedRect(x, y, Math.max(2, w * frac), 8, 4);
  }

  /** #1058 — the time window expired on the current item: gentle "time's up"
   *  cue (never a correct — the round is not clean), then move on. */
  private onItemTimeout() {
    this.wrongThisItem = true;
    this.busy = true;
    bad();
    speak(t("timeUp"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.floatMsg(t("timeUp"));
    this.time.delayedCall(600, () => this.advance());
  }

  private dropOn(bin: SortBin | null) {
    const cfg = this.cfg();
    const it = this.queue[this.qIdx];
    if (bin === null) {
      this.flyBack();
      return;
    }
    const hit = this.bins.find((b) => b.bin === bin)!;
    if (bin.value === it.value) {
      this.correctPlace(cfg, it, hit);
      return;
    }
    this.wrongPlace(cfg, it, hit);
  }

  private correctPlace(cfg: BinSortConfig, it: SortItem, bin: { c: Phaser.GameObjects.Container; bin: SortBin }) {
    this.stopItemTimer();
    this.busy = true;
    if (!this.wrongThisItem) this.correct++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    pop();
    win();
    // #1198 — the config bases are the pattern: every derived scene gets the
    // full combo reward (confetti/starBurst) for free, not a bare audio blip.
    correctCelebrate(this, bin.c.x, bin.c.y);
    this.floatMsg(t(cfg.greatKey));
    speak(t(bin.bin.verdictKey, { name: t(cfg.nameKeys[it.id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.flashBin(bin, 0x4ade80);
    this.tweens.add({
      targets: this.itemBox,
      x: bin.c.x,
      y: bin.c.y,
      scale: 0.7,
      alpha: 0.6,
      duration: 260,
      ease: "Back.easeIn",
      onComplete: () => this.advance(),
    });
  }

  private wrongPlace(cfg: BinSortConfig, it: SortItem, bin: { c: Phaser.GameObjects.Container; bin: SortBin }) {
    this.stopItemTimer();
    this.wrongThisItem = true;
    bad();
    const right = this.bins.find((b) => b.bin.value === it.value)!;
    // #1173 — the wrong hint NAMES the right bin ("panta bhat belongs with
    // Pohela Boishakh!") via the {where} slot, so the gentle cue still teaches.
    this.floatMsg(t(cfg.speakWrongKey, { name: t(cfg.nameKeys[it.id]), where: t(right.bin.key) }));
    this.flashBin(bin, 0xf87171);
    this.tweens.add({ targets: bin.c, x: bin.c.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
    this.flashBin(right, 0x4ade80, 0.45);
    this.flyBack();
  }

  private flyBack() {
    this.itemBox.setPosition(this.perch.x, this.perch.y);
    this.itemBox.setScale(1);
    this.itemBox.setAlpha(1);
  }

  private flashBin(bin: { c: Phaser.GameObjects.Container; bin: SortBin }, color: number, alpha = 0.9) {
    const { cardW, cardH } = this.binGeom;
    // #1364 — pair the green/red rectangle with a ✓/✕ badge so right-vs-wrong
    // is not communicated by color alone.
    answerFlash(this, bin.c, color, {
      w: cardW,
      h: cardH,
      alpha,
      radius: 18,
      glyph: color === 0x4ade80 ? "check" : "cross",
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
    const cfg = this.cfg();
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t(cfg.doneKey)}  ${digit(this.correct)}/${digit(this.queue.length)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, this.roundsTarget);
    // #1059 — feed this round's outcome into the live ramp: two clean rounds →
    // step up two, two missed → ease back. onRoundDone sees the difficulty the
    // kid actually earned, so the event stream reflects live success.
    const clean = this.correct === this.queue.length;
    if (clean) {
      this.perfectStreak++;
      this.imperfectStreak = 0;
    } else {
      this.imperfectStreak++;
      this.perfectStreak = 0;
    }
    this.onRoundDone?.(clean, ms, this.levelIndex + 1);
    const next = nextLevelIndex(this.levelIndex, this.perfectStreak, this.imperfectStreak);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= this.roundsTarget) this.roundsDone = 0;
      this.levelIndex = next;
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

  private clearBins() {
    this.bins.forEach((b) => b.c.destroy());
    this.bins = [];
  }

  private clearRound() {
    this.clearBins();
    this.queue = [];
  }
}
