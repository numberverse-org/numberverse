import { describe, it, expect } from "vitest";
import {
  deriveDeviceSecret,
  DEVICE_DERIVE_ITERATIONS,
} from "../src/lib/pinHash";

// Node 20+ exposes globalThis.crypto.subtle, so the Pbkdf2 branch is normally
// exercised here. In a non-secure context the module deliberately falls back
// to the raw seed — guard the shape assertions on what the environment gives us.
const SUBTLE = typeof crypto !== "undefined" && !!crypto?.subtle;

describe("#1775 device credential derivation", () => {
  it("is deterministic: same seed + deviceId → same credential", async () => {
    const a = await deriveDeviceSecret("seed-abc", "device-111");
    const b = await deriveDeviceSecret("seed-abc", "device-111");
    expect(b).toBe(a);
  });

  it("is device-bound: different deviceId → different credential", async () => {
    const a = await deriveDeviceSecret("seed-abc", "device-111");
    const b = await deriveDeviceSecret("seed-abc", "device-222");
    expect(b).not.toBe(a);
  });

  it("is seed-sensitive: different seed → different credential", async () => {
    const a = await deriveDeviceSecret("seed-abc", "device-111");
    const b = await deriveDeviceSecret("seed-xyz", "device-111");
    expect(b).not.toBe(a);
  });

  it("never returns the raw seed itself on a secure context", async () => {
    const out = await deriveDeviceSecret("seed-abc", "device-111");
    if (SUBTLE) {
      expect(out).not.toBe("seed-abc");
    }
  });

  it("output is a 64-char lowercase hex string (256 bits)", async () => {
    const out = await deriveDeviceSecret("seed-abc", "device-111");
    if (SUBTLE) {
      expect(out).toMatch(/^[0-9a-f]{64}$/);
    } else {
      // Fallback branch (non-secure context): the raw seed is returned so the
      // on-LAN kid flow keeps working.
      expect(out).toBe("seed-abc");
    }
  });

  it("uses the same high iteration count as the PIN gate", () => {
    expect(DEVICE_DERIVE_ITERATIONS).toBe(150_000);
  });
});
