#!/usr/bin/env bash

# Runs frameboard's content check on a file an agent just wrote, handing any
# finding back to the agent in the same turn. It lives inside the plugin
# because the loader refuses a hook command outside it, and it resolves the
# installed check rather than shipping one, so the rules always match the
# frameboard the project runs.
#
# Every path exits 0, since the write stands whatever a hook does and a
# failure would only print an error the agent cannot act on.

# shellcheck source=SCRIPTDIR/../lib/resolve.sh
source "$(dirname "${BASH_SOURCE[0]}")/../lib/resolve.sh"

dist=$(frameboard_dist) || exit 0
entry="$dist/hook.js"
[[ -f "$entry" ]] || exit 0
runtime=$(frameboard_runtime) || exit 0

"$runtime" "$entry" || true
exit 0
