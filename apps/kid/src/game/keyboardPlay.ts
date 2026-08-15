import Phaser from "phaser";
import { getAppLang } from "./locale";
import { t } from "./i18n";

/**
 * #785/#1005 — keyboard + screen-reader bridge for the Phaser answer buttons.
 *
 * The game canvas is pointer-first, but every shared answer-button factory tags
 * its buttons with `nv-btn` (and `nv-label`), so this single layer can find the
 * current round's choices in the active scene and expose them to the keyboard:
 *   · Arrow keys / Tab / Home / End move a gold focus ring across the choices;
 *   · Enter / Space fire the focused choice exactly like a tap;
 *   · a visually-hidden live region announces the option list + each focused
 *     option so a screen-reader user hears what the canvas shows.
 *
 * Nothing changes in the scene files themselves — it rides the same display
 * list the swipe-to-answer gesture layer already uses.
 */

const BN_D = "০১২৩৪৫৬৭৮৯";
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

let focusIndex = -1;
let focused: Phaser.GameObjects.Container | null = null;
let focusRing: Phaser.GameObjects.Graphics | null = null;

/** Live, visible answer buttons for the current scene (same marker as gestures). */
function liveButtons(scene: Phaser.Scene): Phaser.GameObjects.Container[] {
  const out: Phaser.GameObjects.Container[] = [];
  for (const c of scene.children.list) {
    if (!(c instanceof Phaser.GameObjects.Container)) continue;
    if (!c.active || c.input === null || !c.input.enabled) continue;
    if (c.getData("nv-btn") === undefined) continue;
    let node: Phaser.GameObjects.Container | null = c;
    let shown = true;
    while (node) {
      if (!node.visible) {
        shown = false;
        break;
      }
      node = node.parentContainer as Phaser.GameObjects.Container | null;
    }
    if (shown) out.push(c);
  }
  return out;
}

/** Best-effort human-readable label for a button (set by the factories). */
function buttonLabel(c: Phaser.GameObjects.Container): string {
  const stored = c.getData("nv-label") as string | undefined;
  if (stored && stored.trim()) return stored.trim();
  const texts: string[] = [];
  const walk = (go: Phaser.GameObjects.GameObject) => {
    if (go instanceof Phaser.GameObjects.Text) {
      const text = go.text.trim();
      if (text) texts.push(text);
      return;
    }
    if (go instanceof Phaser.GameObjects.Container) go.list.forEach(walk);
  };
  c.list.forEach(walk);
  return texts.join(" ");
}

function activeAnswerScene(game: Phaser.Game): Phaser.Scene | null {
  const scenes = game.scene.getScenes(true);
  return scenes.length ? scenes[scenes.length - 1] : null;
}

function drawFocus(scene: Phaser.Scene, c: Phaser.GameObjects.Container | null): void {
  if (!focusRing || !focusRing.active || focusRing.scene !== scene) {
    if (focusRing && focusRing.active) focusRing.destroy();
    focusRing = scene.add.graphics().setDepth(9999);
  }
  focusRing.clear();
  if (!c) return;
  const b = c.getBounds();
  focusRing.lineStyle(5, 0xffd166, 1);
  focusRing.strokeRoundedRect(b.x - 4, b.y - 4, b.width + 8, b.height + 8, 16);
}

function clearFocus(): void {
  focused = null;
  focusIndex = -1;
  if (focusRing && focusRing.active) focusRing.clear();
}

/**
 * Install the global keyboard bridge once per game. Safe to call from
 * createGame(): it only attaches a window listener + a live region, and the
 * listener no-ops unless the event came from the game's own mount.
 */
export function installGameKeyboardAccess(game: Phaser.Game): void {
  let liveRegion: HTMLDivElement | null = null;
  let parentEl: HTMLElement | null = null;

  const ensureLiveRegion = (): HTMLDivElement | null => {
    if (liveRegion && liveRegion.isConnected) return liveRegion;
    const parent = game.canvas?.parentElement;
    if (!parent) return null;
    liveRegion = document.createElement("div");
    liveRegion.className = "sr-only";
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("role", "status");
    parent.appendChild(liveRegion);
    return liveRegion;
  };

  const announce = (text: string) => {
    const el = ensureLiveRegion();
    if (el) el.textContent = text;
  };

  const announceOptions = (scene: Phaser.Scene) => {
    const buttons = liveButtons(scene);
    if (!buttons.length) return;
    const list = buttons.map(buttonLabel).filter(Boolean).join(", ");
    announce(t("a11yOptions", { count: digit(buttons.length), list }));
  };

  const announceOption = (idx: number, total: number, label: string) => {
    announce(t("a11yOption", { n: digit(idx + 1), total: digit(total), label }));
  };

  const onParentFocus = () => {
    const scene = activeAnswerScene(game);
    if (!scene) return;
    clearFocus();
    announceOptions(scene);
  };
  const onParentBlur = () => clearFocus();

  // Phaser creates the canvas during boot, so attach the focus/blur listeners
  // lazily once the mount element is available.
  const attachParentListeners = () => {
    if (parentEl) return;
    const parent = game.canvas?.parentElement;
    if (!parent) return;
    parentEl = parent;
    parentEl.addEventListener("focus", onParentFocus);
    parentEl.addEventListener("blur", onParentBlur);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const canvas = game.canvas;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    attachParentListeners();
    const target = e.target as HTMLElement | null;
    if (!target || (target !== canvas && target !== parent && !parent.contains(target))) return;

    const scene = activeAnswerScene(game);
    if (!scene) return;
    const buttons = liveButtons(scene);
    if (!buttons.length) {
      clearFocus();
      return;
    }

    const move = (nextIdx: number) => {
      const idx = ((nextIdx % buttons.length) + buttons.length) % buttons.length;
      focusIndex = idx;
      focused = buttons[idx];
      drawFocus(scene, focused);
      announceOption(idx, buttons.length, buttonLabel(focused));
    };

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(focusIndex < 0 ? 0 : focusIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(focusIndex <= 0 ? buttons.length - 1 : focusIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(buttons.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusIndex >= 0 && focused && focused.active) focused.emit("pointerdown");
        else move(0);
        break;
      default:
        break;
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  game.events.once("ready", attachParentListeners);
  attachParentListeners();

  game.events.once("destroy", () => {
    window.removeEventListener("keydown", onKeyDown, true);
    parentEl?.removeEventListener("focus", onParentFocus);
    parentEl?.removeEventListener("blur", onParentBlur);
    liveRegion?.remove();
    liveRegion = null;
    parentEl = null;
    clearFocus();
  });
}
