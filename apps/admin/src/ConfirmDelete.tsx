import { useState } from "react";
import {
  Button,
  SaveButton,
  Toolbar,
  useDeleteController,
  useRecordContext,
} from "react-admin";

// #845 — destructive admin actions must be explicitly confirmed by TYPING the
// record name, not by a single guessable click.

export interface ConfirmDeleteProps {
  /** Returns the text the operator must type to arm the delete button. */
  getConfirmText?: (record: any) => string;
  /** Returns the id used for the delete mutation (defaults to record.id). */
  getId?: (record: any) => any;
  label?: string;
}

const overlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(15,10,30,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1300,
};
const dialog: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 22,
  width: "min(440px, calc(100vw - 40px))",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
};
const title: React.CSSProperties = { fontSize: 18, margin: "0 0 6px" };
const warning: React.CSSProperties = {
  background: "#fdecea",
  border: "1px solid #f5c6cb",
  color: "#a02020",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
};
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 14,
};
const actions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 16,
};
const cancelBtn: React.CSSProperties = {
  background: "#eee",
  border: "none",
  color: "#333",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
const deleteBtn: React.CSSProperties = {
  background: "#d32f2f",
  border: "none",
  color: "#fff",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

export function ConfirmDelete({
  getConfirmText = (record) => String(record?.id ?? ""),
  getId = (record) => record?.id,
  label = "Delete",
}: ConfirmDeleteProps) {
  const record = useRecordContext();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  // #845 — still the standard react-admin delete mutation (notification,
  // redirect and list refresh); we only gate it behind the typed confirmation.
  const { isPending, handleDelete } = useDeleteController({
    record: record ? { ...record, id: getId(record) } : undefined,
    redirect: "list",
    mutationMode: "pessimistic",
  });

  const confirmText = record ? getConfirmText(record) : "";

  const close = () => {
    if (isPending) return;
    setOpen(false);
    setTyped("");
  };

  return (
    <>
      <Button
        label={label}
        color="error"
        disabled={!record}
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
      />
      {open && (
        <div style={overlay} onClick={close}>
          <div style={dialog} onClick={(e) => e.stopPropagation()}>
            <h2 style={title}>Delete permanently?</h2>
            <div style={warning}>⚠️ This cannot be undone.</div>
            <div style={{ color: "#444", margin: "14px 0 6px" }}>
              Type <strong>{confirmText}</strong> to confirm:
            </div>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmText}
              style={input}
            />
            <div style={actions}>
              <button style={cancelBtn} onClick={close} disabled={isPending}>
                Cancel
              </button>
              <button
                style={{
                  ...deleteBtn,
                  opacity: typed === confirmText && !isPending ? 1 : 0.45,
                  cursor: typed === confirmText && !isPending ? "pointer" : "not-allowed",
                }}
                disabled={typed !== confirmText || isPending}
                onClick={() => handleDelete()}
              >
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// #845 — a toolbar that swaps react-admin's stock (unguarded) delete button for
// the typed-confirmation version above. Save behavior is untouched.
export function ConfirmDeleteToolbar({
  getConfirmText,
  getId,
}: Pick<ConfirmDeleteProps, "getConfirmText" | "getId">) {
  return (
    <Toolbar>
      <SaveButton />
      <ConfirmDelete getConfirmText={getConfirmText} getId={getId} />
    </Toolbar>
  );
}
