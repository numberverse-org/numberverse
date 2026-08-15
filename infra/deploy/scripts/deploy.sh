#!/usr/bin/env bash
# Numberverse demo → munna@192.168.0.104, simplest possible:
#   rsync the repo → build + boot on the BOX → print the tunnel URL.
# All heavy work (npm install, vite, docker build) happens on the box.
set -euo pipefail

HOST="${HOST:-munna@192.168.0.104}"
REMOTE_DIR="${REMOTE_DIR:-numberverse-demo}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
# #125/#919 — release.sh passes NV_VERSION=<semver> so the box builds version-
# tagged images (`numberverse-demo-{web,api}:<version>`) that a failed smoke can
# roll back to. Standalone deploy (no NV_VERSION) reads the version release.sh
# already stamped into apps/kid/src/version.ts — prod never builds a floating
# `:latest` image.
NV_VERSION="${NV_VERSION:-$(grep -oE 'APP_VERSION = "[^"]+"' "$ROOT/apps/kid/src/version.ts" | head -1 | cut -d'"' -f2 || true)}"
NV_VERSION="${NV_VERSION:-latest}"

echo "◆ rsync repo → $HOST:$REMOTE_DIR"
rsync -az --delete -e ssh \
  --exclude node_modules --exclude '**/node_modules' \
  --exclude .next --exclude '**/.next' \
  --exclude '**/__pycache__' --exclude .venv --exclude '**/.venv' \
  --exclude .git --exclude '*.log' \
  --exclude '.env' --exclude '**/.env' \
  --exclude '.env.local' --exclude '**/.env.local' \
  --exclude '.env.production' --exclude '**/.env.production' \
  "$ROOT/" "$HOST:$REMOTE_DIR/"

echo "◆ build + boot on the box… (NV_VERSION=$NV_VERSION)"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR/infra/deploy"
cp -n .env.production.example .env.production || true

# #921/#924 — runtime secret guard: never boot production with empty/placeholder
# secrets or wildcard CORS. compose itself also requires NV_PG_PASSWORD/NV_VERSION.
ENV_FILE="\$PWD/.env.production"
[ -f "\$ENV_FILE" ] || { echo "✖ missing \$ENV_FILE (cp -n should have created it)" >&2; exit 1; }
grep -qE '^NV_PG_PASSWORD=.+' "\$ENV_FILE" || { echo "✖ \$ENV_FILE: NV_PG_PASSWORD is empty — set it (openssl rand -hex 16). See .env.production.example." >&2; exit 1; }
grep -qE '^NV_JWT_SECRET=.+' "\$ENV_FILE" || { echo "✖ \$ENV_FILE: NV_JWT_SECRET is empty — set it (openssl rand -hex 32). See .env.production.example." >&2; exit 1; }
grep -qE '^NV_ADMIN_PASSWORD=.+' "\$ENV_FILE" || { echo "✖ \$ENV_FILE: NV_ADMIN_PASSWORD is empty — set it. See .env.production.example." >&2; exit 1; }
grep -qE '^NV_CORS_ORIGINS=\*' "\$ENV_FILE" && { echo "✖ \$ENV_FILE: NV_CORS_ORIGINS must not be '*' in production." >&2; exit 1; }

NV_ENV_FILE="\$ENV_FILE" NV_VERSION="$NV_VERSION" docker compose --env-file "\$ENV_FILE" -f "\$PWD/docker-compose.prod.yml" up -d --build

# #auto-prune — image retention: keep the 2 newest numberverse-demo images per
# service so rollback.sh (no-rebuild) always has the previous release available,
# and drop older version tags + the stale floating :latest. The box once hit 97%
# full from ~100 accumulated version tags; this keeps it from creeping back.
for SVC in web api; do
  docker images "numberverse-demo-\$SVC" --format '{{.Tag}}' \
    | grep -E '^0\.' | sort -V | head -n -2 \
    | while read -r tag; do docker rmi -f "numberverse-demo-\$SVC:\$tag" >/dev/null 2>&1 || true; done
  docker rmi -f "numberverse-demo-\$SVC:latest" >/dev/null 2>&1 || true
done
REMOTE

sleep 8
echo "◆ container status:"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR/infra/deploy"
NV_VERSION="$NV_VERSION" docker compose --env-file "\$PWD/.env.production" -f "\$PWD/docker-compose.prod.yml" ps --format 'table {{.Service}}\t{{.Status}}'
REMOTE

echo "◆ demo served via the box's EXISTING Cloudflare named tunnel"
echo "  (id 7d5273d2-31dc-41ca-94b0-d36c1ad2d5a0, systemd service \`cloudflared\`)."
echo "  Ensure its dashboard ingress rule points at http://localhost:8080."
echo "◆ done. LAN fallback: http://$(echo "$HOST" | cut -d@ -f2):8080"
