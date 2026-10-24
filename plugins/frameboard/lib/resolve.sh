#!/usr/bin/env bash

# Sourced by the plugin's hook and monitor, never run. They resolve the
# installed frameboard rather than ship one, so what they run always matches
# the frameboard the project runs, and they share this lookup so the two
# never disagree on where the install lives.

# Prints the installed frameboard's dist folder, the project's own install
# first, then the build of a project that is the frameboard checkout itself,
# then a global one, or returns 1 when there is none.
frameboard_dist() {
  local candidate bin
  if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]]; then
    candidate="$CLAUDE_PROJECT_DIR/node_modules/frameboard/dist"
    if [[ -f "$candidate/cli.js" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    candidate="$CLAUDE_PROJECT_DIR/dist"
    if [[ -f "$candidate/cli.js" ]] &&
      grep -Eq '^  "name": "frameboard",?$' "$CLAUDE_PROJECT_DIR/package.json" 2>/dev/null; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi
  # A global install puts `frameboard` on PATH as a link to dist/cli.js.
  bin=$(command -v frameboard 2>/dev/null) || return 1
  bin=$(realpath "$bin" 2>/dev/null) || return 1
  candidate=$(dirname "$bin")
  [[ -f "$candidate/cli.js" ]] || return 1
  printf '%s\n' "$candidate"
}

# Prints the runtime the plugin runs frameboard on directly, never through a
# package runner, which costs about ten times the work on every call.
frameboard_runtime() {
  command -v bun 2>/dev/null || command -v node 2>/dev/null
}
