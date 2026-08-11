# 🎮 Numberverse — Product Tracker
> Last updated: 12 Aug 2026

## 🚀 v20 RELEASED — COLUMN MATH: 3-DIGIT ADD/SUB WITH REGROUPING (WRITTEN METHOD) 12 Aug 2026 ✅ (user: "yes" → build #59)
- **#59 — Carry & Borrow (new `Regroup` scene, `add-sub-regroup` skill / `game-regroup`):** written-method **column board** (O/T/H headers, stacked 3-digit operands, answer line, result slots) — solve **one column at a time right-to-left**, tapping each answer digit from 4 choices · **regrouping scaffolding**: CARRY = teal "1" chip pops above the next column + "Carry the 1!" voice; BORROW = the too-small top digit is struck through + shown as **+10**, and the lending column's reduced digit is displayed (full **cascade** on 3-digit double-borrow levels) · a 2-digit add that carries in the tens **rolls into a fresh hundreds column** (56+78→134) · **worked demo first** (`teach:true` → mastery-gate remediation re-demos): a small 2-digit example is auto-solved with narration (ones → regroup → tens → "See? a+b=c!") before the drills · escalating hints (nudge → coach with column arithmetic → reveal) · **problem math engineered** to stay inside the shown columns — no 4th digits, no negatives, no leading zeros (validated by a 120k-trial simulation) · levels ramp 2→3-digit, single→double regrouping · EN+BN i18n (headers, tap prompts, carry/borrow lines, demo script, win line).
- **Batch progress:** #57 ✅ (v18) · #58 ✅ (v19) · **#59 ✅ (v20)** → **#60 (place value to 9999) now 🔨 in-progress**; #40 still todo.
- **Pipeline:** `feat/regroup-3digit` → PR #142 (5/5 CI green) → merged (auto-closed #59) → `release.sh v20` → deployed → live bundle `assets/index-D8t_iLn7.js` carries v20 stamp + `add-sub-regroup`/`game-regroup` catalog + all Regroup i18n; engine chunk `engine-DLsv440A.js` carries the `Regroup` scene. Board + project synced.

## 🚀 v19 RELEASED — DIVISION BY FAIR-SHARING (SHARING ANIMATION → NUMBER MODE) 12 Aug 2026 ✅ (user: "yes" → build #58)
- **#58 — Fair shares (new `FairShare` scene, `div-facts-fair-share` skill / `game-share`):** divisors ramp per level 2 → 3 → 4 → 5 → 6-7 → 8-10 · **sharing animation first**: single-divisor levels animate every round — dividend apples fly one-by-one into divisor baskets round-robin so each basket visibly ends up with the SAME count (fair!), then the voice says "q in each basket!" and the equation flips to a question · first mixed round bridges, later mixed goes abstract with *"Now without the sharing!"* cue · `teach:true` keeps sharing on · escalating hints (share-count → repeated-fit → reveal) · high divisors get small countable quotients · EN+BN i18n.
- **Batch progress:** #57 ✅ (v18) · **#58 ✅ (v19)** → **#59 (3-digit add/sub regrouping) now 🔨 in-progress**; #40/#60 still todo.
- **Pipeline:** `feat/fair-share-division` → PR #141 (5/5 CI green) → merged → `release.sh v19` → deployed → live bundle `assets/index-BwSgLitZ.js` carries v19 stamp + FairShare scene + all tokens. GitHub Release v19 drafted. Board + project synced.

## 🚀 v18 RELEASED — TIMES TABLES 2–10 WITH ARRAYS-FIRST TEACHING 12 Aug 2026 ✅ (user: "yes" → build #57)
First v18 content-wave item shipped end-to-end: issue → PR → CI 5/5 → merge → release → deploy.
- **#57 — Times tables 2–10 (new `TimesTable` scene, `mult-facts-2-10` skill / `game-multable`):** tables ramp per level 2 → 3 → 4 → 5 → 6-7 → 8-10 · **arrays-first**: single-table levels always draw a concrete a×b dot grid (each row a distinct color → count rows × dots); the first mixed round bridges, then later mixed rounds flip to **number mode** with a one-time *"Now without the dots!"* cue — a visible concrete→abstract progression · `teach:true` (remediation) keeps the grid on · escalating hints (count-the-dots → repeated-addition → reveal) · products ≤ 100 · EN+BN i18n.
- **Pipeline:** `feat/times-tables-2-10` → PR #140 (5/5 CI green) → merged → `release.sh v18` → deployed → live bundle `assets/index-DrFLccLY.js` carries v18 stamp + TimesTable scene + all tokens. GitHub Release v18 drafted. Board + project synced.

## 🚀 NEXT SHIP — v18 CONTENT WAVE 2, BATCH 1 (5 issues) 12 Aug 2026 ✅ (user: "yes please" → groom the top of v18)
First v18 batch groomed and queued on the board — all `priority: high`, label-kanban + project Status in sync:
- **🔨 In progress (#57) — Math: multiplication tables 2–10** (arrays → number mode, escalating hints)
- **📋 To-do:** **#40** Bangla three-digit numbers 100–1000 (place value to hundreds) · **#58** Math division facts (fair shares) · **#59** Math 3-digit add/sub with regrouping · **#60** Math place value to 9999
- Board filters: `status: todo` → 4 cards · `status: in-progress` → 1 card (#57). Project cards: #57 = In progress, 40/58/59/60 = Backlog.
- Build order: **#57** (arrays → tables) → **#58** (fair shares → division) → **#59** (regrouping, pairs with #57/#58) → **#60** (thousands, builds on #40) → **#40** (Bangla three-digit, BN spoken)। Each ships on its own via the release train.

## 🗺️ ORACLE-DRIVEN NEXT-100 ROADMAP — 6 NEW EPICS · 100 ISSUES 12 Aug 2026 ✅ (user: "run oracle for next 100 issues or feature")
The Oracle Team standup (35/35 CLEAN) + Council brief (0 flags) held the line, then generated the next hundred scoped backlog items — every one with acceptance criteria, landed on the GitHub board, no ads / offline-first / NCTB-aligned.
- **Oracle:** standup `2026-08-12` 35/35 ✓ (SHIP-OK, live stamp v17 verified, working tree clean) · Council `2026-W33` 70/70 across the week, **zero flags**.
- **6 new epics (milestones 6–11):**
  - **v18 — content wave 2** (38): Bangla (three-digit place value, opposites, যুক্তাক্ষর, days/months, বানান, advanced matras, sentence→picture, ছড়া, pronouns, count-back) · English (long-vowel teams, CVC builder, sight words L2, plurals, past-tense, sentence comprehension, case match) · Math (tables 2–10, division, 3-digit regrouping, place value 9999, fraction compare, shapes, measurement, clock 5-min, pictographs, money combos, skip-count) · Science (living/non-living, plants, animal homes, senses, food sources, materials) · ICT/social/values.
  - **v19 — parent power 2** (12): per-day wrong history, mastery timeline, daily goal, band override, voice prefs, avatar mgmt, weekly digest, sync indicator, PIN lock, bedtime mode, skip-ahead, missed-questions view.
  - **v20 — trust & safety** (10): data-minimization audit, content-scan CI gate, no-ads CI scan, kid-safe share metadata, encrypted sync, gentle bedtime, rate-limit, local backup, privacy explainer, screen-time accuracy.
  - **v21 — growth & retention** (10): skill-of-the-week badge, Nova v2, quest variety, badge book, pet mini-games, streak freeze, per-skill share card, parent referral, land-unlock celebration, weekly recap.
  - **v22 — polish & perf** (10): main bundle < 1.5MB, per-kid voice, model download progress, TTS fallback, fresh-install offline, PWA update banner, install-prompt timing, cold start < 2s, scene pooling, haptics.
  - **v23 — infra & ops** (10): oracle-as-PR-gate, deploy smoke test, Postgres backups, uptime→Telegram, structured error log, auto-rollback, secret scan, tunnel failover, TLS rotation, RELEASING.md update.
  - **Backlog +10** deferred: AR numbers, multi-language research, printable worksheets, screen-reader deep, ambient sound, phone-notification bridge, classroom mode, seasonal events, kid dictation, flashcards QR.
- **Backlog now 116 open issues** (17 prior + 100 new), each auto-labeled `status: backlog` + `priority:` + category, milestone-assigned, project-auto-added (add-to-project fires on `issues: opened`).
- **Generator is versioned:** `scripts/team/backlog_next.py` (reproducible) · full list in **`docs/ROADMAP_NEXT.md`**.
- **✅ Verified:** 100/100 created, 0 errors, 0 skipped; spot-check #139 labels/milestone correct.

## 🚀 v13 RELEASED — NEURAL VOICE: BOOT PRELOAD + WAV CACHE (auto-cut by the 24/7 train) 11 Aug 2026 ✅ (user: "how may we improve the neural voice issue" → "yes")
Two neural-voice features shipped end-to-end in one release — **the release train auto-cut v13 with ZERO manual release commands** (found 2 feat/fix commits since v12, derived v13 from the stamp, ran release.sh → deployed to the box → live).
- **#28 — Faster first-run (10s budget):** `bootPreload()` starts the voice download at first idle (not the first tap) · `downloadParallel()` fetches phoneme.data (18MB) + model (20MB) in parallel on the main thread (time ≈ max, not sum) · big `/voice/` files gzip-precompressed at Docker build + `gzip_static on` → **~30% wire cut** (18→~11, 10.5→~5.8, 20→~17MB) · `seedSwVoiceCache()` makes visit 2 instant · `VOICE_V` v2→v3. **int4 model cut proven BLOCKED on onnxruntime 1.17** (no int4 kernel in the WASM binary) → shipped gzip instead, filed **#29** (int4 needs ORT 1.27 swap + listen-QA).
- **#31 — Every session faster:** per-line WAV cache in IndexedDB (`nv-wav-cache`, key `${speakerId}:${text}`, 30MB LRU) — repeat lines play **instantly**, no phonemizer/ORT cost · `warmCommonPhrases()` idle pre-synths Bangla 0–20 + praise/prompt words (cache-first, yields so real speech interleaves) · on-device meter `neuralStatus().cache` {hits, misses, hitRate} → parent-panel voice card shows `voiceCacheHit(pct)` EN+BN. IDB same-task tx pattern keeps LRU eviction correct.
- **The loop, again:** #28 (conductor feat/issue-28 → PR #30 → CI 4/4 → merged → Done) + #31 (feat/issue-31 → PR #32 → CI 4/4 → merged → Done) → train auto-cut v13 → GitHub Release v13 (auto-notes, both PRs) → deployed to 192.168.0.104 → live bundle `assets/index-BgerGhnG.js` carries "v13 (release train (2 since v12))".
- **✅ Train now ships neural-voice work autonomously:** cold first-run ≈ 34MB gzip parallel → ~5s on 4G + session build ≈ budget; post-deploy live measurement is the only AC left open (no CDP by constraint — verify on the box link + a real phone).

## 🚀 v11 RELEASED — TAKA TAP v2: GIVE-CHANGE + ৳5/৳20 NOTES 11 Aug 2026 ✅ (user: "do work order #3" → the 24/7 pipeline's first full loop)
Work order #3 shipped end-to-end through the automated pipeline: issue → branch → PR → CI → merge → release → live.
- **Give-change mode (levels 7–9):** pay a ৳5/10/20/50 note for a thing, tap the coin stack that IS the change (paid − price = change). Ladder 3–6 → 6–9 → 9–12. New `moneyChange`/`priceLabel` i18n EN+BN; change-aware wrong-answer hint; paid-note + Price chip UI.
- **৳5 and ৳20 lead the payment pool** as real notes; skill description updated; `game-bdtaka` difficultyLevels 6→9 tiers (3 modes × 3 levels), audit accepts the deliberate 9-tier ladder.
- **The loop proved itself:** conductor created `feat/issue-3` + work order → I implemented it → PR #25 → CI 4/4 parallel gates green (build-core → typecheck+audit ‖ api) → merged (issue #3 auto-closed COMPLETED, project card → Done via project-done.yml) → **`release.sh v11`** (gates → stamp → changelog → tag → GitHub Release v11 → deploy to box) → live bundle `assets/index-BOdoGasY.js` carries the v11 stamp.
- **Bugs fixed along the way:** `label-pr.yml` used `context.pull_request.number` (undefined) → `context.issue.number`; `release.sh` perl step choked on ৳ Unicode → python UTF-8-safe replacement; `pipeline.sh board()` cat stale `board.md` → `numberverse-board.md`.
- **✅ Release train ARMED:** `docs/LATEST_RELEASE.md` = v11; the 6-hourly launchd job now auto-cuts v12 when ≥2 feat/fix commits land (verified "0 unreleased — waiting"). Oracle 35/35 CLEAN; CI 4/4 green on main.

## 🚀 v12 RELEASED — iOS SPEECH AUTO-UNLOCK FIX 11 Aug 2026 ✅ (user: "User need to click listen audio to make it work, without it the game not speak" → run through the pipeline: work order #26)
High-priority audio bug shipped end-to-end via the **24/7 release train auto-cutting v12** — no manual release command.
- **Bug:** on iOS/Safari the game stayed silent until the kid tapped Listen. Web Speech only unlocks when the first `speak()` runs **synchronously inside a real gesture** and actually synthesizes. The old `primeSpeech()` was one-shot (`primed` flag) — if the first gesture missed the unlock window, it was stuck silent forever.
- **Fix (apps/kid/src/game/speech.ts):** prime now retries until proven — `speak()` a warm utterance (`volume 0.001`) inside each gesture and set `unlocked = true` only on `onstart` (fires only when synthesis really begins). Mirrors the `neuralPrime()` proven-unlock pattern. Capture-phase listeners on pointerdown/touchstart/click/keydown.
- **The loop proved itself (v2):** issue #26 → groomed `status: todo` → conductor `feat/issue-26` + work order → I implemented it → PR #27 → CI 4/4 green → merged (issue #26 auto-closed COMPLETED, project card → **Done** via project-done.yml) → **release train auto-cut v12** (found the 2+ feat/fix commits, derived v12 from the APP_BUILD stamp, ran release.sh gates→stamp→changelog→tag→GitHub Release v12→deploy) → live bundle `assets/index-BRXZ4zNk.js` carries the v12 stamp and the proven-unlock fix (`x.onstart=()=>{wc=!0}`).
- **Bug fixed along the way:** release-train counted `0 unreleased` forever — `git log --oneline` puts the short hash first so `^(feat|fix)` never matched. Fixed → `git log --format=%s "$LAST..origin/main"` (verified 2 commits → train cut v12). The train is now genuinely autonomous.
- **✅ Pipeline is truly 24/7:** issue → release happened with zero manual release commands; Oracle 35/35 CLEAN; CI 4/4 green on main; remote main == local.

## 🔁 24/7 AUTOMATED PIPELINE — ISSUE → RELEASE, FULLY ON AUTOPILOT 11 Aug 2026 ✅ (user: "make a automated pipeline for all from creating issue to release features, which will 24/7 parallel")
Two always-on parallel legs turn an issue into a shipped feature with one human/agent step (writing the code). Full map: **`docs/AUTOMATION.md`**.
- **🖥️ Local leg (launchd, always-on):** `infra/automation/pipeline.sh`
  - **conductor** (hourly, `com.tresha.pipeline-conductor`): picks the highest-priority groomed (`status: todo`) issue → opens `feat/issue-NNN` off main → writes `docs/work-orders/NNN.md` (acceptance criteria + the 5-spot registration checklist) → moves issue label + project card to **In progress** → pages Telegram. Idles when a work order/PR is already active (the loop is busy).
  - **release-train** (6-hourly, `com.tresha.pipeline-release-train`): when ≥2 `feat/fix` commits merged since the last release → auto-cuts `vN+1` via `release.sh` (gates → stamp → changelog → tag → GitHub Release → deploy). **Bootstrapped**: first release stays manual (`release.sh v11 "…"`); release.sh now writes `docs/LATEST_RELEASE.md` which arms the train.
  - Lock-guarded (parallel-safe, no double-pick), logs to `~/.tresha/logs/numberverse-pipeline.log` + board snapshot `numberverse-board.md`.
- **🌐 Cloud leg (GitHub Actions, on-event/on-tag):** triage+auto-assign+add-to-project (new issue → backlog card) · **CI now 4 parallel jobs** (`build-core` → `typecheck-kid` + `audit` fan-out, `api` fully parallel — all green on the first parallel run) · `label-pr.yml` · `project-done.yml` (closed issue → card **Done**) · `release.yml` (v* tag → Release with auto-notes).
- **✅ Proven live:** groomed #3 (Taka Tap v2) → conductor opened `feat/issue-3`, wrote work order, moved label+card to In progress, paged. Junk-branch bug (`feat/issue-null` from jq `first` on an empty board) found + fixed with a null guard; log-file collision with the old OTP log fixed. `pipeline.sh` syntax-valid, both agents loaded exit 0, oracle clean.
- **⛔ Honest limit:** the pipeline automates everything around code; the code itself is the agent/human step (executing `docs/work-orders/NNN.md`), and CI/audit/oracle gates are the safety net. Deploy needs the dev box online.

## 📋 GITHUB PROJECTS V2 — NUMBERVERSE ROADMAP LIVE 11 Aug 2026 ✅ (user: "done" → granted project scope, I built the project)
The modern board is live: **`Numberverse Roadmap`** → `github.com/orgs/numberverse-org/projects/1`.
- **Project created** in the org, repo linked, all 22 issues backfilled (Status = Backlog).
- **Status field reshaped** to mirror the label kanban: `Backlog → In progress → Review → Blocked → Done` (option ids in `docs/ISSUE_BOARD.md`).
- **Auto-add for new issues**: `.github/workflows/add-to-project.yml` (`actions/add-to-project@v1.0.2`, `status: Backlog`) using `PROJECT_PAT` repo secret (scoped PAT with `project` scope, set via `gh auth token | gh secret set`). **Smoke-tested**: test issues #23/#24 landed on the board, then closed.
- **Duplicates cleaned**: a stray empty "Numberverse Roadmap" project was deleted (kept the populated one).
- **✅ Verified:** `gh project list` → 1 project; 21 open issues all on board in Backlog; workflows registered; oracle clean.

## 🗂️ FULL TRACKING + ISSUE BOARD + AUTOMATED RELEASE PIPELINE 11 Aug 2026 ✅ (user: "run oracle and make more issues and a complete project tracking, issue tracking and work also a feature relase full automated pipeline")
The roadmap now lives as a real GitHub board, and shipping a feature is a one-command gated pipeline.
- **Issue backlog (21 issues + #2 voice):** every idea is a scoped issue with acceptance criteria — across 5 epics:
  - **v11 — next ship** (#3 Taka Tap v2 give-change + ৳5/৳20 · #4 parent streak + playtime-vs-cap · #5 first tagged release)
  - **v12 — parent power** (#6 weekday caps + in-app enforcement · #7 debug card, no analytics · #8 share-card coins/minutes · #9 multi-device sync · #10 B2B classroom view)
  - **v13 — content wave** (#11 count-to-100 + place value · #12 Bangla sentence builder · #13 sh/ch/th digraphs · #14 seasons/weather)
  - **v14 — polish & perf** (#15 async Phaser chunk → first paint · #16 iOS physical-device pass · #17 accessibility re-audit · #18 in-app Help card)
  - **Backlog** (#19 garden/pet expansion · #20 Jungle+Polar lands · #21 CSV/PDF export · #22 sibling co-op)
- **Tracking (free-plan kanban):** milestones = epics; columns = `status: backlog|todo|in-progress|review|blocked` labels. New issues auto-assign to the maintainer (`auto-assign.yml`) + auto-label `status: backlog` (`triage.yml`). PRs auto-label by type from the title (`label-pr.yml`: feat/fix/docs/chore/refactor/test). Board filters + workflow in **`docs/ISSUE_BOARD.md`**.
- **Automated release pipeline:** `bash infra/deploy/scripts/release.sh vN "summary"` → ① gates (core build · typecheck · audit · oracle CLEAN — aborts on any ✖) ② bumps `APP_BUILD` + TRACKER date ③ prepends `CHANGELOG.md` from commits since last tag ④ commits + tags `vN` ⑤ pushes main+tag → GitHub Actions **ci.yml** re-verifies the tagged commit + **release.yml** drafts a GitHub Release with auto-notes ⑥ deploys to the box. `--no-deploy` stops after push. Full flow in **`docs/RELEASING.md`**.
- **✅ GitHub Projects v2 — DONE** — the user granted `project` scope and the **Numberverse Roadmap** project is live (see the entry above). The label board + project board are kept in sync.
- **✅ Verified:** oracle 35/35 CLEAN; audit ✓ clean; typecheck OK; `release.sh` syntax-valid; README + TRACKER wired; pushed to `numberverse-org/numberverse`.

## 🏢 GITHUB ORG SETUP — numberverse-org (the "proper way") 11 Aug 2026 ✅ (user created github.com/numberverse-org → "do all like real people do")
The repo now lives in a real organization and runs like a real team, not a solo repo.
- **Repo transferred** → `https://github.com/numberverse-org/numberverse` (PRIVATE, main). Local remote updated to `git@github.com:numberverse-org/numberverse.git`.
- **CI WORKS in the org** — `.github/workflows/ci.yml`: checkout → pnpm 11.20 → Node 22 → install → build core → typecheck kid → catalog/i18n audit → api compile. **2 green runs.** (The personal account couldn't run Actions — `startup_failure` from account-level limits; the org's free 2,000 min unblocked it. First CI bug caught+fixed: pnpm@11.20 needs Node ≥ 22.13.)
- **Auto-assign issues** → new issues auto-assign to `bdlogicalerror` (verified on issue #2).
- **Team `@numberverse-org/maintainers`** (push access) → `bdlogicalerror` added as maintainer.
- **Org base permissions**: members = read, repo creation OFF (access via teams).
- **CODEOWNERS** → `@numberverse-org/maintainers` on `scripts/team/`, `infra/`, `packages/core/`.
- **PR + issue templates**, repo description + topics.
- **⛔ Blocked (honest): branch protection on a PRIVATE repo in a FREE org needs GitHub Pro/Team** — GitHub: "Upgrade to GitHub Pro or make public." Privacy is the moat → repo stays private. Until then: CODEOWNERS + CI + PR discipline stand in for the hard rule. Upgrading the org to Team ($4/user/mo) unlocks it.
- **✅ Verified:** oracle 35/35 CLEAN after the move; local==remote `b18e97f`; tree clean; CI green.

## 🪙 TAKA TAP — NEW BANGLA MONEY GAME (৳ চিনি / make amounts) 11 Aug 2026 ✅ (user: "Do actual feature adding not marketing")
A real feature, not docs: a brand-new learning game that fills a genuine curriculum gap — there was **zero money/taka content** in the 43-skill catalog, yet counting ৳ is NCTB class-1 math.
- **New skill** `bd-taka` (band 2, math, class 1): *Bangla money / টাকা চিনি* — recognize ৳ notes & coins and make amounts. `nctbCode c1-math-6` (was unused), seeded in `apps/api/app/seed.py`.
- **New game** `game-bdtaka` → **new scene `apps/kid/src/game/BdMoneyScene.ts`** ("BdMoney", registered in App.tsx scene array + `GAME_SCENES`).
  - **Mode 1 · Recognize** (levels 1–3): "Which is ৳৫?" — tap the right ৳ denomination. Real BD money: ৳১/২/৫ coins (gold) + ৳১০/২০/৫০/১০০ notes (colored). Pool grows 3→4→5 tiles.
  - **Mode 2 · Make an amount** (levels 4–6): "Which makes ৳৭?" — tap the **stacked coin combo** that adds up (৫+২ = ৭), teaching "make amounts" with 2–3 real coins. 6/8/10 tiles, sums 6–12.
  - Bangla digits in BN mode (৳৫), Latin in EN (৳5); speaks the amount aloud ("পাঁচ টাকা" / "five taka") in the app's language; full hint ladder, round meter, coin-stack sparkle celebration, safe-area aware, mobile-first.
- **i18n** — `titleBdMoney`/`tapMoney`/`moneyMake` added to BOTH EN + BN (`i18n.ts`), audit-verified.
- **✅ Verified:** `tsc --noEmit` clean · `audit.mjs` clean (**44 skills / 35 games / 35 scenes**) · full Oracle standup — Scope Guardian flagged the new file → committed → re-run 35/35 CLEAN. v10 stamp. Deployed live.

## 🚀 PHASE 2 — BD PARENT-GROUP SEEDING + KINDERGARTEN PILOT KIT 11 Aug 2026 ✅ (oracle picked next lever: group-seeding)
The Oracle Team's next topic, per the growth plan (Phase 0 stable URL ✓ · Phase 1 share loop ✓ · **Phase 2 = seed**). The deferred voice-recording item was **superseded** by the on-device neural voice (8 Aug) and needs Hasan's elder girl to physically record — so the growth lever was the pick.
- **`pitch/phase2_seeding_kit.md`** — ready-to-send, honest, zero-ads, pet-project framing:
  - **BD parent-group copy** in Bangla + English (WhatsApp status / group) — "আমার বাচ্চাদের জন্য বানিয়েছি… বিনামূল্যে, কোনো বিজ্ঞাপন নেই, অফলাইনে চলে", URL `kids.munna-khan.xyz`, no store needed (browser → Add to Home Screen), ages 2–13, no data collection.
  - **Kindergarten teacher first-contact message** + **4-step pilot runbook** (1 pilot → 10-min show → hand them the URL not a store link → collect feedback in 1 week via WhatsApp).
  - **Pilot tracking table** (pilot/contact/#kids/what they loved/what broke/follow-up) ready to fill.
  - **Honesty guardrails:** never claim board approval/certificates/"AI teacher"; it's a parent's gift; if a school asks for admin/rosters that's the B2B classroom view (roadmap, not this kit).
- **✅ Verified:** committed `bbe566f` + pushed to GitHub; learned `numberverse/phase2_seeding` + `oracle_team/phase2` to mem API. Next human action: Hasan sends the group messages to 2–3 BD parent groups + picks 1 kindergarten pilot.

## ⚖️👁️ ORACLE TEAM v2 — 7 LAYERS · 105 PEOPLE: ADJUDICATOR + UI VISUAL INSPECTION 11 Aug 2026 ✅ (user: "run the oracle and make sure there's a adjudicator layers too also, UI team for visual inspection")
The Oracle Team grew from 5 to **7 layers × 15 = 105 people**. Ran the daily standup — **35/35 automated checks CLEAN, exit 0** — and learned the first adjudicator ruling to the mem API.
- **⚖️ Layer 6 — Adjudicator (arbitrate).** Independent referees: when layers disagree (eng says ship, trust says hold) they rule — no deadlock, every ruling is precedent. Automated (`l6_*`): **Release Gate Judge** (SHIP-OK vs DEPLOY BLOCKED verdict), **Kid-Bar Referee** (independently re-checks safety+privacy before anything ships), **Scope Guardian** (zero untracked/unowned files), **Chronic-Issue Examiner** (a role red for 3+ of the last 7 days → human escalation), **Precedent Recorder** (`adjudicator` rulings trail in mem), **Deadlock Breaker**.
- **👁️ Layer 7 — Visual Inspection & UI (the UI team for visual inspection).** Eyes on every pixel. Automated (`l7_*`): **Visual QA Lead** (reference-look doc fresh), **Palette Inspector** (5 lands × c1/c2/c3/c2_22/deco), **Contrast Auditor** (WCAG c1↔c3 ≥ 3.0:1 — measured, all pass, best 11.00:1), **Glyph Watch** (zero tofu/replacement chars), **Asset Librarian** (icons + og-card + all 5 `url:` avatars resolve in `public/`), **Emoji-Fallback Sentinel** (92 emoji fallbacks cover 82 rendered assets), **Theme Consistency Judge** (land vars wired in styles.css).
- **`docs/VISUAL_BASELINE.md`** — the reference look (screens, land palette table, non-negotiables) the UI team compares against; freshness-checked by `l7_baseline` (≤ 30 days).
- **Proven on first run:** Scope Guardian ✖-flagged `docs/VISUAL_BASELINE.md` as an unowned untracked file → committed it → re-run 35/35 CLEAN. The adjudicator really adjudicates.
- **Memory:** first ruling learned (`adjudicator/ruling_2026-08-11` → SHIP-OK; precedent trail now 2) + `numberverse/oracle_layers_v2`. `oracle_council.py` layer list updated to all 7. Live run: `python3 scripts/team/oracle_team.py`.
- **✅ Verified:** standup CLEAN exit 0; `adjudicator` + `oracle_team/standup_2026-08-11` persisted (35 checked / 35 ok); repo committed + pushed.

## 🐙 NUMBERVERSE NOW IN A PRIVATE GITHUB REPO + WEEKLY COUNCIL + FAILURE PAGING 11 Aug 2026 ✅ (user: "yes, and do all in github private repo for numberVerse and Do with the systematic way")
Everything is now version-controlled and the Oracle Team has two cadences plus real paging when things break.
- **Private GitHub repo** — `https://github.com/bdlogicalerror/numberverse` (PRIVATE, default branch `main`). Fresh `git init -b main` (numberverse previously lived inside the ~/.tresha repo as untracked files), then a systematic pre-push security pass: redacted a personal phone from TRACKER.md, gitignored `PRIMARY_SESSION.txt` + `.tresha/` + `*.tresha*` + `*.tsbuildinfo`, confirmed uv.lock hits were only SHA256 fragments and oracle_team.py references only env-var NAMES (never values). Pushed `f8b090e` (173 files, 37k insertions), remote `main` verified in sync with local HEAD. Top-level tree clean: no secrets, no session/tooling artifacts.
- **Weekly Oracle Council** — `scripts/team/oracle_council.py` aggregates the daily standups (mem `oracle_team/standup_*`, 2-week lookback) into `docs/ORACLE_COUNCIL_YYYY-WW.md` + `docs/ORACLE_COUNCIL.md`: per-layer health board, all flags across the week (deduped by owning role), trend (early-vs-late half, `n/a` until 2+ standups), and Council recommendations (weakest layer gets first review; release blocked until CLEAN when flags pile up). Learns `oracle_council/weekly_YYYY-WW` + `latest` (importance 5/6). Launchd `com.tresha.oracle-council` (604800s) runs it weekly — loaded, exit 0.
- **Failure paging** — when the daily standup has any ✖, `oracle_team.py`'s `_page()` writes `~/.tresha/logs/oracle_team.alert`, fires an osascript notification, and pages **Telegram** (TG_BOT_TOKEN/TG_CHAT_ID from ~/.tresha/.env). A simulated-fail test confirmed the alert file + notification + Telegram page all fire. `_tg_send` reads tokens from `.env` by name only — never hardcoded, never committed.
- **✅ Verified:** `gh repo view` → PRIVATE / main / `https://github.com/bdlogicalerror/numberverse`; `git ls-remote origin main` == local HEAD `f8b090e`; launchd `com.tresha.oracle-team` (86400s), `com.tresha.oracle-council` (604800s), `com.tresha.periodic-learn` (600s) all loaded exit 0.

## 🦉 ORACLE TEAM — 5 LAYERS · 75 PEOPLE, CONTINUOUSLY OPERATING THE APP 11 Aug 2026 ✅ (user: "make 5 layers of oracle team to continuously working on this app to make it easily operable and best for KIDS, 5 layers and 75 peoples")
The app now has a **75-role continuous operating team** (5 layers × 15) that makes NumberVerse *easily operable* and keeps it *best for kids* — with real automation, not just a doc.
- **`TEAM.md` (repo root)** — the full charter: 🧠 Oracle Council (strategy · child-safety · privacy · curriculum) → 🛠️ Engineering Crew → 🛡️ Quality & Trust → 🎨 Content & Experience → 🚀 Growth & Parent Care. Each of the 75 roles has a mission + "how it runs" (⚙️ automated / 👤 guided duty), so nothing about the product is ever unowned.
- **`scripts/team/oracle_team.py`** — the daily standup runner. Executes **22 automated role-checks** mapped to the ⚙️ roles: NCTB/class curriculum shape (43 skills, 0 missing), child-safety scan (word-boundary blocklist over skill titles + all 35 scene files), privacy scan (own-API-only fetches, no ad/tracker SDKs), Bangla `titleBn` coverage, 5-band integrity, audit.mjs, tsc --noEmit, sw.js flags + og-card precache exclusion, share renderers, bundle budget, thresholds/rewards, security dir, live bundle stamp, share-caption URL, TRACKER freshness, live domain reachability, mem-API + periodic-learn liveness. Prints a per-layer status board and **learns the report to the mem API** (`oracle_team/standup_YYYY-MM-DD` + `latest`) so team health survives compaction.
- **launchd `com.tresha.oracle-team`** — runs daily (`StartInterval 86400`, RunAtLoad). First real finding it caught: under launchd's minimal PATH, `node` wasn't resolvable → runner now injects `/opt/homebrew/bin` etc. Clean exit 0, report stored in memory.
- **✅ Verified:** 22/22 roles pass (standup CLEAN, exit 0), report persisted to mem API (`oracle_team/latest` → 22 ok / 0 fail). Every role has an owner + a how-it-runs; the ⚙️ layer literally runs every day.


## 🗺️ VISUAL WORLD MAP + THEMED LANDS 11 Aug 2026 ✅ (user: "Improve the NumberVerse add map, worlds and journey")
The Worlds screen now has THREE tabs — **🗺️ Map / 🛣️ Journey / 🏘️ Worlds** — and the whole worlds experience shares one art language.
- **New visual Map tab:** each world is an *island* on a winding dashed road (`world-map` + `.map-road` with glowing road dots). Every island: a radial-gradient medallion in that land's colors (`map-island-badge`), progress bar tinted with the land gradient, world number chip, ▶/🔒 state, tiny floating terrain deco (🌱🍃/🌾🐄/🌊🐟/☁️🏰/🚀⭐) bobbing behind it, and a **📍 "You're here!" chip** on the current world.
- **Per-land palette `WORLD_LANDS`** (new module data): each world = `c1` (deep), `c2` (mid), `c3` (light), `c2_22` (translucent tint), `deco[]`. Sprout Grove teal · Cottage Fields amber · River Town blue · Sky Castle blush · Star Academy violet. Used by Map islands, Journey region heads, Worlds cards (emoji tile gradient + left accent bar + progress gradient), and the **worlddetail header** (3px land-gradient top strip + soft corner glow).
- **Journey improvements:** region headers now wear their land's accent (left border + tinted gradient, WebView-safe translucent hex), and **when a band is fully mastered a gold "You opened the road to NEXT! 🎉" banner** appears above the next region (`journey-road-open`, themed with the next world's icon).
- **i18n:** 6 new EN+BN strings (`mapTab`/মানচিত্র, `mapSub`, `mapHere`/তুমি এখানে, `mapLandProg`, `mapRoadOpen`, plus `mapLand`) — audit clean.
- **✅ Verified:** `tsc --noEmit` clean, audit clean, production build green (28 precache entries, og-card still excluded), deployed. Live bundle `assets/index-DSD1GDo6.js` carries `11 Aug 2026 · v9 (visual world map + themed lands)` + `A living map`/`একটি জীবন্ত মানচিত্র` + `mapRoadOpen`; og-card 200, sw.js 200.


## 🖼️ PWA DISTRIBUTION: OG + TWITTER + CANONICAL + JSON-LD SOCIAL CARD 9 Aug 2026 ✅ (user: "Don't wanna playstore now, plan for use PWA. Add OG and other's tag for better sharing experience")
No Play Store / TWA — **PWA is the distribution** (installable + offline already). This ships the link-share side: any `kids.munna-khan.xyz` link now renders a proper rich card in WhatsApp / Facebook / X / LinkedIn / iMessage.
- **`apps/kid/public/og-card.png` (1200×630, ~199KB):** static social card generated with Pillow (navy gradient, aurora blobs, white wordmark, gold divider, "Kids learn math & Bangla — offline, no ads.", teal Bangla pill, "Ages 2–13 · Adaptive · No ads · Private", `kids.munna-khan.xyz` footer, 🦉 + sparkles). Font gotchas: Apple Color Emoji.ttc bitmap strikes cap at 160px → render at 160px then LANCZOS-upscale; KohinoorBangla.ttc index 1 = Semibold for Bangla.
- **`apps/kid/index.html`:** full social block — title + description, `og:type/site_name/url/title/description/image(+1200×630 dims,type,alt)/locale(en_US)+alternate(bn_BD)`, `twitter:card=summary_large_image` + title/description/image/alt, `<link rel=canonical>`, and a JSON-LD `WebApplication` schema (`applicationCategory: EducationalApplication`, `offers: {price: 0}`, `inLanguage: [en,bn]` — honest, no fake ratings).
- **`apps/kid/vite.config.ts`:** workbox `globIgnores: ["**/og-card.png"]` — the social card is crawler-only, never precached (saves install bytes).
- **Share captions now carry the URL** (EN + BN): `shareProgressCaption` → "…offline, no ads! kids.munna-khan.xyz", `certShareCaption` → "…kids.munna-khan.xyz" — the WhatsApp loops promote the stable home.
- **✅ Verified live:** `https://kids.munna-khan.xyz/` serves all OG/Twitter/canonical/JSON-LD tags; `/og-card.png` → HTTP 200 `image/png` (199245B); `sw.js` has **0** refs to og-card; live bundle `assets/index-UjSpALdp.js` (2.07MB) contains `9 Aug 2026 · v8 (og preview + share url)` stamp + `kids.munna-khan.xyz` captions; `tsc --noEmit` clean, audit clean.


## 📤 SHARE LOOP: WEEKLY-PROGRESS CARD + CERTIFICATE PNG → WHATSAPP (+5🪙 kid reward) 8 Aug 2026 ✅ (user: "do it" → how to make it popular — Phase 1: light the share loop)
Both share features built INSIDE the kid app (where the parent panel + cert live) — self-contained, offline, one deploy, zero API changes:
- **New `apps/kid/src/game/shareImage.ts` (~360 lines, zero deps):** canvas-2D PNG renderers (no html2canvas bloat) + a share helper. `renderShareCard` → 1080×1350 (4:5, WhatsApp-preview-friendly) card: navy+aurora bg, avatar badge, name, 3 stat tiles (⭐ stars / 🧠 points / 🕹 sessions), 5 world progress bars, tagline. `renderCertCard` → cream sheet + gold double border, 🦉🦉 title, name, world, skill count + list (capped 4), date + Nova signature side-by-side. `sharePng`: tries native **Web Share API with the image FILE** (Android/iOS share sheet incl. WhatsApp) → falls back to downloading the PNG + opening `wa.me` text. `wrapText`/`rr` helpers included.
- **Parent panel → "📤 Share progress"** (in the analytics card, next to the world bars): renders the card from the kid's live local stats + world progress, shares, and **rewards the kid +5 🪙 (once per calendar day)** — new store action `novaShareReward(kidId)` (`shareDay` field, mirrors quest/birthday pattern, bypasses the daily cap) → Nova announces it aloud ("{name}'s progress was shared! You earned +5 coins! 🎉"). Feedback chip shows ✓ Shared / error.
- **Certificate screen → "📤 Share"** (next to Print): renders the cert to a keepsake PNG, shares the same way (no coin reward — the progress share owns that).
- **i18n:** 15 new EN+BN strings (share buttons, card labels, captions, reward toast/speak, footer taglines) — audit clean.
- **✅ Verified:** `tsc --noEmit` clean, audit clean (43 skills/35 games/35 scenes, EN+BN complete), deployed. Live bundle `assets/index-Cyh6rwqA.js` contains `8 Aug 2026 · v7 (share progress + certificate)` stamp, `share-progress-btn`, `cert-share-btn`, `novaShareReward`, `Share progress`/`অগ্রগতি শেয়ার করুন`.
- **The loop now:** parent taps Share → pretty PNG card/cert → WhatsApp (or native sheet) → another parent sees "my kid learned this in Numberverse" → opens the app. The kid who got shared gets +5 🪙 and hears Nova celebrate → the loop feels good to the actual user. Phase 0 (stable URL + Play Store wrap) and the group-seeding are still the next lever.

## 🖼️ UI CLEANUP: PARENT-PANEL OVERLAP + DONE-SCREEN NEXT-ROUND/SCROLL + MINIMAL HOME 8 Aug 2026 ✅ (user: "parents panel get overlapped can't see the kids progress, it's covered by the tts config" · "when completed all rounds the congratulations scene don't have next round button, also not scrollable" · "the first scene messed up with start and mores menu make it minimal")
Three layout fixes, shipped as **v6 (minimal home + done-screen fixes)**:
- **🐛 Parent-panel overlap (progress covered by TTS config):** `.parent-screen .parent-list` had `flex: 1; overflow-y: auto` — a nested scroll region sized to fill the screen — while the 🎙️ voice-config card (`VoiceCheck`, incl. the 4-voice picker) sat BELOW it in the outer flex column. With the picker open, the card got squeezed by flex-shrink and its content spilled over the kid-progress card above → "can't see the kids progress, covered by tts". **Fix:** the panel is now ONE scroll column — `.parent-screen > * { flex-shrink: 0 }` (children keep natural height), removed the nested `flex:1/overflow` from `.parent-list`, and `.voice-check` matches the analytics column width (`width:100%; max-width:520px`). Header → picker → progress → voice config → settings all scroll together on the outer `.screen`; nothing can overlap.
- **🐛 Done-screen (congratulations) not scrollable + no next round:** `.done-screen { overflow: hidden }` clipped badges/buttons on short phones with no way to reach them. **Fix:** `overflow-y: auto` + `justify-content: flex-start`, with the auto-margin centering trick (`.mascot { margin-top:auto }` + last button `margin-bottom:auto`) so it stays centered when it fits and scrolls when it doesn't. **New primary "Next round" button:** computes the journey's CURRENT stop after the session (`journeyState` + `journeyCurrentIndex`) → if the kid just mastered the skill, it's the NEXT skill ahead; if not, the same one (keep practicing); journey complete → falls back to "Play again". Button shows the next skill + band in the sub-line; "Play again" demoted to a ghost when next-round exists. `startNextRound()` → `startSingleSkill(stops[idx].skill)`.
- **✨ Minimal home (was "messed up with start and mores menu"):** the landing had a giant PLAY button AND a 5-tile icon grid (Worlds/Nova/Garden/Cards/Castle) AND Nova's 3 funny-name-voice buttons = control-panel clutter. **Fix:** the grid + name-game now live behind a single quiet **`More ▾`** `<details>` toggle (dashed pill; `more-menu` CSS; also folds in the funny voices) — the landing is now ONE action: greeting → big PLAY (with the next-skill sub-line) → journey path → quest → pet → offline chip. Nothing became unreachable.
- **✅ Verified:** `tsc --noEmit` clean, audit clean (43 skills/35 games/35 scenes, i18n EN+BN complete), deployed. Live bundle `assets/index-DA1IDfi-.js` contains `8 Aug 2026 · v6 (minimal home + done-screen fixes)` stamp, `Next round`/`পরের ধাপ`, `more-menu`, `next-btn`. (Nova's CTA — the "start by Nova scene" alternative — was already eye-catching: glow + shine sweep + coin chip + sub-line.)

## 🐛 ANDROID OLD-INSTALL "NOT TEST EVEN AFTER DOWNLOAD" — GLUE PROVEN + HARDENED 8 Aug 2026 ✅ (user: "android bangla not test even after download on old install")
Two possible causes: (a) the real `piper_worker.js` browser glue was NEVER actually proven (only Node-direct phonemize+ORT was), and (b) a stale bundle on an old install. **I proved (a) is fine — the glue itself was never the bug** — then hardened the real failure windows.

**✅ PROVEN the real browser glue end-to-end (Node worker_threads + vm shim running the REAL worker in a clean browser-worker context):**
- Built `/tmp/workertest/shim_worker.js`: real `piper_worker.js` in a vm context with NO process/require/Buffer → Emscripten takes the browser-worker path, with FakeXHR / FakeBlob / URL.createObjectURL / importScripts / fetch shims.
- **Harness bugs found & fixed** (they were SHIM bugs, not app bugs): (1) Emscripten's package loader checks `xhr.status==200` and uses `xhr.onload` with `responseType="arraybuffer"` — the shim set neither → the `.data` package never loaded → worker hung before `callMain`. (2) ORT needs a `performance` global in the worker ctx.
- After fixes: full `init` → **`output` reached** for BOTH the fp32 (77MB) AND the **actual deployed int8 QDQ model** (20.2MB pulled from the box): `এক দুই তিন` → ~1.2s WAV. Also proven **WITHOUT SharedArrayBuffer** (the plain-http LAN world) — `numThreads=1` + SIMD still synthesizes.
- **Deploy verified:** deployed `piper_worker.js` is byte-identical to the tested one (`numThreads = 1`), all `/voice/` assets serve correct MIME (`application/wasm`, `application/javascript`, octet-stream), model 20246312b, sw.js has `skipWaiting`+`clientsClaim`+`cleanupOutdatedCaches`, `no-store`.

**So the glue + model + server are all good.** The real on-device failure windows were:
1. **Worker had ZERO error handling** — a dropped 20MB fetch on flaky Android Wi-Fi makes `getBlob`'s XHR never reach DONE → the promise never resolves → the banner is stuck at ~99% forever, `markReady()` never fires, Bangla silently falls back (or is silent). No `xhr.onerror`, no timeout, no retry, no visible reason.
2. **Client never knew** — no `worker.onerror` listener, no synth watchdog, no retry on next gesture, and the UI showed only a generic "unavailable" (no actual error message).
3. **6-month CacheFirst on `/voice/`** — if we ever change worker/model bytes at the same URL, old installs serve the stale copy forever.

**Hardening (deployed as v5):**
- `fetch_voice_assets.sh` worker patch (python, byte-identical to the tested happy path): adds `xhr.onerror/onabort` → post `stderr` "voice fetch failed: <url>" + reject; wraps `init` in try/catch → any error posts `stderr` with the real message. Worker still single-thread (no COOP/COEP/SAB).
- `neuralVoice.ts`: `worker.onerror` → `failNeural(msg)` (state=error + visible reason); **per-synth watchdog** (2s interval, kills worker + rejects after a 60s stall, reset on every fetch-progress so a slow 20MB download is fine); `failNeural` resets `preloadStarted` so **the next gesture retries with a fresh worker**; gestures run `neuralPrime`+`preloadNeuralVoice` on EVERY gesture (all guards short-circuit). **Cache-busting `?v=v2`** on `piper_worker.js` + the model URL so old installs re-fetch fresh bytes after a voice deploy.
- `App.tsx`: the voice error line now shows the actual reason `(… e.g. voice fetch failed …)`, build stamp bumped to **`8 Aug 2026 · v5 (voice hardening)`**.
- ✅ Verified: patched worker still synthesizes (happy path); a dropped model fetch now surfaces `✓ ERROR SURFACED: voice fetch failed …` instead of hanging; `tsc --noEmit` clean; audit clean; deployed (`index-XKMZQYDA.js`, worker has error plumbing, model still 20246312b).
- **Old-install fix on the device:** check the parent-panel footer stamp — must read **v5**. If it shows anything older, force-close the PWA and reopen (or clear site data / reinstall) so the new SW + bundle load; then tap once for the voice download.

## 🎙️ FEMALE (OR KID) BANGLA VOICE — THE MODEL HAD 16 SPEAKERS ALL ALONG 8 Aug 2026 ✅ (user: "can we use female voice for bangla or kids?")
Answer: **YES, and it was free.** `bn_BD-google-medium` is a 16-speaker model; we were only using speaker 0 — which measured **MALE (F0 132 Hz)**. Empirical F0 (autocorrelation pitch) analysis of all 16 voices found the good ones:
- **spk 11 → warm FEMALE** (F0 176 Hz, rms 0.181 — also louder/clearer than spk 0's 0.100). **Now the DEFAULT.**
- **spk 12 → genuine KID voice** (F0 262 Hz, rms 0.216, strongest clarity) — offered as "Kid voice".
- spk 3 → soft female (172 Hz); spk 7 → friendly male (155 Hz) — also offered.
- (VITS is stochastic, so I judged by speech-rhythm + formant spectrum earlier; here F0/amplitude separates gender cleanly.)
- **Feature: Bangla voice picker in the parent panel (Voice check card)** — Warm adult (female) / Kid voice / Soft female / Friendly male, each with a 🔈 preview that speaks "আমি তোমার বন্ধু — চলো একসাথে খেলি!" in THAT voice (preview via `neuralSpeak(…, { speaker })` — doesn't change the saved choice). Selection persists (`nv_bn_speaker` in localStorage), applies to the next synth — no re-download, speakers are inside the model.
- **Implementation:** `neuralVoice.ts` — `NEURAL_VOICES` (id + stable non-i18n key), `getNeuralSpeaker()/setNeuralSpeaker()` persisted, `synth(text, spk)` threads the speaker into the worker's `sid`, default = **11 (female)**. Picker labels live in App's Strings table (EN+BN); scene-audit stays clean (labels are dot-access, not `t("…")`).
- **✅ Verified:** all 16 speakers synthesized + measured locally (F0/gender table above), `tsc --noEmit` clean, audit clean, deployed. Live bundle `assets/index-BG2-_KEM.js` contains `v4 (female voice)` stamp, picker (`voice-pick`, Warm adult / Kid voice labels), `nv_bn_speaker`, default 11. Model still 20246312b (all 16 voices inside), 43 skills, sw precaches new bundle.
- **iPhone check:** Settings → Voice check → "🎙️ Bangla voice" picker; 🔈 each to hear; default is now the warm female voice everywhere.

## 📱 NEURAL VOICE ON iPHONE — NEVER SILENT + VISIBLE 8 Aug 2026 ✅ (user: "But I see no changes on iPhone")
The neural voice worked on Android, but on iPhone the change was invisible — and there was a REAL iOS bug hiding inside it.
- **🐛 iOS bug found:** once the model was ready, `speech.ts` routed Bangla to `neuralSpeak()` and RETURNED — but on iOS, if the shared `<audio>` element wasn't unlocked by a gesture, `el.play()` is REJECTED and the promise resolved silently → **Bangla went SILENT** (worse than the old Web Speech voice). No fallback existed.
- **Fix 1 — neural can never silently fail:** `neuralSpeak()` now resolves **`true` only when audio actually played**, `false` on any failure (synth error, superseded, locked playback). `speech.ts` **falls back to Web Speech for that line** whenever it's `false` — Bangla is never silent on any device. Cross-engine latest-wins: `webSpeak` also `neuralCancel()`s so the two engines never overlap.
- **Fix 2 — iOS audio unlock retries on EVERY gesture** (not just the first): the prime rides every pointerdown/touchstart/click until the element is genuinely unlocked. The silent-WAV prime now records `audioUnlocked` and keeps trying.
- **Fix 3 — the change is now VISIBLE:** the top-right voice chip flips **⏳ (downloading) → 🎙️ + green dot (neural voice ready)**, and a first-use home-screen banner shows live download % then a 5s "ready ✓" flash. A **build stamp** in the parent-panel footer ("Numberverse · 8 Aug 2026 · v3 (neural voice)") makes a stale service-worker cache instantly diagnosable — if the phone shows an old stamp, force-reload or reinstall the PWA (iOS SW updates are lazy).
- **✅ Verified:** `tsc --noEmit` clean, audit clean, deployed. Live bundle `assets/index-BqnV7O44.js` contains `2026 · v3` stamp, `voice-dl` banner, `neural` wiring, `2e7` (20MB progress), `bn_BD-google-medium.onnx`. Model still 20246312b, 43 skills, sw.js precaches the new bundle + `nv-voice` runtime cache, zero external refs.
- **iPhone check (parent):** Home screen → top-right chip shows ⏳ during first download, then 🎙️ with a green dot; tap 🔊/🎙️ → Voice check card shows the neural status; footer stamp must read `8 Aug 2026 · v3`. If it says anything older → fully close the app and reopen, or delete + re-add the home-screen icon.

## 🎙️ ON-DEVICE NEURAL BANGLA VOICE — PIPER VITS (WASM) 8 Aug 2026 ✅ (user: "she can't do ~300 lines let's go for Option: On-device neural TTS (Piper Bengali / sherpa-onnx WASM)")
The definitive answer to the German-voice lottery: Bangla is now spoken by a **real Bengali neural voice running 100% on the device** (Piper VITS via espeak-ng WASM + onnxruntime-web in a Web Worker). Every device hears the SAME warm voice, works fully offline after one download, and nothing ever leaves the device (privacy is the moat).
- **Why not the recorded-Elder-Girl path:** she can't do ~300 lines. Neural TTS gives consistent, complete, private voice NOW; the VOICE_RECORDING todo stays in the background (a future 100%-human option).
- **Architecture (4 moving parts, all verified end-to-end):**
  1. **Assets baked into the web image at build** (Dockerfile.web `voice` stage = python:3.12-slim): `fetch_voice_assets.sh` grabs piper-wasm@0.1.4's phonemizer trio (piper_phonemize.js/.wasm/.data = espeak-ng Bangla phonemization), its exact onnxruntime-web 1.17.0 browser build (ort.min.js + ort-wasm-simd.wasm, single-threaded so NO COOP/COEP/SharedArrayBuffer headers needed on plain-http LAN), and `bn_BD-google-medium.onnx` (22050Hz, 16 speakers — sid 0 = default) — then `quantize_voice.py` shrinks it **76.8MB fp32 → 20.2MB int8** (see the quantization entry below). nginx just COPYs the finished `/voice`. Repo stays lean (rsync stays fast); payload is a cached Docker layer.
  2. **piper_worker.js** — copied from piper-wasm, `sed`-patched `numThreads = 1` (single-threaded SIMD is plenty for one short sentence; avoids SAB requirements). Fetches assets via XHR (→ service worker runtime-caches them), synthesizes WAV, posts it back as a Blob.
  3. **`apps/kid/src/game/neuralVoice.ts` (NEW, ~320 lines)** — the main-thread half: lazy worker, blob cache (the 20MB int8 model downloads ONCE per session), latest-wins + queue semantics mirroring speech.ts, playback through ONE shared `<audio>` element unlocked on the first user gesture (silent-WAV prime), iOS-safe, background preload started on first tap. `preloadNeuralVoice()` warms the full pipeline with a tiny word so the first real Bangla line is instant.
  4. **speech.ts routing** — Bangla lines go to the neural voice whenever `isNeuralReady()`; Web Speech covers English + the pre-download window (and the pickVoice fix from yesterday covers that window safely). `cancelSpeech()` now stops the neural voice too. Parent-panel VoiceCheck card shows live download % / ready / error in EN+BN.
- **Service worker** (`vite.config.ts`): new `nv-voice` runtime cache (`/voice/` CacheFirst, 6-month expiry) — the voice is way over the 6MB precache cap, so it downloads on first use, then works in airplane mode.
- **nginx**: `/voice/` served `Cache-Control: public, max-age=31536000, immutable` (content is baked, never changes).
- **✅ Verified:** full synthesis proven in Node with the EXACT shipped binaries — "এক দুই তিন" phonemized (29 ids) → ORT wasm inference → **1.22s real non-silent speech WAV** (RMS 0.06, peak 0.83). `tsc --noEmit` clean, audit clean, deployed. Live box: all 7 `/voice/` assets 200 (model **20246315b**, was 76782515b), worker `numThreads = 1`, bundle contains `bn_BD-google-medium.onnx` + `2e7` (the 20MB progress constant), `sw.js` contains `nv-voice`, immutable cache header confirmed, API still 43 skills.
- **Known tradeoffs / later TODOs:** (1) ~~int8 quantization~~ **DONE — see the quantization entry below.** (2) rate/pitch are baked into the model (always natural teacher pace; volume still works). (3) English still Web Speech (plenty of voices, no lottery there — a neural en model is a trivial add if ever wanted). (4) 16-speaker model currently uses sid 0 — could expose the other voices as "funny voices" later.

## ⚡ VOICE MODEL INT8 QUANTIZATION — 76.8MB → 20.2MB 8 Aug 2026 ✅ (user: "do it 'TODO logged: int8 quantization…'")
The Bengali model is now **3.8× smaller** (76.8MB → 20.2MB, on the server), so the first-download is ~48MB total and starts ~57MB faster. Same voice, same architecture, fully verified.
- **The naive path FAILED first:** `onnxruntime.quantization.quantize_dynamic` with piper's op list (`MatMul/Attention/LSTM/Gather`) shrank nothing (76.8→76.6MB) because **99% of VITS weights are Conv/ConvTranspose**, not MatMul. Adding `Conv` to the list DID hit 22MB but rewrote Convs to **`ConvInteger` ops — which onnxruntime-web 1.17.0 WASM has NO kernel for** ("Could not find an implementation for ConvInteger"). Dead end for the browser.
- **The working approach — custom weight-only QDQ** (`infra/deploy/scripts/quantize_voice.py`): every Conv/ConvTranspose weight (138 tensors, 75.7MB) is quantized **per-channel to symmetric int8** (scale = max|w|/127, zp=0 — piper's QInt8+reduce_range convention) and stored as int8 initializers, each feeding ONE `DequantizeLinear` (int8→fp32) node. The Conv/ConvTranspose ops stay **fp32** → onnxruntime-web WASM runs them (fp32 Conv is supported; ConvInteger is not). Spec-valid ONNX (opset 15, per-axis DQ ≥13), checker passes, topological order preserved (DQ inserted before its consumer), shared-weight-safe (drops only unreferenced fp32 initializers). Config JSON is untouched (same architecture) — only weights swap.
- **✅ Quality verified empirically:** on the EXACT shipped wasm binaries, "এক দুই তিন" → 1.14s non-silent speech. VITS is stochastic (noise_scale 0.667), so waveform-SNR is meaningless; the right metrics are speech-RHYTHM (energy envelope) and VOICE/formant spectrum: **envelope corr 0.799, formant corr 0.987** vs fp32 → same words, same voice, just quantized.
- **✅ Verified live:** deployed; `/voice/bn_BD-google-medium.onnx` = **20246315 bytes** (was 76782515), all assets 200 + immutable, worker `numThreads = 1`, bundle progress constant `2e7`, API still 43 skills, zero external refs.
- **Build shape:** fetch+quantize moved into a `python:3.12-slim` `voice` stage (avoids onnxruntime-on-alpine musl). One-time pip install (`numpy<2 onnx==1.16.1 onnxruntime==1.17.0`) + 76MB download cached in the layer; later deploys reuse it. nginx stage now just `COPY --from=voice /voice`. Repo still carries NO model bytes (rsync stays fast).

## 🐛 BANGLA TTS SPOKEN BY GERMAN VOICE — FIXED 7 Aug 2026 (user: "why bangla language show german in app")
Devices with NO Bangla TTS voice heard Bangla questions read by **Google Deutsch**. Root cause in `apps/kid/src/game/speech.ts` `pickVoice()`: when the same-language voice pool was empty, it fell back to "any voice" and scored Google voices +30 — German (the most-installed Google voice) won over every other wrong-language voice. The file's own design comment promised "never a wrong-language voice while any match exists" but the code contradicted it exactly when NO match exists.
- **Fix:** `pickVoice` now returns `undefined` when no same-language voice exists → `speak()` sets `u.lang = "bn-BD"` and the platform engine reads Bangla itself (the documented fallback). Silence (or the engine's own Bengali attempt) is always better than German garble. Bangla-mode audio on devices WITH Google বাংলা is unchanged (still picks the proper voice).
- **✅ Verified:** `tsc --noEmit` clean, deployed. Minified `_h` (pickVoice) in live bundle `assets/index-uyutFZsy.js` shows `if(!P.length)return` and NO any-voice fallback.
- **Related:** parent panel Speech status now correctly reports `bnPick: undefined` when no Bangla voice is installed — making the gap visible. Real fix for such devices: install Google TTS + Bangla data, or the recorded Elder Girl Voice (standing VOICE_RECORDING.md todo).

## 📚 LEARNING CONTENT EXPANSION — 3 BATCHES 7 Aug 2026 ✅ (user: "I want to add more Learning Content")
Catalog 41→43 skills, 34→35 games, 34→35 scenes. Zero new frameworks — reuse-first: most of the "new" content rides existing games/scenes.
- **Batch A — 5 new skills that REUSE existing games** (cheap, no new scenes): `en-shapes` (band 1 english, game-shapecatcher), `add-within-20` + `sub-within-20` (band 2 math, game-fruitadd), `count-to-50` (band 2 math, **new `game-countpop50`** sharing the CountPop scene), `div-facts-by-2-3` (band 3 math, game-division). New **`levels`-via-scene-data** pattern: App passes `levels` in scene data so ONE scene (CountPop) serves multiple skills with different ladders while keeping the 6-tier audit convention.
- **Batch B — deepen the baked lesson lists** (zero catalog change): SightWords 12→24 (added what/which/there/where/would/could/should/people/water/because/more/make), EnLetters A–L→**A–Z**, BnWords 10→20 (+হাতি/কুকুর/বিড়াল/হরিণ/প্রজাপতি/পেঙ্গুইন/তোতা/আঙুর/স্ট্রবেরি/চাঁদ), BgsFacts 12→16 (+হা-ডু-ডু national sport/টাকা currency/তাজিংডং peak/১৬ ডিসেম্বর Victory Day), EnPhonics 8→12 (+I/J/K/L), Cvc 10→16 (+cow/owl/bat/rat/hen/web — 3 brand-new emoji-style SVGs rat/hen/web), BnMatras 12→14 (+না/তু), BnColors 10→13 (+সাদা/আকাশি/সোনালি).
- **Batch C — fill the bangla gap**: `bn-numbers` (band 1) — **new BnNumbersScene** (listen-and-tap ০–৯ digit recognition, big 🔊 replay button so a toddler can re-hear the number, speaks শূন্য/এক/দুই…), new `game-bnnumbers`. `bn-family-words` (band 3) — REUSES BnWordsScene via a `mode:"family"` (modeForSkill plumbing, title switches to "পরিবারের শব্দ"), new pure-emoji family assets (mom/dad/brother/sister/grandpa/grandma/uncle/aunt/cousin — no SVGs needed, render instantly).
- **✅ Verified:** core `tsc` rebuilt, kid `tsc --noEmit` clean, audit clean (**43 skills, 35 games, 35 scenes**, i18n EN+BN complete, seed parity), deployed to box. Live bundle `assets/index-CclL6csk.js` contains all new markers in EN+BN (Bangla Numbers/Family Words/Listen — which number? + বাংলা সংখ্যা/পরিবারের শব্দ/শোনো — কোন সংখ্যাটা? and Batch B words because/Zebra/হাতি/হা-ডু-ডু/rat/সোনালি/তাজিংডং). API `/api/v1/content/skills` returns 43 incl. bn-numbers + bn-family-words.

## 🎯 DAILY QUEST + 📲 OFFLINE-FIRST, MADE VISIBLE 8 Aug 2026 ✅ (user: "do 3 & 4")
The retention engine (Duolingo-style daily goal) and the BD-data-cost killer (offline-first, now a visible feature).
- **🎯 Daily Quest** — every day Nova sets "Play 3 rounds" → win a 5 🪙 bonus. New `NovaState` fields `questDay`/`questRounds`/`questDone` + `novaQuestRound(kidId)` store action (resets each calendar day, awards within the daily cap, returns true the moment it completes). Called on every `onRoundDone`; the MOMENT it completes: `tada()` + Nova SPEAKS "Quest complete! You won 5 bonus coins! 🎉" (বাংলা: "মিশন শেষ! তুমি ৫টা বোনাস কয়েন জিতেছ! 🎉").
- **Home screen quest chip** — a live "🎯 Today's Quest · Play 2/3 rounds" pill with a progress bar under the PLAY button; flips to "✅ Quest complete! +5 🪙 bonus" when done. Reads straight from the store (re-renders live as rounds complete).
- **📲 Offline-first, made visible** — the kid app was already fully offline (SW precaches every asset, local-first store, offline sync queue, no external CDNs). Now it's a FEATURE: a "📲 Get the app" chip appears when the browser offers install (`beforeinstallprompt`); otherwise a green "✓ Works offline" chip shows once the service worker controls the page (both EN+BN). The install-to-homescreen → airplane-mode story is now one tap away from a parent seeing it.
- **✅ Verified:** `tsc --noEmit` clean, audit clean, deployed. Live bundle `assets/index-DdswEFni.js` contains the quest wiring (`novaQuestRound`/`questDone`/`questRounds`/`questCompleteSpeak`), quest strings ("Today's Quest", "Play ${c}/${x} rounds", "Quest complete", "bonus coins") in EN+BN (আজকের মিশন / মিশন শেষ / বোনাস), and the offline chips ("Get the app"/"Works offline"). New bundle IS in the SW precache (`sw.js` 200), and deployed index.html has ZERO external refs — fully precacheable, airplane-mode ready.

## 🦉 NOVA'S MORNING GREETING — "today's plan" on open 8 Aug 2026 ✅ (user: "do it")
The first thing a kid sees is now a PERSONAL coach, not a generic owl. Nova greets the child BY NAME with their STREAK and TODAY'S RECOMMENDED SKILL the instant the app opens.
- **"Whoo, Zara! 4-day streak 🔥 Today: Count to 10! 🎯"** (bn: "হু, জারা! ৪ দিনের ধারা 🔥 আজ: ১ থেকে ১০ গুনি! 🎯"). If no streak yet, the streak clause drops out ("Whoo, Zara! Today: Count to 10! 🎯").
- **Where it comes from:** App.tsx computes the plan fresh on every Nova open via `recommendedSkill(useKidStore.getState().skills, kid.id)` (the linear-journey "next thing" — first unmastered stop, world order) + `nova[kid.id].streak`, and passes `recTitle`/`recTitleBn`/`streak` into the Nova scene data. NovaScene picks the title in the app's language (`this.lang`) and speaks it.
- **Why it matters:** the app NEVER says "pick something" — it says "here's what we're doing today," like a coach. The demo wow (name magic + streak + plan) is now the home-screen hello, not buried 3 taps deep. The streak strip at the top reinforces it visually while Nova says it aloud.
- **✅ Verified:** `tsc --noEmit` clean, audit clean, deployed. Live bundle `assets/index-B7ExoJHv.js` contains the morning template (`}-day streak 🔥 \`:\"\"}Today: ${g}! 🎯`), Bangla variant (দিনের / আজ:), and the `recTitle`/`recTitleBn` wiring. /health 200.

## 📊 WEEKLY LEARNING REPORT + WHATSAPP SHARE 8 Aug 2026 ✅ (user: "think as a silicon valley founder")
The buying loop + viral loop in one card. Parents now get a "show me my kid actually learned this week" report, and can forward it on WhatsApp — the only realistic distribution channel in Bangladesh. Privacy-safe: shares only aggregates; nothing leaves unless the parent taps share.
- **API `GET /api/v1/kids/{kid_id}/weekly`** (kids.py) — 7-day report, all computed server-side from the existing `ProgressEvent` + `SkillMastery` data: per-day rounds/minutes, total rounds, correct%, active-learning minutes (Σ response_ms), distinct active days, top game, and **mastered_this_week** (skills ≥80% BKT mastery AND last practiced inside the window). New `WeeklyOut`/`WeeklyDayOut` schemas.
- **Parent portal "📊 This week" card** (parent/app/parent/page.tsx) — stat tiles (rounds / correct% / minutes / days active), a 7-day activity bar chart (per-day rounds, weekday labels), the "🏆 Mastered this week" list, and a green **"Share on WhatsApp"** button → `wa.me/?text=…` with a human summary ("Zara’s learning week… 10 rounds · 5 min · 3 days active · 🎯 80% correct · 🏆 Mastered 1 skill: count to 10"). Handles the empty week gracefully.
- **✅ Verified end-to-end on the box:** signup → kid → POST 10 progress rounds → weekly returns `rounds:10, correct_pct:80, minutes:1.0, active_days:1, mastered_this_week:[count-1-10, grow-count], top_game:game-countpop`; days array correct oldest→newest. Test profile deleted via psql (cascade cleaned kid+events). `py_compile` clean, parent `tsc --noEmit` clean, deployed. Dashboard chunk `app/parent/page-aa93806a5d21af64.js` confirmed to contain the weekly card; `/health` 200; `/weekly` 401-without-token (auth-gated).

## 0 UNTRANSLATED HEADERS + INTEGRITY AUDIT 8 Aug 2026 ✅ (user: "what else can be improve")
Every scene header now switches language with the app — and a new zero-dependency audit guards the whole catalog.
- **🌐 All 32 scene headers go through central i18n.** Previously ~29 game screens hardcoded their English title (`text(0,0,"Count & Pop",…)`) so Bangla-mode kids saw English headers. Now every header is `t("titleXxx")` with EN+BN entries in i18n.ts (titleCountPop "Count & Pop"/"গণনা ও পপ", titleBalance "⚖️ Heavy or Light"/"⚖️ ভারী না হালকা", titleFrogHop "🐸 Frog Hop"/"🐸 ব্যাঙের লাফ", titleClock "🕒 Clock Time"/"🕒 ঘড়ি পড়া", titleMemory, titleBalloon, titleGrammar, titleBnWords, titleAddSub100, titleDivision, titlePercent, titleDecimals, titleArea, … — 32 titles total). Two sneaky cases handled: FruitAdd's mode-dependent title was a ternary (now fixed to t()), and three scenes' empty-string placeholders were the round-subtitle, not the title (reverted).
- **🔍 New `apps/kid/scripts/audit.mjs` — zero-dependency integrity audit** (`node scripts/audit.mjs`), four checks:
  - **① i18n completeness** — every `t("key")` used in any scene must exist in BOTH EN and BN (a missing key silently renders the raw key to a child). Also catches dynamic keys (`speech.ts` builds `"qAdd"`…) via a camelCase+double-quote scan that never swallows data words (whistle/xiaomi/zoom…).
  - **② core catalog** — no duplicate skill/game ids; every `skill.game` ∈ GAMES; every GAME has a GAME_SCENES entry with a real `XxxScene.ts` (`export class`) registered in App.tsx import + array.
  - **③ seed parity** — every core skill id exists in `apps/api/app/seed.py` (or progress sync 500s on FK).
  - **④ untranslated headers** — flags `text(0,0,"English…")` literals left in scenes.
  - Two real bugs the audit caught and we fixed: BalloonPop + Balance hardcoded their wrong-answer hints inline (now `t("balloonAsk",{a,b})` / `t("balanceCountHint")` — centralized EN+BN, function entry for the math template); removed the dead `notMatch` + `titleBnLetters` keys.
- **✅ Verified:** `node scripts/audit.mjs` → **✓ clean (0 errors, 0 warnings)**; `tsc --noEmit` clean; deployed; live bundle `assets/index-CXI6NVQr.js` contains the new title keys (titleCountPop/titleBalance/titleFrogHop/titleAddSub100/titleArea/titlePizza…) + Bangla titles (গণনা ও পপ, বেলুন ফুটাও, বাংলা শব্দ) + the centralized hint strings. /health 200, kid root 200.

## NOVA'S COUNTING SONG + NAME MAGIC 8 Aug 2026 ✅ (user: "do something out of the box, please do your best please")
A musical game + universal name personalization — the app now SINGS and calls each child BY NAME.
- **🎵 Nova's Counting Song** (`game-countsong`, band 1 math · "Number song" · LEVELS 3→5→7→8→9→10). A real, singable counting melody: Nova SINGS 1..N as a rising C-major scale (1→C4 … 10→E5, `playNote` exported from audio.ts). Every number = its own bell note:
  - **Sing phase** — Nova bobs and "sings" each number on a 580ms beat: the button BOUNCES + a gold ring flashes + a triangle bell note plays + TTS counts along (queued, `cancel:false`, so 1,2,3… is heard in order).
  - **Your-turn phase** — the kid sings it back by tapping OR SWEEPING (drag-to-pop) the number buttons in order; every tap plays its note, so they literally build the melody. Sequencing like Count & Pop (`keepOnWrong` — wrong taps shake + recover, never retire). `nv:noSwipe` + `enableDragToPop` → a finger sweep is an instrument.
  - **🦉 Nova is the COACH** — stuck on your turn? Tap Nova and she HUMs the whole tune again (notes + bounces only, no TTS, no state change; `humming` guard prevents stacks).
  - **Reward** — finish the round and Nova plays the full melody (fanfare delayed until after the last note so it never clashes), dances + wobbles, then SPEAKS "Great singing, {name}! 🎵".
- **🗣️ NAME MAGIC — Nova knows every kid by name.** New `kidName.ts` (`setCurrentKidName`/`getKidName`), set by App right before each session. `kidName: kid.name` is now also passed in the scene-start data (was garden-only). Two spots personalized:
  - **Wrong-answer feedback** is now "Almost, {name}! Try again 💪" (EN) / "প্রায়, {name}! আবার চেষ্টা করো 💪" (BN) — i18n `almost`/`almostBubble` became function entries with optional `{name}`.
  - CountingSong's finish cheer uses the name directly.
- **✅ Verified:** `tsc --noEmit` clean; deployed; live bundle `assets/index-FvSgQm70.js` contains the CountingSong scene + `humMelody` + melody freqs (261.63…659.25) + i18n (songTitle/songListen/songNowYou/greatSinging EN+BN) + `kidName` module + personalized "Almost". `/health` 200; `/api/v1/content/skills` returns 36 skills incl. number-song.

## 5 NEW ENTERTAINING LEARNING GAMES 8 Aug 2026 ✅ (user: "add 5 entertaining games where kids can learn")
Five brand-new games across 3 bands × 4 subjects, each with a real game-feel mechanic, registered end-to-end (core catalog + scene + App registration + API seed + central i18n):
- **🐸 Frog Hop** (`game-froghop`, band 1 math · "Number line hops" · LEVELS 3→10) — a lily-pad number line; tap the pad with the target number and the FROG arc-hops onto it (up-down hop + landing wobble). Pads are big teal circles, frog lives ON pad 1 (never off-screen on narrow phones), soft water line under the grid. Speech: "Hop to {word}!".
- **🃏 Memory Pairs** (`game-memorypairs`, band 1 math · "Match numbers" · LEVELS 2→7 pairs) — classic flip-match: match the NUMERAL card to the FRUIT-COUNT card (apple grid). Every reveal speaks the number aloud (queued, cancel:false); matches ring-correct + sparkle + "It's a match — {word}!"; mismatches shake + flip back. No swipe layer (custom cards — no modern button factory used).
- **🎈 Balloon Pop** (`game-balloonpop`, band 2 math · "Add to 20" · sums 6→20) — arcade addition: 4 colored balloons bob + wobble, each hiding an answer; pop the one with the sum. Wrong taps deflate + sink; correct pops with confetti. Question bubble shows `a + b = ?`, speech via `speakMath("add", a, b)`.
- **🕒 Clock Time** (`game-clock`, band 3 math · "Tell time" · LEVELS 1→6 modes) — a big analog clock draws its hands in front of the kid (hands sweep 0→target); tap the matching digital time (3 buttons). Modes ladder: o'clock → half past → quarter → 5-min (skip easy) → any 5-min → any minute. Bangla digital labels via a digit map; correct answer spoken in words ("half past three" / "সাড়ে তিনটা").
- **⚖️ Heavy or Light** (`game-balance`, band 2 science · "Heavy or light" · counts 5→14, gap 3→1) — a seesaw with two frosted buckets of apples + count badges; tap the HEAVIER side. Correct → plank tilts down on the winning side (Back.easeOut); wrong → plank dips toward the tap briefly then hintWrong retires it. Speak: "{x} is heavier than {y}!".
- **🔌 Registration (the 5-spot checklist):** `packages/core/src/skills.ts` (+SKILLS, +GAMES `difficultyLevels`, +GAME_SCENES), 5 new scene files in `apps/kid/src/game/`, App.tsx imports + scene array, `apps/api/app/seed.py` SKILLS_SEED (+5 rows), i18n.ts EN+BN keys (hopTo, hopToSpeak, memoryIntro, pairMatched, notMatch, balloonAsk, clockAsk, timeOClock/HalfPast/QuarterPast/QuarterTo/Exact, balanceAsk, balanceHeavier). All use Nova's question bubble + round meter + hintWrong reveal ladder; `tsc --noEmit` clean on both core + kid.
- **✅ Verified:** core rebuilt (`dist/skills.js` has the 5 game ids ×3), deployed to box; live bundle `assets/index-Ci2LZm76.js` contains all 5 titles + scene keys + i18n keys in EN+BN; `/health` 200; `/api/v1/content/skills` returns 35 skills including number-line / quantity-match / add-to-20 / heavy-light / tell-time.

## SWIPE TO CHANGE NOVA'S ROOMS 8 Aug 2026 ✅ (user: "make nova swipe to change the rooms")
- **👆 NOVA'S HUB NOW FLIPS ROOMS BY SWIPE.** Swipe LEFT → next room, RIGHT → previous room (12 rooms: Field, Garden, Bathroom, Kitchen, Bedroom, Living Room, Beach, Forest, Space, Party, School, Rooftop).
- **New `enableSwipeRooms(scene, onDir, {ignoreStart})` in gestures.ts** — reuses the shared swipe threshold + gold swipe-arrow feedback. Safety rules:
  - a swipe that STARTS on a tappable object (Nova herself, the dock FABs, the room ‹ › chevrons, back button, an open sheet's full-screen dim) is left alone — that's a TAP; only open-canvas swipes flip the room.
  - start-point detection uses `scene.input.manager.pointWithinHitArea` over visible+input-enabled containers (respects real hit areas like Nova's 320×400, and skips objects hidden inside an invisible closed sheet via an ancestor-visible walk).
  - `ignoreStart` lets NovaScene veto swipes while a sheet is open (the dim already closed it on press).
  - scene's `setRoom` now has a `roomSwitching` guard so rapid swipes can't skip rooms erratically mid-fade.
- **✨ Nova reacts** — every flip: `pop()` + fade-swap + sparkle, a gold swipe arrow shows where the finger went, and Nova says a delighted random line via central i18n ("Ooh, a new room! 🎉" / "ওহ্, নতুন ঘর! 🎉"). `poke()` counts the swipe as interaction (never dozes mid-explore).
- **👶 One-time discoverability nudge** — a small dark-pill "‹ swipe to explore ›" (EN) / "‹ সোয়াইপ করে ঘুরে দেখো ›" (BN) appears under Nova ~4s after hello with the gold chevrons gently reaching toward each other; fades after 9s or permanently on the kid's first successful room flip. Cleaned up on scene shutdown.
- **✅ Verified:** `tsc --noEmit` clean; deployed; live bundle `assets/index-C0a8SzxY.js` contains the swipe gesture (`nv:swipeRooms`, `pointWithinHitArea`, gold arrow `lineStyle(14,16765286)` @ depth 9500), the i18n nudge/reaction strings in both languages, and the `roomSwitching` guard. /health 200, kid root + parent manifest 200.

## NOVA'S QUESTION BUBBLE + CENTRAL i18n 8 Aug 2026 ✅ (user: "Still Questions is not caught attenion of Kids, make it more interesting and use a central translation for bn and en")
- **🦉 NOVA'S QUESTION BUBBLE (`question.ts`) — questions now POP, they don't sit.** Replaced every scene's static question text with a comic speech bubble that kids physically cannot ignore:
  - **Warm-gold comic bubble** with navy outline + white inner ring + a little tail pointing at the answer buttons (tail auto-off for bottom-anchored scenes: CountPop, letter games, ShapeCatcher).
  - **Nova the owl 🦉 peeks from the side** (white ring behind her so she pops off the gold) and bobs gently forever.
  - **POP-in animation on every question change** — bubble scales 0.5→1.0 (Back.easeOut) + a golden ring flares out + 5 sparkle stars burst + a `pop()` sound. The ring/sparkles burst at the panel's actual position (outer/inner container split keeps idle motion from fighting pop-in).
  - **Idle attention-motion**: the bubble breathes (glow pulses) + sways a hair (±2°) on an endless loop — motion keeps drawing peripheral attention even after the pop.
  - 32px navy extra-bold text on gold = the highest-contrast kid-safe combo in the app.
  - Migrated **all 26 question-holding scenes** to the panel (`this.prompt = questionPanel(...)`; every `setText`→`set`, `setPosition` unchanged). Removed the now-dead `questionTxt` import from all scenes (export kept in ui.ts).
- **🌐 CENTRAL EN/BN TRANSLATION (`i18n.ts`)** — one table, one function: `t("key", {vars})`. Replaced the scattered inline `getAppLang()==="bn" ? "…" : "…"` ternaries for every user-facing line:
  - **All 26 question prompts** ("Solve it!" → `t("solveIt")`, "How many in all?" → `t("howManyInAll")`, dynamic "Find {ch} ({hint})", "Tap the {target}!", "Where does this live? ({n}/{total})"…).
  - **All spoken math** (`speakMath` → `qAdd/qSub/qMul/qDiv/qPct/qBonds/qConcreteAdd/qConcreteSub`) and the answer reveal (`answerIsWord`).
  - **Feedback + hint banners** (almost, answerIs, answerIsOnly), **Round labels** (28 sites incl. CountPop's `roundTap` and GrowCount's `seedCount`), **Fruit-basket narration** (putInBasket, thereAreWatch, takeAway, plusMore, plusEquals, minusEquals, countLeft, countAll), "Let's learn!".
  - `t()` interpolates `{var}`s, falls back EN → key. NovaScene's old inline table untouched (already central to its own scene).
- **✅ Verified:** `tsc --noEmit` clean; deployed; live bundle `assets/index-*.js` (D8cmpvju → final) contains the bubble (32px, owl, fillTriangle, gold #ffd166, Back.easeOut, ✦ sparkle, `tail:"none"` ×4), the full i18n table (EN + BN questions, Round {n}, qConcreteAdd, whereLivesN, roundTap, seedCount, putInBasket, answerIsWord), and the corrected sub-hint. Old static 34px warm-white path gone from scenes. /health 200.

## BIG QUESTIONS + BASKET MATH CONCEPTS + STALE-SPEECH FIX 8 Aug 2026 ✅ (user: "questions should Speak And it should Big enough for notice to Kids, Before go real subtraction or addition they should know about the +,- symbol and concepts by fruits or symbol, maybe adding to basket... helper TTS voice speak old result")
- **🆕 QUESTIONS ARE NOW BIG** — every scene's question line switched from small `promptTxt(17-20px)` to new `questionTxt()` in `ui.ts`: **34px warm-white (#fff8e1) with heavy navy stroke + glow**, word-wrapped to 340px so long Bangla questions still fit a phone. Applied to **23 scenes** (all question-holding games). `promptTxt` cleaned from unused imports. GardenScene keeps its small welcome banner (not a question).
- **🧺 BASKET MATH — the +/− concept lesson (FruitAddScene).** First exposure to `add-within-10`/`sub-within-10` (wired via `SessionStep.teach` → `game.scene.start(…, {teach:true})`) now runs a NARRATED demo round BEFORE the abstract drill:
  - **ADD:** apples drop into the wicker basket ONE-BY-ONE with counting narration, a big green `+N` chip floats above, then the question is asked with CONCRETE language: EN "Here are 3 apples, and 4 more come. How many in all?" / BN "এখানে ৩টা আপেল আছে, আর ৪টা যোগ হলো — মোট কতটা?".
  - **SUB:** apples already in the basket, a big red `−N` chip appears, then that many apples FLY OUT while narrating, then: EN "There are 5 apples. Take 2 away. How many are left?" / BN "৫টা আপেল আছে। ২টা নিয়ে নাও — বাস্কেটে কতটা বাকি?".
  - **Correct answer in teach mode → celebrates the equation aloud** ("3 plus 4 equals 7" / "তিন যোগ চার সমান সাত"), then real drills start.
- **🛠️ SUB-MODE HINT WAS WRONG (fixed).** It said "Count ALL the fruit" during subtraction — now mode-aware: EN "Count what's left after taking 2 away" / BN "২টা নেওয়ার পর বাস্কেটে কতটা বাকি গুনো".
- **🐛 STALE-SPEECH BUG (fixed — "need to click 2 it's say 1").** Root cause: the miss#3 reveal spoke the PREVIOUS round's result because a stale hint was still queued, and digits were spoken as bare digits (engine-dependent, mangleable). Fix in `hints.ts`: reveal now calls `cancelSpeech()` first (kills stale hint), then speaks the NEW answer via `speakAnswer()` using word-aware numbers (`enNumber` EN 0-99 / `bnNumber` BN): "The answer is two" / "উত্তর হলো দুই". This replaces the old digit-only reveal across every scene.
- **✅ Verified:** `tsc --noEmit` clean; deployed to box; live bundle `assets/index-D8VbU40Z.js` contains `34px` + `#fff8e1` (big questions), the full basket/teach narration in EN+BN ("Here are", "Take", "away!", "watch!", "টা আপেল আছে", "টা নিয়ে যাই", "টা আরও যোগ", "টা নেওয়ার পর", "যোগ হলো", "সমান"), the corrected sub-hint ("Count what's left after taking"), and the word-aware reveal ("The answer is"). /health 200.

## NATURAL, KID-FRIENDLY TTS 7 Aug 2026 ✅ (user: "Kids all games question must speak with TTS... make TTS more natural and KIDs friendly")
- **🗣️ EVERY game already spoke its question** (all 29 scenes call `speak()`/`speakMath()` per round) — the audit found the real problems were NATURALNESS ones, all fixed in `speech.ts`:
  - **SYMBOLS ARE NOW SPOKEN, NOT DROPPED.** The old preprocessor DELETED `%` `×` `÷` `−` `=` — so "What is 50% of 80?" read "What is 50 of 80?". New `naturalize()` expands them to words, language-aware: `%`→"percent"/"শতাংশ", `×`→"times"/"গুণ", `÷`→"divided by"/"ভাগ", `5-3`→"five minus three"/"পাঁচ বিয়োগ তিন", `=`→"equals"/"সমান", `&`→"and"/"এবং".
  - **MATH QUESTIONS ARE NOW REAL QUESTIONS.** `speakMath` said flat "3 plus 4" (no rising intonation). Now: EN "What is 3 plus 4?" / "What is 12 divided by 3?" / "What is 50 percent of 80?"; BN "তিন যোগ চার কত?" / "বারো ভাগ তিন কত?" / "আশি-এর পঞ্চাশ শতাংশ কত?" — teacher-like, curious, and the engine reads the `?` with kid-appealing question tone. Numbers still spoken as real Bangla words via `bnNumber`.
  - **HINTS ARE THE CALMEST VOICE.** Hints spoke FASTER (rate 1.0) than questions (0.9) — backwards. Now rate **0.86** — the teaching moment is the slowest line in the app.
  - **PLATFORM-AWARE PITCH.** 1.15 pitch made Android's Google voices chipmunk. Now: Android **1.05** (warm, not shrill), Apple **1.12** (warm teacher pitch). Rate 0.9 slower, volume 0.9, offline local voices, PWA-unchanged.
  - **PIZZA FRACTION BUGS FIXED.** PizzaFrac was SPEAKING THE ANSWER ("3 out of 4") before the kid chose — now asks "How much pizza is shaded?" / "পিৎজার কত অংশ রঙিন?" (the visual carries the info). FractionMatch now narrates then asks: "This shows 2 out of 4 — tap the simplest fraction!" / "এটা দুই ভাগ চার — সবচেয়ে ছোট ভগ্নাংশটা বাছো!".
- **✅ Verified:** `tsc --noEmit` clean; regex-tested `naturalize()` + all speakMath phrases in both languages; deployed; live bundle `assets/index-74G79ziI.js` contains `rate:.86` (slow hints), `pitch=...android?1.05:1.12`, "What is…"/"কত" question strings, and "How much pizza is shaded" (no answer-reveal). /health 200.
- **👉 On any phone:** open any math game — you'll HEAR "What is 3 plus 4?" / "তিন যোগ চার কত?" with a warm, slightly-high kid voice, symbols read as words, and hints spoken slowest when a kid is stuck.

## PWA ACCESS — parent portal now installable 7 Aug 2026 ✅ (user: "how about PWA access, Always think about PWA")
- **📲 THE PARENT PORTAL IS NOW A PWA.** Parents manage kids from their phone, so `/parent/` got the full installable treatment (the kid app was already a PWA from day one):
  - **manifest** at `/parent/manifest.webmanifest` — name/short_name, `start_url`+`scope` = `/parent/`, `display: standalone`, theme #6c4cf1, background #1a0b3e, brand icons 192/512 + maskable.
  - **service worker** `/parent/sw.js` (scope `/parent/`) — cache-first for immutable hashed `/_next/static` chunks (fast reopens), **network-first for navigations** (fresh portal every launch, cached shell as offline fallback), and **never touches `/api/`** (the parent sees LIVE mastery, never a stale snapshot). Pre-caches the shell on install; versioned cache with skipWaiting + clients.claim so updates land.
  - **iOS support** — `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, `status-bar-style black-translucent`, `apple-touch-icon`; parent can "Add to Home Screen" → standalone full-screen portal.
  - **registration** — tiny `PwaBoot` client component in the layout registers `${NEXT_PUBLIC_BASE_PATH}/sw.js` on window load, skipped in dev. (Next does NOT basePath-prefix the auto `app/manifest.ts` link — it emitted `/manifest.webmanifest` (the KID manifest!) — so we use a **static `public/manifest.webmanifest` + explicit `metadata.manifest`** pointing at `/parent/manifest.webmanifest`. Root `/manifest.webmanifest` is still the kid app's, untouched.)
  - **nginx** — `/parent/sw.js` served `no-store` (SW updates always land), manifest no-cache, HTML shell no-cache (installed portals jump to newest build).
- **✅ Verified live:** all statuses 200 over HTTPS (`/`, `/parent/`, `/parent/sw.js` no-store, `/parent/manifest.webmanifest`, `/admin/`); all three manifest icons 200; `<link rel="manifest" href="/parent/manifest.webmanifest">` in the served HTML; iOS meta tags present; registration code shipped in `layout-8f625db6c20ed005.js` (`serviceWorker.register`); parent control strings still in route chunk `app/parent/page-1ccc…`.
- **👉 On a phone:** open `/parent/` → browser menu → "Add to Home Screen" → a standalone full-screen Numberverse Parents icon that reopens instantly.
- **PWA-first principle:** kid app (full offline, local-first) ✅ · parent portal (installable, fast shell, live data) ✅ · admin console = desktop ops tool — can get the same manifest+SW pattern later if needed.

## PARENT CONTROLS + PORTALS 7 Aug 2026 ✅ (user: "admin and parent portal is not good, parent can have more controls")
- **🎛️ FULL PARENT CONTROL CENTER.** The parent portal (`/parent/`) was rebuilt into a control center: for each kid a parent can now
  - **subject toggles** — turn off whole subjects (Math/Bangla/English/Science/BGS); off-subject skills vanish from the journey, worlds, and world-progress;
  - **difficulty cap** — 1–5 or "All"; worlds above the cap stay locked (overrides the progress-unlock rule);
  - **daily playtime** — 10/15/30/45/60/90 min or none; the kid app counts real minutes and blocks PLAY with a friendly "⏰ Playtime is all done for today" banner (EN + বাংলা) when the cap is hit;
  - **voice + music toggles** — TTS off silences every hint (speech.ts `setSpeechEnabled`), music off forces mute;
  - **edit name/avatar/birth year**, **delete kid**, **reset progress** (wipes BKT mastery + activity), a **recent-activity feed**, and the per-skill mastery table.
- **⚙️ HOW THE KID APP ENFORCES IT.** New `KidSettings` model + `GET/PUT /kids/{id}/settings`, `PATCH /kids/{id}`, `GET /kids/{id}/activity`, `POST /kids/{id}/reset` in FastAPI. The kid app fetches settings per kid (localStorage cache so offline play still obeys the rules), and module-level `filterSkills`/`filterMaxBand` + `applyKidControls()` rewire the journey/worlds/mastery helpers — a `setFilterTick` re-render bumps pick up changes instantly. Daily playtime is tracked per-day in `nv_play_minutes` and gated in `startPlayWorld`/`startSingleSkill`/`replaySession`.
- **🖥️ ADMIN CONSOLE + KID SETTINGS RESOURCE.** Admin dashboard (react-admin) got a real **Dashboard** (Parents/Kids/Skills/Content/Rounds/Subscriptions stat tiles + recent rounds, plain JSX — no MUI) and the full resource list now includes `kid_settings` (WHITELIST + UUID models updated in admin.py).
- **✅ Verified:** `tsc --noEmit` clean in kid/parent/admin; API `py_compile` clean; deployed via deploy.sh; live smoke test over the tunnel signed up a device account → created kid → `GET settings` default → `PUT settings` (saved + `updated_at`) → `PATCH` rename → `POST progress` (real skill `count-1-10`) → `GET activity` 2 newest-first → `GET mastery` BKT `0.1116` → `POST reset` emptied activity → `DELETE` 204. Live bundles confirmed: kid JS has the limit-banner/playLimitReached code, parent route chunk `app/parent/page-1ccc…` has "Learning controls/Daily playtime/Reset progress", admin JS has the dashboard tiles. /health 200.
- **👉 Try it:** open `/parent/` → sign in → pick a kid → flip off Bangla, set cap to 3, daily 10 min → open the kid app: the journey shrinks, worlds 4–5 lock, and after 10 minutes of play the PLAY button shows the ⏰ banner.

## iOS ROOT-CAUSE FIX + PREMIER SPLASH 8 Aug 2026 ✅ (user: "still iOS issue, splash no-ads tagline + more attractive")
- **🎯 THE REAL iOS ROOT CAUSE — found it this time.** The bottom navy strip AND the questions-overflow are ONE bug: `body`/`.game-app` were `position: fixed; inset: 0`, which pins to the **LAYOUT viewport**. On iOS Safari the layout viewport INCLUDES the area under the collapsing toolbar, so:
  - when the toolbar hides, the app box stays SHORT → navy strip at the bottom;
  - scene content positioned near `this.scale.height` (questions, answer rows) is placed below the visible area → looks cut off / "overflow".
  **FIX:** both now use `top/left/right: 0` + **`height: 100dvh`** (with `-webkit-fill-available` + `100vh` fallbacks) — the dynamic viewport grows as the toolbar collapses, so the app ALWAYS fills exactly the visible screen and bottom-anchored text lands on-screen.
- **📐 Phaser re-measures when iOS chrome moves.** Safari fires `visualViewport.resize` (NOT `window.resize`) on toolbar collapse, and the canvas can go stale after HUD show/hide. The Phaser effect now adds a **`visualViewport` resize listener + a `ResizeObserver` on the canvas wrap** → `game.scale.refresh()` (rAF-throttled) → every scene re-lays out the moment the visible area changes.
- **✨ SPLASH REDESIGN — no-ads promise + way more attractive.** Nova now pops up over floating bubbles (8 colors rising on loop), two expanding glow rings, a shimmer sweep across the whole screen, a pulsing-glowing "Numberverse" title, the tagline, and a gold **"🔒 No ads, ever · 100% private"** pill (Bangla: "কোনো বিজ্ঞাপন নেই · সম্পূর্ণ ব্যক্তিগত") — the privacy promise leads the launch. Progress bar + full fade-out, unmounts fully.
- **✅ Verified:** `tsc --noEmit` clean; deployed; live JS `assets/index-H36Uiblk.js` (splash no-ads strings, rings, `visualViewport`, `ResizeObserver`, `scale.refresh`); live CSS `index-DKzCNBUR.css` (`splash-float`/`splash-shimmer`/`splash-ring`/`splash-no-ads`, `100dvh`+`fill-available`, and **zero `inset:0`**). Site 200, /health 200.
- **👉 On the iPhone 15:** close + reopen the PWA. You'll see the new no-ads splash, then in games the question text + answer row stay fully on screen, and no navy strip at the bottom — including when Safari's toolbar collapses.

## SPLASH + SETTINGS + TTS-CHECK + iOS OVERFLOW 8 Aug 2026 ✅ (user: "make more simple, add settings for language, TTS check on each run, realistic splash, iOS question overflow + bottom blue on iPhone 15")
- **✨ REALISTIC SPLASH on every launch.** `SplashScreen` in `main.tsx`: Nova pops up with the logo + a "learn by playing" tagline over a glowing navy gradient, a shimmer progress bar sweeps, then the whole thing dissolves into the app (1.6s show + 0.5s fade, fully unmounts). Capture-phase TTS prime still fires even if a kid taps during the splash.
- **⚙️ DEDICATED SETTINGS SCREEN (simpler play screen).** The PLAY screen is now even cleaner: removed the "Numberverse" title and the stars pill; the parent-lock button became ONE **⚙️ gear** (top-right). Gear → Settings screen with: language (EN/বাংলা), music, fullscreen, install, sync status, and a **Voice & reading** card (status + live "Test voice" button). Parent analytics reachable from Settings. The old settings card in the parent panel was removed (no more duplication).
- **🔊 TTS CHECK ON EVERY RUN.** New `speechReadiness()` in speech.ts + a probe hook in App that runs at every mount: it polls voices for ~5s AND re-probes right after the first tap (iOS only populates `getVoices()` after the prime speak). Result shows as a tiny **🔊/🔇 chip** on the PLAY screen — green/quiet when ready, orange `🔇` when no voice is installed. Tap → Settings for the full check + test.
- **📱 iOS QUESTION OVERFLOW FIXED (iPhone 15).** Long Bangla prompts (e.g. CountPop's "এক থেকে ১২ পর্যন্ত ক্রমানুসারে সংখ্যাগুলো ফুটাও" ~460px wide) ran off the right edge of a 390px iPhone. `promptTxt()` now carries `wordWrap: { width: 340, useAdvancedWrap: true }` — every prompt/question in every game wraps to ≤340px (short prompts are untouched). Plus a new `wrapPrompt()` helper for any scene that needs explicit re-wrap on resize.
- **🟦 BOTTOM "PADDING OF BLUE" FIXED.** Root cause: `.game-app` set BOTH `position: fixed; inset: 0` AND `height: 100dvh` — on iOS the height override beats the bottom edge, leaving a strip of navy under the canvas. Removed the explicit heights; `inset: 0` alone pins the flex column (HUD + canvas) to the true visual viewport edge-to-edge, including behind the home indicator.
- **✅ Verified:** `tsc --noEmit` clean; deployed; live bundle `assets/index-CY2coBGy.js` contains splash ("learn by playing" / "খেলতে খেলতে শেখা"), settings, voice-chip, `useAdvancedWrap` ×2 (prompt wrap live); live CSS `index-DSwA3Uw3.css` has splash/voice-chip styles and **zero `100dvh`**. Site 200, /health 200.
- **👉 On the iPhone 15:** close + reopen the PWA — you'll see the splash, land on the simpler PLAY screen with the ⚊️ gear, the 🔊/🔇 voice chip reflects this run's TTS check, questions no longer clip off the right edge, and the navy strip under the games is gone.

## REDESIGN 8 Aug 2026 — the whole app flow is now KID-FIRST ("one tap to play") ✅
- **🤔 WHY:** "The way this app start and navigate is hard for Child." The old home was a wall of ~8 buttons (Play, Nova, Garden, switch kid, parent zone, language, music, fullscreen, install, sync). Play didn't play — it went to worlds/kidpick, and the SAME kid was asked "who's playing?" on EVERY launch (kid state was never persisted). Parent stuff was right in the kid's face.
- **🧭 NEW FLOW — the child never makes a decision:**
  - **Launches remember who's playing** (`nv_kid_id` in localStorage). Open the app → straight to the PLAY screen, no "who's playing?" ask ever again.
  - **PLAY screen = ONE giant button.** Big Nova mascot + one huge "▶ Play" (92px tall). It auto-starts the **recommended next lesson** — the first unmastered journey stop in world order (`recommendedSkill()`), replaying the first lesson when the whole journey is done. Under the button a soft "Next up: {lesson}" line tells the parent what will play.
  - **First-ever launch (0 profiles) → straight to the Add-a-kid form** (onboarding). After saving, the fresh profile is auto-selected and the app opens on PLAY — a brand-new kid is one tap from a game.
  - **Everything else is a small icon row** below PLAY: 🗺️ Worlds (the journey map), 🦉 Nova, 🌱 Garden.
  - **Switch kid** = tap the avatar chip (top-left, "⇄") → simplified big-avatar picker; tap a kid → straight back to PLAY.
  - **Parent Zone + all settings moved behind the small 👨👩👧 lock** (top-right). Language/music/fullscreen/install/sync now live in a "parent settings" card inside the parent panel — completely out of the kid's reach. The crowded home footer is gone.
  - **Every back arrow lands home.** Leaving a game, Nova back, worlds back → all return to the PLAY screen (was worlds/worlddetail/kidpick before). One simple place a child always comes back to.
  - **Remove-kid no longer strands a blank screen** (routes to picker/onboarding).
- **✅ Verified:** `tsc --noEmit` clean; deployed; live bundle `assets/index-C6MG_Nju.js` contains the fingerprints (`nv_kid_id`, "Next up:", `play-btn`, `parent-lock`, `play-mascot`); live CSS has `play-screen`/`kidpick-card`/`parent-settings`/`play-bob`. Site 200, /health 200.
- **👉 On the iPhone/any device:** reopen the app — it lands on PLAY and starts where you left off. For a brand-new install it asks you (the parent) to add your child once, then straight to PLAY.

## FIX 8 Aug 2026 — iOS PWA: games not mobile-friendly + TTS silent ✅ (reported by user)
- **📱 PORTRAIT-ONLY GUARD (the "all games not mobile friendly MAINLY iOS" fix).** The manifest declares `orientation: portrait` — **Android respects it, iOS Safari IGNORES it**, so on an iPhone a kid rotates to landscape where every game's fixed vertical layout breaks (title + round meter + play area + answer row collide / slide off-screen). Added a `RotateOverlay` in `main.tsx`: the moment the phone is landscape at a phone-sized height (`w>h && h<500`), a full-screen "🔄 ফোনটা সোজা করে ধরো / Turn your phone upright" covers the app; it vanishes on portrait and every scene re-lays out via its existing RESIZE handler. iOS 16.4+ installed PWAs also auto-rotate BACK via `screen.orientation.lock("portrait")` (guarded; older iOS uses the overlay). iPads/desktops (h≥500) are left alone.
- **🧱 Narrow-phone HUD fix.** The in-game HUD carries back + world + skill + round + stars + streak + coins + music — on a 375–390px iPhone it overflowed past the right edge. Root cause: `.hud-world`/`.hud-skill` had `overflow:hidden` but NO `min-width:0`, so as flex items they REFUSED to shrink below their text (the ellipsis never engaged). Added `min-width:0; flex:0 1 auto` to both, plus a `max-width:430px` media query (tightens paddings, hides the redundant streak chip). Now the HUD always fits with the skill/world chips ellipsizing gracefully.
- **📜 Short-phone scroll.** `.screen` now has `overflow-y:auto` — on iPhone SE / small Androids, home/worlds content scrolls instead of clipping at the screen edge.
- **🔇 iOS PWA TTS FIX (the "iOS pwa not TTS" fix).** Two real bugs:
  1. **The speech "prime" spoke only a WHITESPACE utterance (`" "`)**. iOS treats whitespace-only as EMPTY, SKIPS it, and unlocks nothing → the engine stays muted → total silence. Prime now speaks a real short word (`"hi"`, `volume .001` → inaudible) which is guaranteed to synthesize and actually unlock the engine. This is the definitive root cause — the earlier prime never unlocked iOS.
  2. **WebKit cancel→speak race**: a speak() right after cancel() is silently DROPPED. The very first real line (right after prime) now takes the NO-cancel path (skips cancel entirely → plays reliably), and when a line DOES cancel, iOS defers 120ms (not 50ms). `lastSpeechAt` tracks recency so spaced lines skip cancel too.
- **✅ Verified:** `tsc --noEmit` clean; deployed; live bundle `assets/index-CBh5nXpX.js` (1,933,077 B) contains the fingerprints (`new SpeechSynthesisUtterance("hi")`, "Turn your phone upright", `rotate-overlay`, `screen.orientation.lock`); live CSS chunk `index-jMXYbJBS.css` has `rotate-overlay`/`rotate-nudge`/`hud-streak{display:none}`/`min-width:0`. Site 200, /health 200, manifest still `portrait`.
- **👉 On the iPhone:** close the PWA fully + reopen (SW picks up the new build automatically on next open). First tap unlocks speech — questions now read aloud. Rotating the phone now shows the upright prompt instead of broken layouts.

## FIX 8 Aug 2026 (just now) — Count & Pop "complete all rounds then BLANK screen" ✅
- **🐞 THE BUG:** finishing all rounds in Count & Pop (and any skill) went **blank**. The kid completed every round — then the screen flashed the navy game and died to white/blank.
- **🔍 ROOT CAUSE (definitive):** a **React Rules-of-Hooks violation** in `App.tsx`. The done-screen branch — `if (screen === "done" && world && kid) { ... }` — ran a **`useMemo()` for the confetti array INSIDE the conditional return**. That was the **only hook after App's early returns**. So every non-done screen rendered N hooks, the done screen rendered N+1 → React threw **"Rendered more hooks than during the previous render"** → the whole tree unmounted → blank. (DB corroboration: one kid had a 6th count-1-10 event — replay/cascade from the crash. With the crash gone, a clean 5-round session stays 5 events.)
- **✅ FIX:** hoisted the confetti to a **module-level `DONE_CONFETTI` constant** (zero hooks) and removed the `useMemo` import. Done-screen now does `const confetti = DONE_CONFETTI;`. Hook-map audit confirmed no other hook sits after the early returns.
- **✅ Verified:** `tsc --noEmit` clean (kid + core rebuilt); deployed; live bundle `assets/index-C65urYzn.js` (1,931,946 B) shows the confetti as a top-level `const vy=Array.from({length:30},...)` sitting right beside `hl=5,cy=6,Ls=.8,oh=.8` (ROUNDS_TO_FINISH/SESSION_LEN/MASTERY_THRESHOLD/UNLOCK_THRESHOLD) — module scope, NOT a component hook. Site 200, postgres healthy.
- **👉 On the iPhone/any PWA:** the installed PWA picks up the new build automatically via the `controllerchange` reload on next open — no manual step needed.

## STATUS
- **Stage:** P2 — Adaptive MVP 🔨 (6 Aug 2026)
- **Previous:** P1.5 Multi-subject + Kids-Live ✅

## GROWTH 7 Aug 2026 (late night) — 🌱 the Growth Garden + 2 new grow-games + PWA always-updates
- **🌱 THE GROWTH GARDEN (the app now GROWS).** New `game/garden.ts` engine + `GardenScene` + a home tile "🌱 My Garden":
  - **Every correct answer waters the garden.** Plants pass 6 stages (seed → sprout → young → bloom → flower → fruit); 3 correct answers move a plant up a stage; a full fruit plants a wild sprout — 18 correct answers = a whole plant.
  - **Every mastered skill plants a trophy flower** named after that lesson (⭐-marked) — the learning journey literally grows a garden. Detected the instant a skill crosses the mastery bar mid-session.
  - Per-kid state persisted in the zustand store (`garden` slice, partialized like `nova`) — offline-safe, no new sync surface (it's derived from the same rounds that already sync).
  - `GardenScene` shows all plants in pots; the currently-growing one pulses; tap any plant → it springs and says its name/stage (en + bn). Live-updates via store subscription.
- **🆕 TWO NEW GAMES WITH IN-GAME GROWTH (journey now 30 stops, was 28):**
  - **Plant & Count (`game-growcount`, band 1)** — tap seeds into the soil one by one (a real counting search); each seed sprouts in place; the center reward plant GROWS every correct round (🌱→🌿→🪴→🌷). Difficulty = seeds to plant 3→12. New skill `grow-count`.
  - **Fruit Tree (`game-fruittree`, band 2)** — a tree holds `a` apples, a bag adds `b`; tap the total and the bag apples fly onto the tree + the tree swells + a golden ring pulses. The tree GROWS bigger across the 3 rounds of each level. Difficulty = sum 5→25. New skill `fruit-tree-add`.
  - Both wired through core (`GAME_SCENES`), the seed catalog (API re-seeded idempotently → **30 skills in Postgres**, sync verified `{"recorded":1}` for both), the journey, and mastery.
- **🔄 PWA ALWAYS GETS THE NEW UPDATE (the "sync new update" ask).** The real bug: autoUpdate installed a new service worker but an OPEN page ran its old bundle forever → installed PWAs silently kept stale games. Fixed in `main.tsx` — when a **new SW takes control (`controllerchange`)**, the page **reloads to the new build** (guarded: skips first-ever install double-load, `sessionStorage` loop-guard). Plus nginx now sends **`Cache-Control: no-cache` on index.html** (sw.js already no-store), so the update check always sees the newest shell. Result: every open PWA (iPhone home-screen included) jumps to the new version on next open / the moment the background update lands.
- **✅ Verified:** `tsc --noEmit` clean (kid + core rebuilt); deployed; live bundle contains GrowCount/FruitTree/Garden, `nv:sw-swap` guard, `controllerchange`; index.html `no-cache`, sw.js `no-store`; DB has 30 skills; both new skills sync end-to-end.
- **📱 GARDEN iOS SAFE-AREA FIX (reported by user on iPhone):** the GardenScene's title sat under the notch and the plant grid ignored the home indicator. Now title/sub are pushed below `SAT()` (top inset), the grid starts at `132+SAT()`, is bottom-bounded by `84+SAB()`, and **re-flows on every resize** (`layout()` now calls `refresh()`), so rotate/launch always lands inside the safe area. Deployed (bundle `index-BJ7zjSVO.js`, site 200).

## FIX 7 Aug 2026 (deep night) — iOS PWA TTS totally silent → engine never unlocked
- **🔇 ROOT CAUSE of "iOS PWA TTS not working":** iOS Safari (and an installed PWA, strictest of all) requires the **FIRST `speechSynthesis.speak()` to run SYNCHRONOUSLY inside a user gesture**. Every path in our `speak()` deferred the real speak — `waitVoices().then(doSpeak)` (async) and the 50ms `setTimeout` after `cancel()` (the WebKit cancel-race). So on iOS the first real speak was ALWAYS outside the gesture window → the engine never unlocked → **total silence forever**. The doc-click handler only called `resume()`, which does NOT unlock iOS speech.
- **✅ FIX (`game/speech.ts` + `App.tsx`):** new `primeSpeech()` — speaks a **near-silent utterance (`volume .001`, one space) synchronously inside the first gesture**, which unlocks the engine; after that every deferred programmatic speak plays normally. Wired at module load via **capture-phase** `pointerdown/touchstart/click/keydown` listeners (React/Phaser can't swallow them), plus a safety `primeSpeech()` call inside `speak()` and in the App doc-click handler (before the `resume()`).
  - Bonus: the prime's `refreshVoices()` populates iOS voices (iOS fills `getVoices()` only after the first `speak()`), so the right Bangla/English voice is picked for round one instead of after a 900ms timeout.
  - Idempotent one-shot — a few cheap instructions after the first success; zero cost on non-iOS.
- **🧹 Deploy box tidied:** removed the **orphan `cloudflared` container** (leftover quick-tunnel `--url http://web:80` from the old compose) — the box's **systemd named tunnel** (7d5273d2, active) is the only tunnel now. Stack is exactly web/api/postgres.
- **✅ Verified:** `tsc --noEmit` clean; deployed to kids.munna-khan.xyz (HTTP 200, /health ok); the live bundle contains the prime fingerprint (`volume=.001` + capture-phase `["pointerdown","touchstart","click","keydown"]`).
- **👉 On the iPhone:** close the PWA fully, reopen it (service worker cache), then **tap once** — the engine unlocks on that first tap and every round reads aloud from then on. If a Bangla voice still doesn't talk, check Settings → Accessibility → Spoken Content → Voices → Bangla is downloaded (or any voice is present).

## FIX 7 Aug 2026 — broader lessons + a learning JOURNEY + escalating big hints
- **🧩 BROADER LESSONS.** Every skill's difficulty ladder grew from 5 → **6 tiers** in `packages/core/src/skills.ts` (e.g. CountPop 3→12, FruitAdd 5→25, AddSub100 20→150, Division 2→12, Area 6→56; core rebuilt). Guided sessions are now **real practice blocks, not drive-bys**: `ROUNDS_TO_FINISH = 5` (was 3) rounds per skill and `SESSION_LEN = 6` (was 3) skills per world sweep. BKT-lite masters a skill in ~3 clean rounds, so the journey advances a stop per honest session.
- **🛣️ THE LEARNING JOURNEY (new worlds screen).** The flat 5-world card list is now a **linear path map of all 28 lessons**: every playable skill is a stop, in world order, each world region a milestone banner. A stop unlocks only when the one right before it is mastered → one clear path, no age gates, no dead-ends. 🦉 Nova sits on the current stop (pulsing glow + progress bar `m/28`), done stops get a gold ✓, locked ones dim. New segmented toggle `🛣️ Journey / 🗺️ Worlds` keeps the old world cards one tap away. Tapping the glowing stop starts that lesson directly.
- **💡 REPEATED-WRONG BIG HINTS (all 23 game scenes).** New shared engine `game/hints.ts` — every miss is a teaching moment that escalates:
  - **miss #1** → soft "Almost! Try again 💪" (unchanged, warm).
  - **miss #2** → **BIG teal coaching banner** with a game-specific hint (en + bn) AND ~half the wrong answer buttons get **faded out + ✕'d + disabled** so the field shrinks.
  - **miss #3+** → pulsing gold/teal **glow ring around the correct answer** + reveal banner "The answer is — X! Tap it 👇".
  - The miss counter is keyed by the correct value, so it resets naturally when the next round asks a different question.
  - Each scene passes its own coaching line + correct value + answer list (option cards get `setData("val", …)` so wrong options can be eliminated and the right one lit). All 25 wrong-tap paths converted (`wrongTap` → `hintWrong`).
- **✅ Verified:** `tsc --noEmit` + `vite build` clean; PWA precache regenerated (15 entries). App still local-first / no ads / no tracking.

## PWA 7 Aug 2026 (night) — Numberverse is now installable + fully offline
- **📲 PWA enabled** via `vite-plugin-pwa` (generateSW, autoUpdate). `vite build` now emits `manifest.webmanifest`, `sw.js`, workbox runtime. Verified over plain HTTP: manifest 200, `sw.js` 200, index 200, icons 200.
- **Offline-first, no network**: every script/style/icon is precached (15 entries, ~1.9MB) with `navigateFallback: "/index.html"` so the SPA reloads offline. The app is already local-first (zustand → localStorage), so a kid on a Samsung can open it from the home screen with zero connectivity.
- **Installable**: manifest `display: standalone`, `orientation: portrait`, `start_url: "/"`, `theme_color/background_color #0b2545`, `purpose: maskable` icon.
- **🎨 Branded icon set** generated (PIL + Arial Rounded Bold): `icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon` (180), `favicon` — navy→purple gradient, frosted disc with gold/cyan/pink **"123"** pills + gold **+** tag + sparkles. ASCII/pixel-verified.
- **iOS home-screen**: `apple-mobile-web-app-capable`, `black-translucent` status bar, `apple-touch-icon`, `apple-mobile-web-app-title`.
- **Install affordance**: captures `beforeinstallprompt`, shows a "📲 Install app" pill on the home footer (en + bn) that calls `prompt()`; hides on `appinstalled`. Registered via `virtual:pwa-register` + `workbox-window`, `immediate: true`.
- **Dev untouched**: `devOptions.enabled: false` so the SW never interferes with local dev.
- **✅ `tsc --noEmit` + `vite build` clean** (added `workbox-window` dep + `vite-env.d.ts` types). App still local-first / no ads / no tracking.

## FIX 7 Aug 2026 (late night) — questions invisible on bright backgrounds (pizza + word games) + Samsung overflow
- **🎨 ROOT CAUSE of "question not visible": every game's instruction/question used the soft steel-blue `#a7c4e2`, which is nearly invisible on the bright backgrounds.** WCAG contrast was as low as **1.56–1.66 on sky / sunset / desert / floral** (bright blue/orange/pink gradients). Fixed globally:
  - New `promptTxt(size)` in `ui.ts` — **near-white fill + thick dark stroke** (classic game-subtitle outline, ~3px on 18px text), so every "Tap the… / Find the… / How much…" prompt is readable on ANY background. Applied to **all 25 prompts** across 23 scenes.
  - New `outline` option on `txt()` — **dark stroke on all big gold question/answer displays** (the word/letter/fraction the kid reads): size 26/40/46/50/52/56/64/72 gold facts across 13 scenes.
  - **Pizza game**: slice-line color darkened `#8d5a2b → #5c2a0e` (line contrast on shaded slices 1.87 → 3.79, on gold slices 3.46 → 7.01) so the shaded-pizza question is legible on the kitchen-orange bg.
- **📱 SAMSUNG OVERFLOW (questions hidden under home bar):** the full-bleed change meant the canvas now extends under the phone home-indicator/gesture bar. Previously ~23 scenes anchored answer rows at `height−64` and prompts at `height−150` → those landed under the bar. Fixed with a shared `safeArea.ts` (`SAB()` = CSS `--sab` from `env(safe-area-inset-bottom)`): every answer row, prompt, and instruction now lifts by the bottom inset. Also the **HUD was changed from an overlay back to in-flow** so it no longer covers each game's title/round text at the top of the canvas.
  - `answerRow()` (layout.ts) also subtracts `SAB()`, so the 7 scenes that use it are covered too.
- **BnMatras horizontal overflow:** the Bangla-vowel answer row used fixed 124px spacing (6 buttons on a narrow phone → off-screen). Switched to the width-fitting `answerRow()` which shrinks the button radius to always fit, and labels scale with the radius.
- **✅ Verified:** `tsc --noEmit` + `vite build` clean; every prompt now contrast-checked (white glyph + dark stroke on all 11 themes); every bottom-anchored position in all 23 scenes lifts above the home bar. (No headless-Chrome tests this round — machine stability.)

## FIX 6 Aug 2026 (night) — Nova/game screens are now FULL SCREEN (edge-to-edge, notch-aware)
- **🖼️ Phaser canvas is now truly full-bleed.** Before, the Nova + playing screens lived inside `.app`, whose `env(safe-area-inset-top/bottom)` padding insets the canvas — leaving dark body-gradient bars at the top/bottom on phones with a notch or home indicator. Now the game wrapper uses a dedicated `.game-app` class: `position: fixed; inset: 0; height: 100dvh` (tracks browser-chrome collapsing) with `padding: 0`, and `.game-wrap` stretched absolutely. The Phaser scenes draw their own room backdrop / top bar / dock, so they own safe-area spacing. Verified via CDP: canvas rect == viewport exactly (360×780).
- **🔔 Scene reads safe-area insets for its own UI.** `:root` mirrors `--sat/--sab/--sal/--sar` from `env(safe-area-inset-*)`; `NovaScene.readSafeArea()` reads them on every `layout()` and offsets its own chrome: top bar pushed below the notch (`topY = 46 + topInset`), streak strip too, bottom dock + bottom sheets lifted above the home indicator (`H − 14 − 62 − bottomInset`). Simulated notch (sat=47/sab=34): back/wallet → y=93, dock → y=670, shop sheet → y=582. Zero insets on desktop → unchanged.
- **HUD overlay** (during playing) stays clear of the notch: `.game-app .hud` is absolute top overlay with `padding-top: calc(10px + env(safe-area-inset-top))`, `z-index: 1000`.
- **✅ Full e2e still green** — greeting → wallet 🪙20 → feed→15 → scarf buy→🪙15+equipped → cape need-coins → shop page→"Party Hat" → activities 8/5 → slap → rooms garden↔field → Bangla greeting+মাঠ → CountPop 3 rounds→🪙18, **zero console errors**; `tsc --noEmit` + `vite build` clean.

## FIX 6 Aug 2026 (evening) — Nova top-bar overlap + store outfits now actually appear on Nova's body
- **📱 TOP BAR no longer overlaps on narrow phones.** Root cause: at 360px the 250px room pill collided with the back button and wallet chip. The room pill is now a **Graphics-backed responsive chip** (`redrawRoomPill(w)` re-draws the rounded rect whenever the layout recomputes): `pillW = min(250, walletLeft − backRight − 14)` so it shrinks between the fixed anchors, plus a compact 92px wallet chip ("🪙 n/20"). Verified at 360px: back spans 17–63, pill 107–253, wallet 262–354 → **zero overlap, zero overflow**.
- **👕 STORE GOODS NOW APPEAR ON NOVA'S BODY (the reported bug).** Outfits were registered but **never rendered** — and two back items were also *completely occluded* (cape 170px wide vs 300px body, backpack 120px wide — both fully hidden behind the silhouette). Fixes:
  - `outfitNodes` map + `applyOutfit(equipped)` toggles visibility for every owned/equipped outfit, called on every `refresh()`.
  - **Cape** redrawn WIDE (380×300, positioned at body center) with a wavy hem → red flaps now peek ~34px past both body edges + below the body bottom. Pixel-verified: 3.7k red pixels flanking the body + dark-red hem `(180,440)=(163,18,58)`.
  - **Backpack** rebuilt as a bag peeking **above the head** (150×160 at top of head, behind) + two front **shoulder straps** over the belly (18×110 ×2, angled, rendered after the body in the container list). Pixel-verified: bag `(180,120)=(79,165,210)`, strap `(150,320)=(13,154,217)`.
  - Front accessories (hat 🎩, bow 🎀, glasses 🕶️, scarf 🧣, panjabi, boots 🥾) already sit on top; emoji accessories + panjabi/boots verified on-body.
  - ⚠️ Container renders children in **array order** (child `setDepth` does not reorder inside a container) — the straps are placed after the body in the owl's child list, not just given a high depth.
- **✅ Verified end-to-end** (360px + desktop): full Nova e2e green — greeting → wallet 🪙20 → feed→affection 15 → scarf buy→🪙15+equipped → cape need-coins → shop page→"Party Hat" → activities 8/5 → slap reacts → room garden↔field → Bangla greeting+মাঠ → CountPop 3 rounds→🪙18, **zero console errors**; `tsc --noEmit` + `vite build` clean. ASCII pixel-map confirms clean 3-band layout (back · pill · wallet top bar, hero owl, dock).

## REDESIGN 6 Aug 2026 (midday) — Nova "messy/90s" feedback → soft-plush character + clean dark-glass UI
- **🎨 NOVA CHARACTER rebuilt as a soft plush toy (no more 90s clip-art).** Previously the owl read as flat sticker parts (radial-gradient disc + heavy rim + feather scallops + noise grain). Now: one smooth rounded body with gentle cel-ish shading + bottom ambient-occlusion (no outlines, no noise), soft heart face without hard strokes, **huge glossy kawaii eyes** (rich amber iris, one big catchlight — simpler = more modern), tiny smooth beak, soft rounded wing nubs and ear tufts (no feather rows). Bigger head, smaller tucked body, higher hero position. Verified pixel-samples: smooth warm gradient (body-top→low), warm face/beak/wing all cohesive, dark pupil + white catchlight in eye region.
- **🧹 UI decluttered from 76→59 color-clusters; everything into 3 clean bands.** Old screen had ~9 floating elements (back, wallet pill, streak pill, room arrows, affection chunky bar, 2 care cards, big button, daily text, 2-button dock) = noise. New layout:
  - **Top bar** (dark-glass chips): back ‹ (left) · room pill "🌾 Field" with inner ‹ › (center) · wallet chip 🪙 + tiny "today 3/20" sub (right). Thin streak strip "🔥 3-day streak · · ·" centered under the room pill.
  - **Hero** Nova + soft cloud at ~40% height (breathing, blinking, eye-tracking, dozing).
  - **Floating action panel** (bottom-anchored dark-glass bar, rounded 30): big promising **Let's Play!** CTA (glow + shine sweep + coin chip 🪙 today/20 + reward sub-line) with the 4 utility FABs (🛍 Shop · 🍎 Feed · 🎈 Care · 🎉 Fun) in a tidy second row inside the same panel. Thin **affection hairline** (not a chunky bar) sits above it.
- **📱 Phone-fit verified** (430px): floating panel spans 38..460 of 500px width with 14px bottom margin; CTA and FAB rows both fully inside the bar (no clipping, no overlap) at both 713px and 773px heights. Shop & Fun sheets are now **bottom sheets** (slide-up, rounded top corners, handle bar, dim overlay) anchored to the same 14px margin — fit perfectly.
- **All 33 activities / 12 rooms / 3-page store / 5-page activities preserved.** Full e2e re-verified green with zero console errors: kid pick → field room + fireflies → greeting → feed→15 → scarf buy→🪙15 → cape need-coins → shop page 1 "Party Hat" → activities panel (8 cards/5 pages) → slap → room→garden→field → Bangla (নোভা/মাঠ) → play → 3 rounds → 🪙18. `tsc --noEmit` + `vite build` clean.

## FEATURE + POLISH 6 Aug 2026 (morning) — Nova panels, 33 activities, 12 rooms, promising Play button
- **🦉 NOVA UI REORGANIZED into clean panels** — the store is now a proper modal **Outfit Shop** panel (dark navy glass card, ✕ close, full-screen dim, titled header) and a new **Play with Nova** panel holds all 33 activities. Both panels open from a compact **dock** (🛍 Shop · 🎉 Fun) at the bottom of the Nova screen. Page-dot indicators + gold highlight for the active page.
- **◀ ▶ PAGING everywhere** — frosted arrow pager buttons (`nv-pager`) for the shop (8 outfits / 3 per page = **3 pages**), the activities panel (33 / 8 per page = **5 pages**), AND the room switcher bar at the top of the scene (◀ 🌾 Field ▶ with the current room label). Verified: shop page 1 starts with Party Hat, activity page 1 shows 8 fresh cards, room switch re-paints the backdrop + swaps ambient particles.
- **🎮 PROMISING PLAY BUTTON** — big cyan-gradient "🎮 Let's Play!" button with a soft glow + drop shadow, animated **shine sweep** (diagonal light bar yoyo-looping across the button), a gentle breathing scale pulse, and a **coin-earned chip** (🪙 today/20) that pulses when coins change. Sub-line "Win coins · Beat your streak 🔥" reinforces the reward loop.
- **🎬 33 NOVA ACTIVITIES** (`game/activities.ts`) — each with a distinct procedural animation engine in `NovaScene.ts` (per-id `runActivity()` switch): slap (shake + tilt + 💢), laugh (pulse + tilt + 😂), yawn (squint + stretch + wings), sneeze (jerk + 💨), dance / disco (side tilt-pulse + 🎵/🪩), spin / twirl (360°/720° roll), wave / highfive / cheer (wing waves + emoji), jump (hop + shadow), wink / blink (one/both eye squint), grumpy (squint + frown), sad (droop + 😢), scared / shocked / dizzy (eye-wide + shake), excited (hyper-pulse + ⭐), sleepy / snore (drowsy + 💤), whistle / sing (lip-pucker scale + 🎶), heart / glow (glow pulse + 💛/✨), stretch, hide / peek (dip / vanish-reappear), hmm (tilt + 🤔), gobble (gobble-mouth + 😋), zoom (full-screen dash + 💨). Tapping Nova picks a random one. Each has sound (`pop`/`win`/`bad`) + reaction bubble (en + bn).
- **🛏️ 12 ROOM BACKGROUNDS** (`game/rooms.ts`, ≥10 requested) — field 🌾, garden 🌷, bathroom 🛁 (tile wall + mirror + bathtub + bubbles), kitchen 🍳, bedroom 🛏️ (moonlit), living 🛋️, beach 🏖️ (sun + sea + palm), forest 🌲, space 🪐 (planet + nebula), party 🎉 (bunting + balloons), school 🏫 (chalkboard), rooftop 🌃 (city skyline). All procedurally drawn, zero image assets. Rooms carry an `ambient` particle field (fireflies/bubbles/stars/confetti/snow) that respawns on switch. Switching cross-fades (root dips + fades back in, sparkle burst).
- **✅ Verified end-to-end** (headless CDP): Nova active → field room backdrop + fireflies → greeting "Whoo, Aria!" → wallet 🪙20 → feed→affection 15 → scarf buy→🪙15+equipped → cape need-coins → shop paginate→page1 "Party Hat" → activities panel 8 cards/5 pages → slap animates+speaks → room switch→garden→back to field → Bangla greeting+মাঠ label → play→CountPop 3 rounds→🪙18. **Zero console errors.** `tsc --noEmit` + `vite build` clean. Screenshots pixel-verified (owl warm body, cyan play button, navy shop card, white act cards, bathroom tile wall).

## FEATURE + POLISH 6 Aug 2026 (dawn) — Nova companion economy + full-Phaser 2026 Nova home
- **🦉 NOVA — a real virtual pet, FULLY in Phaser** (`game/NovaScene.ts`, zero image assets, procedural canvas textures). The app now lands on Nova **immediately after selecting a kid** (kidpick → Nova, home "Play" → Nova). Nova greets the kid by name, tracks the pointer with her eyes, blinks, tilts her head, twitches her wings, dozes after 16s idle and wakes when tapped.
- **2026-STYLE HIGH-FIDELITY RENDER** (replaces the earlier flat-canvas owl): dimensional feather body (radial volume + key-light rim + belly glow + hem scallops + feather grain), heart-shaped facial disc with feathered fringe + soft cheek blush, big glossy kawaii eyes (amber ring texture, dual catchlights, sky-reflection sclera), glossy beak with specular streak, layered wing rows, gradient tufts, dimensional cloud perch with shadow seat. Scene is a **dreamy "magic" dusk** (deep indigo → violet + twinkling stars + warm glow behind Nova) with **ambient floating dust motes** and a bouncy entrance (Nova floats down + sparkle burst).
- **GLASS UI (no 90s clip-art):** gold glass wallet pill (🪙 coins), glass streak pill (🔥 7-day calendar), glass care buttons (Feed 🍎 / Play 🎈), frosted-tile outfit shop (3 outfits: Cozy Scarf 5🪙, Panjabi 15🪙, Hero Cape 30🪙), soft-gradient glowing Play button, rounded affection bar. Bangla locale fully supported.
- **💰 Coins come from REAL learning, never ads** (privacy moat): +1 per correct round, +3 session bonus (+2 first-of-day), daily cap 20 (anti-grind), care actions +5 affection once/day each, streak via calendar days. Verified E2E: Nova active after kid pick → wallet 🪙20 → scarf buy → 🪙15 + equipped → cape shows need-coins → Bangla greeting → play → 3 completed rounds → 🪙18, zero console errors.
- **🐛 CRITICAL FIX — scene-destroy store-subscription crash.** `game.destroy(true)` kills the renderer but a live zustand subscription could fire `refresh()` on the dead scene → `textures.createCanvas` → `renderer is null` TypeError → this crashed the world-detail "Play" handler mid-flow so `setScreen("playing")` never ran. Fix: Nova now unsubscribes on BOTH `SHUTDOWN` and `DESTROY`, and `refresh()` is guarded (`!this.game || !this.game.renderer`). Verified: world → Play → CountPop boots, active scene list `["Boot","CountPop"]`, no exceptions.
- **🧹 HOME SPLASH decluttered** — removed the messy emoji-rain `.floaties`; clean ambient radial-gradient backdrop (`home-bg`, slow breathe), primary Play + Nova CTA, and secondary actions (switch kid / parent zone / lang / music) tucked into a compact bottom footer (`home-foot`).
- Verified: `tsc --noEmit` clean, `vite build` clean, full headless-CDP e2e green.

## FIX + POLISH 6 Aug 2026 (late night) — 2026-style UI + backgrounds, quiet default, gentle wrongs
- **🪩 2026-STYLE ANIMATED BACKGROUNDS v2 (all 25 scenes)** — replaced the v1 emoji clip-art with a modern zero-asset system in `game/backgrounds.ts`: a single-linear-gradient sky (no banding) + 3 big aurora blobs (soft radial glows that drift + breathe) + 8–32 floating glassy shapes per theme (circle/round/ring/spark in soft tints) + optional twinkling stars. Palette per world theme (ocean, space, forest, candy, sunset, etc.). Depth-0 container sits behind the playfield, re-paints on Scale.RESIZE, full cleanup on SHUTDOWN, theme-swap supported. Verified via headless Chrome: every sampled scene boots with grad=1, blobs=3, shapes 16–32, and blobs/shapes are actively animating (x/y/scale move over time).
- **✨ MODERN 2026 UI for all 25 scenes** — new `game/ui.ts`: soft gradient answer buttons (radial face texture cached per color+radius, 2× retina, top sheen + glass edge ring + drop shadow), rounded Baloo/Nunito typography with soft drop shadow (letterSpacing kept 0 so Bangla complex-script shaping stays intact), word-wrapped labels for long Bangla answers (BgsFacts), press-dip on tap, `setCorrect()` flashes green + pops (BTN_CORRECT), `ringCorrect()` golden ring for color-identity answers (BnColors), `modernCardButton` for word cards (SightWords/BnSentence). Old flat fills, hard outlines and 90s text styles removed everywhere. Verified: 25/25 scenes boot with `nv-face-*`/`nv-card-*` gradient buttons, correct-tap swaps to the green texture (`nv-face-60-4ade80-12a150`), wrong-tap shows the gentle nudge, zero console errors, `tsc --noEmit` + `vite build` clean.
- **🔇 Background music now OFF by default** — `musicMuted` defaults true, persisted to `nv_music` ("0"=on / "1"=off, unset=off). Home shows "🔇 Music off" until the parent/kid taps to enable. Verified: fresh load → muted; toggle → on/off persists.
- **💛 Wrong answers are now a LEARNING MOMENT, not a punishment** — replaced the harsh square-wave buzz + shake everywhere. New `game/feedback.ts` `wrongTap()`: a soft warm two-note "hm…" (sine E4→C4, low volume) + a gentle nudge + a floating bilingual bubble "Almost! Try again 💪" / "প্রায়! আবার চেষ্টা করো 💪" (reads `nv_lang` via new `game/locale.ts`). All 25 scenes swapped to it. Verified: wrong tap keeps the bubble, shows the message, Bangla mode shows Bangla.
- **🐛 Count & Pop overlap at max level** — difficulty `[3,4,5,7,10]` with fixed `min(w,h)/2.6` spacing made 10 bubbles impossible → placement loop gave up and stacked bubbles on top of each other (390px AND 1100px tablets). Now: relaxes spacing until EVERY bubble places (never below diameter+4), with a deterministic grid fallback. Verified min-distance ≥ diameter at 10 bubbles on 390/500/1100px across 6 respawned rounds.
- **Parent panel scroll (from prior request)** — `.screen { min-height: 0 }` so the analytics list scrolls under the pinned child-picker when the 56-row skill list is expanded (was clipped by `body { overflow: hidden }`).

## P2 BUILD SESSION — ALL LEVELS COMPLETE (6 Aug 2026 night)
- [x] **Band 3 River Town (ages 6–8) — 4 games verified end-to-end** via headless Chrome: age-7 kid unlocks River Town, RocketMult round plays, BKT persists `mult-facts-2-5-10 p=0.1 correct=1 streak=1`
- [x] **Band 4 Sky Castle (ages 8–10, class 3–4) — 6 games**: Castle Division, Fraction Match, Place Value Tower, Bangla Matras, Sight Words, Animal Homes
- [x] **Band 5 Star Academy (ages 10–13, class 5–8) — 6 games**: Decimal Duel, Percent Quest, Area Lab, Sentence Builder (Bangla), Noun or Verb?, Bangladesh Facts
- [x] **ALL 5 BANDS PLAYABLE — 25 games total** (was 10). Every band now has a real game per core subject. Verified age-9 → Sky Castle unlocks + DivisionFacts plays + BKT persists; age-11 → Star Academy unlocks + Decimals plays + BKT persists
- [x] **+3 games in pivot**: Bangla Colors (Band 2), Letter Sounds/EnPhonics (Band 2), Add & Subtract 100 (Band 3) — all smoke-tested
- [x] **All 15 new scenes smoke-tested** — each boots with correct interactive targets (3/4 buttons, 2–3 cards)
- [x] DB seeded: skills 5/6/5/6/6 per band (28 total), 25 content_items games
- [x] Subject coverage across product: math ×13, bangla ×4, english ×4, science ×1, bgs ×1 (+ ict next)

### Full game roster (22)
| Game | Band | Subject | Skill |
|------|------|---------|-------|
| Count & Pop | 1 | math | count-1-10 |
| Shape Catcher | 1 | math | shapes |
| Bangla Letters | 1 | bangla | bn-swaroborno |
| English Letters | 1 | english | en-abcs |
| Fruit Addition | 2 | math | add-within-10 (+ sub-within-10 sub-mode) |
| Bangla Colors | 2 | bangla | bn-colors |
| Letter Sounds | 2 | english | en-phonics |
| Bangla Letters | 2 | bangla | bn-benjonborno (consonants mode) |
| Number Bonds | 2 | math | number-bonds-10 |
| Add & Subtract 100 | 3 | math | add-sub-100 |
| Rocket Builder | 3 | math | mult-facts-2-5-10 |
| Pizza Fractions | 3 | math | fractions-intro |
| Bangla Words | 3 | bangla | bn-words |
| Word Pictures | 3 | english | en-cvc |
| Castle Division | 4 | math | division-facts |
| Fraction Match | 4 | math | fractions-equiv |
| Place Value Tower | 4 | math | place-value-1000 |
| Bangla Matras | 4 | bangla | bn-matras |
| Sight Words | 4 | english | en-sightwords |
| Animal Homes | 4 | science | science-animals |
| Decimal Duel | 5 | math | decimals-intro |
| Percent Quest | 5 | math | percent-intro |
| Area Lab | 5 | math | area-perimeter |
| Sentence Builder | 5 | bangla | bn-sentences |
| Noun or Verb? | 5 | english | en-grammar |
| Bangladesh Facts | 5 | bgs | bgs-bangladesh |

## P2 BUILD SESSION (6 Aug 2026 pm)
- [x] **Adaptive engine wired into kid app** — BKT `observe()` + spaced-repetition `decay()` per kid/skill
- [x] **Difficulty adapts to mastery** — each game starts at `nextDifficulty()` level from the kid's BKT state
- [x] **Per-kid progress persists** — zustand persist → `nv_store_v1` in localStorage; survives reload
- [x] **2 new games** → 6 total:
  - `EnLettersScene` (Band 1, English A–F with picture hints) — fills the missing game-enletters
  - `NumberBondsScene` (Band 2, "make 10") — for the 5yo girl
- [x] **Verified headless (Chrome CDP):** add Aria(2021) → Band 2 Cottage Fields → FruitAdd boots 0 errors; CountPop round → BKT records `count-1-10 p=0.1 correct=1 streak=1` persisted
- [x] DB: `game-bnbonds` seeded (6 games total)

### Games roster (6)
| Game | Band | Skill | Scene |
|------|------|-------|-------|
| Count & Pop | 1 | count-1-10 | CountPop |
| Shape Catcher | 1 | shapes | ShapeCatcher |
| Bangla Letters | 1 | bn-swaroborno | BnLetters |
| English Letters | 1 | en-abcs | EnLetters |
| Fruit Addition | 2 | add-within-10 | FruitAdd |
| Number Bonds | 2 | number-bonds-10 | NumberBonds |

## PIVOT (6 Aug 2026) — Numberverse replaces Shikho
- **Hasan's plan:** Numberverse → ALL subjects (not just math), Bangladesh focus 🇧🇩
- **For his kids:** eldest (born 30 Jun 2021, 5y → Band 2) + youngest (born 23 Nov 2023, 2y → Band 1)
- Absorb Shikho's: content model (subjects/classes/chapters), phone auth, bKash/Nagad payments
- Keep Numberverse's: Phaser games, BKT adaptive engine, parent/admin portals, FastAPI+PG16+Redis monorepo

## BUILD SESSION 6 Aug 2026
- [x] **Multi-subject core**: skills now carry `subject` (math|bangla|english|science|bgs|ict), `title_bn`, `nctb_code`, `class_number`
- [x] **subjects table + NCTB seed** (6 subjects with Bangla titles) + `/api/v1/content/subjects` route
- [x] **3 new Phaser games**:
  - `FruitAddScene` (Band 2, add within 10) — for the 5yo
  - `BnLettersScene` (Band 1, Bangla স্বরবর্ণ) — the Bangladesh edge
  - `ShapeCatcherScene` (Band 1, shapes) — for the 2yo
- [x] **Kid picker + age-based world unlock** — birth year → world (5yo gets Cottage Fields, 2yo gets Sprout Grove)
- [x] Verified: core builds, kid typechecks + builds, API boots, `/health` + subjects + skills all 200, DB seeded with Bangla
- [x] Parent app still builds (no breakage)

## CHECKLIST

### P0 — Prototype (✅ done 5 Aug 2026)
- [x] Business plan (BUSINESS_PLAN.md)
- [x] Playable web demo — Count & Pop + Fruit Addition (web/prototype/index.html)
- [x] Verified in Chrome: boots clean, 0 errors, real-input clicks work, rounds advance, stars/adaptive tuning work

### P1 — Scaffold (started 5 Aug 2026) ✅ DONE
- [x] pnpm workspaces monorepo
- [x] Docker Compose: Postgres 16 + Redis, init schema (profiles, kids, skill_mastery, progress_events, subscriptions, content_items, config)
- [x] apps/api (FastAPI): boots, JWT auth, connects to Postgres, health endpoint — **verified end-to-end: progress batch + BKT mastery update (0.9753 > 0.8 threshold)**
- [x] packages/core: skill maps + adaptive engine (BKT-lite)
- [x] apps/kid (React+Vite+Phaser) boots with 1 game ported from prototype — **verified in Chrome: canvas renders, 0 console errors**
- [x] apps/kid **mobile-first UI** — portrait RESIZE canvas, safe-area insets, fat touch targets; verified with touch events on iPhone 390×844 / tablet 820×1180 / landscape 844×390 (done screen after 3 rounds, 0 errors)
- [x] apps/parent (Next.js /parent) shell with auth — **verified: / + /parent render (HTTP 200), login wired to FastAPI**
- [x] apps/admin (react-admin) shell — **verified: login + Kids list loads via FastAPI generic CRUD (Content-Range + range/sort/filter protocol)**
- [x] docs/user-journey.md — complete journey story (discovery → onboarding → play loop → mastery → parent dashboard → retention → monetization)

**P1 verified 5 Aug 2026:** bugs fixed during bring-up — (1) `SkillMastery` new-row defaults (None → BKT TypeError), (2) core `GAMES` field is `difficultyLevels` (not `config.difficultyLevels`), (3) Phaser needs `game.events.once(READY)` before `scene.start` (scene manager boots async), (4) **custom `Circle` hit-area on Containers silently swallows taps in Phaser 3.90 → use `setInteractive({ useHandCursor: true })` (object-config default hit area)**.

**LAN/network access (5 Aug 2026):** all dev servers bind `0.0.0.0`, uvicorn runs `--host 0.0.0.0`, CORS permissive (`allow_credentials=False` + `*` — bearer-token auth, no cookies), API base derives from `window.location.hostname`. Verified on phone path: kid/parent/admin HTTP 200 via `192.168.0.102`, Vite Network banner, CORS preflight 200, **cross-origin login from LAN-loaded page works (200 + token)**.

## DEV URLs (LAN)
- 🎮 Kid: `http://192.168.0.102:5173`
- 👨‍👩‍👧 Parent: `http://192.168.0.102:3000`
- 🛠 Admin: `http://192.168.0.102:5175`
- ⚙️ API: `http://192.168.0.102:8000` (`/health`, `/docs`)

> Phone must be on the same Wi-Fi. First LAN request → macOS firewall may ask "Allow incoming connections" → click **Allow**.

### P2 — MVP (Week 4–9)
- [ ] 5 mini-games in Phaser scenes (Bands 1–2)
- [ ] Adaptive engine wired to Zustand
- [ ] Local save + FastAPI sync
- [ ] Parent dashboard v1 (progress, screen time)
- [ ] Admin console v1 (content + difficulty config)

### P3 — Playtest (Week 10–11)
- [ ] 30 kids playtest, collect feedback
- [ ] Tune difficulty + juice

### P4 — Web Launch (Week 12–13)
- [ ] Deploy all apps
- [ ] Product Hunt + content seeding

### P5 — Mobile (Week 14–17)
- [ ] Capacitor wrap
- [ ] StoreKit / Play Billing
- [ ] COPPA/Kids Category review
- [ ] Store submission

## TODO / BACKLOG

### 🎤 Bangla Voice Audio — RECORD ELDER GIRL'S VOICE (deferred, do later)
- [ ] **Record the elder girl's voice** for the Bangla letter audio (অ আ ই ঈ উ ঊ...) — app speaks with her voice
- [ ] Decide approach later ("we will find it later"): TTS vs recorded clips, which letters, tone
- [ ] Store clips in `apps/kid/public/audio/bn/` (e.g. `a.ogg`, `aa.ogg`, ...)
- [ ] Wire audio into `BnLettersScene` (play the letter sound when shown / tapped)
- [ ] Optionally also record English letter sounds + Numberverse number sounds

### Next in queue (from pivot)
- [x] English phonics game (Letter Sounds, Band 2) — done
- [x] Number Bonds + Subtraction (Band 2) — done (NumberBondsScene + FruitAdd sub-mode)
- [x] Bangla consonant game (Band 2, ব্যঞ্জনবর্ণ) — done (BnLetters consonants-mode)
- [ ] Parent dashboard v1 (see kid progress per skill)
- [ ] Bangla/English real speech (until recording is done, consider Web Speech API or TTS)
- [ ] More Band 1–2 skills for both kids
- [ ] Session recap detail on done screen (per-skill stars earned this visit)

## FEEDBACK LOG (from kids/parents)
| Date | Who | Feedback | Action |
|---|---|---|---|
| — | — | — | — |

## KEY DECISIONS
- **One codebase** → web (instant share) + iOS/Android via Capacitor
- **React + Phaser 3** for kid app; **Next.js** for parent portal; **react-admin** for admin console
- **NO Supabase.** Full backend = **FastAPI** (JWT auth, REST, reports, webhooks) + **PostgreSQL 16 in Docker** (this machine) + **Redis in Docker**; **PostHog self-host** analytics
- **No ads ever** — privacy is the moat + Kids Category requirement
- Launch wedge: Bands 1–2 (ages 2–6), architecture supports all 5 bands

*Update after every build session.*

## FIX 6 Aug 2026 (late) — BG music + kid attractions + real Parent Panel
- **🎵 Background music** — zero-asset chiptune loop (pentatonic melody + soft bass, 107 BPM) via WebAudio scheduler; starts on first Play, mute toggle 🔊/🔇 in game HUD + home. Verified: starts in-game, toggles, no console errors.
- **🧸 Kid attractions** — floating deco emojis on home (🦋🎈⭐🌼🌈🐞☁️🎠), bouncing mascot + glowing title on done screen, music controls. Games already had sparkles/bob/win jingle.
- **👨‍👩‍👧 Parent Panel (NEW screen)** — "Parent Zone" button on home now opens a real panel (was just a note toggle):
  - Per-kid lifetime stats ⭐/🧠/🕹 (new persisted `stats` in store; `recordSession()` bumps sessions at session end)
  - Overall mastery bar + per-world progress bars × 5
  - Expandable per-skill mastery list (✓ Mastered / % / Not started), English + বাংলা
- **Verified headless CDP:** 2 seeded kids → panel shows correct stats ⭐24 🧠180 🕹6, 10 world bars, 56 skill rows; a full 9-round session records `{stars:9, score:28, sessions:1}`; BKT still persists; guided journey still completes.

## FIX 6 Aug 2026 (night) — Language toggle + game back button + overlap pass
- **🌐 Language selection** — home-screen toggle (English / বাংলা), persisted in `nv_lang` (localStorage). All App chrome translated: home, kid picker, worlds, world detail, done screen, HUD round chip, Add-kid form. Verified: toggle → Bangla UI → reload persists.
- **‹ Back button from game** — HUD back button (`hud-back`) exits mid-session to world detail, stops the running scene (back to no-op Boot), destroys the Phaser game. Verified: in-game → back → worlddetail, game fully gone, re-enter works.
- **Overlap pass at phone size (390px)** — found & fixed via headless CDP programmatic bounds-check:
  - **4-answer-button overflow** (NumberBonds, AddSub100, RocketMult, DivisionFacts, PlaceValue, Percent, AreaPerim): fixed `spacing=2R+12` + half-spacing startX spilled past the right edge. New shared `game/layout.ts` → `answerRow()` computes an adaptive radius that ALWAYS fits the canvas width + centers the whole row.
  - **BgsFacts long Bangla answers** overlapped neighbouring buttons — labels now word-wrap inside the button.
  - **FruitAdd sub-mode**: up to 20 fruit crammed into the left half (right half was the minus chip). Now fruit spread across the play area, emoji shrink for crowded groups, and sub caps at 10 (matches "subtract within 10").
  - **PlaceValue** fact text ("In 9,876, the thousands digit is?") ran 829px off-screen → smaller font + word-wrap; title shrunk.
  - **FruitAdd sub / PlaceValue titles** overflowed at 34px → resized.
  - CountPop bubble placement attempts 60→160.
- **Verified:** overlap scan shows 0 issues across all 25 scenes at 390×796 (and max-difficulty spot checks pass); full 3-skill guided session still auto-advances + BKT persists.

## MILESTONE 6 Aug 2026 — Progress-based worlds + guided sessions (DONE, verified E2E)
- **Worlds unlock by mastery, not age.** `worldUnlocked()` = prev band ≥80% mastered (`UNLOCK_THRESHOLD=0.8`). Lock hint now shows the true remaining count from the PREVIOUS world (was showing current-world total — fixed).
- **Guided multi-skill sessions** — each world visit plays up to 3 unmastered skills (`SESSION_LEN=3`), 3 rounds each (`ROUNDS_TO_FINISH=3`), auto-advances scene→scene, then done screen with guidance + next-world unlock state.
- **CRITICAL FIX — Phaser scene boot race.** `game.isBooted` is true before the first scene's instance exists, so `getScene(key)` returned null → `target.scene.start` was silently skipped → the auto-started scene[0] ran with NO data (onRoundDone undefined), so React never learned rounds finished. Fix:
  1. No-op `BootScene` as scene[0] (nothing game-y auto-starts without data).
  2. Start scenes via `game.scene.start(step.scene, {startLevelIndex, mode, onRoundDone})` (SceneManager creates the instance lazily) instead of `target.scene.start`.
- **Verified headless-Chrome CDP:** fresh kid → 3-skill session (Count to 10 → Count to 20 → Recognize shapes) auto-advances, BKT records pMastered 0.85+ → done screen "2 more to master" → worlds show 3/5 mastered + correct lock hint → 2nd session (Bangla vowels + ABCs) → "🏆 Sprout Grove complete — Cottage Fields is unlocked!" → Cottage Fields opens.

## FIX 6 Aug 2026 (pm) — Can't play / kids don't save
- **Root cause:** `crypto.randomUUID()` throws on **non-secure contexts** (phone over LAN `http://192.168.0.102:5173`) → `addKid` failed silently → no kid stored → blocked from play
- **Also:** used browser `window.prompt()` for input — blocked/ugly on mobile
- **Fix:** `genId()` fallback (Date.now + Math.random) + **in-game Add Kid form** (6 avatars, name input, birth-year stepper, disabled Save until valid)
- **Verified:** headless Chrome CDP end-to-end — add Aria(2021) → worlds → Sprout Grove play → canvas renders 756×369; localStorage `nv_kids` persists

## AUDIT 6 Aug 2026 (deep check) — Phantom-difficulty fixes across all 25 scenes
Found scenes that CLAIMED a 6-tier ladder but had answer pools smaller than the max level (levels were duplicates or options ran out), PLUS a latent `indexOf` bug: `nextDifficulty()` returns a VALUE, App maps back with `difficultyLevels.indexOf(target)` — so any duplicate value in a difficulty array made the higher duplicate(s) unreachable by adaptive selection. Fixed all five duplicate arrays + all under-pooled / over-run card grids:

**Core `packages/core/src/skills.ts` (rebuilt dist) — duplicate difficulty arrays → strictly increasing:**
- `game-enphonics` `[3,3,4,4,5,6]` → `[3,4,5,6,7,8]`
- `game-rocketmult` `[2,5,10,10,10,12]` → `[2,5,10,12,16,20]`
- `game-pizzafrac` `[2,3,4,4,6,8]` → `[2,3,4,5,6,8]`
- `game-decimals` `[1,1,2,2,3,4]` → `[1,2,3,4,5,6]`
- `game-bnsentence` `[3,4,4,5,6,7]` → `[3,4,5,6,7,8]`

**Scenes made to actually fill their ladders:**
- **BnLetters** — CRITICAL BUG: `spawnCards` always built options from SWAROBORNO even in consonants mode (only the target was a consonant; distractors were always vowels). Now mode-aware. Both pools expanded (vowels 6→11, consonants 6→12). Grid grew 3×2 → 4-wide for n>6.
- **EnLetters** pool 6→12; **BnWords** 8→10 (ঘোড়া, ছাগল); **Cvc** 8→10 (pig, fox). All got the 4-wide grid tier so n=8/10 no longer overruns the old 6-slot grid.
- **EnPhonics** — single-row layout overflowed phones even at n=4 (4×108px > 390). Converted to the shared adaptive grid (4-wide above 6).
- **SightWords** — pool was fine (12) but grid capped at 6 slots → added 4-wide tier.
- **BnSentence** — added an 8-word sentence; 7–8 words now wrap to a 2-row grid; `modernCardButton` gained a `wrap` param so long Bangla words no longer spill out of narrow cards.
- **PizzaFrac** — FRACTIONS pool 4→15 (added thirds/fifths/sixths/eighths) so fifths/sixths/eighths levels render proper ⅖ ⅚ ⅝ labels instead of plain "2/5" text; fallback synced.
- **RocketMult** — ladder rewritten index-based with `TABLE_SETS` (×2 → ×5 → ×10 → mixed 2/5/10 → mixed 3/4/6 → mixed 7/8/9) so the old `[2,5,10,10,10,12]` 10-10-10 flat spot is real difficulty now.
- **PlaceValue** — places pool grew 4→6 (ten-thousands, hundred-thousands) so digits-6/8/10 levels actually ask about new places instead of capping at thousands.
- **Decimals** — places 1→6; button labels shrink for long decimals (9.999999 stays inside the circle).
- **AnimalHome** (earlier in session) — 3-tier queue (1/2/3 animals) + tiered animal pool; readonly-tuple `sort` bug fixed (`[...HOMES]`).
- Synced every scene's `?? fallback` difficulty array to the core ladder so no fallback is flat/truncated.

**Verified:** `npx tsc --noEmit` clean, `npx vite build` passes, dev-server smoke test serves all edited scenes (200). All core difficulty arrays are now strictly increasing → every level reachable by adaptive selection and gameplay-distinct.

## CI/CD + DEMO 7 Aug 2026 — NumberVerse live on Cloudflare tunnel
- **Ask:** "add a CI/CD to munna@192.168.0.104 for a docker container to use their cloudflare tunnel for demo ready"
- **Iteration:** first pass over-built it (3 Dockerfiles, Next.js parent + admin in compose, GitHub Actions) → remote npm registry timed out (150s+ per request) AND GitHub runners can't reach a private LAN IP anyway. User pushed back: "make a simple sync complex" — **stripped to the essentials**.
- **Simple stack (builds happen ON THE BOX, laptop stays idle):**
  - `infra/deploy/Dockerfile.api` — python3.12-alpine + uv, healthcheck, uvicorn :8000
  - `infra/deploy/Dockerfile.web` — node:22-alpine build (kid PWA, `VITE_API_URL=/api/v1`) → nginx:1.27 serves static + proxies `/api` → api:8000
  - `infra/deploy/nginx.conf` — one origin: `/`→kid SPA fallback (never cache sw.js), `/api/`→FastAPI, `/health`
  - `infra/deploy/docker-compose.prod.yml` — postgres (volume, healthy) + api + web(:8080 LAN) + cloudflared quick tunnel
  - `infra/deploy/scripts/deploy.sh` — rsync (excludes node_modules/.next/.venv/.env*/.git) → `cp -n .env.production.example` → `docker compose up -d --build` → prints tunnel URL
  - `infra/deploy/scripts/get-tunnel-url.sh` — print current URL anytime
- **Gotchas fixed along the way:**
  - pnpm 11.20 needs node ≥ 22 (`ERR_UNKNOWN_BUILTIN_MODULE` on node 20)
  - pnpm 11 renamed `onlyBuiltDependencies` → `allowBuilds:` map (`esbuild: true`) — install was failing on the allow-listed esbuild build script
  - `.npmrc` `fetch-timeout=600000` — box's npm registry was timing out at ~200s
  - cloudflare/cloudflared:latest is distroless (no `/bin/sh`) → replaced the shell conditional with a plain `command: tunnel --no-autoupdate --url http://web:80`
- **LIVE ✅** — tunnel `https://solutions-omissions-uniform-necklace.trycloudflare.com` serves kid PWA (HTTP 200, 1.9MB bundle), `/health` ok, demo login (`demo@numberverse.dev` / `demo1234`) returns a valid JWT. LAN fallback `http://192.168.0.104:8080` also 200.
- **Removed:** `Dockerfile.parent`, `.github/workflows/` (GitHub Actions can't reach a private IP). Parent/admin still build locally for production — they're just not in the demo showroom.
- **Frontend prep (earlier, typecheck-clean):** kid+admin api-base resolution (VITE_API_URL → https same-origin → `http://hostname:8000` LAN), admin `base=/admin/` + vite-env.d.ts, parent `basePath=/parent`.
- **Docs:** `DEMO_README.md` rewritten to the simple stack + creds + manual ops.

## LIVE SYNC + iOS PWA FIX 7 Aug 2026 (kids.munna-khan.xyz)
- **Ask:** "make sure always sync" + "Iphone PWA has bottom white" — for the live app at kids.munna-khan.xyz (box's named tunnel → localhost:8080).
- **Always-sync (apps/kid/src/api.ts + store.ts + App.tsx):**
  - NEW persisted outbox `pending` in the zustand store (survives reloads — offline play is never lost). `addEvent` queues every round.
  - `ensureIdentity()` resolution: (1) existing parent-linked token+kid, else (2) silent device account — signup `kid-<deviceId>@numberverse.dev` (deterministic email + secret in localStorage), auto-create server kids matching local kids, cached `nv_kid_map`.
  - `syncProgress()` drains the outbox in 40-event batches with a lock; success → instant re-drain (continuous while a kid plays), failure → keep queued.
  - `startAutoSync()` on boot: immediate drain + 30s heartbeat + online + visibilitychange → always syncs, never blocks gameplay.
  - Home screen shows a live `sync-pill` (idle/ok/syncing/offline/error) + pending count. i18n en/bn labels.
- **CRITICAL BUG the smoke test caught:** the API's `skills` table was EMPTY (seed never populated it) → every `/progress` POST 500'd with FK violation → sync was completely broken. Fixed by seeding the content catalog in `seed.py` (idempotent): 5 subjects + 28 skills mirroring `@numberverse/core` SKILLS. Verified: POST `/progress` → `{"recorded":3}`, `/kids/{id}/mastery` shows BKT updates (0.1116 etc.).
- **iOS PWA bottom-white fix:** html/body/#root `background-color:#0b2545` (webview overscroll + home-indicator strip paints navy, never browser white); `.game-app` gets the navy gradient + `min-height:-webkit-fill-available`; manifest already `background_color`/`theme_color #0b2545`. NOTE for the user: iOS PWAs cache the old shell — close & reopen (or re-add to home screen) to see it.
- **Verified live:** kids.munna-khan.xyz serves the new bundle (sync strings present), CSS has the dark fills + `.sync-pill`, 28 skills seeded across restarts, full sync flow smoke-tested end-to-end (signup → kid → progress → mastery) and cleaned up.

## COUNT & POP FIX 7 Aug 2026 — wrong bubbles no longer stay crossed
- **Ask:** "Count and Pop when hit wrong answer later it not release, it remain cross"
- **Root cause:** CountPopScene used the shared `hintWrong`, which ALWAYS calls `killOption` — dims the bubble, adds a permanent ✕, disables it. In a SEQUENCING game every bubble is a future correct answer, so the crossed bubble was dead forever (could never be popped when its turn came) and cluttered the board.
- **Fix (hints.ts + CountPopScene.ts):** added `keepOnWrong?: boolean` to `HintCtx`. When true:
  - wrong taps call new `releaseOption()` — a quick scale pulse (1.14 yoyo) + the existing `wrongTap` shake, then the bubble RECOVERS and stays tappable (no dim/✕/disable)
  - miss #2 no longer clears away half the remaining choices (every option is a future answer)
  - miss #3 still glows the actual next number + reveal banner ("Tap X!")
  - All other scenes keep the default retire-on-wrong (correct for pick-one-answer games).
- **Verified:** kid typecheck clean, deployed, new bundle on kids.munna-khan.xyz contains the keepOnWrong path.

## MODERN COLORFUL REDESIGN + KID GESTURES 7 Aug 2026 (kids.munna-khan.xyz)
- **Ask:** "still whole app feel 90s app design make it modern colourful and kids friendly also must each questions, hints speak via tts" → then "add all kinds of gestures which kids will comfortable, use that types of gestures"
- **Why it felt 90s:** fonts (Baloo 2/Nunito) were referenced but NEVER downloaded → every label fell back to the system font; flat navy backgrounds; flat buttons.
- **Fonts:** self-hosted woff2 in `apps/kid/public/fonts/` (Baloo 2 500/700/800 + Nunito 400/700) + @font-face; all offline, no network.
- **CSS modernization (styles.css):** deep purple/violet/teal/gold radial gradient body + drifting aurora blobs; glossy gradient buttons (big-btn/play-btn rainbow-gold) with 3D press-dip + glow pulse; frosted-glass ghost/icon buttons; world-cards get gradient + emoji chip + blur; kid-chip/stars-pill/view-toggle/journey-progress/j-stop/j-node/skill-row/badge/rank-badge/progress-bar all upgraded to gradients + inset glass highlights + soft shadows. `head-title h2` gradient text.
- **TTS audit:** every game scene already speaks its question in startRound(); hints speak at miss #2 (big banner) & miss #3+ (glow + "The answer is X"); miss #1 speaks via wrongTap's "Almost, try again". Verified complete.
- **KID GESTURES (new `apps/kid/src/game/gestures.ts`, auto-wired):**
  1. **SWIPE-TO-ANSWER** — swipe toward the answer you want. Works in EVERY game with zero per-scene wiring: both button factories in ui.ts call `enableSwipeToAnswer(scene)` (idempotent); the swipe layer finds live answer buttons by scanning `scene.children.list` for `nv-btn` containers. Gold swoosh arrow feedback. Safe because Phaser only fires pointerdown for the object under the INITIAL press — a swipe crossing buttons never misfires, and a press that starts ON a button is left as a tap.
  2. **DRAG-TO-POP** (CountPopScene) — sweep your finger across the floating bubbles; the NEXT-EXPECTED bubble bursts (wrong bubbles never punish a sweep, they just don't pop). CountPop opts out of swipe (`nv:noSwipe`) since bubbles float.
  3. **DRAG-TO-DROP** (AnimalHomeScene) — classic toddler drag: grab the animal and drop it on Water/Land/Sky. Registered as `nv:dragObj` so swipe stands down during the drag; animal flies back to its perch on a miss.
- **Verified:** `tsc --noEmit` clean; deployed to the box; new bundle on kids.munna-khan.xyz.

## 🧝 KAYKIT CC0 3D ASSETS IN THE APP — 8 Aug 2026 (kids.munna-khan.xyz)
- **Ask:** "use these assets in our app" (KayKit_Adventurers_2.0_FREE + KayKit_Forest_Nature_Pack_1.0_FREE, both CC0 — free even for commercial, credit optional: Kay Lousberg, kaylousberg.com).
- **The hard part:** the app is a 2D canvas (Phaser), the packs are 3D. No Blender, no Node GL loaders, no CDP chrome. Wrote a **pure-Python software rasterizer** (`/tmp/kaykit_char/render_all.py`) that parses GLB *and* glTF+bin, applies node transforms, samples the UV atlas textures, z-buffers triangles, and emits tight transparent PNGs. ~250 lines, zero deps beyond numpy+PIL.
- **Rendered (quantized 256-color P-mode, tiny for the PWA):**
  - 5 adventurers → `public/avatars/{knight,mage,rogue,barbarian,ranger}.png` (11–14 KB each, ~61 KB total)
  - 3 forest props → `public/assets/forest/{tree,rock,bush}.png` (~8 KB each)
- **Integration #1 — hero kid avatars:** `Asset` in svgs.ts now supports `url` (static PNG, SW-precached). `AVATAR_EMOJI` in Icon.tsx gained knight/mage/rogue/barbarian/ranger → the kid picker (AddKidForm) + every avatar display render the full-body hero sprites; stored value stays a friendly emoji (🛡️🔮🗡️🪓🏹) so the parent portal shows it fine. Parent portal AVATARS array gained the 5 hero emoji so a parent can assign a hero from the dashboard too.
- **Integration #2 — forest garden:** GardenScene now loads tree/rock/bush and frames the garden behind the pots (tree top-left, rock+bush anchoring the floor), repositioned on resize. `gameBackground` root moved to depth −10 so decor/content layer above it in every scene.
- **Safety:** svgAssets `ensureAssets` skips non-SVG assets (PNG sprites aren't SVG-rasterizable); Icon falls back to the emoji if a PNG fails to load; nothing in Phaser scenes uses avatar keys so no emoji-only stub ever renders in-game.
- **Verified:** `tsc --noEmit` clean, audit ✓ clean, deployed to the box; live bundle contains all 8 `/avatars/*.png` + `/assets/forest/*.png` refs, all 8 are served 200, and all 8 are in the SW precache manifest (offline-first intact).

## 🦉 NOVA 2.0 — plush star-owl redesign 8 Aug 2026 (kids.munna-khan.xyz)
- **Ask:** "can we redesign nova character?"
- **The problem worth fixing:** Nova had TWO conflicting designs — the shell mascot (`NOVA` SVG, shown at boot 118px, home, HUD, journey nodes) was a flat teal owl, while the in-game NovaScene owl was a plush cream/amber owl. Same character, two looks.
- **Design — "Nova 2.0, the plush star-owl":** warm cream/amber plush body + big kawaii heart-face, huge triple-catchlight amber eyes, rosy cheeks, tiny beak + tiny smile, rounded wings peeking, little feet nubs, and a **signature**: TEAL-TIPPED ear tufts (a nod to her original teal identity + the app's teal accent) + a tiny **teal chest-star badge** (ties to the mastery/quest ⭐ motif). Two tiny gold sparkles float beside her in the logo render.
- **Shell** (`svgs.ts` NOVA): rewritten to the plush design — same 160×210 viewBox/aspect so the app's sizing never changes.
- **In-game** (NovaScene): `texTuft` gets the teal-tip gradient, `texFace` gets the tiny smile, new `texStarBadge` drawn on the belly (positioned so outfits still cover it — star sits at belly center, panjabi hem just above). All outfit anchors untouched → every costume still fits.
- **Verified:** `tsc --noEmit` clean, audit ✓ clean, rsvg-convert renders the file-as-written SVG to a clean plush-owl silhouette (teal tufts, star, smile confirmed at pixel level). Deployed; live bundle contains all Nova 2.0 markers (#8be9fd tuft, #22d3ee star, smile path, nv-owl-star texture).

## 🦉 NOVA EVERYWHERE — cameo in all lessons + unified owl 8 Aug 2026 (kids.munna-khan.xyz)
- **Ask (follow-up to the Nova 2.0 redesign):** make the generic brown owl match Nova + add a Nova cameo to lesson scenes.
- **The `owl` asset → Nova 2.0's plush star-owl.** One asset, two wins: AnimalHomeScene's "match the animal" answer card (132px) and CountingSongScene's singing Nova (`assetIcon(this,"owl",46)`) BOTH render Nova's new look now — teal-tipped tufts, plush amber body, big kawaii eyes, blush, tiny beak + smile, teal chest star, little wings. Stays a recognizable OWL (kids still match "which animal is this") while being unmistakably Nova.
- **Nova cameo in EVERY lesson scene, zero per-scene changes.** All 34 scenes (33 lessons + garden) call `gameBackground()`; NovaScene draws her full-body so it's the only scene without a cameo. Hooked the cameo into the background lifecycle:
  - `texNovaHead` — Nova 2.0's head drawn straight to a canvas texture (plush amber, teal tufts, eyes, blush, smile), offline-safe, no SVG load.
  - peeks from the **top-right corner**, gentle idle float, and every 11–17s does a **peek-a-boo boop** (rises, wiggles, sinks).
  - **tappable** → bounce + a 3-sparkle burst (no speech — lessons talk). Positioned so it can't cover a garden plant (bottom edge 14px above the grid) or the notch (SAT-aware); depth −5 = behind all game content so it never blocks a button; cleanly destroyed on theme-swap/shutdown with an `isActive()` guard on the boop timer.
- **Verified:** `tsc --noEmit` clean, audit ✓ clean, deployed; live bundle contains the full cameo (head texture, tap sparkle, boop, placement) + the plush owl SVG (teal tufts, star, smile — confirmed at byte level).

## 🦉 REALISTIC NOVA (GREAT HORNED OWL) + JOURNEY-FIRST HOME 8 Aug 2026 ✅ (user: "yes, need realistics nova look")
Nova stops being a teal plush toy and becomes a real great-horned owl — same brown body, cream barred chest, dark-rimmed facial disc, huge amber eyes — everywhere a kid sees her. And the home screen stops being "giant button + static mascot" and becomes the learning path itself.
- **🎨 Realistic NOVA SVG** (svgs.ts) — replaced the plush star-owl with a true great-horned owl: mottled brown body `#7a4e2a→#8a5c33→#a06a3a`, cream scalloped chest with dark barring rows, facial disc (dark `#4f331b`/`#6b4626` rim, cream lobes, feather rays, dark angled brows), huge amber radial irises `#ffe37a→#f4ae3f→#d8871a→#b96b0f` with small pupils + twin catchlights, dark hooked slate beak, brown brow-horn tufts (no more teal), talons. The compact `owl` asset (AnimalHome / CountingSong) got the same realistic treatment.
- **🎮 In-game NovaScene rewritten to match** — all 7 drawn textures are now the owl: `texBody` pear-shaped with flank mottling + clipped chest barring, `texFace` brown head dome + disc + brows, `texEyeWhite` = dark orbital socket (owls have NO white sclera), `texIris` honey radial + limbal ring + large pupil + twin glints, `texBeak` dark hooked, `texWing` folded wing with scalloped feather hem that pokes out beside the body (bigger 190×200), `texTuft` brown horn tufts. The teal chest star badge is gone (realism). Eye-track clamp tightened to ±11/±8 so the amber iris never slips past its socket.
- **🦉 Lesson cameo matches** — `texNovaHead` in backgrounds.ts (every scene's peek-a-boo corner Nova) is now the realistic head: brown dome, brown horn tufts, dark-rimmed cream disc, amber eyes, dark hooked beak. No more blush/smile/white sclera.
- **🛣️ Journey-first home** — the home screen is now a map, not a menu: Nova greets the kid BY NAME with their 🔥 streak + "next up" pill in a hero card; the big PLAY button still starts the recommended stop; below it **"Your path"** shows the hero avatar standing on the glowing current node, ✓ stops behind and ▶/🔒 ahead (tap any unlocked stop to play), plus a world/band progress card and a "Full journey ›" shortcut. Quest chip + worlds/Nova/garden icons + offline chips stay.
- **✅ Verified:** `tsc --noEmit` clean, audit clean, deployed via `infra/deploy/scripts/deploy.sh` (built on the box). Live bundle `assets/index-CseRqVd4.js` contains the realistic palette (`#ffe37a` amber iris ×4, `#f4ae3f`, `#d8871a`, `#b96b0f`, `#4f331b`, `#d9b58a` talons), the new texture keys (`nv-owl-iris`, `nv-owl-tuft`, `nv-owl-face`, `nv-owl-body`, `nv-cameo-head`), and the journey-home DOM (`home-path`, `home-node`, `now-card`, `home-streak`, "Full journey", EN+BN "Your path"/"তোমার পথ"). /health OK.

## 🔁 REVERSE-THINKING SMART MOVES (pain-removal, not decoration) 8 Aug 2026 ✅ (user: "think reversely" → "do your smart move")
Reverse lens — "what makes a kid walk away?" → three real gaps found and fixed on the journey-first home.
- **🎮 Now-card → the PLAY button carries the plan.** The "now playing" card used to navigate to Worlds — a kid tapping the card about their next lesson expected to PLAY it. Fixed honestly: removed the redundant card + the duplicate "next up" pill, and the ONE big button now says **"▶ Play, Zara!"** with a sub-line **"Count to 10 · Numbers Land · 2/5 mastered"**. One action, zero decision, zero duplication.
- **🌙 Quest honesty under a parent cap.** If the parent set a playtime limit and it's already reached, the "Play 0/3 rounds" bar was an unreachable goal → frustration. Now the quest chip flips to a warm rest line: **"🌙 All done for today — great job! Your quest restarts tomorrow."** (bn: "🌙 আজকের খেলা শেষ — দারুণ! কাল আবার মিশন শুরু হবে।"). Never a broken promise, never guilt.
- **🔥 Streak kindness (no stale flames, no silent punishment).** Discovered the store only refreshes `streak` at session-complete — so after a missed day the home badge showed a STALE flame (a silent lie). Now the anchor day is tracked: after a miss, the badge is hidden and Nova greets **"Welcome back, Zara! 💛"** (bn: "ফিরে এসো, জারা! 💛"). The streak quietly restarts on their first session.
- **✅ Verified:** `tsc --noEmit` clean, audit clean, deployed. Live bundle `assets/index-Cxjw5lgA.js` carries `welcomeBack`/`questRest`/`playWith` keys + EN/BN strings ("Welcome back", "Your quest restarts", "ফিরে এসো", "খেলা শেষ"), the two-line button (`play-btn-main`/`play-btn-sub`), and the quest rest class. /health OK.

## 🏆 MASTERY CARD ALBUM 8 Aug 2026 ✅ (user: "what you would like to add if you are a kid" → "yes, please")
Every mastered lesson is now a collectible trading card — mastery becomes a hunt, not a progress bar.
- **🎴 The album screen** (`screen === "cards"`) — opened from a new 🏆 "My Cards" tile on home. Header shows "X of N collected" + the rank chip. One section per world (band emoji → trophy once complete, title, m/n). Each section is a card grid of the world's skills:
  - **Mastered cards** — full-color subject-gradient card (math=blue, bangla=green, english=indigo, science=teal, bgs=red, ict=slate), big subject emoji, localized title (EN/BN), a ⭐ + the kid's name stamp, and a mastered-date ("5 Aug 2026" / "৫ আগস্ট ২০২৬").
  - **Flip to see the proof** — tap a mastered card → 3D flip (`preserve-3d`, backface-hidden) to a back with 🎯 % correct, 🔁 rounds, 🔥 best streak, "Mastered by {name}", and the date. Sound on flip.
  - **Locked cards stay visible** — dimmed, grayscale, 🔒, "Play to collect"/"খেললে পাবে" — the hunt is shown, never hidden.
  - **👑 Golden world-champion card** — when a world is fully mastered, a foil card ("✨ {world} Champion! · All n skills mastered · {kid}") with a moving shine appears at the end of that section; tapping it plays the tada fanfare.
- **🎉 Celebration hook** — the done screen now shows a gold shimmer ribbon "🏆 {world} complete — a golden card is yours!" whenever a session newly masters a skill AND that completes a world.
- **Dates** — the "mastered date" is the skill's `lastPractice` (the closest honest time the store records); Bangla formatting uses Bangla digits + Bangla Gregorian month names (আগস্ট/জানুয়ারি…).
- **✅ Verified:** `tsc --noEmit` clean, audit clean, deployed. Live JS `assets/index-HAXn4yaP.js` carries all album keys + EN/BN strings (`Card Album`/`কার্ড অ্যালবাম`, `Play to collect`/`খেললে পাবে`, `Champion`/`চ্যাম্পিয়ন`, `Mastered by`/`আয়ত্ত করেছে`, Bangla months) and the flip wiring (`flipped`); live CSS `assets/index-DnbvI5EC.css` carries the 3D card classes (`card-inner`, `preserve-3d`, `backface-visibility`) + golden foil (`gold-card`, `gold-shimmer`, `gold-sweep`). /health OK.
