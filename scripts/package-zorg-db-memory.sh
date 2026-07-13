#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_version="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([0-9][0-9.]*\)".*/\1/p' "$root/package.json" | head -1)"
version="${1:-$package_version}"
out_dir="$root/release"
mkdir -p "$out_dir"

archive="$out_dir/zorg-db-memory-v${version}.tar.gz"
rm -f "$archive"

tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.gradle' \
  --exclude='*/build' \
  --exclude='*/local.properties' \
  --exclude='.next' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='tmp' \
  --exclude='*.env' \
  --exclude='sql_memory_map.json' \
  --exclude='release/*.tar.gz' \
  -czf "$archive" \
  -C "$root" \
  README.md CHANGELOG.md LICENSE package.json skills package docs scripts \
  "release/v${version}.md"

echo "$archive"
