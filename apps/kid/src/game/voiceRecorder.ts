/**
 * 🎙️ On-device voice recorder for kid dictation (#138).
 *
 * MediaRecorder-based, STRICTLY on-device: recordings live as an object URL in
 * this tab and are never uploaded, never persisted, never sent anywhere. The
 * moment the page closes, the recording is gone (the blob URL is revoked on
 * stop). Parent-gated: the settings flag must be on (kid settings
 * `voice_record_enabled`), which also requires mic permission granted by the
 * kid's tap on the Record button (browsers demand a user gesture anyway).
 *
 * Privacy contract:
 *   - getusermedia only inside an explicit tap when the parent gate is on
 *   - audio captured → Blob → URL.createObjectURL → <audio> playback
 *   - URL.revokeObjectURL on stop (no leak), no network, no storage
 */

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let blobUrl: string | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
// #3091 — the in-flight stop promise, so a 30s auto-stop racing a manual stop
// returns the SAME promise (no orphaned onstop handler, no double recorder.stop()).
let pendingStop: Promise<RecordedClip> | null = null;

export type RecordState = "idle" | "recording" | "denied" | "unsupported";
export type RecordedClip = { url: string | null; seconds: number };

/** Hard ceiling for an on-device dictation clip (#904). The recorder auto-stops
 *  at this length so a long-press record can never become a hidden capture. */
export const MAX_RECORD_SECONDS = 30;

/** Ask for the mic and start recording (call from a tap handler).
 *  `onAutoStop` fires when the hard ceiling stops the recording for review. */
export async function startRecording(onAutoStop?: (clip: RecordedClip) => void): Promise<RecordState> {
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }
  if (maxTimer) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
  chunks = [];
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return "denied";
  }
  if (!window.MediaRecorder) {
    stream.getTracks().forEach((t) => t.stop());
    return "unsupported";
  }
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  maxTimer = setTimeout(() => {
    if (recorder && recorder.state === "recording") {
      void stopRecording().then((clip) => onAutoStop?.(clip));
    }
  }, MAX_RECORD_SECONDS * 1000);
  return "recording";
}

/** Stop and return a playable object URL (or null if nothing was captured). */
export function stopRecording(): Promise<RecordedClip> {
  if (maxTimer) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
  // #3091 — if a stop is already in flight (e.g. the 30s auto-stop timer fired
  // while a manual stop is pending), return the SAME promise instead of starting
  // a second stop that would overwrite the first caller's onstop handler.
  if (pendingStop) return pendingStop;
  pendingStop = new Promise((resolve) => {
    if (!recorder) {
      resolve({ url: null, seconds: 0 });
      return;
    }
    const started = Date.now();
    recorder.onstop = () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
      if (chunks.length) {
        const type = recorder?.mimeType?.includes("mp4")
          ? "audio/mp4"
          : recorder?.mimeType?.includes("ogg")
            ? "audio/ogg"
            : "audio/webm";
        blobUrl = URL.createObjectURL(new Blob(chunks, { type }));
      }
      const seconds = Math.round((Date.now() - started) / 1000);
      const out = { url: blobUrl, seconds };
      recorder = null;
      chunks = [];
      resolve(out);
    };
    // #3091 — stop() on an already-inactive recorder throws a DOMException
    // synchronously; only stop a recorder that is actively capturing.
    if (recorder.state === "recording") recorder.stop();
    recorder.stream?.getTracks().forEach((t) => t.stop());
  });
  // Release the pending-stop slot once the stop settles so a later recording
  // can start a fresh stop.
  void pendingStop.then(() => {
    pendingStop = null;
  });
  return pendingStop;
}

/** Delete a finished clip and release its object URL (the local review path). */
export function clearRecording(): void {
  if (recorder && recorder.state === "recording") {
    recorder.onstop = null;
    recorder.stop();
    recorder.stream?.getTracks().forEach((t) => t.stop());
  }
  recorder = null;
  chunks = [];
  if (maxTimer) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }
}

/** Cancel a recording without keeping anything. */
export function cancelRecording(): void {
  clearRecording();
}
