import { describe, it, expect } from "vitest";
import { sanitizeDisplayName } from "../src/sanitize";

// ---------------------------------------------------------------------------
// base cleanup — control chars / RTL overrides / whitespace / length cap
// ---------------------------------------------------------------------------

describe("sanitizeDisplayName — base cleanup", () => {
  it("strips C0 control chars", () => {
    expect(sanitizeDisplayName("A\u0000B\u001FC")).toBe("ABC");
  });
  it("strips C1 control chars", () => {
    expect(sanitizeDisplayName("A\u0085B\u009FC")).toBe("ABC");
  });
  it("strips newlines, line + paragraph separators", () => {
    expect(sanitizeDisplayName("A\nB\rC\u2028D\u2029E")).toBe("ABCDE");
  });
  it("strips RTL overrides / LRM / RLM / isolates", () => {
    expect(sanitizeDisplayName("A\u202EB\u202EC")).toBe("ABC");
    expect(sanitizeDisplayName("A\u200EB\u200FC")).toBe("ABC");
    expect(sanitizeDisplayName("A\u2066B\u2069C")).toBe("ABC");
  });
  it("collapses whitespace and trims", () => {
    expect(sanitizeDisplayName("  Nova   the  Cat  ")).toBe("Nova the Cat");
  });
  it("caps length at 60 by default", () => {
    expect(sanitizeDisplayName("a".repeat(100)).length).toBe(60);
  });
  it("respects maxLen", () => {
    expect(sanitizeDisplayName("abcdef", { maxLen: 3 })).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// forDownload — path separators + leading dots (filename safety)
// ---------------------------------------------------------------------------

describe("sanitizeDisplayName — forDownload", () => {
  it("strips path separators", () => {
    expect(sanitizeDisplayName("../../etc/passwd", { forDownload: true })).toBe("etc passwd");
    expect(sanitizeDisplayName("a\\b\\c", { forDownload: true })).toBe("a b c");
  });
  it("strips leading dots (dotfile / parent-dir escape)", () => {
    expect(sanitizeDisplayName("..hidden", { forDownload: true })).toBe("hidden");
    expect(sanitizeDisplayName("...", { forDownload: true })).toBe("");
  });
  it("keeps a normal name intact", () => {
    expect(sanitizeDisplayName("Moni", { forDownload: true })).toBe("Moni");
  });
});

// ---------------------------------------------------------------------------
// forSpeech — same base cleanup, explicit flag for call-site intent
// ---------------------------------------------------------------------------

describe("sanitizeDisplayName — forSpeech", () => {
  it("strips control + RTL and collapses whitespace", () => {
    expect(sanitizeDisplayName("A\u202EB\nC", { forSpeech: true })).toBe("ABC");
  });
  it("keeps a normal name intact", () => {
    expect(sanitizeDisplayName("Tara", { forSpeech: true })).toBe("Tara");
  });
});

