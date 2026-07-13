# Zorg Memory 3D

Zorg Memory 3D is the standard local visualizer for a Zorg MemoryDB install.
It renders PostgreSQL-backed memory relationships, recall traces, rule weights,
scheduled-job activity, and runtime timing observations as an interactive 3D
graph with light and dark modes.

The service builds every graph response from PostgreSQL at request time. On
Vorg it connects to the PostgreSQL settings resolved from `SQL_MEMORY_MAP`
(or `ZORG_SQL_MEMORY_MAP`) and `OPENCLAW_WORKSPACE` (or `WORKSPACE_DIR`). It
does not read map/export data files other than the configured map. Set
`DATABASE_URL` or explicit `PG*` variables when a map is not used.
Database connection, statement, and request timeouts default to 8, 15, and 20
seconds respectively; override them with
`ZORG_MEMORY_3D_DB_CONNECT_TIMEOUT_MS`,
`ZORG_MEMORY_3D_DB_STATEMENT_TIMEOUT_MS`, and
`ZORG_MEMORY_3D_DB_QUERY_TIMEOUT_MS` when a larger installation needs more
time. The API now fails promptly instead of hanging indefinitely on a broken or
unindexed graph query.

The visualizer is part of the same Zorg MemoryDB update surface as LAN Command
Chat. Any skill, schema, installer, or runtime update must verify both apps
against the same PostgreSQL configuration.

Default URL on a Standard Ubuntu install:

```bash
http://127.0.0.1:8097/
```

Default URL on Docker Compose or Dockge installs:

```bash
docker compose port zorg-memory-3d 8097
```

Use `?theme=light` to open directly in light view.

## Install and run

The public installer copies this directory to `$OPENCLAW_WORKSPACE/memory-3d`,
runs `npm install --omit=dev`, checks `server.js`, and creates/enables the
`zorg-memory-3d` systemd service. The service listens on `8097` and uses the
same PostgreSQL configuration as MemoryDB through `DATABASE_URL`,
`SQL_MEMORY_MAP`/`ZORG_SQL_MEMORY_MAP`, or the explicit `PG*` variables.

For a manual install:

```bash
cd "$OPENCLAW_WORKSPACE/memory-3d"
npm install --omit=dev
npm run check
OPENCLAW_WORKSPACE="$OPENCLAW_WORKSPACE" PORT=8097 npm start
```

For systemd installs, verify and operate it with:

```bash
systemctl status zorg-memory-3d
systemctl restart zorg-memory-3d
curl -fsS http://127.0.0.1:8097/api/health
curl -fsS http://127.0.0.1:8097/api/graph
journalctl -u zorg-memory-3d -n 100 --no-pager
```

User-service installs use `systemctl --user` and the same service name. A
healthy `/api/health` response confirms PostgreSQL connectivity. `/api/graph`
must return JSON with `nodes` and `links`; empty arrays mean the database has
no graph-backed rows yet, while an HTTP 500 or connection error means the
service or PostgreSQL configuration is broken. Do not replace an empty graph
with fabricated data.

If the service is missing, run the public installer again. If it starts but
the graph is empty, verify the MemoryDB schema/import and recall activity, then
retry `/api/graph`; graph population is a database-data issue, not a reason to
claim the renderer is populated.
