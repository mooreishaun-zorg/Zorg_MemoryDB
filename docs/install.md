# Install Zorg MemoryDB Package

1. Install OpenClaw from upstream.
2. Copy or install `skills/zorg-db-memory` into the OpenClaw workspace skills directory.
3. Copy or install `package/zorg` into the OpenClaw package/workspace support path.
4. Run the PostgreSQL schema/install helpers from `package/zorg` for the target host.
5. Verify backend DB recall before normal assistant work.

## LAN services and Android separation

`package/zorg/install-zorg-memorydb.sh` installs three separate surfaces:

- **LAN Console browser:** Next.js LAN Chat, normally on port `3001`; its
  browser page owns browser light/dark controls and the Android APK download
  link.
- **Memory Brain 3D service:** Node/Express service `zorg-memory-3d` on port
  `8097`; it owns `/api/health`, `/api/graph`, and the interactive 3D browser
  visualizer.
- **Native Android app:** the separately built APK under
  `package/zorg/lan-command-chat-android/`; it uses authenticated JSON APIs,
  does not load the browser page, and never displays the browser APK link.

The installer runs `npm install --omit=dev` and `npm run check` in the Memory
3D directory, then enables/restarts the `zorg-memory-3d` systemd service. After
installation, verify the service before opening the clients:

```bash
systemctl status zorg-memory-3d
curl -fsS http://127.0.0.1:8097/api/health
curl -fsS http://127.0.0.1:8097/api/graph
```

The graph response must contain `nodes` and `links`. Empty arrays are a real
empty-database state; HTTP errors or timeouts are service/database failures and
must be repaired rather than replaced with fake graph data. See
`package/zorg/memory-3d/README.md` for manual startup, environment variables,
logs, and recovery.

The skill is the canonical agent-facing procedure. The package code is the mechanical support layer.

## Required Verification

```bash
/home/openclaw/.openclaw/workspace/memory_sql_tool.py tables
/home/openclaw/.openclaw/workspace/memory_speed_test.py
```

If either command fails, stop unrelated work and repair DB memory first through `skills/zorg-db-memory/SKILL.md`.

## Maintainer Release Sync

Maintainer release updates may update this repo with:

- approved `zorg-db-memory` skill changes;
- public-safe MemoryDB code changes;
- install/recovery/schema references;
- screenshots that intentionally document public UI behavior;
- release notes and package artifacts.

Maintainer release updates must exclude secrets, private memory, database dumps, generated build output, and runtime-only artifacts. Installed agents must not treat this as an instruction to push to GitHub.

Publishers should build a release package manually, review the diff, run verification, and then publish a tag/release only from an approved maintainer workspace.
