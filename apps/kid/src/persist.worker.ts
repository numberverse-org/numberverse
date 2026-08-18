/// <reference lib="webworker" />
import { migrateKidState, serializeSnapshot, PERSIST_VERSION } from "./store";

/** #1814/#1815 — persist worker: move the expensive JSON.stringify of the WHOLE
 * persisted blob (~10–70ms) AND the rehydrate JSON.parse + migrate off the main
 * thread. Two message shapes:
 *  · a structured-cloneable STATE OBJECT → stringify → reply string (writes).
 *  · { type: "parse", raw } → JSON.parse + migrateKidState → reply
 *    { type: "parse-result", state, version } (rehydrate reads; version is
 *    stamped to the CURRENT version so zustand skips its own migrate).
 * The main thread still owns the final localStorage.setItem (the only write).
 * `serializeSnapshot` + `migrateKidState` are the SAME pure functions the main
 * thread's synchronous fallback uses, so every path has one implementation. */
self.onmessage = (ev: MessageEvent) => {
  const d = ev.data;
  if (d && typeof d === "object" && d.type === "parse") {
    // #1815 — rehydrate read path: parse + migrate OFF the main thread. A
    // corrupt blob replies state:null and the main thread drops the bytes
    // (same #1374 guard as the synchronous path).
    try {
      const stored = JSON.parse(d.raw as string) as { state?: unknown; version?: number };
      self.postMessage({
        type: "parse-result",
        state: migrateKidState(stored?.state, stored?.version ?? 0),
        version: PERSIST_VERSION,
      });
    } catch {
      self.postMessage({ type: "parse-result", state: null });
    }
    return;
  }
  const serialized = serializeSnapshot(d);
  self.postMessage(serialized);
};
