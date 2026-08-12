#!/usr/bin/env bash
# Numberverse TLS cert expiry tripwire (#128).
#
# TLS for kids.munna-khan.xyz is terminated at the Cloudflare edge (the tunnel
# itself has no origin cert — the box serves plain HTTP to the tunnel). Cloudflare
# rotates its edge certs automatically, so this is a TRIPWIRE: it verifies the
# served certificate is valid and more than 14 days from expiry, and logs (or
# alerts) if it ever gets close. A near-expiry here means Cloudflare's
# auto-rotation broke — something worth human eyes.
#
# Usage (cron, daily):
#   0 7 * * *  bash /home/munna/numberverse-demo/infra/tunnel/cert-expiry-check.sh
# Env: NV_CERT_HOST (default kids.munna-khan.xyz), NV_CERT_DAYS (default 14)
set -euo pipefail

HOST="${NV_CERT_HOST:-kids.munna-khan.xyz}"
DAYS="${NV_CERT_DAYS:-14}"
LOG=/tmp/nv-cert-check.log

ENDDATE=$(echo | timeout 12 openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2-) || true
[ -n "$ENDDATE" ] || { echo "$(date '+%F %T') ✖ could not read cert enddate for $HOST" >> "$LOG"; exit 1; }

# enddate is like "Jun 12 12:34:56 2027 GMT" → epoch
END_EPOCH=$(date -d "$ENDDATE" +%s 2>/dev/null || true)
NOW_EPOCH=$(date +%s)
[ -n "$END_EPOCH" ] || { echo "$(date '+%F %T') ✖ could not parse enddate '$ENDDATE'" >> "$LOG"; exit 1; }
DAYS_LEFT=$(( (END_EPOCH - NOW_EPOCH) / 86400 ))

echo "$(date '+%F %T')  $HOST cert: $DAYS_LEFT days left (expires $ENDDATE)" >> "$LOG"
if [ "$DAYS_LEFT" -le 0 ]; then
  echo "$(date '+%F %T') ✖✖ CERT EXPIRED for $HOST!" >> "$LOG"
  exit 1
elif [ "$DAYS_LEFT" -lt "$DAYS" ]; then
  echo "$(date '+%F %T') ⚠ cert for $HOST under ${DAYS}d ($DAYS_LEFT) — check Cloudflare auto-rotation" >> "$LOG"
  exit 1
fi
exit 0
