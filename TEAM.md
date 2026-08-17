# 🦉 Numberverse Oracle Team — 7 Layers · 105 People

> **Operating model:** a 105-role continuous team that keeps NumberVerse *easily operable*
> and *best for kids*. Most roles are ⚙️ **automated** (run daily by `scripts/team/oracle_team.py`
> on the Mac, reported into the mem API on `:8765`). The rest are 👤 **guided duties** the
> human + AI pick up during each session. Every role names WHO owns it, WHAT they do, and
> HOW it keeps running — so nothing about the product is ever "unowned."
>
> **7 layers × 15 people = 105.** Layers 1–5 run the product forward; **Layer 6 ⚖️ Adjudicator**
> rules when layers disagree (no deadlock, every ruling is precedent); **Layer 7 👁️ Visual
> Inspection & UI** is the eyes on every pixel — the **UI team for visual inspection**.
>
> Run the team: `python3 scripts/team/oracle_team.py` (single standup) · launchd `com.tresha.oracle-team` runs it daily.

---

## Layer 1 — 🧠 Oracle Council (strategy · safety · kid-excellence)
*The "wise layer." Defines what "best for kids" means and guards it against every change.*

| # | Role | Mission (continuous duty) | How it runs |
|---|---|---|---|
| 1 | Chief Vision Architect | Every feature must serve "fun learning, offline, no ads" | 👤 roadmap in TRACKER; v-stamped every deploy |
| 2 | Kid Psychology Advisor | Joy-first: reward loops, streaks with kindness (no guilt) | 👤 review of quest/pet/streak designs |
| 3 | Curriculum Oracle (NCTB) | Every skill maps to a real Bangladesh class + NCTB code | ⚙️ check: skills have `nctbCode` + `classNumber` 1..12 |
| 4 | Child-Safety Guardian | Zero scary/violent/adult content in any lesson text | ⚙️ scan skill titles + scene strings for a blocklist |
| 5 | Privacy Steward | Data stays on-device; no third-party trackers ever | ⚙️ scan `apps/kid/src` for outbound calls + ad SDKs |
| 6 | Accessibility Advocate | Big tap targets, readable text, no fine-motor traps | ⚙️ check viewport/tap metrics + readable font sizes |
| 7 | Playfulness Lead | The app must feel like a game, not homework | 👤 every scene review passes the "is it fun?" bar |
| 8 | Pedagogy Lead | BKT adaptive engine gives each kid the right difficulty | ⚙️ adaptive.ts present + store uses observe/decay |
| 9 | Bangla Language Advisor | Authentic Bangla everywhere (not machine-flavored) | ⚙️ count skills with `titleBn`; audit EN↔BN parity |
| 10 | Age-Appropriateness Editor | Each world's content fits its age band (2–13) | ⚙️ every skill band ∈ 1..5; every band has ageRange |
| 11 | Ethics Reviewer | Honest marketing: no fake ratings, no dark patterns | 👤 OG/JSON-LD "price 0", no fabricated stars |
| 12 | Experience Metrics Oracle | Defines "great": 1-tap play, no dead-ends, instant load | 👤 home = ONE action; journey never strands a kid |
| 13 | Innovation Scout | New game/scene ideas that keep kids coming back | 👤 idea log in TRACKER backlog |
| 14 | Offline-First Advocate | Works on a phone with zero internet, forever | ⚙️ PWA precache + no-store/cleanup checks |
| 15 | Voice & Audio Oracle | Neural Bangla voice feels warm and clear | 👤 piper voice quality pass (on-device) |

## Layer 2 — 🛠️ Engineering Crew (build)
*Turns the Council's vision into shippable code, safely and repeatedly.*

| # | Role | Mission (continuous duty) | How it runs |
|---|---|---|---|
| 1 | Adaptive Engine Engineer | BKT difficulty per kid/skill stays correct | 👤 `packages/core/src/adaptive.ts` + `store.ts` |
| 2 | Scene Developer | 35+ Phaser scenes remain playable + crisp | ⚙️ scene↔game↔skill catalog audit |
| 3 | PWA Engineer | Offline install: precache, sw, no stale caches | ⚙️ sw.js flags + precache size budget |
| 4 | Voice Pipeline Engineer | piper/onnx runtime keeps synthesizing offline | 👤 voice worker glue test (proven) |
| 5 | Store/State Engineer | Zustand local-first state never corrupts saves | 👤 progress schema + migrations |
| 6 | i18n Engineer | Every string exists in EN + BN (no raw-key leaks) | ⚙️ i18n completeness audit |
| 7 | Shell/UX Engineer | Screens/layouts stay uncluttered on small phones | 👤 UI review (parent panel, done screen, home) |
| 8 | Card/Share Engineer | PNG share cards + certs render on any canvas | ⚙️ shareImage.ts present + exports intact |
| 9 | API Engineer | FastAPI progress sync stays honest + lightweight | 👤 `apps/api` + seed.py parity |
| 10 | Parent Portal Engineer | Parents see clear progress, no confusion | 👤 parent panel usability |
| 11 | Admin Engineer | Admin console reflects real data | 👤 admin screens |
| 12 | Core Package Engineer | `@numberverse/core` stays the single source of truth | ⚙️ BANDS/SKILLS shape checks |
| 13 | SVG/Asset Engineer | Vector art loads crisp, never falls back to emoji | 👤 svgAssets bridge + Icon fallback |
| 14 | Deployment Engineer | One command ships it; nothing heavy runs on the 8GB Mac | ⚙️ deploy.sh exists + live domain reachable |
| 15 | Performance Engineer | Bundle under budget; precache lean; voice excluded | ⚙️ bundle size + precache entry budget |

## Layer 3 — 🛡️ Quality & Trust (verify)
*Independent checkers — nothing ships until they pass. "Kids don't debug."*

| # | Role | Mission (continuous duty) | How it runs |
|---|---|---|---|
| 1 | QA Lead | Full integrity audit green every day | ⚙️ `audit.mjs` (i18n, catalog, seed, headers) |
| 2 | Type-Safety Officer | Zero TypeScript errors | ⚙️ `tsc --noEmit` |
| 3 | Runtime Smoke Tester | A fresh build actually serves | ⚙️ dist freshness + health checks |
| 4 | Offline Verifier | Loads with network disabled | ⚙️ precache completeness + no remote deps |
| 5 | Voice Quality Tester | Bangla synthesis passes a real utterance | 👤 on-device voice test on a phone |
| 6 | Accessibility Checker | Tap targets ≥ 44px; readable contrast | ⚙️ CSS tap-size + font-size checks |
| 7 | Child-Safety Auditor | Re-scan of all text for inappropriate words | ⚙️ duplicate of role L1-4 (second pair of eyes) |
| 8 | Privacy Auditor | No third-party trackers; only same-origin sync | ⚙️ outbound-call scan (allowlist = own API) |
| 9 | Performance Auditor | Load stays snappy on budget Android | ⚙️ bundle + precache budgets |
| 10 | Regression Guard | Old mastered scenarios still work after each change | 👤 manual smoke of a mastered skill |
| 11 | Progress/Cert Verifier | Mastery math + certificate correctness | ⚙️ MASTERY/UNLOCK thresholds present + consistent |
| 12 | Share-Card QA | Share PNG renders, no layout collisions | 👤 visual pass on a phone |
| 13 | Cross-Device Tester | 320px small phone → large tablet all fine | 👤 viewport + layout pass |
| 14 | Security Auditor | File-hash sentinel + alert log intact | ⚙️ `data/security/` present + non-empty |
| 15 | Release Verifier | Live bundle carries the right version stamp | ⚙️ live bundle grep for APP_BUILD |

## Layer 4 — 🎨 Content & Experience (enrich)
*The stuff kids actually see and love — curriculum, art, voices, rewards.*

| # | Role | Mission (continuous duty) | How it runs |
|---|---|---|---|
| 1 | Math Content Curator | 43 skills stay curriculum-aligned + engaging | 👤 SKILLS review in `packages/core/src/skills.ts` |
| 2 | Bangla Content Curator | Every math skill has a Bangla title + description | ⚙️ `titleBn` coverage ≥ 95% |
| 3 | English Content Curator | Phonics/CVC/ABC levels stay correct | 👤 skills review |
| 4 | Science/BGS Content Curator | Heavy/light + flag content appropriate | 👤 skills review |
| 5 | ICT Content Curator | Digital literacy future skills | 👤 backlog |
| 6 | Game Designer | New scenes stay varied + age-tuned | 👤 scene pipeline |
| 7 | Difficulty Tuner | Adaptive difficulty ramp feels just right | 👤 playtest per band |
| 8 | Feedback Writer | Cheers/coaching lines stay warm + specific | ⚙️ `celebrate.ts` + feedback present |
| 9 | SVG Illustrator | World/subject/animal art stays adorable | 👤 svgAssets polish |
| 10 | Background Artist | 12 procedural rooms stay lively | 👤 rooms.ts review |
| 11 | Character Lead | Nova feels like a friend, not a robot | 👤 Nova scene + funny-voice pass |
| 12 | Reward Designer | Coins, cards, pet, certs feel earned | ⚙️ reward constants present |
| 13 | Storyteller | Journey narrative has a beginning, middle, end | 👤 journey/worlds narrative review |
| 14 | Seasonal Decorator | Real-season path decor (snow/flowers/fireflies/leaves) | ⚙️ `currentSeason` + season CSS present |
| 15 | Voice Script Writer | Spoken lines are short, clear, encouraging | 👤 neural-voice script pass |

## Layer 5 — 🚀 Growth & Parent Care (operate)
*Keeps it alive in the real world — parents, sharing, releases, memory.*

| # | Role | Mission (continuous duty) | How it runs |
|---|---|---|---|
| 1 | Parent Liaison | Parents understand progress at a glance | 👤 parent panel + voice config review |
| 2 | Share-Loop Engineer | Progress/cert PNGs post cleanly to WhatsApp | ⚙️ captions carry `kids.munna-khan.xyz` |
| 3 | Social Content Writer | Promo statuses are honest + parent-first | 👤 clipboard copy, pet-project framing |
| 4 | Onboarding Guide | First-run: add a kid → straight into PLAY | 👤 add-kid flow pass |
| 5 | Playtime Guardian | Parent caps honored; rest messages never guilt | 👤 playLimit path review |
| 6 | Streak/Retention Designer | Daily quest + pet keep it a habit, kindly | ⚙️ quest/pet constants + kindness flags |
| 7 | Feedback Channel Monitor | Inbox from parents reviewed | 👤 tg_inbox / feedback review |
| 8 | Bug Triage Lead | Session bugs get root-caused + fixed | 👤 bug log + TRACKER |
| 9 | Release Manager | Version stamp bumped every deploy | ⚙️ APP_BUILD v# present + TRACKER dated |
| 10 | Deployment Runner | `deploy.sh` keeps the live domain current | ⚙️ live `kids.munna-khan.xyz` reachable |
| 11 | Monitoring Watch | Daemons/tunnel healthy (mem API, periodic_learn, cloudflared) | ⚙️ :8765 up + periodic-learn job active |
| 12 | Memory Curator | Everything learned persists to the mem API | ⚙️ standup report written to `oracle_team` |
| 13 | Documentation Keeper | TRACKER/BUSINESS_PLAN/DEMO stay current | 👤 docs pass |
| 14 | Analytics (privacy-safe) | Progress stats stay on-device; no ad networks | ⚙️ no-analytics scan |
| 15 | Community Growth Scout | BD parent groups + kindergarten pilots | 👤 Phase-2 seeding plan |

## Layer 6 — ⚖️ Adjudicator (arbitrate)
*Independent referees. When layers disagree — eng says ship, trust says hold — the Adjudicator rules. No deadlock, every ruling is precedent.*

| # | Role | Mission (continuous duty) | How it runs |
|---|---|---|---|
| 1 | Chief Adjudicator | Final call on any layer conflict; a ruling can't be re-litigated this cycle | 👤 weekly council + escalated flags |
| 2 | Release Gate Judge | Ships or blocks the deploy based on the day's ✖ count | ⚙️ `l6_deploy_gate`: SHIP-OK vs DEPLOY BLOCKED |
| 3 | Kid-Bar Referee | Independently re-checks safety + privacy before anything ships | ⚙️ `l6_kid_bar`: re-verify the two guards |
| 4 | Scope Guardian | Refuses unowned work — every file belongs to a layer | ⚙️ `l6_scope`: zero untracked files |
| 5 | Priority Arbitrator | Multiple ✖ → rules which is fixed first (kid-impact, not noise) | 👤 weekly council priority queue |
| 6 | Chronic-Issue Examiner | A role red for 3+ days → escalates to a human | ⚙️ `l6_chronics`: 7-day history scan |
| 7 | Precedent Recorder | Every ruling saved to the mem API for consistent future rulings | ⚙️ `l6_precedent`: ruling trail in `adjudicator` |
| 8 | Blocker Classifier | Rules each ✖ a real blocker vs a false-positive to dismiss | 👤 reviewed at council |
| 9 | Policy Interpreter | Applies "offline, no ads, fun-first" to edge cases layers argue over | 👤 council rulings |
| 10 | Deadlock Breaker | No standup ever ends unresolved — every check gets a verdict | ⚙️ `l6_no_deadlock`: run completes clean |
| 11 | Consistency Referee | Same issue, same ruling; never contradicts earlier precedent | 👤 council cross-check |
| 12 | Escalation Router | Disputes above a layer's authority come here first | 👤 paging + council |
| 13 | Verdict Tracker | Rulings are dated + attributed — the trail is auditable | ⚙️ `adjudicator` mem keys carry dates |
| 14 | Risk Balancer | Weighs "ship the fix now" vs "wait for full verification" honestly | 👤 council |
| 15 | Standing Referee | A ruling on any flag exists within one standup — nothing waits | ⚙️ gate + kid-bar rule same day |

## Layer 7 — 👁️ Visual Inspection & UI (see)
*The UI team for visual inspection. Eyes on every pixel — catches what code-review can't: a broken render, a tofu glyph, a palette that stops being kid-friendly.*

| # | Role | Mission (continuous duty) | How it runs |
|---|---|---|---|
| 1 | Visual QA Lead | Every screen matches its reference look in `docs/VISUAL_BASELINE.md` | ⚙️ `l7_baseline`: baseline doc fresh |
| 2 | Palette Inspector | Every world wears its land colors; no off-theme one-offs | ⚙️ `l7_palette`: 5 lands × 5 fields |
| 3 | Contrast Auditor | Text stays readable on every land gradient | ⚙️ `l7_contrast`: c1↔c3 ≥ 3.0:1 |
| 4 | Glyph Watch | Bangla + English render; no tofu boxes, no missing glyphs | ⚙️ `l7_tofu`: zero replacement chars |
| 5 | Asset Librarian | Every referenced asset exists — nothing 404s in `public/` | ⚙️ `l7_assets`: icons + og-card + url assets resolve |
| 6 | Emoji-Fallback Sentinel | Every vector asset carries an emoji fallback | ⚙️ `l7_svg_wellformed`: emoji ≥ svg+url |
| 7 | SVG Craftsman | Vector art is well-formed (viewBox, valid markup) | ⚙️ `l7_svg_wellformed`: wrapper + Nova viewBoxes |
| 8 | Theme Consistency Judge | Cards/islands/journey share one art language per land | ⚙️ `l7_theme_wiring`: land vars wired in CSS |
| 9 | Small-Screen Inspector | 320px phones: no overflow, no cut-off | 👤 visual pass on a phone |
| 10 | Nova Consistency Guardian | Nova looks like Nova in shell, scenes, cameo, cards | 👤 scene pass |
| 11 | Font Inspector | Fonts load offline; no layout shift when they fail | 👤 offline pass |
| 12 | Share-Card Visual Reviewer | OG/cert/progress cards render clean at 1200×630 + WhatsApp | 👤 share pass |
| 13 | Animation Smoothness Checker | No jank in scene transitions or CSS motion | 👤 playtest |
| 14 | Visual Regression Recorder | Baseline vs current compared; visual changes are intentional | 👤 compare against baseline doc |
| 15 | Landscape & Large-Screen Guard | Rotated / TV layouts don't break | 👤 rotate + TV pass |

---

## ⚙️ The daily standup (`scripts/team/oracle_team.py`)
Every 24h (launchd `com.tresha.oracle-team`) the runner:
1. Executes the **~37 automated checks** (the runner prints the live count) mapped to the ⚙️ roles above (safety scan, privacy
   scan, curriculum shape, i18n, tsc, audit, bundle/precache budgets, live domain, memory,
   **adjudicator rulings**, and **visual/asset/contrast integrity**).
2. Prints a **status board** — per layer, pass ⚠️ warn ✖ fail, with the owning role.
3. **Learns the report** into the mem API (`oracle_team/standup_YYYY-MM-DD`, importance 4) so
   the next session knows the team's health — nothing is lost to compaction.

Any ✖ means a real person (Hasan) is paged via the board; ⚠️ means "review soon." The
**⚖️ Adjudicator** independently re-checks the kid-bar and can block a release; the
**👁️ Visual team** catches rendering/asset/contrast issues a compiler never sees.

---

**105 people, 7 layers, one child-first mission: math & Bangla, offline, no ads, forever.**
