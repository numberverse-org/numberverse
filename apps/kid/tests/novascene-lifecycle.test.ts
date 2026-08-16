/**
 * novascene-lifecycle.test.ts — #1741 + #1747.
 *
 * Phaser's canvas engine can't boot in a unit runner, so like the other
 * scene-level coverage in this repo (scenes.test.ts) this closes the gap at
 * the STRUCTURAL layer: a deterministic file-text scan of NovaScene.ts that
 * pins the teardown + tween-stacking contracts:
 *
 *   1. teardown() stops EVERY idle timer (blink/head/wing/idle — not just
 *      swipeHintTimer) and flips the `alive` guard, because Phaser's scene
 *      shutdown does NOT clear the scene clock — the recursively re-scheduled
 *      idle timers would otherwise keep running on the destroyed scene.
 *   2. scheduleBlink/scheduleHead/scheduleWing are idempotent (remove the old
 *      handle before scheduling) and their recursive callbacks bail on a dead
 *      scene, so a teardown → re-enter cannot double-schedule and a straggler
 *      tick cannot touch destroyed game objects.
 *   3. resetIdleTimer removes any pending idle handle and the doze callback
 *      is guarded too.
 *   4. refresh() kills any in-flight wallet pulse BEFORE starting a new one and
 *      only touches a still-active wallet (#1747 — rapid coin/care updates used
 *      to stack overlapping scale tweens → wallet stutter/blink).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GAME = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "game");
const src = readFileSync(join(GAME, "NovaScene.ts"), "utf8");

/** Extract a private method's body: from `private <name>(` to the method's own
 *  closing brace at 2-space indent (nested braces are 4+ spaces). */
const method = (name: string): string => {
  const start = src.indexOf(`private ${name}(`);
  expect(start, `private ${name}( should exist`).toBeGreaterThan(-1);
  const end = src.indexOf("\n  }", start);
  expect(end, `private ${name}( should close`).toBeGreaterThan(start);
  return src.slice(start, end);
};

/* ─────────────────────────── 1. teardown completeness ─────────────────────────── */

describe("#1741 NovaScene teardown stops every idle timer", () => {
  const ts = src.indexOf("const teardown = () => {");
  const teardownEnd = src.indexOf("this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);");
  expect(ts).toBeGreaterThan(-1);
  expect(teardownEnd).toBeGreaterThan(ts);
  const teardown = src.slice(ts, teardownEnd);

  it("removes blinkTimer / headTimer / wingTimer / idleTimer and clears the handles", () => {
    for (const timer of ["blinkTimer", "headTimer", "wingTimer", "idleTimer"]) {
      expect(teardown, `${timer} must be removed in teardown`).toContain(`this.${timer}?.remove();`);
      expect(teardown, `${timer} must be cleared after removal`).toContain(`this.${timer} = undefined;`);
    }
  });

  it("keeps the existing swipeHintTimer removal", () => {
    expect(teardown).toContain("this.swipeHintTimer?.remove();");
    expect(teardown).toContain("this.swipeHintTimer = undefined;");
  });

  it("flips the alive guard off during teardown", () => {
    expect(teardown).toContain("this.alive = false;");
  });

  it("re-arms the alive guard on create (scene re-entry safe)", () => {
    expect(src).toContain("this.alive = true; // #1741");
  });
});

/* ─────────────────── 2. idempotent + guarded idle scheduling ─────────────────── */

describe("#1741 idle schedulers are idempotent and teardown-guarded", () => {
  it("scheduleBlink removes a previous handle and bails when dead", () => {
    const m = method("scheduleBlink");
    expect(m).toContain("this.blinkTimer?.remove();");
    expect(m).toContain("if (!this.alive) return;");
  });

  it("scheduleHead removes a previous handle and bails when dead", () => {
    const m = method("scheduleHead");
    expect(m).toContain("this.headTimer?.remove();");
    expect(m).toContain("if (!this.alive) return;");
  });

  it("scheduleWing removes a previous handle and bails when dead", () => {
    const m = method("scheduleWing");
    expect(m).toContain("this.wingTimer?.remove();");
    expect(m).toContain("if (!this.alive) return;");
  });

  it("resetIdleTimer removes a pending idle handle and guards the doze tick", () => {
    const m = method("resetIdleTimer");
    expect(m).toContain("if (this.idleTimer) this.idleTimer.remove();");
    expect(m).toContain("if (!this.alive) return;");
  });
});

/* ─────────────────── 3. wallet pulse does not stack (#1747) ─────────────────── */

describe("#1747 wallet pulse is kill-before-add and active-guarded", () => {
  const rs = src.indexOf("private refresh() {");
  const re = src.indexOf("private layout() {");
  expect(rs).toBeGreaterThan(-1);
  expect(re).toBeGreaterThan(rs);
  const refresh = src.slice(rs, re);

  it("kills in-flight wallet tweens BEFORE adding a new pulse", () => {
    const killIdx = refresh.indexOf("this.tweens.killTweensOf(this.wallet)");
    const addIdx = refresh.indexOf("this.tweens.add({ targets: this.wallet");
    expect(killIdx, "refresh() must kill wallet tweens first").toBeGreaterThan(-1);
    expect(addIdx, "refresh() must add the wallet pulse").toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(killIdx);
  });

  it("only pulses a wallet that still exists and is active", () => {
    expect(refresh).toMatch(/if \(this\.wallet && this\.wallet\.active\)/);
    expect(refresh).toMatch(/this\.tweens\.killTweensOf\(this\.wallet\);/);
  });
});
