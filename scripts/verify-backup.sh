#!/usr/bin/env bash
# Verifikasi file backup TANPA restore penuh.
# USE: npm run db:verify-backup -- backups/xxxxx.dump
# Cek: exists, size > 0, pg_restore --list dapat membaca archive.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source ./scripts/pg-tools.sh

FILE="${1:?Usage: npm run db:verify-backup -- <file>}"
if [ ! -f "$FILE" ]; then
  echo "ERROR: file tidak ada: $FILE" >&2
  exit 1
fi
if [ ! -s "$FILE" ]; then
  echo "ERROR: file kosong: $FILE" >&2
  exit 1
fi

if [ "$PG_RUNNER" = "host" ]; then
  ENTRIES="$(pg_exec pg_restore --list "$FILE" | grep -c "^;" || true)"
else
  CONTAINER="${PG_RUNNER#podman:}"
  TMP="/tmp/verify_$(date +%s).dump"
  podman cp "$FILE" "$CONTAINER:$TMP" >/dev/null
  # shellcheck disable=SC2064
  trap "podman exec '$CONTAINER' rm -f '$TMP' >/dev/null 2>&1 || true" EXIT
  ENTRIES="$(podman exec "$CONTAINER" pg_restore --list "$TMP" | grep -c "^;" || true)"
fi

if [ "${ENTRIES:-0}" -eq 0 ]; then
  echo "ERROR: archive tidak dapat dibaca / tidak berisi objek valid: $FILE" >&2
  exit 1
fi
echo "Backup VALID: $FILE ($(du -h "$FILE" | cut -f1), $ENTRIES objek)"
