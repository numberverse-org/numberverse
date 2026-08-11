# 🚀 Numberverse — release pipeline

A feature becomes a version in 6 automated steps. No manual tagging, no
"did I run the audit?" — the pipeline runs every gate itself.

## The flow

```
PR merged → CI green (build core → typecheck → audit → api compile)
        → bash infra/deploy/scripts/release.sh vN "one-line summary"
            1. Quality gates      (core build · kid typecheck · audit · oracle CLEAN)
            2. Bump stamp         (APP_BUILD → "dd Mmm YYYY · vN (summary)" + TRACKER date)
            3. Changelog          (CHANGELOG.md prepended with commits since last tag)
            4. Commit + tag       (chore: vN release — summary  →  tag vN)
            5. Push               (main + tag)  →  GitHub Actions:
                    • ci.yml        re-verifies the exact tagged commit
                    • release.yml   drafts a GitHub Release with auto-generated notes
            6. Deploy             (rsync → docker compose build on box → live)
        → kids.munna-khan.xyz serves the new build stamp
```

## How to ship (one command)

```bash
bash infra/deploy/scripts/release.sh v11 "Taka Tap v2 + release pipeline"
# add --no-deploy to stop after push/tag (deploy later with deploy.sh)
```

The script aborts on the **first failing gate** — you cannot release with a
broken audit, a red typecheck, or an ✖ oracle check. That's the point.

## Where the automation lives

| Step | Owner |
|---|---|
| CI on push/PR | `.github/workflows/ci.yml` |
| Auto-triage new issues | `.github/workflows/triage.yml` (+ auto-assign) |
| Label PRs by type | `.github/workflows/label-pr.yml` |
| GitHub Release on `v*` tag | `.github/workflows/release.yml` |
| Gates → stamp → changelog → tag → push → deploy | `infra/deploy/scripts/release.sh` |

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
