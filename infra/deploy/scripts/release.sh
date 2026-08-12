#!/usr/bin/env bash
# Numberverse release pipeline — gates → stamp → changelog → tag → push → deploy.
#
# Usage:  bash infra/deploy/scripts/release.sh 0.24.1 "Moni plan-driven sessions"
#         bash infra/deploy/scripts/release.sh 0.24.1 "summary" --no-deploy
#
# Versions are TRUE SEMVER (0.MAJOR.MINOR.PATCH). Pushing the semver tag fires
# CI + .github/workflows/release.yml, which drafts the GitHub Release with
# auto-generated notes. This script then deploys to the box.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

VERSION="${1:?usage: release.sh <X.Y.Z> <one-line summary> [--no-deploy]}"
SUMMARY="${2:?usage: release.sh <X.Y.Z> <one-line summary> [--no-deploy]}"
# Enforce semver (X.Y.Z) — never accept a bare vN again.
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "✖ version must be SEMVER (X.Y.Z), got '$VERSION'. e.g. release.sh 0.24.1 'summary'" >&2
  exit 1
fi
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
# True SEMVER — the release version IS the semver, used verbatim (0.MAJOR.MINOR.PATCH).
semver = version
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

# #121 — post-deploy smoke test: the stamp MUST be live. curl the deployed
# bundle and assert it carries this release's APP_BUILD string. Fail loudly
# with the rollback hint (the box still runs the previous tag until retag).
# The box sits behind a Cloudflare tunnel whose edge caches the HTML/bundle,
# so requests carry a no-cache header + a cache-busting query param and we
# retry for up to ~2 minutes (the edge can lag the origin after a deploy).
echo "── 6/7 Smoke test (live stamp) ─────────────────"
LIVE="https://kids.munna-khan.xyz"
HIT=0
for i in 1 2 3 4 5 6 7 8; do
  BUST="nv$RANDOM$RANDOM"
  HTML=$(curl -sL --max-time 15 -H 'Cache-Control: no-cache' "$LIVE/?$BUST" || true)
  JS=$(printf '%s' "$HTML" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ -n "$JS" ]; then
    BODY=$(curl -sL --max-time 20 -H 'Cache-Control: no-cache' "$LIVE/$JS?$BUST" || true)
    if printf '%s' "$BODY" | grep -qF "$VERSION"; then
      echo "  ✓ $LIVE serves $VERSION ($JS)"
      HIT=1
      break
    fi
  fi
  echo "  … stamp not live yet (attempt $i/8), waiting 15s"
  sleep 15
done
if [ "$HIT" != "1" ]; then
  echo "  ✖ POST-DEPLOY SMOKE FAILED: $LIVE does not serve $VERSION." >&2
  echo "  ✖ The previous tag is still live. Rollback hint: the box was NOT" >&2
  echo "     retagged (we never create a new tag for a failed deploy), so" >&2
  echo "     re-run after fixing, or check: ssh munna@192.168.0.104 &&" >&2
  echo "     cd numberverse-demo && docker compose logs api web" >&2
  exit 1
fi

echo "════════════════════════════════════════════════"
echo "  ✅ $VERSION shipped + smoke-tested. Live: $LIVE"
echo "════════════════════════════════════════════════"
