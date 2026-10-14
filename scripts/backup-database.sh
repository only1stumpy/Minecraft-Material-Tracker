#!/usr/bin/env bash
set -euo pipefail
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
: "${DATABASE_URL:?Переменная DATABASE_URL обязательна}"
[[ "$DATABASE_URL" == postgres* ]] || { echo "DATABASE_URL должна указывать на PostgreSQL" >&2; exit 1; }
temporary="backups/antville-${stamp}.dump.tmp"
archive="backups/antville-${stamp}.dump"
trap 'rm -f "$temporary"' EXIT
pg_dump --format=custom --file="$temporary" "$DATABASE_URL"
pg_restore --list "$temporary" >/dev/null
mv -- "$temporary" "$archive"
trap - EXIT
echo "Создан и проверен $archive"
