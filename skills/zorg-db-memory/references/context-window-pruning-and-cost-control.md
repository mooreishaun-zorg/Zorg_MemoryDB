---
name: "context-window-pruning-and-cost-control"
description: "Memory-addressed task slicing for small active context."
---

# context-window-pruning-and-cost-control Update Proposal: Memory-Addressed Execution Slices

## Purpose

Change context-window pruning from simple shortening into a DB-backed execution-slice process. The agent must first expand the task through MemoryDB recall and rule retrieval, then compress the active context into only the current executable slice while storing the full approved logic in addressable memory chunks.

## Core Model

A request should move through five phases:

1. Recall expansion.
2. Full process summary.
3. Memory-addressed slicing.
4. Active-slice execution.
5. Completion archive and next-slice initialization.

The context window should not carry every detail after the full process is understood. It should carry the current executable slice plus pointers to the rest.

## Phase 1: Recall Expansion

Before summarizing or acting:

- Run backend PostgreSQL MemoryDB recall for the request.
- Load relevant hard rules, project rules, user preferences, access paths, prior task state, verification rules, and approval gates.
- If DB tools fail, stop and use the `zorg-db-memory` Rule Zero repair process before continuing.
- Use markdown only as bootstrap/recovery input when DB recall is broken and being repaired.

## Phase 2: Full Process Summary

Before mutation or complex execution, generate a full process summary that includes:

- exact requested outcome;
- exact target systems/files/services;
- explicit non-changes;
- approval gates;
- required verification surfaces;
- screenshot/browser proof when user-visible behavior is involved;
- rollback or stop conditions;
- credential/secret handling without exposing secret values;
- known live facts and memory-derived facts separately.

This full summary is the pre-logic/pre-approval artifact. It must be stored or recordable in backend memory before context is reduced.

## Phase 3: Memory-Addressed Slicing

After the full summary is created, split it into sections. Each section receives:

- a short ID such as `S1-recall`, `S2-inspect`, `S3-copy`, `S4-config`, `S5-restart`, `S6-verify`;
- a backend memory address or retrievable DB identifier;
- scope and non-change rules for that section;
- required inputs;
- exact done condition;
- verification requirement;
- next-slice pointer.

The active context should then shrink to:

- always-on hard rules;
- current user request and latest correction;
- current section ID and memory address;
- current section instructions;
- current live state;
- next-slice pointer only, not the full later-step content.

## Phase 4: Active-Slice Execution

Execute only the current slice. Do not pull future sections into active context until the current slice is complete or blocked.

For each slice:

1. Load the section by memory address.
2. Verify it still matches the latest user instruction.
3. Execute only its approved scope.
4. Record live results and verification evidence.
5. Mark the slice complete, blocked, or needs re-summary.
6. If complete, move it to the completion archive and initialize the next slice by address.

If inspection reveals mismatch, stop and re-summarize rather than inventing paths, names, shortcuts, services, aliases, or routes.

## Phase 5: Completion Archive

Completed sections should leave behind compact records:

- section ID;
- what changed;
- what did not change;
- verification evidence;
- screenshot/file references when relevant;
- any new stop condition or mismatch.

The active context should keep only the compact completion record plus the current section. Detailed completed-section instructions should be retrievable by memory address, not continuously carried.

## Context Transition Behavior

When context is compacted or a new chunk appears:

- Treat the compacted handoff as an execution pointer, not as the whole truth.
- Use the section ID and memory address to reload the current slice from DB.
- Confirm the latest user instruction still matches the stored slice.
- Continue from the current slice only after DB recall succeeds.
- If DB recall fails, stop and repair DB tools first.

## Required Sentence

The skill should include this exact sentence:

"For complex tasks, first expand through MemoryDB into a full rule-aware process summary, then store the plan as memory-addressed execution slices and keep only the current slice plus pointers in active context."

## Non-Negotiable Guardrails

- Pruning is not deletion.
- Do not prune source memory.
- Do not drop hard rules.
- Do not drop exact user constraints.
- Do not skip screenshot verification when the affected surface is visual/browser-visible.
- Do not continue from a compacted summary if DB memory tools are broken.
- Do not use memory addresses as permission to exceed the approved scope.
- Do not apply personal-agent context process changes to remote hosts unless Stefan explicitly targets that host.

## Output Shape For Future Summaries

For complex tasks, summaries should be shaped like this:

```text
Scope: ...
Non-changes: ...
Approval gate: ...

Execution slices:
S1-recall -> memory:<address> -> current
S2-inspect -> memory:<address> -> pending
S3-change -> memory:<address> -> pending
S4-restart -> memory:<address> -> pending
S5-verify -> memory:<address> -> pending

Active context now: S1 only.
Next pointer: S2-inspect.
```

The actual address format should use whatever backend MemoryDB identifier is available: row UUID, taskflow ID, session excerpt ID, proposal ID, or structured recall key.

## Verification

A compliant turn should prove:

- DB recall ran first.
- Relevant rules were loaded before summary.
- A full process summary existed before pruning.
- Each section has shorthand and a retrieval address.
- Active context contains only the current executable slice plus hard rules and pointers.
- Completed sections are archived compactly.
- After context transition, the agent reloads by memory address instead of trusting a random compacted chunk.
