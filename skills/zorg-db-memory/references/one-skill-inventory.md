# One-skill inventory for Zorg MemoryDB

This inventory defines what belongs in the single zorg-db-memory skill.

## Direct bundled code

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

## Folded process skills

- references/context-window-pruning-and-cost-control.md

The context-window logic is not independent of MemoryDB. It is part of zorg-db-memory because it depends on DB-backed recall, DB addresses, and DB-backed task continuity.

## DB schema/config/reference

- references/schema-summary.md
- references/rules-and-recall.md
- references/install-and-rollback.md
- references/sql-memory-map.example.json
- references/supporting-software.md

## Markdown policy

Markdown files are bootstrap/recovery pointers only. The skill exists to stop active markdown memory use. Normal memory access must go through PostgreSQL MemoryDB. If DB recall is broken, repair DB recall before continuing. Do not use markdown as active fallback except to recover DB access.

## Future code ownership rule

Going forward, any code created or changed for Zorg MemoryDB access, recall, repair, install, semantic routing, context slicing, DB-only memory enforcement, or MemoryDB-dependent support paths must be represented in this one skill.

For small text code, carry it directly as support files. For larger app trees, carry a source map and packaging rule until the skill package supports source archives.

## Supporting software source map

LAN Command Chat:
- /home/openclaw/.openclaw/workspace/lan-chat
- /home/openclaw/.openclaw/workspace/Zorg_MemoryDB/lan-chat
- /home/openclaw/.openclaw/workspace/Zorg_Hive/apps/lan-chat
- /home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/lan-chat
- /home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/vorg/lan-chat

Memory Brain 3D:
- /home/openclaw/.openclaw/workspace/Zorg_MemoryDB/zorg-memory-3d
- /home/openclaw/.openclaw/workspace/Zorg_Hive/apps/by-host/openclaw/zorg-memory-3d
- /home/openclaw/.openclaw/workspace/zorg-memorydb-memory-3d-standard-install/zorg/memory-3d
