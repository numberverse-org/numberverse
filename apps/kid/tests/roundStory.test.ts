import { describe, it, expect } from "vitest";
import { buildRoundMistake, buildRoundStory, buildRoundPending } from "../src/lib/roundStory";
import type { MoniDiagnosis } from "@numberverse/core";
import type { RoundResult, KothaStory, SyncEvent, MistakeState } from "../src/store";

const KID = "kid-A";
const SKILL = "add-3-to-1";
const GAME = "orbit-1";
const UID = "uid-1";
const NOW = 1_700_000_000_000;

function result(correct: boolean, difficulty = 1, responseMs = 2400): RoundResult {
  return { gameId: GAME, skillId: SKILL, correct, difficulty, responseMs };
}

function diag(kind: MoniDiagnosis["kind"], type: string): MoniDiagnosis {
  return {
    kind,
    confidence: 0.8,
    reason: "reason-text",
    action: { type: type as MoniDiagnosis["action"]["type"], message: "message-text", targetSkillId: SKILL },
  };
}

function baseMistake(): MistakeState {
  return { wrong: 5, open: 2, firstAt: 100, lastAt: 200, lastDifficulty: 1, byDay: {} };
}

describe("buildRoundMistake", () => {
  it("a wrong round bumps wrong/open and stamps lastAt + lastDifficulty", () => {
    const out = buildRoundMistake(baseMistake(), result(false, 3, 3000), NOW);
    expect(out.wrong).toBe(6);
    expect(out.open).toBe(3);
    expect(out.lastAt).toBe(NOW);
    expect(out.lastDifficulty).toBe(3);
    expect(out.firstAt).toBe(100);
  });

  it("a correct round clears open and leaves wrong untouched", () => {
    const out = buildRoundMistake(baseMistake(), result(true), NOW);
    expect(out.open).toBe(0);
    expect(out.wrong).toBe(5);
    expect(out.lastAt).toBe(200); // not stamped on correct
  });

  it("normalizes a legacy entry missing byDay to an empty record", () => {
    const legacy = { wrong: 1, open: 0, firstAt: 1, lastAt: 1, lastDifficulty: 1 } as MistakeState;
    const out = buildRoundMistake(legacy, result(true), NOW);
    expect(out.byDay).toEqual({});
  });
});

describe("buildRoundStory", () => {
  const mis = { skillId: SKILL, code: "off-by-ten", label: "Off by ten", firstSeen: NOW, lastSeen: NOW, occurrences: 2 };

  it("a wrong round embeds the misconception code + round facts", () => {
    const out = buildRoundStory(UID, KID, result(false, 3, 2600), NOW, diag("gap", "reteach"), mis, 2, [], 10);
    expect(out).toHaveLength(1);
    const s = out[0];
    expect(s.uid).toBe(UID);
    expect(s.kidId).toBe(KID);
    expect(s.skillId).toBe(SKILL);
    expect(s.gameId).toBe(GAME);
    expect(s.outcome).toBe(false);
    expect(s.errorKind).toBe("gap");
    expect(s.misconceptionCode).toBe("off-by-ten");
    expect(s.action).toBe("reteach");
    expect(s.difficulty).toBe(3);
    expect(s.responseMs).toBe(2600);
    expect(s.wrongStreak).toBe(2);
    expect(s.ts).toBe(NOW);
    expect(s.context).toEqual({ reason: "reason-text", message: "message-text" });
  });

  it("a correct round does not fabricate an error kind or misconception", () => {
    const out = buildRoundStory(UID, KID, result(true), NOW, diag("gap", "celebrate"), undefined, 0, [], 10);
    expect(out).toHaveLength(1);
    const s = out[0];
    expect(s.outcome).toBe(true);
    expect(s.errorKind).toBeNull();
    expect(s.misconceptionCode).toBeNull();
    expect(s.wrongStreak).toBe(0);
  });

  it("respects the offline ceiling — no append when full", () => {
    const full: KothaStory[] = new Array(2).fill({
      uid: "x", kidId: KID, skillId: SKILL, gameId: GAME, outcome: true,
      errorKind: null, misconceptionCode: null, action: "celebrate",
      difficulty: 1, responseMs: 100, wrongStreak: 0, context: {}, ts: NOW,
    });
    const out = buildRoundStory(UID, KID, result(false), NOW, diag("gap", "reteach"), mis, 1, full, 2);
    expect(out).toBe(full);
    expect(out).toHaveLength(2);
  });
});

describe("buildRoundPending", () => {
  function entry(correct: boolean): SyncEvent {
    return { uid: UID, kidId: KID, gameId: GAME, skillId: SKILL, correct, difficulty: 1, responseMs: 1800, ts: NOW };
  }

  it("appends the durable outbox entry under the cap", () => {
    const e = entry(true);
    const out = buildRoundPending([], e, 10);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(e);
    expect(out[0].uid).toBe(UID);
    expect(out[0].ts).toBe(NOW);
  });

  it("does not append past the cap", () => {
    const full: SyncEvent[] = [entry(false), entry(false)];
    const out = buildRoundPending(full, entry(true), 2);
    expect(out).toBe(full);
    expect(out).toHaveLength(2);
  });
});
