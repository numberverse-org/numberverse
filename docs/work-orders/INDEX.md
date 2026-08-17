# 🗂️ Work Orders — Index & Status

> Companion to `docs/work-orders/*.md` — every order in the folder, with its title and a **status**:
>
> - **done** — shipped / closed (acceptance met)
> - **open** — not yet shipped (in progress, or waiting on a device)
> - **superseded** — replaced by a later order; keep for history, do not action
>
> Statuses are read from each file's `**Status:**` header. Gaps in the numbering mean no order
> file exists (issue closed directly, or never filed).
>
> Non-numeric loose files (`backlog-hygiene`, `blue-screen-0.27.1`) are listed at the end.

## The header convention (mark an order complete)

Every order carries a `**Status:**` line **on the first line under its title**. Set it to one of:

```
**Status:** done        # shipped / closed (acceptance met)
**Status:** open        # in progress, or waiting on a device
**Status:** superseded  # replaced by a later order (add a '> Superseded by: …' note)
```

This INDEX is derived from those headers, so updating one keeps the index honest —
there is no separate registry to maintain. Most historical orders already follow the
convention; the few that predate it default to **done** (their work is shipped).

## The index (234 orders)

| # | Title | Status |
|---|---|---|
| 3 | Taka Tap v2: give-change mode + ৳5/৳20 notes | done |
| 4 | Parent: weekly streak + playtime vs cap | done |
| 6 | Playtime caps per weekday + gentle in-app enforcement | open |
| 7 | Parent debug card (local-only diagnostics) | done |
| 8 | Weekly share card: coins + minutes breakdown | done |
| 9 | Multi-device profile sync via optional parent account | done |
| 11 | Count to 100 + place value (tens/ones) | done |
| 18 | Parent: in-app Help card (iOS install + voice download guide) | done |
| 19 | Garden/pet expansion: feed + grow, new species | done |
| 20 | New lands: Jungle + Polar themes | done |
| 22 | Sibling co-op on one device | done |
| 26 | Game doesn't speak until 'Listen' button is tapped first | done |
| 28 | feat: faster first-run neural TTS — boot-time preload + parallel fetch + int4 model (~10s ready) | done |
| 29 | tech: int4 model cut needs an ORT upgrade (blocked on onnxruntime 1.17 — see #28) | done |
| 31 | feat: per-line neural WAV cache (IndexedDB LRU) + idle pre-synth of common phrases | done |
| 36 | Wrong-answer ledger + resolve-to-complete | done |
| 40 | Bangla: three-digit numbers 100–1000 (place value to hundreds) | done |
| 60 | Math: place value to 9999 | done |
| 68 | Science: living vs non-living sort | done |
| 69 | Science: plants — parts & needs | done |
| 71 | Science: five senses | done |
| 72 | Science: food sources — plant or animal | done |
| 73 | Science: materials — wood, metal, plastic, glass | done |
| 74 | ICT: computer parts & safe offline habits | done |
| 77 | Values: good habits & hygiene | done |
| 78 | Parent panel: per-day wrong-answer history per kid | open |
| 79 | Parent: mastery timeline | done |
| 85 | Parent: offline sync indicator + manual sync | done |
| 86 | Parent: PIN lock to enter parent area | open |
| 89 | Parent: see exact questions each kid missed | done |
| 90 | Privacy: data-minimization audit | done |
| 91 | Safety: automated content scan as a CI gate | done |
| 92 | No-ads: CI scan that no ad/tracker SDK ever lands | done |
| 93 | Kid-safe share images: strip kid name/photo metadata | done |
| 94 | Encrypted sync payloads (design decision) | done |
| 114 | Offline: verify full offline on fresh install | done |
| 117 | Cold start < 2s on mid-range Android | open |
| 120 | CI: run oracle_team as a PR gate job | done |
| 121 | CI: post-deploy smoke test (stamp + tokens) | done |
| 122 | Postgres backup schedule to box disk | done |
| 123 | Uptime monitor → Telegram alert | done |
| 124 | Structured error logging (no analytics) | done |
| 125 | Auto-rollback if post-deploy check fails | done |
| 126 | Guardrail: CI secrets hygiene scan | done |
| 128 | TLS cert rotation check automation | done |
| 129 | RELEASING.md update: mastery-gate + oracle gate notes | done |
| 130 | AR numbers camera experiment (tech spike) | done |
| 131 | Multi-language scaffold (Arabic/Hindi) — research | done |
| 132 | Printable worksheet generator (offline PDF) | done |
| 133 | Screen-reader deep support (VoiceOver/TalkBack) | done |
| 134 | Per-land ambient music + SFX pack | done |
| 135 | Optional parent phone notifications bridge (spike) | done |
| 136 | Big-screen / classroom projector mode | done |
| 137 | Seasonal events decor (Eid, Pohela Boishakh…) | done |
| 138 | Kid dictation: record own voice + replay (on-device only) | done |
| 139 | Physical flashcards QR → mini game tie-in | done |
| 158 | Bangla: consonant conjunct speed drill | done |
| 159 | Bangla: two-letter sight word wall (দেখে বলো) | done |
| 160 | Bangla: sentence builder (বাক্য সাজাই) | done |
| 161 | Bangla: short-paragraph comprehension (ছোট গল্প) | done |
| 162 | Bangla: NCTB rhymes tap-along (ছড়ার গান) | done |
| 163 | Bangla: antonyms & synonyms pairs (বিপরীত / সমার্থক) | done |
| 164 | Bangla: punctuation placement (যতি চিহ্ন) | done |
| 165 | Bangla compound building (যোগে যোগে শব্দ) | done |
| 166 | Bangla letter vs sound discrimination (অ-আ-ক-খ) | done |
| 167 | Bangla matra matrix challenge (মাত্রা মিশ্রণ) | done |
| 168 | Bangla graded read-a-story (গল্প পড়ি) | done |
| 169 | Bangla numbers 1-100 word↔digit (সংখ্যা শব্দ) | done |
| 170 | Bangla coin values (টাকার চেনা) | done |
| 171 | Bangla time words ordering (কাল-আজ-আগামীকাল) | done |
| 172 | Bangla direction words (উপরে-নিচে-ডানে-বামে) | done |
| 173 | Bangla polite words social game (শিষ্টাচার) | done |
| 174 | Bangla riddle time (ধাঁধা) | done |
| 175 | English R-controlled vowels (ar er ir or ur) | done |
| 176 | English silent-e magic (make-a-word) | done |
| 177 | English sight words level 3 (3rd 100) | done |
| 178 | English contractions (I'm, don't, can't) | done |
| 179 | English comparatives & superlatives (big-bigger-biggest) | done |
| 180 | English prepositions (in, on, under, behind) | done |
| 181 | English question words (who what where when why) | done |
| 182 | English story sequencing (first then last) | done |
| 183 | English compound words (rain+bow=rainbow) | done |
| 184 | English read-aloud comprehension lvl 2 | done |
| 185 | English alphabetical order race | done |
| 186 | English word families (-at -an -ig -op) | done |
| 187 | English yes/no listening comprehension | done |
| 188 | Math: addition facts to 20 fluency | done |
| 189 | Math: subtraction facts to 20 fluency | done |
| 190 | Math: doubles & near-doubles | done |
| 191 | Math: making ten strategy | done |
| 192 | Math: 2-digit addition with regrouping (visual) | done |
| 193 | Math: 2-digit subtraction with borrowing (visual) | done |
| 194 | Math: multiplication arrays (visual times tables) | done |
| 195 | Math: division as sharing lvl 2 | done |
| 196 | Math: fractions — parts of a set | done |
| 197 | Math: mixed numbers & improper fractions intro | done |
| 198 | Math: decimals — tenths place value | done |
| 199 | Math: making change with ৳ notes | done |
| 200 | Math: elapsed time (how long until…) | done |
| 201 | Math: perimeter intro (measure the fence) | done |
| 202 | Math: 2D → 3D shape pairing (flat faces & solids) | done |
| 203 | Math: symmetry mirror game (complete the mirror half) | done |
| 204 | Science: animals — features & movement (sort by fly/swim/crawl/walk) | done |
| 205 | Science: plant life cycle (seed→sprout→plant→flower→fruit) | done |
| 206 | Science: weather & seasons sorting | done |
| 207 | Science: light & shadows (predict where the shadow falls) | done |
| 208 | Science: magnets — attract/repel (predict, then try it) | done |
| 209 | Science: water cycle for kids | done |
| 210 | ICT: keyboard explorer (letters & numbers) | done |
| 211 | ICT: device manners — on/off & wait | done |
| 212 | Social: professions & their tools | done |
| 213 | Social: our festivals — customs sort | done |
| 214 | Values: kindness & sharing scenarios | done |
| 215 | Values: honesty — the truth game | done |
| 216 | Bangla: ordinal words (প্রথম-দ্বিতীয়-তৃতীয়) | done |
| 217 | Bangla: simple idioms for kids | done |
| 218 | Bangla: verb-form gender agreement | done |
| 219 | Bangla: classifiers & postpositions (গুলো/টাকে) | done |
| 220 | English: digraph review challenge (sh ch th wh ph) | done |
| 221 | English: synonyms & antonyms pairs | done |
| 222 | English: irregular plurals | done |
| 223 | English: irregular past tense | done |
| 224 | English: long-vowel teams review | done |
| 225 | Math: skip-counting by 3s & 4s | done |
| 226 | Odd & Even sort game | done |
| 227 | Number bonds to 10 & 20 | done |
| 229 | Rounding to nearest 10/100 with number-line jumps | done |
| 230 | Bar chart reading | done |
| 231 | Sink or float predict | done |
| 232 | Animal food chains | done |
| 233 | Science: day & night — earth rotation | done |
| 234 | ICT: tap/drag accuracy trainer | done |
| 235 | Social: village & city life sort | done |
| 236 | Values: patience & waiting game | done |
| 237 | Parent: per-kid reading & story progress view | done |
| 238 | Parent: weekly learning narrative from Kotha | done |
| 239 | Parent: struggle-alert card (skill needs help) | done |
| 240 | Parent: compare two kids side-by-side | done |
| 243 | Parent: per-kid sound & music balance | done |
| 244 | Parent: daily play summary | done |
| 245 | Parent: share-card deep link per kid | done |
| 246 | Parent: multi-kid onboarding flow | done |
| 247 | Parent: PIN recovery flow (security Q&A) | done |
| 248 | Parent: quiet hours scheduling | done |
| 249 | Parent: acceleration plan view | done |
| 250 | Parent: big-text & high-contrast mode | done |
| 251 | 🗓️ #251 — Parent: monthly report archive | done |
| 252 | Parent: untouched-games view | done |
| 253 | Parent: session-preserving kid switch | done |
| 254 | Parent: dashboard light/dark theme | done |
| 255 | Parent: session timeline per kid | done |
| 256 | Parent: goal-setting screen (minutes/rounds per day) | done |
| 257 | Parent: curriculum focus pin | done |
| 258 | Parent: per-kid voice preference | done |
| 259 | Parent: bedtime wind-down config | done |
| 262 | Privacy: on-device data review for parents | done |
| 264 | Guardrail: no-network fallback verification test | done |
| 265 | Security: invalidate sessions on password change | done |
| 266 | Privacy: PII scrubber for logs | done |
| 267 | Safety: scheme/link allowlist | done |
| 268 | Guardrail: no console.log in prod bundle | done |
| 270 | Privacy: Kotha story context redaction | done |
| 271 | Guardrail: dependency license audit gate | done |
| 272 | Safety: instant pause (parent kill-switch) | done |
| 273 | Privacy: data export for parents | done |
| 274 | Guardrail: rate-limit on story + progress endpoints | done |
| 275 | Safety: age-appropriate band lock for content | open |
| 276 | Skill-tree map per land | done |
| 277 | Land trophy room | done |
| 278 | Nova seasonal outfits (Eid, Boishakh) | done |
| 280 | Challenge Nova: beat-the-owl drill rounds | done |
| 281 | Daily login calendar reward | done |
| 282 | Same-device sibling leaderboard | done |
| 283 | Goal badges (10 rounds, 100% day) | done |
| 284 | Mastery mystery reward boxes | done |
| 285 | Custom avatar builder | done |
| 286 | Star-of-the-week recap card | done |
| 287 | Quest mission variety | done |
| 288 | Kid-friendly voice settings | done |
| 289 | Long-term achievements book | done |
| 290 | Kids: mastery confetti + spoken cheer | done |
| 292 | Nova reaction pack v2 | done |
| 294 | Streak-freeze token system | done |
| 302 | Infra: second tunnel failover | done |
| 303 | Ops: container log cleanup | done |
| 305 | CI: bundle-size regression gate | done |
| 308 | CI: dependency-audit job (npm audit) | done |
| 310 | Ops: backup encryption at rest | done |
| 311 | Docs: architecture diagram refresh | done |
| 322 | Kotha: story inspector in parent panel | done |
| 323 | Kotha: semantic RAG retrieval endpoint | done |
| 324 | Moni: plan-driven difficulty in gameplay | done |
| 325 | Moni: misconception contrast drills | done |
| 326 | Moni: weekly insight card for parents | done |
| 327 | Moni: fatigue-aware session pacing | done |
| 328 | Moni: confidence-based review schedule | done |
| 329 | Kotha: batch-embed stories to pgvector | done |
| 330 | Kotha: privacy-scrubbed cross-kid aggregates | done |
| 331 | Kotha: story dedup + retention policy | done |
| 332 | Moni: learning-style surface | done |
| 333 | Moni: parent-adjustable strictness | done |
| 334 | Kotha: offline story queue quota | done |
| 335 | Moni: per-skill error fingerprinting | done |
| 336 | Kotha: admin story health dashboard | done |
| 337 | Adaptive: lesson-variation anti-boredom | done |
| 338 | Moni: per-skill goal planner for parents | done |
| 339 | Kotha: story search by skill/error-kind | done |
| 340 | Kotha: weekly story digest export | done |
| 341 | Moni: session-length recommendation surfacing | done |
| 342 | Adaptive: hint-ladder depth by confidence | done |
| 347 | PWA: iOS home-screen polish | done |
| 349 | Perf: preconnect/priority for first paint | done |
| 350 | Polish: reduced-motion mode | done |
| 351 | Polish: keyboard navigation for parent area | done |
| 354 | Sound-mixing balance | done |
| 355 | Haptic feedback on taps | done |
| 356 | Onboarding tour for first play | done |
| 381 | Voice: Bangla TTS mispronounces embedded words | done |
| 382 | Auth: Google sign-in is flaky (fails most of the time) | done |
| 383 | Auth: parent gate signup/login is boring and confusing | done |
| 387 | Voice: Bangla still reads as latin when no Bangla voice is installed | done |
| 388 | API: schema drift — new model columns crash deployed DB (no migrations) | done |
| 391 | Auth: Google button shows a surprise language ("Weiter mit Google") | done |
| 393 | Fix literal "Round {n}" placeholders in Count & Pop / Count to 100 | done |
| 394 | Natural Bangla world/level names + syllabus FAB | done |
| 397 | Settings UX: parent-portal door + cleaner cards + natural Bangla | done |
| 399 | Kid SW swallows /parent/parent + clean portal URL | done |
| 401 | /parent redirect must preserve https | done |
| 403 | Settings redesign (kid-facing) + fix double-TTS | done |
| 405 | Access control: kids must never reach parent things + kid-only Settings | done |
| 407 | Parent-area cleanup: no Class Insights on user face, ONE parent page, real portal security | done |
| 409 | UI/UX polish: no live demo creds on prod login, portal session spinner, localized Back labels | done |
| backlog-hygiene | Backlog hygiene — duplicate / already-covered issues closed | done |
| blue-screen-0.27.1 | BLUE SCREEN HOTFIX (kid app) | done |
