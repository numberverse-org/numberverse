# 📷 AR numbers camera experiment (#130) — tech spike decision

> **Decision:** build the number camera as an **on-device digit classifier
> (ONNX Runtime Web + a tiny per-script CNN)**, not a full OCR engine. Camera
> capture via `getUserMedia`; inference fully offline; zero upload. This doc
> records the comparison + the risk list + the build sketch. No AR library,
> no network dependency, no ads — matches the spike's "tech spike only" gate.

## The goal, restated

A kid points the camera at a number (a flashcard, a wall, a phone screen) and
the app *sees* it and *plays* with it — the recognized digit speaks, pops, and
feeds a mini counting game. Two hard constraints: **on-device only** (privacy
contract, same as #138) and **offline** (PWA must work with no network).

## Why not a full OCR engine

| Option | On-device? | Offline? | Size / perf on 2GB Android | Fit |
|---|---|---|---|---|
| **Tesseract.js (WASM OCR)** | ✅ WASM | ⚠ needs `traineddata` bundled (~15 MB/language!) or network | ~2 MB WASM + 15 MB lang data → blows the 2100 KB bundle budget | ✖ overkill — full text OCR for ONE digit |
| **Cloud vision APIs** | ❌ uploads camera frames | ❌ | n/a | ✖ breaks the no-network + privacy contract |
| **MediaPipe legacy DigitClassifier** | ✅ | ⚠ model via CDN or bundling | ~1 MB, legacy JS solution | ⚠ quick spike, but legacy + model maintenance |
| **ONNX Runtime Web + tiny digit CNN** | ✅ WASM | ✅ quantized model (~50–500 KB) bundled as an asset | tiny, fast, 60 fps on low-end | ✅ **recommended** |

ONNX Runtime Web (~600 KB gzip) + a quantized MNIST CNN (~50 KB) or a Bangla
digit CNN (~100 KB) is dramatically lighter than Tesseract, fully offline once
cached by the service worker, and **extends per-script** — the locale-pack
architecture (#131) already has a `digits` field per locale; each locale's
digit model becomes a config asset (bn → Bangla digit CNN, en → MNIST), so a
new language = a model asset, not a rewrite.

## Build sketch (when the content wave picks this up)

1. **Camera** — `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`
   in a dedicated scene; live preview on a canvas; frame → downscale to a
   28×28 grayscale crop centered on the focus ring.
2. **Infer** — ONNX Runtime Web loads the bundled per-script CNN; run per frame
   (throttled ~6 fps to save battery); output → top-1 digit + confidence.
   Confidence gate (≥0.85) before the digit is "locked" so noise doesn't pop.
3. **Play** — the locked digit speaks it (`speech.ts`), pops it, and feeds the
   existing counting mini-game ("how many fingers do you see?" → tap the number
   you found) so the camera moment is a real learning loop, not a toy.
4. **Privacy** — preview + inference only in the scene; nothing leaves the
   device; no frames stored or uploaded (same contract as #138's voice).

## Risks (honest, deferred to the build wave)

- **iOS Safari camera** — `getUserMedia` needs a user gesture + HTTPS (the box
  tunnel is HTTPS ✅); test on the operator's iOS device before committing.
- **Model licensing** — Bangla digit datasets (e.g., BanglaHND) must be
  licensed for redistribution; fall back to training on a small curated set.
- **Bundle** — ONNX Runtime Web is ~600 KB gzip into the engine chunk; verify
  against the 2100 KB budget (lazy-load only the AR scene chunk).
- **2GB Android perf** — quantized int8 CNN + 6 fps throttle keeps it smooth;
  verify on the operator's low-end device.
- **Can't be tested from the CLI** — a real camera device is required; gate the
  build wave on a scheduled device test on the operator's own hardware.

## When picked: "done when"

- [ ] Dedicated camera scene (getUserMedia preview, focus ring, 6 fps capture)
- [ ] Bundled per-script ONNX digit model loads offline (SW-cached)
- [ ] ≥0.85-confidence digit → speaks + pops + feeds counting game
- [ ] Camera preview never leaves the device (no upload, no persistence)
- [ ] Verified on the operator's own devices only (iOS + 2GB Android)
