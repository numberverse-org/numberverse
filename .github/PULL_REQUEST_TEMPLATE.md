## What & why
<!-- What does this change, and why? Link the issue if there is one. -->

## Oracle layers touched
- [ ] 🧠 Oracle — child-safe / privacy / curriculum verified
- [ ] 🛠️ Eng — builds & typechecks
- [ ] 🛡️ Trust — audit clean, CI green
- [ ] 👁️ Visual — i18n EN+BN, no tofu, palette/contrast OK

## Checks
- [ ] `pnpm --filter @numberverse/core build`
- [ ] `pnpm --filter kid typecheck`
- [ ] `node apps/kid/scripts/audit.mjs` → clean
- [ ] CI on this PR is green

## How to verify
<!-- One-liner: what should a human do to confirm this works? -->
