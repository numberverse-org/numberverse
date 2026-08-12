#!/usr/bin/env bash
# Numberverse tunnel watchdog (#302) — restart cloudflared when the tunnel dies.
#
# Checks the PUBLIC hostname (the whole path: box tunnel → Cloudflare edge →
# origin) with a cache-busting query. A process-hang or dropped edge connection
# usually recovers with a clean cloudflared restart — this catches that the
# moment it happens, instead of at the next deploy.
#
# Deliberately simple + fail-open: on any uncertainty (curl errors, missing
# deps) it does NOT restart — restarting a healthy tunnel causes real downtime,
# false-restarts are worse than a blip. Only N CONSECUTIVE hard failures trigger.
#
# Usage: run from cron/systemd timer every 2 minutes:
#   * * * * *  bash /home/munna/numberverse-demo/infra/tunnel/tunnel-watch.sh
set -euo pipefail

TARGET="${TUNNEL_WATCH_URL:-https://kids.munna-khan.xyz}"
SERVICE="${TUNNEL_WATCH_SERVICE:-cloudflared}"
THRESHOLD="${TUNNEL_WATCH_THRESHOLD:-4}"          # consecutive failures before restart
FAILFILE="/tmp/nv-tunnel-watch-fails"
MAX_TIME="${TUNNEL_WATCH_MAX_TIME:-12}"

# Cache-busting query so the edge never serves a stale 200 for a dead tunnel.
URL="$TARGET/?nvtun=$$$(date +%s%N)"

probe() {
  curl -sf -o /dev/null --max-time "$MAX_TIME" "$URL" 2>/dev/null
}

if probe; then
  rm -f "$FAILFILE"
  exit 0
fi

# One failure — could be a transient network blip. Require N consecutive.
count=0
if [ -f "$FAILFILE" ]; then count=$(cat "$FAILFILE" 2>/dev/null || echo 0); fi
count=$((count + 1))
echo "$count" > "$FAILFILE"

if [ "$count" -ge "$THRESHOLD" ]; then
  echo "$(date '+%F %T') tunnel-watch: $TARGET failed ${count}x consecutively — restarting $SERVICE"
  # sudo -n (passwordless, verified on the box) so cron never hangs on a prompt;
  # falls back to plain systemctl for a root-cron setup. Either way, never die.
  sudo -n systemctl restart "$SERVICE" 2>/dev/null || systemctl restart "$SERVICE" 2>/dev/null || true
  rm -f "$FAILFILE"
fi
