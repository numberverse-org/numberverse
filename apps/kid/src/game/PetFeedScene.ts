import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, win } from "./audio";
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
} from "../store";

const PET_FEED_YUMS = ["petFeedYum0", "petFeedYum1", "petFeedYum2", "petFeedYum3"] as const;

/**
 * 🍎 PET FEED — a #104 mini-game (the reference the other 19 copy).
 *
 * Treats fall from the top; the kid taps them to feed Nova. Each catch pops a
 * chew + spoken "yum"; when the round's treats are eaten, feeding awards the
 * once-a-day care coin via `novaCare(kidId, "feed")` (respects the anti-grind
 * cap). Purely optional, offline-first, no ads, i18n EN + BN.
 *
 * This file is the template for the other pet mini-games — see
 * docs/plans/104-pet-minigames.md for the shared pattern. Copy it, rename the
 * scene key/class, swap the mechanics, and register in engine.ts.
 */

const TREAT_EMOJI = ["🍎", "🍓", "🥕", "🍇"] as const;
const ROUND_TREATS = 6; // treats per feed round

export class PetFeedScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private nova!: Phaser.GameObjects.Text; // the pet (species emoji)
  private hint!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;
  private fedCount = 0;
  private treats: Phaser.GameObjects.Text[] = [];
  private spawnTimer?: Phaser.Time.TimerEvent;


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("PetFeed");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "candy");
    this.drawHeader();
    this.drawNova();
    this.startRound();
    onSceneResize(this, () => this.layout());
  }



  private drawHeader() {
    const T = tr;
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T("petFeedTitle"), txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T("petFeedHint"), txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    // close / back — returns to Nova (the launcher passes onBack)
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T("petClose"), txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawNova() {
    // the current species' face at its grown stage — reuse the store helper
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.scale.width / 2, this.scale.height - 90 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(96, "#ffffff"))
      .setOrigin(0.5);
  }

  private startRound() {
    this.fedCount = 0;
    // spawn a treat every ~900ms until the round is filled
    this.spawnTimer = this.time.addEvent({
      delay: 900,
      repeat: ROUND_TREATS - 1,
      callback: () => this.spawnTreat(),
    });
    this.spawnTreat();
  }

  private spawnTreat() {
    const emoji = TREAT_EMOJI[Phaser.Math.Between(0, TREAT_EMOJI.length - 1)];
    const x = Phaser.Math.Between(40, this.scale.width - 40);
    const treat = this.add
      .text(x, -40, emoji, txt(40, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const fallMs = this.reduced ? 3600 : 2600; // gentler fall under reduced motion
    treat.setData("vy", this.scale.height / fallMs);
    treat.on("pointerdown", () => this.catchTreat(treat));
    this.treats.push(treat);
    this.tweens.add({ targets: treat, y: this.scale.height + 40, duration: fallMs, onComplete: () => this.dismissTreat(treat) });
  }

  private catchTreat(treat: Phaser.GameObjects.Text) {
    this.tweens.killTweensOf(treat);
    this.treats = this.treats.filter((x) => x !== treat);
    const T = tr;
    // fly to Nova's mouth, then chew
    const mouth = this.nova;
    const t = this.tweens.add({
      targets: treat,
      x: mouth.x,
      y: mouth.y - 20,
      scale: 0.3,
      duration: 220,
      ease: "Quad.easeIn",
      onComplete: () => {
        pop();
        treat.destroy();
        speak(tr(PET_FEED_YUMS[Phaser.Math.Between(0, PET_FEED_YUMS.length - 1)]));
        this.fedCount += 1;
        if (this.fedCount >= ROUND_TREATS) this.finishRound();
      },
    });
    void t;
  }

  private dismissTreat(treat: Phaser.GameObjects.Text) {
    // missed treats just vanish — no penalty
    this.treats = this.treats.filter((x) => x !== treat);
    treat.destroy();
  }

  private finishRound() {
    this.spawnTimer?.remove();
    win();
    const st = useKidStore.getState();
    const before = st.nova[this.kidId] ?? defaultNova();
    const today = todayIso();
    const alreadyToday = before.fed === today;
    useKidStore.getState().novaCare(this.kidId, "feed");
    const after = useKidStore.getState().nova[this.kidId] ?? defaultNova();
    const coinAdded = after.coins - before.coins;
    const earnedToday = after.earnDay === today ? after.earnedToday : 0;
    const T = tr;
    if (alreadyToday) speak(T("petFeedAlready"));
    else if (coinAdded > 0 && earnedToday >= NOVA_DAILY_CAP) speak(T("petFeedCap"));
    else if (coinAdded > 0) speak(T("petFeedReward"));
    else speak(T("petFeedAlready"));
    // a light "play again" resets the round
    this.time.delayedCall(1600, () => this.startRound());
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn) return;
    const T = tr;
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 90 - SAB());
  }
}
