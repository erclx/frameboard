#!/usr/bin/env bash

# Follows this session's board inbox for the whole session, so each note the
# developer sends from the board reaches it as one line. Claude Code sets
# CLAUDE_CODE_SESSION_ID in a monitor's environment, which `inbox` reads.
#
# A monitor that exits is not started again, and every line it prints wakes
# the session, so with no install or no session id it stays alive and
# silent rather than exiting or printing an error.

# shellcheck source=SCRIPTDIR/../lib/resolve.sh
source "$(dirname "${BASH_SOURCE[0]}")/../lib/resolve.sh"

if [[ -n "${CLAUDE_CODE_SESSION_ID:-}" ]] &&
  dist=$(frameboard_dist) &&
  runtime=$(frameboard_runtime); then
  exec "$runtime" "$dist/cli.js" inbox --follow 2>/dev/null
fi

exec tail -f /dev/null
