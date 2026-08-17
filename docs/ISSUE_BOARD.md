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

Milestones track **release trains** — the retired `vN` names are gone; with TRUE
SEMVER (see `docs/RELEASING.md`) each milestone is a minor release's train. The
current in-flight version lives in `docs/LATEST_RELEASE.md` — anchor on that
file, not a frozen list.

| Milestone | Focus |
|---|---|
| `0.99 — Explore Garden` | shape quests (K.G.2) + first-play tap demo |
| `0.98 — Parent & Garden` | admin correctness, schema caps, parent usage, Explore Garden gameplay |
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
gh issue edit 12 --label "status: todo,priority: high" --milestone "0.99 — Explore Garden"
gh issue close 12
```

## 📋 GitHub Projects v2 — LIVE
**`Numberverse Roadmap`**: `github.com/orgs/numberverse-org/projects/1`

- Every new issue auto-adds to the project in the **Backlog** column
  (`.github/workflows/add-to-project.yml` + `PROJECT_PAT` secret).
- The project's **Status** field mirrors the label kanban:
  `Backlog → In progress → Review → Blocked → Done`.
- Issues opened before the project existed were backfilled onto it (all Backlog).
- **Keep the two in sync:** a status change on the label should also move the
  project card (and vice-versa). Moving a card:
  ```bash
  # move an issue's project card to In progress
  gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwDOEs9Wkc4Bf_Mz",
    itemId: "<PVTI_...>",
    fieldId: "PVTSSF_lADOEs9Wkc4Bf_MzzhaOGQo",
    value: { singleSelectOptionId: "da217006" } }) { projectV2Item { id } } }'
  ```
  (item id from `gh project item-list 1 --owner numberverse-org`; option ids:
  Backlog `2f9ff034` · In progress `da217006` · Review `2b7dac15` ·
  Blocked `1c82ee16` · Done `4923709d`)

## Honest limits (free org, private repo)
- **Branch protection / rulesets** are paywalled (GitHub Pro/Team) on private
  repos — CODEOWNERS + CI + PR-first discipline stand in for the hard rule.
- **Dependabot / secret scanning** aren't in the free org plan.
- Keeping the repo **private** is non-negotiable — privacy is the moat.
