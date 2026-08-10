import Phaser from "phaser";

/**
 * ─────────────────────────────────────────────────────────────────────
 *  KID-FRIENDLY GESTURE LAYER
 *
 *  Small kids (2–6) can't reliably tap tiny targets, so we layer the two
 *  gestures toddlers naturally use on top of the existing tap:
 *
 *    1. SWIPE-TO-ANSWER — swipe toward the answer you want. Works in EVERY
 *       game automatically: all answer buttons are built by the shared
 *       factories in ui.ts and carry the "nv-btn" marker, so the swipe
 *       layer finds them by scanning the scene's display list.
 *    2. DRAG-TO-POP     — sweep your finger across targets to pop them
 *       (Count & Pop bubbles: a toddler sweeps and the bubbles burst).
 *    3. DRAG-TO-DROP    — drag a thing onto its target (Animal Homes:
 *       drag the animal to Water / Land / Sky).
 *
 *  WHY SWIPE IS SAFE: Phaser only fires an object's `pointerdown` for the
 *  object under the INITIAL press — a swipe that starts on empty canvas
 *  never triggers a stray tap while crossing buttons. And a press that
 *  STARTS on a button is exactly a tap, so it's left alone (never
 *  double-fired).
 * ─────────────────────────────────────────────────────────────────────
 */

const SWIPE_THRESHOLD = 60; // px of travel before it counts as a swipe
const SWIPE_MAX_MS = 700;   // a deliberate flick, not a long slow drag
const SWIPE_MIN_DOT = 0.15; // how strongly a button must match the swipe direction

/** Live, tappable answer buttons on the scene (tracked from the display list). */
function liveButtons(scene: Phaser.Scene): Phaser.GameObjects.Container[] {
  return scene.children.list.filter(
    (c): c is Phaser.GameObjects.Container =>
      c instanceof Phaser.GameObjects.Container &&
      c.active &&
      c.input !== null &&
      c.input.enabled &&
      c.getData("nv-btn") !== undefined
  );
}

function buttonHitRadius(c: Phaser.GameObjects.Container): number {
  const b = c.getBounds();
  return Math.max(b.width, b.height) / 2 + 6;
}

/** Was the press's start point already on an answer button? → it was a TAP. */
function pressHitButton(scene: Phaser.Scene, x: number, y: number): boolean {
  return liveButtons(scene).some(
    (c) => Phaser.Math.Distance.Between(x, y, c.x, c.y) <= buttonHitRadius(c)
  );
}

/** The button whose direction from `start` best matches the swipe vector. */
function bestAlignedButton(
  scene: Phaser.Scene,
  startX: number,
  startY: number,
  dx: number,
  dy: number
): Phaser.GameObjects.Container | null {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let best: Phaser.GameObjects.Container | null = null;
  let bestDot = SWIPE_MIN_DOT;
  for (const c of liveButtons(scene)) {
    const vx = c.x - startX;
    const vy = c.y - startY;
    const vl = Math.hypot(vx, vy) || 1;
    const dot = (vx * ux + vy * uy) / vl;
    if (dot > bestDot) {
      bestDot = dot;
      best = c;
    }
  }
  return best;
}

/** A bright gold swoosh-arrow that shows WHERE the swipe went. */
function drawSwipeArrow(scene: Phaser.Scene, sx: number, sy: number, ex: number, ey: number) {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const tail = Math.max(90, len - 46); // shaft starts a little before the tip
  const head = 22; // arrowhead size
  const g = scene.add.graphics().setDepth(9500);
  g.lineStyle(14, 0xffd166, 0.9);
  g.lineBetween(sx, sy, sx + ux * tail, sy + uy * tail);
  g.fillStyle(0xffd166, 1);
  g.beginPath();
  g.moveTo(sx + ux * (tail + head), sy + uy * (tail + head));
  g.lineTo(sx + ux * (tail - head * 0.55) - uy * head, sy + uy * (tail - head * 0.55) + ux * head);
  g.lineTo(sx + ux * (tail - head * 0.55) + uy * head, sy + uy * (tail - head * 0.55) - ux * head);
  g.closePath();
  g.fill();
  scene.tweens.add({
    targets: g,
    alpha: 0,
    duration: 380,
    ease: "Quad.easeOut",
    onComplete: () => g.destroy(),
  });
}

/**
 * Swipe-to-answer — auto-attached the first time an answer button is built,
 * so EVERY game gets it with zero per-scene wiring.
 *
 * Opt-outs:
 *  · scene.data "nv:noSwipe" — floating/target games where buttons move
 *    (Count & Pop bubbles) use drag-to-pop instead.
 *  · scene.data "nv:dragObj" — presses that START on a draggable object are
 *    that object's drag, not a swipe.
 */
export function enableSwipeToAnswer(scene: Phaser.Scene) {
  if (scene.data.get("nv:swipe")) return;
  scene.data.set("nv:swipe", true);

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let down = false;
  let pressOnDrag = false; // did this press begin ON a draggable object?

  scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
    if (!p.isDown) return;
    down = true;
    startX = p.x;
    startY = p.y;
    startTime = scene.time.now;
    const dragObj = scene.data.get("nv:dragObj") as Phaser.GameObjects.Container | undefined;
    pressOnDrag =
      !!dragObj && Phaser.Math.Distance.Between(startX, startY, dragObj.x, dragObj.y) <= buttonHitRadius(dragObj);
  });

  scene.input.on("pointerup", (p: Phaser.Input.Pointer) => {
    if (!down) return;
    down = false;
    if (scene.data.get("nv:noSwipe")) return; // scene opted out (floating bubbles)
    if (pressOnDrag) return; // press began on a draggable object → that's a drag, handled by dragend
    const dx = p.x - startX;
    const dy = p.y - startY;
    const dist = Math.hypot(dx, dy);
    const dt = scene.time.now - startTime;
    if (dist < SWIPE_THRESHOLD || dt > SWIPE_MAX_MS) return; // this was a tap
    if (pressHitButton(scene, startX, startY)) return; // press began on a button → tap already fired
    const pick = bestAlignedButton(scene, startX, startY, dx, dy);
    if (!pick) return;
    drawSwipeArrow(scene, startX, startY, p.x, p.y);
    // Fire the button: dip animation + the scene's own answer handler.
    pick.emit("pointerdown", p);
  });

  scene.input.on("pointercancel", () => {
    down = false;
  });
}

/**
 * Drag-to-pop — fire onSweep(x, y) while the finger is down and moving.
 * Let scenes decide what to pop (e.g. only the next-expected bubble).
 */
export function enableDragToPop(scene: Phaser.Scene, onSweep: (x: number, y: number) => void) {
  let down = false;
  let last = 0;
  scene.input.on("pointerdown", () => {
    down = true;
  });
  scene.input.on("pointerup", () => {
    down = false;
  });
  scene.input.on("pointercancel", () => {
    down = false;
  });
  scene.input.on("pointermove", (p: Phaser.Input.Pointer) => {
    if (!down) return;
    const now = scene.time.now;
    if (now - last < 55) return; // throttle: at most one pop per sweep tick
    last = now;
    onSweep(p.x, p.y);
  });
}

/**
 * Swipe-to-navigate — a horizontal swipe flips between "pages"/rooms.
 *
 * Nova's hub: swipe LEFT/RIGHT on the open canvas to change rooms. A swipe
 * that STARTS on a tappable object (Nova herself, the dock FABs, the room
 * chevrons, an open sheet's dim…) is left alone — that's a TAP. Only swipes
 * on open canvas flip the room. `opts.ignoreStart` lets the scene declare
 * more no-swipe zones (e.g. "a sheet is open").
 */
export function enableSwipeRooms(
  scene: Phaser.Scene,
  onDir: (dir: -1 | 1) => void,
  opts: { ignoreStart?: (x: number, y: number) => boolean } = {}
) {
  if (scene.data.get("nv:swipeRooms")) return;
  scene.data.set("nv:swipeRooms", true);
  // InputPlugin removes its listeners on scene shutdown; clear the flag too so
  // a same-game restart re-registers cleanly instead of silently no-oping.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.data.remove("nv:swipeRooms"));

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let down = false;

  /** Live, input-enabled, VISIBLE interactive objects — respect their real
   *  hit areas (a Container's setSize, etc.) and skip objects hidden inside
   *  an invisible container (closed sheets' full-screen dim). */
  const visibleInteractive = (): Phaser.GameObjects.GameObject[] => {
    const list: Phaser.GameObjects.GameObject[] = [];
    for (const c of scene.children.list) {
      if (!(c instanceof Phaser.GameObjects.Container)) continue;
      if (c.input === null || !c.input.enabled) continue;
      let node: Phaser.GameObjects.Container | null = c;
      let shown = true;
      while (node) {
        if (!node.visible) { shown = false; break; }
        node = node.parentContainer as Phaser.GameObjects.Container | null;
      }
      if (shown) list.push(c);
    }
    return list;
  };

  scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
    if (!p.isDown) return;
    down = true;
    startX = p.x;
    startY = p.y;
    startTime = scene.time.now;
  });

  scene.input.on("pointerup", (p: Phaser.Input.Pointer) => {
    if (!down) return;
    down = false;
    const dx = p.x - startX;
    const dy = p.y - startY;
    const dist = Math.hypot(dx, dy);
    const dt = scene.time.now - startTime;
    if (dist < SWIPE_THRESHOLD || dt > SWIPE_MAX_MS) return; // a tap, not a swipe
    if (Math.abs(dx) < Math.abs(dy)) return; // vertical — not a room flip
    if (opts.ignoreStart?.(startX, startY)) return; // scene says this press is not a swipe
    // started ON a tappable object? → that's a tap, already handled by the object
    if (visibleInteractive().some((c) => scene.input.manager.pointWithinHitArea(c, startX, startY))) return;
    drawSwipeArrow(scene, startX, startY, p.x, p.y);
    onDir(dx < 0 ? 1 : -1); // swipe LEFT → next, swipe RIGHT → previous
  });

  scene.input.on("pointercancel", () => {
    down = false;
  });
}

export interface DragToTargetOpts {
  /** Which objects count as drop targets right now. */
  getTargets: () => Phaser.GameObjects.Container[];
  /** Called with the target under the drop point (or null if none). */
  onDrop: (target: Phaser.GameObjects.Container | null) => void;
  /** Extra hit padding for the drop zone (default 14). */
  padding?: number;
}

/**
 * Make a container draggable onto one of several targets (classic toddler
 * drag-and-drop). Registers the object as "nv:dragObj" so the swipe layer
 * stands down while it's being dragged.
 */
export function makeDraggableTo(scene: Phaser.Scene, obj: Phaser.GameObjects.Container, opts: DragToTargetOpts) {
  obj.setInteractive({ useHandCursor: true });
  scene.input.setDraggable(obj);
  scene.data.set("nv:dragObj", obj);
  const padding = opts.padding ?? 14;

  scene.input.on("dragstart", (pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject) => {
    if (go !== obj) return;
    scene.tweens.add({ targets: obj, scale: 1.12, duration: 90, ease: "Back.easeOut" });
  });

  scene.input.on("drag", (pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
    if (go !== obj) return;
    obj.setPosition(dragX, dragY);
  });

  scene.input.on("dragend", (pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject) => {
    if (go !== obj) return;
    scene.tweens.add({ targets: obj, scale: 1, duration: 120, ease: "Back.easeOut" });
    let target: Phaser.GameObjects.Container | null = null;
    let best = Infinity;
    for (const t of opts.getTargets()) {
      if (!t.active || t.input === null || !t.input.enabled) continue;
      const d = Phaser.Math.Distance.Between(pointer.x, pointer.y, t.x, t.y);
      const r = Math.max(t.getBounds().width, t.getBounds().height) / 2 + padding;
      if (d <= r && d < best) {
        best = d;
        target = t;
      }
    }
    opts.onDrop(target);
  });
}
