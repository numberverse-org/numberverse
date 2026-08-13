import Phaser from "phaser";
import { wrongTap } from "./feedback";
import { getAppLang } from "./locale";
import { t } from "./i18n";
import { SAT } from "./safeArea";
import { cancelSpeech, speak, speakAnswer } from "./speech";
import { wrongLedger } from "./wrongLedger";
import { useKidStore } from "../store";
import { NV_GOLD, NV_NAVY } from "./ui"; // tokenized #591

/**
 * Escalating hints on repeated misses — every miss is a teaching moment.
 *
 *   miss #1  → soft nudge  ("Almost! Try again 💪")
 *   miss #2+ → BIG coaching banner + fade out ~half of the wrong buttons
 *   miss #3+ → glow the correct answer + reveal banner ("The answer is X!")
 *
 * The miss counter is keyed by the current correct value, so it resets
 * naturally when a new round poses a different question.
 *
 * ## Confidence depth (adaptive)
 * The ladder's SPEED scales with the kid's Moni confidence (0–1): an unsure
 * kid gets scaffolding early, a sharp kid is held back so they can figure it
 * out themselves.
 *   confidence < 0.4  (fragile) → reveal at miss 2  — catch them before snowball
 *   0.4 – 0.7          (steady)  → reveal at miss 3  — the classic ladder
 *   > 0.7             (sharp)   → reveal at miss 4  — give the confident mind room
 * The reveal banner is the SAME "answer is X" teach, just timed to their pace.
 */
export type HintDepth = 0 | 1 | 2;

/** Map a Moni confidence score to a hint-depth tier. Exported for tests + UI. */
export function confidenceDepth(confidence: number | undefined): HintDepth {
  if (confidence === undefined) return 1;      // no profile yet → the classic ladder
  if (confidence < 0.4) return 0;              // fragile — scaffold early
  if (confidence > 0.7) return 2;              // sharp — hold back
  return 1;
}

/** The miss number at which the reveal ("the answer is X!") happens. */
export function revealAtDepth(depth: HintDepth): number {
  return depth === 0 ? 2 : depth === 2 ? 4 : 3;
}
export interface HintCtx {
  /** Coaching line (en). String, or a function for round-dependent text. */
  hint: string | (() => string);
  /** Coaching line (bn). */
  hintBn: string | (() => string);
  /** The correct answer for this round. */
  correct: () => unknown;
  /** All tap targets (buttons/cards/bubbles). Omitted → banner-only hints. */
  options?: () => Array<{ sprite: Phaser.GameObjects.Container; value: unknown }>;
  /**
   * SEQUENCING GAMES (Count & Pop): every option is a FUTURE correct answer, so
   * a wrong tap must NOT retire it — it shakes, recovers, and stays tappable
   * until its own turn. When true, wrong taps never dim/✕/disable the option,
   * and miss #2 never clears away choices.
   */
  keepOnWrong?: boolean;
}

/**
 * Per-scene miss log. Phaser KEEPS scene.data across `scene.start()` restarts,
 * so we store the whole log under one key and wipe it on scene shutdown —
 * a fresh scene (new session) always starts with a clean hint ladder.
 */
function missLog(scene: Phaser.Scene): Record<string, number> {
  let log = scene.data.get("hw") as Record<string, number> | undefined;
  if (!log) {
    log = {};
    scene.data.set("hw", log);
    scene.events.once("shutdown", () => {
      scene.data.remove("hw");
      scene.data.remove("hw:banner");
    });
  }
  return log;
}

export function hintWrong(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  ctx: HintCtx
) {
  // Every wrong tap is recorded into the kid's ledger — the App set the current
  // attempt context, so this lands under the right kid+skill. Feeds the
  // resolve-to-complete loop + the parent panel's "needs help" list. The tapped
  // value (vs the correct one) is passed along for Moni's error fingerprinting.
  const correct = ctx.correct();
  const tappedWrong = ctx.options?.()?.find((o) => o.sprite === container)?.value;
  wrongLedger.record(correct, tappedWrong);
  const bn = getAppLang() === "bn";
  const log = missLog(scene);
  const key = String(correct);
  const n = (log[key] ?? 0) + 1;
  log[key] = n;

  // Scale the ladder to this kid's Moni confidence: fragile kids get the reveal
  // sooner (before a miss snowballs), sharp kids get more room to figure it out.
  const kidId = wrongLedger.kidId();
  const conf = kidId ? useKidStore.getState().moni?.[kidId]?.confidence?.score : undefined;
  const depth = confidenceDepth(conf);
  const revealAt = revealAtDepth(depth);

  // ANY wrong attempt retires that button — a kid can't keep tapping the same
  // wrong answer. It dims, shrinks, gets an ✕, and becomes non-clickable.
  // (keepOnWrong → sequencing games: the option stays alive and recovers.)
  if (!ctx.keepOnWrong) {
    killOption(scene, container);
  } else {
    releaseOption(scene, container);
  }

  // miss #1: keep it warm and small
  if (n === 1) {
    wrongTap(scene, container);
    return;
  }

  const opts = ctx.options?.() ?? [];

  // Not yet at the reveal depth: coach loudly + clear away half the remaining
  // wrong choices. (`o.sprite.input` is null after disableInteractive → already
  // retired.) (keepOnWrong → nothing may be cleared; every option is a future
  // answer.)
  if (n < revealAt) {
    if (!ctx.keepOnWrong) {
      const wrong = opts.filter((o) => o.value !== correct && o.sprite.active && o.sprite.input);
      if (wrong.length > 0) {
        const kill = wrong.sort(() => Math.random() - 0.5).slice(0, Math.ceil(wrong.length / 2));
        for (const o of kill) killOption(scene, o.sprite);
      }
    }
    wrongTap(scene, container, { tip: false });
    bigBanner(scene, bn ? pick(ctx.hintBn) : pick(ctx.hint));
    // The hint is the TEACHING moment — calmest voice in the app, slower than
    // the question itself (0.9), so a stuck kid can actually absorb it.
    speak(bn ? pick(ctx.hintBn) : pick(ctx.hint), { rate: 0.86 });
    return;
  }

  // At the reveal depth: light up the right answer + tell them what it is.
  // The reveal always cancels whatever's still speaking (a stale hint from the
  // previous round) so the kid hears THIS answer, and speaks it as a WORD
  // ("two", not a bare "2") so no voice can mangle a digit.
  cancelSpeech();
  const good = opts.find((o) => o.value === correct && o.sprite.active);
  const label = String(correct);
  if (good) {
    glowCorrect(scene, good.sprite);
    bigBanner(scene, t("answerIs", { label }), 1.1);
  } else {
    // correct button already retired (rare) — still say the answer so the kid
    // isn't left guessing, but drop the misleading "tap it 👇".
    bigBanner(scene, t("answerIsOnly", { label }), 1.1);
  }
  speakAnswer(label);
}

/** Sequencing games: a wrong tap makes the bubble visibly "not it" for a beat
 *  (a quick pulse + shake via wrongTap) then it RECOVERS to normal — it's still
 *  a future correct answer and stays tappable. Never dims/✕/disables. */
function releaseOption(scene: Phaser.Scene, sprite: Phaser.GameObjects.Container) {
  if (!sprite || !sprite.active) return;
  scene.tweens.add({
    targets: sprite,
    scaleX: sprite.scaleX * 1.14,
    scaleY: sprite.scaleY * 1.14,
    duration: 90,
    yoyo: true,
    ease: "Quad.easeOut",
  });
}

/** Retire a wrong option: non-interactive, dimmed, shrunk, ✕-marked.
 *  The ✕ dies with its card when the scene destroys it next round. */
function killOption(scene: Phaser.Scene, sprite: Phaser.GameObjects.Container) {
  if (!sprite || !sprite.active) return;
  sprite.disableInteractive();
  scene.tweens.add({
    targets: sprite,
    alpha: 0.35,
    scaleX: 0.86,
    scaleY: 0.86,
    duration: 200,
    ease: "Back.easeIn",
  });
  const xMark = scene.add
    .text(sprite.x, sprite.y, "✕", {
      fontSize: "34px",
      color: "#ff6b6b",
      fontStyle: "bold",
      stroke: "#1d3557",
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(5900);
  // die with the button it marks — scenes destroy their options each round
  sprite.once("destroy", () => {
    if (xMark.active) xMark.destroy();
  });
}

function pick(v: string | (() => string)): string {
  return typeof v === "function" ? v() : v;
}

/** Big, kid-sized hint banner: rounded panel + bold white text, pops in, fades. */
function bigBanner(scene: Phaser.Scene, text: string, scale = 1) {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const y = Math.min(150 + SAT(), h * 0.26);
  const maxW = Math.min(380, w - 36);
  const pad = 34;

  const tx = scene.add
    .text(0, 0, text, {
      fontSize: "24px",
      color: "#ffffff",
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: maxW - pad },
      stroke: NV_NAVY,
      strokeThickness: 7,
      lineSpacing: 6,
    })
    .setOrigin(0.5);

  const boxH = Math.max(72, tx.height + pad);
  const panel = scene.add.graphics();
  panel.fillStyle(Phaser.Display.Color.HexStringToColor("#2ec4b6").color, 0.95);
  panel.fillRoundedRect(-maxW / 2, -boxH / 2, maxW, boxH, 26);
  panel.lineStyle(4, Phaser.Display.Color.HexStringToColor(NV_NAVY).color, 1);
  panel.strokeRoundedRect(-maxW / 2, -boxH / 2, maxW, boxH, 26);
  panel.lineStyle(3, Phaser.Display.Color.HexStringToColor(NV_GOLD).color, 1);
  panel.strokeRoundedRect(-maxW / 2 + 5, -boxH / 2 + 5, maxW - 10, boxH - 10, 21);

  const banner = scene.add.container(w / 2, y, [panel, tx]).setDepth(6000);
  banner.setScale(0.6);
  banner.setAlpha(0);

  // one banner at a time — a fresh miss replaces the old one
  const prev = scene.data.get("hw:banner") as Phaser.GameObjects.Container | undefined;
  if (prev && prev.active) {
    scene.tweens.killTweensOf(prev);
    prev.destroy();
  }
  scene.data.set("hw:banner", banner);

  scene.tweens.add({
    targets: banner,
    scale: scale,
    alpha: 1,
    duration: 280,
    ease: "Back.easeOut",
  });
  scene.tweens.add({
    targets: banner,
    alpha: 0,
    delay: 2900,
    duration: 420,
    ease: "Quad.easeIn",
    onComplete: () => {
      banner.destroy();
      if (scene.data.get("hw:banner") === banner) scene.data.remove("hw:banner");
    },
  });
}

/** Pulsing teal ring around the correct answer. */
function glowCorrect(scene: Phaser.Scene, sprite: Phaser.GameObjects.Container) {
  const r = Math.max(sprite.displayWidth, sprite.displayHeight) * 0.7;
  const ring = scene.add.graphics().setDepth(5900);
  ring.fillStyle(Phaser.Display.Color.HexStringToColor("#2ec4b6").color, 0.3);
  ring.fillCircle(sprite.x, sprite.y, r);
  ring.lineStyle(5, Phaser.Display.Color.HexStringToColor(NV_GOLD).color, 1);
  ring.strokeCircle(sprite.x, sprite.y, r);
  scene.tweens.add({
    targets: ring,
    alpha: 0,
    scale: 1.35,
    duration: 600,
    yoyo: true,
    repeat: 4,
    ease: "Sine.easeInOut",
    onComplete: () => ring.destroy(),
  });
}