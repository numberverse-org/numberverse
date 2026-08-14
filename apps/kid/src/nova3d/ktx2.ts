/**
 * 🦉 #687 — shared KTX2 loader (renderer-aware, lazily created once).
 *
 * nova.glb ships its two PBR atlases as KHR_texture_basisu (KTX2) — the
 * basis transcoder (wasm + js) is served from /assets/basis/. We keep ONE
 * loader for the app's lifetime: `detectSupport(renderer)` picks the GPU
 * transcode path on devices that have it and falls back to CPU basis
 * decoding elsewhere, so every renderer re-enters with the same decoder.
 */
import type { WebGLRenderer } from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

let ktx2: KTX2Loader | null = null;

/** First call captures the renderer; the loader is then reused forever. */
export function getKTX2Loader(renderer: WebGLRenderer): KTX2Loader {
  if (!ktx2) {
    ktx2 = new KTX2Loader()
      .setTranscoderPath("/assets/basis/")
      .detectSupport(renderer);
  }
  return ktx2;
}
