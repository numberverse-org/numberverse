import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { gameBackground } from "./backgrounds";
import { pop, bad, click, win } from "./audio";
import { speak, bnNumber } from "./speech";
import { getAppLang } from "./locale";
import { t as tr, digit } from "./i18n";
import { prefersReducedMotion } from "./reducedMotion";
import { txt, promptTxt, NV_GOLD, roundMeter, type RoundMeterApi } from "./ui";
import { correctCelebrate } from "./celebrate";
import { SAT, SAB } from "./safeArea";

const PALETTE = ["🌸", "🐝", "🦋", "🪨", "🌱", "☀️", "🍄"] as const;

/** Spoken names per emoji (TTS cannot read the glyphs). Displayed text uses the
 *  emoji itself; these names only feed `speak()`. */
const ITEM_NAMES: Record<string, { en: string; bn: string }> = {
  "🌸": { en: "flower", bn: "ফুল" },
  "🐝": { en: "bee", bn: "মৌমাছি" },
  "🦋": { en: "butterfly", bn: "প্রজাপতি" },
  "🪨": { en: "rock", bn: "পাথর" },
  "🌱": { en: "sprout", bn: "চারা" },
  "☀️": { en: "sun", bn: "সূর্য" },
  "🍄": { en: "mushroom", bn: "মাশরুম" },
};

/** Shape palette (NCTB K.G.2 set) — a shape quest swaps the bottom palette to
 *  these so the kid identifies AND counts the named shape. */
const SHAPES = ["⬤", "🔺", "⬛", "⭐"] as const;

/** Spoken names per shape glyph (TTS cannot read the glyphs). */
const SHAPE_NAMES: Record<string, { en: string; bn: string }> = {
  "⬤": { en: "circle", bn: "বৃত্ত" },
  "🔺": { en: "triangle", bn: "ত্রিভুজ" },
  "⬛": { en: "square", bn: "বর্গ" },
  "⭐": { en: "star", bn: "তারা" },
};

/** A quest = one round. `emoji` undefined means "plant anything" (free count);
 *  `shapes` true means the target comes from the SHAPES palette (K.G.2). */
interface Quest {
  emoji?: string;
  n: number;
  shapes?: boolean;
}

/** Counting + shape quests, ramping from 1 → 6 and alternating specific/free
 *  targets. Shape quests appear once the kid has done a couple of counting
 *  quests (K.CC.1 → K.G.2). The parent advances the session after
 *  ROUNDS_TO_FINISH rounds, so a kid typically sees ~3 of these per visit. */
const QUESTS: Quest[] = [
  { emoji: "🌸", n: 1 },
  { emoji: "🐝", n: 2 },
  { emoji: "⬤", n: 2, shapes: true },
  { emoji: "🌸", n: 3 },
  { emoji: "🔺", n: 3, shapes: true },
  { emoji: undefined, n: 4 },
  { emoji: "⭐", n: 4, shapes: true },
  { emoji: "🦋", n: 5 },
  { emoji: "⬛", n: 5, shapes: true },
  { emoji: undefined, n: 6 },
  { emoji: "🌱", n: 4 },
  { emoji: "☀️", n: 5 },
];

/**
 * 🌸 EXPLORE GARDEN — a guided counting garden (#1143, K.CC.1).
 *
 * The kid is handed ONE clear goal at a time — "Plant 3 🌸" — shown large and
 * spoken aloud. The target emoji is pre-selected and highlighted, a "2 / 3"
 * progress line sits right under the goal, and a 💬 button re-speaks the goal
 * for pre-readers. The right plant pops and counts up; a wrong plant plants
 * anyway (no penalty) but nudges the kid back to the target. Finishing a goal
 * celebrates, completes the round (onRoundDone), and hands over the next goal.
 * It stays no-pressure — there is no fail state — but it is a real game with a
 * real, visible "here's what to do."
 */

export class ExploreGardenScene extends Phaser.Scene {
  private lang: "en" | "bn" = "en";
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;

  private levelIndex = 0;
  private quest: Quest = QUESTS[0];
  private target = 1;
  private placed = 0;
  private totalPlaced = 0;
  private startedAt = 0;

  private selectedIndex = 0;
  private selectedEmoji: string = PALETTE[0];
  private plants: Phaser.GameObjects.Text[] = [];
  private paletteButtons: { btn: Phaser.GameObjects.Container; disc: Phaser.GameObjects.Arc; emoji: string }[] = [];

  private title!: Phaser.GameObjects.Text;
  private goal!: Phaser.GameObjects.Text;
  private howTo!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Text;
  private counter!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private plantZone!: Phaser.GameObjects.Rectangle;
  private clearBtn!: Phaser.GameObjects.Container;
  private speakBtn!: Phaser.GameObjects.Container;
  private paletteTop = 0;

  // Which palette is currently rendered (so a shape quest rebuilds the bottom
  // bar and a nature quest doesn't needlessly flicker it).
  private usingShapes = false;

  // First-play onboarding demo state.
  private demoRunning = false;
  private demoPointer?: Phaser.GameObjects.Text;
  private demoSkip?: () => void;
  private demoHasShown = false; // plays once per scene visit, first quest only
  private demoSeen = false; // persisted once per device (nv_explore_garden_demo)

  constructor() {
    super("ExploreGarden");
  }

  create(data?: { onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.onRoundDone = data?.onRoundDone;
    // The skill ladder for math-explore-garden is flat (all 1s), so startLevelIndex
    // only nudges which quest we open on; the count itself is the hardness.
    this.levelIndex = Math.max(0, Math.min(QUESTS.length - 1, (data?.startLevelIndex ?? 0) % QUESTS.length));
    this.selectedIndex = 0;
    this.selectedEmoji = PALETTE[0];
    this.placed = 0;
    this.totalPlaced = 0;
    this.plants = [];
    this.paletteButtons = [];
    this.usingShapes = false;
    this.demoRunning = false;
    this.demoPointer = undefined;
    this.demoHasShown = false;
    this.demoSeen = this.readDemoSeen();

    gameBackground(this, "forest");
    this.drawHeader();
    this.meter = roundMeter(this);
    this.layout();
    onSceneResize(this, () => this.layout());
    this.startQuest();
  }

  private drawHeader() {
    const T = tr;
    this.title = this.add
      .text(this.scale.width / 2, 30 + SAT(), T("exploreGardenTitle"), txt(22, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setDepth(70);
    // The GOAL is the headline — big and always visible.
    this.goal = this.add
      .text(this.scale.width / 2, 66 + SAT(), "", txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setDepth(70);
    this.howTo = this.add
      .text(this.scale.width / 2, 100 + SAT(), T("exploreGardenHowTo"), promptTxt(15))
      .setOrigin(0.5)
      .setDepth(70);
    this.progress = this.add
      .text(this.scale.width / 2, 124 + SAT(), "", txt(20, NV_GOLD, { bold: true, shadow: false }))
      .setOrigin(0.5)
      .setDepth(70);
    this.counter = this.add
      .text(14, 30 + SAT(), this.counterText(), txt(14, NV_GOLD, { bold: true, shadow: false }))
      .setOrigin(0, 0.5)
      .setDepth(70);
  }

  private layout() {
    const { width, height } = this.scale;
    const sat = SAT();
    const sab = SAB();

    this.title.setPosition(width / 2, 30 + sat);
    this.goal.setPosition(width / 2, 66 + sat);
    this.howTo.setPosition(width / 2, 100 + sat);
    this.progress.setPosition(width / 2, 124 + sat);
    this.counter.setPosition(14, 30 + sat);
    this.meter.setPosition(width / 2, 148 + sat);

    this.renderControls(width, sat);
    this.renderPalette();
    this.renderPlantZone(width, sat);
    this.applyGoalText();
  }

  private renderControls(width: number, sat: number) {
    this.clearBtn?.destroy();
    this.speakBtn?.destroy();
    const y = 30 + sat;
    const r = 22;
    // 💬 re-speaks the CURRENT goal (pre-reader support) — not a random prompt.
    this.speakBtn = this.makeRoundButton("💬", width - 34 - r * 3 - 10, y, () => this.speakGoal(), r);
    this.clearBtn = this.makeRoundButton("🗑", width - 34 - r, y, () => this.clearGarden(), r);
  }

  private makeRoundButton(
    emoji: string,
    x: number,
    y: number,
    onClick: () => void,
    r = 22
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(70).setSize(r * 2, r * 2);
    const disc = this.add.circle(0, 0, r, 0xffffff, 0.16).setStrokeStyle(2, 0xffffff, 0.6);
    const label = this.add
      .text(0, 0, emoji, txt(Math.round(r * 1.05), "#ffffff", { shadow: false }))
      .setOrigin(0.5);
    c.add([disc, label]);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", () => {
      click();
      this.tweens.add({ targets: c, scale: 0.9, duration: 90, yoyo: true });
      onClick();
    });
    return c;
  }

  private renderPalette() {
    this.paletteButtons.forEach((entry) => entry.btn.destroy());
    this.paletteButtons = [];

    const { width, height } = this.scale;
    const sab = SAB();
    const palette = this.activePalette();
    this.usingShapes = !!this.quest?.shapes;

    const n = palette.length;
    const baseR = 30;
    const gap = 10;
    const totalW = n * baseR * 2 + (n - 1) * gap;
    const scale = Math.min(1, Math.max(0.5, (width - 24) / totalW));
    const r = baseR * scale;
    const step = r * 2 + gap;
    const x0 = width / 2 - ((n - 1) * step) / 2;
    const paletteTop = height - r * 2 - 24 - sab;
    this.paletteTop = paletteTop;
    const y = paletteTop + r;

    palette.forEach((emoji, i) => {
      const btn = this.add
        .container(x0 + i * step, y)
        .setDepth(70)
        .setSize(r * 2, r * 2);
      const disc = this.add
        .circle(0, 0, r, 0xffffff, 0.16)
        .setStrokeStyle(i === this.selectedIndex ? 3 : 2, i === this.selectedIndex ? 0xffd166 : 0xffffff, i === this.selectedIndex ? 1 : 0.55);
      const label = this.add
        .text(0, 0, emoji, txt(Math.round(r * 1.1), "#ffffff", { shadow: false }))
        .setOrigin(0.5);
      btn.add([disc, label]);
      btn.setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => this.selectPalette(i));
      if (i === this.selectedIndex) btn.setScale(1.1);
      this.paletteButtons.push({ btn, disc, emoji });
    });
    this.applyPaletteHighlight();
  }

  private renderPlantZone(width: number, sat: number) {
    this.plantZone?.destroy();
    const top = 170 + sat;
    const bottom = this.paletteTop - 10;
    const h = Math.max(24, bottom - top);
    this.plantZone = this.add
      .rectangle(width / 2, top + h / 2, width, h, 0x000000, 0)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    this.plantZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // While the demo plays, the plant zone is the demo's stage — the kid's
      // tap ends the demo instead of planting a second item.
      if (this.demoRunning) {
        this.cancelDemo();
        return;
      }
      this.plant(pointer.x, pointer.y);
    });
  }

  // ── quest lifecycle ──────────────────────────────────────────────────────

  private startQuest() {
    this.quest = QUESTS[this.levelIndex % QUESTS.length];
    this.target = this.quest.n;
    this.placed = 0;
    this.startedAt = this.time.now;
    this.clearGarden(); // fresh canvas per goal
    // Auto-select the target so a pre-reader never has to find it.
    const palette = this.activePalette();
    if (this.quest.emoji) {
      const idx = palette.indexOf(this.quest.emoji);
      if (idx >= 0) {
        this.selectedIndex = idx;
        this.selectedEmoji = palette[idx];
      }
    }
    // A shape quest swaps the whole bottom palette; a nature quest only needs
    // the highlight re-applied (the palette bar itself is unchanged).
    if (this.usingShapes !== !!this.quest.shapes) {
      this.renderPalette();
    } else {
      this.applyPaletteHighlight();
    }
    this.applyGoalText();
    this.meter.set(0, this.target);
    this.updateProgress();
    this.speakGoal();
    this.maybeRunDemo();
  }

  // ── first-play onboarding demo ────────────────────────────────────────────

  private readDemoSeen(): boolean {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("nv_explore_garden_demo") === "1";
    } catch {
      return true; // storage blocked — don't trap the kid on every visit
    }
  }

  private markDemoSeen() {
    try {
      window.localStorage.setItem("nv_explore_garden_demo", "1");
    } catch {
      /* storage blocked — the demo just replays next time */
    }
  }

  /** Plays on the very first quest of the very first visit (once per device).
   *  Taps it on BEFORE the kid can plant, so a pre-reader SEES the mechanic. */
  private maybeRunDemo() {
    if (this.demoHasShown || this.demoSeen) return;
    this.demoHasShown = true;

    // Reduced motion: skip the tween, just show a brief static pointer + line.
    if (prefersReducedMotion()) {
      this.demoSeen = true;
      this.markDemoSeen();
      const btn = this.paletteButtons[this.selectedIndex]?.btn;
      if (btn) {
        const hint = this.add
          .text(btn.x, btn.y - 46, "👆", txt(36, "#ffffff", { shadow: false }))
          .setOrigin(0.5)
          .setDepth(90);
        this.time.delayedCall(1400, () => hint.destroy());
      }
      speak(tr("exploreGardenDemo"));
      return;
    }

    this.runDemo();
  }

  /** Animated "👆" that leaves the target palette button, travels into the
   *  plant zone, taps, and grows a plant — the kid's first lesson in how to
   *  play. Interruptible on any pointerdown. */
  private runDemo() {
    this.demoRunning = true;
    const btn = this.paletteButtons[this.selectedIndex]?.btn;
    const startX = btn ? btn.x : this.scale.width / 2;
    const startY = btn ? btn.y : this.paletteTop - 20;

    const zoneTop = 170 + SAT();
    const zoneBottom = this.paletteTop - 10;
    const endX = Phaser.Math.Clamp(startX, 18, this.scale.width - 18);
    const endY = Phaser.Math.Clamp(startY - 130, zoneTop + 40, zoneBottom - 6);

    const pointer = this.add
      .text(startX, startY, "👆", txt(40, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(90)
      .setAlpha(0);
    this.demoPointer = pointer;

    // Any pointerdown anywhere skips the demo immediately.
    const skip = () => this.cancelDemo();
    this.demoSkip = skip;
    this.input.on("pointerdown", skip);

    this.tweens.add({ targets: pointer, alpha: 1, duration: 120 });
    this.tweens.add({
      targets: pointer,
      x: endX,
      y: endY,
      duration: 900,
      delay: 120,
      ease: "Sine.easeInOut",
      onComplete: () => {
        // Demo's own tap: grow a plant and hand back to normal play.
        this.spawnPlant(endX, endY, this.selectedEmoji);
        this.totalPlaced += 1;
        this.counter.setText(this.counterText());
        speak(tr("exploreGardenDemo"));
        this.time.delayedCall(150, () => speak(this.lang === "bn" ? bnNumber(1) : "1", { cancel: false }));
        // Fade the pointer out, then finish.
        this.tweens.add({
          targets: pointer,
          alpha: 0,
          duration: 200,
          delay: 300,
          onComplete: () => {
            this.input.off("pointerdown", skip);
            this.demoSkip = undefined;
            pointer.destroy();
            this.demoPointer = undefined;
            this.demoRunning = false;
          },
        });
      },
    });

    // Bounded safety net — never leave the demo running forever.
    this.time.delayedCall(2500, () => this.cancelDemo());
  }

  private cancelDemo() {
    if (!this.demoRunning && !this.demoPointer) return;
    this.demoRunning = false;
    if (this.demoSkip) {
      this.input.off("pointerdown", this.demoSkip);
      this.demoSkip = undefined;
    }
    if (this.demoPointer) {
      this.tweens.killTweensOf(this.demoPointer);
      this.demoPointer.destroy();
      this.demoPointer = undefined;
    }
    this.demoSeen = true;
    this.markDemoSeen();
  }

  private applyGoalText() {
    if (!this.goal || !this.howTo || !this.progress) return;
    const T = tr;
    const n = digit(this.target);
    this.goal.setText(this.quest.emoji ? T("exploreGardenGoal", { n, emoji: this.quest.emoji }) : T("exploreGardenGoalAny", { n }));
    // The how-to line shows until the kid has planted their first item — after
    // that they know "tap the garden". It stays mounted (layout needs it) but
    // hides once a plant has been placed.
    this.howTo.setAlpha(this.totalPlaced === 0 ? 1 : 0);
    this.updateProgress();
  }

  private updateProgress() {
    if (!this.progress) return;
    this.progress.setText(tr("exploreGardenProgress", { n: digit(this.placed), target: digit(this.target) }));
  }

  private applyPaletteHighlight() {
    const isTarget = (emoji: string) => !this.quest?.emoji || emoji === this.quest.emoji;
    this.paletteButtons.forEach((entry, i) => {
      const selected = i === this.selectedIndex;
      const target = isTarget(entry.emoji);
      entry.disc.setStrokeStyle(
        target ? 3 : 2,
        target ? 0xffd166 : selected ? 0xffffff : 0xffffff,
        target ? 1 : selected ? 0.85 : 0.5
      );
      // A non-target item in a specific quest is dimmed so the goal item pops.
      entry.btn.setAlpha(this.quest?.emoji && !target ? 0.45 : 1);
      this.tweens.killTweensOf(entry.btn);
      entry.btn.setScale(selected ? 1.1 : 1);
      // The target pulses gently so the eye lands on it.
      if (target && !this.isPlantingDone()) {
        this.tweens.add({ targets: entry.btn, scale: selected ? 1.16 : 1.06, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
    });
  }

  private isPlantingDone(): boolean {
    return this.placed >= this.target;
  }

  private selectPalette(index: number) {
    this.selectedIndex = index;
    this.selectedEmoji = this.activePalette()[index];
    this.applyPaletteHighlight();
  }

  /** The palette in charge right now — shapes on a K.G.2 quest, nature otherwise. */
  private activePalette(): readonly string[] {
    return this.quest?.shapes ? SHAPES : PALETTE;
  }

  /** The spoken-name table matching the active palette (TTS can't read glyphs). */
  private activeNames(): Record<string, { en: string; bn: string }> {
    return this.quest?.shapes ? SHAPE_NAMES : ITEM_NAMES;
  }

  private speakGoal() {
    const bn = this.lang === "bn";
    if (this.quest.emoji) {
      const name = this.activeNames()[this.quest.emoji];
      speak(bn ? `${bnNumber(this.target)}টা ${name?.bn ?? ""} লাগাও` : `Plant ${this.target} ${name?.en ?? ""}`);
    } else {
      speak(bn ? `${bnNumber(this.target)}টা যা খুশি লাগাও` : `Plant ${this.target} of anything`);
    }
  }

  private plant(x: number, y: number) {
    if (this.isPlantingDone()) return; // goal reached — wait for the next quest
    const top = 170 + SAT();
    const bottom = this.paletteTop - 10;
    const px = Phaser.Math.Clamp(x, 18, this.scale.width - 18);
    const py = Phaser.Math.Clamp(y, top + 12, bottom - 6);
    const emoji = this.selectedEmoji;
    const onTarget = !this.quest.emoji || emoji === this.quest.emoji;

    this.spawnPlant(px, py, emoji);
    this.totalPlaced += 1;
    this.counter.setText(this.counterText());

    if (onTarget) {
      this.placed += 1;
      pop();
      speak(this.lang === "bn" ? bnNumber(this.placed) : String(this.placed), { cancel: false });
      this.updateProgress();
      if (this.placed >= this.target) this.finishQuest();
    } else {
      // Not the goal item — plant it anyway (no pressure) but nudge them back.
      bad();
      const names = this.activeNames();
      const name = names[emoji];
      const targetName = names[this.quest.emoji as string];
      speak(
        this.lang === "bn"
          ? `এটা ${name?.bn ?? ""} — ${targetName?.bn ?? ""} লাগাই!`
          : `That's a ${name?.en ?? ""} — let's plant ${targetName?.en ?? ""}!`,
        { cancel: true }
      );
    }
  }

  private spawnPlant(px: number, py: number, emoji: string) {
    const plant = this.add
      .text(px, py, emoji, txt(44, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(10)
      .setScale(0.4);
    this.tweens.add({ targets: plant, scale: 1, duration: 220, ease: "Back.easeOut" });
    this.sparkle(px, py - 12);
    this.bob(plant, py);
    this.plants.push(plant);
  }

  private finishQuest() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    const doneText = this.quest.emoji
      ? tr("exploreGardenDone", { n: digit(this.target), emoji: this.quest.emoji })
      : tr("exploreGardenDoneAny", { n: digit(this.target) });
    speak(doneText);
    correctCelebrate(this, this.scale.width / 2, 200 + SAT());
    // #1061 — reward engine reads round hardness from the scene data registry.
    this.data.set("nv:difficulty", this.target);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(1500, () => {
      this.levelIndex += 1;
      this.startQuest();
    });
  }

  private bob(target: Phaser.GameObjects.Text, baseY: number) {
    this.tweens.add({
      targets: target,
      y: baseY + Phaser.Math.Between(3, 7),
      duration: Phaser.Math.Between(1500, 2400),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private sparkle(x: number, y: number) {
    const s = this.add
      .text(x, y, "✨", txt(20, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(80)
      .setAlpha(0.9);
    this.tweens.add({
      targets: s,
      y: y - 26,
      alpha: 0,
      scale: 0.4,
      duration: 700,
      ease: "Quad.easeOut",
      onComplete: () => s.destroy(),
    });
  }

  private clearGarden() {
    this.plants.forEach((plant) => {
      this.tweens.killTweensOf(plant);
      plant.destroy();
    });
    this.plants = [];
    if (this.quest) this.placed = 0;
    this.updateProgress();
  }

  private counterText(): string {
    return tr("exploreGardenCounter", { n: digit(this.totalPlaced) });
  }
}
