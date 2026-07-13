#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${1:-${OPENCLAW_WORKSPACE:-${WORKSPACE_DIR:-${HOME:?}/.openclaw/workspace}}}"
DB_HOST="${2:-${ZORG_DB_HOST:-127.0.0.1}}"
DB_PORT="${3:-${ZORG_DB_PORT:-5432}}"
DB_NAME="${4:-${ZORG_DB_NAME:-zorgdb}}"
DB_USER="${5:-${ZORG_DB_USER:-zorg}}"
DB_PASS="${6:-${ZORG_DB_PASSWORD:-}}"

mkdir -p "$WORKDIR"
mkdir -p "$WORKDIR/scripts"

if [ -z "$DB_PASS" ]; then
  echo "DB password argument required as arg 6" >&2
  exit 1
fi

if [ ! -d "$WORKDIR/.venv-sqlmem" ]; then
  python3 -m venv "$WORKDIR/.venv-sqlmem"
fi

"$WORKDIR/.venv-sqlmem/bin/pip" install --upgrade pip >/dev/null
"$WORKDIR/.venv-sqlmem/bin/pip" install psycopg2-binary >/dev/null

cat > "$WORKDIR/sql_memory_map.json" <<JSON
{
  "postgres": {
    "host": "$DB_HOST",
    "port": $DB_PORT,
    "database": "$DB_NAME",
    "user": "$DB_USER",
    "password": "$DB_PASS"
  },
  "table_map": {
    "MEMORY.md": "zorg_memory",
    "AGENTS.md": "md_agents",
    "SOUL.md": "md_soul",
    "USER.md": "md_user",
    "TOOLS.md": "md_tools",
    "IDENTITY.md": "md_identity",
    "HEARTBEAT.md": "md_heartbeat"
  }
}
JSON

cat <<'EOF'
DB memory bootstrap created.
Next required manual steps:
1. place memory_sql_tool.py and related tools into the workspace
2. apply DB schema/functions/materialized views
3. run verification commands:
   python "$WORKDIR/memory_sql_tool.py" tables
   python "$WORKDIR/memory_speed_test.py"
EOF
