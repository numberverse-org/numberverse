# 🔒 Dependency security & CI hardening

Policy home for how this repo treats dependency vulnerabilities, lockfile
drift, and build-time supply-chain risk. Every gate below runs in CI and every
allowlist entry is a deliberate, reviewable decision — not a default.

## Gates in CI

| Gate | What it runs | Fails on |
|---|---|---|
| `dep-audit` (#308) | `scripts/audit-deps.mjs` → `pnpm audit --json` | any **moderate/high/critical** advisory not allowlisted, or an allowlisted advisory whose resolved version drifted (#1698/#1699) |
| `python-audit` (#1691) | `uv lock --check` + `pip-audit -r <(uv export --frozen --no-dev)` | any known vulnerability in the locked non-dev Python requirements, or lockfile drift |
| `license-audit` (#271) | `scripts/license-audit.mjs` | disallowed license in the JS tree |
| API `uv sync --frozen --no-dev` (#1692) | installs the API from the lockfile | a stale/tampered `uv.lock` before any test runs |
| `react-is` major-skew guard (#1697) | greps `pnpm-lock.yaml` for duplicate majors of core react packages | more than one major of `react-is` in the tree |

Dependabot (`/.github/dependabot.yml`, #1694) opens weekly, grouped PRs for
npm + pip. Every Dependabot PR runs these gates; a dependency that trips a
gate fails the PR by design.

## Allowlist policy (npm)

`scripts/audit-deps.mjs` carries a **version-aware** allowlist. Each entry
records:

- `reason` — why the vulnerable code path cannot execute in how we ship;
- `range` — the advisory's affected version range at allowlist time;
- `resolved` — the exact version in the tree; any change (upgrade **or**
  regression) fails the gate so the entry must be re-validated (#1699).

Since #1698, **moderate** advisories require the same documented justification
as high/critical — nothing ships by default.

## Tracked upgrades (SUNSET-BOUND)

These allowlist entries are **sunset-bound, not permanent policy**. Each has
an owner and a sunset date; when the sunset passes, the entry must be resolved
(upgrade the dependency) or explicitly re-approved by the owner.

### Next.js 14 → 15/16 (#1695)

- **Status:** EOL; every `next@14.2.x` server-runtime advisory (8 high,
  11 moderate) is allowlisted on the `output: "export"` static-export
  rationale — no node server / middleware / server actions / websockets /
  image optimizer / rewrites exist in the shipped parent portal.
- **Owner:** platform/maintainers
- **Sunset:** 2026-12-31 — by this date the tree must be on Next 15+ and the
  allowlist entries for `next@14` removed.
- **Tracked in:** this file; do NOT silently extend the sunset. The upgrade is
  intentionally NOT done in the deps/CI hardening wave (#1691-#1702) because a
  Next major bump carries React 19 + config migration risk that deserves its
  own wave.

### Vite — resolved

- Vite was upgraded 5.4.21 → 7.3.6 in the #1696 pass; the dev-server-only
  allowlist entry was **removed** (no longer present). esbuild resolved to
  0.28.2. No sunset entry needed — verified build + tsc + vitest green.

## Python supply-chain policy (#1701)

- `apps/api/uv.lock` is the single source of truth for the API runtime. CI
  refuses to proceed on `uv lock --check` failure (#1692).
- **Build-time** Python deps in the Docker image (numpy/onnx/onnxruntime used
  only to quantize the voice model) are installed from
  `apps/api/pip-hashes.txt` — a `uv pip compile --generate-hashes` pin file —
  with `pip install --require-hashes`. Every wheel is SHA-256 verified before
  install, so a compromised PyPI release cannot execute in the build (#1701).
- To refresh the build-time deps: `cd apps/api && uv pip compile --generate-hashes
  --python-version 3.12 --no-header --no-annotate -o pip-hashes.txt` (update
  the `numpy<2` / `onnx` / `onnxruntime` lines first). Keep the file's pins in
  sync with the Dockerfile comment.
- The browser-side `onnxruntime-web` served from `/voice/onnx/` is a separate
  asset (pinned 1.17 via `fetch_voice_assets.sh` for Safari classic-worker
  compatibility) and is intentionally NOT coupled to the build-time pip pin.

## Supported interpreters (#1702)

`apps/api/pyproject.toml` bounds `requires-python = ">=3.12,<3.14"`. CI runs
the full API unit suite on a **3.12 + 3.13 matrix** so an interpreter
regression (import error, syntax issue, or dep incompatibility on either
supported line) fails before merge. 3.14 is not yet supported and must be
added deliberately (new lock resolution + matrix entry) when it is.

## Adding a new allowlist entry

1. Run `node scripts/audit-deps.mjs`; it prints the offending advisory URL.
2. Add an entry keyed by that URL with `reason`, `range` (the advisory's
   `vulnerable_versions`), and `resolved` (the exact version in the tree).
3. If the advisory is for a dependency that is EOL or slated for upgrade,
   ALSO add/refresh the SUNSET-BOUND section above with an owner + date.
4. The gate verifies the `resolved` version matches on every run; if the
   dependency upgrades (or regresses), the gate fails until the entry is
   re-validated.
