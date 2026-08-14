import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, gridLayout, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-professions")?.difficultyLevels ?? [3, 3, 4, 4, 5, 5];
const ROUNDS_TO_FINISH = 3;

interface Profession {
  id: string;
  helper: string; // helper emoji
  toolId: string;
}

/** 12 Bangladeshi community helpers and the tool each one uses. */
const PROFESSIONS: Profession[] = [
  { id: "Doctor", helper: "👨‍⚕️", toolId: "Steth" },
  { id: "Teacher", helper: "👩‍🏫", toolId: "Books" },
  { id: "Farmer", helper: "👨‍🌾", toolId: "Rice" },
  { id: "Fisher", helper: "🧑‍🎣", toolId: "Fish" },
  { id: "Police", helper: "👮", toolId: "Siren" },
  { id: "Fire", helper: "👨‍🚒", toolId: "Ext" },
  { id: "Builder", helper: "👷", toolId: "Hammer" },
  { id: "Chef", helper: "👨‍🍳", toolId: "Pan" },
  { id: "Tailor", helper: "🧵", toolId: "Scissors" },
  { id: "Barber", helper: "💇", toolId: "Pole" },
  { id: "Post", helper: "🚴", toolId: "Letter" },
  { id: "Artist", helper: "🎨", toolId: "Brush" },
];

/** Static i18n keys so the audit scanner sees every literal. */
const HELPER_KEY: Record<string, string> = {
  Doctor: "pfhDoctor", Teacher: "pfhTeacher", Farmer: "pfhFarmer", Fisher: "pfhFisher",
  Police: "pfhPolice", Fire: "pfhFire", Builder: "pfhBuilder", Chef: "pfhChef",
  Tailor: "pfhTailor", Barber: "pfhBarber", Post: "pfhPost", Artist: "pfhArtist",
};
const TOOL_KEY: Record<string, string> = {
  Steth: "pftSteth", Books: "pftBooks", Rice: "pftRice", Fish: "pftFish",
  Siren: "pftSiren", Ext: "pftExt", Hammer: "pftHammer", Pan: "pftPan",
  Scissors: "pftScissors", Pole: "pftPole", Letter: "pftLetter", Brush: "pftBrush",
};
const TOOL_EMOJI: Record<string, string> = {
  Steth: "🩺", Books: "📚", Rice: "🌾", Fish: "🐟", Siren: "🚨", Ext: "🧯",
  Hammer: "🔨", Pan: "🍳", Scissors: "✂️", Pole: "💈", Letter: "✉️", Brush: "🖌️",
};

/**
 * Community helpers (#212). A band-2 BGS game matching 12 Bangladeshi helpers
 * to the tool they use (ডাক্তার → 🩺). The helper is shown big with their
 * name (Bangla+EN); the kid taps the matching tool from a 2×2 grid. Correct
 * matches pop green and speak the tool; wrong taps shake red. Each round is
 * K quick matches (K = 3/3/4/4/5/5 by level) across the full 12-helper pool.
 */
export class ProfessionsMatchScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private matchTarget = 3;
  private matchesDone = 0;
  private wrongs = 0;
  private busy = false;
  private lastHelper = "";
  private helperQueue: string[] = [];
  private helper!: Profession;
  private cards: { c: Phaser.GameObjects.Container; toolId: string }[] = [];
  private helperEmoji!: Phaser.GameObjects.Text;
  private helperName!: Phaser.GameObjects.Text;
  private helperBadge!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private grid = { startX: 0, spacingX: 0, cy: 0, cardW: 0, cardH: 0, spacingY: 0 };
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;

  constructor() {
    super("ProfessionsMatch");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "floral");
    this.titleText = this.add
      .text(0, 0, t("pfTitle"), txt(34, "#ffffff", { bold: true }))
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

    this.helperBadge = this.add.graphics();
    this.helperEmoji = this.add.text(0, 0, "", txt(66, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.helperName = this.add.text(0, 0, "", txt(20, NV_GOLD, { bold: true, outline: true })).setOrigin(0.5);

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
    this.prompt.setPosition(width / 2, height * 0.2);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.helperEmoji.setPosition(width / 2, height * 0.32);
    this.helperName.setPosition(width / 2, height * 0.32 + 52);
    this.drawHelperBadge();
    this.grid = gridLayout(this, {
      cols: 2, rows: 2, preferredW: 180, minW: 92, widthPad: 28,
      topPad: height * 0.5, bottomY: height - 20 - SAB(), cardH: 112, gapX: 14, gapY: 14,
    });
    this.positionCards();
  }

  private drawHelperBadge() {
    const { width, height } = this.scale;
    this.helperBadge.clear();
    this.helperBadge.fillStyle(0xffffff, 0.16);
    this.helperBadge.fillRoundedRect(width / 2 - 62, height * 0.32 - 56, 124, 124, 24);
  }

  private startRound() {
    this.clearCards();
    this.matchTarget = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.matchesDone = 0;
    this.wrongs = 0;
    this.busy = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.matchesDone)}/${digit(this.matchTarget)}`);
    this.showMatch();
  }

  /** Shuffle-bag: every 12 matches show all 12 helpers exactly once. */
  private pickHelper(): Profession {
    if (this.helperQueue.length === 0) {
      const ids = PROFESSIONS.map((p) => p.id).sort(() => Math.random() - 0.5);
      // avoid a repeat across the shuffle-bag boundary
      if (ids[0] === this.lastHelper && ids.length > 1) {
        const i = ids.indexOf(this.lastHelper);
        ids.splice(i, 1);
        ids.push(this.lastHelper);
      }
      this.helperQueue = ids;
    }
    const id = this.helperQueue.shift()!;
    this.lastHelper = id;
    return PROFESSIONS.find((p) => p.id === id)!;
  }

  private showMatch() {
    this.clearCards();
    this.helper = this.pickHelper();
    this.helperEmoji.setText(this.helper.helper);
    this.helperName.setText(t(HELPER_KEY[this.helper.id]));
    const expected = this.helper.toolId;
    const distractors = PROFESSIONS.map((p) => p.toolId).filter((tid) => tid !== expected);
    const shuffled = [expected, ...distractors.sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
    this.spawnCards(shuffled);
    this.prompt.setText(t("pfQ", { helper: t(HELPER_KEY[this.helper.id]) }));
    speak(t("pfQ", { helper: t(HELPER_KEY[this.helper.id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private spawnCards(toolIds: string[]) {
    this.clearCards();
    const { startX, spacingX, cy, spacingY, cardW, cardH } = this.grid;
    toolIds.forEach((toolId, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = startX + col * spacingX + cardW / 2;
      const y = cy + (row === 0 ? -spacingY / 2 : spacingY / 2);
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0x0e7490, 1);
      g.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
      g.fillStyle(0x22d3ee, 1);
      g.fillRoundedRect(-cardW / 2 + 2, -cardH / 2 + 2, cardW - 4, cardH - 6, 14);
      c.add(g);
      const emoji = this.add.text(0, -12, TOOL_EMOJI[toolId], txt(Math.min(44, cardH * 0.4), "#ffffff", { shadow: false })).setOrigin(0.5);
      const name = this.add
        .text(0, Math.min(30, cardH * 0.28), t(TOOL_KEY[toolId]), txt(14, "#ffffff", { bold: true, shadow: false, wrap: cardW - 12 }))
        .setOrigin(0.5);
      c.add([emoji, name]);
      c.setSize(cardW, cardH);
      c.setInteractive({ useHandCursor: true });
      const entry = { c, toolId };
      c.on("pointerdown", () => this.tap(entry));
      this.cards.push(entry);
    });
  }

  private positionCards() {
    const { startX, spacingX, cy, spacingY, cardW, cardH } = this.grid;
    this.cards.forEach((card, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      card.c.setPosition(startX + col * spacingX + cardW / 2, cy + (row === 0 ? -spacingY / 2 : spacingY / 2));
    });
  }

  private tap(card: { c: Phaser.GameObjects.Container; toolId: string }) {
    if (this.busy) return;
    const expected = this.helper.toolId;
    if (card.toolId !== expected) {
      this.wrongs++;
      bad();
      this.floatMsg(t("pfQ", { helper: t(HELPER_KEY[this.helper.id]) }), 0xf87171);
      this.tweens.add({ targets: card.c, x: card.c.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
      return;
    }
    this.busy = true;
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    card.c.disableInteractive();
    this.tweens.add({ targets: card.c, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
    this.matchesDone++;
    this.tallyText.setText(`${digit(this.matchesDone)}/${digit(this.matchTarget)}`);
    this.floatMsg(t("pfGreat"), 0x4ade80);
    speak(t(TOOL_KEY[expected]), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.time.delayedCall(550, () => {
      this.busy = false;
      if (this.matchesDone < this.matchTarget) this.showMatch();
      else this.finishRound();
    });
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("pfDone")}  ${digit(this.matchesDone)}/${digit(this.matchTarget)}`, 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongs === 0, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, text, txt(26, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? NV_GOLD : color === 0x4ade80 ? NV_GREEN : NV_RED)
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearCards() {
    this.cards.forEach((o) => o.c.destroy());
    this.cards = [];
  }
}

function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

const BN_D = "০১২৩৪৫৬৭৮৯";
