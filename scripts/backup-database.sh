#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Переменная DATABASE_URL обязательна}"

if ! native_database_url="$(
  MMT_DATABASE_URL="$DATABASE_URL" node --input-type=module - 2>/dev/null <<'NODE'
const databaseUrl = process.env.MMT_DATABASE_URL;
if (typeof databaseUrl !== "string" || databaseUrl.length === 0) process.exit(1);

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  process.exit(1);
}

if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.hash) {
  process.exit(1);
}

parsed.searchParams.delete('schema');
process.stdout.write(parsed.toString());
NODE
)"; then
  echo "DATABASE_URL должна быть корректным PostgreSQL URL" >&2
  exit 1
fi

backup_directory="${BACKUP_DIRECTORY:-backups}"
mkdir -p -- "$backup_directory"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary="$backup_directory/antville-${stamp}.dump.tmp"
archive="$backup_directory/antville-${stamp}.dump"
trap 'rm -f "$temporary"' EXIT
pg_dump --format=custom --file="$temporary" "$native_database_url"
pg_restore --list "$temporary" >/dev/null
mv -- "$temporary" "$archive"
trap - EXIT
echo "Создан и проверен $archive"
