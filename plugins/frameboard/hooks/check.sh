#!/usr/bin/env bash

# Runs frameboard's content check on a file an agent just wrote, handing any
# finding back to the agent in the same turn. It lives inside the plugin
# because the loader refuses a hook command outside it, and it resolves the
# installed check rather than shipping one, so the rules always match the
# frameboard the project runs.
#
# The check is run directly, never through a package runner, which costs
# about ten times the check on every write. Every path exits 0, since the
# write stands whatever a hook does and a failure would only print an error
# the agent cannot act on.

hook_entry() {
  local candidate bin
  if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]]; then
    candidate="$CLAUDE_PROJECT_DIR/node_modules/frameboard/dist/hook.js"
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi
  # A global install puts `frameboard` on PATH as a link to dist/cli.js, and
  # the hook entry sits beside it.
  bin=$(command -v frameboard 2>/dev/null) || return 1
  bin=$(realpath "$bin" 2>/dev/null) || return 1
  candidate="$(dirname "$bin")/hook.js"
  [[ -f "$candidate" ]] || return 1
  printf '%s\n' "$candidate"
}

entry=$(hook_entry) || exit 0
runtime=$(command -v bun 2>/dev/null || command -v node 2>/dev/null) || exit 0

"$runtime" "$entry" || true
exit 0
