#!/usr/bin/env bash

# Runs the installed content check on an agent's write, inside the plugin since
# the loader refuses a hook outside it. Every path exits 0, since the write
# stands and a failure would only print an error the agent cannot act on.

# shellcheck source=SCRIPTDIR/../lib/resolve.sh
source "$(dirname "${BASH_SOURCE[0]}")/../lib/resolve.sh"

dist=$(frameboard_dist) || exit 0
entry="$dist/hook.js"
[[ -f "$entry" ]] || exit 0
runtime=$(frameboard_runtime) || exit 0

"$runtime" "$entry" || true
exit 0
