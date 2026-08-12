#!/usr/bin/env bash
# Numberverse uptime monitor (#123) — ping the live site every 5 min, alert via
# Telegram on downtime, with a false-alarm guard (alert only after 3 consecutive
# failures ≈ 15 min) and a recovery message. Runs from crontab.
#
#   */5 * * * * CRON=1 bash ~/numberverse-demo/infra/monitor/uptime_monitor.sh
#
# Credentials: reads TG_BOT_TOKEN + TG_CHAT_ID from $HOME/.env.monitor (box-only,
# chmod 600, NEVER committed) or the process env. Without them the monitor still
# detects + logs downtime but skips the Telegram send (logs "telegram: not
# configured" once).
set -euo pipefail

LIVE="${MONITOR_LIVE:-https://kids.munna-khan.xyz}"
ORIGIN="${MONITOR_ORIGIN:-http://192.168.0.104:8080}"   # bypasses Cloudflare — the real health
THRESHOLD=3                            # consecutive failures before alerting
STATE_DIR="${MONITOR_STATE_DIR:-$HOME/.numberverse-monitor}"
STATE="$STATE_DIR/state.txt"
LOG="$STATE_DIR/monitor.log"
CRED_FILE="${HOME}/.env.monitor"
QUIET="${CRON:-0}"

mkdir -p "$STATE_DIR"

# ── load telegram creds (box-only file, never in the repo) ────────────────
tg_token=""; tg_chat=""
if [ -f "$CRED_FILE" ]; then
  tg_token=$(sed -n 's/^TG_BOT_TOKEN=//p' "$CRED_FILE" | head -1 | tr -d '\r')
  tg_chat=$(sed -n 's/^TG_CHAT_ID=//p' "$CRED_FILE" | head -1 | tr -d '\r')
fi
[ -z "$tg_token" ] && tg_token="${TG_BOT_TOKEN:-}"
[ -z "$tg_chat" ] && tg_chat="${TG_CHAT_ID:-}"
TG_READY=0; [ -n "$tg_token" ] && [ -n "$tg_chat" ] && TG_READY=1

# ── persistent state ──────────────────────────────────────────────────────
fail=0; last="unknown"; down_since=""; alerted=0; recovered_logged=1
if [ -f "$STATE" ]; then
  # shellcheck disable=SC1090
  . "$STATE"
fi
now=$(date '+%Y-%m-%d %H:%M:%S')

# ── single HTTP probe (cache-busted, 12s timeout) ─────────────────────────
probe() {
  curl -sL --max-time 12 -o /dev/null -w '%{http_code}' -H 'Cache-Control: no-cache' "$1/?nv$RANDOM$RANDOM" || echo 000
}

# ── telegram send (Bot API) ───────────────────────────────────────────────
tg_send() {
  [ "$TG_READY" = "1" ] || { [ "$QUIET" = "0" ] && echo "telegram: not configured (missing TG creds)"; return 1; }
  local text="$1"
  curl -s --max-time 10 -o /dev/null -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -d "{\"chat_id\":\"$tg_chat\",\"text\":\"$text\",\"disable_web_page_preview\":true}" \
    "https://api.telegram.org/bot$tg_token/sendMessage" 2>/dev/null | grep -q 200
}

# ── --test: send a one-off "monitor online" message (setup/verification) ───
if [ "${1:-}" = "--test" ]; then
  now=$(date '+%Y-%m-%d %H:%M:%S')
  if tg_send "🔔 Numberverse uptime monitor is <b>online</b> ($now) — pings $LIVE + origin every 5 min, alerts after ${THRESHOLD} consecutive failures."; then
    echo "✓ test alert sent"
    exit 0
  fi
  echo "✖ test alert failed (missing TG creds in $CRED_FILE?)" >&2
  exit 1
fi

save_state() {
  cat > "$STATE" <<EOS
fail=$fail
last=$last
down_since="$down_since"
alerted=$alerted
recovered_logged=$recovered_logged
EOS
}

# ── check live + origin ───────────────────────────────────────────────────
code_live=$(probe "$LIVE")
code_origin=$(probe "$ORIGIN")

if [ "$code_live" = "200" ] || [ "$code_origin" = "200" ]; then
  # UP (origin 200 OR tunnel 200 — a healthy release is reachable somewhere)
  if [ "$fail" -ge "$THRESHOLD" ]; then
    # recovering from an episode — notify
    echo "$now  UP (live=$code_live origin=$code_origin) after ${fail} failures — sending recovery" >> "$LOG"
    [ "$QUIET" = "0" ] && echo "recovered after $fail failures"
    tg_send "✅ Numberverse is <b>back up</b> (${now}). Downtime episode ended." >> "$LOG" 2>&1 || true
    fail=0; down_since=""; alerted=0; recovered_logged=1
  else
    # normal healthy tick
    [ "$QUIET" = "0" ] && echo "ok (live=$code_live origin=$code_origin)"
    [ "$last" != "up" ] && echo "$now  UP (live=$code_live origin=$code_origin)" >> "$LOG"
    fail=0
  fi
  last="up"
  save_state
  exit 0
fi

# DOWN (both probes failed)
fail=$((fail + 1))
[ -z "$down_since" ] && down_since="$now"
echo "$now  DOWN attempt $fail (live=$code_live origin=$code_origin)" >> "$LOG"
[ "$QUIET" = "0" ] && echo "down (attempt $fail/$THRESHOLD)"

if [ "$fail" -ge "$THRESHOLD" ] && [ "$alerted" != "1" ]; then
  # false-alarm guard crossed → alert once per episode
  tg_send "🚨 <b>Numberverse is DOWN</b> — live=$LIVE returned $code_live, origin=$ORIGIN returned $code_origin. Down since $down_since (${fail} consecutive probes)." \
    && alerted=1 \
    && echo "$now  ALERT sent (down since $down_since)" >> "$LOG" \
    || echo "$now  ALERT attempted (no tg or send failed)" >> "$LOG"
fi
last="down"
save_state
exit 0
