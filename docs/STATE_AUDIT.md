# 🟢 Loading / Empty / Error state audit (#346)

Every kid-facing surface must show a proper loading, empty, and error state —
never a bare blank canvas, frozen screen, or dead card. Audited 2026-08-12 on
the 0.51.0 tree; gaps found were fixed in this same pass (v0.52.0).

## Coverage matrix

| Surface | Loading | Empty | Error / retry | Where |
|---|---|---|---|---|
| Cold start → App chunk | Splash holds until `appLoaded` (no blank gap) | — | `BootErrorBoundary` → "Tap to retry" | `main.tsx` Boot/SplashScreen/`BootErrorBoundary` (#1217) |
| Lazy screen chunks (HomeScreen, AddKidForm) | `ScreenFallback` spinner + friendly text | — | covered by `BootErrorBoundary` | `App.tsx` `ScreenFallback` (#1178/#1186) |
| Phaser engine chunk | `game-boot-loading` spinner + text | — | `game-boot-error` tap-to-retry | `App.tsx` `gameBoot` state machine (#1186) |
| Playing session | — | journey end / mastery progress always renders | wrong-tap remediation + reteach | `journey.ts` + App playing flow |
| Home / kid pick | — | 0 kids → "Pick a profile" prompt | — | `App.tsx` `kids.length === 0` |
| Home recap (weekly) | — | empty week → soft "come play" nudge | — | `HomeScreen.tsx` recap card (#286) |
| Reward wall | — | cap reached → forward-looking 🌙 wait line (names the reward) | — | `HomeScreen.tsx` cap-waiting |
| Nova 3D island | `nova3d-loading` island-building line | — | `IslandErrorBoundary` → 2D fallback | `Nova3DHome.tsx` (#684) |
| Parent panel wrong-answer history | — | `mistakesEmpty` / `mistakesNoneDay` friendly copy | — | `App.tsx` parent mistakes card (#78) |
| Parent family view | — | 0 kids → "Pick a profile" | — | `App.tsx` parent-hero |
| Neural voice download | `voiceNeuralLoading` progress line | — | `voiceDlFailed` tap-to-retry | `App.tsx` + i18n (#1318) |
| Sync | — | — | `syncError` "Sync hiccup — will retry" | i18n + auto-sync |
| PWA update | `UpdateBanner` appears on `onNeedRefresh` | — | — | `updateBanner.ts` (#1321) |

## Gaps found + fixed in this pass

1. **`ScreenFallback`** (lazy HomeScreen/AddKidForm) was a BARE spinner with
   no text and no accessible label. Fixed: kid-friendly "Loading game…" /
   "খেলা লোড হচ্ছে…" visible copy + `role="status"` + `aria-label`, EN/BN via
   the app i18n dict (`loadingGame` key). CSS: `.screen-suspense-txt`.
2. **Engine-boot overlay** used inline EN/BN ternaries. Fixed: now reads the
   shared `t.loadingGame` key (same friendly copy, one source of truth) and
   shows the text under the spinner (`flex-direction: column`).

## Verification

- `tsc --noEmit` clean (apps/kid).
- audit.mjs 0 errors; oracle_team clean (exit 0).
- Strings flow through the app i18n dict (i18n seam) so a future language
  adds `loadingGame` in its `STR` block — no code change.

No dead screens remain: every lazy chunk and the engine chunk have a visible
loading state and a recovery path on failure.
