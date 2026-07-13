# Zorg MemoryDB Install Package

This directory contains the public-safe Zorg MemoryDB and LAN command chat install package for OpenClaw.

## Contents

- `install-zorg-memorydb.sh` installs prerequisites and copies packaged components into the OpenClaw workspace.
- `requirements.txt` declares the Python DB driver used by the recall tools.
- `db/schema.sql` creates the database structure.
- `db/memory_recall_*_2026_07_10.sql` installs the stored-procedure recall API
  used by the packaged DB-first recall tools.
- `db/public_canonical_rules_update_2026_06_02.sql` is the single packaged
  rule file. It creates/updates `zorg_logic_rules`, inserts every public-safe
  addable rule, checks the expected count, and raises existing chat timing rule
  weights without creating replacement timing rules.
- `db/import_markdown_rules.py` imports packaged rules and retired markdown memory files into the database.
- `lan-command-chat/` contains the LAN command chat source bundle.
- `memory-3d/` contains the connected Memory Brain 3D source bundle used by
  the LAN Command Chat Memory 3D view.
- `systemd/user/zorg-memorydb-llm-dispatcher.service` keeps the DB-owned LLM
  scheduled-job dispatcher running. PostgreSQL owns job schedules and prompts;
  the service only claims queued work.
- `rules/` contains public-safe memory and install rules.

## Install Behavior

The OpenClaw installer calls this bootstrap when the package contains `zorg/install-zorg-memorydb.sh`. Set `ZORG_MEMORYDB_SKIP_BOOTSTRAP=1` to skip it for a special-purpose install.

The bootstrap prepares the database, LAN command chat, and connected Memory
Brain 3D source for clean installs and existing installs. It preserves existing
user data; the separate `prepare_public_baseline.sql` file is only for building
a distributable public baseline and must not be run against a live user database.

The installer also prepares the Memory Brain 3D Node service: it installs the
bundle dependencies, runs the syntax check, and creates/enables
`zorg-memory-3d` on port `8097`. Verify it with
`curl -fsS http://127.0.0.1:8097/api/health` and
`curl -fsS http://127.0.0.1:8097/api/graph`. LAN Chat remains a separate web
service; the native Android client is a separate APK and is not part of either
web service.

Clean installs import only the packaged bootstrap and recovery rules. Legacy
`memory/**/*.md` migration is opt-in with `ZORG_IMPORT_RETIRED_MEMORY=1`; those
files are never required for normal operation and are not included in release
archives.

When the add-on bootstrap is run through `sudo` without an explicit `OPENCLAW_HOME`, it installs into the invoking user's home directory instead of `/root`. This keeps the generated LAN command chat systemd service and its workspace on the same readable path. Set `OPENCLAW_HOME` explicitly only when a root-owned install is intentional.

## Database Authentication

The default clean-install path uses a blank PostgreSQL password and configures passwordless access only to local loopback. Remote PostgreSQL hosts are not configured as unauthenticated.

## Agent-Readable Markdown

The bootstrap writes a Zorg MemoryDB usage block into the OpenClaw workspace markdown files the agent reads at startup: `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `IDENTITY.md`, and `HEARTBEAT.md`. It also copies `RESURRECTION.md` and `ZORG_MEMORYDB_MASTER_RULES.md` into the workspace root.

This is required because importing rules into PostgreSQL alone is not enough: the local LLM must be able to read how to use the database memory path before it can reliably call the DB-backed recall tools.

`RESURRECTION.md` is the filesystem-first recovery path for the case where the
database is empty, damaged, or unavailable. It tells a new agent where backups
live, how to run a recovery drill, how to restore a verified dump, and how to
verify recall after restore without relying on broken DB memory.

The Python recall tools install their dependencies from `zorg/requirements.txt` into `.venv-sqlmem`. They also re-exec through `.venv-sqlmem/bin/python` when launched with plain `python3`, so agent-readable commands do not fail just because the system Python lacks `psycopg2`.

## DB-Owned Scheduled Jobs

Recurring LLM-governed work belongs in PostgreSQL tables such as
`memory_llm_scheduled_jobs` and `memory_llm_job_queue`. Host-level cron entries
must not be the durable source of truth for operator jobs because a restored
system should recover schedules from Zorg MemoryDB and encrypted backups.

Use `docs/db-owned-scheduled-jobs.md` and the packaged
`systemd/user/zorg-memorydb-llm-dispatcher.service` template to keep a single
dispatcher worker running. Public packages may include schemas, service
templates, and public-safe rules only. Private job payloads, email addresses,
chat IDs, credentials, tokens, contacts, transcripts, and live rows stay in the
live database and encrypted private backups.

## Coding And Install Rule Discipline

Changes to this package must follow the documented OpenClaw/Zorg install procedures and existing package source patterns before code is written. Check the relevant docs, package metadata, lifecycle scripts, generated runtime artifacts, and clean-install behavior instead of relying on generic coding memory or assumed APIs.

Installer and package fixes are not complete until the actual documented path is verified. For this repository, that means testing the GitHub/package install path or the explicit existing-install overlay path that the documentation tells users to run, not only a local checkout.

## Direct npm prerequisite repair

`zorg/check-node-version.cjs` is intentionally duplicated from the root OpenClaw lifecycle helper into this packaged Zorg tree. Direct git installs can run npm lifecycle scripts from a temporary packed tree before every root development script is present. Keeping the Node prerequisite repair helper under `zorg/` makes the repair path available during `npm install -g --install-links=true git+https://github.com/StefRush2099/Zorg_MemoryDB.git`, including on old hosts that start with Node v12. The same helper also checks for a missing `npm` binary after Node is compatible and attempts OS package-manager repair before the install continues. When it upgrades Node from an old running npm process, it exits with a retry instruction so the repaired Node/npm runtime owns the actual package install.
