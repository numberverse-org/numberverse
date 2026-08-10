# 🔢 Numberverse — The Complete User Journey
> Design story · updated 5 Aug 2026

---

## 1. Vision in one line
**Numberverse is the math playground your kid actually wants to open — 5 storybook worlds, 2 to 13, no ads, ever.**

The kid never sees a "math lesson". They see a world map. Each world is a place (a grove, a farm, a river town, a castle, a space academy) and every game in that world secretly teaches a Common Core-aligned skill. Parents see mastery, not minutes.

---

## 2. The two cast members

### 👧 The Player (2–13)
- Doesn't read well (or at all) → **every instruction is visual + spoken, zero text walls**
- Has a tiny attention span → **sessions are 3 quick rounds, ~3 minutes**
- Thinks in taps, not clicks → **everything is a fat, forgiving touch target**
- Lives on a phone handed over by a parent → **portrait-first, works offline**
- Loves progress visible on *them* → stars, badges, a growing garden/kingdom

### 👨👩👧 The Steward (parent)
- Wants "is my kid actually learning?" answered in 5 seconds
- Wants control: no ads, no chat, no data leaks, time-boxed sessions
- Wants a subscription that feels fair (free wedge → one-time family price)

---

## 3. The five worlds (one per age band)

| # | World | Ages | Skills (Common Core) |
|---|-------|------|----------------------|
| 1 | 🌱 Sprout Grove | 2–4 | Count to 10 → 20, recognize shapes (K.CC, K.G) |
| 2 | 🐄 Cottage Fields | 4–6 | Add/subtract within 10, number bonds (1.OA, K.OA) |
| 3 | 🏞️ River Town | 6–8 | Add/subtract within 20, place value (2.OA, 2.NBT) |
| 4 | 🏰 Sky Castle | 8–10 | Multiplication/division facts, fractions (3.OA, 3.NF) |
| 5 | 🚀 Star Academy | 10–13 | Multi-digit operations, ratios, integers (4–6) |

**Wedge:** launch with worlds 1–2 (ages 2–6). Architecture already supports all 5.

---

## 4. The journey map

### A. Discovery (the 60-second story)
A parent hears "my kid is bored with flashcard apps" or reads our Product Hunt post.
1. They tap a shared link / install → **Numberverse opens instantly, no login wall.**
2. A mascot — **Nova the Owl 🦉** — waves and says "Who's ready to play?"
3. One tap on **▶ Play** and the kid is inside Sprout Grove. **First wow in < 5 seconds.**

> Rule: a child must reach gameplay before a parent is ever asked for an account.
> (COPPA: all accounts are parent accounts. The kid never signs up.)

### B. Onboarding (parent gate — happens *after* first play)
After the first play session the parent is asked to "save your child's garden":
1. Parent signs up with **email + password** (FastAPI JWT).
2. Parent adds the kid: **name, avatar picker, birth year** → birth year auto-maps the world.
3. Numberverse remembers: next time, the kid taps their avatar and drops straight into their world.

### C. The magic first 3 minutes (player loop)
The game loop that becomes a habit:
```
OPEN → PICK WORLD → PLAY 3 QUICK ROUNDS → STARS + BADGE → "COME BACK TOMORROW"
        (5s)         (2s)          (~3 min)         (win moment)       (streak seed)
```
- **Round 1** is always easy (difficulty = kid's level) → guaranteed early win, 3 stars.
- The **adaptive engine (BKT)** raises difficulty on corrects, lowers on misses — never frustrating, never boring.
- Round complete = **confetti + a star cascade + a spoken "You're amazing!"**
- The kid sees a **streak flame** 🔥: "Play tomorrow to keep your garden growing."

### D. Mastery & progression (the long loop)
- Every tap posts a **progress event** to the backend.
- Skills flip from 🌱 budding → 🌿 growing → 🌳 mastered when the BKT posterior crosses 0.8.
- Mastering skills in a world **unlocks the next world** (and later: world *pets*, outfits, decorations).
- Parent dashboard shows the **mastery garden** — green trees are mastered skills, gray are next.

### E. The parent dashboard (5-second check)
- **Today**: minutes played, stars earned, streak.
- **Skills**: mastery % per skill with a friendly bar (parent-tuned wording, not "BKT posterior").
- **Switch kid**: one tap.
- **Controls**: daily time limit, kid's world locked to their band, offline mode.

### F. Retention & growth loops
- **Daily streak** (🔥 flame, garden grows a flower each day)
- **Weekly challenge** ("Pop 20 bubbles in River Town")
- **Share a win card** (COPPA-safe: no name, no photo, just the garden + stars)
- **Family plan** referral ("another kid? one price for up to 4")

### G. Monetization (honest & quiet)
- **Free forever**: world 1 (Sprout Grove), daily session, no ads.
- **Family subscription**: all 5 worlds + parent dashboard + offline — one price for up to 4 kids.
- **Lifetime** tier at launch discount.
- No ads, no in-game purchases aimed at children (App Store Kids Category requirement).

---

## 5. Mobile-first UX principles (enforced in code today)
1. **Portrait-first.** Game area fills the screen (`Scale.RESIZE`), adapts to any phone/tablet, any orientation.
2. **Fat touch targets.** Every tappable is ≥ 88px visual (bubbles) / ≥ 56px buttons — fingers, not cursors.
3. **No zoom, no scroll, no accidental exit.** `user-scalable=no`, `touch-action: manipulation`, full-screen layout, safe-area insets.
4. **Safe-area aware.** HUD respects notch + home indicator (`env(safe-area-inset-*)`).
5. **One hand, one thumb.** Primary actions near the bottom third; HUD compact at top.
6. **Words that don't need reading.** Numbers are huge; instructions are short + read aloud (P2).
7. **No dead taps.** Wrong taps get instant juicy feedback (bounce + gentle buzz tone), never a dead end.
8. **Instant start.** No login wall, no loading spinners between world picker and gameplay.

---

## 6. Current build status vs. this journey
| Journey beat | Status |
|---|---|
| Home → Nova → Play | ✅ mobile home screen (verified iPhone 390×844, tablet 820×1180, landscape 844×390) |
| World map (5 worlds, locked states) | ✅ world picker (world 1 playable, 2–5 🔒) |
| First session, 3 rounds, stars | ✅ playable, adaptive difficulty, touch verified |
| Player loop (confetti, star cascade) | ✅ in-game |
| Audio (pop, win, gentle wrong-tone) | ✅ mobile WebAudio (single ctx, iOS-gesture unlock) |
| Mobile-first UI (RESIZE canvas, safe areas, fat targets) | ✅ implemented + verified |
| Parent gate + kid profile | 🚧 P2 (API ready: /auth, /kids) |
| Streak + mastery garden + parent dashboard | 🚧 P2 |
| Offline mode, spoken instruction, 5 games | 🚧 P2 |

---

## 7. Journey checklists

### Kid's perfect first day
- [ ] Opens app → Nova waves, Play button in thumb reach
- [ ] One tap → Sprout Grove loads in < 2s
- [ ] Round 1 easy, wins 3 stars, confetti
- [ ] Wrong tap = bounce + gentle tone, never blocks
- [ ] After round 3: "You're amazing!" + streak flame lit
- [ ] Parent offered (not forced) to save progress

### Parent's perfect first day
- [ ] Saw the kid learn 3 skills in 3 minutes (visible on dashboard)
- [ ] Signed up in under 60s, added kid, picked avatar
- [ ] Dashboard shows mastery bars, not "progress events"
- [ ] Trusted: no ads, COPPA gate, time limits
