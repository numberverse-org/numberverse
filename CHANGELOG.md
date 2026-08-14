## 14 Aug 2026 — 0.42.2 (⚡ Voice-cache: in-memory LRU ledger replaces per-store getAll, readonly cache reads, debounced synth meter, IDB schema-drift guard)

⚡ #1232 #1234 #1233 #1235 #1231: voice-cache + settings-write storage-blocking

## 14 Aug 2026 — 0.42.2 (⚡ Voice-cache: in-memory LRU ledger replaces per-store getAll, readonly cache reads, debounced synth meter, IDB schema-drift guard)

The v36 storage-blocking cluster (round 2) — the on-device Bangla voice cache and
the settings-fetch path no longer burn the main thread:

- **#1232 no more per-store getAll** — `voiceCachePut` used to `getAll()` + sort
  the WHOLE wave cache on EVERY store to enforce the byte cap (O(n) inside a
  readwrite tx, ~30× in a row during idle pre-synthesis). It now keeps an
  in-memory LRU ledger `{key,bytes,ts}` seeded ONCE at cache open via a `ts`-index
  cursor (oldest-first, blobs never held), and eviction walks the Map head — no
  scan, no sort, no blob payloads in RAM.
- **#1234 readonly cache reads** — `voiceCacheGet` opened a `readwrite` tx just
  "so we can refresh ts", contending with concurrent pre-synthesis writes on the
  speech path. It now reads `readonly`; the LRU touch updates the in-memory ledger
  (moving the entry to the tail) and the rare on-disk ts refresh is a small
  deferred write (≤1/min/entry).
- **#1233 debounced synth meter** — `bumpCache` did a synchronous
  `localStorage.setItem(JSON.stringify)` on EVERY spoken line (hit or miss). It
  now coalesces into one trailing write per 500ms and always flushes on
  `pagehide` / tab-hide.
- **#1235 IDB schema-drift guard** — `openVoiceCache` hard-coded
  `indexedDB.open(CACHE_DB, 1)` with no migration path. Version is now a constant;
  `onupgradeneeded` REBUILDS a store that lacks the `ts` index (so LRU eviction
  can't silently break); `onblocked` waits up to 4s for the old connection to
  close instead of silently disabling the cache.
- **#1231 skip redundant settings writes** — `fetchKidSettings` serialized the
  full multi-kid settings map on EVERY successful fetch even when the server
  returned the exact same settings. It now compares (JSON equality) and skips the
  `setItem` when nothing changed.

Runtime-verified against real IndexedDB (seed 34MB → put → LRU evicts the oldest
5; touch moves an entry to the tail so it survives the next eviction; metric write
= 1 coalesced write, flush-safe). The DEV test hook folds out of the prod bundle.

## 14 Aug 2026 — 0.42.1 (⚡ Storage-blocking: debounced persist, memoized reads, coalesced wrong-tap stories, bounded outboxes)

b32a655 ⚡ storage-blocking: debounced persist (150ms trailing), memoized settings/playtime reads, coalesced wrong-tap stories, hard-capped outboxes (#1227 #1230 #1228 #1229)

## 14 Aug 2026 — 0.42.1 (⚡ Storage-blocking: persist writes debounced 150ms, settings/playtime reads memoized, wrong-tap stories coalesced, outboxes hard-capped)

⚡ #1227 #1230 #1228 #1229: storage-blocking — no more per-set full-state stringify, no per-render re-parse, bounded outboxes

## 14 Aug 2026 — 0.42.1 (⚡ Storage-blocking: persist writes debounced 150ms, settings/playtime reads memoized, wrong-tap stories coalesced, outboxes hard-capped)

The v36 storage-blocking cluster — the kid app's hot path no longer pays a full
JSON.stringify + localStorage write on EVERY action, and the persisted blobs stay
bounded no matter how long a kid plays offline:

- **#1227 debounced persist** — the zustand persist config now uses a custom
  `storage` adapter that wraps `createJSONStorage` with a TRAILING-EDGE 150ms
  debounce. N rapid actions (round + wrong taps + coin award…) coalesce into ONE
  write of the LATEST snapshot; both the stringify AND the localStorage write
  happen in the flushed call. `pagehide`/`beforeunload` flush synchronously, so a
  normal tab close never loses the trailing snapshot.
- **#1230 memoized sync reads** — `cachedKidSettings` and `todayMinutes` (the
  first-paint / daily-limit render-path reads) used to `JSON.parse(localStorage)`
  on EVERY call. They now read a module-level in-memory cache that's parsed once
  and kept fresh on the explicit write path (`fetchKidSettings` /
  `addTodayMinutes`).
- **#1228 wrong-tap burst coalescing** — `recordWrong` (the hottest drill-scene
  path) no longer appends a Kotha story per tap: consecutive wrongs on the SAME
  skill within 5s collapse into ONE story whose wrongStreak / wrong+correct
  answers / latest diagnosis keep updating. A keypad mash = one story, not dozens.
- **#1229 bounded outboxes** — stories/pending/accel only shrank on server
  confirm (STORY_QUEUE_CAP just triggered a drain). Now a hard offline ceiling
  `STORY_HARD_CAP` (600 = 2× the drain cap) stops queueing NEW entries past it:
  the already-queued ones stay intact and drain FIFO the moment we're online; the
  latest learning still lands in mistakes/moni. The persisted blob can't balloon.

## 14 Aug 2026 — 0.42.0 (💥 Reward fairness: effort pays — coins tier by difficulty, mastery bonus, garden scales, every one of the 130 scenes celebrates)

The reward economy finally distinguishes a hard win from a trivial tap (v36 oracle
sweep 4 — reward-overlap/feedback-escalation):

- **#1187 coins tier by difficulty** — `novaAwardRound(kidId, correct, difficulty)`
  pays 1 / 2 / 3 coins at level 1-3 / 4-5 / 6+ (was a flat 1 for everything).
  Score already scaled by difficulty; now the coin economy does too. Daily cap holds.
- **#1188 mastery bonus** — the single BIG moment now pays +`NOVA_MASTERY_REWARD` (5)
  on top of the round payout (once per skill, inside the cap), alongside the pet
  grow + confetti.
- **#1190 garden scales** — `waterGarden(g, amount)`: a level-4+ correct waters 2
  (stage up in 2 instead of 3); easy rounds keep the 3-correct cadence.
- **#1061/#1062/#1067 celebration reads difficulty** — `correctCelebrate(scene,x,y,opts)`
  accepts/reads the round's difficulty (`nv:difficulty` on scene.data, set by every
  base + core scene). Hard problems (level 4+) escalate even at combo 1
  ("Tough one! 💪" + star burst) and the combo words gain a 🔥 register.
- **#1197/#1198 every scene celebrates** — the config bases (binSort/tapChoice)
  now call `correctCelebrate`, and all 130 completable scenes route through a
  reward path (was 11/150). A correct answer gets confetti + combo everywhere.
- **#1206 reward-parity guard** — `scripts/lint-scene-reward.mjs` fails the build
  if any completable scene ships without a reward path; wired into the Oracle as
  the new "Scene Reward Parity" gate (release.sh enforces it).

## 14 Aug 2026 — 0.41.1 (🐛 3D Nova island stays lazy: three.js no longer prefetched on cold start (three-vendor = three only, modulePreload off))

604e0a6 🐛 #691: keep the 3D island genuinely lazy (no three.js on cold start)

## 14 Aug 2026 — 0.41.0 (🦉 3D Nova offline + gating: Workbox 5MiB cap, wasm+glb precached, three-vendor split (island 36KiB), native OrbitControls, Oracle 3D Nova Perf role, v32 CHANGELOG)

5dae29e 🦉 #691: offline precache under 5 MiB cap + Oracle 3D Nova Perf role

## 14 Aug 2026 — v32 — 3D Nova island (complete)

The 3D Nova island (epic #755) is fully shipped and offline-safe:

- **Foundation** (#684/#685/#686): lazy three.js island (own chunk, <1.5MB cold
  start), WebGL probe + graceful 2D fallback, meshopt-compressed nova.glb
  (458KiB) precached offline
- **World** (#687): 12 themed 3D rooms (EN+BN), PBR lighting, one 1024² PCF
  soft shadow, orbit/zoom camera with reduced-motion clamps
- **Play** (#688): 51 spatial activities re-hosted as 3D actions, walk-to-tap,
  3D feed/pet/bathe, dress-up
- **Progress** (#689): egg→grown petStage scale + species tints, 3D outfits,
  garden plants + growth toast, coin badge (EN+BN)
- **Safety + perf** (#690): DynamicResolution (frame-time DPR), reduced-motion
  freeze + opacity-only burst (WCAG 2.3.1), flash throttle ≥350ms, canvas
  aria-label + spoken feedback
- **Offline + gating** (#691): Workbox cap 5MiB, three/R3F + Phaser split into
  cacheable vendor chunks (island 168KiB, three-vendor 884KiB, genuinely
  lazy — three.js no longer prefetched on cold start), Oracle
  "3D Nova Perf" role rides release.sh

## 14 Aug 2026 — 0.40.3 (🦉 3D Nova vestibular+perf: dynamic resolution, reduced-motion freeze, opacity burst, flash throttle, aria-label+speak)

0b085cb 🦉 #690 vestibular + perf safety for the 3D island

## 14 Aug 2026 — 0.40.2 (3D Nova #689: petStage egg→grown scale + species tints, 3D outfits, garden plants + growth toast, coin badge (EN+BN))

485e808 🦉 3D NOVA: wire garden, coins, outfits, species to the owl (#689)

## 14 Aug 2026 — 0.40.1 (3D Nova spatial activities: OwlRig action palette, walk-to-tap, 3D feed/pet/bathe, dress-up (#688))

41a5ce6 🦉 #688: spatial activities — OwlRig maps all 51 activities to 3D clip+morph, action palette, walk-to-tap, 3D feed/pet/bathe, dress-up

## 14 Aug 2026 — 0.40.0 (3D Nova home room: 12 themed rooms + PBR lighting + soft shadow + orbit camera (#687))

3e3c116 🦉 #687: 3D home room — 12 themed rooms, PBR lighting, one 1024² PCF soft shadow, orbit/zoom camera with reduced-motion clamps

## 14 Aug 2026 — 0.39.2 (stylized-realistic Nova owl model — armature + 6 emotion morph targets + 6 animation clips, KTX2 PBR (#686))

b54bcc9 🦉 #686: stylized-realistic Nova owl — armature + morph targets, KTX2 PBR

## 14 Aug 2026 — 0.39.1 (fix API 422s on /progress + /stories (fractional response_ms) — also ships blue-screen + splash SVG fixes from 0.39.0)

1d98d4b 🐛 fix API 422s on /progress + /stories: round fractional response_ms

## 14 Aug 2026 — 0.39.0 (fix blue screen + splash Nova SVG (regressions from #591/#589))

aa981eb 🐛 fix blue screen (HomeScreen bare JSX → proper return) + splash Nova SVG (unquoted attrs → TDZ cycle)

## 14 Aug 2026 — 0.38.0 (glTF asset pipeline: meshopt-compressed Nova owl (35 KB) precached offline (#685))

2a31d01 🗂️ #685: glTF asset pipeline — procedural owl source → meshopt-optimized nova.glb

## 14 Aug 2026 — 0.37.0 (3D Nova foundation: lazy three.js island + WebGL context lifecycle (#684))

c937d03 🦉 #684 3D Nova foundation: lazy three.js island + WebGL context lifecycle

## 14 Aug 2026 — 0.36.0 (Pet mini-games batch 3: Hide & Seek + Pet Memory + Tuck-in (#604 #611 #601))

b7fa638 🎮 pet mini-games batch 3: Hide & Seek + Pet Memory + Tuck-in (#604 #611 #601)

## 14 Aug 2026 — 0.35.0 (Pet mini-games batch 2: Bath Time + Pet Stroke + Sort Treats (#600 #599 #614))

45ba285 🐛 audit: rename TreatSort data keys to lowercase (avoid camelCase i18n false positive)
767f4f6 🎮 pet mini-games batch 2: Bath Time + Pet Stroke + Sort Treats (#600 #599 #614)

## 14 Aug 2026 — 0.34.0 (Pet mini-games: Catch Fruit + Bubble Pop + Fetch (#597 #605 #606))

c31ccb0 🎮 pet mini-games launch surface: Catch Fruit + Bubble Pop + Fetch (#597 #605 #606)

## 14 Aug 2026 — 0.33.0 (PictoGraph (#65): one picture = 2/5/10 · fewest-notes money lesson + spoken note names (#66))

efaf304 📊💵 #65 + #66: PictoGraph (one picture = 2/5/10) + fewest-notes money lesson

## 14 Aug 2026 — 0.32.0 (Measurement scene (#63): compare length (cm/m), weight (kg/g), capacity (L/mL) — EN+BN spoken)

1ef715a 📚 ROADMAP_NEXT: refresh from clean 2026-08-12 oracle standup
a6eeb5b 📏 #63 Measurement: compare length (cm/m), weight (kg/g), capacity (L/mL)

## 14 Aug 2026 — 0.31.1 (Odd & Even spoken EN+BN feedback (#746) + engagement pass 45/45)

a22b3d7 🗣️ #746 Odd & Even: spoken EN+BN feedback on every state

## 14 Aug 2026 — 0.31.0 (decompose kid App.tsx monolith (#589): i18n + domain layer + 6 components; daily-hook above the fold)

57d3ded ♻️ guardian checks scan full src tree (survive #589 extraction) + retention reorder
1b463a8 🏠 #589 extract home screen → components/HomeScreen.tsx (App.tsx 5394→4618)
50fb4ae ♻️ #589 extract pure domain layer → lib/journey.ts + avatar components
3e9516b ♻️ #589 extract i18n pack + 4 components from App.tsx (8669→6360 lines)

## 14 Aug 2026 — 0.30.2 (parent portal: decompose dashboard into components/ + lib/portal (#620))

ff23254 Merge pull request #696 from numberverse-org/fix/620-decompose-dashboard
7cd3f87 ♻️ refactor: decompose parent dashboard into components/ + lib/portal (#620)

## 14 Aug 2026 — 0.30.1 (kid design tokens: 12 hardcoded colors centralized to NV_* / --nv-* palette (#591))

ba23e81 🧹 chore: own 3D Nova roadmap-filing tool (three_d_nova.py)
e6c1555 Merge pull request #695 from numberverse-org/fix/591-kid-tokens
a96a515 🎨 kid tokens: centralize 12 hardcoded colors into NV_* / --nv-* (#591)
c25fcb8 Merge pull request #694 from numberverse-org/fix/621-parent-tokens
f309d88 🎨 parent: route hardcoded brand colors through --nv-* tokens (#621)
a46d35a Merge pull request #693 from numberverse-org/fix/622-inline-styles
ee9a0b0 🎨 parent: move static inline styles into spacing utility classes (#622)
247eb03 Merge pull request #692 from numberverse-org/feat/619-parent-nav
2047c8d 🧭 parent: persistent section navigation for all 26 portal sections (#619)
f91e1d2 Merge pull request #683 from numberverse-org/fix/590-touch-targets
cf26416 👆 fix: enlarge touch targets to ≥44px on small buttons (#590)
36128e2 Merge pull request #682 from numberverse-org/fix/586-dep-advisory
52ccff0 🔒 fix: upgrade nanoid to patched 3.3.18 via pnpm override (#586)
35cbf2e Merge pull request #681 from numberverse-org/fix/585-small-text
c7fe9ba ♿ fix: raise sub-11px font sizes to accessible minimum (#585)

## 14 Aug 2026 — 0.30.0 (skill of the week + compare & order fractions + shapes sides & corners)

f3076c3 Merge pull request #680 from numberverse-org/feat/100-skill-of-week
8f94026 🏅 kid: skill-of-the-week challenge + Week Warrior badge (#100)
2eca5d8 Merge pull request #662 from numberverse-org/chore/oracle-top50-tool
6a2d9c4 🦉 oracle: curriculum top-50 issue-filing tool (pipeline tooling)
95f97ff Merge pull request #628 from numberverse-org/feat/62-shape-parts
63b806a 📐 math: 2D shapes — count sides & corners with tap-to-count (#62)
5ed3aa4 Merge pull request #627 from numberverse-org/feat/61-compare-fractions
6c3c4fc 🍕 math: compare & order fractions with pizza visuals (#61)

## 14 Aug 2026 — 0.29.0 (8 new games: Bangla days/months, Bangla spelling, pronouns, count-back, CVC build, plurals, past -ed, case match)

e62d647 Merge pull request #626 from numberverse-org/feat/51-53-54-56-en-pack
78e853f 🇬🇧 en: CVC builder, regular plurals, past -ed, case match (#51 #53 #54 #56)
2ed1814 Merge pull request #617 from numberverse-org/feat/43-44-48-49-bn-pack
4cef0b4 🇧🇩 bn: Bangla days/months order + spelling builder + pronouns + count-back (#43 #44 #48 #49)

## 14 Aug 2026 — 0.28.0 (parent: sync status chip + manual sync + Help card)

7977795 Merge pull request #612 from numberverse-org/feat/18-help-card
73e3fdd ❓ parent: in-app Help card — iOS install + voice download guide (#18)
dd10904 Merge pull request #595 from numberverse-org/feat/85-sync-indicator
d8ad169 🔄 parent: sync status chip + manual sync (#85)

## 14 Aug 2026 — 0.27.1 (hotfix: achievements TDZ blue-screen crash)

4a10526 Merge pull request #594 from numberverse-org/hotfix/27.1-blue-screen
e49e04e 📄 docs: 0.27.1 blue-screen hotfix work order
fb3602e 🐛 fix: achievements BN digit TDZ crash — move BN_DIGITS/bnNum above ACHIEVEMENTS (blue screen)
cc2d143 Merge pull request #593 from numberverse-org/feat/8-share-coins
7499eee 🪙 share: coins + 7-day minute breakdown on weekly card (#8)
1522cde Merge pull request #592 from numberverse-org/feat/7-debug-card
5c5a0a3 🩺 parent: local-only diagnostics card (#7)

## 14 Aug 2026 — 0.27.0 (7 new science/ICT/BGS games + parent streak & mastery timeline)

3ac3a0b Merge pull request #588 from numberverse-org/fix/release-sigpipe
df8faf8 🐛 fix: release changelog SIGPIPE when >30 commits since last tag (#release-train)
a5acaeb Merge pull request #587 from numberverse-org/feat/79-mastery-timeline
8b488bb 🏆 parent: mastery timeline — when each skill was won (#79)
882fe92 Merge pull request #584 from numberverse-org/feat/4-streak-playtime
e7d1b52 🔥 parent: weekly streak + playtime vs cap (#4)
3266702 Merge pull request #583 from numberverse-org/feat/77-habits
8d79737 🌟 feat: Good habits & hygiene game (#77)
e4eb2a5 Merge pull request #582 from numberverse-org/feat/74-computer-safety
2bde49f 🖥️ feat: Computer parts & safety game (#74)
1719980 Merge pull request #581 from numberverse-org/feat/73-materials
c0f3175 🧱 feat: Materials — wood/metal/plastic/glass sort game (#73)
a6abfc8 Merge pull request #580 from numberverse-org/feat/72-food-source
94dfc5a 🍎 feat: Food sources — plant or animal game (#72)
904d79c Merge pull request #579 from numberverse-org/feat/71-five-senses
375b300 👀 feat: Five Senses game (#71)
9c108d7 Merge pull request #578 from numberverse-org/feat/69-plant-parts
2e29fb5 🌱 feat: Plants — parts & needs game (#69)
7b852f9 Merge pull request #577 from numberverse-org/feat/68-living-sort
c562e44 🧬 feat: Living & Non-living sort game (#68)
d4cf3f7 Merge pull request #576 from numberverse-org/docs/backlog-hygiene
fb2a737 📚 docs: backlog hygiene — 22 duplicate issues closed
1bfa755 Merge pull request #575 from numberverse-org/feat/89-missed-questions
b856d68 ❌ feat: per-skill missed questions for parents (#89)
0607902 Merge pull request #574 from numberverse-org/feat/272-instant-pause
fa06f1e ⏸️ feat: instant pause — parent kill-switch (#272)
654b4e0 Merge pull request #573 from numberverse-org/feat/259-bedtime-winddown
777474b 📚 docs: close #259 as duplicate of #248
23e65e5 Merge pull request #572 from numberverse-org/feat/258-voice-preference
caf33cd 🗣️ feat: per-kid voice preference (#258)

## 13 Aug 2026 — 0.26.16 (per-day wrong-answer history + playtime caps + band lock + data export)

be0df42 docs: mark #273 work order done (merged #432)
43e554e feat: parent-facing data export (#273) (#432)
7fb11a0 feat(safety): server-side age-band lock on progress + stories (#275) (#431)
facd365 feat(playtime): per-weekday caps with gentle enforcement (#6) (#430)
b4d83bd feat(kid): per-day wrong-answer history in the parent panel (#78) (#429)

## 13 Aug 2026 — 0.26.15 (parent PIN lock + guardrail housekeeping)

97dee44 feat(kid): parent-area PIN lock (#86) (#428)
9f8e66a docs: mark #90 shipped (privacy audit)
26b852b 🔒 Privacy data-minimization audit (#90): docs/PRIVACY.md — every stored field justified (#427)
9c37312 docs: mark #93 shipped (share-PNG metadata stripper)
e664b78 🖼️ Kid-safe share PNGs (#93): stripPngMetadata in core + zero-metadata test (#426)
108ae27 docs: mark #91 #92 shipped (content-safety + no-ads gates)
236d72b 🛡️ Content-safety + no-ads CI gates (#91 #92): dedicated fail-closed scans with allowlist (#425)
012e2cc docs: TRACKER housekeeping batch (pg backup, offline verify, auto-rollback, uptime monitor, cold-start baseline)
183cdf1 🐢 Cold-start baseline (#117): PERF_COLDSTART.md — entry is the tail; engine already lazy; device needed (#424)
c8e1d50 docs: mark #123 shipped (uptime monitor)
6e3c587 🔔 Uptime monitor → Telegram alert (#123): 5-min probe + false-alarm guard + recovery (#423)
5231b5e docs: mark #125 shipped (auto-rollback)
5d80e7b ↩️ Auto-rollback on failed deploy (#125): version-tagged images + origin-aware rollback (#422)
b77104c docs: mark #114 shipped (offline verification)
bc98644 📴 Offline verification (#114): docs/OFFLINE.md — test matrix + zero network on boot (#421)
5c6e817 docs: mark #122 shipped (pg backup cron live on box)
41c053f 🗄️ Postgres backup schedule to box disk (#122): pg_backup.sh dump + retention + restore drill (#420)
5b1de5a docs: mark #120 #121 #124 #126 #129 released in 0.26.14; harden smoke test against Cloudflare cache lag

## 13 Aug 2026 — 0.26.14 (CI oracle gate, post-deploy smoke test, secrets hygiene scan, structured error log)

6ef237f 📝 Structured error log (#124): rotating JSON-lines error file, PII-redacted (#419)
ee9ae85 🛡️ CI secrets hygiene scan (#126): secret-scan.mjs gate + job (#418)
e379731 🦉 CI oracle gate (#120): --ci mode skips box-only roles; oracle PR job (#417)
b56f740 🔧 Release hygiene: post-deploy smoke test (#121) + current RELEASING.md (#129) (#416)
3959f6b docs: TRACKER entry for 0.26.13 release
9e8ad48 docs: mark #266 #267 #268 #270 #271 released in 0.26.13

## 13 Aug 2026 — 0.26.13 (guardrail sweep: PII log scrubber, scheme allowlist, console-log scan, story context redaction, license gate)

51c64bb 🛡️ Guardrail sweep: PII log scrubber (#266), scheme allowlist (#267), console scan (#268), story redaction (#270), license gate (#271) (#415)
2fea4f2 docs: TRACKER entry for 0.26.12 release
7b18356 docs: mark #274 #290 #350 #351 released in 0.26.12

## 13 Aug 2026 — 0.26.12 (rate-limit guardrail, mastery celebration, reduced-motion mode, keyboard navigation)

121f021 🎨 #351 Keyboard navigation for parent area: focus-visible rings + roving-tabindex kid switcher (#414)
2ee741c 🦋 #350 Reduced-motion mode: OS-aware + in-app toggle, gates canvas motion (#413)
b0bb6d0 🎉 #290 Mastery confetti + spoken cheer at the instant a skill is mastered (#412)
e9960d2 🛡️ Guardrail #274: rate-limit story + progress write endpoints (#411)
a90078a docs: mark #409 released in 0.26.11

## 13 Aug 2026 — 0.26.11 (UI/UX polish: demo-mode-only credentials, portal spinner, localized Back)

113d221 🎨 UI/UX polish: demo creds demo-mode-only, portal session spinner, localized Back labels (#410)
caa3b86 docs: mark #407 released in 0.26.10

## 13 Aug 2026 — 0.26.10 (Parent-area cleanup: no Class Insights, one parent page, portal auth gate)

8e5c5af 👨‍👩‍👧 Parent-area cleanup: no Class Insights on user face, ONE parent page, real portal security (#408)
83ccae5 docs: mark #405 released in 0.26.9

## 13 Aug 2026 — 0.26.9 (Access control: kid-only Settings + gated parent area (#405))

0cfb08c 🔐 Access control: kids never reach parent things; kid-only Settings restructure (#406)
e825900 docs: mark #403 released in 0.26.8

## 13 Aug 2026 — 0.26.8 (Settings redesign + double-TTS fix (#403))

3d047ad 🎛️ Settings redesign (kid-facing) + fix double-TTS (neural + web speaking at once) (#404)

## 13 Aug 2026 — 0.26.7 (nginx /parent redirects preserve https (#401))

d93053a 🔒 #401 nginx: /parent + /admin redirects preserve https through the tunnel (#402)

## 13 Aug 2026 — 0.26.6 (Parent portal reachable — kid SW no longer swallows /parent/ + clean portal URL (#399))

1bbf022 🐛 #399 Fix: kid SW swallows /parent/ (browser saw the GAME at the portal URL) (#400)

## 12 Aug 2026 — 0.26.5 (Settings UX: parent-portal door + cleaner cards + natural Bangla (#397))

00de752 🎛️ #397 Settings: parent-portal door + cleaner cards + natural Bangla (#398)

## 12 Aug 2026 — 0.26.4 (Round placeholder fix (#393) + natural Bangla world/level names + syllabus FAB (#394))

b9ad356 🇧🇩 #394 Natural Bangla world/level names + syllabus FAB (#396)
91d6da1 🐛 #393 Fix: frameText drops round vars — 'Round {n}' literal placeholders (#395)

## 12 Aug 2026 — 0.26.3 (Google button always in the app language (no more German))

185f64a 🔤 #391 Auth: pin Google button language to the app (no more 'Weiter mit Google') (#392)

## 12 Aug 2026 — 0.26.2 (Bangla voice no-latin fallback + API schema-drift migrations)

dc5ba13 🛡️ #388 API: idempotent column migrations — schema drift can't 502 the API (#390)
7bb7881 🗣️ #387 Voice: never read Bangla with a non-Bangla voice (#389)

## 12 Aug 2026 — 0.26.1 (Bangla voice pronunciation fix + Google sign-in hardening + parent gate UX)

d7d3bac 🎨 #383 Auth: parent gate UX — single action, show/hide password, hints (#386)
5dc5b88 🔐 #382 Auth: Google sign-in hardening — retry, backend check, fallback (#385)
2d89bd0 🗣️ #381 Voice: Bangla TTS pronunciation — normalizer before synthesis (#384)

## 12 Aug 2026 — 0.26.0 (v26 complete — Kotha RAG + Moni adaptive suite)

fcfcefb 📚 #322 Kotha: story inspector in parent panel (list + filters, offline) (#380)
30c6dbd 📚 #323 Kotha: semantic RAG retrieval endpoint (top-K, privacy-scrubbed) (#379)
e9f8b5e 🎯 #325 Moni: misconception contrast drills (code-tied templates, warm, offline) (#378)
c528fc1 📅 #326 Moni: weekly insight card for parents (style, pace, best game — local) (#377)
fd01db3 🦉 #327 Moni: fatigue-aware session pacing (gentle break screen, never blocks) (#376)
4a43201 🦉 #328 Moni: confidence-based review schedule (due list per kid, gentle prompts, offline) (#375)
25a5371 🧠 #329 Kotha: batch-embed stories to pgvector (gte-small, idempotent, scheduled) (#374)
33877c5 🔭 #330 Kotha: privacy-scrubbed cross-kid aggregates (opt-in, zero PII) (#373)
68a7c71 🧹 #331 Kotha: story dedup (kid+uid) + retention prune, active skills safe (#372)
e4666ae 📊 #336 Kotha: admin story health dashboard (counts + breakdown, rate-limit aware, PII-free charts) (#371)
44d12dc 🏅 #332 Moni: learning-style surface — fast/steady/social Nova badge (#370)
b1f8c0f 🎚️ #333 Moni: parent-adjustable strictness (gentle/steady/challenging, offline) (#369)
bb931d4 📚 #334 Kotha: offline story queue quota (cap + drain, no data loss) (#368)
ae23e99 🖐️ #335 Moni: per-skill error fingerprinting (#367)
23149a9 🎭 #337 Adaptive: question-framing rotation beats repetition fatigue (#366)
e179dbc 🎯 #338 Moni: top-3 practice goals for parents (plain-language why) (#365)
efaf696 📄 #340 Kotha: weekly digest export (text, local, no cloud) (#364)
720e2a2 💤 #341 Moni: surface per-kid session-length recommendation (#363)
1a82773 🎯 #342 adaptive: hint-ladder reveal depth scales with Moni confidence (#362)
f239f5d feat: Kotha story search by skill/error-kind + counts (Closes #339) (#361)

## 12 Aug 2026 — 0.25.0 (release train (2 since 0.24.1))

73e8570 feat: build to 999 — three-digit numbers with hundred-flats (Closes #40) (#360)
75512b6 feat: place value to 9999 — base-10 blocks visual + i18n'd question (Closes #60) (#359)

## 12 Aug 2026 — 0.24.1 (Moni plan-driven sessions + TRUE semver versioning)

65b5aab chore: TRUE SEMVER versioning (0.MAJOR.MINOR.PATCH) across the release pipeline
9cef112 Merge pull request #358 from numberverse-org/feat/issue-324
a4c5742 feat(kid): Moni plan-driven sessions — the tiny tutor picks the skill, difficulty, and pace
9c70412 chore: work order #324 — Moni: plan-driven difficulty in gameplay
22beaa6 🚀 backlog 300: oracle clean (35/35 + 70/70), 8 new epics, 199 new issues → 312 open
17125d7 track: v28 shipped — parent portal same-tab + parent-only signout + no kid remove + MONI insight card & KOTHA stories lake (#157 done)

## 12 Aug 2026 — v28 (parent portal same-tab deep link + parent-only sign-out + no kid remove + MONI tutor insight card & KOTHA stories lake)

fe8d2bb chore(team): commit backlog_300 oracle roadmap generator (repo-owned tool)
f7dd841 fix(kid): parent portal same-tab + parent-only sign-out + no kid remove (#157)
1546669 track: v27 shipped — best-UI/UX parent panel + deep link to full portal (#156 done)

## 12 Aug 2026 — v27 (best-UI/UX parent panel — family summary hero + deep link to full parent portal)

ffdaaaa chore(core): commit moni tutor module (per-child learning model) + index wiring
d9cf399 feat(kid): best-UI/UX parent panel — family summary hero, stat tiles, richer kid picker + deep link to the full parent portal (#155)
7f6f3a2 track: v26 shipped — secure parent portal, revocable sessions, logout, account + family overview (#154 done)
4ff3e9d fix(infra): nginx serves .html for /parent/ — the portal dashboard (parent.html) was unreachable, /parent/parent fell through to login
6bb44f1 fix(api): sessions timestamps — use naive UTC to match Postgres TIMESTAMP (aware subtraction 500'd every authed request)

## 12 Aug 2026 — v26 (secure parent portal — revocable sessions, logout, account & family overview)

f2b49c8 feat: secure parent portal — revocable sessions, logout, account & family overview (#153)
1de96aa track: google sign-in activated live — client id set on box env, endpoint verifies (401), button live
ab7d6a6 track: board synced — v22–v25 filed as Done issues (#149–#152); google sign-in status documented
2fb3645 track: v25 released — syllabus GRID + semver versioning 0.25.0

## 12 Aug 2026 — v25 (eye-catching syllabus GRID (no EN/BN mixing) + semver versioning 0.25.0)

5c4b4bc feat: eye-catching syllabus GRID (no EN/BN mixing) + semver versioning (0.x.0) (#148)
2d157fd track: v24 released — guest → parent upgrade path

## 12 Aug 2026 — v24 (guest → parent upgrade (sign in / create account from inside the app))

ee1b799 feat(kid): guest → parent upgrade path (sign in / create account from inside the app) (#147)
e910d7e track: v23 released — google sign-in + first-time language pick + binary guest/signin + pre-login syllabus

## 12 Aug 2026 — v23 (google sign-in + first-time language pick + binary guest/signin + pre-login syllabus)

b289a00 feat: google sign-in + first-time language pick + binary guest/signin + pre-login syllabus (#146)
b0ca844 track: v22 released — parent sign-in gate + interactive syllabus

## 12 Aug 2026 — v22 (parent sign-in gate + interactive syllabus)

e0baf84 feat(kid): parent sign-in gate on first load + interactive syllabus (#145)
8dabcdf track: v21 released — course indexing realigned with the brain (#143)

## 12 Aug 2026 — v21 (course indexing realigned with the brain (numbers first, game-first, EN/BN mirrored))

2e95d33 🧠 Course indexing: realign with the brain (numbers first, game-first, EN/BN mirrored) (#144)
de2c202 track: v20 released — column math with regrouping (#59); #60 next in-progress

## 12 Aug 2026 — v20 (3-digit add/sub with regrouping (written method))

732cea8 🎓 Column Math: 3-digit add/sub with regrouping (Carry & Borrow) (#142)
983ddb9 track: v19 released — division by fair-sharing (#58); #59 next in-progress

## 12 Aug 2026 — v19 (Division by fair-sharing (sharing animation → number mode))

c63985a feat(kid): division by fair-sharing — sharing animation → number mode (#58) (#141)
6d134a4 track: v18 released — times tables 2–10 arrays-first (#57); #58 next in-progress

## 12 Aug 2026 — v18 (Times tables 2–10 with arrays-first teaching)

1dd88b5 feat(kid): times tables 2–10 with arrays-first teaching (#57) (#140)
de4d4f9 track: next-ship batch 1 — v18 top five groomed (todo×4, in-progress #57)
5c97555 docs: Oracle Council weekly brief 2026-W33 (70/70 clean, zero flags)
5beb992 docs: oracle-driven next-100 roadmap (6 new epics, 100 issues, generator versioned)

## 12 Aug 2026 — v17 (Mastery gate: kid must clear current-step wrongs before advancing)

2927bf3 feat(kid): mastery gate — must clear current-step wrongs before advancing (#38) (#39)

## 12 Aug 2026 — v16 (Wrong-answer ledger + resolve-to-complete)

baec1f3 feat(kid): wrong-answer ledger + resolve-to-complete (#36) (#37)

## 12 Aug 2026 — v15 (Count to 100 + place-value rods)

6793bc4 feat(kid): count to 100 with place-value rods (#11) (#35)

## 11 Aug 2026 — v14 (Neural voice on-device + Phaser async chunk)

0e273f9 fix(audit): point scene registry checks at engine.ts (issue #15)
cadd811 feat(kid): split Phaser into an async chunk — cut first paint (#15)
c681271 Merge pull request #34 from numberverse-org/feat/issue-29
9e3180f fix(voice): on-device Bangla neural voice reliability — no re-download, no hang, Safari-compatible
6ed24de docs: #29 — ORT 1.27 single-thread de-risk + browser-wasm QA kit
75b9274 Merge pull request #33 from numberverse-org/feat/issue-29
ed3b52f int4: verified weight-only block-wise quantizer for #29
d902b04 chore: work order #29 — tech: int4 model cut needs an ORT upgrade (blocked on onnxruntime 1.17 — see #28)
d00acaf docs: TRACKER v13 released — neural voice boot preload + WAV cache

## 11 Aug 2026 — v13 (release train (2 since v12))

a9b8697 feat: per-line neural WAV cache (IndexedDB LRU) + idle pre-synth of common phrases (#31) (#32)
3069ae6 feat: faster first-run neural TTS — boot preload + parallel fetch + gzip'd /voice/ (#28) (#30)
04531e6 docs: TRACKER v12 released — iOS speech auto-unlock fix
7cbd49a docs: work order #26 — complete, released in v12

## 11 Aug 2026 — v12 (release train (3 since v11))

aa49cc1 fix: release-train commit count — --format=%s (--oneline hashed prefix broke ^(feat|fix) match)
15cf20f Merge pull request #27 from numberverse-org/feat/issue-26
8a75b4c fix(speech): unlock Web Speech on EVERY gesture until proven — game no longer silent until Listen tap
4859b86 chore: work order #26 — Game doesn't speak until 'Listen' button is tapped first
2ee19a5 docs: TRACKER — v11 release entry
06cb625 fix: pipeline board() cats numberverse-board.md (stale reference)

## 11 Aug 2026 — v11 (Taka Tap v2 — give-change + ৳5/৳20 notes)

7e9dc6d fix: release.sh stamp bump — python UTF-8-safe (perl choked on ৳ in summary)
0f92d01 Merge pull request #25 from numberverse-org/feat/issue-3
41d7cf8 docs: work order #3 — CI green 4/4, ready to merge
d8dd001 fix: label-pr uses context.issue.number (reliable for PR events)
efd7851 feat(bd-taka): give-change mode (levels 7-9) + ৳5/৳20 in payment pool
57b32f9 docs: TRACKER — 24/7 pipeline entry
34777f6 fix: pipeline — log to numberverse-pipeline.log (was colliding with old log), robust pick guard (null issue), docs log paths
f72a023 chore: work order #3 — Taka Tap v2: give-change mode + ৳5/৳20 notes
415a248 chore: launchd plists for pipeline conductor + release-train (24/7)
1128519 feat: 24/7 automated pipeline — conductor + release-train (launchd), parallel CI (4 gates), project-done sync, docs
5d1fb4d docs: Projects v2 live (Numberverse Roadmap) — backfill, kanban status, auto-add
15b12b7 chore: new issues land on project in Backlog column
1b0ad1e chore: auto-add new issues to Numberverse Roadmap project
e3673ae chore: simplify triage.yml
511ba36 chore: touch triage.yml (force workflow re-scan)
6456c59 feat: issue board (21 backlog issues, 5 epics, auto-triage) + automated release pipeline (release.sh, release.yml, docs)
e74e57b 📚 TRACKER: GitHub org setup (numberverse-org) — CI live, auto-assign, teams, CODEOWNERS
b18e97f 🏢 org setup: CODEOWNERS → @numberverse-org/maintainers · README CI note
441d975 🔧 ci: Node 22 — pnpm@11.20 needs ≥ v22.13 (node:sqlite)
964c3e9 🏢 repo moved to numberverse-org · checkpoint
21c130f Merge pull request #1 from bdlogicalerror/chore/github-proper
9cefa0e 🧹 remove diagnostic probe workflow
19d6229 probe: minimal workflow
0a79af3 🔧 ci: quote on: key — fixes workflow startup (Actions YAML gotcha)
99dbe63 🏗️ GitHub proper: CI workflow + auto-assign issues + CODEOWNERS + PR/issue templates

