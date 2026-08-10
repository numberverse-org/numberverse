#!/usr/bin/env bash
# Report the demo box's EXISTING Cloudflare named tunnel (systemd `cloudflared`,
# id 7d5273d2-31dc-41ca-94b0-d36c1ad2d5a0). The public hostname is whatever you
# configured in the Cloudflare dashboard for that tunnel; this just confirms the
# tunnel is connected and which process runs it.
HOST="${HOST:-munna@192.168.0.104}"
SSH_KEY="${SSH_KEY:-}"
ARGS=(-o BatchMode=yes -o ConnectTimeout=10)
[ -n "$SSH_KEY" ] && ARGS+=(-i "$SSH_KEY")
ssh "${ARGS[@]}" "$HOST" bash -s <<REMOTE
set -euo pipefail
systemctl is-active cloudflared
systemctl show cloudflared -p ActiveEnterTimestamp --value
echo "Public hostname: see the Cloudflare Zero Trust dashboard for tunnel"
echo "  7d5273d2-31dc-41ca-94b0-d36c1ad2d5a0 (ingress must point at http://localhost:8080)."
REMOTE
