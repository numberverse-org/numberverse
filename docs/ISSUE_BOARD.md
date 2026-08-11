# 🗂️ Numberverse — issue board & tracking

The whole roadmap lives in GitHub issues. **No external tool** — the kanban is
milestones + labels, which work on the free plan with just `repo` scope.

## The board (as label filters)

| Column | Filter |
|---|---|
| 📥 Backlog (new issues land here) | `is:issue is:open label:"status: backlog"` |
| ✅ To-do (groomed, ready) | `is:issue is:open label:"status: todo"` |
| 🚧 In progress | `is:issue label:"status: in-progress"` |
| 👀 Review | `is:issue label:"status: review"` |
| 🚫 Blocked | `is:issue label:"status: blocked"` |
| ✅ Done | `is:issue is:closed` |

**Shortcut:** open `github.com/numberverse-org/numberverse/issues?q=label:"status:"`
to see every column at once.

## Epics (milestones)

| Milestone | Focus |
|---|---|
| `v11 — next ship` | the current cut: Taka Tap v2, parent streak, first tagged release |
| `v12 — parent power` | caps, debug card, share upgrades, sync |
| `v13 — content wave` | count-to-100, Bangla sentences, digraphs, seasons |
| `v14 — polish & perf` | async Phaser chunk, iOS pass, accessibility |
| `Backlog` | parked ideas — pull from here when a milestone is light |

## The workflow (how work actually moves)

1. **Any new issue** → auto-assigned to the maintainer + auto-labeled
   `status: backlog` (`.github/workflows/triage.yml`).
2. **Owner grooms** → moves to `status: todo`, adds `priority:`, and pulls it
   into the right milestone.
3. **Work starts** → label `status: in-progress`.
4. **PR opened** → labeled by type from the title (`feat:` → `feature`,
   `fix:` → `bug`, …). Body says `Closes #N` so merging auto-closes the issue.
5. **Merged** → CI re-verifies main; when enough user-facing work lands, the
   **release pipeline** cuts the version (`docs/RELEASING.md`).

## Moving a card
```bash
gh issue edit 12 --label "status: todo,priority: high" --milestone "v13 — content wave"
gh issue close 12
```

## Projects v2 (wanted, blocked by a token scope — 1 command unlocks)
GitHub Projects v2 (the modern board) needs scopes we don't have yet. Run once:

```bash
gh auth refresh -h github.com -s project,read:project
```

Then the maintainer creates the org **"Numberverse Roadmap"** project, links this
repo, and adds an auto-add-to-project workflow. Until then the label board above
is the live board — nothing is lost when Projects lands.

## Honest limits (free org, private repo)
- **Branch protection / rulesets** are paywalled (GitHub Pro/Team) on private
  repos — CODEOWNERS + CI + PR-first discipline stand in for the hard rule.
- **Dependabot / secret scanning** aren't in the free org plan.
- Keeping the repo **private** is non-negotiable — privacy is the moat.
