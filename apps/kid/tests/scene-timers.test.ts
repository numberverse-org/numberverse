/**
 * scene-timers.test.ts — "scene timers must die with the scene"
 * (#1739 #1740 #1742 #1743).
 *
 * Phaser's Clock normally destroys TimerEvents on scene shutdown, but a scene
 * can be stopped/restarted while a repeating timer or a round-restart
 * delayedCall is still pending; re-entry then stacks duplicate ticks, or the
 * callback fires into a hibernated scene and re-launches it after the kid left.
 * This wave wires an explicit SHUTDOWN + DESTROY teardown into every scene that
 * owns a repeating timer or a round/finish/spawn delayedCall.
 *
 * This test is a DATA / STRUCTURAL scan (same layer as scenes.test.ts — the
 * Phaser canvas engine can't boot in a unit runner, so we assert the shipped
 * file contract). Invariants:
 *   1. Every owned scene registers SHUTDOWN + DESTROY teardown handlers.
 *   2. Every owned scene has a `private shutdown()` method.
 *   3. Every `this.time.delayedCall(...)` / `this.time.addEvent(...)` in an
 *      owned scene is captured into a `this.<field>` handle (never fire-and-
 *      forget), and every captured handle is removed in that scene's shutdown().
 *   4. Every delayedCall callback that schedules a round restart / finish /
 *      spawn is guarded with `this.scene.isActive()`, so even a missed removal
 *      cannot fire into a stopped scene.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* ───────────────────────── helpers ───────────────────────── */
const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "game");
const read = (f: string): string => readFileSync(join(GAME_DIR, f), "utf8");

/** Files owned by this wave — every scene with a repeating timer or a
 *  round-restart / finish / spawn delayedCall. */
const OWNED = [
  "PatienceScene.ts",   // #1739 progressTimer (loop) + distraction + round-delay
  "PetDanceScene.ts",   // #1740 beatTimer (repeat:-1) + party-reset delayedCall
  "PetFeedScene.ts",    // #1740 spawnTimer + #1742 round-delay
  "CatchFruitScene.ts", // #1742 round-delay
  "CountPopScene.ts",   // #1742 round-delay
  "BubblePopScene.ts",  // #1742 spawn/finish/round delayedCalls
  "Build999Scene.ts",   // #1742 bundle-toast + round-delay
  "Count100Scene.ts",   // #1742 bundle-toast + round-delay
  "TreatSortScene.ts",  // #1743 finish-delay + scene.restart delayedCall
] as const;

/** Extract the body of `private name() { ... }` (balanced braces, braces included). */
function methodBody(src: string, name: string): string {
  const re = new RegExp(`private ${name}\\(\\)\\s*\\{`);
  const m = re.exec(src);
  if (!m) return "";
  let i = m.index + m[0].length - 1; // index of the opening '{'
  let depth = 0;
  const out: string[] = [];
  while (i < src.length) {
    const ch = src[i];
    out.push(ch);
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  return out.join("");
}

/** Extract the body of a `() => { ... }` callback starting at the `{`. */
function bodyFromBrace(src: string, braceIndex: number): string {
  let depth = 0;
  const out: string[] = [];
  let i = braceIndex;
  while (i < src.length) {
    const ch = src[i];
    out.push(ch);
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  return out.join("");
}

/** Captured timer handles: `this.<field> = this.time.delayedCall|addEvent(`. */
function capturedHandles(src: string): string[] {
  const handles = new Set<string>();
  const re = /this\.([A-Za-z0-9_]+)\s*=\s*this\.time\.(?:delayedCall|addEvent)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) handles.add(m[1]);
  return [...handles];
}

/* ───────────────────────── 1. teardown wiring ───────────────────────── */
describe("scene timers die with the scene (#1739 #1740 #1742 #1743)", () => {
  for (const file of OWNED) {
    const src = read(file);

    it(`${file} registers SHUTDOWN + DESTROY teardown handlers`, () => {
      expect(src, `${file} must register a SHUTDOWN teardown`).toContain(
        "this.events.once(Phaser.Scenes.Events.SHUTDOWN"
      );
      expect(src, `${file} must register a DESTROY teardown`).toContain(
        "this.events.once(Phaser.Scenes.Events.DESTROY"
      );
    });

    it(`${file} has a shutdown() that removes every captured timer handle`, () => {
      const shutdown = methodBody(src, "shutdown");
      expect(shutdown, `${file} is missing a private shutdown() body`).toContain(
        "this.time.removeEvent(this."
      );
      const handles = capturedHandles(src);
      expect(handles.length, `${file} should capture at least one timer handle`).toBeGreaterThan(0);
      for (const h of handles) {
        expect(
          shutdown.includes(`this.time.removeEvent(this.${h})`),
          `${file} shutdown() must remove captured handle this.${h}`
        ).toBe(true);
      }
    });

    it(`${file} has no un-captured this.time.delayedCall/addEvent`, () => {
      const raw = [...src.matchAll(/this\.time\.(?:delayedCall|addEvent)\(/g)];
      const assigned = [
        ...src.matchAll(/this\.[A-Za-z0-9_]+\s*=\s*this\.time\.(?:delayedCall|addEvent)\(/g),
      ];
      expect(
        assigned.length,
        `${file} has a fire-and-forget timer (every delayedCall/addEvent must be captured)`
      ).toBe(raw.length);
    });
  }
});

/* ───────────────────────── 2. callback guards ───────────────────────── */
describe("round/finish/spawn delayedCall callbacks are guarded", () => {
  it("every delayedCall that schedules a round/finish/spawn/restart checks scene.isActive()", () => {
    const bad: string[] = [];
    for (const file of OWNED) {
      const src = read(file);
      const re = /this\.([A-Za-z0-9_]+)\s*=\s*this\.time\.delayedCall\(\s*[^,()]+\s*,\s*\(\)\s*=>\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const body = bodyFromBrace(src, m.index + m[0].length - 1);
        const relaunches =
          body.includes("this.startRound()") ||
          body.includes("this.finishRound()") ||
          body.includes("this.spawnBubble()") ||
          body.includes("this.scene.restart(");
        if (relaunches && !body.includes("this.scene.isActive()")) {
          bad.push(`${file}: this.${m[1]} delayedCall callback is not guarded`);
        }
      }
    }
    expect(bad, "every relaunch delayedCall must guard with scene.isActive()").toEqual([]);
  });
});
