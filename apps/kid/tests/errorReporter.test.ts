import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  judgeStuckSync,
  LABEL_COOLDOWN_MS,
  redactContext,
  redactText,
  reportBoundaryError,
  resetErrorReporter,
  SYNC_STUCK_TICKS,
} from "../src/lib/errorReporter";

describe("errorReporter — client-side redaction", () => {
  it("redacts emails, phones, IPs and long digit runs", () => {
    const out = redactText("write kid@school.com or 01712345678 from 192.168.0.1 imei 123456789012345");
    expect(out).not.toContain("kid@school.com");
    expect(out).not.toContain("01712345678");
    expect(out).not.toContain("192.168.0.1");
    expect(out).not.toContain("123456789012345");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts credential-bearing URLs and bearer headers", () => {
    const conn = redactText("postgres://user:secretpw@host/db");
    expect(conn).toContain("[REDACTED]");
    expect(conn).not.toContain("secretpw");
    const auth = redactText("Authorization: Bearer abc.def.ghi");
    expect(auth).not.toContain("abc.def.ghi");
    expect(auth).toContain("[REDACTED]");
  });

  it("walks nested context and scrubs every string leaf", () => {
    const ctx = redactContext({ a: "hi kid@school.com", b: ["01712345678"], c: { d: "192.168.0.1" } });
    expect(ctx).toEqual({
      a: "hi [REDACTED]",
      b: ["[REDACTED]"],
      c: { d: "[REDACTED]" },
    });
  });

  it("caps deep nesting so a hostile envelope can't recurse forever", () => {
    let deep: Record<string, unknown> = { leaf: "kid@school.com" };
    for (let i = 0; i < 20; i++) deep = { next: deep };
    const out = redactContext(deep);
    const json = JSON.stringify(out);
    expect(json).not.toContain("kid@school.com");
    expect(json).toContain("[TRUNCATED]");
  });
});

describe("errorReporter — sustained outbox-failure judgement", () => {
  it("fires only after SYNC_STUCK_TICKS consecutive stuck ticks", () => {
    let state = { stuckTicks: 0, reported: false };
    for (let i = 0; i < SYNC_STUCK_TICKS - 1; i++) {
      const j = judgeStuckSync({ lastSuccessAt: null, pendingCount: 5, lastError: "error" }, state);
      state = j.state;
      expect(j.fire).toBe(false);
    }
    const fired = judgeStuckSync({ lastSuccessAt: null, pendingCount: 5, lastError: "error" }, state);
    expect(fired.fire).toBe(true);
    expect(fired.state.stuckTicks).toBe(SYNC_STUCK_TICKS);
  });

  it("fires once per episode, then stays quiet until a success resets", () => {
    let state = { stuckTicks: 0, reported: false };
    let fires = 0;
    for (let i = 0; i < 10; i++) {
      const j = judgeStuckSync({ lastSuccessAt: null, pendingCount: 5, lastError: "error" }, state);
      state = j.state;
      if (j.fire) fires += 1;
    }
    expect(fires).toBe(1);
    // a success clears the error → new episode allowed
    const success = judgeStuckSync({ lastSuccessAt: 1, pendingCount: 0, lastError: null }, state);
    expect(success.fire).toBe(false);
    expect(success.state.stuckTicks).toBe(0);
    let s2 = success.state;
    for (let i = 0; i < SYNC_STUCK_TICKS; i++) {
      const j = judgeStuckSync({ lastSuccessAt: 1, pendingCount: 3, lastError: "offline" }, s2);
      s2 = j.state;
      if (j.fire) fires += 1;
    }
    expect(fires).toBe(2);
  });
});

describe("errorReporter — boundary report + throttle", () => {
  beforeEach(() => resetErrorReporter());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("POSTs a scrubbed, versioned payload and throttles per label", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal("fetch", fetchMock);

    reportBoundaryError("boot", new Error("boom user@school.com"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/api\/v1\/errors$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as { message: string; version: string; kind: string };
    expect(body.kind).toBe("boundary");
    expect(body.version).toBe("1.5.0");
    expect(body.message).toContain("[REDACTED]");
    expect(body.message).not.toContain("user@school.com");

    // immediate second report for the same label is throttled
    reportBoundaryError("boot", new Error("again"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // after the cooldown, a new report goes through
    const later = Date.now() + LABEL_COOLDOWN_MS + 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    reportBoundaryError("boot", new Error("again"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
