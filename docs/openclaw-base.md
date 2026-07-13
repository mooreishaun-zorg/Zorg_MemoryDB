# OpenClaw Base Install

Zorg MemoryDB is an add-on package for OpenClaw, not a GitHub fork or vendored source copy of OpenClaw. The upstream OpenClaw project provides the gateway, channel runtime, sessions, tools, node apps, and skill loading system.

Use upstream OpenClaw as the base install:

- Project: <https://github.com/openclaw/openclaw>
- Docs: <https://docs.openclaw.ai/>
- Getting started: <https://docs.openclaw.ai/start/getting-started>

This repository should stay focused on Zorg MemoryDB:

- PostgreSQL-backed memory tools.
- DB-first recall and repair rules.
- Public-safe schema/install/recovery scripts.
- The `zorg-db-memory` skill package.
- Source maps and package support for LAN Command Chat and Memory Brain 3D.

Do not vendor the full OpenClaw source tree here, and do not leave the public repository configured as a GitHub fork of OpenClaw. Pull OpenClaw from upstream and apply Zorg MemoryDB as a package layer.
