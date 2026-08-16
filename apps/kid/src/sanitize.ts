/**
 * 🧼 Sanitize a kid-supplied display name for safe render / download / speech.
 *
 * The STORED name is never changed — this is render/use-time cleanup only, so a
 * sibling's name in the parent portal or a leaderboard stays exactly as the
 * parent typed it while every SINK (filename, utterance, DOM text) receives a
 * clean copy.
 *
 * Always:
 *   • strips C0/C1 control chars, line/paragraph separators, bidi/RTL
 *     overrides (U+202A-202E), LRM/RLM (U+200E/U+200F), isolate controls
 *     (U+2066-2069), zero-width chars, word-joiner and the BOM
 *   • collapses whitespace runs to a single space and trims
 *   • caps the result at `opts.maxLen` chars (default 60)
 *
 * `forDownload: true` additionally strips path separators (`/` `\`) and
 * leading/trailing dots so a name can never escape the downloads folder or
 * become a dotfile.
 *
 * `forSpeech: true` is the same base cleanup (control/RTL chars are the speech
 * threat); the flag exists to make the call site's intent explicit.
 */

export interface SanitizeDisplayNameOptions {
  maxLen?: number;
  forDownload?: boolean;
  forSpeech?: boolean;
}

// Control chars (C0 + DEL + C1), line/paragraph separators, LRM/RLM, bidi
// embeddings/overrides (U+202A-202E), isolates (U+2066-2069), zero-width chars,
// word joiner and the BOM — invisible-to-most-humans characters that can inject
// newlines, path tricks, or RTL spoofing into a kid-supplied string.
const CONTROL_AND_FORMAT_RE =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;

export function sanitizeDisplayName(
  s: string,
  opts: SanitizeDisplayNameOptions = {}
): string {
  const raw = typeof s === "string" ? s : String(s ?? "");
  let out = raw.replace(CONTROL_AND_FORMAT_RE, "");
  // Collapse whitespace (incl. any newlines left after the control strip).
  out = out.replace(/\s+/g, " ").trim();
  if (opts.forDownload) {
    // Path separators → spaces so a name can't sneak in a subdirectory, then
    // drop leading/trailing dots (a name like ".." or ".bashrc" must never
    // become a dotfile or a parent-directory escape).
    out = out
      .replace(/[\\/]+/g, " ")
      .replace(/^[.\s]+/, "")
      .replace(/[.\s]+$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  const maxLen = opts.maxLen ?? 60;
  if (maxLen > 0 && out.length > maxLen) {
    out = out.slice(0, maxLen);
    // Don't split a surrogate pair (emoji) at the cut.
    if (/[\uD800-\uDBFF]$/.test(out) && /[\uDC00-\uDFFF]/.test(raw[out.length] ?? "")) {
      out = out.slice(0, -1);
    }
    out = out.trim();
  }
  return out;
}
