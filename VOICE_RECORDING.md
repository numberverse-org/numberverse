# 🎤 Voice Recording Plan — Elder Girl's Voice for Numberverse Bangla Audio

> Created: 6 Aug 2026 · Status: **SUPERSEDED by on-device neural TTS** (8 Aug 2026)
> The live Bangla voice is now **Piper VITS neural TTS, 100% on-device** (see TRACKER "ON-DEVICE NEURAL BANGLA VOICE"). Recording ~300 lines was too much for her, so neural TTS ships today — same voice on every device, offline, private. This doc is kept as the FUTURE option: a 100%-human voice for the closest-to-the-family feel. If/when she ever records, it plugs into `speech.ts` as the top-priority Bangla voice (before the neural voice).

## Why
The Bangla letters game (BnLettersScene) should speak the letters aloud so kids learn
the *sound* as well as the shape. Best voice for Hasan's youngest = his **elder girl**
(born 30 Jun 2021). The app speaks with a real child's voice — warm, authentic, no robot TTS.
The neural TTS voice (bn_BD-google-medium, a warm adult female Bengali voice) is the stopgap that makes the app talk today.

## When to record
- [ ] Decide the exact list of sounds (see below) with Hasan
- [ ] Find a quiet moment with the elder girl (she's 5 — short, fun sessions work best)
- [ ] Phone/computer mic is fine (can clean in post)

## Sounds to capture (Bangla Band 1–2)
| # | Letter | Sound | Filename (proposed) |
|---|--------|-------|---------------------|
| 1 | অ | "O" (short) | bn/o.ogg |
| 2 | আ | "Aa" | bn/aa.ogg |
| 3 | ই | "I" (short) | bn/i.ogg |
| 4 | ঈ | "Ii" (long) | bn/ii.ogg |
| 5 | উ | "U" (short) | bn/u.ogg |
| 6 | ঊ | "Uu" (long) | bn/uu.ogg |
| 7 | ক | "Ko" | bn/ko.ogg |
| 8 | খ | "Kho" | bn/kho.ogg |
| 9 | গ | "Go" | bn/go.ogg |
| 10 | ঘ | "Gho" | bn/gho.ogg |

## Recording tips (for the kid)
- Keep each clip ~1 second, one letter per clip
- Say it clearly, playful tone ("আআআ!")
- Record a few takes of each — we pick the best
- Take breaks — don't force it, it should feel like a game

## Optional extras
- [ ] Number names in Bangla (১ = "Ek", ২ = "Dui"...)
- [ ] Shape names in Bangla
- [ ] Celebration phrases ("Shabash!", "Abaro khelbo!")
- [ ] English letter sounds (A B C) in her voice

## Technical
- Format: .ogg (Vorbis) preferred for web, small + wide support
- Target: < 50 KB per clip (≈1s mono 44.1kHz ≈ 44 KB)
- Place at: `apps/kid/public/audio/bn/<filename>.ogg`
- Load in Phaser with `this.load.audio('bn-o', 'audio/bn/o.ogg')`
- Play on: letter shown (prompt) + on correct tap (encouragement)

## Current voice (until recording happens)
- **Piper VITS neural TTS (on-device, WASM)** — the LIVE Bangla voice since 8 Aug 2026. Real Bengali neural voice, same on every device, works offline, nothing leaves the device.
- Web Speech API — now only a temporary fallback during the first voice download (and for English).
- Google TTS / the old device-voice lottery — retired for Bangla (caused the German-voice bug).

*The app already works without audio. This just makes it magical.* ❤️
*The app now has a real neural voice. Recording her voice later would make it family-magic.* ❤️
