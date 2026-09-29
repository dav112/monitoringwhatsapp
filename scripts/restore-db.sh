#!/usr/bin/env bash
# Restore PostgreSQL dari file backup (custom format).
# USE: npm run db:restore -- backups/xxxxx.dump [--no-prebackup]
# WAJIB konfirmasi ketik RESTORE (bisa via pipe). Tanpa itu: abort.
# Default membuat pre-backup dulu (kecuali --no-prebackup). Tidak mencetak credential.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source ./scripts/pg-tools.sh

FILE="${1:?Usage: npm run db:restore -- <backup-file> [--no-prebackup]}"
PREBACKUP=1
for arg in "$@"; do
  [ "$arg" = "--no-prebackup" ] && PREBACKUP=0
done
if [ ! -f "$FILE" ]; then
  echo "ERROR: file tidak ada: $FILE" >&2
  exit 1
fi

echo "WARNING: restore akan MENGGANTI isi database '${PGDATABASE}'." >&2
echo "WARNING: deletion bersifat irreversible — pastikan file benar: $FILE" >&2
printf "Type RESTORE to continue: "
read -r ANSWER || ANSWER=""
if [ "$ANSWER" != "RESTORE" ]; then
  echo "Aborted." >&2
  exit 1
fi

if [ "$PREBACKUP" = "1" ]; then
  echo "Membuat pre-restore backup dulu..."
  ./scripts/backup-db.sh
fi

echo "Restoring $FILE ke '${PGDATABASE}'..."
if [ "$PG_RUNNER" = "host" ]; then
  pg_exec pg_restore -c -d "$PGDATABASE" "$FILE"
else
  CONTAINER="${PG_RUNNER#podman:}"
  TMP="/tmp/restore_$(date +%s).dump"
  podman cp "$FILE" "$CONTAINER:$TMP" >/dev/null
  # shellcheck disable=SC2064
  trap "podman exec '$CONTAINER' rm -f '$TMP' >/dev/null 2>&1 || true" EXIT
  podman exec \
    -e PGHOST="$PGHOST" -e PGPORT="$PGPORT" \
    -e PGUSER="$PGUSER" -e PGPASSWORD="$PGPASSWORD" -e PGDATABASE="$PGDATABASE" \
    "$CONTAINER" pg_restore -c -d "$PGDATABASE" "$TMP"
fi
echo "Restore OK dari $FILE"
