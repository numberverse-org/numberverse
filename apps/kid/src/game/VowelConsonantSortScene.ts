import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  A: "vcA", Aa: "vcAa", I: "vcI", Ii: "vcIi", U: "vcU",
  Uu: "vcUu", E: "vcE", Oi: "vcOi", O: "vcO", Ou: "vcOu",
  Ko: "vcKo", Kho: "vcKho", Go: "vcGo", Gho: "vcGho", Co: "vcCo",
  Chho: "vcChho", Jo: "vcJo", Jho: "vcJho", To: "vcTo", Tho: "vcTho",
};

const CFG: BinSortConfig = {
  gameId: "game-vowelconsonant",
  titleKey: "vcTitle",
  promptKey: "vcQ",
  greatKey: "vcGreat",
  doneKey: "vcDone",
  speakWrongKey: "vcWrong",
  background: "floral",
  grid: 2,
  rounds: 3,
  bins: [
    { value: "vowel", key: "vcVowel", icon: "অ", verdictKey: "vcVerdictVowel" },
    { value: "consonant", key: "vcConsonant", icon: "ক", verdictKey: "vcVerdictConsonant" },
  ],
  items: [
    // vowels (স্বরবর্ণ)
    { id: "A", emoji: "অ", value: "vowel", tier: 1 },
    { id: "Aa", emoji: "আ", value: "vowel", tier: 1 },
    { id: "I", emoji: "ই", value: "vowel", tier: 1 },
    { id: "Ii", emoji: "ঈ", value: "vowel", tier: 1 },
    { id: "U", emoji: "উ", value: "vowel", tier: 1 },
    { id: "Uu", emoji: "ঊ", value: "vowel", tier: 2 },
    { id: "E", emoji: "এ", value: "vowel", tier: 2 },
    { id: "Oi", emoji: "ঐ", value: "vowel", tier: 2 },
    { id: "O", emoji: "ও", value: "vowel", tier: 3 },
    { id: "Ou", emoji: "ঔ", value: "vowel", tier: 3 },
    // consonants (ব্যঞ্জনবর্ণ)
    { id: "Ko", emoji: "ক", value: "consonant", tier: 1 },
    { id: "Kho", emoji: "খ", value: "consonant", tier: 1 },
    { id: "Go", emoji: "গ", value: "consonant", tier: 1 },
    { id: "Gho", emoji: "ঘ", value: "consonant", tier: 1 },
    { id: "Co", emoji: "চ", value: "consonant", tier: 2 },
    { id: "Chho", emoji: "ছ", value: "consonant", tier: 2 },
    { id: "Jo", emoji: "জ", value: "consonant", tier: 2 },
    { id: "Jho", emoji: "ঝ", value: "consonant", tier: 3 },
    { id: "To", emoji: "ট", value: "consonant", tier: 3 },
    { id: "Tho", emoji: "ঠ", value: "consonant", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Vowel or consonant? (#1145). A band-1 Bangla sort: drag স্বরবর্ণ letters
 * (অ আ ই…) into the vowel bin and ব্যঞ্জনবর্ণ letters (ক খ গ…) into the
 * consonant bin. The shared BinSortScene engine turns letter recognition into
 * a gentle drag-and-drop classification game.
 */
export class VowelConsonantSortScene extends BinSortScene {
  constructor() {
    super("VowelConsonantSort");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}
