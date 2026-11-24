#!/usr/bin/env bash
# Usage: build-side.sh <ref> <dir>
# Builds one commit in a worktree of its own at <dir>. A branch is read off
# origin first, since a fresh checkout holds no local one.
set -euo pipefail

ref="${1:-}"
dir="${2:-}"
if [[ -z "$ref" || -z "$dir" ]]; then
  echo "build-side: usage: build-side.sh <ref> <dir>" >&2
  exit 2
fi

commit=$(git rev-parse --verify --quiet --end-of-options "refs/remotes/origin/$ref^{commit}") ||
  commit=$(git rev-parse --verify --quiet --end-of-options "$ref^{commit}") || {
  echo "build-side: '$ref' names no branch, tag, or commit of this repository" >&2
  exit 1
}

git worktree add --detach "$dir" "$commit"
cd "$dir"
HUSKY=0 bun install --frozen-lockfile
bun run build
echo "build-side: '$ref' is $commit"
