/// <reference lib="webworker" />
import { serializeSnapshot } from "./store";

/** #1814 — persist worker: move the expensive JSON.stringify of the WHOLE
 * persisted blob (~10–70ms) off the main thread. The store posts the
 * structured-cloneable state snapshot; this worker returns its serialized form.
 * The main thread still owns the final localStorage.setItem (the only write).
 * `serializeSnapshot` is the SAME pure function the synchronous flush path uses,
 * so the stringify logic has exactly one implementation. */
self.onmessage = (ev: MessageEvent) => {
  const serialized = serializeSnapshot(ev.data);
  self.postMessage(serialized);
};
