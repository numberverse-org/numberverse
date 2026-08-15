import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop } from "./audio";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { t as tr } from "./i18n";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import { prefersReducedMotion } from "./reducedMotion";
import { useKidStore, defaultNova, speciesEmoji } from "../store";

const PET_STROKE_HAPPY = ["petStrokeHappy0", "petStrokeHappy1", "petStrokeHappy2", "petStrokeHappy3"] as const;

/**
 * 💛 PET STROKE — pet mini-game #599 (docs/plans/104-pet-minigames.md).
 *
 * The simplest care act: drag/tap across Nova and she wiggles while hearts
 * spawn at the touch point. Pure affection — no coin, no timer, no fail.
 * Multi-touch (activePointers=3): each pointer spawns hearts. A particle cap
 * keeps the scene smooth.
 */



const MAX_HEARTS = 40; // particle cap (avoid perf hit)
const LOVE_TARGET = 18; // strokes to fill the love meter
const LOVE_MSG_EVERY = 5; // speak a happy line every N hearts

export class PetStrokeScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private nova!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private loveText!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private hearts: Phaser.GameObjects.Text[] = [];
  private love = 0;
  private lastBurst = 0; // time of last heart spawn (throttle)
  private full = false;


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("PetStroke");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "floral");
    this.drawHeader();
    this.drawNova();
    this.spawnHeartsOnTouch();
    onSceneResize(this, () => this.layout());
  }



  private drawHeader() {
    const T = tr;
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T("petStrokeTitle"), txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T("petStrokeHint"), txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.loveText = this.add
      .text(this.scale.width / 2, 108 + SAT(), "💛 0", txt(24, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T("petClose"), txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.scale.width / 2, this.scale.height - 70 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(120, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100);
  }

  private spawnHeartsOnTouch() {
    // pointerdown + pointermove so a drag keeps spawning hearts
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.stroke(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.stroke(p);
    });
  }

  private stroke(p: Phaser.Input.Pointer) {
    if (this.full || this.time.now - this.lastBurst < 90) return;
    this.lastBurst = this.time.now;
    this.addHeart(p.x, p.y);
    this.love += 1;
    this.loveText.setText(`💛 ${this.love}`);
    this.wiggle();
    if (this.love % LOVE_MSG_EVERY === 0) {
      speak(tr(PET_STROKE_HAPPY[Phaser.Math.Between(0, PET_STROKE_HAPPY.length - 1)]));
    }
    if (this.love >= LOVE_TARGET) {
      this.full = true;
      pop();
      this.bigBurst();
      speak(tr("petStrokeFull"));
      this.time.delayedCall(2500, () => {
        this.full = false;
        this.love = 0;
        this.loveText.setText("💛 0");
      });
    }
  }

  private addHeart(x: number, y: number) {
    // particle cap — drop the oldest
    if (this.hearts.length >= MAX_HEARTS) {
      const old = this.hearts.shift();
      old?.destroy();
    }
    const h = this.add
      .text(x + Phaser.Math.Between(-10, 10), y - 6, "💛", txt(Phaser.Math.Between(18, 30), "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(300);
    this.hearts.push(h);
    if (this.reduced) {
      // No flying hearts under reduced motion — just a short, still heart.
      this.time.delayedCall(600, () => {
        this.hearts = this.hearts.filter((x) => x !== h);
        h.destroy();
      });
      return;
    }
    this.tweens.add({
      targets: h,
      y: h.y - Phaser.Math.Between(36, 80),
      x: h.x + Phaser.Math.Between(-22, 22),
      alpha: 0,
      scale: 1.5,
      angle: Phaser.Math.Between(-30, 30),
      duration: Phaser.Math.Between(600, 1000),
      onComplete: () => {
        this.hearts = this.hearts.filter((x) => x !== h);
        h.destroy();
      },
    });
  }

  private wiggle() {
    if (this.reduced) return;
    this.tweens.add({ targets: this.nova, x: this.nova.x + Phaser.Math.Between(-3, 3), duration: 40, yoyo: true });
    this.tweens.add({ targets: this.nova, scale: 1.03, duration: 60, yoyo: true });
  }

  private bigBurst() {
    if (this.reduced) return;
    for (let i = 0; i < 18; i++) {
      this.time.delayedCall(i * 40, () => {
        const x = this.nova.x + Phaser.Math.Between(-90, 90);
        const y = this.nova.y - Phaser.Math.Between(10, 110);
        this.addHeart(x, y);
      });
    }
    this.tweens.add({ targets: this.nova, scale: 1.15, duration: 130, yoyo: true, repeat: 1 });
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn || !this.loveText) return;
    const T = tr;
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.loveText.setPosition(this.scale.width / 2, 108 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 70 - SAB());
  }
}
