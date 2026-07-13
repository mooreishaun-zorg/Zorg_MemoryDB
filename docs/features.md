# Consolidated Features

`zorg-db-memory` packages the MemoryDB-dependent behavior that used to be spread across separate processes.

## Memory Control

- DB-first recall before work or visible replies.
- Markdown memory lockout for normal operation.
- Rule Zero repair before unrelated work when memory tools fail.
- Secret-safe handling rules for database maps, environment files, backups, and local inventories.

## Bundled Tools

- SQL inspection through `memory_sql_tool.py`.
- Recall routing through `memory_recall_router.py`.
- Health checks through `memory_speed_test.py`.
- DB-only memory auto-heal through `db_only_memory_autoheal.py`.
- Semantic worker and dispatcher support through `memory_semantic_worker.py` and `memory_db_llm_dispatcher.py`.
- DB-owned LLM scheduled jobs through `memory_llm_scheduled_jobs`,
  `memory_llm_job_queue`, and the `zorg-memorydb-llm-dispatcher` service
  template. Host services may dispatch queued work, but durable schedules and
  prompts belong in PostgreSQL for recovery.
- PostgreSQL backup, recovery, install, and display helpers under `scripts/`.

## Context Window Process

- DB recall expansion before long work.
- Memory-addressed execution slices.
- Full process summaries stored through database-backed continuity.
- Current-slice-only active context so long jobs can continue without relying on large markdown memory files.

## Supporting Software

- LAN Command Chat source map and public-safe package references.
- Memory Brain 3D source map and screenshots.
- OpenClaw-as-base-install documentation so this repository stays focused on the Zorg MemoryDB layer.

## Release Boundary

The public package is not an instruction for every installed agent to update this GitHub repository. Publishing new package releases is a maintainer action after review, scans, and verification.
