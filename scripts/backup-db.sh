#!/usr/bin/env bash
# Backup PostgreSQL (custom format, cocok untuk pg_restore).
# USE: npm run db:backup
# Output: backups/<dbname>_YYYY-MM-DD_HHMMSS.dump (tidak dioverwrite).
# Exit non-zero bila gagal. Tidak mencetak credential.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source ./scripts/pg-tools.sh

mkdir -p backups
TS="$(date +%Y-%m-%d_%H%M%S)"
FILE="backups/${PGDATABASE}_${TS}.dump"
if [ -e "$FILE" ]; then
  echo "ERROR: file backup sudah ada, menolak overwrite: $FILE" >&2
  exit 1
fi

echo "Backing up database '${PGDATABASE}' via ${PG_RUNNER}..."
if [ "$PG_RUNNER" = "host" ]; then
  pg_exec pg_dump -Fc -f "$FILE"
else
  podman exec \
    -e PGHOST="$PGHOST" -e PGPORT="$PGPORT" \
    -e PGUSER="$PGUSER" -e PGPASSWORD="$PGPASSWORD" -e PGDATABASE="$PGDATABASE" \
    "${PG_RUNNER#podman:}" pg_dump -Fc > "$FILE"
fi

if [ ! -s "$FILE" ]; then
  echo "ERROR: file backup kosong/gagal dibuat." >&2
  rm -f "$FILE"
  exit 1
fi
echo "Backup OK: $FILE ($(du -h "$FILE" | cut -f1))"
