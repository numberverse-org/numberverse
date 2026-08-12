# Screen-reader support (VoiceOver / TalkBack) — walkthrough (#133)

Status: ✅ done (PR pending). Live-region announcements + critical-path labels
added; verified locally on the operator's own devices. This doc is the
walkthrough + "what a screen-reader user hears".

## The pattern

The kid app is a mix of React screens and a Phaser canvas. Screen readers can't
read canvas pixels, so the app mirrors every game/settings cue into a
**visually-hidden `aria-live="polite"` region** (`#sr-live` in App.tsx). When
VoiceOver/TalkBack is on, the same information a sighted kid gets on screen is
announced aloud in the app's language (EN/BN).

## What's announced

| Moment | Announcement (localized via `STR[lang]`) |
|---|---|
| Every round answered right | `a11yRight` — "Nice — that's right!" / "দারুণ — ঠিক আছে!" |
| Every round answered wrong | `a11yWrong` — "Not quite — try again, Nova will help." |
| Skill crossed the mastery bar | `a11yMastered(title)` — "You mastered {title}!" (plus spoken cheer + tada) |
| Daily quest completed | existing spoken `questCompleteSpeak` (TTS) |
| Music toggle flipped (settings) | `a11yMusicOn` / `a11yMusicOff` |

## Critical paths labeled (spot-checked)

- Home "one action" Play button → `aria-label` = the same text it shows.
- Journey path section → `aria-label={t.homePath}`; contrast drill owl → named.
- Kid picker chips → `aria-label={t.switchKid(avatar, name)}`.
- Settings switches (`role="switch"`, `aria-checked`) — music, TTS, dictation.
- Voice picker listen buttons → `aria-label` includes the voice name.
- Fullscreen/back nav icon buttons → `aria-label={t.back}`.

## What's NOT covered (honest scope)

- Phaser scenes remain canvas-painted; their internals (drag targets, hit
  zones) are not individually focusable. The live-region round announcements
  are the primary bridge. A fully DOM-rendered "screen-reader mode" for scenes
  is a larger follow-up (would need per-scene serialization of the question).
- TTS reading ("Voice & reading") already overlaps with screen-reader output;
  when both are on the app keeps speech short to avoid echo.

## How we tested (operator's own devices only)

- VoiceOver on iOS Safari: tab through home → play → settings; confirmed the
  live region announces round results after each answer.
- TalkBack on Android: same path; confirm switch roles + live region.
