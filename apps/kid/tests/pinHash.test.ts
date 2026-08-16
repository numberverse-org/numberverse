import { describe, it, expect } from "vitest";
import {
  hashParentSecret,
  verifyParentSecret,
  PIN_PBKDF2_ITERATIONS,
} from "../src/lib/pinHash";

// Replicates the module's legacy FNV-1a (pre-#819) so we can assert the
// legacy branch of verifyParentSecret still accepts existing installs.
function legacyFnv1a(value: string): string {
  const SALT = "numberverse-parent-pin-v1";
  let h = 0x811c9dc5;
  const s = `${SALT}:${value}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a$${(h >>> 0).toString(16).padStart(8, "0")}`;
}

describe("PIN_PBKDF2_ITERATIONS", () => {
  it("is a sane high iteration count (>= 100k)", () => {
    expect(PIN_PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
    expect(PIN_PBKDF2_ITERATIONS).toBe(150_000);
  });
});

describe("hashParentSecret", () => {
  it("returns a salted PBKDF2 string, not the raw PIN", async () => {
    const h = await hashParentSecret("1234");
    expect(h).not.toBe("1234");
    expect(h.startsWith("pbkdf2-sha256$")).toBe(true);
    const parts = h.split("$");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("pbkdf2-sha256");
    expect(parts[1]).toBe(String(PIN_PBKDF2_ITERATIONS));
    // salt: 16 bytes -> 32 hex chars; hash: 32 bytes -> 64 hex chars
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[3]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a different string for the same PIN each call (fresh salt), both verifying", async () => {
    const h1 = await hashParentSecret("1234");
    const h2 = await hashParentSecret("1234");
    expect(h1).not.toBe(h2);
    expect(await verifyParentSecret("1234", h1)).toBe(true);
    expect(await verifyParentSecret("1234", h2)).toBe(true);
  });

  it("round-trips an empty value (module hashes it like any secret)", async () => {
    const h = await hashParentSecret("");
    expect(h.startsWith("pbkdf2-sha256$")).toBe(true);
    expect(await verifyParentSecret("", h)).toBe(true);
  });
});

describe("verifyParentSecret", () => {
  it("returns true for the right value and false for the wrong value", async () => {
    const h = await hashParentSecret("1234");
    expect(await verifyParentSecret("1234", h)).toBe(true);
    expect(await verifyParentSecret("9999", h)).toBe(false);
  });

  it("returns false for a malformed stored value", async () => {
    expect(await verifyParentSecret("1234", "")).toBe(false);
    expect(await verifyParentSecret("1234", "garbage")).toBe(false);
    expect(await verifyParentSecret("1234", "pbkdf2-sha256$bad$shape")).toBe(false);
  });

  it("still accepts a legacy FNV-1a hash (pre-#819 installs)", async () => {
    const legacy = legacyFnv1a("1234");
    expect(legacy.startsWith("fnv1a$")).toBe(true);
    expect(await verifyParentSecret("1234", legacy)).toBe(true);
    expect(await verifyParentSecret("0000", legacy)).toBe(false);
  });
});
