// @vitest-environment jsdom
/* test-coverage-kid #14 — engine boot guards.
 *
 * Real-import limitation: apps/kid/src/game/engine.ts is the Phaser dynamic
 * chunk. Importing it evaluates Phaser, and Phaser's CanvasFeatures.js calls
 * HTMLCanvasElement.getContext('2d') at module-eval time. Stock jsdom returns
 * null there (the optional `canvas` native npm package is NOT installed), so
 * Phaser aborts with "Cannot set properties of null (setting 'fillStyle')"
 * before the engine's scene registry is even built. For the same reason
 * createGame(parent) — `new Phaser.Game({...})` — cannot be booted headlessly
 * here.
 *
 * Per the task, the documented fallback is a STATIC SOURCE SCAN: read every
 * apps/kid/src/game/*Scene.ts, extract the super("Key") string, and assert the
 * same data-level invariants the engine's boot guards enforce:
 *   · assertUniqueSceneKeys()  — every scene key is unique (a duplicate would
 *     make Phaser silently run the wrong scene).
 *   · assertCatalogCovered()   — every GAME_SCENES value and every ACTIVITIES
 *     mini-game scene key is reachable from a *Scene.ts file (a renamed/vanished
 *     scene would silently fail at boot).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GAME_SCENES } from "@numberverse/core";
import { ACTIVITIES } from "../src/game/activities";

const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "game");

/** Read every *Scene.ts and return a map of super("Key") → file name.
 *  Fails the current test loudly on a missing/duplicate key. */
function extractSceneKeys(): Map<string, string> {
  const files = readdirSync(GAME_DIR).filter((f) => f.endsWith("Scene.ts")).sort();
  const keyToFile = new Map<string, string>();
  for (const file of files) {
    const src = readFileSync(join(GAME_DIR, file), "utf8");
    const m = src.match(/super\(\s*["']([^"']+)["']\s*\)/);
    expect(m, `${file} is a *Scene.ts file without a super("Key") constructor call`).not.toBeNull();
    if (!m) continue;
    const key = m[1];
    expect(
      keyToFile.has(key),
      `duplicate scene key "${key}" in ${keyToFile.get(key)} and ${file} — Phaser would silently overwrite it`,
    ).toBe(false);
    keyToFile.set(key, file);
  }
  return keyToFile;
}

describe("engine module import", () => {
  it("loads cleanly in a canvas-capable env; documents the jsdom canvas fallback otherwise", async () => {
    // Prefer the REAL import: it exercises module-load auto-discovery + (when
    // createGame runs) the boot guards. In this jsdom environment Phaser aborts
    // at canvas device detection, so assert that is the ONLY thing blocking the
    // import — never a scene-key or catalog error (those run in createGame and
    // are asserted by the static scan below).
    const mod = await import("../src/game/engine").catch((e: unknown) => e);
    if (mod instanceof Error) {
      expect(mod.message).toMatch(/fillStyle|getContext|canvas|CanvasFeatures/i);
    } else {
      // Real import worked → module-level auto-discovery ran without throwing.
      expect(typeof mod.createGame).toBe("function");
    }
  });
});

describe("engine boot guards — static source scan (documented jsdom fallback)", () => {
  let keyToFile: Map<string, string>;

  beforeEach(() => {
    keyToFile = extractSceneKeys();
  });

  it("finds a meaningful set of scene files", () => {
    expect(keyToFile.size).toBeGreaterThan(100);
  });

  it("every *Scene.ts declares a unique super('Key') — no silent Phaser overwrite", () => {
    // extractSceneKeys() already throws on a duplicate; this asserts the map is
    // 1:1 (size === distinct keys) as the explicit invariant.
    expect(new Set(keyToFile.keys()).size).toBe(keyToFile.size);
  });

  it("every GAME_SCENES value is reachable from a *Scene.ts file (catalog gap guard)", () => {
    const keys = new Set(keyToFile.keys());
    for (const [gameId, sceneKey] of Object.entries(GAME_SCENES)) {
      expect(
        keys.has(sceneKey),
        `GAME_SCENES["${gameId}"] → "${sceneKey}" is not declared in any *Scene.ts file`,
      ).toBe(true);
    }
  });

  it("every ACTIVITIES mini-game scene is reachable from a *Scene.ts file (pet-activity gap guard)", () => {
    const keys = new Set(keyToFile.keys());
    for (const act of ACTIVITIES) {
      if (act.scene) {
        expect(
          keys.has(act.scene),
          `ACTIVITIES["${act.id}"] → "${act.scene}" is not declared in any *Scene.ts file`,
        ).toBe(true);
      }
    }
  });

  it("the ONLY scene keys outside GAME_SCENES ∪ ACTIVITIES are the home/garden surfaces", () => {
    // Engine contract: skill/pet catalog entries are auto-discovered and must
    // match; Nova (NovaScene) + Garden (ExploreGardenScene) are the two home
    // play surfaces launched by gameHost, not catalog entries — so exactly these
    // two are allowed outside the catalogs. A new unlisted scene key is flagged.
    const keys = new Set(keyToFile.keys());
    const catalog = new Set<string>([
      ...Object.values(GAME_SCENES),
      ...ACTIVITIES.map((a) => a.scene).filter((s): s is string => Boolean(s)),
    ]);
    const extras = [...keys].filter((k) => !catalog.has(k)).sort();
    expect(extras).toEqual(["Garden", "Nova"]);
  });
});

describe("createGame(parent)", () => {
  it("cannot be booted headlessly in jsdom — documented limitation (see file header)", () => {
    // createGame() constructs `new Phaser.Game({ type: Phaser.AUTO, parent, ... })`,
    // which needs a real canvas 2D/WebGL device context. jsdom's
    // HTMLCanvasElement.getContext() returns null without the optional `canvas`
    // native module, so a headless Phaser boot is impossible here. The data-level
    // guarantees createGame() asserts (unique keys + catalog coverage) are verified
    // by the static scan tests in the sibling describe block above.
    expect(readdirSync(GAME_DIR).length).toBeGreaterThan(0);
  });
});
