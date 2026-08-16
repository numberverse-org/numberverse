import { describe, it, expect } from "vitest";
import { hasUnsafeText } from "../src/game/speechSafety";

// ---------------------------------------------------------------------------
// EN — blocked words (same shared list the build-time gates use)
// ---------------------------------------------------------------------------

describe("hasUnsafeText (en) — blocks the shared unsafe-word list", () => {
  const blocked: Array<[string, string]> = [
    // violence
    ["kill", "violence: kill"],
    ["killed", "violence: killed"],
    ["blood", "violence: blood"],
    ["bomb", "violence: bomb"],
    ["weapon", "violence: weapon"],
    ["shoot", "violence: shoot"],
    ["murder", "violence: murder"],
    ["gun", "violence: gun"],
    // horror
    ["ghost", "horror: ghost"],
    ["devil", "horror: devil"],
    ["poison", "horror: poison"],
    // insults
    ["hate", "insults: hate"],
    ["stupid", "insults: stupid"],
    ["ugly", "insults: ugly"],
    ["liar", "insults: liar"],
    // death
    ["dead", "death: dead"],
    ["die", "death: die"],
    ["dying", "death: dying"],
    // selfHarm
    ["suicide", "selfHarm: suicide"],
    ["self-harm", "selfHarm: self-harm"],
    // sexualized
    ["naked", "sexualized: naked"],
    ["sexy", "sexualized: sexy"],
    ["porn", "sexualized: porn"],
    // drugsAlcohol
    ["drugs", "drugsAlcohol: drugs"],
    ["alcohol", "drugsAlcohol: alcohol"],
    ["cigarette", "drugsAlcohol: cigarette"],
    ["smoking", "drugsAlcohol: smoking"],
    ["vape", "drugsAlcohol: vape"],
    // slurs
    ["nigger", "slurs: nigger"],
    ["bastard", "slurs: bastard"],
    ["whore", "slurs: whore"],
  ];
  for (const [word, label] of blocked) {
    it(`blocks "${word}" (${label})`, () => {
      expect(hasUnsafeText(word, "en")).toBe(true);
      expect(hasUnsafeText(`play ${word} now`, "en")).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// EN — allowed / benign content
// ---------------------------------------------------------------------------

describe("hasUnsafeText (en) — allows benign kid content", () => {
  const benign = [
    "hello",
    "great job",
    "well done",
    "amazing work",
    "friend",
    "math is fun",
    "12345",
    "3.14",
    "🎉🎉",
    "👍",
    "let's count to ten",
  ];
  for (const text of benign) {
    it(`allows "${text}"`, () => {
      expect(hasUnsafeText(text, "en")).toBe(false);
    });
  }

  it("allows words that merely contain a blocked substring (word-boundary safe)", () => {
    // "kill" inside "killer" / "skill", "hate" inside "hateful", "rape" inside "grape"
    expect(hasUnsafeText("killer", "en")).toBe(false);
    expect(hasUnsafeText("skill", "en")).toBe(false);
    expect(hasUnsafeText("hateful", "en")).toBe(false);
    expect(hasUnsafeText("grape", "en")).toBe(false);
    expect(hasUnsafeText("caterpillar", "en")).toBe(false);
  });

  it("does not treat punctuation-substitution evasions as safe-list hits (a$$ / f*ck)", () => {
    // The module checks the SHARED static list verbatim — it does not normalize
    // substitutions, so these are NOT flagged (asserting the actual contract).
    expect(hasUnsafeText("a$$", "en")).toBe(false);
    expect(hasUnsafeText("f*ck", "en")).toBe(false);
    expect(hasUnsafeText("s#it", "en")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EN — boundary cases
// ---------------------------------------------------------------------------

describe("hasUnsafeText (en) — boundary cases", () => {
  it("empty string and whitespace are safe", () => {
    expect(hasUnsafeText("", "en")).toBe(false);
    expect(hasUnsafeText("   ", "en")).toBe(false);
    expect(hasUnsafeText("\n\t", "en")).toBe(false);
  });

  it("is case-insensitive (mixed case still blocked)", () => {
    expect(hasUnsafeText("KILL", "en")).toBe(true);
    expect(hasUnsafeText("I WILL Kill YOU", "en")).toBe(true);
    expect(hasUnsafeText("StUpId", "en")).toBe(true);
    expect(hasUnsafeText("Dead", "en")).toBe(true);
  });

  it("matches whole words — punctuation boundaries still count as word boundaries", () => {
    expect(hasUnsafeText("kill.", "en")).toBe(true);
    expect(hasUnsafeText("(kill)", "en")).toBe(true);
    expect(hasUnsafeText("no, kill!", "en")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BN — blocked words
// ---------------------------------------------------------------------------

describe("hasUnsafeText (bn) — blocks the shared unsafe-word list", () => {
  const blocked: Array<[string, string]> = [
    ["রক্ত", "violence: blood"],
    ["বোমা", "violence: bomb"],
    ["হত্যা", "violence: murder"],
    ["মৃত্যু", "violence: death"],
    ["ভূত", "horror: ghost"],
    ["শয়তান", "horror: devil"],
    ["বিষ", "horror: poison"],
    ["বোকা", "insults: fool"],
    ["কুৎসিত", "insults: ugly"],
    ["মিথ্যাবাদী", "insults: liar"],
    ["ঘৃণা", "insults: hate"],
    ["আত্মহত্যা", "selfHarm: suicide"],
    ["উলঙ্গ", "sexualized: naked"],
    ["মদ", "drugsAlcohol: alcohol"],
    ["সিগারেট", "drugsAlcohol: cigarette"],
  ];
  for (const [word, label] of blocked) {
    it(`blocks "${word}" (${label})`, () => {
      expect(hasUnsafeText(word, "bn")).toBe(true);
      expect(hasUnsafeText(`সে ${word} বলল`, "bn")).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// BN — allowed / boundary
// ---------------------------------------------------------------------------

describe("hasUnsafeText (bn) — allows benign kid content", () => {
  it("allows benign Bengali praise / questions", () => {
    expect(hasUnsafeText("খুব ভালো!", "bn")).toBe(false);
    expect(hasUnsafeText("তুমি কেমন আছো?", "bn")).toBe(false);
    expect(hasUnsafeText("আমি ভালোবাসি", "bn")).toBe(false);
    expect(hasUnsafeText("১২০", "bn")).toBe(false); // Bengali numerals
    expect(hasUnsafeText("🎉", "bn")).toBe(false);
  });

  it("empty string and whitespace are safe", () => {
    expect(hasUnsafeText("", "bn")).toBe(false);
    expect(hasUnsafeText("   ", "bn")).toBe(false);
  });

  it("only matches standalone Bengali words (lookaround boundaries)", () => {
    // "মর" is a blocked word, but inside a longer Bengali word the lookarounds
    // prevent a hit — assert the module's actual boundary contract.
    expect(hasUnsafeText("তুমি মর", "bn")).toBe(true);
    expect(hasUnsafeText("মরে যাওয়া", "bn")).toBe(false); // মর followed by ে (Bengali)
    expect(hasUnsafeText("বোকামি", "bn")).toBe(false); // বোকা followed by Bengali chars
  });
});

// ---------------------------------------------------------------------------
// Cross-language isolation
// ---------------------------------------------------------------------------

describe("hasUnsafeText — language isolation", () => {
  it("a Bengali word is not flagged as English", () => {
    expect(hasUnsafeText("রক্ত", "en")).toBe(false);
  });
  it("an English word is not flagged as Bengali", () => {
    expect(hasUnsafeText("blood", "bn")).toBe(false);
  });
});
