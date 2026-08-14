import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speakMath } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { answerRow } from "./layout";

const LEVELS = GAMES.find((g) => g.id === "game-multable")?.difficultyLevels ?? [2, 3, 4, 5, 7, 9];
/**
 * Level VALUE → multiplier set (#1170). Single tables first (arrays visible),
 * then mixed (harder). The scene's ladder is now the SKILL's own dataLevels —
 * mult-facts-2-10 (band 3) carries [2,3,4,5,7,9,10] and mult-fluency-6-9
 * (band 6) carries [6,7,8,9] — so a band-6 reteach starts at ×6, never ×2,
 * and its top set never leaks ×10 outside the 6–9 scope. `max` is the skill's
 * top table (last dataLevels entry); mixed sets stay inside that range.
 */
function tableSet(v: number, max: number): number[] {
  if (v <= 5) return [v];                   // 2,3,4,5 — single table, dots
  if (v <= 7) return [6, 7];                // 6,7 — mixed easy-medium bridge
  return [8, 9, ...(max >= 10 ? [10] : [])]; // 8,9(+10) — mixed hard in-range
}
const BUTTON_RADIUS = 50;
const ROUNDS_TO_FINISH = 3;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure
const DOT_COLORS = [0xffd166, 0x4cc9f0, 0x2ec4b6, 0xff6b6b, 0x8ecae6, 0x90be6d, 0xffb35c, 0xc4b5fd, 0xf9844a, 0x06d6a0];

/**
 * Times Tables — "count the dot grid" (tables 2–10, arrays first).
 * Band 3 (ages 6–8). The table set ramps per level: 2 → 3 → 4 → 5 → 6-7 → 8-10.
 *
 * ARRAYS → NUMBER MODE (the teaching idea):
 *   single-table levels (2–5) always draw the CONCRETE a×b dot grid every round
 *   (each row a different color → kid counts rows × dots). The first mixed
 *   round (×6/7) shows the grid too as the concrete bridge, then later mixed
 *   rounds flip to NUMBER mode with a reassuring "Now without the dots!" toast —
 *   a visible concrete → abstract progression. teach:true (first exposure or
 *   mastery-gate remediation) keeps the grid on so re-teaching is concrete.
 */
export class TimesTableScene extends Phaser.Scene {
  private levels = LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private teachMode = false;
  private challenge = false; // #1158 — band 6-7 independent mode (timed rounds, no reveal)
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private showDots = true;
  private prevShowDots = true;
  private a = 2;
  private b = 2;
  private answer = 0;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private arrayLabel!: Phaser.GameObjects.Text;
  private noDotsText!: Phaser.GameObjects.Text;
  private dotsG!: Phaser.GameObjects.Graphics;

  constructor() {
    super("TimesTable");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; teach?: boolean; levels?: number[]; challenge?: boolean }) {
    this.onRoundDone = data.onRoundDone;
    // #1170 — the skill's own ladder (dataLevels, passed by App) drives which
    // table range the scene drills. Fall back to the shared game ladder when a
    // skill has no narrower range.
    this.levels = data.levels?.length ? data.levels : LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.teachMode = !!data.teach;
    // #1158 — challenge mode: band 6-7 skills (skill.challenge → App passes it)
    // get a per-round countdown bar and no hint/reveal on wrong.
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    this.dotsG = this.add.graphics();
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleTimesTable"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.factText = this.add
      .text(0, 0, "", txt(52, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.arrayLabel = this.add
      .text(0, 0, "", txt(16, "#fff3bf", { bold: true }))
      .setOrigin(0.5);
    this.noDotsText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, shadow: true }))
      .setOrigin(0.5)
      .setAlpha(0);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("tapAnswer"));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layout();
      this.drawDots();
    });
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.factText.setPosition(width / 2, Math.max(130, Math.round(height * 0.27)));
    this.noDotsText.setPosition(width / 2, Math.max(170, Math.round(height * 0.34)));
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  /** Grid area between the fact and the prompt (answers live below the prompt). */
  private get gridArea() {
    const { width, height } = this.scale;
    const top = Math.max(160, Math.round(height * 0.31));
    const bottom = Math.min(height - 196, Math.round(height * 0.62));
    return { x: 14, w: Math.max(120, width - 28), top, bottom, h: Math.max(64, bottom - top) };
  }

  private startRound() {
    this.clearButtons();
    const idx = Math.min(this.levelIndex, this.levels.length - 1);
    const levelVal = this.levels[idx];
    const set = tableSet(levelVal, this.levels[this.levels.length - 1]);
    this.a = Phaser.Math.RND.pick(set);
    // keep products ≤ 100 (10×10 = 100) — the whole 2–10 table space
    this.b = Phaser.Math.Between(2, 10);
    this.answer = this.a * this.b;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.factText.setText(`${this.a} × ${this.b} = ?`);
    speakMath("mul", this.a, this.b);
    this.prevShowDots = this.showDots;
    // Arrays → number mode: single-table levels keep the grid; only the TOP
    // mixed round of the skill's own ladder goes abstract (teach:true stays
    // concrete). Relative to ladder length so a band-6 fluency skill (4 rungs,
    // dataLevels [6,7,8,9]) gets its own abstract top instead of never.
    this.showDots = this.teachMode || set.length === 1 || this.levelIndex < this.levels.length - 1;
    this.drawDots();
    if (this.prevShowDots && !this.showDots) this.flipToast();
    this.spawnButtons();
    this.armChallenge();
  }

  /** #1158 — challenge-mode countdown: a gold bar drains over CHALLENGE_SECONDS;
   *  time-up records a WRONG round (streak breaks, no coin, block does NOT
   *  advance) and deals the next round. No re-teach, no reveal — the older kid
   *  races the clock, and the combo/coin economy feels the miss. */
  private armChallenge() {
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
      // A time-up is a completed (failed) round: the App counts it toward the
      // block (roundsDone), the meter reflects it, and a fresh round deals.
      // No open-wrong is recorded (no tap) so a fully-timed-out block still
      // advances the session — the wrong events make BKT drop the tier.
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.onRoundDone?.(false, CHALLENGE_SECONDS * 1000, this.levels[Math.min(this.levelIndex, this.levels.length - 1)]);
      this.levelIndex++;
      this.startRound();
    });
  }

  private disarmChallenge() {
    if (this.challengeTimer) {
      this.challengeTimer.remove(false);
      this.challengeTimer = undefined;
    }
    if (this.challengeBar) {
      this.tweens.killTweensOf(this.challengeBar);
      this.challengeBar.setAlpha(0);
    }
  }

  /** Draw the concrete a×b dot grid (rows = a, cols = b; each row one color). */
  private drawDots() {
    this.dotsG.clear();
    if (!this.showDots) {
      // Number mode — the "now without the dots" cue is shown once by
      // flipToast() on the transition; leave noDotsText alone here (and on
      // resize) so it isn't re-shown or cut short.
      this.arrayLabel.setAlpha(0);
      return;
    }
    this.arrayLabel.setAlpha(1);
    const g = this.gridArea;
    const cols = this.b;
    const rows = this.a;
    const cell = Math.min(g.w / cols, g.h / rows);
    const dotR = Math.max(3, Math.min(10, cell * 0.34));
    const gridW = cols * cell;
    const gridH = rows * cell;
    const cx = this.scale.width / 2;
    const cy = g.top + (g.h - gridH) / 2 + cell / 2;
    for (let r = 0; r < rows; r++) {
      this.dotsG.fillStyle(DOT_COLORS[r % DOT_COLORS.length], 1);
      for (let c = 0; c < cols; c++) {
        this.dotsG.fillCircle(
          cx - gridW / 2 + c * cell + cell / 2,
          cy - gridH / 2 + r * cell + cell / 2,
          dotR
        );
      }
    }
    this.arrayLabel.setText(t("rowsOf", { a: this.a, b: this.b }));
    this.arrayLabel.setPosition(this.scale.width / 2, g.top + (g.h - gridH) / 2 - 12);
  }

  /** One-time "now you solve it without the dots!" cue on the flip. */
  private flipToken = 0;
  private flipToast() {
    const tok = ++this.flipToken;
    this.noDotsText.setText(t("noDots")).setAlpha(1).setScale(0.7);
    this.tweens.killTweensOf(this.noDotsText);
    this.tweens.add({ targets: this.noDotsText, scale: 1, duration: 240, ease: "Back.easeOut" });
    this.time.delayedCall(2000, () => {
      if (tok !== this.flipToken || !this.noDotsText.active) return;
      this.tweens.add({ targets: this.noDotsText, alpha: 0, duration: 400 });
    });
  }

  private spawnButtons() {
    const opts = new Set<number>([this.answer]);
    let delta = 1;
    while (opts.size < 4) {
      const cand = Math.max(0, this.answer + (delta % 2 === 1 ? -delta : delta));
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
        hint: () => this.showDots
          ? `Count the dots — ${this.a} rows of ${this.b} is ${this.answer}`
          : `Think of ${this.a} times ${this.b} — add ${this.a}, ${this.b} times`,
        hintBn: () => this.showDots
          ? `ডট গুনো — ${this.a} সারিতে ${this.b} করে = ${this.answer}`
          : `ভাবো — ${this.a} গুণ ${this.b} মানে ${this.b} বার ${this.a} যোগ`,
        correct: () => this.answer,
        options: () => this.buttons,
        challenge: this.challenge, // #1158 — no banner/reveal; solve it yourself
      });
      return;
    }
    this.challengeDone = true; // the round is solved — stop the countdown
    this.disarmChallenge();
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    // #1170 — report difficulty from the SKILL's own ladder (a band-6 ×9 drill
    // reports 9, and a band-3 ×2 reports 2), not the shared game ladder.
    this.onRoundDone?.(true, ms, this.levels[Math.min(this.levelIndex, this.levels.length - 1)]);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, DOT_COLORS[i % DOT_COLORS.length]);
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
