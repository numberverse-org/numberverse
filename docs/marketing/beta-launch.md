# 🚀 Numberverse — Facebook Beta Launch Plan

> **Goal:** recruit 20–50 Bangladeshi parents (kids age 2–10) into a closed beta,
> collect real feedback, then cut `1.0.0` GA and market broadly.

---

## Phase 1 — Page setup (before any post)

**Facebook Page**
- Name: **Numberverse** (or "Numberverse বাংলাদেশ")
- Category: Education / App Page
- Handle: `@NumberverseBD`
- Logo: the Nova owl (already in `apps/kid/public`)
- Cover: a bright screenshot of a kid playing a Bangla math game

**Must-haves on the page (before the first post):**
- [ ] Page name + logo + cover
- [ ] "About" → one-liner: *"Fun offline math + Bangla learning games for kids 2–10."*
- [ ] Website link → `https://kids.munna-khan.xyz`
- [ ] Messenger set to auto-reply: *"Thanks for your interest! 🎉 We're onboarding beta testers now — drop your kid's age and we'll send the link."*

---

## Phase 2 — Pre-launch posts (build a list before beta opens)

**Post 1 — The "why" (day 1)**
> 🇧🇩 আপনার বাচ্চা কি ইংরেজি অ্যাপে গণিত শিখছে, কিন্তু বাংলায় ভাবছে?
>
> Numberverse-এ সবকিছু বাংলায় — যোগ, বিয়োগ, গুণ, ভাগ, সব খেলার ছলে। কোনো ইন্টারনেট লাগবে না, কোনো বিজ্ঞাপন নেই।
>
> এখনই ফলো করুন — শীঘ্রই সীমিত সংখ্যক বাবা-মাকে বিটা টেস্টার হিসেবে নিচ্ছি। 🎁

**Post 2 — The hook (day 2-3, with a short video)**
> Video: 10 seconds of a kid tapping correct answers + the celebration animation.
> Caption: *"গণিত ভয় না, খেলা। 🎮 আপনার ৫ বছরের বাচ্চার জন্য।"*

**Post 3 — Social proof / urgency (day 4)**
> *"আমরা প্রথম ৫০ জন বিটা পরিবার খুঁজছি — যারা চান বাচ্চার গণিত বাংলায় সহজ হোক। যোগ দিন, বিনামূল্যে, আর আজীবন ডিসকাউন্ট পান।"*

---

## Phase 3 — Beta recruitment (the signup)

**Beta signup flow** (simple, low-friction):
1. Parent comments/DMs "আমি চাই" + kid's age
2. We reply with the PWA link + a one-line setup
3. Track: `date joined`, `kid age`, `device`, `scenes played` (already logged)

**Incentive for beta testers:**
- 🎁 Lifetime "Founding Parent" badge (in-app)
- 🎁 6 months free when v1.0.0 goes paid
- 🎁 Direct feedback channel (Messenger)

**What to collect from beta:**
- Which scene the kid *asks to replay* (retention signal)
- Which scene they *abandon mid-round* (UX bug signal)
- "Would you pay for this?" (pricing validation)

---

## Phase 4 — GA launch (after beta feedback)

**Launch post (day of 1.0.0):**
> 🎉 **Numberverse এখন লাইভ!**
> বাংলায় গণিত শেখার সবচেয়ে মজার উপায় — অফলাইনে, বিজ্ঞাপন ছাড়া, ২–১০ বছরের বাচ্চার জন্য।
> আজই শুরু করুন → kids.munna-khan.xyz

**Paid boost targets (when ready to spend):**
- Location: Bangladesh (Dhaka, Chattogram first)
- Age: 22–40 (parents)
- Interest: "early childhood education", "parenting", "Bangla learning"

---

## Success metrics for beta → GA go/no-go

| Signal | Go if |
|---|---|
| Retention | ≥40% return to play within 7 days |
| Completion | ≥70% finish a round once started |
| Crash/bounce | <5% mid-round abandonment |
| Pricing | ≥30% of beta parents say "yes" to paid |

---

## Next actions (I can do these)
- [ ] Confirm `kids.munna-khan.xyz` is production-stable before beta (it's already live + healthy)
- [ ] Prepare a 10-sec demo video script (Nova + Bangla math)
- [ ] Draft the 3 pre-launch posts in final Bangla (with the emojis/length tuned for FB)
- [ ] Set up a `beta-signups` tracker (simple JSON or the existing DB)
