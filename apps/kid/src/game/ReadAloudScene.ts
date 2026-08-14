import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-readaloud")?.difficultyLevels ?? [3, 3, 3, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;

/** A picture-answer option. */
interface Pic {
  e: string;
  c: string;
}
/** One read-aloud comprehension item: sentence + question + 3 picture answers. */
interface ReadItem {
  s: string;
  q: string;
  a: Pic;
  d: [Pic, Pic, Pic];
}

/** 18 sentences (done-when ≥15): 5-7 words, spoken, picture-answer question. */
const ITEMS: ReadItem[] = [
  { s: "The cat is on the mat.", q: "Where is the cat?", a: { e: "🐱", c: "on the mat" }, d: [{ e: "🐱", c: "in the box" }, { e: "🐱", c: "on the chair" }, { e: "🐶", c: "dog on the mat" }] },
  { s: "The dog is under the table.", q: "Where is the dog?", a: { e: "🐶", c: "under the table" }, d: [{ e: "🐶", c: "on the table" }, { e: "🐶", c: "in the garden" }, { e: "🐱", c: "cat under the table" }] },
  { s: "The sun is hot and yellow.", q: "What is hot and yellow?", a: { e: "☀️", c: "the sun" }, d: [{ e: "🌙", c: "the moon" }, { e: "⭐", c: "the star" }, { e: "☁️", c: "the cloud" }] },
  { s: "The ball is big and blue.", q: "What color is the ball?", a: { e: "🔵", c: "blue" }, d: [{ e: "🔴", c: "red" }, { e: "🟢", c: "green" }, { e: "🟡", c: "yellow" }] },
  { s: "Mom reads a book at night.", q: "What does Mom read?", a: { e: "📖", c: "a book" }, d: [{ e: "📺", c: "the TV" }, { e: "🍎", c: "an apple" }, { e: "📱", c: "the phone" }] },
  { s: "The bird can fly up high.", q: "What can the bird do?", a: { e: "🕊️", c: "fly" }, d: [{ e: "🐟", c: "swim" }, { e: "🐢", c: "walk slow" }, { e: "🐇", c: "hop" }] },
  { s: "I eat a banana at noon.", q: "What do I eat?", a: { e: "🍌", c: "a banana" }, d: [{ e: "🍎", c: "an apple" }, { e: "🍞", c: "bread" }, { e: "🧀", c: "cheese" }] },
  { s: "The frog is green and small.", q: "What color is the frog?", a: { e: "🟩", c: "green" }, d: [{ e: "🟫", c: "brown" }, { e: "🟨", c: "yellow" }, { e: "🟥", c: "red" }] },
  { s: "The apple is red and sweet.", q: "What color is the apple?", a: { e: "🟥", c: "red" }, d: [{ e: "🟦", c: "blue" }, { e: "🟩", c: "green" }, { e: "🟨", c: "yellow" }] },
  { s: "She rides the bus to school.", q: "How does she go to school?", a: { e: "🚌", c: "by bus" }, d: [{ e: "🚲", c: "by bike" }, { e: "🚗", c: "by car" }, { e: "🚶", c: "on foot" }] },
  { s: "The baby is sleeping in the crib.", q: "Where is the baby sleeping?", a: { e: "👶", c: "in the crib" }, d: [{ e: "👶", c: "on a chair" }, { e: "👶", c: "in the bath" }, { e: "🧸", c: "teddy in the crib" }] },
  { s: "We make a snowman in winter.", q: "When do we make a snowman?", a: { e: "⛄", c: "in winter" }, d: [{ e: "🌞", c: "in summer" }, { e: "🍂", c: "in autumn" }, { e: "🌸", c: "in spring" }] },
  { s: "The teacher writes on the board.", q: "What does the teacher write on?", a: { e: "👩‍🏫", c: "the board" }, d: [{ e: "📄", c: "paper" }, { e: "🖥️", c: "a screen" }, { e: "📚", c: "a book" }] },
  { s: "The fish swims in the water.", q: "Where does the fish swim?", a: { e: "🐟", c: "in the water" }, d: [{ e: "🐟", c: "in a tree" }, { e: "🐟", c: "in a house" }, { e: "🦆", c: "duck in the water" }] },
  { s: "The elephant is big and gray.", q: "What color is the elephant?", a: { e: "🪨", c: "gray" }, d: [{ e: "🟩", c: "green" }, { e: "🟫", c: "brown" }, { e: "🟦", c: "blue" }] },
  { s: "The train goes fast on the tracks.", q: "Where does the train go?", a: { e: "🚆", c: "on the tracks" }, d: [{ e: "☁️", c: "in the sky" }, { e: "🌊", c: "in the sea" }, { e: "🛣️", c: "on the road" }] },
  { s: "The flower smells good in spring.", q: "When does the flower smell good?", a: { e: "🌸", c: "in spring" }, d: [{ e: "❄️", c: "in winter" }, { e: "🍁", c: "in autumn" }, { e: "🌞", c: "in summer" }] },
  { s: "The boy plays with a red ball.", q: "What does the boy play with?", a: { e: "⚽", c: "a ball" }, d: [{ e: "🧸", c: "a teddy" }, { e: "🚗", c: "a car" }, { e: "🪁", c: "a kite" }] },
];

// #761 — band-5 en-comprehension: SHORT paragraphs (2-3 sentences), same
// picture-answer question. #757/#760 — band-6 en-paragraph: LONGER paragraphs
// (4-5 sentences). Both share the ReadAloud scene; the skill id picks the pool.
const PARAGRAPHS_SHORT: ReadItem[] = [
  { s: "Sam has a small brown dog. The dog likes to play in the park.", q: "Where does the dog like to play?", a: { e: "🌳", c: "in the park" }, d: [{ e: "🏠", c: "in the house" }, { e: "🏫", c: "at school" }, { e: "🛒", c: "in the market" }] },
  { s: "It is raining today. Mina stays at home and reads a book.", q: "Why does Mina stay at home?", a: { e: "☔", c: "because it rains" }, d: [{ e: "☀️", c: "because it is hot" }, { e: "❄️", c: "because it snows" }, { e: "🌬️", c: "because of wind" }] },
  { s: "The children go to the zoo. They see a big elephant and a tall giraffe.", q: "Where do the children go?", a: { e: "🦒", c: "to the zoo" }, d: [{ e: "🏛️", c: "to the museum" }, { e: "📚", c: "to the library" }, { e: "🚜", c: "to the farm" }] },
  { s: "Rina likes fruits. She eats a red apple every day.", q: "What does Rina eat every day?", a: { e: "🍎", c: "an apple" }, d: [{ e: "🍌", c: "a banana" }, { e: "🍊", c: "an orange" }, { e: "🥭", c: "a mango" }] },
  { s: "The bus is full. Dad walks to the office instead.", q: "How does Dad go to the office?", a: { e: "🚶", c: "he walks" }, d: [{ e: "🚌", c: "by bus" }, { e: "🚗", c: "by car" }, { e: "🚲", c: "by bike" }] },
  { s: "The sky is dark. The stars come out at night.", q: "When do the stars come out?", a: { e: "🌙", c: "at night" }, d: [{ e: "🌅", c: "in the morning" }, { e: "☀️", c: "at noon" }, { e: "🌤️", c: "in the afternoon" }] },
  { s: "Mother cooks rice and fish for dinner.", q: "What does Mother cook?", a: { e: "🐟", c: "rice and fish" }, d: [{ e: "🥚", c: "eggs" }, { e: "🍞", c: "bread" }, { e: "🎂", c: "a cake" }] },
  { s: "The baby is happy. She claps her hands and laughs.", q: "How does the baby feel?", a: { e: "😊", c: "happy" }, d: [{ e: "😢", c: "sad" }, { e: "😠", c: "angry" }, { e: "😨", c: "scared" }] },
  { s: "The cat climbs the tall tree. It cannot come down.", q: "Where does the cat climb?", a: { e: "🌳", c: "up the tree" }, d: [{ e: "🧱", c: "on the wall" }, { e: "🏠", c: "on the roof" }, { e: "🪜", c: "up a ladder" }] },
  { s: "My brother is small. He cannot reach the top shelf.", q: "Why can't he reach the top shelf?", a: { e: "📏", c: "he is small" }, d: [{ e: "😴", c: "he is tired" }, { e: "🤒", c: "he is sick" }, { e: "😋", c: "he is hungry" }] },
];
const PARAGRAPHS_LONG: ReadItem[] = [
  { s: "Amin's family goes to the village in winter. They visit Grandmother. Grandmother makes pitha for them. Everyone is happy.", q: "Who makes pitha?", a: { e: "👵", c: "Grandmother" }, d: [{ e: "👩", c: "Mother" }, { e: "👦", c: "Amin" }, { e: "🧑‍🌾", c: "the farmer" }] },
  { s: "The sun rises in the east. The rooster crows and the day begins. Farmers go to the fields. Children walk to school.", q: "What rises in the east?", a: { e: "☀️", c: "the sun" }, d: [{ e: "🌙", c: "the moon" }, { e: "⭐", c: "the star" }, { e: "☁️", c: "the cloud" }] },
  { s: "Sara wants a pet. She asks for a kitten. Her mother says yes. Now Sara feeds the kitten every day.", q: "What does Sara feed every day?", a: { e: "🐱", c: "the kitten" }, d: [{ e: "🐶", c: "the dog" }, { e: "🐟", c: "the fish" }, { e: "🐦", c: "the bird" }] },
  { s: "The library is very quiet. Many books stand on the shelves. Nadia finds a book about dinosaurs. She sits and reads it.", q: "What does Nadia read about?", a: { e: "🦕", c: "dinosaurs" }, d: [{ e: "🚀", c: "space" }, { e: "🌊", c: "the sea" }, { e: "🌸", c: "flowers" }] },
  { s: "It is very hot outside. Rahim drinks cold water. He sits under the big tree. The shade feels cool.", q: "Where does Rahim sit?", a: { e: "🌳", c: "under the tree" }, d: [{ e: "🏠", c: "on the roof" }, { e: "🛣️", c: "by the road" }, { e: "☀️", c: "in the sun" }] },
  { s: "The bakery smells sweet. Mom buys a loaf of bread. She also buys a chocolate cake. It is for my birthday.", q: "What is the cake for?", a: { e: "🎂", c: "the birthday" }, d: [{ e: "🏫", c: "school" }, { e: "🍽️", c: "dinner" }, { e: "🧺", c: "a picnic" }] },
  { s: "The old man feeds the birds. They come every morning. They sit on his shoulder. He smiles and talks to them.", q: "When do the birds come?", a: { e: "🌅", c: "every morning" }, d: [{ e: "🌙", c: "at night" }, { e: "☀️", c: "at noon" }, { e: "🌇", c: "in the evening" }] },
  { s: "The pond is full of fish. A boy sits by the water. He waits with his fishing rod. Soon he catches a small fish.", q: "What does the boy catch?", a: { e: "🐟", c: "a fish" }, d: [{ e: "🐸", c: "a frog" }, { e: "🦆", c: "a duck" }, { e: "🦀", c: "a crab" }] },
];

/**
 * English read-aloud comprehension lvl 2 (#184).
 * Band 2 reading: a 5-7 word sentence is shown + spoken; a picture-answer
 * question follows (tap the picture that answers it). A 🔊/🔇 toggle turns the
 * read-aloud voice on/off. 18 sentences, 3-4 options (3 early, 4 later).
 */
export class ReadAloudScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private item!: ReadItem;
  private readAloud = true;
  private paragraphMode = false;
  private skillId = "";
  private tiles: { sprite: Phaser.GameObjects.Container; val: Pic }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private sentenceText!: Phaser.GameObjects.Text;
  private voiceBtn!: Phaser.GameObjects.Container;
  private levels: number[] = LEVELS;

  constructor() {
    super("ReadAloud");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; mode?: string; levels?: number[]; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.levels = data.levels ?? LEVELS;
    // #761/#757/#760 — paragraph mode (en-comprehension / en-paragraph): the
    // skill id picks the pool — short 2-3 sentence paragraphs (band 5) vs
    // longer 4-5 sentence ones (band 6, challenge).
    this.paragraphMode = data.mode === "paragraph";
    this.skillId = data.skill ?? "";
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t(this.paragraphMode ? "titleReadPara" : "titleRead2"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.sentenceText = this.add
      .text(0, 0, "", txt(this.paragraphMode ? 20 : 26, "#ffffff", { bold: true, wrap: 360 }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.voiceBtn = modernCardButton(this, 0, 0, 96, 60, "🔊", BTN_ORANGE, 30);
    this.voiceBtn.on("pointerdown", () => {
      this.readAloud = !this.readAloud;
      (this.voiceBtn.getData("nv-btn") as { setLabel: (l: string) => void }).setLabel(this.readAloud ? "🔊" : "🔇");
      if (this.readAloud) speak(this.item.s, { lang: "en" });
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.sentenceText.setPosition(width / 2, height * (this.paragraphMode ? 0.15 : 0.2));
    this.sentenceText.setWordWrapWidth(Math.max(160, width - 40));
    this.prompt.setPosition(width / 2, height * (this.paragraphMode ? 0.4 : 0.34));
    this.voiceBtn.setPosition(width - 64, 120);
  }

  private startRound() {
    this.clearTiles();
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);

    const pool = this.paragraphMode
      ? (this.skillId === "en-paragraph" ? PARAGRAPHS_LONG : PARAGRAPHS_SHORT)
      : ITEMS;
    let item = pool[Phaser.Math.Between(0, pool.length - 1)];
    if (item === this.item) item = pool[(pool.indexOf(item) + 1) % pool.length];
    this.item = item;
    this.sentenceText.setText(item.s);
    this.prompt.set(item.q);

    const n = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    const distract = item.d.slice(0, n - 1);
    const bank = shuffle([item.a, ...distract]);

    const gl = gridLayout(this, {
      cols: n,
      rows: 1,
      preferredW: 140,
      minW: 88,
      widthPad: 16,
      topPad: this.scale.height * (this.paragraphMode ? 0.55 : 0.5),
      bottomY: this.scale.height - 40 - SAB(),
      cardH: 96,
    });
    bank.forEach((val, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, 96, "", BTN_NEUTRAL, 0);
      const emoji = this.add.text(0, -14, val.e, txt(40, "#ffffff", { outline: true })).setOrigin(0.5);
      const cap = this.add.text(0, 30, val.c, txt(15, "#1e293b", { bold: true, shadow: false, wrap: gl.cardW - 10 })).setOrigin(0.5);
      tile.add([emoji, cap]);
      tile.on("pointerdown", () => this.tap(tile, val));
      this.tiles.push({ sprite: tile, val });
    });

    if (this.readAloud) this.time.delayedCall(350, () => speak(item.s, { lang: "en" }));
  }

  private tap(tile: Phaser.GameObjects.Container, val: Pic) {
    if (this.locked) return;
    if (val === this.item.a) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.tweens.add({ targets: tile, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.floatMsg(t("raGreat"));
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      this.onRoundDone?.(true, ms, this.levelIndex + 1);
      if (this.readAloud) this.time.delayedCall(400, () => speak(this.item.s, { lang: "en" }));
      this.time.delayedCall(1300, () => {
        if (this.roundsDone >= ROUNDS_TO_FINISH) this.floatMsg(t("raDone"));
        if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
        this.levelIndex++;
        this.startRound();
      });
      return;
    }
    hintWrong(this, tile, {
      hint: () => "Read the sentence again — which picture fits?",
      hintBn: () => "বাক্যটা আবার পড়ো — কোন ছবিটা মানাবে?",
      correct: () => this.item.a.c,
      options: () => this.tiles.filter((o) => o.sprite !== tile).map((o) => ({ sprite: o.sprite, value: o.val.c })),
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.6, text, txt(28, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
