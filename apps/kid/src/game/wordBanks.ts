/**
 * Shared word banks — the SINGLE source of truth for kid-vocabulary lists.
 *
 * Background: several literacy scenes used to hand-copy the same words into
 * per-file arrays (CvcScene vs CvcBuildScene, BnWordsScene vs BanglaSpellScene,
 * NumberWordsScene vs BnNumbersScene…), so a curriculum edit in one file
 * silently drifted from the other. These banks centralize each pool once; every
 * scene derives its own view (icons for the tap game, emoji+spelling units for
 * the builder, digits for the numeral game) from the canonical entry.
 *
 * #1167 — CVC_POOL / CVC_BUILD_POOL
 * #1168 — BANGLA_KID_WORDS / BANGLA_FAMILY_WORDS
 * #1171 — GRAMMAR_NOUNS / GRAMMAR_VERBS (stable subsets of the frequency list)
 * #1172 — BANGLA_NUMBER_WORDS / BANGLA_DIGITS + banglaNumeral()
 */

/* ══════════════════════ CVC — read & build scenes (#1167) ══════════════════ */

export interface CvcWord {
  /** The English word itself. */
  word: string;
  /** Atlas icon key for the tap-the-picture game (CvcScene). */
  icon?: string;
  /** Display emoji for the spelling-builder game (CvcBuildScene). */
  emoji: string;
}

/** The 16 base CVC words — shared verbatim by the read scene and the builder. */
export const CVC_POOL: CvcWord[] = [
  { word: "cat", icon: "cat", emoji: "🐱" },
  { word: "dog", icon: "dog", emoji: "🐶" },
  { word: "sun", icon: "sun", emoji: "☀️" },
  { word: "hat", icon: "hat", emoji: "🎩" },
  { word: "bed", icon: "bed", emoji: "🛏️" },
  { word: "car", icon: "car", emoji: "🚗" },
  { word: "bus", icon: "bus", emoji: "🚌" },
  { word: "egg", icon: "egg2", emoji: "🥚" },
  { word: "pig", icon: "pig", emoji: "🐷" },
  { word: "fox", icon: "fox", emoji: "🦊" },
  { word: "cow", icon: "cow", emoji: "🐮" },
  { word: "owl", icon: "owl", emoji: "🦉" },
  { word: "bat", icon: "bat", emoji: "🦇" },
  { word: "rat", icon: "rat", emoji: "🐀" },
  { word: "hen", icon: "hen", emoji: "🐔" },
  { word: "web", icon: "web", emoji: "🕸️" },
];

/** The 5 extra CVC words only the builder practices (jam, van…). */
export const CVC_BUILD_EXTRA: CvcWord[] = [
  { word: "ice", emoji: "🧊" },
  { word: "jam", emoji: "🍓" },
  { word: "bug", emoji: "🐛" },
  { word: "pin", emoji: "📌" },
  { word: "van", emoji: "🚐" },
];

/** Builder pool = the shared base + its extras (16 + 5 = 20). */
export const CVC_BUILD_POOL: CvcWord[] = [...CVC_POOL, ...CVC_BUILD_EXTRA];

/* ════════════════ Grammar nouns/verbs — stable subsets (#1171) ════════════════ */

/** High-frequency nouns used by GrammarScene — the SAME pool that surfaces in
 *  the CVC and sight-word banks, so a curriculum word edit lives in ONE place. */
export const GRAMMAR_NOUNS = ["dog", "book", "cat", "teacher", "tree", "school"];
export const GRAMMAR_VERBS = ["run", "sing", "jump", "read", "eat", "write"];

/* ════════════════ Bangla kid words — read & spell (#1168) ════════════════ */

export interface BanglaKidWord {
  /** Bangla word (canonical spelling). */
  bn: string;
  /** English gloss. */
  en: string;
  /** Atlas icon key (BnWordsScene tap-the-picture game). */
  icon?: string;
  /** Display emoji (BanglaSpellScene builder, RiddleScene answers). */
  emoji: string;
  /** Spelling units as they appear on a tile — base letter + matra sign. */
  letters?: string[];
}

/** Canonical kid-vocabulary bank. Every entry is the union of what the
 *  read-scene, the spelling-builder and the riddle answers need; a word edit
 *  here propagates to all three. */
export const BANGLA_KID_WORDS: BanglaKidWord[] = [
  // shared read + spell words (icon for read, emoji + letters for spell)
  { bn: "মাছ", en: "Fish", icon: "fish", emoji: "🐟", letters: ["মা", "ছ"] },
  { bn: "বাঘ", en: "Tiger", icon: "tiger", emoji: "🐯", letters: ["বা", "ঘ"] },
  { bn: "কলা", en: "Banana", icon: "banana", emoji: "🍌", letters: ["ক", "লা"] },
  { bn: "গরু", en: "Cow", icon: "cow", emoji: "🐄" },
  { bn: "হাঁস", en: "Duck", icon: "duck", emoji: "🦆", letters: ["হাঁ", "স"] },
  { bn: "ফুল", en: "Flower", icon: "flower2", emoji: "🌺", letters: ["ফু", "ল"] },
  { bn: "পাখি", en: "Bird", icon: "bird", emoji: "🐦" },
  { bn: "আপেল", en: "Apple", icon: "apple", emoji: "🍎" },
  { bn: "ঘোড়া", en: "Horse", icon: "horse", emoji: "🐎" },
  { bn: "ছাগল", en: "Goat", icon: "goat", emoji: "🐐" },
  { bn: "হাতি", en: "Elephant", icon: "elephant", emoji: "🐘", letters: ["হা", "তি"] },
  { bn: "কুকুর", en: "Dog", icon: "dog", emoji: "🐕" },
  { bn: "বিড়াল", en: "Cat", icon: "cat", emoji: "🐱" },
  { bn: "হরিণ", en: "Deer", icon: "deer", emoji: "🦌" },
  { bn: "প্রজাপতি", en: "Butterfly", icon: "butterfly", emoji: "🦋" },
  { bn: "পেঙ্গুইন", en: "Penguin", icon: "penguin", emoji: "🐧" },
  { bn: "তোতা", en: "Parrot", icon: "parrot", emoji: "🦜" },
  { bn: "আঙুর", en: "Grapes", icon: "grapes", emoji: "🍇" },
  { bn: "স্ট্রবেরি", en: "Strawberry", icon: "strawberry", emoji: "🍓" },
  { bn: "চাঁদ", en: "Moon", icon: "moon", emoji: "🌙" },
  // spelling-builder-only words (emoji + spelling units, no read-scene icon)
  { bn: "বই", en: "Book", emoji: "📖", letters: ["ব", "ৈ"] },
  { bn: "ভাত", en: "Rice", emoji: "🍚", letters: ["ভা", "ত"] },
  { bn: "আম", en: "Mango", emoji: "🥭", letters: ["আ", "ম"] },
  { bn: "মা", en: "Mom", emoji: "👩", letters: ["মা"] },
  { bn: "ডিম", en: "Egg", emoji: "🥚", letters: ["ডি", "ম"] },
  { bn: "বাড়ি", en: "Home", emoji: "🏠", letters: ["বা", "ড়ি"] },
  { bn: "রেল", en: "Train", emoji: "🚂", letters: ["রে", "ল"] },
  { bn: "গাছ", en: "Tree", emoji: "🌳", letters: ["গা", "ছ"] },
  { bn: "ঘুড়ি", en: "Kite", emoji: "🪁", letters: ["ঘু", "ড়ি"] },
  { bn: "বৃষ্টি", en: "Rain", emoji: "🌧️", letters: ["বৃ", "ষ্টি"] },
  { bn: "রোদ", en: "Sunshine", emoji: "☀️", letters: ["রো", "দ"] },
  { bn: "পাহাড়", en: "Mountain", emoji: "⛰️", letters: ["পা", "হা", "ড়"] },
  { bn: "তরমুজ", en: "Watermelon", emoji: "🍉", letters: ["ত", "র", "মু", "জ"] },
  { bn: "নৌকা", en: "Boat", emoji: "🛶", letters: ["নৌ", "কা"] },
  { bn: "মধু", en: "Honey", emoji: "🍯", letters: ["ম", "ধু"] },
  { bn: "ঝিনুক", en: "Shell", emoji: "🐚", letters: ["ঝি", "নু", "ক"] },
];

/** Family-vocabulary bank — the BnWords scene's "family" mode list. */
export const BANGLA_FAMILY_WORDS: BanglaKidWord[] = [
  { bn: "মা", en: "Mom", icon: "mom", emoji: "👩" },
  { bn: "বাবা", en: "Dad", icon: "dad", emoji: "👨" },
  { bn: "ভাই", en: "Brother", icon: "brother", emoji: "👦" },
  { bn: "বোন", en: "Sister", icon: "sister", emoji: "👧" },
  { bn: "দাদা", en: "Grandpa", icon: "grandpa", emoji: "👴" },
  { bn: "দাদি", en: "Grandma", icon: "grandma", emoji: "👵" },
  { bn: "নানা", en: "Grandpa", icon: "grandpa", emoji: "👴" },
  { bn: "নানি", en: "Grandma", icon: "grandma", emoji: "👵" },
  { bn: "চাচা", en: "Uncle", icon: "uncle", emoji: "🧔" },
  { bn: "খালা", en: "Aunt", icon: "aunt", emoji: "👩" },
  { bn: "ভাতিজা", en: "Nephew", icon: "cousin", emoji: "👦" },
  { bn: "ভাতিজি", en: "Niece", icon: "cousin", emoji: "👧" },
];

/** Resolve a riddle/clue answer to the canonical bank spelling when the word is
 *  in the bank (falls back to the literal so edits propagate, not break). */
export function bwn(bn: string): string {
  return BANGLA_KID_WORDS.find((w) => w.bn === bn)?.bn ?? bn;
}

/* ════════════ Bangla number words — numerals & spellings (#1172) ════════════ */

/** Canonical 1–100 (index 0 unused) Bangla number-word spellings. */
export const BANGLA_NUMBER_WORDS: string[] = [
  "", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়", "দশ",
  "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "উনিশ", "বিশ",
  "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ", "ঊনত্রিশ", "ত্রিশ",
  "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ", "চল্লিশ",
  "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চুয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ", "পঞ্চাশ",
  "একান্ন", "বাহান্ন", "তিপ্পান্ন", "চুয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট", "ষাট",
  "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর", "সত্তর",
  "একাত্তর", "বাহাত্তর", "তিয়াত্তর", "চুয়াত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনআশি", "আশি",
  "একাশি", "বিরাশি", "তিরাশি", "চুরাশি", "পঁচাশি", "ছিয়াশি", "সাতাশি", "আটাশি", "ঊননব্বই", "নব্বই",
  "একানব্বই", "বিরানব্বই", "তিরানব্বই", "চুরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই", "একশো",
];

/** Bangla digit glyphs ০–৯ with their spoken names. */
export const BANGLA_DIGITS: { ch: string; word: string }[] = [
  { ch: "০", word: "শূন্য" }, { ch: "১", word: "এক" }, { ch: "২", word: "দুই" },
  { ch: "৩", word: "তিন" }, { ch: "৪", word: "চার" }, { ch: "৫", word: "পাঁচ" },
  { ch: "৬", word: "ছয়" }, { ch: "৭", word: "সাত" }, { ch: "৮", word: "আট" },
  { ch: "৯", word: "নয়" },
];

/** Bangla word for a number n (0 → "", 1–100 → its spelling, else the digit). */
export function banglaNumeral(n: number): string {
  return n >= 0 && n < BANGLA_NUMBER_WORDS.length ? BANGLA_NUMBER_WORDS[n] : String(n);
}
