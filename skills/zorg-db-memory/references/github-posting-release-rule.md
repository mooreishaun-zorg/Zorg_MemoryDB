# GitHub Posting / Release Rule

This reference is a hard gate for Zorg_MemoryDB GitHub publishing.

A GitHub update is not complete when only a file exists, an API tree lists it, or a package archive contains it. A GitHub update is complete only when all affected surfaces are updated and the rendered GitHub pages are visually verified.

## Required full-surface checklist

- Backend Zorg MemoryDB recall first.
- Load `zorg-db-memory` and GitHub guidance before GitHub work.
- Inspect local branch, dirty status, remote state, latest release, tags, and GitHub repository metadata.
- Verify GitHub `isFork`, parent, repository description, homepage URL, topics, default branch, and public visibility. If the repository should not be a fork, `isFork` must be false before claiming completion.
- Preserve existing public screenshots/assets additively unless exact removal was requested.
- Review screenshot pixels before commit or report.
- Use the correct source system for screenshots; local personal screenshots must show `Zorg Rush` / `10.7.69.200`.
- Correct dark/light mode content, not only filenames.
- Update every affected surface: GitHub repository metadata, README, docs, screenshots, changelog, release notes, package metadata, package scripts, verification scripts, skill package files, support code, tarball, tag, GitHub Release body, and Release asset.
- Rebuild package archive after content changes.
- Run public-package verification, secret scan, generated-artifact scan, archive-content check, and DB health checks.
- Push exact commit and tag.
- Verify remote commit/tag/release/asset and repository metadata with `gh` or GitHub API.
- Use browser verification of the rendered GitHub main page and related docs/release pages before claiming success.
- Send or save proof screenshots when the operator is checking visual output.

## Failure behavior

If any surface is missing, stale, incorrectly ordered, visually wrong, or sourced from the wrong system, the release is not done. Stop claiming success, correct the affected surface, rebuild and republish the release, then verify rendered GitHub output again.
