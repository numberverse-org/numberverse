#!/usr/bin/env python3
"""Generate the next ~100 Numberverse backlog issues (oracle-driven roadmap).

Each entry: (milestone, priority, labels, title, body).
Filenames the issues via `gh issue create`; mirrors into docs/ROADMAP_NEXT.md.
Idempotent-ish: skips issues whose title already exists on the repo.
"""
import subprocess, json, sys, re

REPO = "numberverse-org/numberverse"

# existing open issue titles (skip if present)
def existing_titles():
    out = subprocess.run(
        ["gh", "issue", "list", "--repo", REPO, "--state", "all", "--limit", "400",
         "--json", "title"],
        capture_output=True, text=True)
    try:
        return {t["title"] for t in json.loads(out.stdout)}
    except Exception:
        return set()

EX = existing_titles()

def B(goal, *done):
    parts = [f"## Goal\n{goal}\n", "## Done when"]
    parts += [f"- [ ] {d}" for d in done]
    return "\n".join(parts)

# milestone -> (priority, labels, title, body)
ROADMAP = [
# ── v18 — content wave 2 ─────────────────────────────
("v18 — content wave 2", "medium", ["kid-first"], "Bangla: three-digit numbers 100–1000 (place value to hundreds)",
 B("A band-2/3 Bangla math game teaching three-digit numbers with hundreds/tens/ones place value (হাজার নয়, শতক পর্যন্ত)।",
   "Kid builds a target number 100–999 with 100/10/1 blocks", "Tens/ones idea extends to hundreds", "Spoken in Bangla (শতক/দশক/একক)", "EN + BN translations, i18n audit clean")),
("v18 — content wave 2", "medium", ["kid-first"], "Bangla: opposites (বিপরীত শব্দ) matching game",
 B("A band-2 Bangla vocabulary game matching opposite words (বড়–ছোট, উঁচু–নিচু)।",
   "20+ pairs across kid-relevant categories", "Picture-backed cards, tap-to-match", "Speaks both words aloud", "EN + BN i18n")),
("v18 — content wave 2", "low", ["kid-first"], "Bangla: conjunct letters (যুক্তাক্ষর) — ক্ষ, ঞ্জ, ঙ্ক etc.",
 B("A band-3 Bangla reading game practicing conjunct letters in real words.",
   "Curated word list with common conjuncts", "Tap the correct conjunct / word", "Works offline, speaks the word", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Bangla: days & months (সপ্তাহের দিন, মাসের নাম) order game",
 B("A band-1/2 game ordering the 7 days and 12 Bangla months.",
   "Drag/order day and month cards", "Bangla names spoken on select", "Progress bar + round scoring", "i18n clean")),
("v18 — content wave 2", "medium", ["kid-first"], "Bangla: spelling (বানান) — common 2-3 letter words",
 B("A band-1/2 spelling game: hear a word, build it from letter tiles.",
   "Curated 20+ kid words (আম, কলা, মা, বই…)", "Letter tiles tap-in-order", "Hear word on every round", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Bangla: advanced matras (ে/ো/ৈ/ৌ) tap game",
 B("Extends the existing matra game to the harder ে/ো/ৈ/ৌ with full-word context.",
   "Words chosen so the matra changes meaning", "Tap the matra on the word", "Speaks word + letter", "i18n clean")),
("v18 — content wave 2", "medium", ["kid-first"], "Bangla: simple sentence → picture match",
 B("A band-2 reading game: read a 3-5 word Bangla sentence, tap the matching picture.",
   "20+ sentences with clear pictures", "Read aloud on tap", "Wrong taps get escalating hints", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Bangla: nursery rhyme tap-along (ছড়া)",
 B("Band-1 recitation: Nova sings a short rhyme, kid taps along word-by-word.",
   "2-3 short NCTB rhymes", "Tap-along highlight + score", "Warm spoken Bangla", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Bangla: pronouns (সর্বনাম) fill-in",
 B("A band-3 grammar game choosing the right pronoun (আমি, তুমি, সে…) in a sentence.",
   "10+ sentence slots", "Picture hints for who is speaking", "Speaks full sentence after answer", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Bangla: count back from 100 (উল্টো গোনা)",
 B("A band-2 counting game counting DOWN from 100 by 1s (and later by 10s/5s).",
   "Rocket/blast-off theme to make it fun", "Tap sequence correct", "Speaks each number", "i18n clean")),

("v18 — content wave 2", "medium", ["kid-first"], "English: long-vowel teams (ee/ea/ai/ay/oa/ow) phonics",
 B("A band-2 phonics game for long vowel teams, the natural next step after digraphs.",
   "Word families per vowel team", "Hear word, pick spelling / pick word", "Escalating hints on misses", "i18n clean")),
("v18 — content wave 2", "medium", ["kid-first"], "English: CVC word builder (drag letters)",
 B("A band-1 phonics game: see/hear a CVC picture, drag the 3 letters to spell it.",
   "20+ CVC pictures", "Letter drag with snap zones", "Speaks the word on success", "i18n clean")),
("v18 — content wave 2", "medium", ["kid-first"], "English: sight words level 2 (next 100)",
 B("Extends sight-words to the second 100 most common words with the same game.",
   "All 100 words with picture context where possible", "Tap-the-word + read-it modes", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "English: plurals -s/-es/-ies",
 B("A band-2 grammar game: see a singular picture, tap the correct plural.",
   "Rule groups taught with a quick demo", "Words spoken", "Hints on wrong taps", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "English: regular past tense (-ed)",
 B("A band-3 grammar game: choose the correct -ed form in a sentence.",
   "Common verbs (play→played, jump→jumped)", "Sentence read aloud", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "English: sentence reading comprehension (3-5 words)",
 B("A band-2 reading game: read a short sentence, answer a who/what question.",
   "10+ sentences with picture answers", "Read-aloud toggle", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "English: uppercase ↔ lowercase match",
 B("A band-1 game matching capital letters to lowercase.",
   "26 pairs, shuffled", "Tap-to-match + speak letter name", "i18n clean")),

("v18 — content wave 2", "high", ["kid-first"], "Math: multiplication tables 2–10",
 B("A band-3 drill teaching the times tables 2×…10× with concrete arrays first.",
   "Arrays → number mode", "Answer buttons, escalating hints", "Difficulty ramps per skill", "i18n clean")),
("v18 — content wave 2", "high", ["kid-first"], "Math: division facts (fair shares)",
 B("A band-3 division drill taught via fair-sharing (12 ÷ 3 = share 12 into 3).",
   "Sharing animation → number mode", "Answer buttons, hints", "i18n clean")),
("v18 — content wave 2", "medium", ["kid-first"], "Math: 3-digit add/sub with regrouping",
 B("A band-3 written-method game for 3-digit addition/subtraction with carrying/borrowing.",
   "Step-by-step regrouping scaffolding", "Worked demo first (teach)", "i18n clean")),
("v18 — content wave 2", "medium", ["kid-first"], "Math: place value to 9999",
 B("A band-3 game for thousands/hundreds/tens/ones place value (extends the 100 rods idea).",
   "Build + read 4-digit numbers", "Spoken in Bangla too", "i18n clean")),
("v18 — content wave 2", "medium", ["kid-first"], "Math: compare & order fractions",
 B("A band-3 fraction game comparing and ordering unit + simple fractions.",
   "Visual pizza/bars backing each compare", "Greater/smaller tap game", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Math: 2D shapes — sides & corners",
 B("A band-2/3 geometry game: identify shapes by side/corner counts.",
   "Triangle/square/rectangle/circle + more", "Count-and-tap with visual aid", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Math: measurement — length, weight, capacity",
 B("A band-3 hands-on game comparing cm/m, kg/g, L/mL.",
   "Balance/scale visuals", "Tap the heavier/longer/more", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Math: clock to 5 minutes (analog + digital)",
 B("Extends the clock game beyond o'clock/half to 5-minute precision.",
   "Analog ↔ digital match", "Spoken times", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Math: pictographs (data handling)",
 B("A band-3 data game reading pictographs (one picture = 2, 5, 10).",
   "3-4 kid-friendly charts", "How-many questions", "i18n clean")),
("v18 — content wave 2", "medium", ["kid-first"], "Math: money change combos (৳2/৳5/৳10/৳20)",
 B("Extends Taka Tap: pay an exact amount with the fewest notes/coins combo.",
   "Fewest-notes lesson + free mode", "Bangla note names spoken", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Math: skip counting patterns (+2, +5, +10)",
 B("A band-2 pattern game continuing number sequences.",
   "Visual number line", "Tap the next number", "i18n clean")),

("v18 — content wave 2", "medium", ["kid-first"], "Science: living vs non-living sort",
 B("A band-1/2 science game sorting pictures into living/non-living.",
   "Clear picture cards", "Sort with immediate feedback", "Speaks the words in Bangla+EN", "i18n clean")),
("v18 — content wave 2", "medium", ["kid-first"], "Science: plants — parts & needs",
 B("A band-2 science game: label plant parts and pick what a plant needs to grow.",
   "Tap-the-part + need sorting", "Seed→flower growth visual", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Science: animal homes & babies",
 B("A band-1 science game matching animals to their homes and babies.",
   "10+ animals (tiger, cow, chicken…)", "Match + speak", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Science: five senses",
 B("A band-1 senses game: which sense do we use for a sound/smell/picture.",
   "5 senses with kid visuals", "Tap the right sense", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Science: food sources — plant or animal",
 B("A band-2 science game sorting foods by where they come from.",
   "20+ food cards", "Sort with feedback", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Science: materials — wood, metal, plastic, glass",
 B("A band-2 science game sorting everyday objects by material.",
   "Household-object pictures", "Sort + speak material names", "i18n clean")),

("v18 — content wave 2", "low", ["kid-first"], "ICT: computer parts & safe offline habits",
 B("A band-3 digital-literacy game teaching computer parts and safe, offline-first habits.",
   "Tap-the-part + safe/unsafe scenario sort", "No network features", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Social: family & community helpers",
 B("A band-1 social game naming family members and community helpers (দোকানদার, ডাক্তার, শিক্ষক…).",
   "Picture cards with Bangla+EN", "Tap the helper by role", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Social: Bangladesh national symbols",
 B("A band-2 civic game teaching the flag, national bird (দোয়েল), fish (ইলিশ), flower (শাপলা), animal (বাঘ)।",
   "Symbol picture cards", "Speaks names in Bangla", "i18n clean")),
("v18 — content wave 2", "low", ["kid-first"], "Values: good habits & hygiene",
 B("A band-1 habits game sorting good/healthy habits (brushing, washing hands, sharing).",
   "Simple scenario cards", "Gentle feedback, no shaming", "i18n clean")),

# ── v19 — parent power 2 ─────────────────────────────
("v19 — parent power 2", "high", ["parent-facing"], "Parent panel: per-day wrong-answer history per kid",
 B("Shows each kid's wrong answers per skill/day so parents see exactly what's being re-taught.",
   "Calendar heatmap of wrongs per day", "Drill-down to skill + wrong count", "Uses the existing mistakes ledger", "Works offline, no analytics")),
("v19 — parent power 2", "medium", ["parent-facing"], "Parent panel: mastery timeline",
 B("A timeline showing when each skill was mastered (from ledger mastery events).",
   "Per-kid timeline", "Badge/check icons", "Offline-friendly")),
("v19 — parent power 2", "medium", ["parent-facing"], "Parent: per-kid daily goal (minutes/rounds) + gentle nudge",
 B("Parent sets a daily play goal; Nova gently encourages without hard-locking (no ad-style pressure).",
   "Goal setting per kid", "Gentle in-app nudge at goal", "Respects playtime caps")),
("v19 — parent power 2", "medium", ["parent-facing"], "Parent: curriculum band focus override",
 B("Let parents pin a band/curriculum focus so the journey prioritizes those skills.",
   "Focus setting per kid", "sessionForWorld respects it", "Clear default = recommended")),
("v19 — parent power 2", "low", ["parent-facing"], "Parent: voice preference per kid",
 B("Per-kid voice gender/speed choice surfaced in the parent panel.",
   "Voice + speed selectors", "Try-voice button", "Stored per kid")),
("v19 — parent power 2", "low", ["parent-facing"], "Parent: kid profile avatar/photo management",
 B("Let parents pick/upload an avatar per kid and manage names.",
   "Avatar gallery + optional upload", "Stored locally/offline-first")),
("v19 — parent power 2", "low", ["parent-facing"], "Parent: on-demand weekly digest",
 B("A one-tap weekly summary card (skills learned, minutes, streak) parents can open anytime.",
   "Reuses share-card data", "Offline-generated")),
("v19 — parent power 2", "low", ["parent-facing"], "Parent: offline sync indicator + manual sync",
 B("Shows last-sync state and lets parents push progress when a network appears.",
   "Sync status chip", "Manual sync button", "No analytics, own-API only")),
("v19 — parent power 2", "high", ["parent-facing"], "Parent: PIN lock to enter parent area",
 B("A simple PIN/pattern gate so kids can't wander into parent settings.",
   "Set/changed PIN flow", "Wrong-PIN feedback", "Recovery hint for parents")),
("v19 — parent power 2", "low", ["parent-facing"], "Parent: bedtime quiet mode",
 B("After a parent-set bedtime, gameplay is gentle/quiet (muted volume + soft light, not blocked).",
   "Per-kid bedtime window", "Auto quiet-mode toggle")),
("v19 — parent power 2", "low", ["parent-facing"], "Parent: skip-ahead for advanced kids",
 B("Let parents jump a kid to a higher band or unlock a specific skill early.",
   "Explicit parent-only action", "Confirmation dialog", "Logged to ledger")),
("v19 — parent power 2", "medium", ["parent-facing"], "Parent: see exact questions each kid missed",
 B("From the ledger, show the missed questions per skill so re-teaching is transparent.",
   "Per-skill missed-question list", "Linked to reteach state", "Offline-first")),

# ── v20 — trust & safety ─────────────────────────────
("v20 — trust & safety", "high", ["guardrail"], "Privacy: data-minimization audit (what's stored + why)",
 B("Document every piece of data stored on-device/API and justify each (no analytics).",
   "Audit doc in docs/", "Every field justified or removed", "Reviewed by oracle Privacy Steward")),
("v20 — trust & safety", "medium", ["guardrail"], "Safety: automated content scan as a CI gate",
 B("Run the oracle's child-safety scan on every PR so no new scene ships unsafe words.",
   "CI job runs scan", "Blocks merge on unsafe hits", "Docs on adding to allowlist")),
("v20 — trust & safety", "high", ["guardrail"], "No-ads: CI scan that no ad/tracker SDK ever lands",
 B("Extend the privacy scan to fail CI if any ad/tracker dependency/endpoint is added.",
   "Dependency + endpoint scan in CI", "Fail-closed", "Clear error message")),
("v20 — trust & safety", "medium", ["guardrail"], "Kid-safe share images: strip kid name/photo metadata",
 B("Ensure generated share PNGs contain no personal data in EXIF/paths.",
   "Exif-cleaning step in PNG writer", "Test PNG has zero identifying metadata")),
("v20 — trust & safety", "low", ["guardrail"], "Encrypted sync payloads (when sync lands)",
 B("Progress sync (future) must encrypt payloads end-to-end with a parent-held key.",
   "Design doc", "Implementation when sync ships")),
("v20 — trust & safety", "medium", ["parent-facing"], "Gentle bedtime enforcement (not blocking)",
 B("After bedtime, the app plays soft/quiet and nudges to stop — never locks or punishes.",
   "Soft overlay + quiet mode", "Parent can override")),
("v20 — trust & safety", "low", ["guardrail"], "API rate-limit + abuse guard",
 B("Rate-limit the own-API endpoints and log abuse without storing kid data.",
   "Per-IP limit", "403 with clear message")),
("v20 — trust & safety", "low", ["parent-facing"], "Local backup/restore (zip) for parents",
 B("## Goal\nOne-tap backup of all kid progress to a local zip parents can keep.\n## Done when\n- [ ] Export zip\n- [ ] Restore from zip\n- [ ] Works fully offline")),
("v20 — trust & safety", "low", ["parent-facing"], "Privacy explainer card for parents",
 B("An in-app card in plain Bangla+EN explaining exactly what is stored and why (no ads, no analytics).",
   "Plain-language copy", "Reviewed by Privacy Steward")),
("v20 — trust & safety", "low", ["guardrail"], "Screen-time accuracy check (ties to playtime reports)",
 B("## Goal\nVerify playtime/wrong-count figures the parent panel shows match ledger reality.\n## Done when\n- [ ] Cross-check test\n- [ ] No drift after long sessions")),

# ── v21 — growth & retention ─────────────────────────
("v21 — growth & retention", "medium", ["kid-first"], "Skill-of-the-week challenge + badge",
 B("Each week one skill is highlighted; completing it earns a collectible badge.",
   "Weekly rotation from recommended skill", "Badge book entry", "Offline-safe")),
("v21 — growth & retention", "low", ["kid-first"], "Nova personality v2 — more reactions & micro-animations",
 B("More Nova faces/animations reacting to wins, streaks, and re-teach moments.",
   "8+ new reactions", "Ties to mastery/streak events")),
("v21 — growth & retention", "low", ["kid-first"], "Daily quest variety: skill-based quests",
 B("Extend the daily quest to sometimes ask for specific skills ('play 2 rounds of Fruit Basket').",
   "Quest templates per skill family", "Reward on completion")),
("v21 — growth & retention", "low", ["kid-first"], "Collectible badge book per land",
 B("A badge album the kid fills by mastering skills in each land.",
   "Badge per skill/land", "Album view on the map")),
("v21 — growth & retention", "low", ["kid-first"], "Pet mini-games with Nova",
 B("Little tap-games with the pet for fun between drills (feed, catch, dance).",
   "2 mini-games", "No ads, purely optional")),
("v21 — growth & retention", "low", ["kid-first"], "Streak freeze tokens",
 B("Kids earn a 'streak freeze' they can spend to protect a streak on an off day.",
   "Token earn/spend flow", "Streak logic respects it")),
("v21 — growth & retention", "low", ["kid-first"], "Per-skill share card: 'Look what I learned!'",
 B("After mastering a skill, a kid can share a card naming that skill (share loop v2).",
   "Reuses PNG renderer", "No personal data in image")),
("v21 — growth & retention", "low", ["parent-facing"], "Parent referral share (offline WhatsApp)",
 B("A parent-only WhatsApp share inviting another family, with no analytics/pixel.",
   "Static share card + link", "No tracking")),
("v21 — growth & retention", "low", ["kid-first"], "Land-unlock celebration fireworks",
 B("When a kid completes a whole band/land, a celebration sequence plays.",
   "Fireworks + confetti + spoken cheer", "Unlock next land on map")),
("v21 — growth & retention", "low", ["kid-first"], "Weekly recap for kid",
 B("A kid-facing 'this week you learned X, Y, Z' card after 7 days.",
   "Summarizes mastered skills", "Spoken summary", "Offline-generated")),

# ── v22 — polish & perf ──────────────────────────────
("v22 — polish & perf", "medium", ["kid-first"], "Split main bundle below 1.5MB (more lazy chunks)",
 B("Continue the async-chunk work: split remaining heavy scenes so main JS < 1.5MB.",
   "Main bundle < 1.5MB gz", "sw.js precache updated", "Audit + oracle bundle check green")),
("v22 — polish & perf", "low", ["kid-first"], "Voice: per-kid gender/speed options",
 B("Expose voice choice (gender/speed) surfaced simply, stored per kid.",
   "2 voice options (warm adult + gentle)", "Speed control", "Works on-device")),
("v22 — polish & perf", "low", ["kid-first"], "Voice: model download progress + retry",
 B("Show progress while the neural voice model downloads with a retry button.",
   "Progress bar on first-run", "Retry + offline fallback")),
("v22 — polish & perf", "low", ["kid-first"], "Voice: graceful fallback to system TTS",
 B("If the neural model is missing, fall back to system TTS instead of silence.",
   "Automatic fallback", "Visible indicator")),
("v22 — polish & perf", "medium", ["guardrail"], "Offline: verify full offline on fresh install",
 B("Prove the app fully works with zero network on a fresh install (no hang, no missing assets).",
   "Test matrix (cold + warm)", "No network calls on launch")),
("v22 — polish & perf", "low", ["kid-first"], "PWA: update banner with version notes",
 B("When a new version is available, show a friendly banner with what changed.",
   "Banner on update", "Version notes source")),
("v22 — polish & perf", "low", ["kid-first"], "PWA: install-prompt timing polish",
 B("Refine when the install prompt appears (after first real play, not on launch).",
   "Trigger after 1 minute of play", "Dismissible permanently")),
("v22 — polish & perf", "medium", ["guardrail"], "Cold start < 2s on mid-range Android",
 B("Measure and hit a sub-2s first-paint on a mid-range Android device.",
   "Baseline measurement", "Optimizations to hit target")),
("v22 — polish & perf", "low", ["kid-first"], "Memory: scene pooling to cut GC jank",
 B("Reuse scene objects (options/containers) instead of recreating each round.",
   "Profiled on low-end phone", "No frame jank during rounds")),
("v22 — polish & perf", "low", ["kid-first"], "Haptics: subtle tap feedback where supported",
 B("Light haptic pulses on correct/wrong taps on devices that support it.",
   "Respects muted/system settings", "Optional off switch")),

# ── v23 — infra & ops ────────────────────────────────
("v23 — infra & ops", "high", ["documentation"], "CI: run oracle_team as a PR gate job",
 B("Add the oracle standup to CI so every PR is judged by the full team before merge.",
   "oracle job in ci.yml", "Blocks merge on ✖", "--no-page mode")),
("v23 — infra & ops", "high", ["documentation"], "CI: post-deploy smoke test (stamp + tokens)",
 B("After release deploy, curl the live domain and assert the new stamp is served.",
   "Smoke step in release pipeline", "Fails loudly with rollback hint")),
("v23 — infra & ops", "medium", ["documentation"], "Postgres backup schedule to box disk",
 B("## Goal\nAutomated daily Postgres dumps with retention on the box.\n## Done when\n- [ ] Daily cron/systemd timer\n- [ ] Retention (e.g. 14 dumps)\n- [ ] Restore drill passes")),
("v23 — infra & ops", "medium", ["documentation"], "Uptime monitor → Telegram alert",
 B("## Goal\nPing the live domain every 5 min; alert via Telegram on downtime.\n## Done when\n- [ ] Monitor loop on box\n- [ ] Telegram alert fires\n- [ ] False-alarm guard")),
("v23 — infra & ops", "low", ["documentation"], "Structured error logging (no analytics)",
 B("## Goal\nApp logs structured errors to a local file for debugging — zero analytics.\n## Done when\n- [ ] Error log writer\n- [ ] Rotation\n- [ ] Privacy review")),
("v23 — infra & ops", "medium", ["documentation"], "Auto-rollback if post-deploy check fails",
 B("## Goal\nIf the smoke check fails after deploy, automatically restore the previous container tag.\n## Done when\n- [ ] Rollback script\n- [ ] Fires on smoke failure\n- [ ] Docs in RELEASING.md")),
("v23 — infra & ops", "low", ["documentation"], "CI secrets hygiene scan",
 B("## Goal\nScan PRs/commits for accidental secret commits and fail CI on hits.\n## Done when\n- [ ] Secret-scan job\n- [ ] Allowlist for false positives")),
("v23 — infra & ops", "low", ["documentation"], "Second cloudflared tunnel failover",
 B("## Goal\nA second named tunnel as failover so a single tunnel outage doesn't drop the domain.\n## Done when\n- [ ] Standby tunnel configured\n- [ ] Failover tested")),
("v23 — infra & ops", "low", ["documentation"], "TLS cert rotation check automation",
 B("## Goal\nAutomated check that the Cloudflare-served cert is valid and near-expiry alerts fire.\n## Done when\n- [ ] Check job\n- [ ] Alert on <14d")),
("v23 — infra & ops", "low", ["documentation"], "RELEASING.md update: mastery-gate + oracle gate notes",
 B("## Goal\nDocument the new v17 mastery-gate flow and the oracle-in-CI gate.\n## Done when\n- [ ] RELEASING.md current\n- [ ] CHANGELOG reflects v17")),
]

# ── Backlog (deferred) ───────────────────────────────
BACKLOG = [
("Backlog", "low", ["deferred"], "AR numbers camera experiment",
 B("Research-only experiment: recognize a number through the camera and play with it.",
   "Tech spike only", "No ads, no network dependency")),
("Backlog", "low", ["deferred"], "Multi-language scaffold (Arabic/Hindi) — research",
 B("Evaluate the i18n cost of adding Arabic/Hindi to the existing EN/BN table.",
   "Spike doc with estimates", "No scope creep")),
("Backlog", "low", ["deferred"], "Printable worksheet generator (offline PDF)",
 B("Parents can generate a printable worksheet PDF from a kid's struggling skills.",
   "PDF renderer", "Struggling-skill picker", "Offline-first")),
("Backlog", "low", ["deferred"], "Screen-reader deep support (VoiceOver/TalkBack)",
 B("Walk the whole app with screen readers and fix focus/labels.",
   "Walkthrough doc", "Critical paths labeled")),
("Backlog", "low", ["deferred"], "Sound design: per-land ambient music + SFX pack",
 B("Distinct, gentle ambient music per land and a richer SFX pack.",
   "5 land themes", "Mute-friendly", "Small file sizes")),
("Backlog", "low", ["deferred"], "Optional parent phone notifications bridge",
 B("If parent account/sync ships, allow optional push notifications for weekly summaries.",
   "Requires sync", "No analytics")),
("Backlog", "low", ["deferred"], "Big-screen / classroom projector mode",
 B("A focused presentation mode for teachers (large type, no parent UI).",
   "Classroom layout", "Keyboard nav optional")),
("Backlog", "low", ["deferred"], "Seasonal events (Eid, Pohela Boishakh) decor",
 B("Gentle seasonal decorations and a themed mini-game for holidays.",
   "Calendar-driven decor", "No purchases/ads")),
("Backlog", "low", ["deferred"], "Kid dictation: record own voice + replay",
 B("Kids record themselves saying numbers/words and replay (privacy: stays on-device).",
   "On-device only", "Parent toggle")),
("Backlog", "low", ["deferred"], "Physical flashcards QR → mini game tie-in",
 B("Print flashcard QR codes that open a matching mini-game (offline-first).",
   "QR generator", "No network required")),
]

def create(ms, pri, labels, title, body):
    if title in EX:
        return None, "exists"
    args = ["gh", "issue", "create", "--repo", REPO,
            "--title", title, "--body", body, "--label", f"priority: {pri}",
            "--label", "feature" if pri not in ("guardrail","documentation","deferred") else ("enhancement" if "deferred" in labels else "feature"),
            "--milestone", ms]
    for l in labels:
        args += ["--label", l]
    r = subprocess.run(args, capture_output=True, text=True)
    url = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else None
    if r.returncode != 0:
        return None, (r.stderr or r.stdout).strip()
    return url, "ok"

def main():
    rows = [(ms, pri, labels, t, b) for (ms, pri, labels, t, b) in ROADMAP]
    for (ms, pri, labels, t, b) in BACKLOG:
        rows.append(("Backlog", pri, labels, t, b))
    created, skipped, errors = [], [], []
    n = len(rows)
    for i, (ms, pri, labels, t, b) in enumerate(rows, 1):
        url, status = create(ms, pri, labels, t, b)
        if url: created.append((t, url))
        elif status == "exists": skipped.append(t)
        else: errors.append((t, status))
        sys.stderr.write(f"\r{i}/{n}  created={len(created)} skipped={len(skipped)} errors={len(errors)}  ")
    sys.stderr.write("\n")
    print(f"TOTAL {n} | created {len(created)} | skipped {len(skipped)} | errors {len(errors)}")
    for t, e in errors: print(f"  ERROR {t}: {e}")

    # write roadmap doc
    md = ["# 🗺️ ROADMAP_NEXT — oracle-driven next 100 features\n",
          "> Generated from the clean 2026-08-12 Oracle standup + Council brief. ",
          "> Each issue is scoped with acceptance criteria and lives on the GitHub board.\n"]
    cur = None
    for (ms, pri, labels, t, b) in rows:
        if ms != cur:
            md.append(f"\n## {ms}\n")
            cur = ms
        md.append(f"- {t}  _(priority: {pri}, {', '.join(labels)})_")
    open("docs/ROADMAP_NEXT.md", "w", encoding="utf-8").write("\n".join(md) + "\n")

if __name__ == "__main__":
    main()
