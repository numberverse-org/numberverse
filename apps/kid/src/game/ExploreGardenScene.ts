import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { gameBackground } from "./backgrounds";
import { pop, click } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { t as tr } from "./i18n";
import { txt, promptTxt, NV_GOLD } from "./ui";
const EXPLORE_PROMPTS = ["exploreGardenPrompt0", "exploreGardenPrompt1", "exploreGardenPrompt2", "exploreGardenPrompt3", "exploreGardenPrompt4", "exploreGardenPrompt5"];
import { SAT, SAB } from "./safeArea";

/**
 * 🌸 EXPLORE GARDEN — a NO-PRESSURE free-play break scene (#1143).
 *
 * There is deliberately no judgment: no score, no progress gating, and no
 * lesson-end feedback. A kid picks an emoji from the bottom palette and
 * plants it anywhere on the canvas; each plant pops, sparkles, and bobs
 * gently. A 💬 button speaks open-ended invitations ("How many flowers did
 * you plant?") — any placement is fine. The tiny top-left counter is
 * informational only.
 */

const PALETTE = ["🌸", "🐝", "🦋", "🪨", "🌱", "☀️", "🍄"] as const;



export class ExploreGardenScene extends Phaser.Scene {
  private lang: "en" | "bn" = "en";
  private selectedIndex = 0;
  private selectedEmoji: string = PALETTE[0];
  private placedCount = 0;
  private plants: Phaser.GameObjects.Text[] = [];
  private paletteButtons: { btn: Phaser.GameObjects.Container; disc: Phaser.GameObjects.Arc }[] = [];
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private counter!: Phaser.GameObjects.Text;
  private plantZone!: Phaser.GameObjects.Rectangle;
  private clearBtn!: Phaser.GameObjects.Container;
  private speakBtn!: Phaser.GameObjects.Container;
  private paletteTop = 0;

  constructor() {
    super("ExploreGarden");
  }

  create(_data?: unknown) {
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.selectedIndex = 0;
    this.selectedEmoji = PALETTE[0];
    this.placedCount = 0;
    this.plants = [];
    this.paletteButtons = [];

    gameBackground(this, "forest");
    this.drawHeader();
    this.layout();
    onSceneResize(this, () => this.layout());
  }



  private drawHeader() {
    const copy = tr;
    this.title = this.add
      .text(this.scale.width / 2, 30 + SAT(), copy("exploreGardenTitle"), txt(28, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setDepth(70);
    this.subtitle = this.add
      .text(this.scale.width / 2, 72 + SAT(), copy("exploreGardenSubtitle"), promptTxt(15))
      .setOrigin(0.5)
      .setDepth(70);
    this.counter = this.add
      .text(14, 104 + SAT(), this.counterText(), txt(15, NV_GOLD, { bold: true, shadow: false }))
      .setOrigin(0, 0.5)
      .setDepth(70);
  }

  private layout() {
    const { width, height } = this.scale;
    const sat = SAT();
    const sab = SAB();

    this.title.setPosition(width / 2, 30 + sat);
    this.subtitle.setPosition(width / 2, 72 + sat);
    this.counter.setPosition(14, 104 + sat);

    this.renderControls(width, sat);
    this.renderPalette(width, height, sab);
    this.renderPlantZone(width, sat);
  }

  private renderControls(width: number, sat: number) {
    this.clearBtn?.destroy();
    this.speakBtn?.destroy();
    const y = 104 + sat;
    const r = 22;
    this.clearBtn = this.makeRoundButton("🗑", width - 34 - r, y, () => this.clearGarden(), r);
    this.speakBtn = this.makeRoundButton("💬", width - 34 - r * 3 - 10, y, () => this.speakPrompt(), r);
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

  private renderPalette(width: number, height: number, sab: number) {
    this.paletteButtons.forEach((entry) => entry.btn.destroy());
    this.paletteButtons = [];

    const n = PALETTE.length;
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

    PALETTE.forEach((emoji, i) => {
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
      this.paletteButtons.push({ btn, disc });
    });
  }

  private renderPlantZone(width: number, sat: number) {
    this.plantZone?.destroy();
    const top = 128 + sat;
    const bottom = this.paletteTop - 10;
    const h = Math.max(24, bottom - top);
    this.plantZone = this.add
      .rectangle(width / 2, top + h / 2, width, h, 0x000000, 0)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    this.plantZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.plant(pointer.x, pointer.y);
    });
  }

  private selectPalette(index: number) {
    this.selectedIndex = index;
    this.selectedEmoji = PALETTE[index];
    this.paletteButtons.forEach((entry, i) => {
      const selected = i === index;
      entry.disc.setStrokeStyle(selected ? 3 : 2, selected ? 0xffd166 : 0xffffff, selected ? 1 : 0.55);
      this.tweens.killTweensOf(entry.btn);
      this.tweens.add({ targets: entry.btn, scale: selected ? 1.1 : 1, duration: 120, ease: "Back.easeOut" });
    });
  }

  private plant(x: number, y: number) {
    const top = 128 + SAT();
    const bottom = this.paletteTop - 10;
    const px = Phaser.Math.Clamp(x, 18, this.scale.width - 18);
    const py = Phaser.Math.Clamp(y, top + 12, bottom - 6);
    const emoji = this.add
      .text(px, py, this.selectedEmoji, txt(44, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(10)
      .setScale(0.4);
    this.tweens.add({ targets: emoji, scale: 1, duration: 220, ease: "Back.easeOut" });
    pop();
    this.sparkle(px, py - 12);
    this.bob(emoji, py);
    this.plants.push(emoji);
    this.placedCount += 1;
    this.counter.setText(this.counterText());
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
    this.placedCount = 0;
    this.counter.setText(this.counterText());
  }

  private speakPrompt() {
    speak(tr(Phaser.Math.RND.pick(EXPLORE_PROMPTS)));
  }

  private counterText(): string {
    return tr("exploreGardenCounter", { n: this.placedCount });
  }
}
