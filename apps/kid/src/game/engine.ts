/**
 * The Phaser ENGINE + every game scene — a DYNAMIC chunk (issue #15).
 *
 * Imported only from gameHost.boot() the first time a canvas screen appears
 * (playing / nova / garden), so the MAIN bundle carries zero Phaser bytes:
 * ~2MB → ~500KB first paint, with the engine fetched as a parallel chunk that
 * workbox precaches (offline stays warm).
 *
 * createGame() is the config that used to live in App.tsx's boot effect,
 * moved verbatim so the game boots identically.
 */
import Phaser from "phaser";
import { ensureAssets } from "./svgAssets";
import { NV_NAVY } from "./ui";  // tokenized #591
import { installGameKeyboardAccess } from "./keyboardPlay"; // #785/#1005
import { GAME_SCENES } from "@numberverse/core";
import { ACTIVITIES } from "./activities";

type SceneClass = new () => Phaser.Scene;

/**
 * #936 — auto-discover every `*Scene.ts` module instead of hand-maintaining a
 * parallel import + scene list. `import.meta.glob` is a build-time Vite API: it
 * matches the filesystem when this dynamic chunk is built, so a scene file that
 * is added (or removed) is automatically reachable — the imports and the Phaser
 * scene list can no longer drift out of sync.
 */
const sceneModules = import.meta.glob<Record<string, unknown>>("./*Scene.ts", { eager: true });

function isSceneClass(value: unknown): value is SceneClass {
  return typeof value === "function" && value.prototype instanceof Phaser.Scene;
}

const discoveredScenes: SceneClass[] = [];
for (const mod of Object.values(sceneModules)) {
  for (const value of Object.values(mod)) {
    if (isSceneClass(value)) discoveredScenes.push(value);
  }
}

/**
 * #939 — scene-key collision guard. Phaser's SceneManager silently overwrites a
 * duplicate `super(key)`, so a copy/pasted key would make one game run the wrong
 * scene (or never start) with no error. Every scene constructor is a bare
 * `super("Key")`, so reading each key from a throwaway instance is cheap and
 * side-effect free. Fail loudly before the game is created.
 */
function assertUniqueSceneKeys(scenes: SceneClass[]): void {
  const seen = new Map<string, SceneClass>();
  for (const SceneCtor of scenes) {
    const key = new SceneCtor().sys.settings.key;
    const other = seen.get(key);
    if (other) {
      throw new Error(`[game] duplicate scene key "${key}" in ${other.name} and ${SceneCtor.name}`);
    }
    seen.set(key, SceneCtor);
  }
}

/** #788 — every catalog gameId / pet activity scene must actually be reachable
 *  by the auto-discovered registry (a scene file that vanished or was renamed
 *  would otherwise silently fail at boot). Warn loudly before the game starts. */
function assertCatalogCovered(scenes: SceneClass[]): void {
  const keys = new Set(scenes.map((s) => new s().sys.settings.key));
  for (const key of [...Object.values(GAME_SCENES), ...ACTIVITIES.filter((a) => a.scene).map((a) => a.scene as string)]) {
    if (!keys.has(key)) {
      console.warn(`[engine] catalog scene "${key}" is not reachable from *Scene.ts`);
    }
  }
}

/**
 * No-op boot scene. Phaser auto-starts the FIRST scene in the `scene:` array on
 * boot WITHOUT any data. If that first scene is a real game (e.g. CountPop), it
 * runs standalone with an undefined onRoundDone and never reports back to React.
 * Putting a blank scene first means every real game is started explicitly via
 * `game.scene.start(key, {startLevelIndex, mode, onRoundDone})`.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  create() {
    // Kick off the SVG → canvas texture loads the moment the game boots, so
    // lessons are already using crisp vector art (no first-round emoji flash).
    ensureAssets(this);
  }
}

/** #936 — the single source of truth: Boot first, then every discovered scene. */
const SCENES: SceneClass[] = [BootScene, ...discoveredScenes];

/** Create + boot the Phaser game. Mirrors the config previously in App.tsx. */
export function createGame(parent: HTMLElement): Phaser.Game {
  assertUniqueSceneKeys(SCENES);
  assertCatalogCovered(SCENES);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: NV_NAVY,
    scene: SCENES,
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    input: { activePointers: 3 },
  });
  installGameKeyboardAccess(game); // #785/#1005 — keyboard + SR answer bridge
  return game;
}
