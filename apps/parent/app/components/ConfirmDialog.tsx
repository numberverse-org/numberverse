"use client";

import { useEffect, useRef } from "react";

/**
 * #1600 — accessible modal confirm used by every two-tap guard in the portal.
 *  · Focus trap: Tab/Shift+Tab stay inside the dialog.
 *  · Autofocus lands on the confirm (default) or cancel button.
 *  · Escape closes (cancels) and focus returns to the trigger.
 *  · aria-modal + labelled/described so SR users know what's happening.
 *
 * Replaces the ad-hoc `role="dialog"` markup in page.tsx and the native
 * `window.confirm` (headless-incompatible, no focus management).
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  danger = false,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Autofocus + restore focus on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Focus the least-destructive action by default (Cancel); a danger confirm
    // focuses the cancel button so Enter can't nuke something by accident.
    const target = danger ? cancelRef.current : confirmRef.current ?? cancelRef.current;
    target?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [open, danger]);

  // Escape to cancel + focus trap.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-describedby={body ? "confirm-dialog-body" : undefined}
      style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.55)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}
    >
      <div ref={panelRef} className="card" style={{ maxWidth: 460, width: "100%", margin: 0 }}>
        <h3 style={{ margin: "0 0 8px" }}>{title}</h3>
        {body && (
          <p id="confirm-dialog-body" className="muted small" style={{ margin: "0 0 16px" }}>
            {body}
          </p>
        )}
        <div className="confirm-group">
          <button ref={cancelRef} className="btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
