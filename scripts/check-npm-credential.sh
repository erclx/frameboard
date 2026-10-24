#!/usr/bin/env bash
set -euo pipefail

# Checks that NPM_TOKEN is set and that npm accepts it. Takes no arguments and
# reads NPM_TOKEN from the environment. Runs before the release tag exists, so
# a release is never cut that it cannot publish.

if [ -z "${NPM_TOKEN:-}" ]; then
  echo "::error::NPM_TOKEN is not set. Add the secret before a release can be cut."
  exit 1
fi
if ! curl -sf -H "Authorization: Bearer $NPM_TOKEN" https://registry.npmjs.org/-/whoami >/dev/null; then
  echo "::error::NPM_TOKEN did not authenticate. It is likely expired or revoked."
  exit 1
fi
