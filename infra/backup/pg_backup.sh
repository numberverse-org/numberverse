#!/usr/bin/env bash
# Numberverse Postgres backup (#122/#310) — nightly pg_dump, AES-256 at rest,
# with retention + a restore-proof drill.
#
# Dumps the numberverse-demo-postgres container's `numberverse` database,
# gzips it, then ENCRYPTS it at rest with openssl AES-256-CBC (pbkdf2) using a
# 600-perm key file that lives OUTSIDE the dumps dir (never on-disk in plaintext,
# never in git). Keeps the 14 newest dumps. Restorability is proven by the
# --drill mode (decrypt → restore newest dump into a throwaway container, verify
# table count matches live, drop the container).
#
# Encryption (#310):
#   The key file is NOT auto-created — backup FAILS LOUDLY if it's missing so a
#   silently-empty key can never mint un-decryptable backups. Create it once:
#       openssl rand -base64 32 > /home/munna/backups/numberverse/.backup_key
#       chmod 600 /home/munna/backups/numberverse/.backup_key
#   Override the path with PG_BACKUP_KEY. The key is required — without it the
#   script exits before touching the database.
#
# Usage:
#   bash infra/backup/pg_backup.sh                 # take tonight's encrypted dump
#   bash infra/backup/pg_backup.sh --drill          # restore-drill on newest dump
#   CRON=1 bash infra/backup/pg_backup.sh           # quiet mode (crontab)
set -euo pipefail

# #922 — prod compose pins `container_name: numberverse-demo-postgres`, so the
# backup never depends on compose's generated `project-service-1` name (which
# changes if the service is renamed or scaled). Override for a non-standard box.
PG_CONTAINER="${PG_CONTAINER:-numberverse-demo-postgres}"
PG_USER="numberverse"
PG_DB="numberverse"
DEST_DIR="${PG_BACKUP_DIR:-/home/munna/backups/numberverse/pg}"
BACKUP_KEY="${PG_BACKUP_KEY:-/home/munna/backups/numberverse/.backup_key}"
RETENTION=14
QUIET=false
[[ "${CRON:-}" == "1" ]] && QUIET=true   # cron: log only, no chatter

# #310 — every dump is encrypted at rest. No key file → no backup (never silently
# create one: an auto-key only the script knows would be worse than plaintext).
[ -r "$BACKUP_KEY" ] || {
  echo "✖ backup key missing: $BACKUP_KEY" >&2
  echo "  create it once (backups can't be restored without it):" >&2
  echo "    openssl rand -base64 32 > $BACKUP_KEY && chmod 600 $BACKUP_KEY" >&2
  exit 1
}

# decrypt <file> → stdout: gzip stream. Handles BOTH the new .enc format
# (#310) and legacy plain .sql.gz, so old dumps stay restorable forever.
decrypt() {
  case "$1" in
    *.sql.gz.enc) openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "file:$BACKUP_KEY" < "$1" ;;
    *.sql.gz)     cat "$1" ;;
  esac
}

drill() {
  NEWEST=$(ls -1t "$DEST_DIR"/numberverse-*.sql.gz* 2>/dev/null | head -1)
  [ -n "$NEWEST" ] || { echo "✖ no dump to drill with" >&2; exit 1; }
  echo "── restore drill: $NEWEST ──"
  CID=$(docker run -d --rm --name nv-backup-drill \
        -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD=dri11 -e POSTGRES_DB="$PG_DB" \
        postgres:16-alpine)
  trap 'docker rm -f nv-backup-drill >/dev/null 2>&1 || true' EXIT
  # wait for the throwaway postgres to accept connections (max 30s)
  for _ in $(seq 1 30); do
    docker exec "$CID" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1 && break
    sleep 1
  done
  decrypt "$NEWEST" | gunzip | docker exec -i "$CID" psql -U "$PG_USER" -d "$PG_DB" -q >/dev/null
  LIVE=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
         "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
  DRILL=$(docker exec "$CID" psql -U "$PG_USER" -d "$PG_DB" -tAc \
         "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
  echo "  live=$LIVE tables  drill=$DRILL tables"
  if [ "$LIVE" = "$DRILL" ] && [ "$DRILL" -gt 0 ]; then
    echo "✓ restore drill PASSES ($DRILL tables, data restorable)"
  else
    echo "✖ restore drill FAILED: live=$LIVE drill=$DRILL" >&2
    exit 1
  fi
}

backup() {
  mkdir -p "$DEST_DIR"
  STAMP=$(date '+%Y%m%d-%H%M%S')
  OUT="$DEST_DIR/numberverse-$STAMP.sql.gz"
  ENC="$OUT.enc"
  [ "$QUIET" = false ] && echo "── dumping + encrypting $PG_CONTAINER:$PG_DB → $ENC ──"
  # dump → gzip → AES-256-CBC (pbkdf2, salted). The plaintext never hits disk.
  docker exec "$PG_CONTAINER" pg_dump -O -U "$PG_USER" -d "$PG_DB" | gzip \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass "file:$BACKUP_KEY" > "$ENC"
  # round-trip check: decrypt the thing we just wrote and verify it gzips clean,
  # so a bad key or a truncated write is caught BEFORE the plaintext dump is gone.
  decrypt "$ENC" | gzip -t || { echo "✖ encrypt→decrypt integrity check failed" >&2; exit 1; }
  rm -f "$OUT"   # never leave the plaintext gzip next to the ciphertext
  SIZE=$(du -h "$ENC" | cut -f1)
  echo "$(date '+%F %T')  $ENC  ($SIZE, AES-256)" >> "$DEST_DIR/last-backup.txt"
  # retention: keep the NEWEST $RETENTION dumps (encrypted) only
  ls -1t "$DEST_DIR"/numberverse-*.sql.gz.enc | tail -n +$((RETENTION + 1)) | xargs -r rm -f
  # #812 — legacy PLAINTEXT dumps (pre-#310, before encryption) accumulate forever
  # because only the .enc glob was pruned. Prune them too, bounded by the same
  # retention. They're restorable via decrypt() (the .sql.gz branch) but keeping
  # them beyond the retention window only wastes disk on unencrypted data — the
  # .enc copy of the same age is the keeper.
  ls -1t "$DEST_DIR"/numberverse-*.sql.gz | tail -n +$((RETENTION + 1)) | xargs -r rm -f
  KEEP=$(ls -1 "$DEST_DIR"/numberverse-*.sql.gz.enc | wc -l | tr -d ' ')
  [ "$QUIET" = false ] && echo "✓ encrypted dump done ($SIZE), $KEEP dumps kept (retention $RETENTION)"
}

case "${1:-}" in
  --drill) drill ;;
  *) backup ;;
esac
