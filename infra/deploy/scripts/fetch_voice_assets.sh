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
#   · piper-wasm@0.1.4      → phonemizer (espeak-ng WASM) + the worker.
#   · onnxruntime-web@1.17.0 → the browser engine. We deliberately stay on the
#                             version piper-wasm was built around: ORT 1.20+
#                             ships ONLY an ESM (.mjs) wasm wrapper that the
#                             loader dynamic-import()s — and Safari's CLASSIC
#                             worker cannot dynamic-import() modules
#                             ("does not resolve to a valid URL" → the voice
#                             failed on iPhone). 1.17 loads via classic
#                             importScripts(ort.min.js) + an XHR for the
#                             .wasm — the piper-wasm mechanism, works
#                             everywhere. The voice model is INT8 (int4 was the
#                             only reason to be on 1.27, and int4 is unused).
#   · rhasspy/piper-voices  → bn_BD-google-medium.onnx (the ONLY Bengali piper
#                            voice; fp32 → int8 quantized at build, int4 is a
#                            QA artifact pending human listen-QA).
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

# 4. version the ort.min.js fetch — the FILENAME is shared across engine
#    swaps, so a stale CacheFirst service-worker entry (nv-voice, 6-month TTL)
#    would keep old clients on a previous loader forever. The main thread
#    passes ortVersion (= VOICE_V); appending ?v= makes a deploy bump every
#    client onto the fresh loader. (The .wasm name is stable and unversioned —
#    ort-wasm-simd.wasm; on a deliberate engine change we rename the file.)
old_dest = "const { input, speakerId, blobs, modelUrl, modelConfigUrl, onnxruntimeUrl } = data;"
new_dest = "const { input, speakerId, blobs, modelUrl, modelConfigUrl, onnxruntimeUrl, ortVersion } = data;"
assert src.count(old_dest) == 1
src = src.replace(old_dest, new_dest, 1)
old_ort_fetch = "const onnxruntimeJs = URL.createObjectURL(await getBlob(`${onnxruntimeBase}ort.min.js`, blobs));"
new_ort_fetch = "const onnxruntimeJs = URL.createObjectURL(await getBlob(`${onnxruntimeBase}ort.min.js?v=${ortVersion}`, blobs));"
assert src.count(old_ort_fetch) == 1
src = src.replace(old_ort_fetch, new_ort_fetch, 1)

# 5. ORT 1.17 wasm loading needs NO patch: `wasmPaths = onnxruntimeBase` (a
#    base-directory STRING) + the loader XHRs `wasmPaths + "ort-wasm-simd.wasm"`
#    (string concat, no dynamic import, no ESM) and WebAssembly.instantiate()s
#    it. nginx serves /voice/* as application/wasm; the app pre-warms the
#    nv-voice SW cache with the same URL so the XHR is a cache hit offline.
#    (This is deliberately NOT the ORT 1.27 wasmBinary path — that engine needs
#    a dynamic import() of its .mjs wrapper, which Safari classic workers can't
#    do. See the engine comment below.)

# 6. Surface init failures. init() is async and called WITHOUT await, so a
#    rejected init (any ORT/model error — e.g. the wrong-path .mjs above) was
#    silently swallowed → the worker never posted back → the app's state stayed
#    "loading" forever (99% bar). Rejections now post {kind:"stderr"} so the
#    main thread shows the real error and speech.ts falls back to Web Speech.
old_init_call = '  if (data.kind === "init")\n    init(data);'
new_init_call = '  if (data.kind === "init")\n    init(data).catch((e) => self.postMessage({ kind: "stderr", message: (e && e.message) ? e.message : String(e) }));'
assert src.count(old_init_call) == 1
src = src.replace(old_init_call, new_init_call, 1)
old_phon_call = '  if (data.kind === "phonemize")\n    init(data, true);'
new_phon_call = '  if (data.kind === "phonemize")\n    init(data, true).catch((e) => self.postMessage({ kind: "stderr", message: (e && e.message) ? e.message : String(e) }));'
assert src.count(old_phon_call) == 1
src = src.replace(old_phon_call, new_phon_call, 1)

open(os.path.join(os.environ["DEST"], "piper_worker.js"), "w").write(src)
print("worker patched: single-thread + error plumbing + ORT versioned URLs + init error surfacing (ORT 1.17 classic loader)")
PYW

# onnxruntime-web 1.17.0 — the classic-script engine piper-wasm was built
# around. Loads via importScripts(ort.min.js) + XHR of the .wasm — NO dynamic
# import() — so it works in Safari's CLASSIC worker (ORT 1.20+ requires
# import() of an .mjs ESM wrapper → fails on iPhone). The loader picks
# `ort-wasm-simd.wasm` (SIMD, single-threaded — numThreads=1, no SAB) and
# string-concats it onto wasmPaths. Voice model stays int8 (int4 unused).
ORT_TGZ="https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.17.0.tgz"
curl -fsSL -o /tmp/ort117.tgz "$ORT_TGZ"
rm -rf /tmp/ort117-pkg
mkdir -p /tmp/ort117-pkg
tar -xzf /tmp/ort117.tgz -C /tmp/ort117-pkg
cp /tmp/ort117-pkg/package/dist/ort.wasm.min.js "$DEST/onnx/ort.min.js"
cp /tmp/ort117-pkg/package/dist/ort-wasm-simd.wasm "$DEST/onnx/"
rm -rf /tmp/ort117.tgz /tmp/ort117-pkg

rm -rf /tmp/piper-wasm.tgz /tmp/piper-wasm-pkg

echo "→ Bengali piper model (bn_BD-google-medium, 77MB fp32)"
curl -fsSL -o "$DEST/bn_BD-google-medium.onnx" "$MODEL_URL"
curl -fsSL -o "$DEST/bn_BD-google-medium.onnx.json" "$MODEL_URL.json"

echo "→ done:"
du -h "$DEST"/* | sort -rh | head -12

# ─────────────────────────────────────────────────────────────────────────────
# Build-time version derivation: compute a content hash of the assembled voice
# payload and print it so the Docker build can inject VITE_VOICE_V. A drift
# between the committed VOICE_V and this hash is surfaced below (see #974) —
# preventing silent 6-month rollbacks. Operators pin VOICE_V = v<HASH> to make
# the check a hard gate (the drift branch prints the exact sed to do that).
#
# The hash covers the model, worker, phonemizer, and ORT engine files — every
# asset that rides the /voice/ CacheFirst route. The .onnx.json config is NOT
# included in the hash because its architecture tracks the model (no hash change
# = config hasn't drifted from what the model expects).
HASH=$(sha256sum "$DEST/bn_BD-google-medium.onnx" "$DEST/piper_worker.js" "$DEST/piper_phonemize.js" "$DEST/piper_phonemize.wasm" "$DEST/piper_phonemize.data" "$DEST/onnx/ort.min.js" "$DEST/onnx/ort-wasm-simd.wasm" | sha256sum | cut -d' ' -f1 | head -c12)
echo "→ voice content hash (v${HASH}) — inject as VITE_VOICE_V"
echo "VITE_VOICE_V=v${HASH}"

# #974 — AUTOMATED drift check: the committed VOICE_V in neuralVoice.ts must
# match this payload hash, otherwise a voice deploy that changes the model /
# worker / ORT engine would silently ship the OLD cache keys while the PWA's
# 6-month CacheFirst route keeps serving the stale voice. This turns the old
# "every human deployer MUST verify" note into a build-time warning.
VOICE_SRC="apps/kid/src/game/neuralVoice.ts"
COMMITTED_VOICE_V=""
if [ -f "$VOICE_SRC" ]; then
  COMMITTED_VOICE_V=$(grep -oE 'const VOICE_V = "[^"]+"' "$VOICE_SRC" | head -1 | sed -E 's/const VOICE_V = "([^"]+)"/\1/')
fi
if [ -z "$COMMITTED_VOICE_V" ]; then
  echo "⚠ cannot read committed VOICE_V from $VOICE_SRC — skipping #974 drift check" >&2
elif [ "$COMMITTED_VOICE_V" = "v${HASH}" ]; then
  echo "✓ committed VOICE_V (${COMMITTED_VOICE_V}) matches the assembled voice payload"
else
  echo "✗ VOICE DRIFT (#974): committed VOICE_V is '${COMMITTED_VOICE_V}' but this build's voice payload hashes to v${HASH}." >&2
  echo "  The PWA CacheFirst route holds /voice/ for ~6 months — shipping this build would serve the OLD voice" >&2
  echo "  to every returning device while the bytes on disk changed. Update the constant:" >&2
  echo "    sed -i '' 's/const VOICE_V = \"[^\"]*\"/const VOICE_V = \"v${HASH}\"/' apps/kid/src/game/neuralVoice.ts" >&2
  echo "  (or set VOICE_V to 'v${HASH}' if this is a deliberate voice upgrade), then rebuild." >&2
fi
