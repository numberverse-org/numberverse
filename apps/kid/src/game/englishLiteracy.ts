/**
 * Shared English-literacy banks (#1176) — ONE owner of the alphabet and the
 * grade-level word sets, so the "ABC order" sets, the letter-sound targets and
 * the case-match strings all come from the same module and can never drift.
 *
 * Consumers: EnLettersScene (ALPHABET), AlphaOrderScene (ALPHA_ORDER_SETS),
 *            CaseMatchScene (UPPERCASE/LOWERCASE), DigraphsScene (shares the
 *            same A–Z source of truth).
 */

export interface LetterTarget {
  ch: string;
  en: string;
  hint: string;
  icon: string;
}

/** The full A–Z letter bank with its picture cue — the single alphabet. */
export const ALPHABET: LetterTarget[] = [
  { ch: "A", en: "A", hint: "Apple", icon: "apple" },
  { ch: "B", en: "B", hint: "Ball", icon: "ball" },
  { ch: "C", en: "C", hint: "Cat", icon: "cat" },
  { ch: "D", en: "D", hint: "Dog", icon: "dog" },
  { ch: "E", en: "E", hint: "Egg", icon: "egg2" },
  { ch: "F", en: "F", hint: "Fish", icon: "fish" },
  { ch: "G", en: "G", hint: "Goat", icon: "goat" },
  { ch: "H", en: "H", hint: "Hat", icon: "hat" },
  { ch: "I", en: "I", hint: "Ice", icon: "ice" },
  { ch: "J", en: "J", hint: "Jam", icon: "strawberry" },
  { ch: "K", en: "K", hint: "Kite", icon: "kite" },
  { ch: "L", en: "L", hint: "Lion", icon: "lion" },
  { ch: "M", en: "M", hint: "Moon", icon: "moon" },
  { ch: "N", en: "N", hint: "Nest", icon: "owl" },
  { ch: "O", en: "O", hint: "Orange", icon: "orange" },
  { ch: "P", en: "P", hint: "Pig", icon: "pig" },
  { ch: "Q", en: "Q", hint: "Queen", icon: "trophy" },
  { ch: "R", en: "R", hint: "Rabbit", icon: "frog" },
  { ch: "S", en: "S", hint: "Sun", icon: "sun" },
  { ch: "T", en: "T", hint: "Turtle", icon: "turtle" },
  { ch: "U", en: "U", hint: "Umbrella", icon: "flower" },
  { ch: "V", en: "V", hint: "Van", icon: "car" },
  { ch: "W", en: "W", hint: "Wave", icon: "wave" },
  { ch: "X", en: "X", hint: "X-ray", icon: "bolt" },
  { ch: "Y", en: "Y", hint: "Yarn", icon: "ball" },
  { ch: "Z", en: "Z", hint: "Zebra", icon: "tiger" },
];

/** Grade-level word sets for ABC-order practice, keyed by the set size. */
export const ALPHA_ORDER_SETS: Record<number, string[][]> = {
  4: [
    ["apple", "ball", "cat", "dog"],
    ["ant", "bee", "cow", "fox"],
    ["bag", "car", "duck", "egg"],
    ["bird", "cake", "fish", "hat"],
    ["bear", "cow", "deer", "frog"],
    ["boat", "cup", "drum", "goat"],
    ["book", "cake", "door", "egg"],
    ["bus", "cat", "dog", "ear"],
  ],
  5: [
    ["apple", "banana", "cherry", "grape", "mango"],
    ["ball", "drum", "kite", "lion", "tree"],
    ["bridge", "castle", "forest", "garden", "river"],
    ["bread", "cheese", "honey", "mango", "rice"],
    ["cow", "duck", "frog", "lion", "tiger"],
    ["green", "orange", "purple", "red", "yellow"],
    ["brother", "father", "mother", "sister", "uncle"],
    ["autumn", "garden", "spring", "summer", "winter"],
  ],
  6: [
    ["ant", "apple", "ball", "bat", "cat", "dog"],
    ["big", "bird", "book", "bus", "cake", "car"],
    ["bear", "bee", "bird", "boat", "book", "bus"],
    ["cat", "cake", "cap", "dog", "egg", "fish"],
    ["apple", "ant", "ball", "bear", "cat", "cow"],
    ["duck", "dog", "drum", "egg", "fish", "fox"],
    ["hat", "hen", "hill", "sun", "tree", "water"],
    ["ice", "jam", "jump", "kite", "leaf", "moon"],
  ],
};

export const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
