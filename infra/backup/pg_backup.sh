#!/usr/bin/env bash
# Numberverse Postgres backup (#122) — nightly pg_dump to box disk with retention.
#
# Dumps the numberverse-demo-postgres-1 container's `numberverse` database to a
# gzipped file, keeps the 14 newest dumps, and records a last-run marker.
# Restorability is proven by the --drill mode (restore newest dump into a
# throwaway container, verify table count matches live, drop the container).
#
# Usage:
#   bash infra/backup/pg_backup.sh                 # take tonight's dump
#   bash infra/backup/pg_backup.sh --drill          # restore-drill on newest dump
#   CRON=1 bash infra/backup/pg_backup.sh           # quiet mode (crontab)
set -euo pipefail

PG_CONTAINER="numberverse-demo-postgres-1"
PG_USER="numberverse"
PG_DB="numberverse"
DEST_DIR="${PG_BACKUP_DIR:-/home/munna/backups/numberverse/pg}"
RETENTION=14
QUIET=false
[[ "${CRON:-}" == "1" ]] && QUIET=true   # cron: log only, no chatter

drill() {
  NEWEST=$(ls -1t "$DEST_DIR"/numberverse-*.sql.gz 2>/dev/null | head -1)
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
  gunzip -c "$NEWEST" | docker exec -i "$CID" psql -U "$PG_USER" -d "$PG_DB" -q >/dev/null
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
  [ "$QUIET" = false ] && echo "── dumping $PG_CONTAINER:$PG_DB → $OUT ──"
  docker exec "$PG_CONTAINER" pg_dump -O -U "$PG_USER" -d "$PG_DB" | gzip > "$OUT"
  gzip -t "$OUT" || { echo "✖ gzip integrity check failed" >&2; exit 1; }
  SIZE=$(du -h "$OUT" | cut -f1)
  echo "$(date '+%F %T')  $OUT  ($SIZE)" >> "$DEST_DIR/last-backup.txt"
  # retention: keep the NEWEST $RETENTION dumps only
  ls -1t "$DEST_DIR"/numberverse-*.sql.gz | tail -n +$((RETENTION + 1)) | xargs -r rm -f
  KEEP=$(ls -1 "$DEST_DIR"/numberverse-*.sql.gz | wc -l | tr -d ' ')
  [ "$QUIET" = false ] && echo "✓ dump done ($SIZE), $KEEP dumps kept (retention $RETENTION)"
}

case "${1:-}" in
  --drill) drill ;;
  *) backup ;;
esac
