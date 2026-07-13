#!/usr/bin/env bash
set -euo pipefail

TS="$(date +%F_%H%M%S)"
BASE_LOCAL="${ZORG_POSTGRES_BACKUP_TMP:-${OPENCLAW_HOME:-${HOME:?}/.openclaw}/backups/postgres/tmp}"
LOG_DIR="${ZORG_POSTGRES_BACKUP_LOG_DIR:-${OPENCLAW_HOME:-${HOME:?}/.openclaw}/backups/postgres/logs}"
LOG_FILE="$LOG_DIR/backup-$TS.log"
WORKSPACE="${OPENCLAW_WORKSPACE:-${WORKSPACE_DIR:-${HOME:?}/.openclaw/workspace}}"
MAP_PATH="${SQL_MEMORY_MAP:-${ZORG_SQL_MEMORY_MAP:-$WORKSPACE/sql_memory_map.json}}"
BACKUP_MODE="${ZORG_BACKUP_MODE:-direct}"
DB_CONT="${ZORG_BACKUP_DOCKER_CONTAINER:-local-postgres}"
LOCAL_TTL_HOURS="${ZORG_TEMP_BACKUP_TTL_HOURS:-24}"
GZIP_LEVEL="${ZORG_TEMP_BACKUP_GZIP_LEVEL:-1}"

mkdir -p "$BASE_LOCAL" "$LOG_DIR"

OUT_SQL="$BASE_LOCAL/zorgdb-$TS.sql.gz"
OUT_SCHEMA="$BASE_LOCAL/zorgdb-schema-$TS.sql.gz"

{
  echo "[$(date -Is)] starting postgres backup"

  if [[ "$BACKUP_MODE" == "direct" ]] && ! command -v pg_dump >/dev/null 2>&1; then
    if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -Fxq "$DB_CONT"; then
      echo "[$(date -Is)] host pg_dump not found; falling back to docker container $DB_CONT"
      BACKUP_MODE="docker"
    fi
  fi

  if [[ "$BACKUP_MODE" == "docker" ]]; then
    DB_USER="${ZORG_BACKUP_DB_USER:-zorg}"
    DB_NAME="${ZORG_BACKUP_DB_NAME:-zorgdb}"
    docker exec "$DB_CONT" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges | gzip "-$GZIP_LEVEL" > "$OUT_SQL"
    docker exec "$DB_CONT" pg_dump -U "$DB_USER" -d "$DB_NAME" --schema-only --no-owner --no-privileges | gzip "-$GZIP_LEVEL" > "$OUT_SCHEMA"
  else
    if ! command -v pg_dump >/dev/null 2>&1; then
      echo "pg_dump not found; install PostgreSQL client tools or set ZORG_BACKUP_MODE=docker" >&2
      exit 1
    fi

    DB_ENV="$(
      python3 - "$MAP_PATH" <<'PY'
import json
import shlex
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    postgres = json.load(f)["postgres"]

for env_key, cfg_key in [
    ("PGHOST", "host"),
    ("PGPORT", "port"),
    ("PGDATABASE", "database"),
    ("PGUSER", "user"),
    ("PGPASSWORD", "password"),
]:
    print(f"export {env_key}={shlex.quote(str(postgres.get(cfg_key, '')))}")
PY
    )"
    eval "$DB_ENV"
    pg_dump --no-owner --no-privileges | gzip "-$GZIP_LEVEL" > "$OUT_SQL"
    pg_dump --schema-only --no-owner --no-privileges | gzip "-$GZIP_LEVEL" > "$OUT_SCHEMA"
  fi

  # Temporary local retention only. Do not mirror DB backups to GitHub.
  # Backups are transaction artifacts for immediate rollback and are purged.
  find "$BASE_LOCAL" -type f -name 'zorgdb-*.sql.gz' -mmin "+$((LOCAL_TTL_HOURS * 60))" -delete || true
  find "$BASE_LOCAL" -type f -name 'zorgdb-schema-*.sql.gz' -mmin "+$((LOCAL_TTL_HOURS * 60))" -delete || true

  SIZE_MAIN=$(du -h "$OUT_SQL" | awk '{print $1}')
  SIZE_SCHEMA=$(du -h "$OUT_SCHEMA" | awk '{print $1}')
  echo "[$(date -Is)] local backup complete main=$SIZE_MAIN schema=$SIZE_SCHEMA"

  echo "[$(date -Is)] GitHub backup mirror disabled by operator rule"
  echo "[$(date -Is)] temporary local backup path=$BASE_LOCAL ttl_hours=$LOCAL_TTL_HOURS"

  echo "[$(date -Is)] backup run finished"
} | tee "$LOG_FILE"
