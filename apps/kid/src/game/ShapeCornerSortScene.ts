import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  Square: "cnSquare", Triangle: "cnTriangle", Rectangle: "cnRectangle",
  Kite: "cnKite", Diamond: "cnDiamond", Circle: "cnCircle", Ball: "cnBall",
  Moon: "cnMoon", Egg: "cnEgg", Donut: "cnDonut", Ring: "cnRing",
};

const CFG: BinSortConfig = {
  gameId: "game-shapecorner",
  titleKey: "cnTitle",
  promptKey: "cnQ",
  greatKey: "cnGreat",
  doneKey: "cnDone",
  speakWrongKey: "cnWrong",
  background: "shapes",
  grid: 2,
  rounds: 3,
  bins: [
    { value: "corners", key: "cnCorners", icon: "🔷", verdictKey: "cnVerdictCorners" },
    { value: "none", key: "cnNone", icon: "⚪", verdictKey: "cnVerdictNone" },
  ],
  items: [
    // shapes with corners
    { id: "Square", emoji: "🟥", value: "corners", tier: 1 },
    { id: "Triangle", emoji: "🔺", value: "corners", tier: 1 },
    { id: "Rectangle", emoji: "🟦", value: "corners", tier: 1 },
    { id: "Kite", emoji: "🪁", value: "corners", tier: 2 },
    { id: "Diamond", emoji: "💎", value: "corners", tier: 3 },
    // shapes without corners
    { id: "Circle", emoji: "🟢", value: "none", tier: 1 },
    { id: "Ball", emoji: "⚽", value: "none", tier: 1 },
    { id: "Moon", emoji: "🌕", value: "none", tier: 2 },
    { id: "Egg", emoji: "🥚", value: "none", tier: 2 },
    { id: "Donut", emoji: "🍩", value: "none", tier: 3 },
    { id: "Ring", emoji: "💍", value: "none", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Corners or no corners? (#1145). A band-1 math geometry sort: drag flat shapes
 * into the 🔷 has-corners bin or the ⚪ no-corners bin. Same drag engine as the
 * other classification games, so shape sense starts with a child-friendly sort.
 */
export class ShapeCornerSortScene extends BinSortScene {
  constructor() {
    super("ShapeCornerSort");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}
