#!/usr/bin/env bash
# Numberverse rollback (#125) — restore a previous release's image after a
# failed deploy smoke test.
#
# Usage:  bash infra/deploy/scripts/rollback.sh <prev-version>
#
# The previous release's web+api images were built version-tagged on the box
# (`numberverse-demo-{web,api}:<version>`), so this is a NO-REBUILD restart:
# docker finds the old image locally and just starts containers from it. The
# ORIGIN (http://192.168.0.104:8080, bypasses the Cloudflare edge) is what
# rollback directly controls, so success is confirmed there — the edge catches
# up on its own and can lag minutes, which must NOT be reported as failure.
set -euo pipefail

VERSION="${1:?usage: rollback.sh <prev-version> (e.g. 0.26.13)}"
HOST="${HOST:-munna@192.168.0.104}"
REMOTE_DIR="${REMOTE_DIR:-numberverse-demo}"
ORIGIN="${ORIGIN:-http://192.168.0.104:8080}"
LIVE="https://kids.munna-khan.xyz"

echo "◆ rolling back web+api to ${VERSION} image (no rebuild)…"
if ! ssh "$HOST" "cd ${REMOTE_DIR}/infra/deploy && NV_VERSION=${VERSION} docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-build"; then
  echo "✖ rollback compose up failed (is image numberverse-demo-web:${VERSION} present?)" >&2
  exit 1
fi

echo "◆ verifying origin stamp == ${VERSION}…"
# Grep the bundle from a FILE, not a shell variable: the 1-2MB minified bundle
# is binary-ish (multibyte i18n + possible NULs), and `BODY=$(curl …)` +
# `grep -qF` intermittently MISSES the stamp even though `curl -o` always gets
# the full file. A size floor also rejects truncated downloads up front.
TMPBODY="$(mktemp -t nv-rollback-body.XXXXXX)"
trap 'rm -f "$TMPBODY"' EXIT
HIT=0
for i in 1 2 3 4 5 6; do
  BUST="nv$RANDOM$RANDOM"
  HTML=$(curl -sL --max-time 15 "$ORIGIN/?$BUST" || true)
  JS=$(printf '%s' "$HTML" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ -n "$JS" ]; then
    curl -sL --max-time 30 "$ORIGIN/$JS?$BUST" -o "$TMPBODY" || true
    # The bundle is ~1.9MB minified on one line; a short file is a bad/partial
    # response, so treat it as not-live and retry.
    if [ "$(wc -c < "$TMPBODY" 2>/dev/null || echo 0)" -ge 100000 ] && grep -qF "${VERSION}" "$TMPBODY"; then
      echo "  ✓ origin serves ${VERSION} (${JS}) — rollback is live (edge may lag)"
      HIT=1
      break
    fi
  fi
  echo "  … rollback stamp not live at origin yet (attempt ${i}/6), waiting 10s"
  sleep 10
done
if [ "$HIT" != "1" ]; then
  echo "  ✖ rollback restarted containers but origin does not serve ${VERSION}." >&2
  echo "  ✖ Manual check: ssh munna@192.168.0.104 && cd numberverse-demo && docker compose logs api web" >&2
  exit 1
fi
echo "◆ rollback complete — origin is back on ${VERSION} (${LIVE} edge catches up)."
