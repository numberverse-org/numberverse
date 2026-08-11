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

