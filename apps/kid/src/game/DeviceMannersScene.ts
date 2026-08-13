import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, modernCardButton, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-device")?.difficultyLevels ?? [2200, 2400, 2600, 2800, 3000, 3200];
const ROUNDS_TO_FINISH = 3;

type DeviceState = "off" | "booting" | "on" | "poweringoff" | "sleeping";
type RoundKind = "on" | "off";

/** Lvl 1–2 boot (turn on), lvl 3–4 power off, lvl 5–6 random. */
function kindFor(levelIndex: number): RoundKind {
  if (levelIndex < 2) return "on";
  if (levelIndex < 4) return "off";
  return Math.random() < 0.5 ? "on" : "off";
}

/**
 * Device manners (#211). A band-1 digital-citizenship game — entirely offline
 * — teaching safe device habits on a friendly cartoon tablet: press the power
 * button, WAIT patiently while it boots (a tempting "tap me!" bubble appears
 * from lvl 2 — tapping it is never punished, just "not yet!"), and turn it
 * off with a proper power → confirm sequence. Speaks every step in EN or BN.
 */
export class DeviceMannersScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private state: DeviceState = "off";
  private roundKind: RoundKind = "on";
  private wrongs = 0;
  private busy = false;
  private bootState = { v: 0 };
  private bootTween?: Phaser.Tweens.Tween;
  private temptTween?: Phaser.Tweens.Tween;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private frameG!: Phaser.GameObjects.Graphics;
  private screenG!: Phaser.GameObjects.Graphics;
  private content!: Phaser.GameObjects.Text;
  private bootTrack!: Phaser.GameObjects.Graphics;
  private bootFill!: Phaser.GameObjects.Graphics;
  private powerBtn!: Phaser.GameObjects.Container;
  private powerG!: Phaser.GameObjects.Graphics;
  private confirmBtn!: Phaser.GameObjects.Container;
  private cancelBtn!: Phaser.GameObjects.Container;
  private temptation!: Phaser.GameObjects.Container;
  private geom = { x: 0, y: 0, w: 0, h: 0, sX: 0, sY: 0, sW: 0, sH: 0, barW: 0, barY: 0, powerX: 0, powerY: 0, btnY: 0, tempX: 0, tempY: 0 };

  constructor() {
    super("DeviceManners");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleDevice"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);

    this.frameG = this.add.graphics();
    this.screenG = this.add.graphics();
    this.content = this.add.text(0, 0, "", txt(72, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.bootTrack = this.add.graphics();
    this.bootFill = this.add.graphics();

    this.buildPowerButton();
    this.buildTemptation();
    this.buildConfirmButtons();

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.2);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));

    const tw = Math.min(width * 0.6, 300);
    const th = tw * 1.3;
    const tx = width / 2;
    const ty = Math.min(height * 0.56, height - th / 2 - 96);
    this.geom = {
      x: tx, y: ty, w: tw, h: th,
      sX: tx - tw / 2 + 14, sY: ty - th / 2 + 14, sW: tw - 28, sH: th - 28,
      barW: (tw - 28) * 0.68,
      barY: ty - th / 2 + 14 + (th - 28) - 36,
      powerX: tx + tw / 2 + 36, powerY: ty,
      btnY: ty + th / 2 + 62,
      tempX: tx + tw / 2 - 46, tempY: ty - th / 2 + 52,
    };
    this.drawFrame();
    this.redrawScreen();
    this.content.setPosition(this.geom.sX + this.geom.sW / 2, this.geom.sY + this.geom.sH / 2);
    this.drawBootFill();
    this.powerBtn.setPosition(this.geom.powerX, this.geom.powerY);
    this.confirmBtn.setPosition(tx - 80, this.geom.btnY);
    this.cancelBtn.setPosition(tx + 80, this.geom.btnY);
    if (this.temptTween) this.temptTween.stop();
    this.temptation.setPosition(this.geom.tempX, this.geom.tempY);
    if (this.state === "booting") this.startTemptBounce();
  }

  private drawFrame() {
    const { x, y, w, h } = this.geom;
    this.frameG.clear();
    this.frameG.fillStyle(0x334155, 1);
    this.frameG.fillRoundedRect(x - w / 2, y - h / 2, w, h, 20);
    this.frameG.fillStyle(0x475569, 1);
    this.frameG.fillRoundedRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 16);
    // home button dot at the bottom bezel
    this.frameG.fillStyle(0x94a3b8, 1);
    this.frameG.fillCircle(x, y + h / 2 - 12, 7);
  }

  private redrawScreen() {
    const { sX, sY, sW, sH } = this.geom;
    this.screenG.clear();
    let bg = 0x0b1220;
    if (this.state === "on" || this.state === "poweringoff") bg = 0x7dd3fc;
    else if (this.state === "booting") bg = 0x1e293b;
    this.screenG.fillStyle(bg, 1);
    this.screenG.fillRoundedRect(sX, sY, sW, sH, 12);
    if (this.state === "on" || this.state === "poweringoff") {
      // a row of cute app dots at the top of the lit screen
      const dotY = sY + 28;
      const colors = [0xef4444, 0x22c55e, 0xf59e0b, 0x8b5cf6];
      colors.forEach((c, i) => {
        this.screenG.fillStyle(c, 1);
        this.screenG.fillCircle(sX + 26 + i * 22, dotY, 8);
      });
    }
    this.bootTrack.setVisible(this.state === "booting");
    this.bootFill.setVisible(this.state === "booting");
  }

  private buildPowerButton() {
    this.powerBtn = this.add.container(0, 0);
    this.powerG = this.add.graphics();
    this.powerBtn.add(this.powerG);
    this.powerBtn.setSize(52, 52);
    this.powerBtn.setInteractive({ useHandCursor: true });
    this.powerBtn.on("pointerdown", () => this.tapPower());
    this.powerBtn.setVisible(false);
  }

  private drawPower(color: number) {
    this.powerG.clear();
    this.powerG.fillStyle(color, 1);
    this.powerG.fillCircle(0, 0, 26);
    this.powerG.lineStyle(4, 0xffffff, 1);
    this.powerG.strokeCircle(0, 0, 9);
    this.powerG.lineBetween(0, -14, 0, -4);
  }

  private buildTemptation() {
    this.temptation = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(0x22c55e, 1);
    g.fillCircle(0, 0, 30);
    g.lineStyle(4, 0xffffff, 1);
    g.strokeCircle(0, 0, 30);
    this.temptation.add(g);
    const t = this.add.text(0, 2, "👆", txt(30, "#ffffff", { shadow: false })).setOrigin(0.5);
    this.temptation.add(t);
    this.temptation.setSize(60, 60);
    this.temptation.setInteractive({ useHandCursor: true });
    this.temptation.on("pointerdown", () => this.tapTemptation());
    this.temptation.setVisible(false);
  }

  private buildConfirmButtons() {
    this.confirmBtn = modernCardButton(this, 0, 0, 152, 56, t("dmTurnOff"), BTN_ORANGE, 22);
    this.cancelBtn = modernCardButton(this, 0, 0, 126, 56, t("dmCancel"), BTN_NEUTRAL, 22);
    this.confirmBtn.on("pointerdown", () => this.tapConfirm());
    this.cancelBtn.on("pointerdown", () => this.tapCancel());
    this.confirmBtn.setVisible(false);
    this.cancelBtn.setVisible(false);
  }

  private startRound() {
    this.wrongs = 0;
    this.busy = false;
    this.startedAt = this.time.now;
    this.roundKind = kindFor(this.levelIndex);
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    if (this.roundKind === "on") {
      this.setState("off");
      this.prompt.setText(t("dmPowerOn"));
      speak(t("dmPowerOn"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    } else {
      this.setState("on");
      this.prompt.setText(t("dmPowerOff"));
      speak(t("dmPowerOff"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    }
  }

  private setState(s: DeviceState) {
    if (this.bootTween) {
      this.bootTween.stop();
      this.bootTween = undefined;
    }
    this.state = s;
    this.redrawScreen();
    switch (s) {
      case "off":
        this.content.setText("");
        this.powerBtn.setVisible(true);
        this.powerBtn.setInteractive(true);
        this.drawPower(0x16a34a);
        this.confirmBtn.setVisible(false);
        this.cancelBtn.setVisible(false);
        this.setTemptation(false);
        break;
      case "booting":
        this.content.setText("⏳");
        this.powerBtn.setVisible(false);
        this.powerBtn.setInteractive(false);
        this.confirmBtn.setVisible(false);
        this.cancelBtn.setVisible(false);
        this.setTemptation(this.levelIndex >= 1);
        this.bootState.v = 0;
        this.drawBootFill();
        this.bootTween = this.tweens.add({
          targets: this.bootState,
          v: 1,
          duration: LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)],
          ease: "Linear",
          onUpdate: () => this.drawBootFill(),
          onComplete: () => {
            this.bootTween = undefined;
            if (this.state !== "booting") return;
            pop();
            win();
            speak(t("dmSpeakOn"), { lang: getAppLang() === "bn" ? "bn" : "en" });
            this.floatMsg(t("dmReady"), 0x4ade80);
            this.setBusy(600);
            this.time.delayedCall(400, () => {
              this.setState("on");
              this.finishRound();
            });
          },
        });
        break;
      case "on":
        this.content.setText("😊");
        this.powerBtn.setVisible(true);
        this.powerBtn.setInteractive(true);
        this.drawPower(0xdc2626);
        this.confirmBtn.setVisible(false);
        this.cancelBtn.setVisible(false);
        this.setTemptation(false);
        break;
      case "poweringoff":
        this.content.setText("😊");
        this.powerBtn.setVisible(false);
        this.powerBtn.setInteractive(false);
        this.confirmBtn.setVisible(true);
        this.confirmBtn.setInteractive(true);
        this.cancelBtn.setVisible(true);
        this.cancelBtn.setInteractive(true);
        this.setTemptation(false);
        break;
      case "sleeping":
        this.content.setText("😴");
        this.powerBtn.setVisible(false);
        this.powerBtn.setInteractive(false);
        this.confirmBtn.setVisible(false);
        this.cancelBtn.setVisible(false);
        this.setTemptation(false);
        break;
    }
  }

  private tapPower() {
    if (this.busy) return;
    if (this.state === "off") {
      this.setState("booting");
      speak(t("dmBooting"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    } else if (this.state === "on") {
      this.setState("poweringoff");
      this.prompt.setText(t("dmConfirm"));
      speak(t("dmConfirm"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    }
  }

  private tapTemptation() {
    if (this.state !== "booting") return;
    this.wrongs++;
    bad();
    speak(t("dmWait"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.floatMsg(t("dmWait"), 0xf87171);
  }

  private tapConfirm() {
    if (this.state !== "poweringoff") return;
    this.confirmBtn.setInteractive(false);
    this.cancelBtn.setInteractive(false);
    pop();
    win();
    speak(t("dmSpeakOff"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.floatMsg(t("dmGreat"), 0x4ade80);
    this.setBusy(600);
    this.time.delayedCall(400, () => {
      this.setState("sleeping");
      this.finishRound();
    });
  }

  private tapCancel() {
    if (this.state !== "poweringoff") return;
    this.wrongs++;
    bad();
    speak(t("dmStillOn"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.floatMsg(t("dmStillOn"), 0xf87171);
    this.setState("on");
    this.prompt.setText(t("dmPowerOff"));
  }

  private setTemptation(on: boolean) {
    if (this.temptTween) this.temptTween.stop();
    this.temptation.setVisible(on);
    this.temptation.setInteractive(on);
    if (on) this.startTemptBounce();
  }

  private startTemptBounce() {
    this.temptTween = this.tweens.add({
      targets: this.temptation,
      y: this.geom.tempY - 14,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private drawBootFill() {
    const { sX, sW, barY, barW } = this.geom;
    const bx = sX + sW / 2;
    this.bootTrack.clear();
    this.bootTrack.fillStyle(0x0f172a, 1);
    this.bootTrack.fillRoundedRect(bx - barW / 2, barY - 7, barW, 14, 7);
    this.bootFill.clear();
    const w = Math.max(0, Math.min(barW, barW * this.bootState.v));
    this.bootFill.fillStyle(0x22c55e, 1);
    this.bootFill.fillRoundedRect(bx - barW / 2, barY - 7, w, 14, 7);
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("dmDone")}  ${digit(this.roundsDone + 1)}/${digit(ROUNDS_TO_FINISH)}`, 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongs === 0, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private setBusy(ms: number) {
    this.busy = true;
    this.time.delayedCall(ms, () => {
      this.busy = false;
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.34, text, txt(26, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? NV_GOLD : color === 0x4ade80 ? NV_GREEN : NV_RED)
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }
}

function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

const BN_D = "০১২৩৪৫৬৭৮৯";
