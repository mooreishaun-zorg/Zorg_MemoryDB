# Schema summary

This reference captures the important DB-memory objects needed to reproduce the current behavior.

## Connection source

Current config comes from:

- `/home/openclaw/.openclaw/workspace/sql_memory_map.json`

Current values on this host:

- host: `10.7.69.200`
- port: `5432`
- database: `zorgdb`
- user: `zorg`

Do not hard-code credentials into user-visible chat output. Read them from `sql_memory_map.json` or the local secret/config path on the target system.

## Primary table: `zorg_memory`

Core columns observed in the current schema:

- `id uuid`
- `chat_session_log text`
- `logged_at timestamptz`
- `system_prompt text`
- `ai_response text`
- `ai_response_updated_at timestamptz`
- `memory_key text`
- `memory_value text`
- `memory_effective_date date`
- `memory_category text`
- `memory_priority text`
- `memory_active boolean`

Purpose:

- stores durable directives, preferences, ops facts, and imported/remembered context
- also acts as the base table for recent recall and broad text search

## Other mapped markdown tables

- `md_agents`
- `md_soul`
- `md_user`
- `md_tools`
- `md_identity`
- `md_heartbeat`

These tables hold imported line-based content from the corresponding markdown files.

## Materialized views

### `zorg_master_context_mv`

Purpose:

- prioritized top-level recall surface for directives, preferences, and operational facts

Observed behavior:

- merges directive-like records from `zorg_memory`
- merges active rows from `zorg_operational_facts`
- sorts by priority and timestamp

### `zorg_memory_search_mv`

Purpose:

- consolidated search surface across `zorg_memory` and mapped markdown tables

Observed behavior:

- unions content from `zorg_memory`, `md_agents`, `md_soul`, `md_user`, and other mapped markdown tables
- supports search-oriented indexes

## Supporting table

### `zorg_operational_facts`

Observed columns:

- `id uuid`
- `fact_key text`
- `fact_value text`
- `fact_category text`
- `fact_priority text`
- `active boolean`
- `updated_at timestamptz`

Purpose:

- stores durable operational facts that should be promoted into master recall context

## Query entry points used by the tooling

The current `memory_sql_tool.py` expects these callable/query surfaces to exist:

- `zorg_recall_context(query, limit)`
- `zorg_get_project_context(query, limit)`
- `zorg_get_host_context(query, limit)`
- `zorg_get_runbook_context(query, limit)`
- `zorg_master_context_mv`
- `zorg_memory`

## Indexes / search acceleration

Observed schema references include:

- GIN FTS index on `zorg_memory_search_mv.content`
- trigram index on `zorg_memory_search_mv.content`
- recency index on `zorg_memory_search_mv.event_ts`
- trigram indexes on `zorg_memory.memory_key`, `memory_value`, `chat_session_log`, and `ai_response`
- category/priority/date/active indexes on `zorg_memory`

## Schema source used for this reference

Reference extracted from:

- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/db/schema.sql`

## Additive vector/neural recall evolution

The schema should be allowed to evolve additively toward vector-database-like recall. Recommended additive layers:

- immutable/source memory rows remain preserved forever
- extracted semantic nodes for concepts, entities, projects, hosts, runbooks, tools, people, dates, and intents
- weighted semantic edges connecting source rows to nodes and to other rows
- embedding/vector slots or provider-agnostic vector metadata for future pgvector/ANN support
- recall hints explaining why records are related in LLM-readable language
- query-observation tables recording which memories helped answer which query patterns
- reinforcement weights from successful recall, recency, frequency, project relevance, user correction, and explicit hard-rule priority

These layers must be additive and reversible at the derived-layer level while never deleting source history.

## Fast recall surface

2026-04-30 additive optimization: `zorg_memory_search_fast_mv` precomputes lowercase content, English/simple tsvectors, source rank, and content length from `zorg_memory_search_mv`. `zorg_search_memory()` now uses this derived surface so search avoids repeated `lower()`/`to_tsvector()` work. Source memory remains untouched and preserved.

<!-- SCORCHED_MEMORY_RECALL_RULE -->
## Absolute Priority 0: Exhaustive Memory Before Response

The operator does not ask for work in context unless the needed information, access path, rule, contact, precedent, or working solution likely already exists somewhere in durable memory, project history, live configuration, runbooks, prompts, cron jobs, or related system state. A fast or shallow miss is never evidence of absence.

Before replying, asking a question, claiming uncertainty, or reporting a blocker, the assistant must scour the backend memory system deeply and creatively: use broader queries, alternate names, relationship terms, adjacent projects, prior similar tasks, contact records, operational history, runbooks, cron payloads, and live configuration clues until the relevant context is found or genuinely exhausted. Immediate answers are disallowed when memory could contain the answer.

If deep scouring finds information that the first query missed, treat that as a recall-structure failure and immediately add additive retrieval support: aliases, recall hints, semantic/relationship edges, query observations, indexes, materialized/search support, or rule surfaces so the same phrasing is fast and reliable next time. Preserve all source data; improve recall additively only.

Failure reports must not excuse the miss as “not enough information” when the information existed in memory. The correct diagnosis is inadequate recall behavior or structure, and the corrective action is deeper recall plus indexing/hinting/relationship repair.
<!-- /SCORCHED_MEMORY_RECALL_RULE -->

<!-- LLM_GOVERNED_PERFORMANCE_TUNING_RULE -->
## LLM-Governed Performance Tuning Rule

Database and memory performance tuning must be governed by live LLM judgment, not hidden script policy. Tuning work starts with a natural-language hypothesis formed from current system evidence and internet/authoritative research. If research gives a credible reason to believe a database design, recall-path, materialized-view, vector/neural association, or query-structure change will improve performance, the LLM must run side-by-side before/after measurements on representative queries before claiming success.

If research does not support a design change, move to raw additive performance work: indexes, query-path improvements, materialized/search-support views, relationships, recall hints, semantic edges, weighted connections, token/FTS/trigram support, and other non-destructive logic that brings query times down while preserving all source memory. No original memory data may be pruned, deleted, truncated, compacted away, or aged out for speed.

Every meaningful tuning change must record the research basis, before/after benchmark results, changed structures, rollback path, and follow-up indexing/hinting implications in durable memory and public-safe docs when structural behavior changes.
<!-- /LLM_GOVERNED_PERFORMANCE_TUNING_RULE -->

<!-- GO_ONLY_APPROVAL_RULE -->
## GO-Only Approval Rule

When Stefan gives a command that requires confirmation before execution, ask only for `GO`. Do not invent longer approval phrases, magic words, task-specific confirmations, or exact response strings such as `GO REIP ...`, `GO SCORCHED ...`, or any other expanded form. Stefan decides how to respond; the assistant may request only the simple approval token `GO`.

If the requested action is unsafe, ambiguous, destructive, externally risky, or missing a necessary decision, explain the blocker or the exact intended change briefly, then end with only `GO` as the approval request when approval is the only thing needed. Never require Stefan to repeat the task, include extra words, or match an assistant-authored phrase.
<!-- /GO_ONLY_APPROVAL_RULE -->

<!-- SAME_DAY_NEWS_FRESHNESS_RULE -->
## Same-Day News Freshness Rule

When writing multiple news articles or public reports on the same day, do not repeat the same information from article to article. Adjacent or continuing stories may reference earlier context only briefly when necessary, but each article must add fresh facts, new framing, new implications, new examples, or a clearly advanced continuation that was not already covered in earlier same-day articles.

Before drafting or publishing a new article, review the same-day feed/archive and compare titles, summaries, body claims, examples, and links. If information has already been used that day, either omit it, compress it to a short bridge, or explicitly advance it with new developments. Maintain editorial continuity without recycling paragraphs, talking points, examples, or conclusions.

The assistant owns the full article set and must keep the day’s coverage fresh, non-repetitive, and additive.
<!-- /SAME_DAY_NEWS_FRESHNESS_RULE -->


## Semantic neural recall v1 objects

2026-05-13 additive upgrade: queue-driven weighted semantic recall was added.

Primary objects:

- `memory_semantic_work_queue` - statused work queue for semantic association jobs; indexed by status/due/priority and source key.
- `memory_semantic_tuner_versions` - active tuner/worker metadata and safety notes.
- `memory_recall_weight_runs` - weighted recall audit rows.
- `memory_enqueue_semantic_job(...)` - idempotent enqueue helper using `pg_notify`.
- Trigger functions on `zorg_memory`, `zorg_contacts_crm`, and `zorg_success_query_index`.
- `zorg_weighted_recall_context(...)` - weighted recall entry point.
- `scripts/memory_semantic_worker.py` - bounded external worker for semantic nodes, weighted edges, query observations, and recall hints.

This layer keeps triggers lightweight and uses `FOR UPDATE SKIP LOCKED` worker claims. It does not run generated code inside PostgreSQL triggers and does not remove original/source memory data.
