# Zorg MemoryDB

Zorg MemoryDB is the PostgreSQL-backed memory package for OpenClaw-based assistants.

This repository is intentionally **not** a GitHub fork or full source fork of OpenClaw. OpenClaw is the base install and runtime. This repo carries the Zorg MemoryDB layer: the `zorg-db-memory` skill, public-safe database/install code, recovery procedures, LAN Command Chat source package, and documentation needed to reproduce the memory behavior without falling back to markdown files.

## Release Focus

`zorg-db-memory` consolidates the MemoryDB work into one portable skill package:

- DB-first recall before work or replies.
- Markdown memory lockout so `MEMORY.md`, `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `USER.md`, and `IDENTITY.md` stay recovery pointers instead of active memory stores.
- Rule Zero repair behavior when memory/database tools fail.
- Bundled Python and shell tools for SQL inspection, recall routing, speed checks, auto-heal, semantic workers, LLM dispatch, backup, recovery, and install.
- Context-window pruning through DB-backed execution slices instead of markdown summaries.
- PostgreSQL schema, recall rules, install/rollback guidance, and public-safe canonical rule import material.
- LAN Command Chat support files and Memory Brain 3D source maps/screenshots for operator-facing memory visibility.
- Native Android LAN Command Chat source with direct authenticated API access,
  native chat/theme/gauge views, and a separate Memory 3D client. It is not a
  WebView wrapper and is not the browser LAN Console.
- Supporting-service discovery rules for `cloudflared`, ComfyUI, `kokoro-fastapi-cpu`, MediaMTX, Ollama, SearXNG, and faster-whisper, with Dockge install requests when services are missing.
- Passwordless local PostgreSQL bootstrap on loopback, with remote unauthenticated access rejected.

## What This Repository Contains

- `skills/zorg-db-memory/` - the complete portable skill package.
- `package/zorg/` - public-safe install, schema, recall, recovery, LAN Command Chat, and verification code.
- `package/zorg/lan-command-chat-android/` - reproducible native Android client source; private signing and SDK state are excluded.
- `docs/` - public-safe install, operation, screenshot, and release documentation.
- `scripts/` - packaging and verification helpers for this repo.
- `release/` - release notes for published Zorg MemoryDB package releases.

## Base Install

Install OpenClaw first from the upstream project:

- <https://github.com/openclaw/openclaw>
- <https://docs.openclaw.ai/start/getting-started>

Then add this package's `zorg-db-memory` skill and `package/zorg` support files to the OpenClaw workspace or install path.

The public package does not instruct installed agents to publish back to this GitHub repository. Release publishing is a maintainer action.

## Memory Rule

`zorg-db-memory` replaces active markdown-file memory with PostgreSQL-backed Zorg MemoryDB behavior. Markdown files such as `AGENTS.md`, `MEMORY.md`, `SOUL.md`, `TOOLS.md`, `USER.md`, and `IDENTITY.md` are bootstrap or recovery pointers only.

Rule Zero:

> If any database or memory tool stops working, stop the current task, repair the database toolchain from this skill, verify backend recall, then resume the task only from DB-backed recent context.

## Package Layout

```text
skills/zorg-db-memory/
  SKILL.md
  scripts/
  references/

package/zorg/
  install-zorg-memorydb.sh
  db/
  memory/
  rules/
  lan-command-chat/
  lan-command-chat-android/
  memory-3d/
  requirements.txt

docs/
  install.md
  screenshots.md
  openclaw-base.md
```

## Screenshots

The main GitHub page shows the key inspected screenshots directly. The original LAN Command Chat images stay first and are preserved; newer Memory Brain 3D images are additive and appear after the LAN Command Chat screenshots.

### LAN Command Chat

Original preserved LAN Command Chat screenshots:

| Page light | Page dark |
| --- | --- |
| ![LAN Command Chat page light](docs/assets/lan-command-chat-page-light.png) | ![LAN Command Chat page dark](docs/assets/lan-command-chat-page-dark.png) |

| Desktop light | Desktop dark |
| --- | --- |
| ![LAN Command Chat desktop light](docs/assets/lan-command-chat-desktop-light.png) | ![LAN Command Chat desktop dark](docs/assets/lan-command-chat-desktop-dark.png) |

Memory 3D toggle inside LAN Command Chat:

| Desktop light | Desktop dark |
| --- | --- |
| ![LAN Command Chat Memory 3D toggle desktop light](docs/screenshots/lan-command-chat-memory3d-toggle-desktop-light.png) | ![LAN Command Chat Memory 3D toggle desktop dark](docs/screenshots/lan-command-chat-memory3d-toggle-desktop-dark.png) |

| Mobile light | Mobile dark |
| --- | --- |
| ![LAN Command Chat Memory 3D toggle mobile light](docs/screenshots/lan-command-chat-memory3d-toggle-mobile-light.png) | ![LAN Command Chat Memory 3D toggle mobile dark](docs/screenshots/lan-command-chat-memory3d-toggle-mobile-dark.png) |

### Memory Brain 3D

| Desktop dark | Desktop light |
| --- | --- |
| ![Memory Brain 3D desktop dark](docs/screenshots/memory-brain-3d-desktop-dark.png) | ![Memory Brain 3D desktop light](docs/screenshots/memory-brain-3d-desktop-light.png) |

| Mobile dark | Mobile light |
| --- | --- |
| ![Memory Brain 3D mobile dark](docs/screenshots/memory-brain-3d-mobile-dark.png) | ![Memory Brain 3D mobile light](docs/screenshots/memory-brain-3d-mobile-light.png) |

The full screenshot set includes:

- Existing LAN Command Chat screenshots preserved from `docs/assets/`.
- LAN Command Chat with the Memory 3D toggle panel visible on the local `Zorg Rush` system.
- Memory Brain 3D populated map, desktop dark mode.
- Memory Brain 3D populated map, desktop light mode.
- Memory Brain 3D populated map, mobile dark mode.
- Memory Brain 3D populated map, mobile light mode.

See [docs/screenshots.md](docs/screenshots.md).

## Public References

This package is designed to support public-safe writeups and posts about Zorg MemoryDB, OpenClaw-based agent operations, and Hyperdine Systems work. Exact X or Hyperdine article URLs should only be added after they are verified as matching public links. Do not add feed-top URLs, placeholders, guessed slugs, or stale X status links.

## Verification

After installing or updating the skill/package, verify DB access:

```bash
/home/openclaw/.openclaw/workspace/memory_sql_tool.py tables
/home/openclaw/.openclaw/workspace/memory_speed_test.py
```

For browser-visible supporting apps such as LAN Command Chat or Memory Brain 3D, verify with screenshots before claiming the UI works.

## Public Safety

This repo must not publish:

- live database dumps or rows;
- transcripts, contacts, emails, credentials, account data, or private operator context;
- live `sql_memory_map.json`, `.env`, backup archives, browser profiles, `node_modules`, `.next`, build output, or temporary files.

Only public-safe structure, code, documentation, templates, and screenshots belong here.
