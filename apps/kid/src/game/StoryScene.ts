import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-story")?.difficultyLevels ?? [3, 3, 4, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const CARD_H = 132;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** One picture card in a mini-story. */
interface Frame {
  e: string;
  c: string;
}
/** A mini-story: frames in the CORRECT order + a spoken retelling. */
interface Story {
  frames: Frame[];
  speak: string;
}

/** 16 mini-stories — 8 three-frame (early levels) + 8 four-frame (later). */
const STORIES: Story[] = [
  // three-frame
  { frames: [{ e: "🌱", c: "a seed" }, { e: "🌧️", c: "rain falls" }, { e: "🌻", c: "a flower grows" }],
    speak: "First a seed, then rain falls, and last a flower grows." },
  { frames: [{ e: "🥚", c: "an egg" }, { e: "🐣", c: "it cracks" }, { e: "🐥", c: "a chick hatches" }],
    speak: "First an egg, then it cracks, and last a chick hatches." },
  { frames: [{ e: "☁️", c: "clouds gather" }, { e: "⚡", c: "lightning flashes" }, { e: "🌈", c: "a rainbow appears" }],
    speak: "First clouds gather, then lightning flashes, and last a rainbow appears." },
  { frames: [{ e: "🍞", c: "take bread" }, { e: "🧀", c: "add cheese" }, { e: "🥪", c: "make a sandwich" }],
    speak: "First take bread, then add cheese, and last make a sandwich." },
  { frames: [{ e: "🏃", c: "warm up" }, { e: "🦘", c: "hop around" }, { e: "🏁", c: "cross the finish" }],
    speak: "First warm up, then hop around, and last cross the finish line." },
  { frames: [{ e: "🪥", c: "brush teeth" }, { e: "🚿", c: "wash up" }, { e: "🛏️", c: "jump in bed" }],
    speak: "First brush your teeth, then wash up, and last jump in bed." },
  { frames: [{ e: "🌅", c: "the sun rises" }, { e: "🏖️", c: "play at the beach" }, { e: "🌇", c: "watch the sunset" }],
    speak: "First the sun rises, then play at the beach, and last watch the sunset." },
  { frames: [{ e: "🍚", c: "rice in the pot" }, { e: "💨", c: "steam rises" }, { e: "🍽️", c: "ready to eat" }],
    speak: "First rice in the pot, then steam rises, and last ready to eat." },
  // four-frame
  { frames: [{ e: "🐛", c: "a caterpillar" }, { e: "🍃", c: "eats leaves" }, { e: "🧶", c: "wraps a cocoon" }, { e: "🦋", c: "a butterfly flies" }],
    speak: "First a caterpillar, then it eats leaves, then it wraps a cocoon, and last a butterfly flies." },
  { frames: [{ e: "🌾", c: "plant rice" }, { e: "💧", c: "water the field" }, { e: "☀️", c: "the sun helps" }, { e: "🍚", c: "cook the rice" }],
    speak: "First plant rice, then water the field, then the sun helps, and last cook the rice." },
  { frames: [{ e: "🧁", c: "mix the batter" }, { e: "🥚", c: "add an egg" }, { e: "🍞", c: "bake it" }, { e: "🎂", c: "decorate the cake" }],
    speak: "First mix the batter, then add an egg, then bake it, and last decorate the cake." },
  { frames: [{ e: "🏠", c: "leave home" }, { e: "🚶", c: "walk to the stop" }, { e: "🚌", c: "ride the bus" }, { e: "🏫", c: "reach school" }],
    speak: "First leave home, then walk to the stop, then ride the bus, and last reach school." },
  { frames: [{ e: "🧼", c: "soap on hands" }, { e: "💦", c: "rinse" }, { e: "🧻", c: "dry" }, { e: "✨", c: "clean hands" }],
    speak: "First soap on hands, then rinse, then dry, and last clean hands." },
  { frames: [{ e: "🌞", c: "the sun shines" }, { e: "🌧️", c: "rain begins" }, { e: "☔", c: "open an umbrella" }, { e: "🌈", c: "rainbow in the sky" }],
    speak: "First the sun shines, then rain begins, then open an umbrella, and last a rainbow in the sky." },
  { frames: [{ e: "📝", c: "write a letter" }, { e: "✉️", c: "fold it" }, { e: "📮", c: "mail it" }, { e: "💌", c: "a friend reads it" }],
    speak: "First write a letter, then fold it, then mail it, and last a friend reads it." },
  { frames: [{ e: "🌒", c: "moon appears" }, { e: "🌃", c: "night falls" }, { e: "😴", c: "everyone sleeps" }, { e: "☀️", c: "morning comes" }],
    speak: "First the moon appears, then night falls, then everyone sleeps, and last morning comes." },
];

// #757/#760 — band-7 en-sentence-order: drag whole SENTENCES into paragraph
// order (topic → detail → end). Same drag mechanic as the picture stories —
// the "frame" caption IS the sentence (no emoji). 8 four-sentence paragraphs.
const SENTENCES: Story[] = [
  { frames: [
    { e: "", c: "Rina wakes up early in the morning." },
    { e: "", c: "She brushes her teeth and washes her face." },
    { e: "", c: "She eats a healthy breakfast." },
    { e: "", c: "Then she walks to school with her friends." },
  ], speak: "Rina wakes up early in the morning. She brushes her teeth and washes her face. She eats a healthy breakfast. Then she walks to school with her friends." },
  { frames: [
    { e: "", c: "The sun rises in the east." },
    { e: "", c: "Birds start to sing in the trees." },
    { e: "", c: "People go to their work." },
    { e: "", c: "The city slowly wakes up." },
  ], speak: "The sun rises in the east. Birds start to sing in the trees. People go to their work. The city slowly wakes up." },
  { frames: [
    { e: "", c: "Amin loves to play cricket." },
    { e: "", c: "He goes to the field after school." },
    { e: "", c: "His friends are already there." },
    { e: "", c: "They play until the evening." },
  ], speak: "Amin loves to play cricket. He goes to the field after school. His friends are already there. They play until the evening." },
  { frames: [
    { e: "", c: "Mother went to the market." },
    { e: "", c: "She bought fresh vegetables." },
    { e: "", c: "She also bought some fish." },
    { e: "", c: "Then she cooked a tasty dinner." },
  ], speak: "Mother went to the market. She bought fresh vegetables. She also bought some fish. Then she cooked a tasty dinner." },
  { frames: [
    { e: "", c: "My pet cat is very naughty." },
    { e: "", c: "She hides under the bed." },
    { e: "", c: "She jumps on the table." },
    { e: "", c: "But she always sleeps on my lap." },
  ], speak: "My pet cat is very naughty. She hides under the bed. She jumps on the table. But she always sleeps on my lap." },
  { frames: [
    { e: "", c: "It was a rainy day." },
    { e: "", c: "The children stayed at home." },
    { e: "", c: "They drew pictures and played games." },
    { e: "", c: "They were happy together." },
  ], speak: "It was a rainy day. The children stayed at home. They drew pictures and played games. They were happy together." },
  { frames: [
    { e: "", c: "The farmer plants rice in the field." },
    { e: "", c: "He waters the young plants." },
    { e: "", c: "The sun and rain help them grow." },
    { e: "", c: "In winter, he harvests the rice." },
  ], speak: "The farmer plants rice in the field. He waters the young plants. The sun and rain help them grow. In winter, he harvests the rice." },
  { frames: [
    { e: "", c: "Tom wants to build a kite." },
    { e: "", c: "He collects paper and sticks." },
    { e: "", c: "He ties them together with string." },
    { e: "", c: "The kite flies high in the sky." },
  ], speak: "Tom wants to build a kite. He collects paper and sticks. He ties them together with string. The kite flies high in the sky." },
];

// #1161 — band 6 paragraph ordering: three-sentence paragraphs (one rung
// below the band-7 four-sentence paragraphs above).
const SENTENCES3: Story[] = [
  { frames: [
    { e: "", c: "Sara wakes up early." },
    { e: "", c: "She eats breakfast." },
    { e: "", c: "She walks to school." },
  ], speak: "Sara wakes up early. She eats breakfast. She walks to school." },
  { frames: [
    { e: "", c: "The sky turns dark." },
    { e: "", c: "Lightning flashes." },
    { e: "", c: "Rain starts to fall." },
  ], speak: "The sky turns dark. Lightning flashes. Rain starts to fall." },
  { frames: [
    { e: "", c: "Mother washes the rice." },
    { e: "", c: "She puts it in the pot." },
    { e: "", c: "She cooks it on the stove." },
  ], speak: "Mother washes the rice. She puts it in the pot. She cooks it on the stove." },
  { frames: [
    { e: "", c: "The bird finds a twig." },
    { e: "", c: "It carries it to the tree." },
    { e: "", c: "It builds a nest." },
  ], speak: "The bird finds a twig. It carries it to the tree. It builds a nest." },
  { frames: [
    { e: "", c: "Amin puts on his shoes." },
    { e: "", c: "He picks up his ball." },
    { e: "", c: "He runs to the field." },
  ], speak: "Amin puts on his shoes. He picks up his ball. He runs to the field." },
  { frames: [
    { e: "", c: "The milk is in the fridge." },
    { e: "", c: "Rina pours it into a glass." },
    { e: "", c: "She drinks it happily." },
  ], speak: "The milk is in the fridge. Rina pours it into a glass. She drinks it happily." },
  { frames: [
    { e: "", c: "The sun sets in the west." },
    { e: "", c: "The stars come out." },
    { e: "", c: "The children go to bed." },
  ], speak: "The sun sets in the west. The stars come out. The children go to bed." },
  { frames: [
    { e: "", c: "Tom opens his book." },
    { e: "", c: "He reads the first page." },
    { e: "", c: "He learns something new." },
  ], speak: "Tom opens his book. He reads the first page. He learns something new." },
];

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/**
 * Story sequencing (first → then → last) (#182).
 * Band 2 reading: a scrambled row of 3-4 picture cards; the kid DRAGS them into
 * story order. A correct order re-reads the story aloud. 16 mini-stories.
 */
export class StoryScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private sentencesMode = false;
  private skillId = "";
  private story!: Story;
  private order: number[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private slotX: number[] = [];
  private slotCy = 0;
  private fromSlot = -1;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private stepLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("Story");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; mode?: string; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #757/#760 — band-7 en-sentence-order: drag whole SENTENCES into a
    // paragraph (same drag mechanic, text-only cards).
    this.sentencesMode = data.mode === "sentences";
    // #1161 — band-6 en-paragraph-order uses the 3-sentence pool (one rung
    // below the band-7 4-sentence paragraphs).
    this.skillId = data.skill ?? "";
    gameBackground(this, this.sentencesMode ? "magic" : "night");
    this.titleText = this.add
      .text(0, 0, t(this.sentencesMode ? "titleSentences" : "titleStory"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t(this.sentencesMode ? "stPromptSentences" : "stPrompt"));
    onSceneResize(this, () => this.layout());
    this.input.on("dragstart", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDragStart(p, obj));
    this.input.on("drag", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDrag(p, obj));
    this.input.on("dragend", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDragEnd(p, obj));
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.22);
  }

  private startRound() {
    this.clearRound();
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);

    // Sentences mode: paragraphs are 4 sentences (3 for the band-6 rung).
    const three = this.sentencesMode && this.skillId === "en-paragraph-order";
    const n = this.sentencesMode ? (three ? 3 : 4) : LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const pool = this.sentencesMode ? (three ? SENTENCES3 : SENTENCES) : STORIES.filter((s) => s.frames.length === n);
    let story = pool[Phaser.Math.Between(0, pool.length - 1)];
    if (story === this.story) story = pool[(pool.indexOf(story) + 1) % pool.length];
    this.story = story;

    this.order = Array.from({ length: n }, (_, i) => i);
    // shuffle until the row is NOT already correct — every round needs a real move
    const correct = this.order.join(",");
    while (this.order.join(",") === correct) {
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Phaser.Math.Between(0, i);
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    }

    const gl = gridLayout(this, {
      cols: n,
      rows: 1,
      preferredW: n === 3 ? 190 : 150,
      minW: 92,
      widthPad: 20,
      gapX: this.sentencesMode ? 10 : 14,
      topPad: this.scale.height * (this.sentencesMode ? 0.48 : 0.42),
      bottomY: this.scale.height - 60 - SAB(),
      cardH: CARD_H,
    });
    this.slotCy = gl.cy;
    this.slotX = Array.from({ length: n }, (_, i) => gl.startX + i * gl.spacingX);

    // step badges above each slot — 1st, 2nd, 3rd … in local digits
    for (let i = 0; i < n; i++) {
      const lbl = this.add
        .text(this.slotX[i], gl.cy - CARD_H / 2 - 22, digit(i + 1), txt(20, "#c4b5fd", { bold: true, outline: true }))
        .setOrigin(0.5);
      this.stepLabels.push(lbl);
    }

    this.cards = this.order.map((storyIdx, slot) => {
      const fr = story.frames[storyIdx];
      const card = modernCardButton(this, this.slotX[slot], gl.cy, gl.cardW, CARD_H, "", BTN_NEUTRAL, 0);
      if (this.sentencesMode) {
        // Text-only sentence card — the whole card is the sentence.
        const cap = this.add
          .text(0, 0, fr.c, txt(14, "#1e293b", { bold: true, shadow: false, wrap: gl.cardW - 18, align: "center" }))
          .setOrigin(0.5);
        card.add([cap]);
      } else {
        const emoji = this.add
          .text(0, -CARD_H * 0.2, fr.e, txt(44, "#ffffff", { outline: true }))
          .setOrigin(0.5);
        const cap = this.add
          .text(0, CARD_H * 0.26, fr.c, txt(15, "#1e293b", { bold: true, shadow: false, wrap: gl.cardW - 14 }))
          .setOrigin(0.5);
        card.add([emoji, cap]);
      }
      this.input.setDraggable(card);
      return card;
    });
  }

  private onDragStart(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    this.fromSlot = this.cards.indexOf(obj);
    if (this.fromSlot < 0) return;
    obj.setDepth(30);
    this.tweens.add({ targets: obj, scale: 1.1, duration: 90, ease: "Sine.easeOut" });
  }

  private onDrag(p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked || this.fromSlot < 0) return;
    obj.x = Phaser.Math.Clamp(p.x, this.slotX[0] - 40, this.slotX[this.slotX.length - 1] + 40);
    obj.y = this.slotCy;
  }

  private onDragEnd(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked || this.fromSlot < 0) return;
    const from = this.fromSlot;
    this.fromSlot = -1;
    obj.setDepth(10);
    this.tweens.add({ targets: obj, scale: 1, duration: 90, ease: "Sine.easeInOut" });

    // nearest slot by x-distance
    let to = 0;
    let best = Infinity;
    this.slotX.forEach((sx, i) => {
      const d = Math.abs((obj.x ?? sx) - sx);
      if (d < best) { best = d; to = i; }
    });

    if (to === from) {
      this.tweens.add({ targets: obj, x: this.slotX[from], duration: 120, ease: "Sine.easeInOut" });
      return;
    }

    // swap the two cards' logical positions + move both cards
    [this.order[from], this.order[to]] = [this.order[to], this.order[from]];
    [this.cards[from], this.cards[to]] = [this.cards[to], this.cards[from]];
    this.tweens.add({ targets: obj, x: this.slotX[to], duration: 130, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.cards[from], x: this.slotX[from], duration: 130, ease: "Back.easeOut" });

    if (this.order.every((v, i) => v === i)) this.solve();
  }

  private solve() {
    this.locked = true;
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.prompt.set(t("stGreat"));
    this.time.delayedCall(300, () => speak(this.story.speak, { lang: "en" }));
    this.floatMsg(this.roundsDone + 1 >= ROUNDS_TO_FINISH ? t("stDone") : t("stGreat"));
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(1400, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.42, text, txt(26, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 26, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    this.stepLabels.forEach((l) => l.destroy());
    this.stepLabels = [];
    this.slotX = [];
  }
}
