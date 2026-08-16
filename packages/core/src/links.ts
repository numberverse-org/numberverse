/**
 * External-link scheme allowlist (#267).
 *
 * The apps never launch an external app or open an external URL except through
 * the schemes listed here. Keeping the list in one place means a reviewer can
 * see every escape hatch the product allows — and any new one has to justify
 * itself here first.
 *
 * Allowed:
 *   - https  → web pages (incl. wa.me WhatsApp share, the one share flow)
 *   - mailto → "email us" links
 *   - blob   → same-origin downloaded images (share card PNG)
 *
 * Rejected (removed in #1823):
 *   - data:  → `data:text/html,...` can render active HTML in a fresh browsing
 *              context via window.open (XSS). Inline assets (favicons, SVG)
 *              are browser-rendered `<img>`/`<audio>` srcs in the apps, NOT
 *              opened through this external allowlist, so they never belonged
 *              here.
 *   - about: → about:blank never needs to be used.
 */
export const ALLOWED_EXTERNAL_SCHEMES = new Set(["https:", "mailto:", "blob:"]);

/** true when a URL's scheme is on the allowlist (safe to open externally). */
export function isAllowedExternalUrl(url: string): boolean {
  if (!url) return false;
  let scheme: string;
  try {
    scheme = new URL(url, "https://numberverse.invalid").protocol;
  } catch {
    scheme = "";
  }
  return ALLOWED_EXTERNAL_SCHEMES.has(scheme);
}

/**
 * #790 — the pure core package never touches `window` directly. Callers pass
 * in the one browser primitive they need (a window opener); this function is
 * a pure allowlist gate around it. Apps keep their own tiny `openExternal`
 * adapter (see apps/kid/src/game/shareImage.ts).
 */
export type WindowOpener = (url: string, target: string, features: string) => void;

/** Allowlist-checked open through a caller-supplied opener (pure, testable). */
export function openExternalWith(
  url: string,
  opener: WindowOpener,
  target: string | undefined = "_blank",
): boolean {
  if (!isAllowedExternalUrl(url)) return false;
  try {
    opener(url, target, "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

/** The only non-web flow we ship: WhatsApp share via wa.me over https.
 *  EXACT hostname match — `endsWith("wa.me")` let `notwa.me` (a lookalike
 *  domain) through as a false positive; pin to the exact host so lookalike
 *  suffixes AND malicious subdomains are both rejected. */
export function isWhatsAppShare(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "wa.me" || u.hostname === "www.wa.me")
    );
  } catch {
    return false;
  }
}
