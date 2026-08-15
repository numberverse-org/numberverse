import { useEffect, useRef } from "react";

/**
 * #1010 — focus management for real modal dialogs rendered over the play/home
 * surfaces. When `active` flips true:
 *   · focus moves to the first focusable element inside `ref` (or the dialog
 *     itself) so a screen-reader user starts inside the dialog;
 *   · Tab is trapped within the dialog;
 *   · Escape calls `onClose`;
 *   · on close, focus returns to the element that was focused before open.
 */
export function useDialogFocus(
  active: boolean,
  onClose: () => void,
  ref: { current: HTMLElement | null }
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

    const first = focusables()[0];
    if (first) first.focus();
    else {
      node.tabIndex = -1;
      node.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || !node.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (activeEl === lastEl || !node.contains(activeEl)) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected && typeof prev.focus === "function") prev.focus();
    };
  }, [active, ref]);
}
