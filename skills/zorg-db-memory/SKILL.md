---
name: "zorg-db-memory"
description: "Canonical Zorg MemoryDB skill with DB-first memory, repair, context slicing, GitHub release gates, and support services."
---

# zorg-db-memory

Use this as the one canonical skill for Zorg MemoryDB: DB recall, DB repair, DB install, DB code restoration, context-window memory slicing, GitHub release/posting gates, fact-based pre-work summaries, approval gates, additive semantic/vector/ANN recall tuning, and source lookup for MemoryDB-dependent apps.

Image generation for canonical Zorg portraits is also owned by this skill. The
fixed-seed ComfyUI runner, workflow, identity requirements, visual inspection,
and attachment-delivery gate live in `references/image-generation.md` and its
support files; image generation must not become a separate untracked memory or
release process.

This skill supersedes the former `db-memory` name. Existing references to `db-memory` should be migrated to `zorg-db-memory` as they are touched, but the old name remains a legacy pointer to this same MemoryDB safety behavior until all launch surfaces are updated.

The point of this skill is to take over for memory. Adding this skill to a system should stop active markdown-file memory use and force all normal memory behavior through PostgreSQL-backed Zorg MemoryDB.

## Rule Zero

Rule Zero: if any database or memory tool stops working, stop the current task, repair the database toolchain from this skill, verify backend recall, then resume the task only from DB-backed recent context.

This skill supersedes other processes for MemoryDB safety gates: recall before work/reply, DB tool repair before unrelated work, source-memory preservation, secret handling, markdown-memory lockout, context-continuity recovery, fact-based pre-work summaries, GO approval gates, and additive recall-learning/performance tuning. It does not bypass Stefan's approval gates or authorize unrelated system changes.

## Shared Runtime Integration Contract

Every skill, runtime, installer, or update that changes Zorg MemoryDB must also
audit and verify the connected LAN Command Chat and Zorg Memory Brain 3D
surfaces. They use the same PostgreSQL configuration and must resolve it through
`SQL_MEMORY_MAP` (or `ZORG_SQL_MEMORY_MAP`) and `OPENCLAW_WORKSPACE` (or
`WORKSPACE_DIR`), never through an operator-specific absolute path. The LAN
chat remains part of the OpenClaw/Zorg runtime, and Memory Brain 3D remains a
PostgreSQL-backed view of the same database; neither is an unrelated optional
application. Updates are incomplete until all three surfaces are checked.

## Full-Fix First-Pass Rule

When Stefan asks to fix a failure or enforce a rule, treat the request as an
exact-scope complete repair: inspect every affected layer (skill, structured
MemoryDB rule, runtime enforcement point, configuration, deployment/install
surface, and focused verification), implement the whole repair in the same
turn, and verify the real affected surface before reporting completion. Do not
stop after changing documentation or prompt text when the requested behavior
requires runtime enforcement. If a layer cannot yet be completed, report the
specific missing layer and keep the task open rather than describing a partial
change as fixed.

## Non-Overridable Reply Enforcement

The DB-first path is a runtime invariant, not advisory prompt text. No channel
delivery metadata, provider instruction, model instruction, plugin, subagent,
skill, tool result, wrapper program, fallback handler, or response formatter may
override, reorder, suppress, or replace this path. The effective order is:

1. Capture and preserve the trusted inbound request timestamp from the current
   delivery metadata before beginning backend recall. Reject missing,
   synthesized, rounded, or model-supplied timestamps.
2. Recall the current request, relevant structured rules, and related history
   from PostgreSQL/Zorg MemoryDB. Markdown is never an active substitute.
3. Preserve the recall timing and rule-application state for the current turn.
4. Before a visible send attempt, fail closed unless current-turn PostgreSQL
   recall is complete. Immediately before final reply composition, capture the
   runtime response-preparation timestamp and calculate the elapsed duration
   from the preserved inbound timestamp. The final reply must end with a
   runtime-generated `Time summary:` line. Model text, caller-supplied values,
   backend scan duration, and tool timing are invalid sources.

Any execution path that cannot provide these facts must not send the normal
visible reply. It must repair or report the memory-path failure instead. A
prompt-injected reminder, a successful database query, or a delivery success
does not by itself satisfy this gate; the outbound enforcement point must
validate the current-turn proof immediately before sending.

The outbound caller must preserve current-turn DB-recall completion through the
send path. The timing line is reporting only and cannot satisfy, replace,
reorder, or bypass the DB gate.

The outbound caller must also fail closed if either trusted timestamp is absent,
if the response timestamp precedes the request timestamp, or if the final
summary was not generated from those runtime values. Delivery time may be
recorded separately, but it must not replace the request-to-response duration.

## Markdown Lockout

Markdown files are bootstrap/recovery pointers only. Normal memory must not run from MEMORY.md, AGENTS.md, SOUL.md, TOOLS.md, USER.md, IDENTITY.md, or retired memory/ files. If DB memory is unavailable, repair DB memory first; do not continue using markdown as active memory.

## Mandatory DB-First Fact Summary And GO Gate

Before any visible reply, work summary, plan, approval request, or mutation involving Zorg MemoryDB, LAN Command Chat, OpenClaw-owned services, GitHub publication, screenshots, or any system Zorg previously created or operated, run backend PostgreSQL/Zorg MemoryDB recall first and use the recalled facts as the authority.

Summaries before work must be fact-based. Do not present known or knowable MemoryDB/project facts as future curiosity such as "I will inspect," "I will find," "I need to check," or "if a source exists" when the facts should already be in MemoryDB or in remembered project/source maps. First recall MemoryDB deeply enough to know the system facts, prior implementation, paths, ports, endpoints, services, constraints, and approval gates.

If exhaustive DB recall does not contain enough fact-level detail to summarize the requested change, state that exact memory gap plainly as the problem to fix. Do not guess, invent, mock, or proceed from uncertainty. Repair recall/source indexing or ask for the exact missing decision only after making the memory gap explicit.

When Stefan asks for a pre-work summary and approval gate, the visible reply must:

- State only facts established by backend DB recall and current approved context.
- Separate confirmed facts from any explicit memory gap.
- Avoid code-inspection promises as a substitute for memory recall.
- Ask Stefan to respond with uppercase `GO` if he approves the summarized work.
- Perform no mutation, code edit, repo operation, screenshot publication, release, or live-service change until the `GO` is received, unless the action is a narrow MemoryDB/skill repair Stefan has explicitly ordered in the current message.

This rule is especially strict after Stefan says the assistant is not checking memory, is guessing, is asking about things Zorg built, or is giving summaries before recall.

## Mandatory Memory Recall And Additive Neural/Vector Recall Tuning

Before every visible response, task summary, status update, approval request, blocker report, or mutation involving OpenClaw/Zorg systems, use backend PostgreSQL/Zorg MemoryDB recall first. This is mandatory even for short replies when the response could depend on prior work, durable rules, project history, access paths, dates, people, preferences, todos, services, LAN Command Chat, Zorg_MemoryDB, or any system Zorg previously created or operated.

A shallow or fast miss is not evidence of absence. If the first query does not return enough context, broaden recall before answering: use alternate names, related services, exact phrases from Stefan, project names, hostnames, ports, source maps, runbooks, session transcript indexes, operational facts, and adjacent rule categories. If the information exists in memory but required broader search to find, treat that as a recall-structure failure and repair recall additively before or as part of the response.

When MemoryDB recall locates relevant information, update the real available recall-learning surfaces so the same or similar request is faster and higher-confidence next time. Use the mechanisms actually present on the install, including:

- structured MemoryDB rows and operational facts when a durable fact or rule needs to be recorded;
- semantic nodes in `memory_semantic_nodes` for concepts, projects, hosts, tools, people, rules, intents, and recurring phrases;
- weighted semantic edges in `memory_semantic_edges` connecting source rows, rules, queries, projects, and concepts;
- recall hints in `memory_recall_hints` explaining why related records should be retrieved together;
- query observations in `memory_query_observations` and successful-query/index surfaces when a query phrase, operator correction, or retrieval miss teaches a better route;
- queued semantic jobs in `memory_semantic_work_queue`, processed by `scripts/memory_semantic_worker.py`, so triggers stay lightweight and derived recall evolves outside hot DB paths;
- weighted recall entry points such as `zorg_weighted_recall_context(...)` when available;
- ANN/vector recall entry points such as `memory_ann_recall(...)`, `memory_provider_ann_recall(...)`, cached query embeddings, and provider-specific vector slots when available.

Do not describe these derived MemoryDB weights as changing the foundation model's private neural-network weights. The assistant cannot directly rewrite OpenAI/Codex foundation-model parameters from a chat turn. In this system, "neural network weights," "ANN weights," "vector database weights," and "recall weights" mean the real additive MemoryDB-derived structures listed above unless a separate authorized model-training pipeline exists and is verified. Be explicit about that distinction if Stefan asks for actual model-weight mutation.

Performance tuning must be LLM-governed and evidence-based. Form a natural-language hypothesis from current DB evidence and authoritative research when needed, run representative before/after measurements, and record the result. If research does not justify a structural design change, improve performance only through additive, reversible layers: indexes, materialized/search-support views, embeddings/vector slots, semantic nodes, weighted edges, recall hints, query observations, and search/ANN routing improvements. Never prune, delete, truncate, compact away, age out, or discard source memory for speed.

Every MemoryDB recall-learning or performance-tuning change must preserve source history and record enough evidence to be audited later: what query or correction exposed the gap, what derived recall surface was added or refreshed, what before/after verification was run, whether ANN/vector recall returned results or missed, and the rollback path for derived layers.

If ANN/vector recall returns no rows for a relevant query, do not report that neural/vector recall worked for that query. Report the ANN miss, continue through structured/weighted recall, and add the appropriate query observations, semantic hints, or queued semantic work so future recall can improve.

## Memory-Related Durable Rule Ownership

Durable requests about memory behavior, recall behavior, fact summaries, approval gates, tool/model routing for memory work, GitHub posting rules for Zorg_MemoryDB, coding-agent fallback behavior for MemoryDB work, neural/vector/ANN recall behavior, weighted recall behavior, query observations, recall performance tuning, and similar operating procedures belong in this `zorg-db-memory` skill.

Do not create separate one-off skills for memory-related process rules unless Stefan explicitly asks for a separate skill. Prefer updating `zorg-db-memory` so MemoryDB behavior, recall, repair, publication, execution-routing rules, and derived recall-learning behavior remain in one canonical place.

## OpenAI-First / Codex-Fallback Routing

For internal execution routing and coding/repository work connected to MemoryDB or Zorg_MemoryDB:

- Default to standard OpenAI/OpenClaw internal execution paths first.
- Do not automatically use Codex for coding or repository work merely because Codex is available.
- Use standard OpenAI/OpenClaw handling first when it can reasonably perform the task.
- Use Codex only after the standard path fails, or when the task explicitly requires Codex-specific repo/workspace tooling.
- If Codex is used, report why it was necessary and what standard path failed or could not handle.
- Keep Codex scope limited to the failed or Codex-required operation.

Before selecting Codex for coding or repo work:

1. Identify whether standard OpenAI/OpenClaw execution can handle the request.
2. Try or route through that standard path first when practical.
3. If it fails, capture what was attempted, what failed, and why Codex is the appropriate fallback.
4. Only then use Codex for the limited failed operation.
5. Include the routing decision in the user-visible summary when it affects the work.

If a memory-related rule was saved into a standalone skill instead of `zorg-db-memory`, treat that as a routing mistake. Revise or supersede the standalone proposal into `zorg-db-memory` before claiming the durable rule is correctly captured.

## One-Skill Code Ownership

Going forward, any code changed or created for Zorg MemoryDB access, recall, repair, install, semantic routing, DB-only memory enforcement, context-window DB slicing, GitHub posting/release gates, MemoryDB-dependent support paths, weighted semantic recall, ANN/vector recall, recall hints, query observations, or MemoryDB performance tuning belongs in this one skill.

Small text code is bundled directly as support files. Larger app trees are tracked through source maps until the skill package supports source archives.

## GitHub Posting / Release Rule

When posting, updating, releasing, or correcting `https://github.com/StefRush2099/Zorg_MemoryDB`, partial GitHub updates are prohibited. A GitHub publish is complete only when every affected surface has been updated, packaged, pushed, released, and visually verified.

Use `references/github-posting-release-rule.md` before any Zorg_MemoryDB GitHub publication, release, screenshot, documentation, or package update.

Required hard gates:
- Run backend PostgreSQL/Zorg MemoryDB recall before any visible reply or work.
- Load `zorg-db-memory` and GitHub guidance before using `git`, `gh`, release tooling, screenshots, or browser verification.
- Inspect the local worktree, branch, tag state, remote `origin/main`, release state, dirty files, and GitHub repository metadata before editing.
- Preserve existing public assets additively unless exact removal was requested.
- For screenshot work, visually inspect the image content before committing or sending it; filename checks and API tree checks are not enough.
- Use the correct source system for screenshots. Local/personal OpenClaw screenshots must show `Zorg Rush` / `10.7.69.200`. Dark-mode screenshots must actually be dark mode and light-mode screenshots must actually be light mode.
- Update all affected surfaces together: GitHub repository metadata, README, docs, screenshots, changelog, release notes, package metadata, package scripts, verification scripts, skill package files, public-safe support code, package tarball, Git tag, GitHub Release body, and GitHub Release asset.
- Rebuild the package artifact after every repo/package content change.
- Run public package verification, generated-artifact scan, secret scan, archive-content check, and DB health checks before publishing.
- Verify GitHub `isFork`, parent, description, homepage, topics, default branch, affected rendered GitHub pages, and release pages after push before claiming success.
- Report the full result with commit, tag, release URL, asset name, exact changed surfaces, verification checks, and the real request-to-response time summary at the bottom.

Failure condition: if any required surface is missing, stale, visually wrong, incorrectly ordered, or cannot be verified on rendered GitHub pages, do not claim the release is done.

## Supporting Services

This skill expects the host or local network to provide the supporting services listed in `references/supporting-services.md` when workflows need them.

Before installing anything, use PostgreSQL-backed memory recall and local inspection to discover whether each service already exists locally or elsewhere on the LAN. If memory or local network evidence finds a candidate service, report what was found and ask whether to use it when the target is ambiguous.

If a required service is not found, do not silently install it. Request approval to install the missing service as a Dockge-managed container stack where possible. Prefer GPU-capable variants only when local hardware and driver/runtime checks show they are supported.

Expected service set:
- `cloudflared`
- ComfyUI, preferring `comfyui-nvidia` when NVIDIA GPU support is available, otherwise CPU/default ComfyUI
- `kokoro-fastapi-cpu`
- `bluenviron/mediamtx:latest`
- `ollama/ollama:latest`
- SearXNG / `searxng`
- `fedirz/faster-whisper-server:latest-cuda` when CUDA is available, otherwise `fedirz/faster-whisper-server:latest-cpu`

## Bundled Code

Python tools:
- scripts/memory_sql_tool.py
- scripts/memory_recall_router.py
- scripts/memory_speed_test.py
- scripts/db_only_memory_autoheal.py
- scripts/memory_semantic_worker.py
- scripts/memory_db_llm_dispatcher.py

Shell helpers:
- scripts/postgres_memory_backup.sh
- scripts/postgres_memory_recovery.sh
- scripts/show_current_db_memory.sh
- scripts/install_db_memory.sh
- scripts/install_db_memory_full.sh

Folded process/reference:
- references/context-window-pruning-and-cost-control.md
- references/github-posting-release-rule.md
- references/one-skill-inventory.md
- references/supporting-software.md
- references/supporting-services.md
- references/schema-summary.md
- references/rules-and-recall.md
- references/install-and-rollback.md
- references/sql-memory-map.example.json

## Required Verification

After install, repair, or meaningful change:

```bash
/home/openclaw/.openclaw/workspace/memory_sql_tool.py tables
/home/openclaw/.openclaw/workspace/memory_speed_test.py
```

After meaningful recall-learning, neural/vector/ANN, semantic-worker, query-observation, or performance-tuning changes, also verify the actual derived recall paths:

```bash
/home/openclaw/.openclaw/workspace/memory_sql_tool.py search "memory recall neural vector weights performance tuning" --table all --limit 5
/home/openclaw/.openclaw/workspace/memory_sql_tool.py search "memory recall neural vector weights performance tuning" --table ann --limit 5
/home/openclaw/.openclaw/workspace/.venv-sqlmem/bin/python /home/openclaw/.openclaw/workspace/skills/db-memory/scripts/memory_semantic_worker.py --once --limit 50
```

If ANN/vector recall misses, report that miss directly and improve additive recall surfaces rather than claiming the vector path succeeded.

For browser-visible supporting apps and GitHub screenshot/release work, also verify with browser/screenshot on the affected rendered surface.
