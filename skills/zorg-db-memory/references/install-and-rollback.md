# Install and rollback

Use this when reproducing the current DB-memory behavior on another install.

## Required local artifacts

Current install uses:

- `/home/openclaw/.openclaw/workspace/.venv-sqlmem`
- `/home/openclaw/.openclaw/workspace/sql_memory_map.json`
- `/home/openclaw/.openclaw/workspace/memory_sql_tool.py`
- `/home/openclaw/.openclaw/workspace/memory_recall_router.py`
- `/home/openclaw/.openclaw/workspace/memory_speed_test.py`
- `/home/openclaw/.openclaw/workspace/db_benchmark_queries.json`

## Known-good install pattern

A known-good installer pattern exists in the backed-up Zorg_spawn implementation.

Observed install behavior:

1. create a pre-apply rollback SQL dump
2. apply schema / DB objects
3. install exported skills into workspace
4. install scripts:
   - `memory_sql_tool.py`
   - `memory_recall_router.py`
   - `memory_speed_test.py`
   - `scripts/postgres_memory_backup.sh`
5. place `sql_memory_map.json` in workspace
6. verify with live commands

## Verification commands

```bash
python /home/openclaw/.openclaw/workspace/memory_sql_tool.py tables
python /home/openclaw/.openclaw/workspace/memory_speed_test.py
```

## Rollback pattern

Known-good rollback pattern from Zorg_spawn:

```bash
gzip -dc Zorg_spawn/rollback/preapply-<timestamp>.sql.gz | \
  docker exec -i local-postgres psql -U zorg -d zorgdb
```

## Reproduction guidance

If connected to a system that lacks DB memory:

1. ensure PostgreSQL exists and is reachable
2. create a dedicated DB/user matching the target install policy
3. apply the schema objects that provide:
   - `zorg_memory`
   - mapped markdown tables
   - materialized views
   - recall functions used by `memory_sql_tool.py`
4. install the SQL memory scripts in the workspace
5. create `sql_memory_map.json`
6. create or reuse a Python venv with `psycopg2-binary`
7. run verification commands
8. only report success after live verification

## Full installer path in this skill

This skill now includes:

- `scripts/install_db_memory_full.sh`

That helper reproduces the fuller known-good pattern by using these source artifacts:

- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/db/schema.sql`
- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/db/zorg_objects.sql`
- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/db/zorg_operational_facts_seed.sql`
- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/db/zorg_success_query_index_seed.sql`
- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/scripts/memory_sql_tool.py`
- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/scripts/memory_recall_router.py`
- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/scripts/memory_speed_test.py`

## Minimal package requirements

At minimum, the target host needs:

- Python venv support (`python3-venv` / working `ensurepip`)
- Python venv with psycopg2 support
- PostgreSQL reachable by the local tool
- workspace-local config map
- the query tools placed at the expected paths
- schema objects loaded

Fresh-host test note from this system:

- running the bootstrap helper against `/tmp/dbmem-test` failed until OS-level venv support is installed
- exact failure: `ensurepip is not available`
- on Debian/Ubuntu, install the matching `python3-venv` package first, then rerun bootstrap

## Source references

Derived from:

- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/Zorg_spawn_IMPLEMENTATION.md`
- `/home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/Zorg_spawn/db/schema.sql`

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
