-- Public-safe rule and recovery note for DB-owned LLM scheduled jobs.
-- This migration intentionally does not include operator-specific job payloads,
-- private delivery targets, credentials, tokens, contacts, or live memory rows.

insert into public.zorg_logic_rules (
  rule_key,
  title,
  rule_text,
  rule_type,
  priority,
  privacy_scope,
  source_basis,
  applies_to,
  standard_checks,
  active
) values (
  'db_owned_scheduled_jobs_recovery_rule_20260713',
  'DB-Owned Scheduled Jobs',
  'LLM-governed operational jobs must be owned by Zorg MemoryDB tables such as memory_llm_scheduled_jobs and memory_llm_job_queue, not by ad hoc host cron entries. Runtime services may dispatch queued DB work, but schedules, prompts, delivery metadata, state, and recovery notes must be recoverable from PostgreSQL and encrypted DB backups. Public Zorg_MemoryDB may publish schemas, templates, dispatcher service files, and public-safe rules, but must not publish private operator job payloads, email addresses, chat IDs, credentials, tokens, contacts, transcripts, or live memory rows.',
  'operating_rule',
  'critical',
  'public_safe',
  'Operator correction on 2026-07-13: jobs must be inside Zorg_MemoryDB because GitHub/encrypted backup recovery is the recovery path if the system is lost.',
  array['scheduled_jobs','cron','recovery','dispatcher','zorg_memorydb','db_owned_jobs'],
  array[
    'Store durable job definitions in memory_llm_scheduled_jobs',
    'Use memory_llm_job_queue for queued runs and results',
    'Use dispatcher services only as workers, not as durable job definitions',
    'Keep private payloads and delivery targets out of public repositories',
    'Verify DB job rows and dispatcher health before disabling legacy cron entries'
  ],
  true
) on conflict (rule_key) do update set
  title = excluded.title,
  rule_text = excluded.rule_text,
  rule_type = excluded.rule_type,
  priority = excluded.priority,
  privacy_scope = excluded.privacy_scope,
  source_basis = excluded.source_basis,
  applies_to = excluded.applies_to,
  standard_checks = excluded.standard_checks,
  active = true,
  updated_at = now();
