# Changelog

## Unreleased

- Speeds exact/named recall by letting project aliases short-circuit the
  broader hybrid recall path and preserves ranked recall order when merging
  logic, project, host, and memory-search sources.
- Repairs the packaged pgvector ANN recall path to use the locally available
  `nomic-embed-text:latest` 768-dimension embedding model by default.
- Aligns packaged schema defaults, HNSW index predicates, query-cache checks,
  stored-procedure ANN routing, and recall-router context metadata so fresh
  installs do not point at an unavailable embedding model.

## v2.0.11 - 2026-07-12

- Corrects the browser Context window gauge to display live tokens in use
  against the live token limit instead of a percentage-only readout.
- Makes the visible gauge-tile release stamp derive from the browser package
  version and align it with the published release.

## v2.0.10 - 2026-07-12

- Publishes the browser LAN Command Chat `Context window` gauge with the
  release version stamp shown immediately before `DB size` in the gauge tile.
- Aligns the public package and browser application metadata at version
  `2.0.10` so agents with `2.0.9` can identify the update.

## v2.0.9 - 2026-07-12

- Replaces the Android WebView/pass-through shell with a native Android chat,
  history, composer, theme selector, live gauge, and Memory 3D surface.
- Adds a native authenticated login dialog with persisted signed-cookie state;
  SSH credentials and LAN Chat credentials remain separate.
- Removes the Android dependency on the OpenClaw TUI and web `/chat` route.
- Reads chat, history, database metrics, and Memory 3D graph data through live
  authenticated JSON contracts and reports degraded data instead of faking it.
- Adds native System/Light/Dark selection and aligns the Android build metadata.
- Repairs the Memory 3D installer path by installing service dependencies,
  creating/enabling `zorg-memory-3d`, adding bounded PostgreSQL query timeouts,
  and documenting `/api/health` and `/api/graph` verification.
- Clarifies that browser LAN Chat and native Android are separate surfaces; the
  browser owns the APK download link and browser theme controls.

## v2.0.8 - 2026-07-12

- Rebuilds the Android client around the real responsive LAN Command Chat
  `/chat` surface instead of a separate native imitation.
- Uses the variable-driven LAN route and phone system theme so light and dark
  mode follow the connected Android device.
- Keeps the mobile page scrollable so the live gauges and Memory 3D/Gauges
  toggle remain reachable below the conversation surface.
- Aligns the Android package metadata with the verified install and preserves
  the connected Memory Brain 3D surface.
- Retains the mandatory Zorg MemoryDB recall, timing-summary, screenshot-review,
  and full-surface publication gates.

## v2.0.4 - 2026-07-11

- Replaces the LAN Command Chat Compact control with a stable Android app
  download link backed by the latest verified GitHub release APK.
- Bumps the Android client to version 2.0.4 for the installable release.

## v2.0.3 - 2026-07-11

- Completes the Android client telemetry surface with native Queries/sec, Cache
  hit, Writes/sec, DB size, and Context window readouts.
- Corrects the Android release to include all four LAN Command Chat gauges
  before publication.

## v2.0.2 - 2026-07-11

- Adds a native Android LAN Command Chat client with a real chat window,
  internet/local route selection, status/context telemetry, and Memory Brain
  3D access.
- Adds the Android client to the public package without private credentials,
  scheduler settings, or machine-local SDK artifacts.
- Makes ComfyUI image generation part of the canonical `zorg-db-memory` skill
  with a single fixed seed file and configurable server/output paths.
- Includes the operator-correction migration in clean installs.

## v2.0.1 - 2026-07-11

- Removes superseded release notes and archives from the active package tree.
- Makes release archives contain only the current release note instead of the
  entire historical `release/` directory.
- Makes legacy `memory/**/*.md` migration opt-in so clean installs do not ingest
  historical markdown by default.

## v1.2.72 - 2026-07-11

- Publishes the current LAN Command Chat PostgreSQL gauges and Memory 3D
  toggle that were previously left on an unreleased branch.
- Adds the connected Memory Brain 3D source bundle to the public install
  package and installs it through the configurable `MEMORY_3D_DIR` path.
- Advances the package release number so checkout and update checks detect the
  gauge update.

## v1.2.71 - 2026-07-11

- Makes MemoryDB worker, installer, backup, recovery, dispatcher, and recall-tool paths resolve from `OPENCLAW_WORKSPACE`, `WORKSPACE_DIR`, `SQL_MEMORY_MAP`, and related variables instead of an operator-specific `/home/openclaw` path.
- Updates LAN Command Chat to resolve its workspace, sessions, OpenClaw binary, and PostgreSQL map from environment-driven paths.
- Updates Memory Brain 3D to use the same `SQL_MEMORY_MAP`/PostgreSQL configuration contract and records the shared-surface verification requirement in the skill.
- Verifies the Vorg path contract with `/home/vorg/.openclaw/workspace`.

## v1.2.70 - 2026-07-11

- Removes generated PostgreSQL passwords from the default local installer path.
- Adds passwordless loopback-only authentication for the local `zorg` role.
- Rejects unauthenticated remote database configuration and documents the boundary.

## v1.2.69 - 2026-07-11

- Syncs the canonical `zorg-db-memory` skill with DB-first fact-summary, GO-gate, and additive ANN/vector recall tuning rules.
- Updates the bundled and installer-copied MemoryDB Python tools to use DB-owned stored-procedure recall APIs and due-job enqueue behavior.
- Adds public-safe stored-procedure migration files for the recall API, bounded recall paths, semantic source lookup, search/table helpers, and generic due-job enqueue support.
- Preserves the v1.2.68 GitHub repository metadata/fork verification safeguards.

## v1.2.68 - 2026-07-10

- Corrects GitHub repository metadata so the project is no longer positioned as an OpenClaw fork.
- Clarifies current documentation wording: Zorg MemoryDB is an add-on package for OpenClaw, not a GitHub fork or vendored source copy.
- Extends the GitHub posting/release rule to require repository metadata and fork-network verification as part of full-surface release checks.

## v1.2.67 - 2026-07-10

- Corrects the packaged `zorg-db-memory` skill metadata description after the GitHub posting gate restore.
- Keeps the canonical DB-first, Rule Zero, markdown lockout, supporting-services, and GitHub posting/release rules together in the exported skill.
- Rebuilds and republishes the package so the live skill and GitHub package metadata match.

## v1.2.66 - 2026-07-10

- Adds the hard GitHub posting/release rule to the packaged `zorg-db-memory` skill.
- Requires full-surface updates across README, docs, changelog, release notes, package metadata, tarball, tag, GitHub Release, and release asset.
- Requires visual review of screenshots before commit/report and browser verification of rendered GitHub pages before claiming success.

## v1.2.65 - 2026-07-10

- Replaced LAN Command Chat Memory 3D toggle screenshots with reviewed captures from the local `Zorg Rush` system.
- Corrected the dark-mode toggle screenshots so dark mode is actually active.
- Reordered README and screenshot docs so original LAN Command Chat screenshots come first and newer Memory Brain 3D screenshots follow.

## v1.2.64 - 2026-07-10

- Restored screenshots directly on the GitHub main README page.
- Kept original LAN Command Chat screenshots visible from `docs/assets/`.
- Kept Memory Brain 3D and LAN Command Chat Memory 3D toggle screenshots visible from `docs/screenshots/`.

## v1.2.63 - 2026-07-10

- Synchronized the packaged `zorg-db-memory` skill metadata with the corrected live canonical skill description.
- Rebuilt the package archive with the screenshot preservation and supporting-services corrections intact.

## v1.2.62 - 2026-07-10

- Preserved and documented the original LAN Command Chat screenshots as additive release assets.
- Added the supporting-services reference to the packaged `zorg-db-memory` skill.
- Documented expected discovery/install-request behavior for cloudflared, ComfyUI, Kokoro FastAPI, MediaMTX, Ollama, SearXNG, and faster-whisper.
- Tightened package verification to reject Python cache artifacts.
- Rebuilt the release package without generated Python cache files.

## v1.2.61 - 2026-07-10

- Restructured the public repository around `zorg-db-memory`.
- Removed the vendored OpenClaw implementation from the current tree.
- Added OpenClaw base-install documentation.
- Added the full live `zorg-db-memory` skill package.
- Kept public-safe Zorg MemoryDB support code under `package/zorg`.
- Added public screenshot documentation and release notes.
- Added Memory Brain 3D desktop/mobile screenshots in light and dark modes.
- Added LAN Command Chat Memory 3D toggle-panel screenshots.
- Removed public-package scheduled publishing instructions so installed agents do not inherit maintainer-only release behavior.
