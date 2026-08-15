import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, bad, win } from "./audio";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { t as tr } from "./i18n";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import { prefersReducedMotion } from "./reducedMotion";
import {
  useKidStore,
  defaultNova,
  todayIso,
  NOVA_DAILY_CAP,
  speciesEmoji,
  challengeQualityCoins,
} from "../store";

/**
 * 🙈 HIDE & SEEK — pet mini-game #604 (docs/plans/104-pet-minigames.md).
 *
 * Nova hides behind one of several garden objects; the kid taps to find her.
 * A correct tap reveals her with a cheer; a miss wiggles the object. After 2
 * misses the hiding object pulses gently as a hint (no shame). 1 coin per
 * find via novaChallengeReward (cap-aware). Positions are safe-area aware.
 */



const OBJECTS = ["🌳", "🪨", "🌻", "🌸", "🏠"] as const;

interface Obj {
  text: Phaser.GameObjects.Text;
  x: number;
  y: number;
  hiding: boolean;
}

export class HideSeekScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private nova!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private objs: Obj[] = [];
  private misses = 0;
  private busy = false;
  private found = false;


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("HideSeek");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "forest");
    this.drawHeader();
    this.drawNova();
    this.dealObjects();
    onSceneResize(this, () => this.layout());
  }



  private drawHeader() {
    const T = tr;
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T("hideSeekTitle"), txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T("hideSeekHint"), txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.msg = this.add
      .text(this.scale.width / 2, this.scale.height * 0.36, "", txt(18, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(900);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T("petClose"), txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(0, 0, speciesEmoji(nova.species, nova.petStage), txt(76, "#ffffff"))
      .setOrigin(0.5)
      .setDepth(50); // behind the objects until revealed
  }

  private dealObjects() {
    this.objs = [];
    this.misses = 0;
    this.found = false;
    const top = 168 + SAT();
    const n = OBJECTS.length;
    // scattered positions across the play area (safe-area aware)
    const xs = [0.18, 0.42, 0.66, 0.84, 0.28].map((f) => this.scale.width * f);
    const ys = [0.42, 0.5, 0.42, 0.5, 0.62].map((f) => Math.max(top + 40, this.scale.height * f));
    const hideIdx = Phaser.Math.Between(0, n - 1);
    OBJECTS.forEach((emoji, i) => {
      const x = xs[i % xs.length];
      const y = ys[i % ys.length];
      const hiding = i === hideIdx;
      const t = this.add
        .text(x, y, emoji, txt(58, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(hiding ? 200 : 160)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", () => this.tapObject(t, hiding, x, y));
      this.objs.push({ text: t, x, y, hiding });
    });
  }

  private tapObject(t: Phaser.GameObjects.Text, hiding: boolean, x: number, y: number) {
    if (this.busy) return;
    this.busy = true;
    if (hiding) {
      // found — reveal Nova from behind
      pop();
      this.found = true;
      this.nova.setPosition(x, y);
      this.tweens.add({ targets: this.nova, y: y - 46, duration: 420, ease: "Back.easeOut" });
      this.tweens.add({ targets: t, alpha: 0.25, duration: 300, yoyo: true, repeat: 1 });
      const T = tr;
      speak(T("hideSeekFound"));
      this.time.delayedCall(600, () => this.finishRound());
    } else {
      bad();
      this.misses += 1;
      this.wiggle(t);
      this.time.delayedCall(350, () => {
        this.busy = false;
        if (this.misses === 2) {
          // gentle hint — the hiding object pulses softly
          const hid = this.objs.find((o) => o.hiding);
          if (hid && !this.reduced) {
            this.tweens.add({ targets: hid.text, scale: 1.14, duration: 500, yoyo: true, repeat: 3 });
          }
          speak(tr("hideSeekHint2"));
        }
      });
    }
  }

  private wiggle(t: Phaser.GameObjects.Text) {
    if (this.reduced) return;
    this.tweens.add({ targets: t, angle: 7, duration: 70, yoyo: true, repeat: 2, onComplete: () => t.setAngle(0) });
  }

  private finishRound() {
    win();
    // #1194 — quality-tiered: finding Nova on the very first tap is the 2-coin
    // perfect tier; any miss drops to the 1-coin base.
    const perfect = this.misses === 0;
    const coins = challengeQualityCoins(perfect ? 1 : 0.5);
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, coins);
    const T = tr;
    const msgText = granted > 0 ? (perfect ? T("hideSeekPerfect") : T("hideSeekReward")) : T("petCap");
    speak(msgText);
    this.showMsg(msgText, 1500);
    this.time.delayedCall(1900, () => {
      this.objs.forEach((o) => o.text.destroy());
      this.nova.setDepth(50);
      this.dealObjects();
      this.busy = false;
    });
  }

  private showMsg(text: string, ms: number) {
    this.msg.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: ms, duration: 300 });
  }

  private layout() {
    if (!this.hint || !this.closeBtn) return;
    const T = tr;
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.msg.setPosition(this.scale.width / 2, this.scale.height * 0.36);
  }
}
