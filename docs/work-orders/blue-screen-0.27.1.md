# 0.27.1 — BLUE SCREEN HOTFIX (kid app)

## Symptom
Kid app rendered a solid navy-blue screen (theme-color #0b2545) with:
`Uncaught ReferenceError: Cannot access 'a4' before initialization at String.replace`

## Root cause
The long-term achievements book (#289, merged in the 0.27.0 window, never
deployed until 0.27.0) defined `ACHIEVEMENTS` with a module-eval template:
`hintBn: \`সব ভূখণ্ড আয়ত্ত করো (${bnNum(BANDS.length)})\``
`bnNum` reads `BN_DIGITS` (const), which was declared ~2200 lines LATER in the
same module. Evaluating `ACHIEVEMENTS` before `BN_DIGITS` initializes = TDZ
crash. 0.26.16 had no `bnNum()` in ACHIEVEMENTS, so it never fired — the bug was
latent until 0.27.0's first deploy.

## Fix
Moved `BN_DIGITS` / `BN_MONTHS` / `bnNum` ABOVE the `ACHIEVEMENTS` literal, with
a declaration-order guard comment. Any module-scope Bengali-digit formatting
must live below that block.

## Verification
- `BN_DIGITS` now precedes `ACHIEVEMENTS` in the built bundle.
- Node ESM eval of the full kid bundle now completes to `createRoot` with ZERO
  errors (it threw at the achievements literal before). Full DOM-shim eval:
  `✅ KID BUNDLE MODULE-EVAL OK — no TDZ crash`.
- Gates: core build · audit ✓ clean · locale ✓ · kid tsc ✓ · kid build ✓

## Files
- `apps/kid/src/App.tsx` — moved helpers + guard comment

## Release
Cut as **0.27.1** immediately to restore production.
