#!/usr/bin/env bash
# Numberverse GitHub reachability monitor — watch GitHub in this region and
# alert when normal (DNS) routing to github.com / api.github.com / ghcr.io
# drops. Runs from crontab every 5 min; alert after 3 consecutive failures
# (~15 min) with a recovery message when the block lifts.
#
#   */5 * * * * CRON=1 bash ~/numberverse-demo/infra/monitor/github_reachability_monitor.sh
#
# WHY THIS EXISTS
#   GitHub's Asia IPs (20.205.243.x) are intermittently unreachable from this
#   ISP while GitHub's US IPs (140.82.112.x) still work — so `git push`/
#   `gh api`/`ghcr.io` pulls time out but HTTPS to a US IP succeeds. This
#   monitor distinguishes:
#     · REGIONAL ROUTING BLOCK — default-DNS github.com/api/ghcr fail, but the
#       US-IP control routes still answer 200 → operator can still push via
#       GIT_SSH_COMMAND to 140.82.112.3 (the workaround), deploy needs Docker
#       Hub (already mirrored), and they should WAIT for the block to lift.
#     · GLOBAL GITHUB OUTAGE — even the US-IP controls fail → GitHub itself is
#       down everywhere, nothing to do but wait.
#     · FULL INTERNET OUT — even Docker Hub fails → the box/link is down.
#
# Credentials: same as uptime_monitor.sh — TG_BOT_TOKEN + TG_CHAT_ID from
# $HOME/.env.monitor (box-only, chmod 600, NEVER committed) or the env.
set -euo pipefail

# ── probes: the blocked (default-DNS) targets + control routes ─────────────
# Default-DNS targets — these are what breaks in a regional block:
GH_WEB_DNS="https://github.com"                  # → 20.205.243.x (Asia, blocked)
GH_API_DNS="https://api.github.com"              # → 20.205.243.x (Asia, blocked)
GHCR_DNS="https://ghcr.io/v2/"                   # → 20.205.243.x (Asia, blocked)
# Control routes — known-good US-IP / non-GitHub routes that tell us WHY:
DOCKER_HUB="https://registry-1.docker.io/v2/"    # Docker Hub (401 = reachable)

# The US-IP addresses that carry the SNI for the named GitHub hosts. These
# still answer 200 even when the Asia DNS routes (20.205.243.x) are blocked,
# which is how the monitor tells a REGIONAL block apart from a GLOBAL outage:
GH_WEB_US_IP="140.82.112.3"
GH_API_US_IP="140.82.112.6"

THRESHOLD=3                            # consecutive failures before alerting
STATE_DIR="${MONITOR_STATE_DIR:-$HOME/.numberverse-monitor}"
STATE="$STATE_DIR/github-state.txt"
LOG="$STATE_DIR/github-monitor.log"
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

# ── single HTTP probe (cache-busted, 8s timeout) ──────────────────────────
# Returns exactly "200" / "401" / … on success or "000" on failure. curl's
# -w '%{http_code}' prints "000" on timeout but ALSO exits non-zero, so a bare
# `|| echo 000` would double it to "000000". Capture the exit code instead:
# rc=0 → print the code curl emitted; rc≠0 → print 000 (never the doubled form).
probe() {
  local out rc
  out=$(curl -sL --max-time 8 -o /dev/null -w '%{http_code}' -H 'Cache-Control: no-cache' "$1" 2>/dev/null)
  rc=$?
  if [ "$rc" = "0" ] && [ -n "$out" ]; then echo "$out"; else echo 000; fi
}

# Same as probe, but force the TCP route to a specific IP while keeping the
# real hostname's SNI (GitHub's edge rejects a bare-IP SNI with 400). <resolve>
# is curl's "host:port:ip" form; $2 is the https URL whose hostname must match.
probe_resolve() {
  local resolve="$1" url="$2" out rc
  out=$(curl -sL --max-time 8 -o /dev/null -w '%{http_code}' -H 'Cache-Control: no-cache' --resolve "$resolve" "$url" 2>/dev/null)
  rc=$?
  if [ "$rc" = "0" ] && [ -n "$out" ]; then echo "$out"; else echo 000; fi
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

# ── --test: one-off "monitor online" message (setup/verification) ──────────
if [ "${1:-}" = "--test" ]; then
  now=$(date '+%Y-%m-%d %H:%M:%S')
  if tg_send "🔔 GitHub reachability monitor is <b>online</b> ($now) — pings github.com/api/ghcr.io every 5 min, alerts after ${THRESHOLD} consecutive failures, distinguishes regional-block vs global-outage."; then
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

# ── probe everything ──────────────────────────────────────────────────────
# Blocked-target status (0 = reachable, 1 = unreachable)
dns_web=$(probe "$GH_WEB_DNS");    [ "$dns_web" = "000" ] && dns_web_down=1 || dns_web_down=0
dns_api=$(probe "$GH_API_DNS");    [ "$dns_api" = "000" ] && dns_api_down=1 || dns_api_down=0
dns_ghcr=$(probe "$GHCR_DNS");     [ "$dns_ghcr" = "000" ] && dns_ghcr_down=1 || dns_ghcr_down=0

# Control routes
us_web=$(probe_resolve "github.com:443:$GH_WEB_US_IP" "https://github.com/")
[ "$us_web" = "000" ] && us_web_down=1 || us_web_down=0
us_api=$(probe_resolve "api.github.com:443:$GH_API_US_IP" "https://api.github.com/")
[ "$us_api" = "000" ] && us_api_down=1 || us_api_down=0
hub=$(probe "$DOCKER_HUB");        [ "$hub" = "000" ] && hub_down=1 || hub_down=0

# The github.com DNS targets are blocked when default routing fails BUT the
# US-IP control works → regional block (not a GitHub outage).
gh_dns_blocked=0
[ "$dns_web_down" = "1" ] && [ "$dns_api_down" = "1" ] && [ "$dns_ghcr_down" = "1" ] && gh_dns_blocked=1

# Diagnostic: is it regional or global?
region=1   # 1 = GitHub down in this region
[ "$us_web_down" = "1" ] && [ "$us_api_down" = "1" ] && region=0   # US routes dead → global
[ "$hub_down" = "1" ] && [ "$region" = "0" ] && region=2           # even docker hub dead → internet/link

# ── status summary ────────────────────────────────────────────────────────
if [ "$gh_dns_blocked" = "1" ] && [ "$region" = "1" ]; then
  verdict="REGIONAL-BLOCK github.com/api/ghcr.io unreachable via DNS; US-IP controls up"
elif [ "$gh_dns_blocked" = "1" ] && [ "$region" = "0" ]; then
  verdict="GLOBAL-OUTAGE github.com/api/ghcr.io unreachable AND US-IP controls dead"
elif [ "$gh_dns_blocked" = "1" ] && [ "$region" = "2" ]; then
  verdict="FULL-OUTAGE even Docker Hub unreachable — box/link down?"
else
  verdict="up (default DNS routing to GitHub restored)"
fi

if [ "$gh_dns_blocked" = "0" ]; then
  # UP — GitHub reachable via normal DNS routing again.
  if [ "$fail" -ge "$THRESHOLD" ]; then
    [ "$QUIET" = "0" ] && echo "recovered after $fail failures"
    echo "$now  UP (dns_web=$dns_web dns_api=$dns_api ghcr=$dns_ghcr) after ${fail} failures — sending recovery" >> "$LOG"
    tg_send "✅ <b>GitHub is reachable again in this region</b> (${now}). github.com=$dns_web api=$dns_api ghcr=$dns_ghcr. Downtime episode ended — you can <code>git push</code> / deploy normally." >> "$LOG" 2>&1 || true
    fail=0; down_since=""; alerted=0; recovered_logged=1
  else
    [ "$QUIET" = "0" ] && echo "ok (dns_web=$dns_web api=$dns_api ghcr=$dns_ghcr)"
    [ "$last" != "up" ] && echo "$now  UP (dns_web=$dns_web api=$dns_api ghcr=$dns_ghcr)" >> "$LOG"
    fail=0
  fi
  last="up"
  save_state
  exit 0
fi

# DOWN — GitHub's default DNS routes are unreachable.
fail=$((fail + 1))
[ -z "$down_since" ] && down_since="$now"
echo "$now  DOWN attempt $fail ($verdict; dns_web=$dns_web dns_api=$dns_api ghcr=$dns_ghcr us_web=$us_web us_api=$us_api hub=$hub)" >> "$LOG"
[ "$QUIET" = "0" ] && echo "down (attempt $fail/$THRESHOLD): $verdict"

if [ "$fail" -ge "$THRESHOLD" ] && [ "$alerted" != "1" ]; then
  # false-alarm guard crossed → alert once per episode.
  if [ "$region" = "1" ]; then
    alert_text="🚨 <b>GitHub unreachable in this region</b> — github.com=$dns_web api.github.com=$dns_api ghcr.io=$dns_ghcr (Asia IPs blocked). US-IP control routes are UP (web=$us_web api=$us_api), so GitHub is NOT down globally — <b>regional routing block</b>. Down since $down_since. Workaround: push via GIT_SSH_COMMAND to 140.82.112.3."
  elif [ "$region" = "0" ]; then
    alert_text="🚨 <b>GitHub appears DOWN GLOBALLY</b> — github.com=$dns_web api=$dns_api ghcr=$dns_ghcr AND the US-IP control routes are dead (web=$us_web api=$us_api). Down since $down_since. Nothing to do but wait."
  else
    alert_text="🚨 <b>GitHub down + internet/link suspect</b> — github.com/api/ghcr unreachable ($dns_web/$dns_api/$dns_ghcr) and even Docker Hub is dead ($hub). Check the box/link. Down since $down_since."
  fi
  tg_send "$alert_text" \
    && alerted=1 \
    && echo "$now  ALERT sent (down since $down_since): $verdict" >> "$LOG" \
    || echo "$now  ALERT attempted (no tg or send failed): $verdict" >> "$LOG"
fi
last="down"
save_state
exit 0
