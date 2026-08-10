/**
 * Central EN/BN translation table for the whole game.
 *
 * Every visible/spoken string lives HERE once, with both languages — no more
 * inline `getAppLang() === "bn" ? "..." : "..."` scattered across scenes.
 *
 * Keys are dot-free lowercase-words. `{name}` placeholders are interpolated by
 * t() from the vars you pass. Missing keys fall back to EN, then to the key.
 */

import { getAppLang } from "./locale";

export type TVars = Record<string, string | number>;
type Entry = string | ((vars?: TVars) => string);

const EN: Record<string, Entry> = {
  /* ── round / shared ── */
  round: "Round {n}",
  letsLearn: "Let's learn!",
  total: "total {n}",
  roundTap: "Round {n} · tap {count} numbers",
  seedCount: "🌱 {planted}/{target} seeds",
  swipeRooms: "swipe to explore",
  roomFlipped: () =>
    ["Ooh, a new room! 🎉", "Whoa, cool room! ✨", "Swipe again! 😄"][
      Math.floor(Math.random() * 3)
    ],

  /* ── the QUESTION lines (the big bubble) ── */
  solveIt: "Solve it!",
  whereLives: "Where does it live?",
  whereLivesN: "Where does this live? ({n}/{total})",
  whatArea: "What is the area?",
  tapAnswer: "Tap the answer!",
  tapColor: "Tap the color!",
  findLetter: "Find  {ch}  ({hint})",
  listenNumber: "Listen — which number?",
  tapMatra: "Tap the letter with the matra!",
  tapWordsOrder: "Tap the words in order!",
  readWordTapPic: "Read the word, tap the picture!",
  tapNumbersOrder: "Tap the numbers in order 1, 2, 3…",
  tapBiggerDecimal: "Tap the BIGGER decimal!",
  divideBridge: "Divide to lower the drawbridge!",
  startLetter: "What letter does it start with?",
  tapSimplestFrac: "Tap the simplest fraction!",
  howManyFruit: "How many fruit in all?",
  watchGoIn: "Watch the apples go in!",
  watchGoAway: "Watch the apples go away!",
  howManyInAll: "How many in all?",
  howManyApples: "How many apples in all?",
  nounOrVerb: "Is it a noun or a verb?",
  howManyMore: "How many more make 10?",
  findPercent: "Find the percent!",
  pizzaShaded: "How much pizza is shaded?",
  tapDigitPlace: "Tap the digit in that place!",
  fuelRocket: "Fuel the rocket!",
  tapThe: "Tap the {target}!",
  findWord: "Find the word!",

  /* ── spoken math questions ── */
  qAdd: "What is {a} plus {b}?",
  qSub: "What is {a} minus {b}?",
  qMul: "What is {a} times {b}?",
  qDiv: "What is {a} divided by {b}?",
  qPct: "What is {a} percent of {b}?",
  qBonds: "What plus {a} makes {b}?",
  qConcreteAdd: "Here are {a} apples, and {b} more come. How many in all?",
  qConcreteSub: "There are {a} apples. Take {b} away. How many are left?",

  /* ── hint / feedback ── */
  almost: (vars) => (vars?.name ? `Almost, ${vars.name}! Try again` : "Almost, try again"),
  almostBubble: (vars) => (vars?.name ? `Almost, ${vars.name}! Try again 💪` : "Almost! Try again 💪"),
  answerIs: "The answer is — {label}!\nTap it 👇",
  answerIsOnly: "The answer is — {label}!",
  answerIsWord: "The answer is {label}",

  /* ── Fruit basket teach narration ── */
  putInBasket: "Let's put apples in the basket, watch!",
  thereAreWatch: "There are {n} apples in the basket, watch!",
  takeAway: "Take {n} away!",
  plusMore: "Plus {n} more!",
  plusEquals: "{x} plus {y} equals {z}",
  minusEquals: "{x} minus {y} equals {z}",
  countLeft: "Count what's left after taking {n} away",
  countAll: "Count ALL the fruit in the basket",

  /* ── 5 new games: Frog Hop / Memory Pairs / Balloon Pop / Clock / Balance ── */
  hopTo: "Hop to {n}!",
  hopToSpeak: "Hop to {word}!",
  memoryIntro: "Find the matching pairs!",
  pairMatched: "It's a match — {word}!",
  balloonAsk: (vars) => `Add ${vars?.a ?? "?"} plus ${vars?.b ?? "?"} — pop the balloon that equals the sum!`,
  clockAsk: "What time is it?",
  timeOClock: "{h} o'clock",
  timeHalfPast: "half past {h}",
  timeQuarterPast: "quarter past {h}",
  timeQuarterTo: "quarter to {h}",
  timeExact: "{h} {m}",
  balanceAsk: "Which side is heavier?",
  balanceHeavier: "{x} is heavier than {y}!",
  balanceCountHint: "Count the apples on each side — which side has more?",

  /* ── Nova's Counting Song ── */
  songTitle: "Number Song",
  songListen: "Nova sings it — listen & watch!",
  songNowYou: "Now YOU sing it! Tap 1, 2, 3…",
  greatSinging: "Great singing, {name}! 🎵",

  /* ── scene header titles (every game header switches language) ── */
  titleCountPop: "Count & Pop",
  titleGrowCount: "Plant & Count",
  titleFruitAdd: "Fruit Basket",
  titleFruitTree: "Fruit Tree",
  titleShapeCatcher: "Shape Catcher",
  titleEnLetters: "English ABC",
  titleNumberBonds: "Make 10!",
  titleBnColors: "রঙ চিনি",
  titleBnNumbers: "Bangla Numbers",
  titleEnPhonics: "Letter Sounds",
  titleBalloon: "🎈 Balloon Pop",
  titleBalance: "⚖️ Heavy or Light",
  titleAddSub100: "Add & Subtract",
  titleClock: "🕒 Clock Time",
  titleRocket: "Rocket Builder",
  titlePizza: "Pizza Fractions",
  titleBnWords: "Bangla Words",
  titleBnFamilyWords: "Family Words",
  titleCvc: "Word Pictures",
  titleDivision: "Castle Division",
  titleFraction: "Fraction Match",
  titlePlaceValue: "Place Value Tower",
  titleBnMatras: "Bangla Matras",
  titleSightWords: "Sight Words",
  titleAnimalHome: "Animal Homes",
  titleDecimals: "Decimal Duel",
  titlePercent: "Percent Quest",
  titleArea: "Area Lab",
  titleBnSentence: "Sentence Builder",
  titleGrammar: "Noun or Verb?",
  titleBgs: "Bangladesh Facts",
  titleFrogHop: "🐸 Frog Hop",
  titleMemory: "🃏 Memory Pairs",
  titleBdMoney: "Taka Tap",
  tapMoney: "Tap the right money!",
  moneyMake: "Which makes this much?",
};

const BN: Record<string, Entry> = {
  /* ── round / shared ── */
  round: "রাউন্ড {n}",
  letsLearn: "চলো শিখি!",
  total: "মোট {n}",
  roundTap: "রাউন্ড {n} · {count}টা সংখ্যা ট্যাপ করো",
  seedCount: "🌱 {planted}/{target} বীজ",
  swipeRooms: "সোয়াইপ করে ঘুরে দেখো",
  roomFlipped: () =>
    ["ওহ্, নতুন ঘর! 🎉", "বাহ্, চমৎকার ঘর! ✨", "আবার সোয়াইপ করো! 😄"][
      Math.floor(Math.random() * 3)
    ],

  /* ── the QUESTION lines ── */
  solveIt: "সমাধান করো!",
  whereLives: "এটা কোথায় থাকে?",
  whereLivesN: "এটা কোথায় থাকে? ({n}/{total})",
  whatArea: "ক্ষেত্রফল কত?",
  tapAnswer: "সঠিক উত্তর ট্যাপ করো!",
  tapColor: "সঠিক রং ট্যাপ করো!",
  findLetter: "খুঁজে বের করো  {ch}  ({hint})",
  listenNumber: "শোনো — কোন সংখ্যাটা?",
  tapMatra: "মাত্রা দেওয়া অক্ষর ট্যাপ করো!",
  tapWordsOrder: "শব্দগুলো ক্রমানুসারে ট্যাপ করো!",
  readWordTapPic: "শব্দ পড়ো, ছবি ট্যাপ করো!",
  tapNumbersOrder: "১, ২, ৩… ক্রমানুসারে সংখ্যা ট্যাপ করো!",
  tapBiggerDecimal: "বড় দশমিক সংখ্যাটা ট্যাপ করো!",
  divideBridge: "ভাগ করে সেতু নামাও!",
  startLetter: "কোন অক্ষর দিয়ে শুরু?",
  tapSimplestFrac: "সবচেয়ে ছোট ভগ্নাংশটা ট্যাপ করো!",
  howManyFruit: "মোট কতগুলো ফল?",
  watchGoIn: "দেখো আপেল ঢুকছে!",
  watchGoAway: "দেখো আপেল চলে যাচ্ছে!",
  howManyInAll: "মোট কত?",
  howManyApples: "মোট কতগুলো আপেল?",
  nounOrVerb: "এটা বিশেষ্য নাকি ক্রিয়া?",
  howManyMore: "কত যোগ করলে ১০ হয়?",
  findPercent: "শতাংশ বের করো!",
  pizzaShaded: "পিৎজার কত অংশ রঙিন?",
  tapDigitPlace: "সেই ঘরের অঙ্কটা ট্যাপ করো!",
  fuelRocket: "রকেটে জ্বালানি দাও!",
  tapThe: "ট্যাপ করো {target}!",
  findWord: "শব্দটা খুঁজে বের করো!",

  /* ── spoken math questions ── */
  qAdd: "{x} যোগ {y} কত?",
  qSub: "{x} বিয়োগ {y} কত?",
  qMul: "{x} গুণ {y} কত?",
  qDiv: "{x} ভাগ {y} কত?",
  qPct: "{y}-এর {x} শতাংশ কত?",
  qBonds: "{x}-এর সাথে কত যোগ করলে {y} হয়?",
  qConcreteAdd: "এখানে {x}টা আপেল আছে, আর {y}টা যোগ হলো — মোট কতটা?",
  qConcreteSub: "{x}টা আপেল আছে। {y}টা নিয়ে নাও — বাস্কেটে কতটা বাকি?",

  /* ── hint / feedback ── */
  almost: (vars) => (vars?.name ? `প্রায়, ${vars.name}! আবার চেষ্টা করো` : "প্রায়! আবার চেষ্টা করো"),
  almostBubble: (vars) => (vars?.name ? `প্রায়, ${vars.name}! আবার চেষ্টা করো 💪` : "প্রায়! আবার চেষ্টা করো 💪"),
  answerIs: "উত্তর হলো — {label}!\nএটিতে ট্যাপ করো 👇",
  answerIsOnly: "উত্তর হলো — {label}!",
  answerIsWord: "উত্তর হলো {label}",

  /* ── Fruit basket teach narration ── */
  putInBasket: "বাস্কেটে আপেল রাখি, দেখো!",
  thereAreWatch: "বাস্কেটে {n}টা আপেল আছে, দেখো!",
  takeAway: "{n}টা নিয়ে যাই!",
  plusMore: "{n}টা আরও যোগ!",
  plusEquals: "{x} যোগ {y} সমান {z}",
  minusEquals: "{x} বিয়োগ {y} সমান {z}",
  countLeft: "{n}টা নেওয়ার পর বাস্কেটে কতটা বাকি গুনো",
  countAll: "বাস্কেটের সব ফল একসাথে গুনো",

  /* ── 5 new games: Frog Hop / Memory Pairs / Balloon Pop / Clock / Balance ── */
  hopTo: "{n}-এ লাফ দাও!",
  hopToSpeak: "{word}-এ লাফ দাও!",
  memoryIntro: "জোড়া খুঁজে বের করো!",
  pairMatched: "জোড়া মিলেছে — {word}!",
  balloonAsk: (vars) => `${vars?.a ?? "?"} যোগ ${vars?.b ?? "?"} কত হয়? যত হয় সেই সংখ্যার বেলুন ফুটাও!`,
  clockAsk: "এখন কয়টা?",
  timeOClock: "{h}টা",
  timeHalfPast: "সাড়ে {h}টা",
  timeQuarterPast: "সোয়া {h}টা",
  timeQuarterTo: "পৌনে {h}টা",
  timeExact: "{h}টা {m} মিনিট",
  balanceAsk: "কোন পাশটা ভারী?",
  balanceHeavier: "{x} ভারী, {y} হালকা!",
  balanceCountHint: "দুই পাশের ফল গুনো — কোন পাশে বেশি?",

  /* ── Nova's Counting Song ── */
  songTitle: "সংখ্যার গান",
  songListen: "Nova গান গায় — শোনো আর দেখো!",
  songNowYou: "এখন তুমি গাও! ১, ২, ৩… ট্যাপ করো!",
  greatSinging: "চমৎকার গান, {name}! 🎵",

  /* ── scene header titles ── */
  titleCountPop: "গণনা ও পপ",
  titleGrowCount: "বপন ও গণনা",
  titleFruitAdd: "ফলের ঝুড়ি",
  titleFruitTree: "ফলের গাছ",
  titleShapeCatcher: "আকৃতি ধরো",
  titleEnLetters: "ইংরেজি বর্ণমালা",
  titleNumberBonds: "১০ বানাও!",
  titleBnColors: "রঙ চিনি",
  titleBnNumbers: "বাংলা সংখ্যা",
  titleEnPhonics: "বর্ণের উচ্চারণ",
  titleBalloon: "🎈 বেলুন ফুটাও",
  titleBalance: "⚖️ ভারী না হালকা",
  titleAddSub100: "যোগ ও বিয়োগ",
  titleClock: "🕒 ঘড়ি পড়া",
  titleRocket: "রকেট নির্মাণ",
  titlePizza: "পিৎজা ভগ্নাংশ",
  titleBnWords: "বাংলা শব্দ",
  titleBnFamilyWords: "পরিবারের শব্দ",
  titleCvc: "শব্দের ছবি",
  titleDivision: "দুর্গ ভাগ",
  titleFraction: "ভগ্নাংশ মেলানো",
  titlePlaceValue: "স্থানীয় মান টাওয়ার",
  titleBnMatras: "বাংলা কার",
  titleSightWords: "দেখা-শব্দ",
  titleAnimalHome: "প্রাণীর বাসা",
  titleDecimals: "দশমিক যুদ্ধ",
  titlePercent: "শতাংশ অভিযান",
  titleArea: "ক্ষেত্রফল ল্যাব",
  titleBnSentence: "বাক্য তৈরি",
  titleGrammar: "বিশেষ্য নাকি ক্রিয়া?",
  titleBgs: "বাংলাদেশ পরিচিতি",
  titleFrogHop: "🐸 ব্যাঙের লাফ",
  titleMemory: "🃏 মেমরি জোড়া",
  titleBdMoney: "টাকা চিনি",
  tapMoney: "সঠিক টাকা খুঁজে বের করো!",
  moneyMake: "কোনগুলো মিলে এই টাকা হয়?",
};

/** The one translation function — use it for EVERY user-facing string. */
export function t(key: string, vars?: TVars): string {
  const dict = getAppLang() === "bn" ? BN : EN;
  const entry = dict[key] ?? EN[key] ?? key;
  if (typeof entry === "function") return entry(vars);
  if (!vars) return entry;
  return entry.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Convenience: t() resolved to the CURRENT language for the current key. */
export function langOf(): "en" | "bn" {
  return getAppLang();
}
