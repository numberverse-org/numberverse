#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# On-device neural Bangla voice (Piper VITS via WASM) — build-time fetch.
#
# Bakes the voice assets into the web image so the repo stays lean and deploys
# stay fast (the ~110MB payload is a Docker layer, cached after the first build).
# The PWA then downloads/caches these on first use (service-worker runtime cache)
# and speaks Bangla OFFLINE with a real Bengali neural voice — the same voice on
# every device, no German-voice lottery, nothing ever leaves the device.
#
# Sources (all MIT / open weights, pinned):
#   · piper-wasm@0.1.4   → phonemizer (espeak-ng WASM) + the exact onnxruntime
#                          browser build the worker was tested against.
#   · rhasspy/piper-voices → bn_BD-google-medium.onnx (the ONLY Bengali piper
#                          voice; 77MB fp32 — int8 quantization is a later TODO).
#
# Usage: sh fetch_voice_assets.sh <dest_dir> [model_url]
# ─────────────────────────────────────────────────────────────────────────────
set -eu

DEST="$1"
MODEL_URL="${2:-https://huggingface.co/rhasspy/piper-voices/resolve/main/bn/bn_BD/google/medium/bn_BD-google-medium.onnx}"
PIPER_WASM_TGZ="https://registry.npmjs.org/piper-wasm/-/piper-wasm-0.1.4.tgz"

echo "→ voice assets → $DEST"
mkdir -p "$DEST/onnx"

echo "→ piper-wasm 0.1.4 (phonemizer + onnxruntime)"
curl -fsSL -o /tmp/piper-wasm.tgz "$PIPER_WASM_TGZ"
rm -rf /tmp/piper-wasm-pkg
mkdir -p /tmp/piper-wasm-pkg
tar -xzf /tmp/piper-wasm.tgz -C /tmp/piper-wasm-pkg
PKG=/tmp/piper-wasm-pkg/package

# Piper phonemizer (espeak-ng WASM + data) — small enough to ALSO precache.
cp "$PKG/build/piper_phonemize.js" "$PKG/build/piper_phonemize.wasm" "$PKG/build/piper_phonemize.data" "$DEST/"

# Worker — patch single-threaded so ORT needs NO COOP/COEP/SharedArrayBuffer
# headers (the demo host serves plain http over a LAN IP; SAB is unavailable
# there). Single-threaded SIMD is plenty fast for one short sentence at a time.
cp "$PKG/build/worker/piper_worker.js" "$DEST/"
# Patch the worker (python — sed -i is unreliable across BSD/GNU):
#  1. Single-thread: numThreads=1 ⇒ NO COOP/COEP/SharedArrayBuffer needed on
#     plain-http LAN (the demo host). Single-threaded SIMD is plenty for one
#     short sentence at a time.
#  2. getBlob: XHR onerror/onabort ⇒ reject + post error (a dropped 20MB fetch
#     on flaky Wi-Fi must not hang the worker forever).
#  3. init: try/catch around the whole synth ⇒ post {kind:"error"} so the main
#     thread can show WHY instead of a forever-spinning download banner.
DEST="$DEST" python3 - <<'PYW'
import os
src = open(os.path.join(os.environ["DEST"], "piper_worker.js")).read()

# 1. single-thread
src = src.replace("ort.env.wasm.numThreads = navigator.hardwareConcurrency",
                  "ort.env.wasm.numThreads = 1")
assert "numThreads = 1" in src

# 2. getBlob error handling — reject + post so a dropped fetch surfaces.
old_gb = "xhr.onreadystatechange = () => {"
new_gb = "xhr.onerror = () => { self.postMessage({ kind: \"stderr\", message: \"voice fetch failed: \" + url }); reject(new Error(\"voice fetch failed: \" + url)); };\n  xhr.onabort = xhr.onerror;\n  " + old_gb
assert src.count(old_gb) == 1
src = src.replace(old_gb, new_gb, 1)

# 3. wrap init in try/catch so any error posts a visible message
old_init = "self.addEventListener(\"message\", (event) => {"
new_init = "self.addEventListener(\"message\", async (event) => { try {"
src = src.replace(old_init, new_init, 1)
old_close = "  if (data.kind === \"phonemize\")\n    init(data, true);\n});"
new_close = "  if (data.kind === \"phonemize\")\n    init(data, true);\n  } catch (e) {\n    self.postMessage({ kind: \"stderr\", message: (e && e.message) ? e.message : String(e) });\n  }\n});"
assert src.count(old_close) == 1
src = src.replace(old_close, new_close, 1)

open(os.path.join(os.environ["DEST"], "piper_worker.js"), "w").write(src)
print("worker patched: single-thread + error plumbing")
PYW

# onnxruntime-web browser build (the exact pairing piper-wasm ships).
# numThreads=1 + SIMD → ort-wasm-simd.wasm; ort-wasm.wasm is the no-SIMD fallback.
cp "$PKG/build/worker/dist/piper-dist/ort.min.js" "$DEST/onnx/"
cp "$PKG/build/worker/dist/piper-dist/ort-wasm-simd.wasm" "$DEST/onnx/"
cp "$PKG/build/worker/dist/piper-dist/ort-wasm.wasm" "$DEST/onnx/"

rm -rf /tmp/piper-wasm.tgz /tmp/piper-wasm-pkg

echo "→ Bengali piper model (bn_BD-google-medium, 77MB fp32)"
curl -fsSL -o "$DEST/bn_BD-google-medium.onnx" "$MODEL_URL"
curl -fsSL -o "$DEST/bn_BD-google-medium.onnx.json" "$MODEL_URL.json"

echo "→ done:"
du -h "$DEST"/* | sort -rh | head -12
