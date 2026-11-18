#!/usr/bin/env bash
# Usage: install-playwright-deps.sh [--package <spec>] <browser>...
# Retries a hung attempt, since a degraded apt mirror hangs rather than fails.
# Exits 0 on success, 2 with no browser, else the last attempt's code.
set -e

package=playwright
if [ "$1" = "--package" ]; then
  package=$2
  shift 2
fi

if [ $# -eq 0 ]; then
  echo "Usage: install-playwright-deps.sh [--package <spec>] <browser>..." >&2
  exit 2
fi

attempts=3
bound=${INSTALL_ATTEMPT_SECONDS:-150}

# The runner image sets these, yet a stalled log shows gaps of minutes, so
# print what apt actually reads to settle whether they took effect
apt-config dump | grep -E '^Acquire::(Retries|http::Timeout) ' || true

status=0
for attempt in $(seq 1 "$attempts"); do
  if [ "$attempt" -gt 1 ]; then
    # A root apt-get under sudo can outlive timeout's signal and hold the lock.
    sudo pkill -KILL -x 'apt-get|dpkg' || true
    # A kill during unpack leaves dpkg interrupted, which refuses the next
    # install. Its own failure must not end the loop.
    sudo dpkg --configure -a || echo "dpkg --configure -a failed before attempt ${attempt}" >&2
  fi

  status=0
  timeout --kill-after=10 "$bound" bunx "$package" install-deps "$@" || status=$?
  if [ "$status" -eq 0 ]; then
    exit 0
  fi
  echo "attempt ${attempt}/${attempts} failed with exit ${status}" >&2
done

exit "$status"
