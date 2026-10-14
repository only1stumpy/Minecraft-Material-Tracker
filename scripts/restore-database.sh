#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Использование: RESTORE_DATABASE_URL=... RESTORE_TARGET_ISOLATED=YES npm run db:restore -- /path/to/backup.dump" >&2
  exit 1
fi

backup_file=$1

if [[ -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "RESTORE_DATABASE_URL обязательна; DATABASE_URL не используется как цель восстановления" >&2
  exit 1
fi
if [[ "${RESTORE_TARGET_ISOLATED:-}" != "YES" ]]; then
  echo "Для восстановления нужно явно задать RESTORE_TARGET_ISOLATED=YES" >&2
  exit 1
fi

postgres_identity() {
  local database_url=$1

  MMT_DATABASE_URL="$database_url" node --input-type=module - 2>/dev/null <<'NODE'
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

const port = parsed.port || '5432';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  process.exit(1);
}

if (!parsed.pathname.startsWith('/') || parsed.pathname.length === 1) process.exit(1);

let databaseName;
try {
  databaseName = decodeURIComponent(parsed.pathname.slice(1));
} catch {
  process.exit(1);
}

const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
if (!host || !databaseName || /[\0\t\r\n]/u.test(databaseName)) process.exit(1);

process.stdout.write(`${host}\t${port}\t${databaseName}`);
NODE
}

if ! restore_identity="$(postgres_identity "$RESTORE_DATABASE_URL")"; then
  echo "RESTORE_DATABASE_URL должна быть корректным PostgreSQL URL с host, портом и именем базы" >&2
  exit 1
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  if ! database_identity="$(postgres_identity "$DATABASE_URL")"; then
    echo "DATABASE_URL задана некорректно; ожидается PostgreSQL URL" >&2
    exit 1
  fi
  if [[ "$restore_identity" == "$database_identity" ]]; then
    echo "RESTORE_DATABASE_URL не может совпадать с DATABASE_URL" >&2
    exit 1
  fi
fi

if [[ ! -f "$backup_file" || ! -r "$backup_file" ]]; then
  echo "Файл backup не найден или недоступен для чтения" >&2
  exit 1
fi

for command_name in pg_restore psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Не найдена команда $command_name; установите PostgreSQL client tools" >&2
    exit 1
  fi
done

if ! pg_restore --list "$backup_file" >/dev/null 2>&1; then
  echo "Файл backup не прошёл проверку pg_restore --list" >&2
  exit 1
fi

user_relations="$(psql -X -v ON_ERROR_STOP=1 -Atq "$RESTORE_DATABASE_URL" <<'SQL'
  SELECT count(*)
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND n.nspname NOT LIKE 'pg_temp_%'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S');
SQL
)"
if [[ "$user_relations" != "0" ]]; then
  echo "Целевая база не пустая: найдены пользовательские relations" >&2
  exit 1
fi

pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --dbname="$RESTORE_DATABASE_URL" \
  "$backup_file"

key_tables="$(psql -X -v ON_ERROR_STOP=1 -Atq "$RESTORE_DATABASE_URL" <<'SQL'
  SELECT
    (to_regclass('public."Building"') IS NOT NULL)::int
    + (to_regclass('public."Material"') IS NOT NULL)::int
    + (to_regclass('public."User"') IS NOT NULL)::int;
SQL
)"
if [[ "$key_tables" != "3" ]]; then
  echo 'После восстановления не найдены все ключевые таблицы: "Building", "Material", "User"' >&2
  exit 1
fi

echo "Восстановление проверено: ключевые таблицы найдены"
