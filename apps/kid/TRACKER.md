## NOVA PET-CARE 7 Aug 2026 — bath, brush, hug, kiss, scritches, nap, fly, read
Made Nova the kid's pet with 8 new care activities (33 → 41), each with its own animation + sound + speech bubble. All EN + BN, all local-first.

**New activities (`src/game/activities.ts`, `NovaScene.ts`)**
- 🛁 **Bath** — Nova settles into the tub, scrub-wiggles, bubbles foam up in two waves + water sparkle.
- 🪮 **Brush** — long smooth sweeps across the chest, sparkles fly off the feathers.
- 🤗 **Hug** — big cozy squish-in, hearts.
- 😘 **Kiss** — a peck, hearts drift up.
- 🫳 **Scritches** — leans in for head scritches, happy squint, gentle bob.
- 🛏️ **Nap** — settles down, closes eyes, dozes off… wakes with a start.
- 🪶 **Fly** — spreads her wings and soars out across the screen, returns home.
- 📖 **Read** — opens a storybook by the beak and bobs along.

**Design choices**
- The care block leads the ACTIVITIES array → the FIRST Fun-panel page is now all pet-care (ACT_PAGE=8), so bath/brush are one tap away.
- All 8 are also in the tap-me random pool — tapping Nova can trigger a bath or a cuddle at any time.
- Pure delight, zero reward-gaming: no coins, no pet-growth per tap. The egg-pet already grows through learning (sessions/mastery) + the once-daily feed, so care stays fun instead of a grind.
- Fun panel auto-grows to 6 pages (ceil(41/8)) via the existing actPages math.

**Verified:** `tsc --noEmit` clean, `audit.mjs` ✓ clean. Deployed; live bundle confirms all speech lines (Rub-a-dub-dub, Hug time, Mwah, scritches, nap time, I can fly, Once upon a time, So smooth) + EN/BN labels (Bath, Brush, Scritches, স্নান, চিরুনি, আলিঙ্গন, ঝিম, পড়া). No CDP used.
## KID WISHLIST ALL 7 7 Aug 2026 — birthday, silly Nova, pet, certificate, funny voices, castle, seasons
Built every item from the kid-centric wishlist, one by one. All local-first, no backend changes, EN + BN.

**1. 🎂 Birthday party** — AddKidForm now takes birth month/day; on the real birthday the home screen throws a party: confetti rain, a gift card, and a +10 coin gift (once per calendar year, bypasses the daily cap — `novaBirthday` action in store.ts). Streak badge is hidden that day.

**2. 😵 Silly Nova easter eggs** — NovaScene: 5 quick pats in a row → Nova gets REALLY dizzy (360° spin, wobbly eyes, 😵 emoji burst, "Whoa whoa whoa! Too many pats!"). Background cameo: 3 quick taps → "Achoo! 💨" + a sparkle sneeze in 4 colors.

**3. 🥚 The pet** — an egg that hatches and grows as the kid learns. `NovaState` gains petStage (0 egg → 1 🐣 → 2 🦉 → 3 wise owl) + petProgress + petFed. Growth: +0.25/session (hooked into `novaCompleteSession`), +0.3 per newly mastered skill (`petGrowMastery`, deduped via masteredBeforeRef), +0.2 once-daily feed (`petFeed`, PET_GROW_* / PET_MAX_STAGE constants). Home card shows stage + progress bar + feed button; done-screen shows a teal "pet grew into…" badge when a session pushed a stage boundary.

**4. 🖨️ Printable certificate** — completed world unlocks a keepsake certificate ("Certificate of Achievement / Zara has proudly mastered <world>") with the kid's name, mastered-skill pills, date, and Nova's 🦉 signature. `@media print` CSS hides the whole app and prints only the A4 sheet → "Save as PDF". Reached from the done screen ("Certificate" button) and from each completed world in the Card Album.

**5. 🤖 Funny voices** — Nova says the kid's name as a Robot (low slow "beep boop…"), a Whisper (soft, slow, volume 0.45), or a Shout (high + fast + a tada). `speak()` gained a `volume` option (default stays 0.9). Three-tap strip on home, only when TTS is available.

**6. 🏰 Build-a-castle** — a castle screen where every mastered world raises a color-coded tower (green sprout / amber cottage / blue river / purple sky / rose star) with its world-emblem flag, lit window, and the gate behind. Unbuilt towers are grey scaffolding slots. Built towers are tappable → that world's certificate. Full castle → King Nova banner.

**7. 🍂 Seasons change** — the journey path wears the real calendar season: Dec–Feb ❄️ snow drifts, Mar–May 🌸 petals, Jun–Aug ✨ fireflies (floating glow), Sep–Nov 🍂 falling leaves. 14 stable CSS particles per path card + a season chip in the path header + a seasonal glow ring on the current stop.

**Verified:** `tsc --noEmit` clean, `audit.mjs` ✓ clean (36 skills / 33 scenes, i18n EN+BN complete). Deployed to box; live bundle + CSS verified: `Certificate of Achievement`, `Nova says your name!`, `My Castle`, `towers built`, `petStage`, `season-particle`, `castle-tower`, `cert-sheet`, `funny-voices`, `pet-card`, and Bangla strings (অর্জনের সনদ, জোনাকির গ্রীষ্ম, তোমার পোষা) all present. No CDP used.

## FEEL PASS 6 Aug 2026 — combo juice, celebrations, rank titles, motion polish
Made the app genuinely *feel* good for kids — escalating rewards, celebration moments, and motion everywhere:

**In-game combo engine (`src/game/celebrate.ts` — NEW)**
- Per-scene combo counter (resets on wrong tap + scene shutdown). Consecutive correct answers escalate the celebration:
  - combo 2 → floating **"Nice! ✨"**
  - combo 3 → confetti burst + **"WOW! 🎉"** + rising three-note chime
  - combo 5 → bigger burst + star ring + **"AMAZING! 🌟"**
  - combo 7+ → full fireworks + **"SUPER STAR! ⭐"**
- Auto-wired into every scene's correct path: `correctButton()` and `ringCorrect()` (shared in `ui.ts`) now call `correctCelebrate()`. CountPop wired directly (it pops bubbles instead of recoloring).
- `wrongTap` (feedback.ts) resets the combo — a miss breaks the chain, but stays warm (no punishment).
- New reusable fx: `floatText`, `confettiBurst`, `starBurst`, combo helpers.

**Audio (`audio.ts`)**
- New `comboChime(combo)` — rising sparkle as combos climb.
- `win()` upgraded to a C–E–G–C fanfare with a high sparkle on top.

**React shell + CSS (`App.tsx`, `styles.css`)**
- **Rank titles** based on total mastered: 🌱 Seedling → 🌿 Sprout → 🦊 Explorer → 🦉 Wise Owl → 🚀 Star Pilot → 👑 Champion. Shown as a chip on the Worlds header + a badge on the done screen with "N more lessons to become X". Localized (en/bn).
- **Done screen**: 🦉 celebration + big animated ⭐ star count (CountUp) + confetti rain (pure CSS, infinite) + rank badge.
- **HUD 🔥 streak flame** — appears when the kid lands 2+ correct rounds in a row this session.
- **Screen transitions**: every screen glides in (`screen-in`); lists cascade in with a stagger wave (`card-in`).
- **Big buttons shimmer** — a moving sheen says "tap me!".
- **Current journey stop bobs** gently — "Nova is here".
- **Home**: gentle floating ⭐ and 🌙.
- Short-screen media query keeps the done screen on-screen on small phones.

**Verified:** `tsc --noEmit` clean, `vite build` passes (PWA regenerated), dev-server smoke test serves all touched modules (200). No CDP used.

## SVG ASSETS + MORE EXCITEMENT 6 Aug 2026 — OS-proof vector art everywhere
Replaced OS-dependent emoji content with a hand-drawn "cute sticker" SVG library, plus another layer of in-game reward.

**SVG library (`src/assets/svgs.ts` — NEW, 73 assets)**
- One consistent style: rounded shapes, soft drop-shadow filter, 100×100 viewBox stickers.
- **Mascot Nova** (full-body owl), **6 kid avatars** (fox/panda/lion/frog/tiger/koala), **5 world emblems** (keys match band keys: sprout-grove…star-academy), **6 subject icons**, **12 shapes**, **18 animals**, **10 fruits/things**, **homes** (wave/tree/cloud), **trophy**, plus EnLetters extras (ice/kite).
- Every asset ships its emoji as fallback, so nothing ever shows blank.

**Phaser bridge (`src/game/svgAssets.ts` — NEW)**
- `ensureAssets(scene)` rasterizes SVG → canvas texture (256², retina-crisp) via data-URI `<img>` — the proven `faceTex`/`cardFaceTex` runtime pattern.
- `assetIcon(scene, key, size)` returns a **self-upgrading** container: emoji now, vector the instant it lands.
- **Self-healing cache**: App destroys + recreates the Phaser game on screen changes → stale entries are re-validated against the live texture manager and re-rasterized; failed SVGs permanently keep emoji fallback.
- Booted from `BootScene` so textures are ready before the first lesson.

**Scene conversions (emoji text → vector)**
- `AnimalHome` (18 animals + 3 homes), `FruitAdd` (5 fruits), `BnWords` (10), `Cvc` (10), `EnPhonics` (8 pictures), `EnLetters` (12 hint icons), `ShapeCatcher` (12 shapes).
- `modernAnswerButton`/`modernCardButton` gained an `icon` option → scenes pass one option, no per-scene sprite plumbing.

**React shell (`src/components/Icon.tsx` — NEW; `App.tsx`)**
- `<Icon name size />` renders the SVG data-URI with emoji fallback; `<AvatarIcon emoji size />` maps stored avatar emoji → asset.
- Worlds, subjects, avatars, journey nodes, trophies, Nova mascot on home/done screens now vector. Add-kid form picks SVG buddies (stores emoji — storage stays compatible with existing kids).

**More excitement**
- **In-game round meter** (`roundMeter` in ui.ts): a row of gold stars that fills + pops as rounds complete (3 stars for lessons, adaptive for Count & Pop's 1..12). Wired into 8 content scenes + CountPop.
- **New-skill-mastered ribbon**: a pre-session mastery snapshot (`masteredBeforeRef`) → done screen shows a golden "🌟 New skill mastered!" badge with trophy icon when a skill genuinely crossed 80% this session (localized en/bn).

**Verified:** 73/73 SVG strings well-formed XML; `tsc --noEmit` clean; `vite build` passes; dev-server smoke test 200. No CDP used.

## ULTRATHINK HARDENING PASS 6 Aug 2026 — no overflow, no stray emoji, meter everywhere
Deep audit of the SVG/excitement work: every grid now provably fits every phone, every scene has the round meter, and OS-dependent emoji are gone from all scene titles.

**`gridLayout` (ui.ts) — now a proven-fit layout engine**
- **True-edge semantics**: `topPad`/`bottomY` are now real grid edges — added `cardH?` (rect cards) and inset `minCy`/`maxCy` by half the card height, so cards never poke above/below the band.
- **Round-button math fixed**: for circle buttons (`cardH` unset) the band equation is `rows·(w+gap) ≤ band` (solved for `w` on both sides) instead of the old under-shrink that overflowed 3-row grids on short phones.
- **`roundMeter` only pops the newly-filled star** + plays a quiet `starPop()` tick; meter is positioned at y=104 everywhere.

**Every content scene now uses `gridLayout` + the round meter** (band verified)
- Converted `BnWords`, `Cvc`, `EnPhonics`, `EnLetters`, `BnLetters`, `SightWords`, `BnSentence`, `ShapeCatcher`, `BnColors` to the shared grid.
- Added adaptive `topPad`/`bottomY`: grids stop above the bottom prompt/hint and start below the big target word/picture.
- `EnPhonics` picture caps at 240px (rises on short screens) + 8–10 options go **5×2 on narrow phones** (was 4×3, which can't fit 640px-tall screens).
- `SightWords`/`BnSentence` pass explicit `cardH` for their rect cards.
- Added the missing round meter to 12 answerRow scenes: AddSub100, AreaPerim, BgsFacts, BnMatras, Decimals, DivisionFacts, FractionMatch, Grammar, NumberBonds, Percent, PizzaFrac, PlaceValue → **every non-Nova scene has the meter now**, filled on round completion (meter-fill bug fixed in CountPop, FruitAdd, AnimalHome, BnSentence, SightWords, BnLetters, BnColors too).

**OS-dependent emoji scrubbed from all scene titles**
- 16 titles stripped (📖✏️⚔️🧮📐🏰🍕🔟🧩💯🚀🇧🇩🌈🗼); `RocketMult`'s 🚀 rocket is now the `star-academy` vector asset via `assetIcon`; `App.tsx` world headers use `<Icon name={world.key}>` instead of `WORLD_EMOJI` (map removed).
- Kept Nova's speech-bubble reaction emoji (her character voice) and BgsFacts question-badge emoji (content flavor in a text-reading quiz for ages 10–13).

**Verification (no CDP)**
- Programmatic layout sim: **195 grid layouts × 5 phone heights (568→932) — all clean**, no top/bottom overlap, no band overflow.
- `tsc --noEmit` clean; `vite build` passes (PWA regenerated); dev-server smoke test serves all touched modules 200.

## NAVIGATION + NOVA + FULLSCREEN 6 Aug 2026 — "Navigation is hard, Nova not fully functional, not full screen"
Three-part fix, all verified (`tsc --noEmit` clean, `vite build` passes + PWA regenerated, dev-server smoke test 200 on every touched module, no CDP).

**1 · Navigation — fewer hops, fat targets**
- Home **Play** now goes straight to the kid's world map (`worlds`), not the Nova room → tap once, you're at the lessons. No kid selected yet → kid picker.
- Tapping a kid card on the picker lands **directly on their map** (was: Nova room, then a second Play tap).
- **Worlds screen got a big pulsing "▶ Play next: …" banner** right under the header — one tap starts the current journey stop; when the whole journey is done it becomes "▶ Practice again". Works in both journey + world-map views.
- Tap targets enlarged everywhere: primary CTA 60→68px, ghost buttons 46→52px, round back buttons 44→56px (36px glyph), world cards 84→92px, journey view-toggle + home-foot mini buttons up, in-game HUD back 38→46px.

**2 · Nova — now a real reward loop (was affection-only, felt pointless)**
- `store.novaCare` pays **+1 🪙 (daily capped)** on feed/play — a small care routine that pays, inside the anti-grind cap (added `NOVA_CARE_COINS = 1`).
- `care()` gives visible feedback: **floating "+1 🪙" pops off the wallet chip**; bubble says the reward line (en/bn); hitting the daily cap says "You earned ALL your coins today! ✨"; repeating feed/play the same day says "already done — see you tomorrow" (animation still plays, it's a toy).
- **7-day streak calendar now lights gold** for played days (`nova.days` vs `dayIsoAgo`) instead of decorative dots.
- New `poke()` helper: tapping feed / play / shop / play-FAB (or an activity) **wakes a dozing Nova** + resets the idle clock — no more petting a sleeping mascot. Tapping Nova directly still wakes-first then does a random fun activity.
- Audited: all 33 activity ids map to `actXxx()` methods; shop buy/equip/wearing states, coin-afford tinting, `needCoins` speech, and `refresh()` (wallet/daily/streak/affection/CTA/shop/act re-render) all confirmed.

**3 · Fullscreen — three layers**
- PWA manifest `display: "standalone" → "fullscreen"` (installed home-screen = zero browser chrome, portrait-locked).
- **In-browser Fullscreen API**: every Play tap (world / single skill / replay) calls `requestFullscreen()`, leaving a game (`leaveGame`) exits it; **"f" key** toggles (ignored while typing in the Add-kid input); a **"⛶ Fullscreen"** toggle sits on the home footer, only rendered when the API exists.
- **Graceful on iOS Safari** (no page Fullscreen API): `fsSupported()` returns false → button hidden, requests no-op; the `apple-mobile-web-app-capable` meta + fullscreen manifest cover the Add-to-Home-Screen path.
- `play-now` banner pulses a glow ring only (never the transform) so the button's press-dip still reads.

## LAYOUT + SOUND 6 Aug 2026 — "Questions positions hide the screen, lots of sounds lacking"
Two-part fix, all verified (`tsc --noEmit` clean, `vite build` passes + PWA regenerated, dev-server smoke test 200, layout simulator all-clean, no CDP).

**1 · Answer-grid layout — 293 overflow layouts → 0**
- Root cause was `gridLayout` (ui.ts): round-grid `cardH` froze at the pre-shrink width → cy band computed for cards twice as tall → top row slid into the question; shrink was floored at each scene's `minW` → last row dropped under the prompt on short phones; band-overflow clamped `cy` to the TOP edge → everything spilled below `bottomY`.
- Fixed all three + added single-row band clamps:
  · round grids: `cardH` now TRACKS `cardW` through every shrink;
  · shrink may go below scene `minW` (hard floor 40px, still tappable) so grids fit short phones;
  · when a grid can't fit the band, `cy` centers it (overflow splits evenly top+bottom) instead of pinning to the top edge;
  · single-row clamp: round `cardW ≤ band`; rect `cardH ≤ band` — and the rect multi-row branch now also shrinks `cardH` (then re-grows `cardW` for the biggest valid cards).
- `GridLayout` gained `cardH`; `SightWordsScene` + `BnSentenceScene` now draw with `gl.cardH` (clamped height), not their local `CARD_H`.
- Simulated **9 scenes × 6 levels × 28 screens (320–430w × 480–860h) = 1,512 layouts → ALL CLEAN**. 52 layouts drop to 40–47px cards on tiny screens only (still tappable) — accepted.

**2 · Sound — everything heard, not just seen (zero assets)**
- **New `speech.ts`** — Web Speech API TTS, kid-tuned (slower rate 0.95, brighter pitch 1.12), language-aware via app lang (bn-BD / en-US), strips emoji, fresh utterance per call (iOS Safari quirk), `cancel` option so counting can QUEUE (1,2,3…), `cancelSpeech()` on scene/shutdown/leave.
- **Every question is read aloud** on each new round in all 25 game scenes (colors, Bangla words, CVC words, sight words, letters, phonics "…starts with which letter?", shapes, Bangla sentences, animal homes, and every math fact spoken with word-forms "plus / minus / times / divided by / percent of" so TTS reads it right). CountPop also **counts aloud as bubbles pop** (queued).
- **Wrong answers talk too**: miss #1 "Almost, try again"; miss #2 the coaching hint; miss #3 "The answer is …".
- **Nova has a voice** — every `say()` bubble line is spoken (greeting says the kid's name), speech cancels on scene shutdown.
- **Screen transitions**: any button anywhere plays a soft `click()`; each game start plays a rising `whooshUp()`; session complete plays a full `tada()` chord + arpeggio AND the done screen speaks "Amazing!". Background music starts on the very first tap anywhere (still respects the mute toggle / default-off).
- **iOS unlock**: a document-level click listener calls `speechSynthesis.resume()` inside every gesture so programmatic question reads work even though Phaser scenes mount after the tap.
- New sounds in `audio.ts`: `click()`, `whooshUp()`, `tada()` (all synthesized, offline-first).
- Deferred per the standing todo: recording the family's Elder Girl Voice — synthetic TTS is the stopgap until that recording lands.

## GOOGLE BANGLA TTS + KID-POLISH + DEFAULT FULLSCREEN 6 Aug 2026 — "add Google Bangla TTS, deep look to make it KID friendly, fullscreen by default"
Second audio pass. Verified (`tsc --noEmit` clean, `vite build` passes + PWA regenerated, dev-server smoke 200, Bangla numeral converter unit-tested in node, no CDP).

**1 · Google Bangla TTS (voice selection, `speech.ts`)**
- New voice scorer: Bangla text now PREFERS **"Google বাংলা"** (bn-IN / bn-BD) whenever it's installed on the phone; falls back to any bn voice, then the browser default. Google/Chrome Android voices win for en too.
- **Language auto-detection**: Bangla glyphs in the text force a Bangla voice even when the app UI is English — a Bangla word spoken by an English voice was unintelligible. English-learning games (CVC, sight words, letters, phonics, grammar) force `lang: "en"` so pronunciation stays correct.

**2 · Deep kid-friendly pass**
- Voice tuned warmer: rate **0.9** (slower), pitch **1.15** (brighter), volume **0.9** (never shouty); `resume()` before every speak (some Android builds pause).
- **`bnNumber()`** — full standard Bangla numerals 0–৯৯,৯৯৯ (একুশ, তেইশ, পঁয়তাল্লিশ, নিরানব্বই, একশ পাঁচ, চার হাজার আটশ ঊনত্রিশ, নয় লাখ…). Unit-tested in node.
- **`speakMath(op, a, b)`** — every math question is now spoken in the CURRENT language: Bangla kids hear "চার যোগ দুই", "বারো ভাগ চার", "চল্লিশের পঁচিশ শতাংশ", "৩-এর সাথে কত যোগ করলে ১০ হয়?" with real number words; English kids hear the English forms. Applied across add/sub, division, area, multiplication, percent, number-bonds, fruit-add.
- Localized custom phrasing: CountPop **counts aloud in Bangla** as bubbles pop; ShapeCatcher "বৃত্ত ট্যাপ করো!" (10 shapes); AnimalHome "মাছ কোথায় থাকে?" (18 animals); PlaceValue uses Bangla place names (একক/দশক/শতক/হাজার/দশ হাজার/লাখ); fractions "তিন ভাগ চার"; decimals + FruitAdd totals localized.

**3 · Fullscreen by default**
- `requestFullscreen()` now also tries the `webkitRequestFullscreen` prefix; `fsSupported`/listener handle `webkitfullscreenchange`; `exitFullscreen` uses the webkit prefix too.
- **The very first tap anywhere in the app auto-enters fullscreen** (one-shot, via `didAutoFs` ref) — the app opens immersive edge-to-edge by default, not just when Play is tapped.
- Leaving a game **no longer exits fullscreen** — the app stays fullscreen throughout (parents exit via the footer toggle or "f" key). PWA manifest stays `display: "fullscreen"` for installed home-screen.
- iOS Safari still gracefully no-ops (no page Fullscreen API); the toggle stays hidden there.

## DYNAMIC TTS FOR iOS + ANDROID + IN-APP VOICE CHECK 6 Aug 2026 — "make dynamic for iOS and Android"
Verified (`tsc --noEmit` clean, `vite build` passes + PWA regenerated, dev-server smoke 200, platform voice-selection simulated in node across Android/iOS/desktop/no-Bangla, no CDP).

**Platform-adaptive voice selection (`speech.ts`)**
- `detectPlatform()` → ios / android / other (handles iPadOS 13+ that masquerades as a Mac via maxTouchPoints).
- `pickVoice()` is now **language-gated** — never picks a wrong-language voice while any match exists (a Bangla question can never be read by Samantha). Falls back to any voice only when no language match at all.
- **Android**: Google TTS voices score +30 → **"Google বাংলা" wins automatically**; installed (localService) voices score +20 (offline-first).
- **iOS**: known Apple voices (Samantha / Rani / Karen / Tessa / Moira / Daniel…) score +15, downloaded **enhanced (localService) voices score highest**, and the generic "Default" entry is deprioritized so the real voice is chosen.
- **iOS race fix**: WebKit can DROP a line spoken immediately after `cancel()` — on iOS the speak is deferred ~40ms. Queue mode (`cancel:false`, counting) still speaks immediately.
- `speechStatus()` — live diagnostic: platform, installed bn/en voices, the exact voice the app WOULD pick, and whether Google বাংলা is present.

**In-app Voice check (parent panel)**
- New "🔊 Voice check" card on the Parent screen: shows 🍎 iOS / 🤖 Android / device, the Bangla voice that will be used (or a "no Bangla voice — install Bengali in Settings" warning on Android), the English voice, and a **"Play test line"** button that speaks a Bangla + English line back-to-back. i18n'd (en/bn).
- Lets a parent verify the whole TTS chain on the real phone without hunting through settings.

## WRONG-TAP RETIRE + VOICE-ON-5173 FIX 6 Aug 2026 — "wrong attempts make non clickable, no voice on 5173"
Verified (`tsc --noEmit` clean, `vite build` passes, the user's live 5173 dev server confirmed serving both updated modules via HMR, no CDP).

**1 · Wrong attempts become non-clickable (`hints.ts`)**
- `hintWrong` now calls `killOption()` on the tapped wrong card on EVERY miss — it disables interactivity, dims to 0.35, shrinks to 0.86, stamps a red ✕, and the ✕ dies with the card when the next round destroys it.
- A kid can no longer keep tapping the same wrong answer. The hint ladder still escalates on FRESH misses: miss #1 warm "Almost!" tip → miss #2 coaching banner + clears half the remaining wrong choices → miss #3+ glows the correct answer + "The answer is…".
- Miss-#2's "clear half" filter now skips already-retired cards (`sprite.input` is null after `disableInteractive`) so no double-✕.
- Applies to all 25 scenes (all wrong taps route through `hintWrong`).

**2 · "No voice" on the dev server (`speech.ts`)**
- Root cause: Chrome + WebKit **drop a `speak()` called immediately after `cancel()`** — the deferral was only applied on iOS. Now it applies on ALL platforms (~50ms) with a `speakToken` guard so only the newest speak actually plays (rapid-tap safe).
- Voices load async in Chrome/Safari — `speak()` now **waits for `voiceschanged`** (`waitVoices()`) before speaking the first line, so the RIGHT voice is picked instead of a silent no-voice default. Safety timeout marks voices loaded after 900ms so later speaks never block.
- `speechStatus()` now reports `secureContext` — the Voice check card warns when testing over plain http (non-localhost network IP), which some browsers gate TTS on.
