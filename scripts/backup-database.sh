#!/usr/bin/env bash
set -euo pipefail
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
: "${DATABASE_URL:?Переменная DATABASE_URL обязательна}"
[[ "$DATABASE_URL" == postgres* ]] || { echo "DATABASE_URL должна указывать на PostgreSQL" >&2; exit 1; }
pg_dump --format=custom --file="backups/antville-${stamp}.dump" "$DATABASE_URL"
echo "Создан backups/antville-${stamp}.dump"
