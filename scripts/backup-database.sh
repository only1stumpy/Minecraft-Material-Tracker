#!/usr/bin/env bash
set -euo pipefail
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ "${DATABASE_URL:-}" == postgres* ]]; then
  pg_dump --format=custom --file="backups/antville-${stamp}.dump" "$DATABASE_URL"
  echo "Создан backups/antville-${stamp}.dump"
else
  source_file="prisma/dev.db"
  [[ -f "$source_file" ]] || { echo "База $source_file не найдена" >&2; exit 1; }
  cp --preserve=timestamps "$source_file" "backups/antville-${stamp}.db"
  echo "Создан backups/antville-${stamp}.db"
fi
