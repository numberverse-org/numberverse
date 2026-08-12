#!/usr/bin/env bash
# Numberverse rollback (#125) — restore a previous release's image after a
# failed deploy smoke test.
#
# Usage:  bash infra/deploy/scripts/rollback.sh <prev-version>
#
# The previous release's web+api images were built version-tagged on the box
# (`numberverse-demo-{web,api}:<version>`), so this is a NO-REBUILD restart:
# docker finds the old image locally and just starts containers from it. Then
# the live stamp is smoke-checked (cache-busting, up to ~2 min for the edge).
set -euo pipefail

VERSION="${1:?usage: rollback.sh <prev-version> (e.g. 0.26.13)}"
HOST="${HOST:-munna@192.168.0.104}"
REMOTE_DIR="${REMOTE_DIR:-numberverse-demo}"
LIVE="https://kids.munna-khan.xyz"

echo "◆ rolling back web+api to $VERSION image (no rebuild)…"
if ! ssh "$HOST" "cd $REMOTE_DIR/infra/deploy && NV_VERSION=$VERSION docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-build"; then
  echo "✖ rollback compose up failed (is image numberverse-demo-web:$VERSION present?)" >&2
  exit 1
fi

echo "◆ verifying live stamp == $VERSION…"
HIT=0
for i in 1 2 3 4 5 6 7 8; do
  BUST="nv$RANDOM$RANDOM"
  HTML=$(curl -sL --max-time 15 -H 'Cache-Control: no-cache' "$LIVE/?$BUST" || true)
  JS=$(printf '%s' "$HTML" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ -n "$JS" ]; then
    BODY=$(curl -sL --max-time 20 -H 'Cache-Control: no-cache' "$LIVE/$JS?$BUST" || true)
    if printf '%s' "$BODY" | grep -qF "$VERSION"; then
      echo "  ✓ $LIVE serves $VERSION ($JS) — rollback is live"
      HIT=1
      break
    fi
  fi
  echo "  … rollback stamp not live yet (attempt $i/8), waiting 15s"
  sleep 15
done
if [ "$HIT" != "1" ]; then
  echo "  ✖ rollback restarted containers but $LIVE does not serve $VERSION." >&2
  echo "  ✖ Manual check: ssh munna@192.168.0.104 && cd numberverse-demo && docker compose logs api web" >&2
  exit 1
fi
echo "◆ rollback complete — live is back on $VERSION."
