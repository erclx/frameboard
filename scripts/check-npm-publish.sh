#!/usr/bin/env bash
set -euo pipefail

# Checks that the newest GitHub release reached npm. Takes no arguments and
# reads GH_TOKEN and GH_REPO from the environment for gh. A release younger
# than the publish job's window passes without asking npm. Uses GNU date, so it
# runs on ubuntu and not on macOS.

if ! count=$(gh release list --limit 1 --json tagName --jq length); then
  echo "::error::Could not list the GitHub releases, so whether the newest reached npm is unknown."
  exit 1
fi
if [ "$count" -eq 0 ]; then
  echo "::notice::No GitHub release exists yet, so there is nothing to check against npm."
  exit 0
fi
if ! release=$(gh release view --json tagName,publishedAt --jq '"\(.tagName) \(.publishedAt)"') || [ -z "$release" ]; then
  echo "::error::Could not read the newest GitHub release, so whether it reached npm is unknown."
  exit 1
fi
read -r tag published <<<"$release"
age=$(($(date +%s) - $(date -d "$published" +%s)))
if [ "$age" -lt 900 ]; then
  echo "$tag is ${age}s old, inside the 15-minute window its publish job runs in."
  exit 0
fi
# A missing version is an E404, so read the whole list to tell it from an outage
if ! versions=$(npm view frameboard versions --json 2>/dev/null); then
  # The package itself is an E404 until its first publish lands
  if jq -e '.error.code == "E404"' <<<"$versions" >/dev/null 2>&1; then
    versions='[]'
  else
    echo "::error::Could not read frameboard from npm, so whether $tag reached it is unknown."
    exit 1
  fi
fi
if ! jq -e --arg v "${tag#v}" '[.] | flatten | index($v) != null' <<<"$versions" >/dev/null; then
  echo "::error::$tag has a GitHub release but npm does not serve it. Publish it with: gh workflow run release-please.yml -f tag=$tag"
  exit 1
fi
echo "$tag is on npm."
