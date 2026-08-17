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
# #813 — a value can look non-empty yet still be the documented example
# placeholder (the example ships EMPTY with "CHANGE ME" comments; older copies
# carried literal change-me values). A known default is a known credential —
# never let prod boot on one. Fail + print the exact rotate command.
grep -qiE '^NV_JWT_SECRET=(change[-_]?me|demo1234|)$' "\$ENV_FILE" && {
  echo "✖ \$ENV_FILE: NV_JWT_SECRET is empty or still the example placeholder — rotate it now:" >&2
  echo "    openssl rand -hex 32" >&2
  exit 1
}
grep -qiE '^NV_ADMIN_PASSWORD=(change[-_]?me(admin)?|demo1234|)$' "\$ENV_FILE" && {
  echo "✖ \$ENV_FILE: NV_ADMIN_PASSWORD is empty/still 'change-me-admin' — set a real admin password:" >&2
  echo "    openssl rand -base64 18" >&2
  exit 1
}
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

# ── post-deploy smoke (#811) ─────────────────────────────────────────────────
# deploy.sh used to end at `docker compose ps` without verifying the stack actually
# serves the release. Assert (1) the origin /health reports status:ok AND (2) the
# served bundle carries NV_VERSION; exit non-zero with a rollback/manual-check hint
# on failure so a bad standalone deploy never prints "done".
ORIGIN="${ORIGIN:-http://$(printf '%s' "$HOST" | cut -d@ -f2):8080}"
SMOKE_BODY="$(mktemp -t nv-deploy-smoke.XXXXXX)"
trap 'rm -f "$SMOKE_BODY"' EXIT

# /health: nginx serves the static bundle even when api/DB are down — a bare 200 on
# the root is NOT health (see #810). Require JSON status:ok from the origin.
smoke_health() {
  local h
  h=$(curl -s --max-time 15 "$ORIGIN/health" || true)
  case "$h" in
    *'"status":"ok"'*|*'"status": "ok"'*) return 0 ;;
    *) echo "  ✖ smoke: /health NOT ok at $ORIGIN (got: ${h:-no response})" >&2; return 1 ;;
  esac
}

# bundle stamp — file-based grep, never $(curl) into a var: the ~1.9MB minified
# bundle is one line with multibyte i18n and can drop bytes in a shell var (#273).
# The stamp lives in the lazy App chunk on post-split builds (splash-first, #1217).
smoke_stamp() {
  local want="$1" bust js app
  bust="nv$RANDOM$RANDOM"
  js=$(curl -sL --max-time 15 "$ORIGIN/?$bust" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)
  [ -n "$js" ] || return 1
  curl -sL --max-time 30 "$ORIGIN/$js?$bust" -o "$SMOKE_BODY" || return 1
  [ "$(wc -c < "$SMOKE_BODY" 2>/dev/null || echo 0)" -ge 10000 ] || return 1
  grep -qF "$want" "$SMOKE_BODY" && return 0
  app=$(grep -oE 'App-[A-Za-z0-9_-]+\.js' "$SMOKE_BODY" | head -1 || true)
  [ -n "$app" ] || return 1
  curl -sL --max-time 30 "$ORIGIN/assets/$app?$bust" -o "$SMOKE_BODY" || return 1
  [ "$(wc -c < "$SMOKE_BODY" 2>/dev/null || echo 0)" -ge 100000 ] || return 1
  grep -qF "$want" "$SMOKE_BODY"
}

# #811 — retry over the boot window; health + stamp must both pass (stamp checked
# only when NV_VERSION is a real version — `latest` has nothing meaningful to match).
SMOKE_OK=0
for i in 1 2 3 4 5 6 7 8; do
  if [ "$NV_VERSION" = "latest" ]; then
    smoke_health && SMOKE_OK=1
  else
    smoke_health && smoke_stamp "$NV_VERSION" && SMOKE_OK=1
  fi
  [ "$SMOKE_OK" = "1" ] && break
  [ "$i" -lt 8 ] && { echo "  … not live yet (attempt $i/8), waiting 10s"; sleep 10; }
done
if [ "$SMOKE_OK" != "1" ]; then
  echo "  ✖ POST-DEPLOY SMOKE FAILED at $ORIGIN (health or version stamp $NV_VERSION)." >&2
  echo "    Roll back to the previous release:  bash infra/deploy/scripts/rollback.sh <prev-version>" >&2
  echo "    Manual check: ssh $HOST && cd $REMOTE_DIR/infra/deploy && docker compose logs api web" >&2
  exit 1
fi

echo "◆ demo served via the box's EXISTING Cloudflare named tunnel"
echo "  (id 7d5273d2-31dc-41ca-94b0-d36c1ad2d5a0, systemd service \`cloudflared\`)."
echo "  Ensure its dashboard ingress rule points at http://localhost:8080."
echo "◆ done. POST-DEPLOY SMOKE PASSED (health ok + $NV_VERSION served)."
echo "  LAN fallback: http://$(echo "$HOST" | cut -d@ -f2):8080"
