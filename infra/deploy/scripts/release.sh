#!/usr/bin/env bash
# Numberverse release pipeline — gates → stamp → changelog → tag → push → deploy.
#
# Usage:  bash infra/deploy/scripts/release.sh v11 "Taka Tap v2 + release pipeline"
#         bash infra/deploy/scripts/release.sh v11 "summary" --no-deploy
#
# Pushing the v* tag fires CI + .github/workflows/release.yml, which drafts the
# GitHub Release with auto-generated notes. This script then deploys to the box.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

VERSION="${1:?usage: release.sh <vN> <one-line summary> [--no-deploy]}"
SUMMARY="${2:?usage: release.sh <vN> <one-line summary> [--no-deploy]}"
NO_DEPLOY="false"; [[ " $* " == *" --no-deploy "* ]] && NO_DEPLOY="true"
TODAY=$(date '+%d %b %Y')
ROOT="$(pwd)"

echo "════════════════════════════════════════════════"
echo "  Numberverse release  $VERSION — $SUMMARY"
echo "════════════════════════════════════════════════"

echo "── 1/6 Quality gates ───────────────────────────"
pnpm --filter @numberverse/core build >/dev/null 2>&1 && echo "  ✓ core build"
(cd apps/kid && ./node_modules/.bin/tsc --noEmit -p tsconfig.json) && echo "  ✓ kid typecheck"
node apps/kid/scripts/audit.mjs 2>&1 | tail -1
python3 scripts/team/oracle_team.py --no-page 2>&1 | tail -1 | sed 's/^/  oracle: /'

echo "── 2/6 Bump build stamp + semver + tracker ────"
python3 - "$TODAY" "$VERSION" "$SUMMARY" <<'PY'
import re, sys
today, version, summary = sys.argv[1], sys.argv[2], sys.argv[3]
app = "apps/kid/src/App.tsx"
s = open(app, encoding="utf-8").read()
s = re.sub(r'const APP_BUILD = "[^"]*"', f'const APP_BUILD = "{today} · {version} ({summary})"', s)
# Semantic versioning (0.MAJOR.MINOR.PATCH → 0.25.0) — derived from the vN tag
# so it always tracks the release train. e.g. release.sh v25 → APP_VERSION 0.25.0.
m = re.match(r"v(\d+)", version)
if m:
    semver = f"0.{int(m.group(1))}.0"
    if not re.search(r"const APP_VERSION = ", s):
        s = s.replace('const APP_BUILD = ', f'const APP_VERSION = "{semver}";\n', 1)
    s = re.sub(r'const APP_VERSION = "[^"]*"', f'const APP_VERSION = "{semver}"', s)
open(app, "w", encoding="utf-8").write(s)
tr = "TRACKER.md"
t = open(tr, encoding="utf-8").read()
t = re.sub(r'> Last updated: [0-9]+ [A-Za-z]+ [0-9]{4}', f'> Last updated: {today}', t)
open(tr, "w", encoding="utf-8").write(t)
PY
grep -n "const APP_VERSION\|const APP_BUILD" apps/kid/src/App.tsx | sed 's/^/  ✓ /'

echo "── 3/6 Changelog since last tag ────────────────"
LAST=$(git describe --tags --abbrev=0 2>/dev/null || true)
if [ -n "$LAST" ]; then
  LOG=$(git log --oneline --no-decorate "$LAST..HEAD" 2>/dev/null | head -30)
  RANGE="$LAST → new"
else
  LOG=$(git log --oneline --no-decorate -25 HEAD)
  RANGE="all history (first tag)"
fi
[ -n "$LOG" ] || LOG="(no commits since $LAST — stamp/tag-only release)"
printf '## %s — %s (%s)\n\n%s\n\n' "$TODAY" "$VERSION" "$SUMMARY" "$LOG" > /tmp/rel_changelog.md
touch CHANGELOG.md
cat /tmp/rel_changelog.md CHANGELOG.md > /tmp/rel_merged.md && mv /tmp/rel_merged.md CHANGELOG.md
echo "  ✓ CHANGELOG.md prepended ($RANGE)"

echo "── 4/6 Commit + tag ────────────────────────────"
echo "$VERSION" > docs/LATEST_RELEASE.md   # arms the 24/7 release train after this release
git add apps/kid/src/App.tsx TRACKER.md CHANGELOG.md docs/LATEST_RELEASE.md
git commit -q -m "chore: $VERSION release — $SUMMARY"
git tag -a "$VERSION" -m "$VERSION — $SUMMARY"
echo "  ✓ committed + tagged $VERSION (release train armed)"

echo "── 5/6 Push (fires CI + GitHub Release) ────────"
git push -q origin main
git push -q origin "$VERSION"
echo "  ✓ main + tag pushed → release.yml will draft the Release"

if [ "$NO_DEPLOY" = "true" ]; then
  echo "── 6/6 SKIPPED (--no-deploy) ────────────────────"
  echo "  done. deploy when ready: bash infra/deploy/scripts/deploy.sh"
  exit 0
fi
echo "── 6/6 Deploy to box ───────────────────────────"
bash infra/deploy/scripts/deploy.sh

echo "════════════════════════════════════════════════"
echo "  ✅ $VERSION shipped. Live: https://kids.munna-khan.xyz"
echo "════════════════════════════════════════════════"
