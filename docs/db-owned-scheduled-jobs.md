# DB-Owned Scheduled Jobs

Zorg MemoryDB scheduled jobs must be recoverable from PostgreSQL and the
Zorg_MemoryDB package, not from ad hoc host cron entries.

## Ownership Model

- `memory_llm_scheduled_jobs` is the durable source of truth for job names,
  schedules, prompts, delivery metadata, state, and recovery notes.
- `memory_llm_job_queue` stores queued and completed run records.
- `memory_db_llm_dispatcher.py` is only a worker. It listens for queued DB
  work, claims rows, runs the requested OpenClaw agent turn or command, and
  writes the result back to PostgreSQL.
- Host services may keep the dispatcher alive, but per-job timing and prompts
  must live in Zorg MemoryDB.

This keeps operational schedules recoverable from encrypted database backups
and from the public-safe Zorg_MemoryDB package structure.

## Installing The Dispatcher

For user-level installs, copy the packaged service template:

```bash
mkdir -p ~/.config/systemd/user
cp package/zorg/systemd/user/zorg-memorydb-llm-dispatcher.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now zorg-memorydb-llm-dispatcher.service
systemctl --user status zorg-memorydb-llm-dispatcher.service
```

Set `OPENCLAW_WORKSPACE`, `SQL_MEMORY_MAP`, or `OPENCLAW_BIN` in an override
when the install paths differ from the defaults.

## Recovery Checklist

1. Restore or repair PostgreSQL-backed Zorg MemoryDB first.
2. Verify `memory_llm_scheduled_jobs` and `memory_llm_job_queue` exist.
3. Restore encrypted private DB backups when operator-specific job payloads,
   private delivery targets, or credentials are needed.
4. Install and start the dispatcher service.
5. Confirm due rows enqueue and complete through `memory_llm_job_queue`.
6. Keep OpenClaw cron entries disabled or limited to non-durable compatibility
   shims; do not treat them as the source of truth.

## Privacy Boundary

The public repository may document structures, templates, and public-safe
rules. It must not publish private operator email addresses, chat IDs,
credentials, tokens, live job payloads, transcripts, contacts, or memory rows.
Those belong in the live DB and encrypted private backups.
