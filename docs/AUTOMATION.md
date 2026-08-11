# 🔁 Numberverse 24/7 pipeline

From "a new issue was opened" to "a new version is live", the loop runs on
autopilot. Two independent always-on legs work **in parallel** — the cloud
(GitHub Actions, on-event + on-tag) and the dev box (launchd, on a clock).

## The loop, stage by stage

```
NEW ISSUE                       (human or template)
  ↓  auto-assign + status:backlog      triage.yml · auto-assign.yml
  ↓  auto-add to project (Backlog)     add-to-project.yml
GROOMING (human, 1 label)       → status: todo  (+ priority:, milestone)
  ↓  conductor picks next (hourly)      pipeline.sh conductor
  ↓  opens branch feat/issue-NNN
  ↓  writes docs/work-orders/NNN.md
  ↓  issue → in-progress (label + card) + Telegram page
IMPLEMENT (human/agent)         write the code against the work order
  ↓  PR → auto-labeled by title        label-pr.yml
  ↓  4 gates run IN PARALLEL           ci.yml (build-core → typecheck+audit ‖ api)
MERGE                           body "Closes #N" → issue closed
  ↓  project card → Done               project-done.yml
  ↓  conductor idles while a PR is open, then picks the next
RELEASE-TRAIN (6-hourly)        when ≥2 feat/fix merged since last tag:
  ↓  pipeline.sh release-train → release.sh (gates → stamp → changelog → tag)
  ↓  tag vN → GitHub Release           release.yml (auto-notes)
  ↓  deploy to box                     release.sh step 6
LIVE                            kids.munna-khan.xyz serves the new stamp
```

## The two always-on legs (parallel)

| Leg | Job | Cadence | Runs where |
|---|---|---|---|
| 🌐 Cloud | triage / auto-assign / add-to-project / label-pr | on-event | GitHub Actions |
| 🌐 Cloud | CI (4 parallel gates) | every push/PR | GitHub Actions |
| 🌐 Cloud | GitHub Release on `v*` tag | on-tag | GitHub Actions |
| 🌐 Cloud | project-done (card → Done on close) | on-issue-close | GitHub Actions |
| 🖥️ Box | conductor (next work order) | hourly | launchd `com.tresha.pipeline-conductor` |
| 🖥️ Box | release-train (auto-cut a version) | 6-hourly | launchd `com.tresha.pipeline-release-train` |
| 🖥️ Box | oracle team (daily standup + paging) | daily | launchd `com.tresha.oracle-team` |

## The one human/agent step

**Writing the feature code.** The conductor front-loads *everything* around it:
branch, work order, board state, page. What it cannot do is author the feature —
that's the agent (or you) executing `docs/work-orders/NNN.md`. The gates that
follow (CI, audit, oracle) are the safety net: a work order can't land sloppy.

## Release-train bootstrapping (important)

- **First release is manual** on purpose: `bash infra/deploy/scripts/release.sh v11 "…"`
  (no `docs/LATEST_RELEASE.md` yet → the train refuses to guess a first version).
- release.sh writes `docs/LATEST_RELEASE.md` on the release commit — **that arms
  the train**. From then on it auto-cuts `vN+1` whenever ≥ 2 `feat`/`fix` commits
  have merged since the last tag (`RELEASE_THRESHOLD` env to tune, default 2).
- `--no-deploy` on release.sh still tags + pushes (CI + Release happen); deploy
  later with `bash infra/deploy/scripts/deploy.sh`.

## Running it by hand
```bash
bash infra/automation/pipeline.sh conductor      # force a conductor tick
bash infra/automation/pipeline.sh release-train  # force a release-train tick
bash infra/automation/pipeline.sh board          # one-screen board snapshot
```
Each job is lock-guarded (`~/.tresha/logs/locks/`) — re-entry is safe; the two
jobs run concurrently without stepping on each other. Logs:
`~/.tresha/logs/numberverse-pipeline.log` (+ `numberverse-board.md`),
`pipeline-conductor.{log,err}`, `pipeline-release-train.{log,err}`.

## Honest limits
- Branch protection/rulesets still need GitHub Pro/Team (private repo, free org)
  — CI + CODEOWNERS + the gate-chain stand in.
- The deploy leg needs the dev box online (it owns the rsync+ssh to
  `192.168.0.104` and the Cloudflare tunnel). If the box sleeps, the release
  tag still lands; the next release-train tick deploys when the box wakes.
