#!/usr/bin/env bash
set -euo pipefail

# Prints the base port, plus a per-worktree offset in a linked worktree, so
# two worktrees never share one. A folder its worktree left behind is refused,
# since every port it derives lands on the main checkout's.

base="${1:-0}"
band=50
worktrees_dir=".claude/worktrees"

refuse() {
  echo "worktree-port: $1 is a leftover worktree folder, because $2." >&2
  echo "worktree-port: a port derived here collides with the main checkout, so remove the folder, or set WORKTREE_PORT_OFFSET to serve from it anyway." >&2
}

offset() {
  if [[ -n "${WORKTREE_PORT_OFFSET:-}" ]]; then
    echo "$WORKTREE_PORT_OFFSET"
    return
  fi

  local here git_dir common_dir toplevel dir name
  here=$(pwd -P)

  if ! git_dir=$(git rev-parse --git-dir 2>/dev/null); then
    # Git refuses outright when a `.git` file names an administrative directory
    # that is gone, which is what removing a worktree by hand leaves behind.
    # Outside a repository there is no pointer at all and the base is correct.
    dir=$here
    while [[ "$dir" != / ]]; do
      if [[ -f "$dir/.git" ]]; then
        refuse "$dir" "its .git file names an administrative directory that is gone"
        return 1
      fi
      [[ -d "$dir/.git" ]] && break
      dir=$(dirname "$dir")
    done
    echo 0
    return
  fi

  common_dir=$(git rev-parse --git-common-dir 2>/dev/null) || {
    echo 0
    return
  }
  toplevel=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo 0
    return
  }
  toplevel=$(cd "$toplevel" && pwd -P)

  if [[ "$(cd "$git_dir" && pwd -P)" == "$(cd "$common_dir" && pwd -P)" ]]; then
    # A folder whose worktree was removed also reads as the main checkout, since
    # the lookup walks up to the parent, so location under the worktrees folder
    # is the only signal separating the two.
    if [[ "$here/" == "$toplevel/$worktrees_dir/"?* ]]; then
      refuse "$here" "no worktree is registered for it"
      return 1
    fi
    echo 0
    return
  fi

  name=$(basename "$toplevel")
  clear_offset $(($(printf '%s' "$name" | cksum | cut -d' ' -f1) % band + 1))
}

# The ports the fetch standard blocks, which a browser refuses to load
# (https://fetch.spec.whatwg.org/#bad-port).
bad_ports=" 0 1 7 9 11 13 15 17 19 20 21 22 23 25 37 42 43 53 69 77 79 87 95 101 102 103 104 109 110 111 113 115 117 119 123 135 137 139 143 161 179 389 427 465 512 513 514 515 526 530 531 532 540 548 554 556 563 587 601 636 989 990 993 995 1719 1720 1723 2049 3659 4045 4190 5060 5061 6000 6566 6665 6666 6667 6668 6669 6679 6697 10080 "

# The bases this repo adds the bare offset to: the preview and Playwright in
# package.json and playwright.config.ts, then Vite and the board server in
# vite.config.ts.
repo_bases="4173 5173 6173"

# Walks a hashed offset up through the band, wrapping to 1, until no base it
# is added to lands on a blocked port.
clear_offset() {
  local candidate=$1 tried port_base bases=$repo_bases
  # A bare call prints the offset, which is no port.
  ((base != 0)) && bases="$base $repo_bases"
  for ((tried = 0; tried < band; tried++)); do
    local blocked=0
    for port_base in $bases; do
      [[ "$bad_ports" == *" $((port_base + candidate)) "* ]] && blocked=1
    done
    if ((blocked == 0)); then
      echo "$candidate"
      return
    fi
    candidate=$((candidate % band + 1))
  done
  echo "worktree-port: every offset from 1 to $band lands a base on a blocked port." >&2
  return 1
}

value=$(offset) || exit 1
echo $((base + value))
