/**
 * Runtime content-safety backstop for synthetic speech (#901).
 *
 * The build-time gates (scripts/content-safety.mjs + the Oracle's l1_safety)
 * scan every static display string, but `speak()` also receives DYNAMIC text
 * (kid names, interpolated skill titles, generated prompts). Those are never
 * visible in a static scan, so we re-check the final spoken line here against
 * the SAME shared list the gates use (unsafeWords.json) and refuse to
 * synthesize anything unsafe.
 */
import unsafeWords from "./unsafeWords.json";

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const BANGLA_RANGE = "\\u0980-\\u09FF";

const EN_RE: RegExp[] = Object.values(unsafeWords.en)
  .flat()
  .map((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i"));

const BN_RE: RegExp[] = Object.values(unsafeWords.bn)
  .flat()
  .map((w) => new RegExp(`(?<![${BANGLA_RANGE}])${escapeRegExp(w)}(?![${BANGLA_RANGE}])`, "u"));

/** True when the text contains an unsafe word for the given language. */
export function hasUnsafeText(text: string, lang: "en" | "bn"): boolean {
  const list = lang === "bn" ? BN_RE : EN_RE;
  for (const re of list) {
    re.lastIndex = 0;
    if (re.test(text)) return true;
  }
  return false;
}
