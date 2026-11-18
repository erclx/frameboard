#!/usr/bin/env bash

# Follows this session's board inbox, one line per note. A monitor that exits
# never restarts and each line wakes the session, so with no install or no
# session id it stays alive and silent.

# shellcheck source=SCRIPTDIR/../lib/resolve.sh
source "$(dirname "${BASH_SOURCE[0]}")/../lib/resolve.sh"

if [[ -n "${CLAUDE_CODE_SESSION_ID:-}" ]] &&
  dist=$(frameboard_dist) &&
  runtime=$(frameboard_runtime); then
  exec "$runtime" "$dist/cli.js" inbox --follow 2>/dev/null
fi

exec tail -f /dev/null
