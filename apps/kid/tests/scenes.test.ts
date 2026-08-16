/**
 * scenes.test.ts — test-coverage-kid #12: 156 Phaser scenes had NO unit-level
 * coverage. The Phaser canvas engine can't boot in a unit runner, so this wave
 * closes the gap at the DATA / STRUCTURAL layer — the shipped contract of every
 * `apps/kid/src/game/*Scene.ts` file — the same layer the repo's other strict
 * scans (scripts/audit.mjs) use. Pure file-text scan: fast + deterministic.
 *
 * Invariants asserted (Wave F feed, scenes):
 *   1. Scene-key catalog integrity — every `super("Key")` is unique and is
 *      present in @numberverse/core GAME_SCENES / activities.ts ACTIVITIES /
 *      the two documented non-gameplay hub scenes (Nova, Garden). No orphan
 *      scene, no missing catalog entry (every catalog value resolves to a file).
 *   2. Round-done wiring — every difficulty scene reports via onRoundDone
 *      (directly `this.onRoundDone?.(` or through a shared base that does:
 *      BinSortScene / DragReorderScene / TapChoiceScene). The only non-reporting
 *      scenes are the documented non-round ones: 19 pet mini-games launched
 *      with `onBack` (#104 pet-minigames), the no-pressure free-play garden
 *      (#1143), and the Nova/Garden hub scenes — all allowlisted + pinned.
 *   3. Difficulty reporting — every onRoundDone difficulty argument is a
 *      1-BASED LEVEL INDEX (`this.levelIndex + 1`), never a raw ladder value
 *      (the coin economy + stored difficulty metric key off that index; the
 *      repo test on_round_done_difficulty.test.mjs documents the contract).
 *   4. i18n literal hygiene — scene bodies contain no hardcoded EN/BN
 *      user-facing strings outside the double-quoted camelCase i18n-key literal
 *      convention (each scene carries the audit-scanner comment). Assert no
 *      Bengali glyph UI strings + no multi-word English UI phrases; the only
 *      hits are the Bangladeshi taka glyph ৳ printed on money tiles in the
 *      three money scenes (documented currency symbol, not a translated phrase).
 *   5. No `lang:'bn'` redundancy in scene speech calls — the app auto-detects
 *      Bangla glyphs, so a hardcoded `lang: "bn"` override is a shipped-bug;
 *      assert zero remain (the conditional `lang: bn ? "bn" : "en"` routing for
 *      i18n-key text is the repo's shipped convention and stays).
 */
import { describe, it, expect, afterAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_SCENES } from "@numberverse/core";
import { ACTIVITIES } from "../src/game/activities";

/* ───────────────────────── helpers ───────────────────────── */
const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "game");
const sceneFiles = readdirSync(GAME_DIR).filter((f) => f.endsWith("Scene.ts")).sort();

const read = (f: string): string => readFileSync(join(GAME_DIR, f), "utf8");

/** The Phaser scene key — `super("Key")` in the constructor (`#939` contract). */
const sceneKey = (f: string): string | null => read(f).match(/super\("([A-Za-z0-9]+)"\)/)?.[1] ?? null;

/** The declared base class (e.g. `BinSortScene`) — the name right after `extends`. */
const baseClass = (f: string): string => read(f).match(/export class \w+ extends (\w+)/)?.[1] ?? "";

/** Strip both line and block comments — the i18n/hygiene scan is over CODE only. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** The shared base classes whose `finishRound()` calls `this.onRoundDone?.(`
 *  with `this.levelIndex + 1` (binSort.ts #1059, reorder.ts, tapChoice.ts). */
const ROUND_DONE_BASES = new Set(["BinSortScene", "DragReorderScene", "TapChoiceScene"]);

const catalogSceneKeys = new Set(Object.values(GAME_SCENES));
const activitySceneKeys = new Set(ACTIVITIES.filter((a) => a.scene).map((a) => a.scene as string));

/* ────────── pinned stability counts (found by reading the repo) ────────── */
const SCENE_FILE_COUNT = 171;
/** Keys NOT in GAME_SCENES — 19 pet-mini-game scenes (activities.ts `scene:`)
 *  + the 2 non-gameplay hub scenes (Nova, Garden) launched directly. */
const CATALOG_ORPHAN_COUNT = 21;
/** Scenes that intentionally never call onRoundDone — pet mini-games (#104,
 *  launched with onBack), the no-pressure ExploreGarden (#1143), and the two
 *  hub scenes. All are allowlisted below; the repo documents each. */
const NO_ROUND_ALLOWLIST = new Set([
  // 19 pet mini-games — activities.ts `scene:` entries, `#104 pet-minigames`
  "BathNovaScene.ts", "BubblePopScene.ts", "CatchFruitScene.ts", "DressUpScene.ts",
  "EggHatchScene.ts", "FetchScene.ts", "HideSeekScene.ts", "NovaSaysScene.ts",
  "PetBirthdayScene.ts", "PetDanceScene.ts", "PetFeedScene.ts", "PetMemoryScene.ts",
  "PetStrokeScene.ts", "PetWalkScene.ts", "PhotoBoothScene.ts", "SleepWakeScene.ts",
  "SpeciesGalleryScene.ts", "TreatSortScene.ts", "TuckInScene.ts",
  // 2 non-gameplay hub scenes, launched by the app directly (not a difficulty round)
  "NovaScene.ts", "GardenScene.ts",
  // #1143 — no-pressure free-play break: deliberately no score / no round end
  "ExploreGardenScene.ts",
]);
/** The taka ৳ glyph printed on money tiles in the three money scenes — a
 *  legitimate currency symbol (Bangladesh's ৳), never a user-facing phrase. */
const TAKA_SYMBOL_SCENES = new Set(["BdMoneyScene.ts", "CoinValueScene.ts", "MakeChangeScene.ts"]);

/** i18n-hygiene findings the scan EXPECTS (real bugs, NOT allowlisted). The six
 *  bugs found by the coverage wave — five scenes with a hardcoded backtick
 *  "Round ${n}" (CodeLogic/MathSolve/NegativeNumber/ScienceFacts/Trace) and
 *  PercentScene hardcoding "% of … = ?" — were FIXED (they now route through
 *  `t("round")` / `t("pctFact")`). The set is pinned empty so the suite fails
 *  if a NEW hardcoded English/UI phrase appears in any scene. */
const KNOWN_I18N_HYGIENE_BUGS = new Set<string>([]);

/** Strip `${…}` template interpolations (balanced braces) — leaves the literal
 *  English words a static-phrase scan cares about (e.g. "Round ${n}" → "Round "). */
const stripInterpolations = (lit: string): string => {
  let out = "";
  let i = 0;
  while (i < lit.length) {
    if (lit.startsWith("${", i)) {
      let depth = 1;
      let j = i + 2;
      while (j < lit.length && depth > 0) {
        if (lit[j] === "{") depth++;
        else if (lit[j] === "}") depth--;
        j++;
      }
      i = j;
    } else {
      out += lit[i];
      i++;
    }
  }
  return out;
};

/** A hardcoded English WORD (2+ letters) bounded by whitespace / string edge /
 *  parens — catches "Round 3" but not hex "#1e293b", not "${digit(...)}". */
const HARDCODED_EN_WORD = /(?:^|[\s(])[A-Za-z]{2,}(?=$|[\s),.)])/;

/* ───────────────────────── 1. catalog integrity ───────────────────────── */
describe("scene-key catalog integrity", () => {
  it(`covers every one of the ${SCENE_FILE_COUNT} *Scene.ts files`, () => {
    expect(sceneFiles.length).toBe(SCENE_FILE_COUNT);
  });

  it("every scene file declares a unique super(\"Key\")", () => {
    const keys = sceneFiles.map((f) => [f, sceneKey(f)] as const);
    for (const [f, k] of keys) {
      expect(k, `${f} has no super("Key") scene-key`).toBeTruthy();
    }
    const all = keys.map(([, k]) => k!);
    expect(new Set(all).size).toBe(all.length); // #939 — duplicate keys crash Phaser silently
  });

  it("every scene key is in GAME_SCENES, activity scenes, or the documented hubs", () => {
    const keys = sceneFiles.map((f) => sceneKey(f)!);
    // Reverse direction first — every catalog value resolves to a scene file.
    const fileKeys = new Set(keys);
    const missingCatalogFile = [...catalogSceneKeys].filter((k) => !fileKeys.has(k));
    expect(missingCatalogFile, "catalog scene with no *Scene.ts").toEqual([]);

    // Forward direction — no orphan scene.
    const notInCatalog = keys.filter((k) => !catalogSceneKeys.has(k));
    // Pin the allowlist count exactly as found.
    expect(notInCatalog.length).toBe(CATALOG_ORPHAN_COUNT);
    const orphanFiles = sceneFiles
      .filter((f) => !catalogSceneKeys.has(sceneKey(f)!))
      .sort();
    const unexpected = orphanFiles.filter(
      (f) => !activitySceneKeys.has(sceneKey(f)!) && !["Nova", "Garden"].includes(sceneKey(f)!)
    );
    expect(unexpected, "scene key missing from GAME_SCENES/ACTIVITIES/hubs").toEqual([]);
  });
});

/* ───────────────────────── 2. round-done wiring ───────────────────────── */
describe("round-done wiring (adaptive-difficulty honesty contract)", () => {
  it("every difficulty scene reports via onRoundDone; non-round scenes are the documented allowlist", () => {
    // A scene reports when it calls onRoundDone directly OR its base class does.
    const nonReporting = sceneFiles.filter((f) => {
      const src = read(f);
      return !src.includes("this.onRoundDone?.(") && !ROUND_DONE_BASES.has(baseClass(f));
    });
    expect(nonReporting.length).toBe(NO_ROUND_ALLOWLIST.size); // pin: 22
    const unexpected = nonReporting.filter((f) => !NO_ROUND_ALLOWLIST.has(f));
    expect(unexpected, "scene with no onRoundDone and no documented exemption").toEqual([]);
  });
});

/* ───────────────────────── 3. difficulty reporting ───────────────────────── */
describe("difficulty reporting (1-based LEVEL INDEX)", () => {
  it("every onRoundDone call passes `this.levelIndex + 1` as the difficulty arg", () => {
    const bad: string[] = [];
    for (const f of sceneFiles) {
      const src = read(f);
      const re = /this\.onRoundDone\?\.\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        // Balanced-paren walk to the closing paren of the call.
        let i = m.index + m[0].length - 1;
        let depth = 1;
        const body: string[] = [];
        while (i < src.length && depth > 0) {
          i++;
          const ch = src[i];
          if (ch === "(") depth++;
          else if (ch === ")") {
            if (--depth === 0) break;
          }
          body.push(ch);
        }
        // Split the call body on top-level commas → [correct, ms, difficulty, ...]
        const parts: string[] = [];
        let d = 0;
        let cur = "";
        for (const ch of body.join("")) {
          if (ch === "(" || ch === "[") d++;
          else if (ch === ")" || ch === "]") d--;
          if (ch === "," && d === 0) {
            parts.push(cur);
            cur = "";
          } else cur += ch;
        }
        if (cur.trim()) parts.push(cur);
        const third = (parts[2] ?? "").replace(/\s+/g, " ").trim();
        if (!/\blevelIndex\s*\+\s*1\b/.test(third)) {
          const line = src.slice(0, m.index).split("\n").length;
          bad.push(`${f}:${line} → ${third}`);
        }
      }
    }
    expect(bad, "onRoundDone difficulty arg must be the 1-based level index (levelIndex + 1)").toEqual([]);
  });
});

/* ───────────────────────── 4. i18n literal hygiene ───────────────────────── */
describe("i18n literal hygiene (no hardcoded EN/BN user-facing strings)", () => {
  it("scene bodies contain no Bengali glyph UI strings and no hardcoded English UI phrases", () => {
    const bnBad: string[] = [];
    const enBad: string[] = [];
    for (const f of sceneFiles) {
      const code = stripComments(read(f));
      // UI-visible text call sites: .setText(x) / .appendText(x) / .text(x, y, x).
      // The 3-arg .text form targets the TEXT argument (x, y are simple exprs).
      const setTextCalls = code.matchAll(/\.(?:setText|appendText)\s*\(\s*([`"'])(.*?)\1/g);
      const textCalls = code.matchAll(/\.text\s*\(\s*[^,()]+\s*,\s*[^,()]+\s*,\s*([`"'])(.*?)\1/g);
      const uiCalls = [...setTextCalls, ...textCalls];
      for (const m of uiCalls) {
        const lit = m[2];
        // 4a. Bengali glyphs in a UI-visible string (raw bangla outside t("key")).
        if (/[ঀ-৿]/.test(lit) && !TAKA_SYMBOL_SCENES.has(f)) {
          bnBad.push(`${f}: Bengali UI literal ${JSON.stringify(lit.slice(0, 60))}`);
        }
        // 4b. Hardcoded English WORD in a UI-visible string after stripping
        // interpolations — catches "Round ${n}" but not dynamic counters.
        const stripped = stripInterpolations(lit);
        if (HARDCODED_EN_WORD.test(stripped)) {
          enBad.push(`${f}: hardcoded English UI text ${JSON.stringify(lit.slice(0, 60))}`);
        }
      }
    }
    // Pin the allowlist (three money scenes print the ৳ currency glyph).
    expect(TAKA_SYMBOL_SCENES.size).toBe(3);
    // Bengali UI literals must be zero outside the documented taka symbol.
    expect(bnBad, "Bengali glyph UI literals must live in i18n.ts").toEqual([]);
    // English UI literals: the ONLY ones are the pinned known bugs — no new
    // (or newly-fixed) drift allowed; the known bugs are reported in SUMMARY.
    const enBadFiles = [...new Set(enBad.map((s) => s.split(":")[0]))].sort();
    const knownBugs = [...KNOWN_I18N_HYGIENE_BUGS].sort();
    expect(KNOWN_I18N_HYGIENE_BUGS.size).toBe(0); // pin — all coverage-wave bugs fixed
    expect(enBadFiles, "hardcoded English UI text must live in i18n.ts").toEqual(knownBugs);
  });
});

/* ───────────────────────── 5. no lang:'bn' redundancy ───────────────────────── */
describe("no lang:'bn' redundancy in speech calls", () => {
  it("scene speech calls never hardcode a bangla lang override (glyphs auto-detect)", () => {
    const bad: string[] = [];
    for (const f of sceneFiles) {
      const src = read(f);
      const re = /lang\s*:\s*["']bn["']/g;
      if (re.test(src)) bad.push(f);
    }
    expect(bad, "explicit lang:'bn' overrides were removed — Bangla glyphs auto-detect").toEqual([]);
  });
});

/* ───────────────────────── summary (Wave F feed) ───────────────────────── */
afterAll(() => {
  // Unique files allowlisted for a documented/legitimate reason across the
  // invariants: the 22 non-round scenes (pet #104 + hubs + #1143 free-play) and
  // the 3 money scenes printing the taka glyph. The i18n known-bugs are NOT
  // allowlisted — they are real findings reported below.
  const allowlistedFiles = new Set([...NO_ROUND_ALLOWLIST, ...TAKA_SYMBOL_SCENES]);
  const realBugs = [...KNOWN_I18N_HYGIENE_BUGS].sort().join(", ");
  // eslint-disable-next-line no-console
  console.log(
    `SUMMARY scenes: 7 tests, finding #12 closed, allowlist: ${allowlistedFiles.size} files, real bugs: ${realBugs || "none"}`
  );
});
