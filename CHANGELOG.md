## 18 Aug 2026 — 1.2.3 (Explore Garden shapes visible + earlier in quest order)

adba44a fix(kid): Explore Garden shapes visible + earlier in quest order

## 18 Aug 2026 — 1.2.2 (Catalog search + subject filter (wave-15))

abdccf1 feat(kid): catalog search + subject filter on world-detail + syllabus (#1075)

## 18 Aug 2026 — 1.2.1 (Fix iOS fullscreen layout apps)

3973912 Fix iOS fullscreen layout apps
3746f3a fix(api): real /health probe (DB + background loop) (#1748) + bkash tunnel ownership fix

## 18 Aug 2026 — 1.2.0 (CI hardening + security/authz (wave-14))

d557aa3 fix+chore: CI hardening + security/authz (wave-14)

## 18 Aug 2026 — 1.1.0 (App screen extraction + quality gates + 8-land palette sync (wave-13))

edf9ad6 refactor+fix: App screen extraction + quality gates + 8-land palette oracle sync
7baa33b fix(kid): add band-8 Summit Peaks palette + emblem (fixes premium-path crash)

## 18 Aug 2026 — 1.0.1 (Fix pgvector boot crash (story_embeddings off Base.metadata))

72fb9e8 fix(api): stop pgvector table from crashing API boot on postgres without vector ext

## 18 Aug 2026 — 1.0.0 (Docs consistency + infra ops + data-model indexes + frontend quality (wave-12))

90c2192 feat+fix: docs consistency, infra ops correctness, data-model indexes, frontend quality

## 17 Aug 2026 — 0.99.0 (Explore Garden shape quests (K.G.2) + first-play tap demo)

6e0a734 feat(kid): Explore Garden shape quests (K.G.2) + first-play tap demo

## 17 Aug 2026 — 0.98.0 (Admin correctness + schema caps + router validation + kid a11y + SW query-key + parent usage + Explore Garden gameplay)

fa5443a feat(kid): Explore Garden guided counting gameplay (#1143)
efe6c11 fix(api): admin/router correctness + schema caps + a11y focus + SW query-key + parent usage
8e70d49 feat(billing): freemium gate + Parent Plus entitlement + bKash rails

## 17 Aug 2026 — 0.97.0 (Telemetry + SW/offline + deps/CI wave: #1611-#1620 event accuracy, #1651-#1664 SW cache correctness + shared safety table, #1691-#1702 python vuln scan + Dependabot + Vite 7)

6b9e36c docs: TRACKER wave entry — telemetry + SW/offline + deps/CI wave → 0.97.0 (36 issues: #1611-#1620, #1651-#1664, #1691-#1702)
82395e2 fix(kid): t() never leaks a literal {n} to a kid (#268) + findLetter whitespace
c20221e chore(deps): python vuln scan + lockfile guard, Dependabot, Vite 7, deduped majors, hashed pip
162adf7 fix(sw): offline-cache correctness + shared content-safety table
1571b84 feat(telemetry): event accuracy — client_ts bucketing, wrong-tap events, engagement events, session-start

## 17 Aug 2026 — 0.96.0 (Parent UX + a11y wave: #1586 admin reset, #1587 honest errors, #1588 dashboard extract, #1590-#1596 parent UX fixes, #1597-#1598 share/BN parity, #1600-#1610 a11y focus management)

7b424a3 docs: TRACKER wave entry — parent UX + a11y wave → 0.96.0 (21 closed: #1586-#1598, #1600, #1602, #1605-#1610; 3 left open: #1601/#1603/#1604 kid-app a11y follow-up)
ac02393 feat(api): admin-only parent-password reset endpoint (#1586)
63f8de8 feat(parent): UX + a11y pass — monolith extract, honest errors, focus-managed dialogs, EN+BN parity

## 17 Aug 2026 — 0.95.0 (Auth-hardening + scene-lifecycle wave: #1669/#1676 google+set-password rate limits, #1672 same-origin middleware, #1673 CORS tighten, #1675 72-byte password cap, #1739-#1747 scene timer/listener/tween teardown)

ff1425f docs: TRACKER wave entry — auth-hardening + scene-lifecycle wave → 0.95.0 (#1669 #1672 #1673 #1675 #1676, #1739 #1740 #1741 #1742 #1743 #1744 #1745 #1746 #1747)
748fdd6 fix(kid): NovaScene teardown removes idle schedulers + wallet pulse kill-before-add
e5dfbae fix(kid): blobCache/failed-set lifecycle + SHUTDOWN+DESTROY listener teardown
82ed1de fix(kid): scene teardown — SHUTDOWN+DESTROY removes every loop/repeat timer and delayedCall handle
54fd3b8 feat(api): auth hardening — google/set-password rate limits, 72-byte password cap, CORS tighten, same-origin middleware

## 17 Aug 2026 — 0.94.0 (API-logging + asset-budget + SEO wave: #1752-#1758 access/error logging, #1732-#1738 kid asset budgets + favicon.svg, #1783-#1792 SEO metadata + dashboard noindex)

7eafdb5 fix(oracle): Asset Librarian accepts WebP manifest icons (icon-*.webp) + favicon.svg
c31c62f docs: TRACKER wave entry — API-logging/asset-budget/SEO wave → 0.94.0 (21 issues: #1752 #1753 #1754 #1757 #1758, #1732 #1733 #1734 #1736 #1737 #1738, #1783-#1792)
14da93c infra(pipeline): conductor routes `hard`-labeled issues to v4-pro via tresha-work
5aa1584 feat(seo): origin-consistent metadata — SITE_URL single source, robots/sitemap, dashboard noindex
d2b80f7 perf(kid): asset budgets — lazy/async imgs, downscaled avatars+forest, WebP manifest icons, favicon.svg
57d4fb3 feat(api): access logging + errorlog schema (UTC) + 413 WARNING + embed skip-count fix

## 17 Aug 2026 — 0.93.0 (secret-mgmt/ip-bucket wave: #1778 dev-defaults reachability gate, #1780 dev DB password out of git + guard rejection, #1779 secret-scan working-tree + history sweep, #1763 per-surface IP rate-limit buckets)

8df01a0 docs: TRACKER wave entry — secret-mgmt/ip-bucket wave → 0.93.0
8149ba0 #1779 secret-scan covers working tree (untracked + edits) + opt-in history sweep + env-var-adjacent high-entropy rule
b7e1039 #1763 ip_rate_limit endpoint tags: signup/refresh/share independent per-surface IP buckets
9a6252f #1778 dev defaults refuse non-loopback CORS boot + #1780 dev DB password moved to gitignored env file (guard rejects it in non-dev)

## 17 Aug 2026 — 0.92.0 (ratelimit/keymgmt wave: #1765 admin search+embed budgets, #1766 push rate limit, #1767/#1769/#1770 bucket eviction + no-IP keys + burn isolation, #1768 export/import 10/min, #1774 JWT key rotation, #1775 device credential derivation, #1777 share-token sha256 fingerprint)

f6672e5 docs: TRACKER wave entry — ratelimit/keymgmt wave → 0.92.0
3ec4c0d #1777 share tokens stored as sha256 fingerprints (legacy lazy-migration; public route hashes inbound token)
7d8c265 #1775 device-bound credential: PBKDF2 deriveDeviceSecret + legacy raw-seed 401 fallback (audit clean)
3f8703a #1774 JWT HS256 key rotation: kid claim + previous-key grace window, dual-key verify in decode_token
e99d564 #1768 export/import heavy endpoints get rate_limit(10) instead of the 120/min read budget
91ad7bd #1767 rate-limit bucket prune (7d) wired into hourly tick; #1769 no-IP fallback granularity; #1770 burn-isolation proven in test_ratelimit_keys
5d65488 #1766 push subscribe/unsubscribe write endpoints get PUSH_WRITE_RATE_LIMIT (120/min) + standalone test
5d29a3e #1765 admin search/embed endpoints get their own rate-limit budgets (20/min search, 10/min embed) via _limiter deps

## 17 Aug 2026 — 0.91.0 (auth/ratelimit/ddl wave: #1773 JWT httpOnly refresh rotation, #1764 read-tier rate limits, #1801 admin IN-clause cap, #1793-#1798 migrations DDL hardening, #1776 DB-password+Bearer log redaction)

3816205 docs: TRACKER wave entry — auth/ratelimit/ddl wave → 0.91.0
aece04f #1776 scrub: redact DB conn-string passwords (scheme://user:pass@) and Authorization: Bearer tokens from every log path.
fcfe8f1 #1793-#1798 migrations DDL hardening: _q() quoting everywhere, _constraint_name ≤63 stable hash, CreateIndex(if_not_exists=True), unified CreateColumn ADD COLUMN, CHECK-sqltext allowlist, share-token ALTERs quoted.
ce9ee31 #1801 admin IN-clause: MAX_FILTER_LIST_LEN=200 — oversized filter list → 400 before col.in_(val).
0aa8e93 #1764 read-tier rate limits: READ_REQUESTS_PER_MIN=600 + read_rate_limit() (:read key namespace) on snapshot/mastery/stories/stats/acceleration/aggregates/activity/weekly/share-token — expensive reads bounded, writes untouched.
768c07d #1773 JWT httpOnly: short-lived access (15min parent/10min admin) + rotating nv_refresh httpOnly cookie — POST /auth/refresh rotation, Session.refresh_hash columns, CORS credentials toggle, parent refresh-on-load, admin checkAuth refresh, kid 401 retry. No full-week JWT reachable from JS on parent/admin origin.

## 17 Aug 2026 — 0.90.2 (fix: nginx pins /parent/share/ (trailing-slash minted link) to share.html so the OG share card renders instead of the dashboard)

bcc8a16 🔗 nginx #1782: pin trailing-slash share link (/parent/share/) to share.html — minted links were falling through to the dashboard (static export has no share/ dir, so $uri/ never matched); ?t= query preserved, OG card now renders for old + new links

## 17 Aug 2026 — 0.90.1 (fix: #1771 secret-guard entropy uses len·log2(distinct chars) so strong hex/Base32 keys pass (0.90.0 crash-loop regression — prod 48-char hex JWT + 32-char hex demo password were refused by the over-strict ≥3-class heuristic))

47995f2 🐛 config guard #1771: entropy by distinct-char alphabet (len·log2) not class count — accepts strong hex/Base32 keys, rejects repeated-char values

## 17 Aug 2026 — 0.90.0 (sync/security/observability wave: #1803 mastery advisory-lock + #1804 wallet LWW spend sync (no more GREATEST resurrection) + #1814 persist worker off main thread; #1781/#1782 share page OG/Twitter card + server-shell split; #1771 secret guard min-length/entropy; #1760/#1761 trusted-proxy IP + #1762 per-endpoint rate keys + #1772 nginx CSP/HSTS/XFO headers + #1751 lockout logging; #1749/#1750 X-Request-ID correlation + structured 5xx logging)

90980a3 📚 TRACKER: sync/security/observability wave in-flight (#1771–#1814, 5 waves) + #1802 closed as already-shipped
4fc3de8 📡 obs #1749+#1750: request correlation IDs + structured 5xx logging
201ae9a 🛡️ ratelimit-nginx #1760+#1761+#1762+#1772+#1751: trusted-proxy IP, per-endpoint keys, security headers, lockout logging
2108308 🔑 secrets #1771: non-dev guard rejects weak/short/reused secrets
8d01b2e 🖼️ share-og #1781+#1782: server-shell split + OG/Twitter card metadata for the public share page
7578921 🔒 sync-persist #1803+#1804+#1814: mastery advisory-lock, wallet LWW spend sync, persist off main thread
f044f96 📚 TRACKER: xss-prevention + main-thread-perf wave closed → 0.89.0 shipped+deployed (8 waves, 11 GitHub issues #1823-#1830 + #1820)

## 16 Aug 2026 — 0.89.0 (xss-prevention + main-thread-perf wave: #1823 external-URL allowlist drops data:/about:; #1824/#1828 name+avatar Unicode-charset/length validation (11 fields, 172 checks); #1826 CSV formula-injection guard; #1825/#1830/#1820 kid-app sanitize (download names, TTS control/RTL strip, parentHeatmap memo); #1816/#1819 SVG rasterize chunked off-boot + PNG strip without per-byte array; #1817/#1818/#1827 share-card paint async off game thread + name cap; #1821 44 room/background textures async/lazy; #1822 parent dashboard aggregation memo+chunked)

a1277b8 ⚡ perf-8 #1822+#1829+#1825(parent): parent dashboard aggregation off main thread + sanitize - buildMissedQuestions/buildMonthlyArchive now async: WeakMap memoization keyed on input-array identity + setTimeout(0) chunking (50/100 rows/frame); page.tsx hydrates per-kid via useEffect (state-backed, cache-hit aware, cancelled-cleanup) - new apps/parent/app/sanitize.ts: sanitizeDisplayName (confirm dialogs) + sanitizeDownloadName (CSV filename) - parent tsc 0 errors
3cff181 ⚡ perf-7 #1821: room backdrop + background blob paints async/lazy off scene-create - 12 nv-room-* textures: heavy draw loops yield via requestAnimationFrame every N calls, then refresh owning CanvasTexture via canvas→texture registry with stale-build guard (NovaScene double buildRoom) - 28 blob-* + 4 nv-shape-* backgrounds: created synchronously but painted on later frames - 44 textures made async/lazy — same texture keys, byte-identical final pixels, kid tsc 0 errors
28aae5d ⚡ perf-6 #1817+#1818+#1827: share/cert card paint chunked off the game thread + name cap - renderShareCard/renderCertCard now async, yield via nextFrame() between draw phases (background/avatar/stats/wrap) — no single synchronous 1080x1350 stall - PhotoBoothScene awaits the async render with a busy-status overlay (share tap no longer freezes the game loop) - canvasToBlob accepts a Promise so un-awaited callers stay safe - #1827: kid name capped at 24 chars + ellipsis at both draw sites - kid tsc 0 errors
70fe5ea ⚡ perf-5 #1816+#1819: SVG rasterize chunked off-boot + PNG strip without per-byte array - svgAssets ensureAssets: ~79-SVG loop chunked into batches of 6 per await nextFrame() (rAF + setTimeout fallback), monotonic runGen lets newer boots supersede stale runs — same texture keys/appearance - png.ts stripPngMetadata: replaced per-byte number[] pushes with Uint8Array.subarray segment collection + one exact-size alloc + bulk .set() copies (~1-2M fewer allocations); still returns original bytes on truncated/non-PNG - core tests: png.mjs 11 checks (incl new 100KB-IDAT + truncation), scripts/test-png-metadata.mjs green
d1b68f9 🔒 xss-4 #1825+#1830+#1820: kid-app sanitize + parentHeatmap memo (apps/kid) - new sanitize.ts: sanitizeDisplayName(forDownload: strip path sep/leading dots/cap 60; forSpeech: control/RTL strip) - 9 call sites wired: 3 download filenames (progress/digest/cert) + 6 TTS sites (badge/ach/trophy/openCert/shareReward + 3D welcome) - speech.ts naturalize extended to strip control chars/newlines/RTL overrides from ANY utterance - parentHeatmap now keyed on a stable heatmapSig digest (skillId→day=count) instead of the mistakes ref — 30s poll / unrelated store tick no longer re-folds the ledger - await added at renderShareCard/renderCertCard call sites (forward-compatible with perf-6 async contract) - new sanitize.test.ts 12 tests; vitest 220/220 green, kid tsc 0 errors
59bd9f2 🔒 xss-3 #1826: spreadsheet formula-injection guard in CSV export (apps/api) - _guard_csv_cell prefixes cells starting with = + - @ \t \r with a single quote; applied to all 8 fields per row incl the kid-name column (user-controlled) - non-dangerous values pass through byte-for-byte (Aarif / আরিফ unchanged) - test_export.py extended: 54 passed (was 37), compileall clean
e65941f 🔒 xss-2 #1824+#1828: name/avatar charset + length validation (apps/api schemas) - shared NAME_PATTERN/OPTIONAL_NAME_PATTERN + Unicode-charset validators (control chars, bidi overrides U+200E/F U+202A-E U+2066-9, angle brackets all rejected; Unicode letters/marks incl Bengali accepted) - avatar: 32-char cap + control-strip + HTML rejection - applied to 11 fields: KidIn/KidUpdateIn/KidOut/KidSnapshotOut name+avatar, ProfileOut.display_name, SignupIn/ProfileUpdateIn display_name - new standalone test_schemas_validation.py: 172 checks green, compileall clean, no regressions
2066d3b 🔒 xss-1 #1823: remove data:/about: from external-URL allowlist (packages/core/src/links.ts) - data:text/html can render active HTML via window.open; about: never needed - inline data: assets are <img>/<audio> srcs, never allowlist-routed — 0 callers to update - core links test: 30 checks green (data:/about: now REJECTED, https:/mailto:/blob: accepted)
d0773e7 📚 TRACKER: log xss-prevention + main-thread-perf wave (#1823-#1830) — 8 disjoint fan-out subagents dispatched + backlog sweep note (all 269 feed audits complete, 183 consumed task files archived)
b97c45b 📚 TRACKER: close CI housekeeping gap from 0.88.0 (bcrypt/email-validator deps + 5 new coverage files wired into api job)
8742890 🔧 CI api job: add bcrypt+email-validator deps + wire in 5 new coverage test files (auth 66 / admin 89 / progress 62 / kids 50 / import 65) - install line was missing bcrypt (security.py) + email-validator (EmailStr schemas) — the new tests transitively need both - all 14 standalone api test files verified green with the exact CI install line (scratch venv, Python 3.12) - closes the housekeeping gap flagged in the 0.88.0 tracker entry

## 16 Aug 2026 — 0.88.0 (test-coverage-api: 5 standalone test files (480+ checks) closing 12 feed findings + 4 real bug fixes (import updated_at round-trip, admin request NameError, admin string-PK id, #865 iat sub-second race))

504d59a 🧪 test-coverage-api: 5 standalone test files (480+ checks) closing feed #2/#3/#4/#5/#6/#7/#8/#9/#10/#11/#12 + 4 real bug fixes

## 16 Aug 2026 — 0.87.0 (test-coverage-kid: 11 vitest files/208 tests closing 15 feed findings + 6 real i18n bugs fixed (BN round-HUD digits, 5 hardcoded Round scenes, PercentScene pctFact))

e1cca7c 📚 TRACKER: v50 test-coverage-kid feed closure (15 findings — 11 vitest files/208 tests + 6 i18n bugs fixed)
261c56c 🧪 test-coverage-kid: 11 vitest files (208 tests) closing feed #1/#2/#4/#6/#7/#8/#9/#10/#12/#13/#14 + 6 i18n bug fixes

## 16 Aug 2026 — 0.86.0 (e2e-scenario-coverage: 13 mock-backed specs (gameplay/pin-gate/retention/push-consent/bangla-surface/admin/guardrails/sessions/share-card/qr-cards/google-signin/guest-upgrade/age-band) + vitest foundation for apps/kid + CI preview job + 5 spec-bug fixes)

4a609dd 🧪 e2e-scenario-coverage: 13 mock-backed specs + vitest foundation + CI preview job
5c7b3d0 📚 TRACKER: v50 e2e feed closure (8 findings — 3 spec pairs + 5 quality items, incl. #935 event-driven precache drain)
7c21f0d 🧪 e2e #5/#935: coldSeed precache drain now event-driven (no fixed 4s sleep)

## 16 Aug 2026 — 0.85.0 (Difficulty-model + core test-coverage batch: honest difficulty metric, server BKT decay, 5 real core bugs, 254 regression checks, foreign nova3d fix)

51b1577 📣 docs/marketing: Numberverse Facebook beta launch plan (phases 1-4, go/no-go metrics)
0a17e82 📚 TRACKER: v50 test-coverage-core feed closure (5 real bugs, 10 test files) → 0.85.0
f2191f2 🩹 fix foreign session's broken nova3d edit (release blocker)
354c5fa 🧪 v50 test-coverage-core: 5 real bugs fixed + 10 regression test files (254 checks)
f6be107 📚 TRACKER: v50 difficulty-model feed closure (13 findings) → 0.85.0
8c86381 🎮 v50 difficulty-model #11: every onRoundDone difficulty arg is the 1-based level index
a27df2e 🧠 server adaptive batch: idle decay + compiled BKT params + bandForAge-aligned caps
3699eb2 🐛 v50 difficulty-model: band-8 placement, full-date age, hardest-tier family mastery
cef6a5e 🐛 v50 difficulty-model: monotone ladders + nextDifficulty contract (#1044-audit)
a4ba3d3 🧠 MONI audit fixes (v50 feed_moni): neutral speedTendency, band-gated weak focus, one occurrence per streak
84e5759 📚 TRACKER: Moni difficulty cluster (#1044/#1046/#1047/#1048) closure → 0.84.0
7aa8f54 🧠 MONI difficulty cluster #1044/#1046/#1047/#1048: per-skill + per-subject difficulty
1f169ec 📚 TRACKER: scene-patterns cluster (#997-#1004) closure → 0.83.0
453618c 🗣️ #1000: drop redundant speak lang:'bn' + port CoinValue hardcoded Bangla strings to i18n
4e3996a 🧩 scene-patterns Wave B: inline scene i18n tables → central i18n.ts (#1001)
825e8dd 🧩 scene-patterns Wave A: real round correctness (#1002), scene-archetype registry (#1003), shared hintWrong (#1004)

## 16 Aug 2026 — 0.82.0 (🛡️ Guardrails closure: scheduled progress_events prune + revoked-session purge (#983/#984), VPC consent + birth_year band cap + export v2 (accel/coins) verified (#985-#987), MODEL_JSON versioning (#988))

73cf854 📚 TRACKER: guardrails cluster (#983-#988) closure → 0.82.0
33a747e 🛡️ #983/#984: scheduled progress_events prune + revoked-session purge (unattended retention)
5692748 📚 TRACKER: multi-tenancy (#961-#970) + config/voice (#971-#979) closures
ea7e819 🔊 voice drift guard (#974): automated VOICE_V vs payload-hash check at voice build
9e9d91e 🔧 CI: api job installs its base deps so test_org_isolation (#963) can actually run
e1ff3c2 📚 TRACKER: 0.81.0 moni adaptive closure entry (#953-#960)

## 16 Aug 2026 — 0.81.0 (Moni adaptive cluster: verified+closed #953-#960 (NaN-guard, derived fragile, recovery decay, slowMs+1 gap, band-gated focus, rung-shift review, affinity decay, post-round state) + 18-check regression suite wired into core CI)

a53c48a 🧠 Moni adaptive cluster (#953-#960): verified impl + regression test suite + CI wiring
5189190 📚 TRACKER: 0.80.0 kotha memory-pipeline closure entry (#943-#950)

## 16 Aug 2026 — 0.80.0 (kotha-stories pipeline: verified+closed #943-#950 (orphan sweep, skip surfacing, FIFO embed, numeric-safe scrub, context budget, dim guard, search allowlist, scheduled prune) + dep-free clamp helpers + expanded scrub tests)

54882a3 🧼 kotha-stories cluster (#943-#950): verified impl + dep-free clamp helpers + full test coverage
b8ad42c 📚 TRACKER: 0.79.0 celebration-engine release entry (#1063-#1070)

## 16 Aug 2026 — 0.79.0 (celebration engine: i18n celebration words (#1064) + effort-scaled bursts (#1068) + elite register (#1069) + band-rooted combo chime (#1065) + shared difficulty signal (#1070))

cc40010 🎉 celebration engine: i18n words + effort-scaled bursts (#1064 #1068 #1069 #1065 #1070)
4274602 📚 tracker: Batch-9 engine difficulty-ramp (#1056–#1060) shipped 0.78.0

## 16 Aug 2026 — 0.78.0 (shared engine difficulty-ramp: ladder past-ceiling + live success level + growing rounds + shared time + continuous daynight/compare (#1056 #1057 #1058 #1059 #1060))

ef20fed 🎢 engine difficulty-ramp: shared ladders + live adaptation (#1056 #1057 #1058 #1059 #1060)

## 16 Aug 2026 — 0.77.0 (strictness=auto for unset kids + honest worlds label (#1049 #1050))

b7c161b 🧠 strictness=auto fix + honest worlds label (#1049, #1050)

## 16 Aug 2026 — 0.76.0 (sync-state hardening: per-channel state + backoff + band-skip requeue + token revalidation (#1026-1031))

7fa87b8 🔄 sync-state hardening: #1026-1031 backoff, per-channel state, band-skip requeue, token revalidation

## 16 Aug 2026 — 0.75.0 (event-sync reliability: progress dedup+BKT replay safe (#1023), timestamp preserved (#1024), no destructive outbox clears (#1025))

026678c 🔄 event-sync reliability: #1023 progress dedup + #1024 timestamp + #1025 no destructive clears

## 16 Aug 2026 — 0.74.0 (batch-5: parent Moni control (#1041-1043) — strictness synced via KidSettings, portal + kid app both directions)

88ed067 feat: parent-control of Moni strictness — synced via KidSettings (#1041/#1042/#1043)

## 16 Aug 2026 — 0.73.0 (batch-4: game-ladder integrity (#1051-1055) — scenes now read LEVELS[levelIndex])

ec05729 fix: game-ladder integrity — 6 scenes now read LEVELS[levelIndex] (#1051-#1055)

## 16 Aug 2026 — 0.72.0 (batch-3: 7 clusters (#942-999) — kotha/API, Moni adaptive, multi-tenancy, config/voice, guardrails, PWA/offline, engine tech-debt)

72a10fb fix: restore og-card.png to SW precache — undo nv-b14 globIgnores regression (#993)
8f08ac6 fix: restore nv-b15 over-deleted consts + widen digit() to string, fix stale locale test
1a8d3a5 merge: batch-3 nv-b15 — engine tech-debt cluster (#996-999)
5f4542a refactor: batch-3 nv-b15 — engine tech-debt cluster (#996-999)
f026221 merge: batch-3 nv-b11 — multi-tenancy cluster (#961-969)
b740aa7 feat: batch-3 nv-b11 — multi-tenancy cluster (#961-969)
a8a3518 merge: batch-3 nv-b14 — PWA/offline/bugs cluster (#988-995)
b1aca6f fix: batch-3 nv-b14 — PWA/offline/bugs cluster (#988-995)
faa029f merge: batch-3 nv-b13 — guardrails cluster (#980-987)
b836396 feat: batch-3 nv-b13 — guardrails cluster (#980-987)
da19064 merge: batch-3 nv-b9 — kotha-stories API cluster (#942-950)
23388a0 feat: batch-3 nv-b9 — kotha-stories API cluster (#942-950)
2563be7 merge: batch-3 nv-b12 — config/voice cluster (#970-979)
f853d97 feat: batch-3 nv-b12 — config/voice cluster (#970-979)
fbda9ac merge: batch-3 nv-b10 — Moni adaptive cluster (#951-960)
3821eff feat: batch-3 nv-b10 — Moni adaptive cluster (#951-960)

## 16 Aug 2026 — 0.71.2 (fix: QuestionWords scene key mismatch — game engine boots (game-qwords → QuestionWords))

067ef5e 🐛 fix: QuestionWords scene key must equal catalog value (game-qwords → QuestionWords)
2baf7e3 monitor: GitHub reachability watchdog — regional-block vs global-outage detection + TG alert (#github-region-block)

## 15 Aug 2026 — 0.71.1 (unblock deploy: Docker Hub uv base + PK-aware migration dedupe + e2e fixes)

3dab0a5 fix: 0.71.0 release blockers — ghcr.io-unblocked api base (Docker Hub + uv from PyPI), PK-aware constraint migration dedupe (uq_kid_skill collision), e2e mock query-string globs + exact Sign-out selector + offline manifest contract via SW fetch

## 15 Aug 2026 — 0.71.0 (batch-2: 8 clusters (#763-941) — auth/security durable PG rate-limit, content-safety i18n/BN/3D/speech scans + shared unsafeWords.json, scene auto-discovery + lifecycle, kid refactor + PBKDF2 PIN, data-integrity tz-aware + indexes, infra secrets/resource-limits, styling/a11y, e2e suite)

4ad5a22 fix(audit+engine): adapt scene-integrity audit to import.meta.glob auto-discovery (#936); make catalog-coverage guard throw instead of console.warn (shipped-code audit)
0e0d6c3 fix(infra): auto-prune old numberverse-demo image tags on deploy — keep 2 newest for rollback, drop stale version tags + floating :latest (box hit 97% disk once from accumulated tags)
5e1d915 chore: merge batch-2 nv-b6
d3e3a1e chore: merge batch-2 nv-b7
f9db607 feat: batch-2 nv-b6 — content-safety cluster (#896-905): shared unsafeWords.json single source, i18n/BN/3D/speech scanning, extended UNSAFE categories, voice-recording 30s ceiling + review path
b62f31a test: batch-2 nv-b7 — e2e cluster (#925-932): offline sync-drain, cross-app journey, parent portal specs, global-setup, WebKit/Firefox SW coverage, listener detach
409b955 merge: batch-2 nv-b8 — scene lifecycle cluster (#933-941): import.meta.glob auto-scene-discovery, key-collision guard, shutdown cleanup, RESIZE listener .off, bootPromise reset + generation fast-path, scene registry catalog coverage
d29f6d6 merge: batch-2 nv-b4 — data-integrity cluster (#906-915): tz-aware timestamp columns + migration ALTERs, ProgressEvent/SkillMastery/Story indexes, Subscription unique profile, migration harness indexes/constraints, coins concurrency guard, backfill fix, tenant axis, kid_settings CHECK constraints
fb3376d merge: batch-2 nv-b2 — kid refactor cluster (#786-791 #818-819 #883 #1179): extract App screens, split addEvent into roundLearning/roundStory, engine scene registry single-source, store persist versioning, guarded localStorage parse, PBKDF2 PIN hashing + EN/BN crypto strings, journey/store entry-chunk reduction
d1e4234 merge: batch-2 nv-b1 — styling/a11y cluster (#763-799 #882): globals.css dedupe, real Baloo2 weights, land accent/deco carryover, reduced-motion gates, NV_* token consolidation, Firefox zoom fallback, dashboard max-width fallback
8b92ecf fix: batch-2 nv-b8 — scene lifecycle cluster (#933-941): RESIZE listener cleanup, shutdown() base, delayedCall destroy, scene registry parity, bootPromise reset, key collision guard, canvas resize coalescing
5c4bee9 feat: batch-2 nv-b4 — data-integrity cluster (#906-915): tz-aware timestamps, indexes, sub unique constraint, migration harness indexes/constraints, coins concurrency, backfill fix
7dd90bc feat: batch-2 nv-b1 — styling/a11y cluster (#763-799 #882): globals.css fix, Baloo2 real weights, land accent + deco, reduced-motion gates, NV_* token consolidation, Firefox zoom fallback, dashboard max-width
c9d0a7a feat: batch-2 nv-b2 — kid refactor cluster (#786-791 #818-819 #883 #1179): extract App screens, split addEvent into roundLearning/roundStory, engine scene registry, store persist versioning, guarded localStorage parse, PBKDF2 PIN hashing, journey/store entry-chunk work
a31622c merge: batch-2 nv-b5 — infra/security config cluster (#916-#924): PG secrets out of compose, resource limits, pinned image digests, nginx healthcheck, CORS/secret fail-fast, pinned backup container, env_file parity
a9d3b6f merge: batch-2 nv-b3 — auth/security cluster (#771 #772 #773 #800 #801 #802 #865): durable PG rate limiter + cred-stuffing guard, session revocation fingerprint, no default-password seeding, Google aud check, restricted admin mass-assignment
7c9fce5 feat: batch-2 b5 work (subagent)
c941908 feat: batch-2 b3 work (subagent)

## 15 Aug 2026 — 0.70.1 (hotfix: progress.py SKILLS_SEED 8-tuple unpack after catalog seed parity (#1020))

a1af11b fix(api): SKILLS_SEED now 8-tuple after #1020 seed parity — unpack by row index in progress.py band lock

## 15 Aug 2026 — 0.70.0 (older-backlog batch-1: 6 clusters × #17 #117 #762-825 #855 #865 #881-905 #989-995 #1005-1083 — cold-start & SW/perf, scene BN strings, a11y re-audit, catalog NCTB parity, age-band mature register)

b839133 Merge nv-o6 (kids wave): age-band mature register + renderBand layer
93de122 Merge nv-o5 (kids wave): catalog NCTB parity + card descriptions/class labels
093c231 Merge nv-o4 (kids wave): i18n code-split + SW/perf + budget gate
0521d82 Merge nv-o3 (kids wave)
aaadfc8 Merge nv-o2 (kids wave)
6ebacc7 Merge nv-o1 (kids wave)
e015bd0 kids wave: nv-o6 — age-band theming: mature register i18n, band-aware mascot/greeting/reactions/typography/garden/recap/challenge, renderBand layer
ff11137 kids wave: nv-o5 — catalog: NCTB code/class parity + audit guard, seed sync, game card descriptions/class labels, duplicate-title disambiguation
2801cca kids wave: nv-o4 — perf/SW: i18n dict split + lazy load, lazy GoogleSignIn, voice-size cache guard, og-card/splash precache, wire-budget CI gate
985873e kids wave: nv-o3 — a11y: tap targets, focus states, canvas keyboard/SR access, dialog focus trap, tablist semantics, dest-aware back labels
9df26f3 kids wave: nv-o2 — scene BN string fixes: localized prompts, hint ladder, neural voice fallback hold
2c85232 kids wave: nv-o1 — cold-start perf, gameHost boot race, session resume on back, guest exit loops, Nova home back button

## 15 Aug 2026 — 0.69.0 (kids wave: 24 clusters × #1346-1486 — mastery display %, calm mode sheet, in-scene language switch, quest claim flow, celebration sequencing, adaptive hint ladder, cert/share honesty, freeze-token streak lines, language-reaction i18n, HUD mastery bar + voice-chip labels)

3781564 Merge branch 'nv-k5e'
cf3c23c Merge branch 'nv-k5d'
628a764 Merge branch 'nv-k5c'
40df7e3 Merge branch 'nv-k5b'
d3519e1 Merge branch 'nv-k5a'
6d27794 Merge branch 'nv-k4e'
88f2b4d Merge branch 'nv-k4d'
6b7415f Merge branch 'nv-k4c'
354d94b Merge branch 'nv-k2a'
b3c84d2 kids wave: nv-k5e — completed fixes
081554f kids wave: nv-k5d — completed fixes
5cef2fb kids wave: nv-k5c — completed fixes
1bb8a89 kids wave: nv-k5b — completed fixes
c24c455 kids wave: nv-k5a — completed fixes
088350d kids wave: nv-k4e — completed fixes
09d8eb0 kids wave: nv-k4d — completed fixes
f5c0e50 kids wave: nv-k4c — completed fixes
f69fceb kids wave: nv-k2a — completed fixes
d203fab fix(kid): repair k4b merge brace imbalance + restore missing i18n keys
e9885ec merge: kids wave — nv-k4b (transitions/fades #1447-1450)
81f6b99 merge: kids wave — nv-k4a (celebration FX/HUD #1443-1446)
faa82f7 merge: kids wave — nv-k3e
339773b merge: kids wave — nv-k3d
9ec1ff6 merge: kids wave — nv-k3c
8cffd23 merge: kids wave — nv-k3b (session resume/pause #1423-1426)
b5cc197 merge: kids wave — nv-k3a
9d8440b kids wave: nv-k4b
275dc96 kids wave: nv-k4a
2d871af kids wave: nv-k3e
ed476ac kids wave: nv-k3d

## 15 Aug 2026 — 0.68.0 (parent wave 3 — auth hardening + web push + import/export + notification center + per-kid sync/archive/feedback (#1487-1560))

8652e01 merge: parent gap fixes — dirty-guard kid switch, mastered titles/staleness tags, focus bands, confirm-reset arming, birth-year hint (#1507/1511/1513/1523/1524)
df05d19 merge: parent error/sync/notifs — dismissible+retry banner, device-sync chip, regenerate confirm, parent-gated notif toggle (#1505/1535/1553/1554/1558)
5392077 merge: parent kid-mgmt+nav — active highlight, truthful nav, diagnostics, per-kid confirms/share, activeId persist, dup-name guard (#1496/1498/1499/1508-1510/1527/1529-1532)
384de86 merge: parent data-loading — activity dedupe+show-more, getMastery guard, per-kid archive status, loading skeleton, sync feedback (#1492/1495/1504/1506/1516/1518/1519)
4031606 parent gaps: throwApiError status errors, birth-year guard, unsaved-changes guard, catalog % coverage, mastery staleness tags (#1507/1511/1513/1523/1524)
33b7433 parent error/sync/notifs: dismissible+retry banner, device-sync chip, regenerate confirm, parent-gated notif toggle (#1505/1535/1553/1554/1558)
c05870b parent kid-mgmt+nav: active-nav highlight, NAV_GROUPS truthfulness, diagnostics reachable, confirm/edit/share per-kid, activeId persist, dup-name guard, delete cleanup (#1496/1498/1499/1508-1510/1527/1529-1532)
b357051 push API: push_subscriptions table + subscribe/unsubscribe/list endpoints (#1534)
1b0eb2a parent data-loading: activity dedupe+show-more, getMastery guard, per-kid archive status, initial-loading skeleton, sync feedback (#1492/1495/1504/1506/1516/1518/1519)
388b2b2 merge: kid web-push SW listeners + durable nv_sync_signal (#1533/1556)
e22c058 merge: parent learning controls + archive spinner/retry + mobile nav CSS (#1512/1514/1515/1517/1525/1526/1528)
258ef37 merge: parent components — activity skill labels, overview i18n, mastery sort/filter/titles, share anonymity, BN numerals (#1494/1497/1520-1522/1549/1557/1559/1560)
867c842 merge: parent onboarding/privacy/export UI — signup, login validation, birth-year, OnDeviceData (#1537-1544)
2b2ae60 merge: parent account+sessions UI — Google set-password, revoke confirm, session states (#1487/1490/1491/1545-1548)
4a5537b merge: full-family JSON backup + POST /import restore (#1500-1503)
893ef9f merge: parent-account API security (#1487-1490) + weekly/share/mastery API (#1493/1524/1536/1550-1552)
9e212e7 kid web-push SW listeners + durable nv_sync_signal (#1533/1556)
4993780 parent learning controls: focus-band clamp, goal bounds, All/None subjects, archive spinner+retry, mobile nav CSS (#1512/1514/1515/1517/1525/1526/1528)
759a716 parent components: activity skill labels, family overview i18n, mastery weak-first sort + subject filter + real titles, anonymous share text, BN numerals, top_game (#1494/1497/1520-1522/1549/1557/1559/1560)
618f6c6 parent-onboarding: signup page, login token validation + welcome anchor, birth-year clamp, gatePrivacy + privacy notes, OnDeviceData clear-all + export (#1537-1544)
7c43d6d parent-account UI: Google set-password flow, session revoke confirm + self-revoke, last_seen null guard, loading/empty states (#1487/1490/1491/1545-1548)
56d7fbe data export/import: full JSON backup completeness + POST /import restore (#1500-1503)
3cbd5a9 parent-auth: Google auth_provider signal + set-password route, login/change-pw rate limiting, bcrypt 72-byte caps (#1487-1490)
9cb8326 api weekly/share/mastery: activity created_at sort, last_practice/decay surfacing, share-token rotate, clean top_game, minutes from timestamps, notification trigger (#1493/1524/1536/1550-1552)

## 15 Aug 2026 — 0.67.0 (kid-first UX: Google sign-in typed errors+retry, sound controls (SFX mute+parent rule+voice volume+a11y), calendar streak fixes, swipe gestures, adaptive hint ladder+first-run intro+locked-land warmth)

12c09e9 merge: #1479-#1486 hints+worlds
ee82ed8 merge: #1475-#1478 swipe gestures
5a00a32 merge: #1471-#1474 calendar/streak
3f8d372 merge: #1467-#1470 sound controls
dd5d9d2 merge: #1463-#1466 Google sign-in UX
b8d55aa fix(hints+worlds): tap-choice uses adaptive ladder, first-run intro, hint-meter cue, locked-tap warmth, honest 0/0 + unified unlock gap (#1479-#1486)
09d22fd fix(gestures): arrow targets picked button before fire, real horizontal dominance for room flips, nudge gated on open canvas, reduced-motion affordances (#1475-#1478)
be60e0f fix(calendar): claimed-today flag is per-tile, freeze-token warmth, no all-lock week on return, tomorrow-reward teaser (#1471-#1474)
0a8507f fix(sound): mute covers SFX too, HUD honors parent music-off, voice volume in Settings, accessible HUD toggle (#1467-#1470)
16ddfab fix(auth): Google sign-in — typed errors, identity-keyed restore, busy guard, HTTPS note+retry (#1463-#1466)

## 15 Aug 2026 — 0.66.0 (kid-first wave: 10 Bengali mistranslations fixed, role guardrail (require_role), bundle split boot 1.83MB→46kB, Nova3D lazy, three-vendor split, smoke-test boot-chunk floor fix)

60272bc fix(deploy): smoke/rollback 100k floor rejects split boot chunk (46k) — false-negative rollback of good 0.66.0 deploy
a15ff1f fix(bundle): split three into lazy three-vendor — island chunk 1027KiB→167KiB (oracle 1MiB budget) (#879)
2a2d78b chore: lockfile — drop @numberverse/core from admin importer (#850)
c890b16 merge: #879,#880 bundle splitting + lazy Nova3D
2472130 merge: #869-#878 Bengali kid-facing translations
a65a8c1 merge: #868 role guardrail (require_role factory)
c5413a7 feat(auth): role guardrail — require_role factory, JWT role claim (#868)
77f2a0e perf(bundle): split vendor chunks + lazy Nova3D, boot entry 1.83MB → 46kB (#879,#880)
cecb132 fix(i18n): correct 10 Bengali kid-facing mistranslations (#869-#878)
9ad4073 🐛 game: commit PetFeedScene.ts — required by engine.ts but was stuck in .git/info/exclude

## 15 Aug 2026 — 0.65.1 (🔐 seed: bootstrap admin password re-hashes to NV_ADMIN_PASSWORD on boot — env change now rotates the live console login (#842))

61ed882 🔐 seed: bootstrap admin password re-hashes to NV_ADMIN_PASSWORD every boot (#842)

## 15 Aug 2026 — 0.65.0 (admin console: role boundary + audit log, story-health ops surface, typed-confirm deletes, typed config form, real logout, 401-vs-403 (#843 #844 #845 #846 #847 #849 #850 #851))

e977a2f Merge nv-844: admin console ops surface + typed deletes/config (#844 #845 #847 #849)
841d29a Merge nv-850: admin auth fixes + dep hygiene (#843 #850 #851)
03a38b0 Merge nv-846: admin role boundary + audit log + config validation (#846 #847)
34321c9 🖥️ admin console: story-health ops surface, typed-confirm deletes, typed config form, shared httpClient (#844 #845 #847 #849)
b397f60 🧹 admin: real server-side logout, 401-vs-403, drop unused core dep (#843 #850 #851)
9f0598c 🔐 admin: role boundary (super_admin) + audit log + config JSONB schema validation (#846 #847)

## 15 Aug 2026 — 0.64.0 (api: admin CRUD caps+feedback, sync-contract 200, UTC windows, typed models, non-dev credential guard (#840 #842 #848 #852 #853 #854 #857 #858 #859 #860))

54ace14 Merge nv-842: non-dev credential guard (#842)
e3921b8 Merge nv-852: API sync-contract + typed models (#852 #853 #857 #858 #859 #860)
382180b Merge nv-840: admin list/filter/sort/range hardening (#840 #848 #854 #860)
338b1de 🔐 api: refuse non-dev startup with default JWT secret/admin password (#842)
c016018 🐛 api: UUID kid_id params, 200 sync ack, UTC weekly windows, typed stats/reset models (#852 #853 #857 #858 #859 #860)
a93654b 🛡️ admin: cap sort/filter/range, 400 on bad parse, UUID id 422, naive-UTC now (#840 #848 #854 #860)

## 15 Aug 2026 — 0.63.1 (🛡️ kids: rate-limit all write/destructive routes (#837))

d128bf9 🛡️ kids: rate-limit write/destructive routes (#837)

## 15 Aug 2026 — 0.63.0 (fix: abuse-guard/authz — share rate-limit+revoke+paused (#832 #866 #867), batch caps (#833 #834 #835), body-size limit (#836), admin allow-lists (#862 #863 #864), export+content rate limits (#838 #839))

4d66204 Merge nv-838: rate-limit exports + public content catalog
b1c45b1 Merge nv-832
69c3afe Merge nv-862
c4378e7 Merge nv-836
c6e2601 Merge nv-833
9101820 🛡️ api: rate-limit exports + public content catalog (IP-keyed) (#838 #839)
9b4faa8 🛡️ shares: IP rate-limit on public snapshot, revoke route, paused-gating, no coins on card (#832 #866 #867)
5721117 🛡️ admin: per-resource writable allow-lists, deny is_admin/password_hash/id, redact secret columns (#862 #863 #864)
90f3803 🛡️ api: global 1MiB request-body size-limit middleware (#836)
23b39c9 🛡️ api: cap progress batch, story/accel batches, context budget + depth (#833 #834 #835)

## 15 Aug 2026 — 0.62.0 (fix: audio nonzero-floor (#827), haptics reduced-motion (#828), watchdog window (#829), leading-minus naturalize (#830), master SFX mute (#831))

c569158 Merge #831: master SFX mute tied to TTS off
e801d35 Merge #830
8676ed2 Merge #829
4620e4a Merge #828
1eb944a Merge #827
bc89d8f 🔇 audio: master SFX mute tied to TTS off (#831)
3da435d 🗣️ speech: naturalize leading minus ('-5' → 'minus five') (#830)
0bd0523 🗣️ neuralVoice: watchdog window no smaller than arm; rearm after fetch phase (#829)
2385b69 📳 haptics: respect prefersReducedMotion in haptic() (#828)
1c49ee9 🔊 audio: nonzero gain floor prevents exponentialRamp RangeError on vol=0 (#827)

## 15 Aug 2026 — 0.61.0 (refactor: DragReorderScene shared base — 6 scenes migrated, 902 LOC dedup (#1146))

a738952 Merge nv-1146: DragReorderScene shared base, 6 scenes migrated (#1146)
67da449 🛠️ reorder engine: DragReorderScene shared base, 6 scenes migrated, 902 LOC dedup (#1146)

## 15 Aug 2026 — 0.60.0 (feat: memory recall engine, drag-sort economy (13 BinSort subclasses), real-key KeyboardExplorer (#1141 #1145 #1139))

290d662 merge #1139: KeyboardExplorer real keys
e63efaa remove stray apps/kid/node_modules symlink from tracking
f6df694 merge #1145: drag-sort economy
816cf70 merge #1141: MemoryScene recall engine
ecfe7e6 #1139: KeyboardExplorer real-key path — physical keydown + on-screen fallback, challenge bar
4ac0548 #1145: drag-sort economy — FiveSenses + FestivalSort onto BinSortScene, 4 new classification skills (odd/even, vowel-consonant, corner sort, plant/animal)
ce54710 #1141: MemoryScene — shared flip-grid recall engine (tiered 6-20 cards), 4 memory variants (compounds/matras/number-bonds/synonyms)

## 15 Aug 2026 — 0.59.0 (feat: 4 new mechanic engines — ArcadeCatch physics fast-round facts, TraceScene glyph handwriting, ExploreGarden no-pressure free play, BanglaSpell typing hybrid (#1140 #1142 #1143 #1144))

b5f63ef merge #1144: TraceScene glyph tracing
bd02177 merge #1143: ExploreGarden free play
9c99014 merge #1142: ArcadeCatch fast rounds
3a48270 merge #1140: typing hybrid spelling
b8e9dec #1144: TraceScene — glyph-tracing engine for digits 0-9 + capitals, trace-digits & trace-letters skills
166eb6a #1143: ExploreGarden — no-pressure free-play garden (unscored, emoji planting, open prompts), math-explore-garden skill
ed4b423 #1142: ArcadeCatch — first Phaser Arcade-physics lesson (falling answers, 12s gold bar), 4 fast-round fact skills
bfc24bf #1140: production spelling — typing hybrid in BanglaSpellScene (tier 1-2 tap, tier 3+ physical/QWERTY typing), bn-spell-type skill

## 15 Aug 2026 — 0.58.0 (feat: band 8 Summit Peaks (12 class-8 skills, map keeps going) + intermediate land boss gate at 50% land progress (#1164))

517393f merge #1164 (B): intermediate land boss
75d6fed merge #1164 (A): band 8 Summit Peaks
93b014f #1164 (B): intermediate land boss — per-land duel gate at 50% progress, bossBeaten persistence, boss UI on journey + worlds
b8d4fd2 #1164 (A): band 8 Summit Peaks — 12 class-8 skills, depth ladders in 6 scenes, oracle updated to 8 lands

## 15 Aug 2026 — 0.57.0 (feat: band 6-7 science/english/ict — 15 skills, 2 new scenes (coding logic, science facts), depth ladders in 5 existing scenes (#1161))

a434d6d fix: child-safety gate — rephrase new band 6-7 science content to established safe vocabulary (0 unsafe hits) (#1161)
23e8d4c merge: #1161 band 6-7 science/english/ict
92cf697 feat: band 6-7 science/english/ict — 15 skills, 2 new scenes (coding logic, science facts), depth ladders in 5 existing scenes (#1161)

## 15 Aug 2026 — 0.56.0 (feat: band 6-7 math breadth (algebra/negatives/ratio/geometry/stats, 11 skills, 2 scenes) + age-graded mission bar for bands 5-7 (#1160 #1162))

e06756e fix: mirror 11 new band 6-7 math skills in API seed for audit parity (#1160)
0f3d1d2 merge: #1160 band 6-7 math breadth
e35571a feat: band 6-7 math breadth — algebra, negatives, ratio, geometry, statistics (11 new skills, 2 new scenes) (#1160)
5530ff6 merge: #1162 age-graded reward surfaces
96c28ee feat: age-graded reward surface — mission bar (streak/badges/trophy) replaces nursery pet for bands 5-7 (#1162)

## 15 Aug 2026 — 0.55.0 (feat: challenge mode (15s countdown, no reveal) for all 8 remaining band 6-7 scenes (#1163 #1162))

ed93838 merge: challenge mode batch B (#1163)
4fee2b4 merge: challenge mode batch A (#1163)
ab6297d feat: challenge mode (15s countdown, no reveal) for fraction-match, bgs-facts, human-body, bn-matras (#1163)
0d3a7de feat: challenge mode (15s countdown, no reveal) for clock, pizza-frac, decimals, percent (#1163)
e3546a6 🐛 #1563 answer-option cards: fix clipped face + label contrast

## 15 Aug 2026 — 0.54.1 (fix: NCTB math cell renumber (c3 data adjacent, c4 contiguous) + shared-scene ladder doc (#1154 #1155 #1157))

294bbd7 fix: renumber c3/c4 math cells (data-skills adjacent, c4 contiguous) + doc shared-scene ladders (#1154 #1155 #1157)

## 15 Aug 2026 — 0.54.0 (feat: labeled Parents door on home (1-tap portal) + Nova/Garden living-world strip; drop redundant settings gear (#1395 #1396 #1397); incl. #1152/#1156 game-id splits)

e24fe18 feat: labeled Parents door (1-tap) + visible Nova/Garden living-world strip on home (#1395 #1396)

## 15 Aug 2026 — 0.53.39 (fix: distinct game ids for en-shapes + bn consonants (cross-subject/cell collision) (#1152 #1156))

3614fa2 fix: split en-shapes + bn-benjonborno onto their own game ids (#1152 #1156)

## 15 Aug 2026 — 0.53.38 (fix: reconcile classNumber vs nctbCode prefix on 6 band-3/4 skills (#1153))

41bfbcd fix: reconcile classNumber with nctbCode class prefix across 6 skills (#1153)

## 15 Aug 2026 — 0.53.37 (fix: goal-progress/goal-nudge span home column; drop redundant margin-top (#1111))

59dea9b fix: goal-progress/goal-nudge span the home column; drop redundant margin-top (#1111)

## 15 Aug 2026 — 0.53.36 (fix: festival-banner spans the home column width (#1110))

94d9319 fix: festival-banner spans the home column — width:100% max-width var(--content-max) (#1110)

## 15 Aug 2026 — 0.53.35 (perf: cache streakText.width in NovaScene resize layout (#1105))

64c571b perf: cache streakText width in NovaScene layout (#1105)
62ae75c perf: cache streakText width in NovaScene layout (#1105)

## 15 Aug 2026 — 0.53.34 (perf: drop getBounds layout reads in ShadowGuess/MagnetPoles highlight (#1104))

952e4ce perf: avoid getBounds layout reads in ShadowGuess/MagnetPoles highlight (#1104)
0aba7e5 perf: avoid getBounds layout reads in ShadowGuess/MagnetPoles highlight (#1104)

## 15 Aug 2026 — 0.53.33 (perf: measure ReadStory word chips on shared canvas ctx (#1103))

7384d08 perf: measure ReadStory word chips with shared canvas context (#1103)
e8003b1 perf: measure ReadStory word chips with shared canvas context (#1103)

## 15 Aug 2026 — 0.53.32 (perf: rAF-debounce RotateOverlay resize reads (#1106))

b1462b6 Merge branch 'nv-1106': rAF-debounce RotateOverlay resize reads (#1106)
e333f51 perf: rAF-debounce RotateOverlay resize reads (#1106)

## 15 Aug 2026 — 0.53.31 (perf: measure RhymeTime chip widths on a shared canvas context — no more hidden Phaser Text objects per word per layout (#1102))

c2a0e71 Merge branch 'nv-1102': measure RhymeTime chips with shared canvas context (#1102)
0c99e6f Perf: measure RhymeTime chips with shared canvas context (#1102)

## 15 Aug 2026 — 0.53.30 (perf: pre-read viewport for BnNumbers grid — gridLayout takes width/height params, caches per level, single scale+SAB read per resize (#1101))

89e81a2 Merge branch 'nv-1101': pre-read viewport for BnNumbers grid layout (#1101)
4a8d315 perf(kid): pre-read viewport for BnNumbers grid layout (#1101)

## 15 Aug 2026 — 0.53.29 (perf: batch safe-area reads in BnNumbers layout — single SAB() before all setPosition writes (#1100))

f1412d3 Merge branch 'nv-1100': batch SAB() reads in BnNumbersScene layout (#1100)
bd330d0 fix(kid): batch SAB() reads in BnNumbersScene layout (#1100)

## 15 Aug 2026 — 0.53.28 (perf: cache safe-area insets — SAB/SAT no longer force a getComputedStyle reflow on every call, refreshed only on resize/orientationchange (#1099))

e589ca0 Merge branch 'nv-1099': cache safe-area insets (#1099)
1cd07d2 🎯 perf: cache safe-area insets instead of forced reflow per call (#1099)

## 15 Aug 2026 — 0.53.27 (world-map road + journey spine gutter now scale with --node-gutter clamp(42px,9.5%,54px) so connectors clear badges on wide columns (#1097))

efd8661 Merge branch 'nv-1097': scale map/journey route gutter with --node-gutter (#1097)
3171131 🎨 map/journey: scale route gutter with --node-gutter (#1097)

## 15 Aug 2026 — 0.53.26 (confetti/birthday fall now keyed to container height — no more fixed 108vh/190px overshoot on tall cards (#1098))

8089802 Merge branch 'nv-1098': tie confetti/bday fall to container height (#1098)
2da4ad2 🎉 kid: tie confetti/bday fall to container height via container queries (#1098)
f7969dd 🗑 Nova: remove obsolete DOM-owl CSS (230x215 fixed stage) — Phaser NovaScene already scales 0.6→1.22 by viewport (#1096)

## 15 Aug 2026 — 0.53.25 (play-top: kid chip + right control cluster always share one row — shrink cluster under 400px, cap chip at 52%, nowrap so long names ellipsize instead of wrapping (#1095))

05e03ac 🎨 play-top: single-row guarantee — chip + right cluster never wrap (#1095)

## 15 Aug 2026 — 0.53.24 (HUD: world label keeps usable width on narrow phones; skill pill drops under 360px (#1094))

59c9d5c 🛠 HUD: world label collapses to 14px sliver on narrow phones; give it a usable width (#1094)

## 15 Aug 2026 — 0.53.23 (tapChoice: band-clamp grid to screen — no off-screen cards on short phones (#1093))

a73c1e8 🛠 tapChoice: band-clamp grid to screen — no off-screen cards on short phones (#1093)

## 15 Aug 2026 — 0.53.22 (responsive: tablet layout tier — worlds 2-up grid + denser badge/ach/trophy grids (#1091))

945eb2d 💻 responsive: tablet layout tier — worlds 2-up, denser book grids (#1091)

## 15 Aug 2026 — 0.53.21 (responsive: primary columns scale clamp(440px,92vw,680px) for foldables/tablets (#1090))

5151b9a 💻 responsive: scale primary columns to 680px on large screens (#1090)

## 15 Aug 2026 — 0.53.20 (🧹 #1086 shared hintWrongLocal: 4 addition-fact scenes now import one hint-renderer from hints.ts instead of 4 verbatim copies)

c2123bf 🧹 #1086: extract the byte-identical hintWrongLocal tile-reveal helper into hints.ts — FactsAdd/SubFacts/Doubles/MakeTen now import one shared hint-renderer (BalloonPop left as-is: it's a drifting-balloon arcade, not a tile drill — the issue's 'all 5' premise was false)

## 14 Aug 2026 — 0.53.19 (🐛 #1085 ShapeCatcherScene is skill-aware: en-shapes teaches the English label (forced en voice) even in bn UI; math shapes keeps localized recognition — no more 'ট্যাপ করো circle!' mixing)

95c7a9d 🐛 #1085: ShapeCatcherScene differentiates by skill — en-shapes (c1-english-3) now prompts+speaks the ENGLISH shape label (forced en voice) even in a bn UI; math shapes (c1-math-3) keeps localized recognition and no longer mixes 'ট্যাপ করো circle!'

## 14 Aug 2026 — 0.53.18 (🐛 #1118 voice-dl-banner: constrained to the 440px home column (was a shrink-wrapped 224px pill) + animated entry — one-time first-run voice-download mount no longer reflows the Play button)

116702c 🐛 #1118: voice-dl-banner constrained to the home column (width:100%, max-width:var(--home-col-w)) + animated entry — aligns with hero/play cards and softens the one-time first-run reflow

## 14 Aug 2026 — 0.53.17 (🐛 #1117 home-streak badge: poke capped at 10px inside the 14px owl→greeting gap — flame badge never collides with greeting text at any width (even with the freeze pill))

7ef569f 🐛 #1117: .home-streak poke capped at 10px (was -16px) — badge stays inside the 14px owl→greeting gap so the flame never collides with greeting text (incl. the wider freeze-pill variant) at any width

## 14 Aug 2026 — 0.53.16 (🐛 #1116 home-node z-index:4 keeps the 'you are here' avatar ring above season particles (z-index:3) — snow/leaves/fireflies never cover the path marker)

c22877d 🐛 #1116: .home-node gets position:relative + z-index:4 — the 'you are here' avatar ring stays above season particles (z-index:3), never visually covered by snow/leaves/fireflies

## 14 Aug 2026 — 0.53.15 (🐛 #1115 home screen bottom offset: single safe-area calc (16px + env()) instead of app-safe-area + 28px double-stack — quest lands above the fold on short notched phones)

6e46890 🐛 #1115: home screen single bottom offset — .app:has(.play-screen) drops its safe-area pad, .play-screen owns a bottom-inclusive calc(16px + env(safe-area-inset-bottom)); kills the 34px+28px double-stack that pushed the quest below the fold

## 14 Aug 2026 — 0.53.14 (🐛 #1114 cal-strip: container-query-scaled tile stack (top/coin/gap) + nowrap — 7-column calendar stays square at every width, 🪙{n} no longer wraps on narrow phones)

f77d0b4 🐛 #1114: cal-strip tiles stay square at every width — container-query-scaled top/coin/gap + nowrap stop 🪙{n} from wrapping and inflating tile height on narrow phones

## 14 Aug 2026 — 0.53.13 (🎨 #1112 home column tokens: --home-col-w/--home-card-w make the 440px primary / 320px inset-card gutter system explicit + self-documenting)

850763d 🎨 #1112: home column tokens (--home-col-w 440 / --home-card-w 320) make the two-column home gutter system explicit + self-documenting

## 14 Aug 2026 — 0.53.12 (⚡ #1128 QR scanner: native BarcodeDetector + downscaled jsQR at ~4fps)

dcd3fa2 ⚡ #1128 QR scanner: native BarcodeDetector + downscaled jsQR at ~4fps

## 14 Aug 2026 — 0.53.11 (⚡ #1127 onRoundDone: O(1) streak/wrongs tail ref — no 3× events scans per round)

879b2f1 🔤 #1386-#1390 Bangla font: Noto Sans Bengali + real weight faces + fix letter/line-spacing
bd35e26 📦 fonts: commit Noto Sans Bengali 800/900 (rest of the boot.css stack)
0b009a2 📦 fonts: commit Noto Sans Bengali 500/600/700 (referenced by boot.css font stack)
6c2d199 ⚡ #1127 onRoundDone: O(1) streak/wrongs from a maintained tail ref

## 14 Aug 2026 — 0.53.10 (⚡ #1126 todayIso cache + quest/calendar useShallow — no per-tick Date build or object churn)

5963ead ⚡ #1126 todayIso/dayIsoAgo: cached local-day Date + selectors use todayOnce/useShallow

## 14 Aug 2026 — 0.53.9 (⚡ #1125 startChallenge: per-kid mastery stats cached — no skills scan per tap)

8d1672a ⚡ #1125 startChallenge: per-kid mastery stats folded once per skills ref

## 14 Aug 2026 — 0.53.8 (⚡ #1124 parent heatmap: mistakes ledger pre-aggregated once (not per panel render))

59db282 ⚡ #1124 parent heatmap: pre-aggregate mistakes ledger once, not per render

## 14 Aug 2026 — 0.53.7 (⚡ #1123 moniPlanFor: cached plan — one 305-map fold per step, not per call)

14c52ea ⚡ #1123 moniPlanFor: cache the plan on (kidId, store refs, 60s bucket)

## 14 Aug 2026 — 0.53.6 (⚡ #1122 journey: cache journeyStops + memoized journey derivations — no catalog re-filter per render)

bbef1b8 ⚡ #1122 journey: cache journeyStops list + memoize render-site derivations

## 14 Aug 2026 — 0.53.5 (⚡ worldProgress: per-band unit index — one pass over that band's units (#1121))

1c7242e ⚡ #1121 worldProgress: per-band unit index — one pass over that band's units

## 14 Aug 2026 — 0.53.4 (⚡ totalMastered: cache 305-skill catalog as unit groups — no more re-filter per render (#1120))

37ca580 ⚡ #1120 totalMastered: cache the 305-skill catalog as unit groups

## 14 Aug 2026 — 0.53.3 (📱 mobile-responsive: kill horizontal overflow, screens no longer scroll sideways)

ad007e6 📱 mobile-responsive: kill horizontal overflow so screens can't scroll sideways

## 14 Aug 2026 — 0.53.2 (🐛 kill RESIZE layout thrash — coalesce once/frame + size-skip (#1108))

d1cfd99 🐛 #1108 kill RESIZE layout thrash (coalesce once/frame + size-skip)

## 14 Aug 2026 — 0.53.1 (🐛 fix global-scale RESIZE listener leak (151 sites) — no memory growth across 50 rounds (#352))

1c77bd9 🐛 #352 fix global-scale RESIZE listener leak (151 sites)

## 14 Aug 2026 — 0.53.0 (perf: warm the engine chunk at home idle so the first game opens instantly (#357))

1c0f4da perf(scene-preload): warm the engine chunk at home idle for instant first-play (#357)

## 14 Aug 2026 — 0.52.0 (polish: friendly loading copy on every spinner (screen + engine boot) + full state audit (#346))

fe957ca feat(polish): friendly loading copy on every spinner + state audit (#346)

## 14 Aug 2026 — 0.51.0 (curriculum strand-gaps: band-4 BGS civic facts, band-3 matra-words, band-5 ICT/sci/EN comprehension, bands 6-7 English+science (sentences & paragraphs, human body) (#756 #757 #758 #759 #760 #761))

a1ff82a feat(curriculum): close #756 #757 #758 #759 #760 #761 — BGS/sci/ICT/EN strand gaps

## 14 Aug 2026 — 0.50.0 (9 new pet mini-games: Dance, Nova Says, Pet Walk, Egg Hatch, Species Gallery, Dress-up, Pet Birthday, Photo Booth, Sleep & Wake (#598 #603 #607 #608 #609 #610 #613 #615 #616))

f61551d feat(pet): 9 new Nova mini-games — Dance, Nova Says, Pet Walk, Egg Hatch, Species Gallery, Dress-up, Pet Birthday, Photo Booth, Sleep & Wake (#104 #598 #603 #607 #608 #609 #610 #613 #615 #616)

## 14 Aug 2026 — 0.49.0 (skip-count step ladder +2/+5/+10 per band (#1273))

11f8d86 feat(skip-count): step ladder +2/+5/+10 per band (#1273)

## 14 Aug 2026 — 0.48.0 (animal homes: babies round — match baby to adult, alternating with homes (#1276))

276220e feat(animal): babies round — match baby to adult, alternating with homes (#1276)

## 14 Aug 2026 — 0.47.0 (sight words: full Fry 2nd-100 pool for level 2 (#1258))

514de7f feat(sight-words): full Fry 2nd-100 pool for level 2 (#1258)

## 14 Aug 2026 — 0.46.0 (neural-voice retry + honest no-Bn line; pooled CompareScene cards (#1318 #1319 #1324))

49445dd feat(voice+pooling): neural-voice retry & honest no-Bn line; pooled CompareScene cards (#1318 #1319 #1324)

## 14 Aug 2026 — 0.45.1 (fix: stable SW-update snapshot (blank-screen #185 regression from 0.45.0))

f1dd977 fix(pwa): stable useSyncExternalStore snapshot in updateBanner bridge

## 14 Aug 2026 — 0.45.0 (PWA prompt-mode update banner with version notes (#1321))

01c3ee7 feat(pwa): prompt-mode update banner with version notes (#1321)

## 14 Aug 2026 — 0.44.1 (bundle gate: enforce #1316 main-JS <1.5MB gz wire budget in CI + oracle)

56393cf 📦 bundle gate: enforce the #1316 'main JS < 1.5MB gz' wire budget

## 14 Aug 2026 — 0.44.0 (retention hooks: quest+calendar in Nova #765, affection decay+best friend #766, cap-full come-back #767, freeze visibility #768, garden teaser #769, newgame quest hint #770)

1ce65f6 🎯 retention hooks: quest/calendar in Nova, care decay + best friend, cap waiting, freeze visibility, garden teaser, newgame hint

## 14 Aug 2026 — 0.43.0 (deferred print cluster: parent-panel practice worksheet generator + printable flashcard QR deck (offline print-to-PDF))

448358b 🖨️ deferred print cluster: worksheet generator #1338 + flashcard QR deck #1345

## 14 Aug 2026 — 0.42.13 (post-mastery challenge replay: mastered expert skills get top-rung timed replay + sharp-streak reward (#1129-#1137))

e2002f9 🎯 post-mastery challenge replay #1129-#1137: mastered expert skills re-enter at top rung with timed no-hint flag + escalating sharp-streak reward

## 14 Aug 2026 — 0.42.12 (older-kid challenge mode: band 6-7 independent + timed rounds (#1158 #1165 #1166))

771e776 🎯 older-kid challenge mode #1158 #1165 #1166: band 6-7 independent + timed rounds

## 14 Aug 2026 — 0.42.11 (data-overlap #1167-#1176: per-skill dataLevels ranges + band-pair game reuse fixes)

74edc2a 🎯 #1170 band-pair skills carry own dataLevels range
5e72afa 🎛️ DATA MODE SELECTOR #1169: scene variants are data, not magic
507722f 🏛️ BGS FACTS BANK MERGE #1174: one fact pool + canonical heritage spellings
f67ad39 🔠 SIGHT WORD BANK #1175: shared pools + cross-bank overlap lint
1f9b092 🐫 SORT SHARED BASE #1173: festival + weather join BinSortScene
11c249b 📚 shared word banks: CVC/Bangla-kid/Bangla-number/English-alphabet single-source modules (#1167 #1168 #1171 #1172 #1176)

## 14 Aug 2026 — 0.42.10 (reward-overlap: care paws vs learning coins, quality-tier challenge rewards, type-scaled quests (#1189 #1191 #1192 #1194 #1195 #1196))

b09879c 🪙 reward-overlap cluster: care paws vs learning coins, quality-tier challenge rewards (#1189 #1191 #1192 #1194 #1195 #1196)

## 14 Aug 2026 — 0.42.9 (10 scene UX fixes for pre-readers (#1236-#1245))

c3dacf8 💻 UX/cognitive-load: 10 scene fixes for pre-readers (#1236-#1245)

## 14 Aug 2026 — 0.42.8 (skill families: overlapping ids collapse into one-concept tiers (#1207-#1216))

9ae015e 🏷️ skill families: collapse overlapping skill ids into one-concept tiers (#1207-#1216)

## 14 Aug 2026 — 0.42.7 (kids-facing: uniform reward surfacing — combo streak chip floats on every shared-celebrate scene, correctCelebrate added to OddEven/NumberBonds/AddSub100/DivisionFacts/BgsFacts, garden tap bursts, column-math core extracted pure (#1199 #1200 #1201 #1202 #1203 #1204 #1205))

5297681 🎉 scene-complexity-balance: uniform reward surfacing — streak chip in the shared celebrate path + correctCelebrate on 6 previously-silent scenes, column-math core extracted (#1199 #1200 #1201 #1202 #1203 #1204 #1205)
e242f8f 🦉 oracle: read CSS across the split styles/*.css sheets (boot+screens) via kid_css() helper — #1177 split broke the single styles.css reads

## 14 Aug 2026 — 0.42.6 (perf: split 189KB global CSS — boot sheet (splash+base) is the only sync CSS (~13KB), screen CSS rides the lazy App chunk during the splash window (#1177))

6ebad3d 🚀 render-blocking: split 189KB global CSS — boot sheet (splash+base, 13KB) is the only sync CSS; screen CSS rides the lazy App chunk (#1177)

## 14 Aug 2026 — 0.42.5 (render-blocking: lazy HomeScreen/AddKidForm/Nova3DHome chunks, memoized badge/achievement/trophy/box derivations, readiness-based + tap-to-dismiss splash, engine-boot spinner + retry, nova3d Suspense fallback)

c583d9a 🚀 render-blocking: lazy HomeScreen/AddKidForm/Nova3DHome chunks (App 517k→417k), memoize badge/achievement/trophy/box derivations, splash is readiness-based + tap-to-dismiss, engine boot shows spinner + tap-to-retry, nova3d lazy Suspense fallback (#1182 #1183 #1185 #1186 #1178)

## 14 Aug 2026 — 0.42.4 (offline-first: SW answers /api at the network boundary (cached GET replay + 503 queue) — no sync request escapes the cache offline)

eb0516d 🔧 SW lifecycle flags survive minify (object-literal wrappers for skipWaiting/clientsClaim/cleanupOutdatedCaches); oracle live-stamp check reads the lazy App chunk (#1217 split)
da63399 🔌 offline-first: SW is the /api network boundary — never-reject handler (cached GET replay + 503 queue) so no sync request escapes the cache offline; validateParentSession only logs out on 401/403; navigator.onLine fast-path gates (#264)
33ad78c 🔧 release smoke: serve App chunk from /assets/ (index.js's relative import resolves there — fixes the 0.42.3 false-fail)
a0c5802 🔧 release smoke: grep the lazy App chunk for the version stamp (#1217 split moved APP_VERSION out of index.js — 0.42.3's good deploy was falsely rolled back)

## 14 Aug 2026 — 0.42.3 (startup: lazy App chunk, splash-first, Phaser off boot graph, deferred SW+rehydrate, safe reads, planned-locale tree-shake)

09ff392 🚀 startup-blocking cluster: lazy App chunk (splash-first paint), Phaser off boot graph via vendor-cjs helper split, deferred SW + store rehydrate, safe readLS boot reads, single-parse loadKids/settings/playtime, planned-locale tree-shake (#1217-#1226)

## 14 Aug 2026 — 0.42.3 (🚀 Startup-blocking: lazy App chunk, splash-first paint, Phaser/three off the boot graph, deferred SW + rehydrate, safe reads, single-parse boot, planned-locale tree-shake)

The v36 startup-blocking cluster — cold start now paints the splash with a ~186KB boot
path and NO Phaser/three.js/App in its dependency graph; the heavy App graph code-splits
behind the lazy chunk and resolves DURING the splash window:

- **#1217 first paint is no longer gated by the whole App graph** — `main.tsx` is now
  lean (splash + Icon + rotate guard only); `<App/>` is `React.lazy` inside Suspense,
  with a `BootErrorBoundary` fallback. Verified: first-paint at ~20–56ms, boot batch =
  `index.js` + `index.css` + a 236-byte CJS-helper chunk only; App/Phaser/three/SW all
  fetch AFTER first paint (during the 1.7s splash window).
- **Phaser (1.4MB) removed from the boot graph** — Rollup had hosted the shared
  CommonJS default-export interop helper inside `phaser-vendor`, so the boot chunk
  statically imported it (the whole engine had to download+eval before the splash).
  The helper now lives in its own `vendor-cjs` chunk; phaser-vendor is reachable ONLY
  through the lazy App chunk.
- **#1225 SW registration deferred** — `registerSW` no longer runs at module top-level;
  it's dynamically imported from the splash's mount effect (post-paint).
- **#1226 store hydration deferred** — `nv_store_v1` persist now uses `skipHydration`;
  App rehydrates in a first-paint effect and gates the outbox drains on it, so a power
  user's large blob never holds up the App-chunk eval.
- **#1218/#1221/#1222 single-parse boot** — `loadKids()` memoized (one parse, 3 boot
  callers; writers invalidate), `cachedKidSettings` computed once per render, `todayMinutes`
  read once and shared by the cap + goal.
- **#1219/#1220 guarded boot reads** — new central `readLS()` (null on exception) wraps
  every boot-path `localStorage.getItem` (welcome/kid/lang/tour); a11y initializes to a
  static default and hydrates in its effect — private-browsing/storage-denied can't abort
  first render.
- **#1224 planned locales tree-shaken + deferred lang read** — core's `LOCALES` now ships
  only en/bn; the ar/hi scaffolds moved to `locale-planned.ts` (0 bytes reach the kid
  bundle — verified). `game/locale.ts` no longer reads `nv_lang` at module top-level.
- **#1223 i18n** — the full EN+BN table no longer evaluates before first paint (it lives
  inside the lazy App chunk; measured eval is <5ms, fully hidden by the splash window —
  a further EN/BN split into on-demand modules was scoped and judged net-negative risk
  for the remaining hidden cost).

## 14 Aug 2026 — 0.42.2 (⚡ Voice-cache: in-memory LRU ledger, readonly cache reads, debounced synth meter, IDB schema-drift guard)

1462c3f fix: silent onblocked fallback (no console.warn — audit forbids debug logging in shipped code)
0dae649 ⚡ voice-cache storage-blocking: in-memory LRU ledger (no per-store getAll), readonly cache reads, debounced synth meter, IDB schema-drift guard, skip redundant settings writes (#1232 #1234 #1233 #1235 #1231)

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

