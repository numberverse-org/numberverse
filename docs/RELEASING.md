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
            6. Deploy             (rsync → docker compose build `:VERSION`-tagged images on box → live)
            7. Smoke test         (#121: curl the live bundle, assert the new stamp)
                • edge lag? origin-check says new version is live → wait for the edge, do NOT roll back
                • origin broken? → AUTO-ROLLBACK to the previous version's image (#125)
        → kids.munna-khan.xyz serves the new build stamp (or release.sh rolls back and exits ✖)
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

## Rollback on a bad deploy (#125)

Every release builds **version-tagged images** (`numberverse-demo-{web,api}:<X.Y.Z>`)
on the box, so the previous release's image is always locally available.

If the post-deploy smoke fails, release.sh first probes the **origin**
(`http://192.168.0.104:8080`, bypassing Cloudflare):

- **Origin serves the new version** → the failure was edge-cache lag. release.sh
  waits up to 90s for the edge to catch up and **does NOT roll back** (rolling
  back would break a good deploy). If the edge is still stale it exits ✖ with a
  "purge the Cloudflare cache" hint.
- **Origin does NOT serve the new version** → genuine deploy fault. release.sh
  runs `bash infra/deploy/scripts/rollback.sh <prev-version>`, which restarts
  web+api from the previous image with **no rebuild** and re-verifies the live
  stamp.

Rollback is safe to re-run and is a no-op if the target image is missing (it
fails loudly instead of pretending).

## CI gates (every PR must be green before merge)

| Job | What it checks |
|---|---|
| `build-core` | `packages/core` compiles (choke point for the next two) |
| `typecheck-kid` | kid app `tsc --noEmit` (needs core/dist) |
| `audit` | `apps/kid/scripts/audit.mjs` — i18n EN/BN parity, catalog integrity, scope/sequence guards, no console.log in shipped code (#268); + share-PNG zero-metadata test (#93) |
| `api` | API compiles (`compileall`) + PII-scrubber (#266/#270), structured error log (#124), and age-band lock (#275) unit tests |
| `license-audit` | `scripts/license-audit.mjs` — every bundled dep's license in the allowlist (#271) |
| `secret-scan` | `scripts/secret-scan.mjs` — no hardcoded-secret shapes (AWS keys, private keys, tokens) in the tracked tree (#126) |
| `content-safety` | `scripts/content-safety.mjs` — no unsafe words in skill titles / scene strings; allowlist-able (#91) |
| `tracker-scan` | `scripts/tracker-scan.mjs` — no ad/tracker dependency or endpoint (100% ad-free) (#92) |
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
