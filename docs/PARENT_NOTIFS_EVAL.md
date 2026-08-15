# 🔔 Parent phone notifications bridge (#135) — tech spike decision

> **Decision:** build the weekly-summary notification as **Web Push (VAPID)** on
> the kid app's existing service worker — the PWA-native, standards path that
> reaches a phone with NO app-store / APNs / FCM credentials. Opt-in, tied to
> the parent account (so it *requires sync* ✅ #9), body = the same weekly
> aggregates the parent panel already renders (mastery + coins only). This doc
> records the comparison + the risk list + the build sketch. No analytics, no
> raw answers, no voice/face — matches the issue's "Done when".

## Why now

#9 shipped multi-device sync — the precondition in the issue ("If parent
account/sync ships") is met. The parent panel already computes the weekly
summary server-side (`GET /kids/{kid_id}/weekly` → days/rounds/accuracy/
mastered/coins). The missing piece is a delivery channel: the phone.

## Why Web Push over the alternatives

| Option | Requires | Offline? | Privacy | Fit |
|---|---|---|---|---|
| **Web Push (VAPID) via PWA SW** | VAPID keypair + SW `push` listener + a server sender | ✅ notification arrives offline | ✅ E2E-friendly — body is aggregate mastery+coins | ✅ **recommended** |
| **APNs (iOS app)** | Apple developer account + a native app | — | ✅ | ✖ the kid app is a PWA, not native |
| **FCM (Android)** | Google account + FCM key | — | ⚠ sends through Google | ✖ unnecessary for a PWA — Web Push covers Android Chrome |
| **Email digest** | SMTP | — | ✅ | ⚠ not a *phone notification* (issue explicitly asks phone) |

Web Push is HTTP/2 push from a VAPID-signed sender to a browser push service
(no app-store account), and `vite-plugin-pwa` already registers the service
worker in the kid app — so the client side plugs into existing infra.

## Risks (why this is a spike → build wave)

- **iOS support is narrow**: iOS Safari Web Push needs iOS 16.4+ AND the PWA
  installed to the Home screen (a background tab doesn't receive pushes).
  Android Chrome is fine on any recent version. The feature must degrade
  gracefully (hide/disable the toggle where unsupported).
- **Live infra can't be verified in the pipeline**: a VAPID keypair must be
  generated + configured server-side (env/ops), and delivery can only be
  confirmed on a real device against the live box — same rule as #130's
  camera and #139's QR scan (operator tests on their own devices).
- **Offline-first is untouched**: a failed push is invisible to gameplay; the
  subscription is a nicety layered on the always-sync outbox, never a
  dependency.
- **Permission fatigue**: the browser's native notification prompt must be
  explained ("weekly summary — no alerts mid-play"), and the toggle must be
  parent-gated behind the PIN like the rest of the panel.

## Build sketch (for the build wave)

1. **Server** — `subscriptions` table (profile_id FK, endpoint unique,
   keys JSON, created_at — auto-migrated by `migrations.py`); `POST
   /notifications/subscribe` (rate-limited, requires auth) stores/upserts the
   subscription; a scheduled job (the box's scheduler) walks subscriptions →
   previous week's `WeeklyOut` → sends via `pywebpush`. Toggle-off → DELETE.
2. **Client** — parent-panel switch "🔔 Weekly summary" (rendered ONLY with a
   parent session → *requires sync*); `PushManager.subscribe({userVisibleOnly,
   applicationServerKey: VAPID_PUBLIC})` on the existing `registerSW`
   registration; POST the endpoint+keys; SW `push` listener renders
   `"{name} mastered N skills · 🪙 M this week"` (tap → open app / parent
   panel); unsubscribe on toggle-off. Copy lives in the EN/BN tables (locale
   packs, #131).

## Done-when (build wave checklist)

- [ ] VAPID keypair generated; public key in the kid app, private key in the
      API env (never in the repo)
- [ ] Server subscribe/unsubscribe endpoints + auto-migrated table
- [ ] Parent panel opt-in toggle (parent-session only, PIN-gated)
- [ ] Weekly sender job posts a summary notification per subscription
- [x] SW push listener renders + routes the tap — implemented in
      `apps/kid/src/sw.ts` (the registered kid PWA SW owns push). The parent
      portal SW (`apps/parent/public/sw.js`) is install/activate/fetch only and
      is NOT push-capable (ineligible). The listener is feature-flagged on
      `payload.kind ∈ {weekly-summary, milestone, reminder}` + a well-formed
      localised title/body; copy comes from the server payload (EN/BN).
- [ ] Operator verifies delivery on their own phone (Android Chrome + iOS
      installed-PWA 16.4+); unsupported platforms hide the toggle
- [ ] No analytics, no voice/face, no raw answers anywhere in the payload

**Status:** decision recorded (this doc). Build wave = scheduled with a
physical-device test on the operator's own hardware, matching #130/#139.
