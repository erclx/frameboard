#!/usr/bin/env bash

# Compares the installed frameboard with this plugin at session start and
# prints a note when they differ, which Claude Code hands the agent as
# context. A hook compares deterministically, where a skill line would leave
# the agent to find plugin.json itself.
#
# Every path exits 0 and a match prints nothing, since the note is only
# worth a line of context when the two disagree. The note informs and never
# orders a halt, since the hook cannot tell whether the task touches the CLI.

# shellcheck source=SCRIPTDIR/../lib/resolve.sh
source "$(dirname "${BASH_SOURCE[0]}")/../lib/resolve.sh"

manifest="${CLAUDE_PLUGIN_ROOT:-$(dirname "${BASH_SOURCE[0]}")/..}/.claude-plugin/plugin.json"
plugin=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$manifest" 2>/dev/null | head -n 1)
[[ -n "$plugin" ]] || exit 0

if ! dist=$(frameboard_dist) || ! runtime=$(frameboard_runtime); then
  printf "frameboard plugin %s is installed but the frameboard command is not found. Install it with 'npm install -g frameboard'.\n" "$plugin"
  exit 0
fi

cli=$("$runtime" "$dist/cli.js" --version 2>/dev/null) || exit 0
[[ -n "$cli" && "$cli" != "$plugin" ]] || exit 0

# The fix depends on which side is older and where the CLI resolved from, so
# the note names the install it found and the side to update.
if [[ "$(printf '%s\n%s\n' "$cli" "$plugin" | sort -V | head -n 1)" == "$plugin" ]]; then
  fix="Tell the developer to update the plugin, since the CLI is newer."
elif [[ -n "${CLAUDE_PROJECT_DIR:-}" && "$dist" == "$CLAUDE_PROJECT_DIR/node_modules/frameboard/dist" ]]; then
  fix="Tell the developer to update the frameboard dependency of this project, which a global install would not change."
elif [[ -n "${CLAUDE_PROJECT_DIR:-}" && "$dist" == "$CLAUDE_PROJECT_DIR/dist" ]]; then
  fix="Tell the developer this checkout's own build is stale, which 'bun run build' refreshes and a global install would not."
else
  fix="Tell the developer to update the CLI with 'npm install -g frameboard'."
fi

printf "frameboard plugin %s does not match the frameboard %s at %s. %s\n" "$plugin" "$cli" "$dist" "$fix"
exit 0
