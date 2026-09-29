#!/usr/bin/env bash
# Helper bersama: resolve pg tools (host atau podman exec) + parse DATABASE_URL.
# TIDAK PERNAH mencetak password/URL. Source dari script lain, jangan run langsung.
# Usage: source "$(dirname "$0")/pg-tools.sh"
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL belum diset (isi .env dulu)}"
DB_CONTAINER="${DB_CONTAINER:-wa-postgres}"

# Parse URL aman via node (tahan karakter spesial di password).
eval "$(node -e '
const u = new URL(process.env.DATABASE_URL);
const out = {
  PGHOST: u.hostname || "localhost",
  PGPORT: u.port || "5432",
  PGUSER: decodeURIComponent(u.username || "postgres"),
  PGPASSWORD: decodeURIComponent(u.password || ""),
  PGDATABASE: (u.pathname || "/postgres").replace(/^\//, "") || "postgres",
};
for (const [k, v] of Object.entries(out)) {
  console.log(`${k}=${JSON.stringify(v)}`);
}' )"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

# Resolve pg_dump/pg_restore/psql: host dulu, lalu podman exec container.
PG_RUNNER=""
if command -v pg_dump >/dev/null 2>&1 && command -v pg_restore >/dev/null 2>&1; then
  PG_RUNNER="host"
elif command -v podman >/dev/null 2>&1 && podman exec "$DB_CONTAINER" true >/dev/null 2>&1; then
  if podman exec "$DB_CONTAINER" sh -c 'command -v pg_dump >/dev/null && command -v pg_restore >/dev/null' >/dev/null 2>&1; then
    PG_RUNNER="podman:$DB_CONTAINER"
  fi
fi
if [ -z "$PG_RUNNER" ]; then
  echo "ERROR: pg_dump/pg_restore tidak ditemukan (host maupun container $DB_CONTAINER)." >&2
  exit 1
fi

# pg_exec <tool> [args...] — jalankan pg tool tanpa credential di argv/log.
pg_exec() {
  local tool="$1"; shift
  if [ "$PG_RUNNER" = "host" ]; then
    "$tool" "$@"
  else
    local container="${PG_RUNNER#podman:}"
    podman exec \
      -e PGHOST="$PGHOST" -e PGPORT="$PGPORT" \
      -e PGUSER="$PGUSER" -e PGPASSWORD="$PGPASSWORD" -e PGDATABASE="$PGDATABASE" \
      "$container" "$tool" "$@"
  fi
}
