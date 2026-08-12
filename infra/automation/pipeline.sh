#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Numberverse 24/7 pipeline — conductor + release train
#   From issue → branch → PR → merge → release → deploy, on autopilot.
#
#   pipeline.sh conductor      (hourly)  pick next work order, open branch, page
#   pipeline.sh release-train  (6-hour)  auto-cut a version when enough landed
#   pipeline.sh board                    print a one-screen board snapshot
#
# The two jobs run as independent launchd agents → fully parallel, always on.
# The only human/agent step in the loop is writing the actual feature code for
# a work order; everything around it (admin, gates, release, deploy) is this.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
R="numberverse-org/numberverse"
PROJECT_ID="PVT_kwDOEs9Wkc4Bf_Mz"
FIELD_ID="PVTSSF_lADOEs9Wkc4Bf_MzzhaOGQo"
DONE_OPT="4923709d"
INPROG_OPT="da217006"
LOG_DIR="$HOME/.tresha/logs"
LOCK_DIR="$LOG_DIR/locks"
mkdir -p "$LOG_DIR" "$LOCK_DIR"

log(){ echo "[$(date '+%F %T')] $*" | tee -a "$LOG_DIR/numberverse-pipeline.log"; }

_tg(){ # $1 = text (one message)
  local token chat
  if [ -f "$HOME/.tresha/.env" ]; then
    token=$(sed -n 's/^TG_BOT_TOKEN=//p' "$HOME/.tresha/.env" | tr -d '"' | head -1)
    chat=$(sed -n 's/^TG_CHAT_ID=//p' "$HOME/.tresha/.env" | tr -d '"' | head -1)
  fi
  [ -n "$token" ] && [ -n "$chat" ] && \
    curl -s -m 10 -X POST "https://api.telegram.org/bot${token}/sendMessage" \
      -d chat_id="$chat" -d text="$1" -d disable_web_page_preview=true >/dev/null 2>&1 || true
}

acquire(){ # $1 = job name — one instance per job (parallel across jobs)
  LOCK_PATH="$LOCK_DIR/$1.lock"
  if ! mkdir "$LOCK_PATH" 2>/dev/null; then log "$1: already running — skip"; exit 0; fi
  trap 'rm -rf "$LOCK_PATH"' EXIT
}

# ── board snapshot (non-committed; for the human + logs) ───────────────────
_snapshot(){
  { echo "# Numberverse board — $(date '+%F %T')"
    echo
    echo "## Work orders"
    gh issue list --repo "$R" --state open --label "status: in-progress" --limit 5 \
      --json number,title,assignees --jq '.[] | "- #\(.number) \(.title)"' 2>/dev/null || true
    echo
    echo "## Todo (groomed, next up)"
    gh issue list --repo "$R" --state open --label "status: todo" --limit 10 \
      --json number,title --jq '.[] | "- #\(.number) \(.title)"' 2>/dev/null || true
    echo
    echo "## Backlog count"
    gh issue list --repo "$R" --state open --label "status: backlog" --limit 100 \
      --json number --jq 'length' 2>/dev/null || echo 0
    echo
    echo "## Open PRs"
    gh pr list --repo "$R" --state open --json number,title --jq '.[] | "- #\(.number) \(.title)"' 2>/dev/null || true
  } > "$LOG_DIR/numberverse-board.md"
}

# ── conductor: pick next work order, open branch, page ──────────────────────
conductor(){
  acquire conductor
  cd "$ROOT"

  # 1. If a work order is already active, or any PR is open → the loop is busy.
  local active
  active=$(gh issue list --repo "$R" --state open --label "status: in-progress" --limit 1 --json number --jq 'length' 2>/dev/null || echo 0)
  if [ "$active" -gt 0 ]; then log "conductor: in-progress issue exists — loop busy, idle"; _snapshot; exit 0; fi
  active=$(gh pr list --repo "$R" --state open --limit 1 --json number --jq 'length' 2>/dev/null || echo 0)
  if [ "$active" -gt 0 ]; then log "conductor: open PR exists — waiting for merge, idle"; _snapshot; exit 0; fi

  # 2. Pick the next groomed issue: priority high > medium > low, then milestone.
  local pick
  pick=$(gh issue list --repo "$R" --state open --label "status: todo" --limit 50 \
    --json number,title,milestone,labels \
    --jq 'def prio($l): ($l | if index("priority: high") then 3 elif index("priority: medium") then 2 elif index("priority: low") then 1 else 0 end);
          . | map({number,title,ms:(.milestone.title // ""),p:(prio(.labels|map(.name)))})
          | sort_by(-.p, .ms)
          | first
          | "\(.number)|\(.title)|\(.ms)"' 2>/dev/null || true)

  if [ -z "$pick" ] || [ "$pick" = "null" ]; then
    log "conductor: no groomed status:todo issue — idle (groom one: gh issue edit N --add-label \"status: todo\")"
    _snapshot; exit 0
  fi
  IFS='|' read -r NUM TITLE MS <<<"$pick"
  if [ -z "$NUM" ] || [ "$NUM" = "null" ]; then
    log "conductor: pick guard — invalid issue, idle"
    _snapshot; exit 0
  fi

  # 3. Open the feature branch off main.
  git fetch -q origin
  git checkout -q main
  git pull -q --ff-only origin main
  local BR="feat/issue-$NUM"
  git checkout -q -B "$BR" origin/main

  # 4. Write the work order (issue body + the standard feature checklist).
  mkdir -p docs/work-orders
  {
    echo "# Work order #$NUM — $TITLE"
    echo "> milestone: $MS · branch: \`$BR\`"
    echo
    echo "## Acceptance criteria (from the issue)"
    echo
    gh issue view --repo "$R" "$NUM" --json body --jq '.body' 2>/dev/null || true
    echo
    echo "## Feature checklist (the 5-spot registration + gates)"
    echo "- [ ] \`packages/core/src/skills.ts\`: SKILLS + GAMES (\`difficultyLevels\`) + GAME_SCENES entry"
    echo "- [ ] \`apps/api/app/seed.py\`: SKILLS_SEED row (audit enforces parity)"
    echo "- [ ] \`apps/kid/src/game/i18n.ts\`: EN + BN keys (audit enforces both)"
    echo "- [ ] App.tsx: scene import + scene array registration"
    echo "- [ ] \`node apps/kid/scripts/audit.mjs\` → clean"
    echo "- [ ] \`tsc --noEmit\` clean (core + kid)"
    echo "- [ ] oracle 35/35 CLEAN"
    echo "- [ ] CI on the PR is green"
    echo "- [ ] open PR → merge → release via \`bash infra/deploy/scripts/release.sh\`"
  } > "docs/work-orders/$NUM.md"

  git add "docs/work-orders/$NUM.md"
  git -c user.name="Pipeline" -c user.email="pipeline@numberverse.local" \
      commit -q -m "chore: work order #$NUM — $TITLE"
  git push -q -u origin "$BR" 2>&1 | tail -1 || git push -q -u origin "$BR"

  # 5. Move the issue to in-progress on the board + project.
  gh issue edit --repo "$R" "$NUM" --add-label "status: in-progress" --remove-label "status: todo" >/dev/null 2>&1 || true
  local CARD
  CARD=$(gh project item-list 1 --owner numberverse-org --limit 50 2>/dev/null | grep -E "\s$NUM\s" | grep -o 'PVTI_[A-Za-z0-9_]*' | head -1 || true)
  if [ -n "$CARD" ]; then
    gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "'$PROJECT_ID'", itemId: "'$CARD'", fieldId: "'$FIELD_ID'", value: { singleSelectOptionId: "'$INPROG_OPT'" } }) { projectV2Item { id } } }' >/dev/null 2>&1 || true
  fi

  # 6. Page the human: a work order is ready to implement.
  _tg "⚡ Pipeline: work order ready → #$NUM $TITLE ($MS)
Branch: feat/issue-$NUM
Plan: docs/work-orders/$NUM.md
Implement it, open a PR, and the loop takes it home."

  git checkout -q main
  log "conductor: work order #$NUM ready → $BR (board → in-progress, paged)"
  _snapshot
}

# ── release train: auto-cut when enough merged feature work landed ──────────
release_train(){
  acquire release-train
  cd "$ROOT"

  # Bootstrap guard: the FIRST release is manual (release.sh 0.24.1 "…"). After
  # it ships, docs/LATEST_RELEASE.md exists and the train arms for everything after.
  if [ ! -f docs/LATEST_RELEASE.md ]; then
    log "release-train: bootstrap — no LATEST_RELEASE.md yet. First release is manual; train arms after the first semver ships."
    exit 0
  fi
  LAST=$(head -1 docs/LATEST_RELEASE.md)   # e.g. 0.24.1 (or legacy v28)
  git fetch -q origin --tags

  # Count feature/fix commits on main since the last release tag.
  local COUNT=0 FEATS=0
  if git rev-parse -q --verify "refs/tags/$LAST" >/dev/null 2>&1; then
    # --format=%s gives the bare subject — the ^(feat|fix) anchor matches.
    # (git log --oneline puts the short hash FIRST, so ^(feat|fix) never matched = 0 forever.)
    COUNT=$(git log --format=%s "$LAST..origin/main" 2>/dev/null | grep -cE '^(feat|fix)' || true)
    FEATS=$(git log --format=%s "$LAST..origin/main" 2>/dev/null | grep -c '^feat' || true)
  fi
  local THRESHOLD="${RELEASE_THRESHOLD:-2}"
  if [ "$COUNT" -lt "$THRESHOLD" ]; then
    log "release-train: $COUNT unreleased feat/fix commits (< $THRESHOLD) — waiting."
    exit 0
  fi

  # TRUE SEMVER next-version: features bump MINOR (X.(Y+1).0), fix-only bumps
  # PATCH (X.Y.(Z+1)). Normalizes a legacy "vN" LATEST into 0.N.0.
  local next
  local v_re="${LAST#v}"   # strip a legacy "v" prefix → "28" or "0.24.1"
  local ma mi pa
  if [[ "$v_re" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    ma=${BASH_REMATCH[1]}; mi=${BASH_REMATCH[2]}; pa=${BASH_REMATCH[3]}
  elif [[ "$v_re" =~ ^[0-9]+$ ]]; then
    ma=0; mi=$v_re; pa=0                     # legacy v28 → 0.28.0
  else
    log "release-train: could not parse version '$LAST' — aborting"
    exit 1
  fi
  if [ "$FEATS" -gt 0 ]; then
    next="$ma.$((mi + 1)).0"                  # feature release → minor bump
  else
    next="$ma.$mi.$((pa + 1))"                # fix-only release → patch bump
  fi
  local summary="release train — $COUNT merged since $LAST"
  log "release-train: cutting $next ($COUNT commits, $FEATS feats) → ${summary}"
  bash infra/deploy/scripts/release.sh "$next" "release train ($COUNT since $LAST)"
}

board(){ _snapshot; cat "$LOG_DIR/numberverse-board.md"; }

case "${1:-}" in
  conductor)   conductor ;;
  release-train) release_train ;;
  board)       board ;;
  *) echo "usage: pipeline.sh {conductor|release-train|board}"; exit 1 ;;
esac
