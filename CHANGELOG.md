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

