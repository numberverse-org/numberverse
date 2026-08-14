import Phaser from "phaser";
import { DragReorderScene, type DragReorderConfig, type DragReorderData, type DragReorderItem } from "./reorder";
import { t } from "./i18n";
import { txt, modernCardButton, BTN_NEUTRAL, NV_GOLD } from "./ui";

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

/**
 * Story sequencing (first → then → last) (#182).
 * Band 2 reading: a scrambled row of 3-4 picture cards; the kid DRAGS them into
 * story order. A correct order re-reads the story aloud. 16 mini-stories. The
 * same scene also powers band 6-7 sentence/paragraph ordering (text-only cards).
 */
export class StoryScene extends DragReorderScene {
  private sentencesMode = false;
  private skillId = "";
  private story!: Story;
  private lastStory: Story | null = null;

  constructor() {
    super("Story");
  }

  protected prepare(data: DragReorderData) {
    // #757/#760 — band-7 en-sentence-order: drag whole SENTENCES into a
    // paragraph (same drag mechanic, text-only cards).
    this.sentencesMode = data.mode === "sentences";
    // #1161 — band-6 en-paragraph-order uses the 3-sentence pool (one rung
    // below the band-7 4-sentence paragraphs).
    this.skillId = data.skill ?? "";
  }

  protected cfg(): DragReorderConfig {
    return {
      gameId: "game-story",
      titleKey: "titleStory",
      promptKey: "stPrompt",
      greatKey: "stGreat",
      doneKey: "stDone",
      background: this.sentencesMode ? "magic" : "night",
      rounds: 3,
      cardH: 132,
      speakLang: "en",
      announceDone: false,
      dragScale: 1.1,
      stepColor: "#c4b5fd",
      stepSize: 20,
      stepOffset: 22,
      slotPreferredW: (n) => (n === 3 ? 190 : 150),
      slotMinW: 92,
      slotWidthPad: 20,
      slotGapX: this.sentencesMode ? 10 : 14,
      slotTopPadRatio: this.sentencesMode ? 0.48 : 0.42,
      slotBottomPad: 60,
    };
  }

  protected titleString(): string {
    return t(this.sentencesMode ? "titleSentences" : "titleStory");
  }

  protected promptString(): string {
    return t(this.sentencesMode ? "stPromptSentences" : "stPrompt");
  }

  protected promptGreat(): string {
    return t("stGreat");
  }

  protected greatMessage(): string {
    return this.roundsDone + 1 >= this.cfg().rounds ? t("stDone") : t("stGreat");
  }

  protected speakLine(): string {
    return this.story.speak;
  }

  protected roundItems(): DragReorderItem[] {
    // Sentences mode: paragraphs are 4 sentences (3 for the band-6 rung).
    const three = this.sentencesMode && this.skillId === "en-paragraph-order";
    const ladder = this.ladder();
    const n = this.sentencesMode
      ? three ? 3 : 4
      : ladder[Math.min(this.levelIndex, ladder.length - 1)];
    const pool = this.sentencesMode
      ? three ? SENTENCES3 : SENTENCES
      : STORIES.filter((s) => s.frames.length === n);
    let story = pool[Phaser.Math.Between(0, pool.length - 1)];
    if (story === this.lastStory) story = pool[(pool.indexOf(story) + 1) % pool.length];
    this.lastStory = story;
    this.story = story;
    return story.frames.map((fr) => ({ value: fr.c, label: fr.c, emoji: fr.e }));
  }

  protected floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.42, text, txt(26, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 26, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  protected makeCard(item: DragReorderItem, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const card = modernCardButton(this, x, y, w, h, "", BTN_NEUTRAL, 0);
    if (this.sentencesMode) {
      // Text-only sentence card — the whole card is the sentence.
      const cap = this.add
        .text(0, 0, item.label, txt(14, "#1e293b", { bold: true, shadow: false, wrap: w - 18, align: "center" }))
        .setOrigin(0.5);
      card.add([cap]);
    } else {
      const emoji = this.add
        .text(0, -h * 0.2, item.emoji ?? "", txt(44, "#ffffff", { outline: true }))
        .setOrigin(0.5);
      const cap = this.add
        .text(0, h * 0.26, item.label, txt(15, "#1e293b", { bold: true, shadow: false, wrap: w - 14 }))
        .setOrigin(0.5);
      card.add([emoji, cap]);
    }
    return card;
  }
}
