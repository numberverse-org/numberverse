import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { useKidStore } from "../store";
import { STAGE_EMOJI, STAGE_NAME_EN, STAGE_NAME_BN, type GardenState } from "./garden";
import { gameBackground } from "./backgrounds";
import { txt, promptTxt, NV_GOLD } from "./ui";
import { t } from "./i18n";
import { speak } from "./speech";
import { prefersReducedMotion } from "./reducedMotion";
import { confettiBurst, starBurst, floatText } from "./celebrate";
import { getAppLang } from "./locale";
import { SAT, SAB } from "./safeArea";

/**
 * 🌱 THE GARDEN — the living proof of every correct answer and mastered skill.
 * A kid opens it from the home screen and sees their plants: wild sprouts from
 * correct answers, trophy flowers from mastered lessons. Tap a plant → it
 * springs and says its name. Growth is the reward, visible at a glance.
 */
export class GardenScene extends Phaser.Scene {
  private kidId = "";
  private kidName = "";
  private onBack?: () => void;
  private plants: Phaser.GameObjects.Container[] = [];
  private unsub?: () => void;
  private title!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private emptyHint!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;
  /** KayKit forest decorations (tree / rock / bush sprites) behind the pots. */
  private decor: Phaser.GameObjects.Container | null = null;

  constructor() {
    super("Garden");
  }

  create(data: { kidId: string; kidName: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.kidName = data?.kidName ?? "";
    this.onBack = data?.onBack;
    this.background = this.add.graphics();
    this.drawBackground();
    const bn = getAppLang() === "bn";
    this.title = this.add
      .text(0, 0, bn ? `🌱 ${this.kidName}-এর বাগান` : `🌱 ${this.kidName}'s Garden`, txt(28, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.sub = this.add
      .text(0, 0, "", txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.emptyHint = this.add
      .text(0, 0, t("gardenEmptyHint"), promptTxt(17))
      .setOrigin(0.5);
    onSceneResize(this, () => this.layout());
    this.layout(); // positions title/sub AND lays out the plants
    // live updates — if the garden changes while this scene is open, redraw
    this.unsub = useKidStore.subscribe(() => this.refresh());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsub?.();
      this.unsub = undefined;
      // #1577 — plant glow pulses / bobs die with the scene.
      for (const p of this.plants) this.tweens.killTweensOf(p);
    });
    // KayKit forest props (precached by the service worker) frame the garden.
    this.load.image("nv-deco-tree", "/assets/forest/tree.png");
    this.load.image("nv-deco-rock", "/assets/forest/rock.png");
    this.load.image("nv-deco-bush", "/assets/forest/bush.png");
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (!this.scene.isActive()) return; // shut down mid-load
      this.buildDecor();
      this.layout();
    });
    this.load.start();
  }

  private drawBackground() {
    gameBackground(this, "forest");
  }

  /** Lay the KayKit forest sprites behind the pots (tree top-left, rock + bush on the floor). */
  private buildDecor() {
    const { width } = this.scale;
    this.decor = this.add.container(0, 0).setDepth(-1);
    const tree = this.add.image(0, 0, "nv-deco-tree").setAlpha(0.92);
    const rock = this.add.image(0, 0, "nv-deco-rock").setAlpha(0.92);
    const bush = this.add.image(0, 0, "nv-deco-bush").setAlpha(0.92);
    // #1737 — forest decor sources were downscaled to roughly the max
    // displayed size (tree 62×128, rock 90×96, bush 87×96; previously
    // 120×247, 232×248, 225×248). The clamp bounds are scaled by
    // oldSourceWidth ÷ newSourceWidth so the DISPLAYED size stays
    // pixel-identical — only the source density changed.
    tree.setScale(Math.max(0.35 * 120 / tree.width, Math.min(0.9 * 120 / tree.width, width * 0.16 / tree.width)));
    rock.setScale(Math.max(0.35 * 232 / rock.width, Math.min(0.9 * 232 / rock.width, width * 0.12 / rock.width)));
    bush.setScale(Math.max(0.3 * 225 / bush.width, Math.min(0.8 * 225 / bush.width, width * 0.10 / bush.width)));
    this.decor.add([tree, rock, bush]);
    this.positionDecor();
  }

  private positionDecor() {
    if (!this.decor || this.decor.list.length < 3) return;
    const { width, height } = this.scale;
    const [tree, rock, bush] = this.decor.list as Phaser.GameObjects.Image[];
    tree.setPosition(width * 0.075, SAT() + tree.displayHeight * 0.55);
    rock.setPosition(width * 0.91, height - SAB() - rock.displayHeight * 0.4);
    bush.setPosition(width * 0.07, height - SAB() - bush.displayHeight * 0.42);
  }

  private layout() {
    const { width, height } = this.scale;
    // iOS notch top + home-indicator bottom — the canvas is full-bleed.
    const sat = SAT();
    this.title.setPosition(width / 2, 30 + sat);
    this.sub.setPosition(width / 2, 72 + sat);
    this.emptyHint.setPosition(width / 2, height - 44 - SAB());
    this.positionDecor();
    this.refresh(); // plants re-flow inside the new (safe) bounds
  }

  private refresh() {
    // wipe old plants
    this.plants.forEach((p) => p.destroy());
    this.plants = [];
    const st = useKidStore.getState();
    const g: GardenState | undefined = this.kidId ? st.garden[this.kidId] : undefined;
    const list = g?.plants ?? [];
    const bn = getAppLang() === "bn";
    this.sub.setText(
      bn
        ? `${list.length}টা গাছ · 🏆 ${list.filter((p) => p.stage >= 5).length}টা ফল`
        : `${list.length} plants · 🏆 ${list.filter((p) => p.stage >= 5).length} fruiting`
    );
    if (list.length === 0) {
      this.emptyHint.setAlpha(1);
      return;
    }
    this.emptyHint.setAlpha(0);
    const { width, height } = this.scale;
    const cardW = 92;
    const gap = 12;
    const cols = Math.max(1, Math.min(4, Math.floor((width - 24) / (cardW + gap))));
    const rows = Math.ceil(list.length / cols);
    const gridW = cols * cardW + (cols - 1) * gap;
    const gridH = rows * (cardW + 18);
    // Keep the whole grid inside the SAFE area (notch top, home-indicator bottom).
    const topPad = 132 + SAT();
    const botPad = 84 + SAB();
    const x0 = (width - gridW) / 2 + cardW / 2;
    const y0 = topPad + Math.max(0, (height - topPad - botPad - gridH) / 2);
    list.forEach((plant, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = x0 + col * (cardW + gap);
      const y = y0 + row * (cardW + 18);
      this.makePlant(x, y, plant, i, list.length);
    });
  }

  private makePlant(x: number, y: number, plant: { id: string; title: string; stage: number }, index: number, total: number) {
    const c = this.add.container(x, y);
    // the LAST plant in the garden is the one currently growing → it pulses
    const active = index === total - 1;
    // soft ground shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.18);
    shadow.fillEllipse(0, 26, 64, 16);
    // pot
    const pot = this.add.graphics();
    pot.fillStyle(0xa05c2b, 1);
    pot.fillRoundedRect(-24, 6, 48, 26, 7);
    pot.fillStyle(0x6b3a15, 1);
    pot.fillRoundedRect(-24, 6, 48, 8, 4);
    // the plant itself — big, readable emoji by stage
    const stage = Math.min(plant.stage, STAGE_EMOJI.length - 1);
    const emoji = this.add
      .text(0, -14, STAGE_EMOJI[stage], txt(46, "#ffffff"))
      .setOrigin(0.5);
    const bn = getAppLang() === "bn";
    const stageName = this.add
      .text(0, 40, bn ? STAGE_NAME_BN[stage] : STAGE_NAME_EN[stage], txt(13, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    // a small gold star marks mastery-trophy flowers
    let star: Phaser.GameObjects.Text | null = null;
    if (plant.title && plant.title !== "Wild sprout") {
      star = this.add.text(-30, -26, "⭐", txt(16, "#ffffff")).setOrigin(0.5);
    }
    c.add([shadow, pot, emoji, stageName, ...(star ? [star] : [])]);
    c.setSize(cardW(), 92);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", () => {
      // a happy pat — the plant springs and says its name. #1203 — the garden
      // spent its polish on ambient idle tweens but the ONE interactive payoff
      // (this tap) was silent; give it a burst + nod like the quiz scenes.
      this.tweens.add({ targets: c, scaleX: 1.18, scaleY: 1.18, duration: 110, yoyo: true, ease: "Back.easeOut" });
      speak(bn ? `${plant.title} — ${STAGE_NAME_BN[stage]}` : `${plant.title} — ${STAGE_NAME_EN[stage]}`);
      confettiBurst(this, c.x, c.y - 10, 12);
      starBurst(this, c.x, c.y - 20, 4);
      // #1430 — a fully-fruited plant isn't "growing" anymore; celebrate the fruit.
      floatText(this, c.x, c.y - 70, stage >= 5 ? t("gardenTapFruited") : t("gardenTapGrowing"), "#9be1a6", 20);
    });
    // the growing plant gently pulses — kids' eyes are drawn to it
    if (active) {
      const glow = this.add.graphics();
      glow.fillStyle(0xffd166, 0.16);
      glow.fillCircle(0, -6, 44);
      c.addAt(glow, 0);
      // #1577 — reduced motion keeps the static glow, skips the pulse.
      if (!prefersReducedMotion()) {
        this.tweens.add({ targets: glow, scale: 1.12, alpha: 0.4, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
    } else {
      this.bob(c);
    }
    this.plants.push(c);
  }

  private bob(c: Phaser.GameObjects.Container) {
    if (prefersReducedMotion()) return; // #1577 — the plant rests in its pot
    this.tweens.add({
      targets: c,
      y: (c.y as number) + Phaser.Math.Between(-4, 4),
      duration: Phaser.Math.Between(1500, 2400),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }
}

function cardW(): number {
  return 92;
}
