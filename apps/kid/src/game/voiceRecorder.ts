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

export type RecordState = "idle" | "recording" | "denied" | "unsupported";

/** Ask for the mic and start recording (call from a tap handler). */
export async function startRecording(): Promise<RecordState> {
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
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
  return "recording";
}

/** Stop and return a playable object URL (or null if nothing was captured). */
export function stopRecording(): Promise<{ url: string | null; seconds: number }> {
  return new Promise((resolve) => {
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
    recorder.stop();
    recorder.stream?.getTracks().forEach((t) => t.stop());
  });
}

/** Cancel a recording without keeping anything. */
export function cancelRecording(): void {
  if (recorder && recorder.state === "recording") {
    recorder.onstop = null;
    recorder.stop();
    recorder.stream?.getTracks().forEach((t) => t.stop());
  }
  recorder = null;
  chunks = [];
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }
}
