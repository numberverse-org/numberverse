import Phaser from "phaser";
import { pop } from "./audio";
import { assetIcon } from "./svgAssets";
import { prefersReducedMotion, onReducedMotionChange } from "./reducedMotion";
import { matureRender } from "./renderBand"; // #1035 — band-aware question font
import { speak, isVoiceLoading, onVoiceLoadingChange, type SpeakOpts } from "./speech"; // #1580/#1581/#1585
import { bigTextFactor, onBigTextChange, NV_GOLD, NV_GREEN } from "./ui"; // #1582 + tokenized #591
import { t } from "./i18n";

/**
 * "Nova's question bubble" — the thing a kid MUST see before every round.
 *
 * A big comic speech bubble in warm gold with a navy outline + white ring,
 * a little tail, Nova 🦉 peeking from the side, and a POP animation every
 * time the question changes. Idle motion (breathing glow + gentle wobble +
 * bobbing Nova) keeps pulling peripheral attention, so the question can
 * never just sit there and be ignored.
 *
 * Two nested containers keep the tweens from fighting:
 *   outer (positioned by setPosition) → holds the idle sway
 *   inner (0,0)                       → holds the pop-in scale
 */

export interface QuestionPanelApi {
  /** Set a new question → re-sizes the bubble + POPs it in. */
  set(text: string): void;
  setPosition(x: number, y: number): void;
  setVisible(v: boolean): void;
}

/** Panel options. `tail` controls the little speech-bubble pointer:
 *  "down" (default, points toward the answer buttons) or "none" for scenes
 *  that anchor the question at the very bottom of the screen (letter games,
 *  Count & Pop) where a down-tail would poke off the edge. */
export interface QuestionPanelOpts {
  tail?: "down" | "none";
}

/* #1580 — the SHARED question-speak hook. Scenes route every "read the question
 * aloud" call through speakQuestion() so the question panel's replay button
 * (#1581) and the voice-loading hint (#1585) stay in sync. The last spoken line
 * is remembered so a tap on the panel's 🔊 re-hears the question. */
let lastSpokenQuestion: { text: string; opts: SpeakOpts } | null = null;

/** Speak a question line with the app's TTS. Prefer this over speak() for the
 *  "read the question" moments — it records the line for the replay button. */
export function speakQuestion(text: string, opts: SpeakOpts = {}) {
  lastSpokenQuestion = { text: String(text), opts };
  speak(text, opts);
}

/** Re-speak the last speakQuestion() line (the panel's replay button). */
export function speakLastQuestion(): void {
  if (lastSpokenQuestion) speak(lastSpokenQuestion.text, lastSpokenQuestion.opts);
}

const NAVY = 0x0b2545;
const GOLD_TOP = 0xffe066;
const GOLD_BOT = 0xffb703;
const TEXT_COLOR = "#1d3557";
const NOVA_SIZE = 46;
const GAP = 10;
const PAD_X = 28;
const PAD_Y = 18;
const MAX_TEXT_W = 300;

function fillBubble(g: Phaser.GameObjects.Graphics, w: number, h: number, tail: "down" | "none") {
  g.clear();
  const r = 22;
  g.lineStyle(6, NAVY, 1);
  g.fillStyle(GOLD_BOT, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  // gold top sheen
  g.fillStyle(GOLD_TOP, 1);
  g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, (h - 8) * 0.55, r - 4);
  // white inner ring
  g.lineStyle(3, 0xffffff, 0.9);
  g.strokeRoundedRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, r - 7);
  // little tail at the bottom-center (optional — off for bottom-anchored scenes)
  if (tail === "down") {
    const ty = h / 2 - 1;
    g.lineStyle(5, NAVY, 1);
    g.fillStyle(GOLD_BOT, 1);
    g.fillTriangle(-13, ty - 4, 13, ty - 4, 0, ty + 13);
    g.lineBetween(-13, ty - 4, 13, ty - 4);
    g.lineBetween(-13, ty - 4, 0, ty + 13);
    g.lineBetween(13, ty - 4, 0, ty + 13);
  }
}

/** Tiny sparkle stars that burst out when a new question pops in. */
function sparkles(scene: Phaser.Scene, x: number, y: number) {
  if (prefersReducedMotion()) return;
  // #784 — tokenize the NV_* star colors; the blue/pink extras stay raw.
  const COLORS = [
    Phaser.Display.Color.HexStringToColor(NV_GOLD).color,
    Phaser.Display.Color.HexStringToColor(NV_GREEN).color,
    0x60a5fa,
    0xf472b6,
  ];
  for (let i = 0; i < 5; i++) {
    const s = scene.add
      .text(
        x + Phaser.Math.Between(-50, 50),
        y + Phaser.Math.Between(-30, 30),
        "✦",
        {
          fontSize: `${Phaser.Math.Between(16, 26)}px`,
          color: "#ffffff",
          stroke: `#${COLORS[i % COLORS.length].toString(16).padStart(6, "0")}`,
          strokeThickness: 3,
        }
      )
      .setOrigin(0.5)
      .setDepth(5800);
    scene.tweens.add({
      targets: s,
      x: s.x + Phaser.Math.Between(-30, 30),
      y: s.y + Phaser.Math.Between(-40, 20),
      alpha: 0,
      scale: 1.6,
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: () => s.destroy(),
    });
  }
}

export function questionPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: QuestionPanelOpts = {}
): QuestionPanelApi {
  const outer = scene.add.container(x, y).setDepth(5000);
  const inner = scene.add.container(0, 0);
  outer.add(inner);
  let lastText = ""; // #1581 — the panel remembers its question for replay

  // soft glow behind the bubble (breathes so it can't be missed)
  const glow = scene.add.graphics();
  const baseFont = 32; // #1582 — Big Text scales this by bigTextFactor()
  const tx = scene.add
    .text(0, 0, "", {
      fontFamily: matureRender()
        ? "'Nunito', 'Noto Sans Bengali', system-ui, 'Segoe UI', sans-serif"
        : "'Baloo 2', 'Noto Sans Bengali', 'Nunito', system-ui, 'Segoe UI', sans-serif",
      fontSize: `${baseFont}px`,
      color: TEXT_COLOR,
      fontStyle: "800",
      align: "center",
      lineSpacing: 2,
      wordWrap: { width: MAX_TEXT_W, useAdvancedWrap: true },
    })
    .setOrigin(0.5);
  const nova = assetIcon(scene, "owl", NOVA_SIZE);
  const novaRing = scene.add.circle(0, 0, NOVA_SIZE * 0.72, 0xffffff, 0.95);
  novaRing.setStrokeStyle(4, 0xffffff, 1);

  // #1582 — re-style the question glyphs at the current Big Text scale. The
  // wrap shrinks in lockstep so the same line-count keeps the bubble shaped.
  const applyPanelTextScale = () => {
    const f = bigTextFactor();
    tx.setFontSize(`${Math.round(baseFont * f)}px`);
    tx.setWordWrapWidth(Math.round(MAX_TEXT_W / f), true);
  };

  // #1581 — a shared speaker/replay button: every scene with a question panel
  // gets "hear it again" for free (QuestionWordsScene used to be the only one).
  const replayBtn = scene.add.container(0, 0);
  replayBtn.add(scene.add.circle(0, 0, 16, 0xffffff, 0.95).setStrokeStyle(2, NAVY, 1));
  replayBtn.add(scene.add.text(0, 1, "🔊", { fontSize: "14px" }).setOrigin(0.5));
  replayBtn.setSize(34, 34);
  replayBtn.setInteractive(new Phaser.Geom.Circle(0, 0, 18), Phaser.Geom.Circle.Contains);
  replayBtn.on("pointerdown", () => {
    pop();
    if (lastSpokenQuestion) speakLastQuestion();
    else speakQuestion(lastText);
  });

  // #1585 — a small "voice loading…" hint appears while a Bangla line is held
  // for the on-device neural voice (this device has no bn Web-Speech voice yet).
  const loadingHint = scene.add
    .text(0, 0, t("voiceLoading"), {
      fontFamily: matureRender()
        ? "'Nunito', 'Noto Sans Bengali', system-ui, 'Segoe UI', sans-serif"
        : "'Baloo 2', 'Noto Sans Bengali', 'Nunito', system-ui, 'Segoe UI', sans-serif",
      fontSize: "13px",
      color: "#ffffff",
      fontStyle: "800",
      stroke: "#1d3557",
      strokeThickness: 3,
      align: "center",
    })
    .setOrigin(0.5)
    .setVisible(isVoiceLoading());

  inner.add([glow, novaRing, nova, tx, replayBtn, loadingHint]);

  const layout = () => {
    const textW = Math.min(tx.width, MAX_TEXT_W);
    const contentW = NOVA_SIZE + GAP + textW;
    const w = contentW + PAD_X * 2;
    const h = Math.max(74, tx.height + PAD_Y * 2);
    fillBubble(glow, w, h, opts.tail ?? "down");
    // soft glow blob behind the bubble
    glow.fillStyle(0xffd166, 0.28);
    glow.fillCircle(0, 0, w * 0.72);
    novaRing.setPosition(-contentW / 2 + NOVA_SIZE / 2, 0);
    nova.setPosition(-contentW / 2 + NOVA_SIZE / 2, 0);
    tx.setPosition(-contentW / 2 + NOVA_SIZE + GAP + textW / 2, 0);
    // #1581 — the speaker button tucks into the bubble's top-right corner.
    replayBtn.setPosition(w / 2 - 30, -h / 2 + 30);
    // #1585 — "voice loading…" sits just below the bubble tail.
    loadingHint.setPosition(0, h / 2 + 32);
  };

  const popIn = () => {
    pop();
    scene.tweens.killTweensOf(inner);
    inner.setScale(prefersReducedMotion() ? 1.0 : 0.5);
    if (prefersReducedMotion()) return;
    scene.tweens.add({
      targets: inner,
      scale: 1.0,
      duration: 260,
      ease: "Back.easeOut",
    });
    // golden ring flares out of the bubble
    const ring = scene.add
      .circle(outer.x, outer.y, 30, 0xffd166, 0)
      .setStrokeStyle(6, 0xffd166, 0.9)
      .setDepth(4900);
    scene.tweens.add({
      targets: ring,
      radius: 150,
      alpha: 0,
      scale: 1.6,
      duration: 420,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
    sparkles(scene, outer.x, outer.y);
  };

  // ── idle attention-motion (never killed — it lives on the OUTER) ──
  // Reduced motion skips it entirely, and a live toggle kills/restarts it
  // without waiting for the next round (#1440).
  const stopIdleMotion = () => {
    scene.tweens.killTweensOf([glow, nova, outer]);
  };
  const startIdleMotion = () => {
    stopIdleMotion();
    glow.setAlpha(0.28);
    if (prefersReducedMotion()) return;
    scene.tweens.add({ targets: glow, alpha: 0.5, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    scene.tweens.add({ targets: nova, y: -4, duration: 760, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    scene.tweens.add({ targets: outer, angle: 2, duration: 2600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  };
  startIdleMotion();
  const offReducedMotion = onReducedMotionChange((reduced) => {
    if (reduced) stopIdleMotion();
    else startIdleMotion();
  });
  // #1582 — live Big Text: the question glyphs re-scale the moment the toggle
  // flips (the wrap and bubble re-measure in layout()).
  const offBigText = onBigTextChange(() => {
    applyPanelTextScale();
    if (tx.text) layout();
  });
  // #1585 — live voice-loading hint: show while a Bangla line is held.
  const offVoiceLoading = onVoiceLoadingChange((loading) => {
    loadingHint.setVisible(loading && outer.visible);
  });
  // #1746 — the listener lives in a module-level Set, so it must be released
  // on BOTH SHUTDOWN and DESTROY (a game teardown destroys scenes without a
  // stop). `once` fires each event at most once; the tornDown guard makes a
  // double-fire (both events for one scene) a no-op, and off* are themselves
  // idempotent.
  let tornDown = false;
  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    offReducedMotion();
    offBigText();
    offVoiceLoading();
    stopIdleMotion();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
  scene.events.once(Phaser.Scenes.Events.DESTROY, teardown);

  applyPanelTextScale();
  layout();

  return {
    set(text: string) {
      tx.setText(text);
      lastText = text;
      layout();
      popIn();
    },
    setPosition(px: number, py: number) {
      outer.setPosition(px, py);
    },
    setVisible(v: boolean) {
      outer.setVisible(v);
    },
  };
}
