# Dependency licenses

Every bundled dependency ships under one of the licenses below. This is the
**policy** the `scripts/license-audit.mjs` gate enforces in CI (`.github/
workflows/ci.yml` → `license-audit` job): a dependency whose license is not
listed here **fails the build**.

## Allowlist

| License       | Notes |
|---------------|-------|
| MIT           | most packages (React, Phaser, Vite, Babel, React-admin, …) |
| ISC           | graceful-fs, isexe, idb, … |
| Apache-2.0    | TypeScript, ejs, … |
| BSD           | css-mediaquery |
| BSD-2-Clause  | esutils, terser, … |
| BSD-3-Clause  | source-map, hoist-non-react-statics, … |
| 0BSD          | tslib |
| CC0-1.0       | public-domain waivers |
| CC-BY-4.0     | caniuse-lite (data) |
| BlueOak-1.0.0 | npm's modern permissive license (glob, lru-cache, minipass, …) |
| MPL-2.0       | dompurify (shipped as `MPL-2.0 OR Apache-2.0`) |
| (MIT OR CC0-1.0) | type-fest |

## Adding a dependency

1. Run `pnpm add <pkg>`.
2. Run `node scripts/license-audit.mjs` locally.
3. If it fails on the new package, its license is **not** in the allowlist.
   Review whether you want to ship it; if yes, add the license to
   `ALLOWED` in `scripts/license-audit.mjs` **and** this table — that is a
   deliberate, PR-visible policy change.

## Audit

- `pnpm licenses list --json` → parsed by `scripts/license-audit.mjs`
- CI job: `.github/workflows/ci.yml` → `license-audit` (runs on every PR)
