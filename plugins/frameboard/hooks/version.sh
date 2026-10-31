#!/usr/bin/env bash

# Compares the installed frameboard with this plugin at session start and
# prints a note when they differ, which Claude Code hands the agent as
# context. A hook compares deterministically, where a skill line would leave
# the agent to find plugin.json itself.
#
# Every path exits 0 and a match prints nothing, since the note is only
# worth a line of context when the two disagree.

# shellcheck source=SCRIPTDIR/../lib/resolve.sh
source "$(dirname "${BASH_SOURCE[0]}")/../lib/resolve.sh"

manifest="${CLAUDE_PLUGIN_ROOT:-$(dirname "${BASH_SOURCE[0]}")/..}/.claude-plugin/plugin.json"
plugin=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$manifest" 2>/dev/null | head -n 1)
[[ -n "$plugin" ]] || exit 0

if ! dist=$(frameboard_dist) || ! runtime=$(frameboard_runtime); then
  printf "frameboard plugin %s is installed but the frameboard command is not found. Tell the developer to run 'npm install -g frameboard'.\n" "$plugin"
  exit 0
fi

cli=$("$runtime" "$dist/cli.js" --version 2>/dev/null) || exit 0
[[ -n "$cli" && "$cli" != "$plugin" ]] || exit 0

printf "frameboard plugin %s does not match the installed frameboard %s. Stop and tell the developer, who can update the CLI with 'npm install -g frameboard'.\n" "$plugin" "$cli"
exit 0
