# 🚀 Numberverse — release pipeline

A feature becomes a version in 7 automated steps. No manual tagging, no
"did I run the audit?" — the pipeline runs every gate itself.

## The flow

```
PR merged → CI green (build core → typecheck → audit → api compile+tests
            → license audit) plus label gate; release.sh also demands oracle CLEAN
        → bash infra/deploy/scripts/release.sh 0.26.x "one-line summary"
            1. Quality gates      (core build · kid typecheck · audit · oracle CLEAN)
            2. Bump stamp         (APP_BUILD → "dd Mmm YYYY · 0.26.x (summary)" + TRACKER date)
            3. Changelog          (CHANGELOG.md prepended with commits since last tag)
            4. Commit + tag       (chore: 0.26.x release — summary  →  tag 0.26.x)
            5. Push               (main + tag)  →  GitHub Actions:
                    • ci.yml        re-verifies the exact tagged commit
                    • release.yml   drafts a GitHub Release with auto-generated notes
            6. Deploy             (rsync → docker compose build on box → live)
            7. Smoke test         (#121: curl the live bundle, assert the new stamp)
        → kids.munna-khan.xyz serves the new build stamp (or release.sh exits ✖)
```

## How to ship (one command)

```bash
bash infra/deploy/scripts/release.sh 0.26.x "one-line summary"
# add --no-deploy to stop after push/tag (deploy later with deploy.sh)
```

Versions are **TRUE SEMVER (0.MAJOR.MINOR.PATCH)** — the version you pass IS
the semver, used verbatim in the stamp, the git tag, and APP_VERSION. The
release train bumps MINOR for feature releases (`feat:` commits) and PATCH for
fix-only releases (`fix:` commits).

The script aborts on the **first failing gate** — you cannot release with a
broken audit, a red typecheck, an ✖ oracle check, or a failed post-deploy
smoke test. That's the point.

## CI gates (every PR must be green before merge)

| Job | What it checks |
|---|---|
| `build-core` | `packages/core` compiles (choke point for the next two) |
| `typecheck-kid` | kid app `tsc --noEmit` (needs core/dist) |
| `audit` | `apps/kid/scripts/audit.mjs` — i18n EN/BN parity, catalog integrity, scope/sequence guards, no console.log in shipped code (#268) |
| `api` | API compiles (`compileall`) + PII-scrubber unit tests (#266/#270) |
| `license-audit` | `scripts/license-audit.mjs` — every bundled dep's license in the allowlist (#271) |
| `label` | PR title is conventional → type label |
| **oracle** (release gate) | `scripts/team/oracle_team.py --no-page` — the 35-role standup must be CLEAN before a tag |

## The mastery-gate flow

Content ships as skills → games → scenes in `packages/core/src/skills.ts`
(+ `GAME_SCENES` + lazy Phaser chunks in `apps/kid/src/game/engine.ts`). The
`audit` CI job enforces the **scope guard** (a count-to-10 game never asks for
12) and the **sequence guard** (numbers before calculation, concrete before
abstract drill). A skill only reads as "mastered" once BKT crosses
`MASTERY_THRESHOLD`; the round that crosses it fires the celebration (#290).

## Where the automation lives

| Step | Owner |
|---|---|
| CI on push/PR | `.github/workflows/ci.yml` |
| Auto-triage new issues | `.github/workflows/triage.yml` (+ auto-assign) |
| Label PRs by type | `.github/workflows/label-pr.yml` |
| GitHub Release on semver tag (`0.*`) | `.github/workflows/release.yml` |
| Gates → stamp → changelog → tag → push → deploy → smoke | `infra/deploy/scripts/release.sh` |

## Rules of the road
- **Version the app, not the calendar.** Bump `vN` only when something user-facing
  ships (new game, new content, real fix). Housekeeping merges ride along.
- **Keep PR titles conventional** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`)
  — they drive PR labels and the release changelog.
- **Reference issues** in PR bodies (`Closes #12`) — GitHub auto-closes them on merge.
- **The release PR is green before you tag.** `release.sh` refuses otherwise.

## Honest limits (free org, private repo)
- Branch protection/rulesets need GitHub Pro/Team — CODEOWNERS + CI + PR-first
  discipline stand in. See `docs/ISSUE_BOARD.md`.
- GitHub Projects v2 needs a one-time token grant: `gh auth refresh -h github.com -s project,read:project`.
