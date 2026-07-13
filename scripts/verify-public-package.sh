#!/usr/bin/env bash
set -euo pipefail

missing=0
package_version="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([0-9][0-9.]*\)".*/\1/p' package.json | head -1)"
release_archive="release/zorg-db-memory-v${package_version}.tar.gz"
for path in \
  "skills/zorg-db-memory/SKILL.md" \
  "package/zorg/README.md" \
  "README.md" \
  "docs/openclaw-base.md" \
  "docs/install.md" \
  "docs/screenshots.md" \
  "release/v${package_version}.md"; do
  if [[ ! -e "$path" ]]; then
    echo "missing: $path" >&2
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

if rg -n --hidden --glob '!.git/**' --glob '!release/*.tar.gz' --glob '!scripts/verify-public-package.sh' \
  '(cfat_[A-Za-z0-9]|gho_[A-Za-z0-9]|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|password\\s*=|SECRET_ACCESS_KEY=|AWS_SECRET_ACCESS_KEY=|CLOUDFLARE_API_TOKEN=)' .; then
  echo "possible secret found" >&2
  exit 1
fi

if rg --files --hidden --glob '!.git/**' | rg '(^|/)(node_modules|__pycache__|\\.gradle|build|\\.next|dist|tmp|browser-profile)(/|$)|(^|/)local\\.properties$|sql_memory_map\\.json$|\\.(pyc|dump|backup)$'; then
  echo "generated/private artifact path found" >&2
  exit 1
fi

if [[ -f "$release_archive" ]]; then
  if tar -tzf "$release_archive" | rg '(^|/)(node_modules|__pycache__|\\.gradle|build|\\.next|dist|tmp|browser-profile)(/|$)|(^|/)local\\.properties$|sql_memory_map\\.json$|\\.(pyc|dump|backup|tar\\.gz)$'; then
    echo "generated/private artifact found inside release archive" >&2
    exit 1
  fi

  if tar -tzf "$release_archive" | rg -n 'daily-github-sync'; then
    echo "operator-only daily GitHub sync wording found inside public archive" >&2
    exit 1
  fi

  if tar -tzf "$release_archive" \
    | rg '\.(md|txt|json|sh|py|sql|cjs|mjs|ts|tsx|js|css|html|ya?ml)$' \
    | rg -v '^scripts/verify-public-package\.sh$' \
    | while IFS= read -r archive_path; do tar -xOzf "$release_archive" "$archive_path"; done \
    | rg -n 'daily GitHub sync|Once per day, all applied zorg-db-memory skill updates'; then
    echo "operator-only daily GitHub sync wording found inside public archive" >&2
    exit 1
  fi
fi

archive_release_count="$(tar -tzf "$release_archive" | rg -c '^release/v[^/]+\.md$' || true)"
if [[ "$archive_release_count" -ne 1 ]]; then
  echo "release archive must contain exactly one current release note" >&2
  exit 1
fi

echo "public package verification passed"
