import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { prefersReducedMotion } from "./reducedMotion";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-keyboard")?.difficultyLevels ?? [4, 4, 5, 5, 6, 6];
const ROUNDS_TO_FINISH = 3;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

/** Real QWERTY rows; the top number row is added for number/mixed hunts. */
const LETTER_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const NUMBER_ROW = "1234567890";

type HuntMode = "letters" | "numbers" | "mixed";

/** Lvl 1–2 hunt letters, lvl 3–4 hunt numbers, lvl 5–6 the whole keyboard. */
function modeFor(levelIndex: number): HuntMode {
  if (levelIndex < 2) return "letters";
  if (levelIndex < 4) return "numbers";
  return "mixed";
}

function poolFor(mode: HuntMode): string[] {
  if (mode === "numbers") return NUMBER_ROW.split("");
  if (mode === "letters") return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ...NUMBER_ROW.split("")];
}

function rowsFor(mode: HuntMode): string[] {
  if (mode === "numbers") return [NUMBER_ROW];
  if (mode === "letters") return LETTER_ROWS;
  return [NUMBER_ROW, ...LETTER_ROWS];
}

interface KeyRef {
  ch: string;
  c: Phaser.GameObjects.Container;
  g: Phaser.GameObjects.Graphics;
  t: Phaser.GameObjects.Text;
  w: number;
  h: number;
}

/**
 * Keyboard explorer (#210). A band-1 ICT game finding letters and numbers on a
 * friendly on-screen QWERTY keyboard. A big bouncing badge shows the key to
 * find and speaks it ("Find the B" / "B খুঁজো"); the kid taps the right key
 * on the keyboard — correct flashes green and speaks the key, wrong shakes
 * red. Lvl 1–2 hunt letters (3 QWERTY rows), lvl 3–4 hunt numbers (big top
 * row), lvl 5–6 the whole keyboard mixed.
 */
export class KeyboardExplorerScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private keys = new Map<string, KeyRef>();
  private keyRows: string[] = LETTER_ROWS;
  private pool: string[] = [];
  private sequence: string[] = [];
  private stepIdx = 0;
  private wrongs = 0;
  private busy = false;
  private roundSeq = 0;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private targetBadge!: Phaser.GameObjects.Container;
  private targetChar!: Phaser.GameObjects.Text;
  private keyHintText!: Phaser.GameObjects.Text;
  private challenge = false; // #1158 — older-kid timed mode (no reveal on miss)
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;

  constructor() {
    super("KeyboardExplorer");
  }

  private keyHandler = (event: KeyboardEvent) => this.handleKeyDown(event);

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; challenge?: boolean }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.challenge = !!data.challenge;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleKeyboard"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.keyHintText = this.add
      .text(0, 0, t("keyboardKeyHint"), txt(16, NV_GOLD, { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setVisible(false);

    this.buildTargetBadge();
    this.buildKeys();

    // #1139 — real-keyboard path: the physical key IS the tap. Tablets and
    // no-keyboard devices keep the on-screen QWERTY tap path below as fallback.
    this.input.keyboard?.on("keydown", this.keyHandler);
    this.events.once("shutdown", () => {
      this.input.keyboard?.off("keydown", this.keyHandler);
      // #1577 — the target-badge pulse dies with the scene.
      this.tweens.killTweensOf(this.targetBadge);
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
    this.prompt.setPosition(width / 2, height * 0.18);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.targetBadge.setPosition(width / 2, height * 0.3);
    this.keyHintText.setPosition(width / 2, height * 0.3 + 70);
    this.keyHintText.setWordWrapWidth(Math.max(200, width - 60));
    this.positionKeyboard();
  }

  /** Big bouncing badge showing the key to find. */
  private buildTargetBadge() {
    this.targetBadge = this.add.container(this.scale.width / 2, this.scale.height * 0.3);
    const g = this.add.graphics();
    g.fillStyle(0xfbbf24, 1);
    g.fillRoundedRect(-44, -44, 88, 88, 20);
    g.lineStyle(5, 0xfffbeb, 1);
    g.strokeRoundedRect(-44, -44, 88, 88, 20);
    this.targetBadge.add(g);
    this.targetChar = this.add.text(0, -2, "A", txt(44, "#7c2d12", { bold: true, shadow: false })).setOrigin(0.5);
    this.targetBadge.add(this.targetChar);
    // #1577 — reduced motion keeps the badge static; the key glyph still reads.
    if (!prefersReducedMotion()) {
      this.tweens.add({ targets: this.targetBadge, scaleX: 1.06, scaleY: 1.06, duration: 550, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private buildKeys() {
    const all = "QWERTYUIOPASDFGHJKLZXCVBNM1234567890";
    for (const ch of all) {
      const c = this.add.container(0, 0);
      const g = this.add.graphics();
      const t = this.add.text(0, -1, this.keyLabel(ch), txt(18, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
      c.add([g, t]);
      c.setInteractive({ useHandCursor: true });
      let ref: KeyRef = { ch, c, g, t, w: 0, h: 0 };
      c.on("pointerdown", () => this.tap(ref));
      this.keys.set(ch, ref);
    }
  }

  private positionKeyboard() {
    const { width, height } = this.scale;
    const rows = this.keyRows;
    const pad = 10;
    const gap = 4;
    const keyW = Math.max(26, Math.floor((width - pad * 2 - 9 * gap) / 10));
    const keyH =
      rows.length === 1
        ? Math.min(78, Math.floor(keyW * 1.5))
        : Math.max(42, Math.min(56, Math.floor(keyW * 1.05)));
    const rowH = keyH + 8;
    const bottom = height - 18 - SAB();
    const startY = bottom - (rows.length - 1) * rowH;
    for (const key of this.keys.values()) {
      key.w = keyW;
      key.h = keyH;
    }
    rows.forEach((rowStr, r) => {
      const n = rowStr.length;
      const totalW = n * keyW + (n - 1) * gap;
      const x0 = width / 2 - totalW / 2;
      const y = startY + r * rowH;
      for (let i = 0; i < n; i++) {
        const ch = rowStr[i];
        const key = this.keys.get(ch);
        if (!key) continue;
        key.c.setPosition(x0 + i * (keyW + gap) + keyW / 2, y + keyH / 2);
        key.c.setSize(keyW, keyH);
        key.c.setVisible(true);
        this.drawKey(key);
      }
    });
    // hide any key not in the visible rows
    for (const [ch, key] of this.keys) {
      if (!rows.some((r) => r.includes(ch))) key.c.setVisible(false);
    }
  }

  private drawKey(key: KeyRef) {
    const { w, h } = key;
    key.g.clear();
    key.g.fillStyle(0x1d4ed8, 1);
    key.g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    key.g.fillStyle(0x3b82f6, 1);
    key.g.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 6, 7);
    key.t.setFontSize(Math.min(20, Math.max(13, Math.floor(w * 0.52))));
    key.t.setText(this.keyLabel(key.ch));
  }

  private startRound() {
    this.roundSeq++;
    const mode = modeFor(this.levelIndex);
    const count = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.pool = poolFor(mode);
    this.keyRows = rowsFor(mode);
    this.sequence = [];
    let prev = "";
    for (let i = 0; i < count; i++) {
      const candidates = this.pool.filter((c) => c !== prev);
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      this.sequence.push(pick);
      prev = pick;
    }
    this.stepIdx = 0;
    this.wrongs = 0;
    this.busy = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.stepIdx)}/${digit(this.sequence.length)}`);
    this.positionKeyboard();
    this.showTarget();
    // #1139 — a visible nudge that BOTH the real keyboard and the on-screen
    // keys answer the same question (tablets can still tap the QWERTY).
    this.keyHintText.setText(t("keyboardKeyHint")).setVisible(true);
    this.armChallenge();
  }

  private showTarget() {
    const target = this.sequence[this.stepIdx];
    const label = this.keyLabel(target);
    this.targetChar.setText(label);
    this.prompt.setText(t("kbQ", { key: label }));
    speak(t("kbQ", { key: label }), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private tap(key: KeyRef) {
    if (this.busy || !key.c.visible) return;
    const target = this.sequence[this.stepIdx];
    if (key.ch !== target) {
      this.wrongs++;
      bad();
      this.flashKey(key, 0xef4444);
      this.tweens.add({ targets: key.c, x: key.c.x + 7, duration: 55, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
      this.floatMsg(t("kbQ", { key: this.keyLabel(target) }), 0xf87171);
      return;
    }
    this.correctKey(key);
  }

  /** #1139 — the physical keyboard routes through the SAME correct action as
   *  tapping the on-screen key: pop + celebrate + win + advance. A wrong key
   *  gets the shared hintWrong nudge (challenge mode suppresses the reveal). */
  private handleKeyDown(event: KeyboardEvent) {
    if (this.busy) return;
    const key = event.key;
    if (!/^[a-zA-Z0-9]$/.test(key)) return;
    event.preventDefault();
    const ch = key.toUpperCase();
    const target = this.sequence[this.stepIdx];
    if (!target) return;
    if (ch !== target) {
      this.wrongs++;
      this.physicalWrong(target, this.keys.get(ch));
      return;
    }
    const targetKey = this.keys.get(target);
    if (targetKey) this.correctKey(targetKey);
  }

  private physicalWrong(target: string, pressed?: KeyRef) {
    const container = pressed && pressed.c.visible ? pressed.c : this.targetBadge;
    hintWrong(this, container, {
      hint: () => t("kbQ", { key: this.keyLabel(target) }),
      hintBn: () => t("kbQ", { key: this.keyLabel(target) }),
      correct: () => target,
      keepOnWrong: true, // keys stay available — the QWERTY is never retired
      challenge: this.challenge, // #1158 — no banner/reveal in challenge mode
    });
  }

  /** Shared correct path for the on-screen tap and the physical keydown. */
  private correctKey(key: KeyRef) {
    const target = this.sequence[this.stepIdx];
    this.busy = true;
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.flashKey(key, 0x22c55e);
    this.stepIdx++;
    this.tallyText.setText(`${digit(this.stepIdx)}/${digit(this.sequence.length)}`);
    this.floatMsg(t("kbGreat"), 0x4ade80);
    speak(t("kbSpeak", { key: this.keyLabel(target) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    const finished = this.stepIdx >= this.sequence.length;
    if (finished) {
      this.challengeDone = true;
      this.disarmChallenge();
    }
    const seq = this.roundSeq;
    this.time.delayedCall(500, () => {
      if (seq !== this.roundSeq) return; // a challenge timeout already moved on
      this.busy = false;
      if (finished) this.finishRound();
      else this.showTarget();
    });
  }

  /** A quick colored rounded-rect flash over the tapped key. */
  private flashKey(key: KeyRef, color: number) {
    const { x, y } = key.c;
    const w = key.w;
    const h = key.h;
    const g = this.add.graphics().setDepth(15);
    g.fillStyle(color, 0.85);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    this.tweens.add({ targets: g, alpha: 0, duration: 550, onComplete: () => g.destroy() });
  }

  private finishRound() {
    this.disarmChallenge();
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("kbDone")}  ${digit(this.sequence.length)}/${digit(this.sequence.length)}`, 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongs === 0, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  /** #1158 — challenge-mode countdown: a gold bar drains over CHALLENGE_SECONDS
   *  for the whole key-hunt round. Time-up records a wrong round and deals the
   *  next one; no re-teach, no reveal — the older kid races the clock. */
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
    this.challengeTimer = this.time.delayedCall(CHALLENGE_SECONDS * 1000, () => this.onChallengeTimeout());
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

  private onChallengeTimeout() {
    if (this.challengeDone) return;
    this.challengeDone = true;
    this.disarmChallenge();
    this.roundSeq++; // invalidate any in-flight correct→next-target callback
    this.busy = true;
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(false, CHALLENGE_SECONDS * 1000, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.34, text, `#${color.toString(16).padStart(6, "0")}`, 26, -24);
  }

  /** QWERTY letters stay Latin; numbers show Bangla digits in bn locale. */
  private keyLabel(ch: string): string {
    return /[0-9]/.test(ch) ? digit(Number(ch)) : ch;
  }
}


