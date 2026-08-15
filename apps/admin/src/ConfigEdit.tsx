import { Edit, NumberInput, SimpleForm, useRecordContext } from "react-admin";
// #845 — config rows are destructive to delete; confirm by typing the key.
// #847 — the `adaptive` config key gets a TYPED form instead of a raw JSON editor.
import { ConfirmDeleteToolbar } from "./ConfirmDelete";

// #847 — backend schema validation expects exactly these three floats in [0,1].
const ADAPTIVE_DEFAULTS = { pLearn: 0.1, pGuess: 0.15, pSlip: 0.1 };

const warnBox: React.CSSProperties = {
  background: "#fff8e1",
  border: "1px solid #ffe082",
  color: "#6d4c00",
  borderRadius: 12,
  padding: "14px 16px",
  margin: "8px 0",
};
const readOnly: React.CSSProperties = {
  background: "#f7f7f7",
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  overflow: "auto",
  maxHeight: 220,
};

function ConfigForm() {
  const record = useRecordContext();
  if (!record) return null;

  const isAdaptive = record.key === "adaptive";
  const value = record.value && typeof record.value === "object" ? record.value : {};

  return (
    <>
      {isAdaptive ? (
        <SimpleForm
          toolbar={
            <ConfirmDeleteToolbar
              getConfirmText={(r) => r?.key ?? String(r?.id ?? "")}
              getId={(r) => r?.key ?? r?.id}
            />
          }
        >
          <NumberInput
            source="value.pLearn"
            label="pLearn — chance a wrong round was a lucky guess"
            step={0.01}
            min={0}
            max={1}
            defaultValue={value.pLearn ?? ADAPTIVE_DEFAULTS.pLearn}
          />
          <NumberInput
            source="value.pGuess"
            label="pGuess — chance of a correct answer being a guess"
            step={0.01}
            min={0}
            max={1}
            defaultValue={value.pGuess ?? ADAPTIVE_DEFAULTS.pGuess}
          />
          <NumberInput
            source="value.pSlip"
            label="pSlip — chance a known answer was slipped"
            step={0.01}
            min={0}
            max={1}
            defaultValue={value.pSlip ?? ADAPTIVE_DEFAULTS.pSlip}
          />
        </SimpleForm>
      ) : (
        <SimpleForm
          toolbar={
            <ConfirmDeleteToolbar
              getConfirmText={(r) => r?.key ?? String(r?.id ?? "")}
              getId={(r) => r?.key ?? r?.id}
            />
          }
        >
          {/* #847 — no raw JSON editor for unknown keys; show a read-only note. */}
          <div style={warnBox}>
            Typed editing for config key <strong>{String(record.key)}</strong> isn't
            supported yet. Only the <code>adaptive</code> key has a typed form.
            <div style={{ marginTop: 8, color: "#555" }}>Current value (read-only):</div>
            <pre style={readOnly}>{JSON.stringify(record.value, null, 2)}</pre>
          </div>
        </SimpleForm>
      )}
    </>
  );
}

export default function ConfigEdit() {
  return (
    <Edit>
      <ConfigForm />
    </Edit>
  );
}
