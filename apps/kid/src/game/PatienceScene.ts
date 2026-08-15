import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-patience")?.difficultyLevels ?? [3, 3, 4, 4, 5, 5];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-patience")?.skillId ?? "bgs-patience";
const ROUNDS_TO_FINISH = 3;
const BAR_H = 18;

interface PatScenario {
  id: string;
  emoji: string; // seen while waiting
  reward: string; // appears when the wait ends
  waiting: string; // i18n key
  rewardKey: string; // i18n key
}
/* Six waiting scenarios (#236 "5+ scenarios"): grow, brew, cross, fill, hatch,
 * and a turn-taking swing. Emoji are language-neutral; the waiting/reward
 * lines localize EN/BN. */
const SCENARIOS: PatScenario[] = [
  { id: "flower", emoji: "🌱", reward: "🌸", waiting: "patFlower", rewardKey: "patFlowerReward" },
  { id: "tea", emoji: "🍵", reward: "☕", waiting: "patTea", rewardKey: "patTeaReward" },
  { id: "light", emoji: "🚦", reward: "🚌", waiting: "patLight", rewardKey: "patLightReward" },
  { id: "balloon", emoji: "🎈", reward: "🎉", waiting: "patBalloon", rewardKey: "patBalloonReward" },
  { id: "egg", emoji: "🥚", reward: "🐣", waiting: "patEgg", rewardKey: "patEggReward" },
  { id: "swing", emoji: "🛝", reward: "🧒", waiting: "patSwing", rewardKey: "patSwingReward" },
];

/**
 * Patience — waiting & turn-taking (#236).
 * Band 1 (ages 3–5, values/BGS). A friendly scene grows, boils, fills,
 * hatches… and the kid learns to WAIT. A progress bar fills over a few
 * seconds; from level 2 a tempting "Tap me!" bubble pops up — tapping it is
 * never punished, just a gentle "not yet, be patient!" and the wait continues.
 * When the bar completes the reward appears with a sparkle burst — patience
 * pays off. Gentle rewards only, no timers or penalties.
 */
export class PatienceScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private scenario!: PatScenario;
  private lastId = "";
  private roundDone = false;
  private barX = 0;
  private barY = 0;
  private barW = 0;
  private progressTimer!: Phaser.Time.TimerEvent;
  private track!: Phaser.GameObjects.Graphics;
  private fill!: Phaser.GameObjects.Graphics;
  private bigEmoji!: Phaser.GameObjects.Text;
  private rewardText!: Phaser.GameObjects.Text;
  private distraction?: Phaser.GameObjects.Container;
  private pulse?: Phaser.Tweens.Tween;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Patience");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("patTitle"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.track = this.add.graphics();
    this.fill = this.add.graphics().setDepth(3);
    this.bigEmoji = this.add.text(0, 0, "", txt(96, "#ffffff")).setOrigin(0.5).setDepth(2);
    this.rewardText = this.add.text(0, 0, "", txt(22, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(2);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 26);
    this.roundText.setPosition(width / 2, 60);
    this.meter.setPosition(width / 2, 88);
    this.prompt.setPosition(width / 2, height * 0.16);
    this.barX = width / 2;
    this.barY = height * 0.72;
    this.barW = Math.min(width * 0.7, 420);
    this.bigEmoji.setPosition(width / 2, height * 0.44);
    this.rewardText.setPosition(width / 2, height * 0.57);
    const t = this.track.clear();
    t.fillStyle(0x1d3557, 1);
    t.fillRoundedRect(this.barX - this.barW / 2, this.barY - BAR_H / 2, this.barW, BAR_H, BAR_H / 2);
    t.lineStyle(2, 0xffffff, 0.6);
    t.strokeRoundedRect(this.barX - this.barW / 2, this.barY - BAR_H / 2, this.barW, BAR_H, BAR_H / 2);
  }

  private pickScenario() {
    let s = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    if (s.id === this.lastId && SCENARIOS.length > 1) {
      s = SCENARIOS[(SCENARIOS.indexOf(s) + 1) % SCENARIOS.length];
    }
    this.lastId = s.id;
    this.scenario = s;
  }

  private startRound() {
    this.roundDone = false;
    this.clearDistraction();
    if (this.pulse) this.pulse.stop();
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.pickScenario();
    this.bigEmoji.setText(this.scenario.emoji).setScale(1);
    this.rewardText.setText(t("patWait"));
    this.prompt.set(t(this.scenario.waiting));
    speak(t(this.scenario.waiting), { lang: getAppLang() === "bn" ? "bn" : "en" });
    // the scene breathes while it waits
    this.pulse = this.tweens.add({ targets: this.bigEmoji, scaleX: 1.07, scaleY: 1.07, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.startProgress();
    this.scheduleDistractions();
  }

  private startProgress() {
    const dur = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)] * 1000;
    const start = this.time.now;
    const update = () => {
      const p = Math.min(1, (this.time.now - start) / dur);
      this.fill.clear();
      this.fill.fillStyle(0xffd166, 1);
      this.fill.fillRoundedRect(this.barX - this.barW / 2, this.barY - BAR_H / 2, Math.max(3, this.barW * p), BAR_H, BAR_H / 2);
      if (p >= 1) {
        this.progressTimer.remove();
        this.onReady();
      }
    };
    this.progressTimer = this.time.addEvent({ delay: 33, loop: true, callback: update });
  }

  /** A tempting "Tap me!" bubble. Tapping it is gently guided, never punished. */
  private scheduleDistractions() {
    const dur = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)] * 1000;
    if (this.levelIndex >= 2) {
      this.time.delayedCall(dur * 0.4, () => this.showDistraction());
    }
    if (this.levelIndex >= 4) {
      this.time.delayedCall(dur * 0.65, () => this.showDistraction());
    }
  }

  private showDistraction() {
    if (this.roundDone) return;
    const { width, height } = this.scale;
    const x = width * (0.15 + Math.random() * 0.7);
    const y = height * (0.28 + Math.random() * 0.3);
    const c = this.add.container(x, y).setDepth(20);
    const g = this.add.graphics();
    g.fillStyle(0xff6b6b, 1);
    g.fillRoundedRect(-40, -24, 80, 48, 18);
    g.lineStyle(3, 0xffffff, 1);
    g.strokeRoundedRect(-40, -24, 80, 48, 18);
    c.add(g);
    c.add(this.add.text(0, 0, t("patTap"), txt(16, "#ffffff", { bold: true })).setOrigin(0.5));
    c.setSize(80, 48);
    c.setInteractive();
    c.on("pointerdown", () => this.tapDistraction(c));
    this.tweens.add({ targets: c, y: y - 12, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.distraction = c;
  }

  private tapDistraction(c: Phaser.GameObjects.Container) {
    this.clearDistraction();
    const m = this.add.text(c.x, c.y - 40, t("patNotYet"), txt(16, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 26, alpha: 0, duration: 900, onComplete: () => m.destroy() });
  }

  private clearDistraction() {
    if (this.distraction) {
      this.distraction.destroy();
      this.distraction = undefined;
    }
  }

  private onReady() {
    this.roundDone = true;
    this.clearDistraction();
    if (this.pulse) this.pulse.stop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    // the reward appears — pop in with a sparkle burst
    this.bigEmoji.setScale(0).setText(this.scenario.reward);
    this.tweens.add({ targets: this.bigEmoji, scaleX: 1, scaleY: 1, duration: 420, ease: "Back.easeOut" });
    this.rewardText.setText(t(this.scenario.rewardKey));
    speak(t(this.scenario.rewardKey), { lang: getAppLang() === "bn" ? "bn" : "en" });
    const { width, height } = this.scale;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.sparkle(width / 2 + Math.cos(a) * 74, height * 0.44 + Math.sin(a) * 74);
    }
    if (this.roundsDone >= ROUNDS_TO_FINISH) {
      const m = this.add.text(width / 2, height * 0.36, t("patGreat"), txt(24, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(30);
      this.tweens.add({ targets: m, y: m.y - 26, alpha: 0, duration: 1200, onComplete: () => m.destroy() });
    }
    const ms = Math.max(1, this.time.now - this.startedAt);
    // #1002 — patience is correct-by-design: the success signal is that the
    // wait finished (roundDone), not a tapped answer.
    this.onRoundDone?.(this.roundDone, ms, this.levelIndex + 1);
    this.time.delayedCall(1100, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private sparkle(x: number, y: number) {
    const s = this.add.text(x, y, "✨", txt(30, "#ffffff")).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: s, y: y - 26, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 500, onComplete: () => s.destroy() });
  }
}
