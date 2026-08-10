#!/usr/bin/env bash
# Numberverse demo → munna@192.168.0.104, simplest possible:
#   rsync the repo → build + boot on the BOX → print the tunnel URL.
# All heavy work (npm install, vite, docker build) happens on the box.
set -euo pipefail

HOST="${HOST:-munna@192.168.0.104}"
REMOTE_DIR="${REMOTE_DIR:-numberverse-demo}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

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

echo "◆ build + boot on the box…"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR/infra/deploy"
cp -n .env.production.example .env.production || true
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
REMOTE

sleep 8
echo "◆ container status:"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR/infra/deploy"
docker compose -f docker-compose.prod.yml ps --format 'table {{.Service}}\t{{.Status}}'
REMOTE

echo "◆ demo served via the box's EXISTING Cloudflare named tunnel"
echo "  (id 7d5273d2-31dc-41ca-94b0-d36c1ad2d5a0, systemd service \`cloudflared\`)."
echo "  Ensure its dashboard ingress rule points at http://localhost:8080."
echo "◆ done. LAN fallback: http://$(echo "$HOST" | cut -d@ -f2):8080"
