#!/usr/bin/env bash
# Backs `bun run screenshot` from a throwaway copy of the `basic` board, since a
# run in the committed fixture rewrites it. It sits here because a tooling sync
# overwrites scripts/screenshot.sh.
set -euo pipefail

SCRIPTS="$(dirname "${BASH_SOURCE[0]}")"
BOARD=test/fixtures/boards/basic
COPY="$(mktemp -d)"
trap 'rm -rf "$COPY"' EXIT

mkdir -p "$COPY/$(dirname "$BOARD")"
cp -R "$BOARD" "$COPY/$BOARD"
rm -rf "${COPY:?}/$BOARD/.run"
# Home sorts by last edited, and a copy's times differ by a race. Equal times
# fall to the name.
find "$COPY/$BOARD" -exec touch -t 202601010000 {} +

if [ -n "${FRAMEBOARD_EVIDENCE_ROOT:-}" ]; then
  CANON_PREVIEW_ROOT="$COPY" bash "$SCRIPTS/screenshot.sh"
else
  CANON_PREVIEW_ROOT="$COPY" FRAMEBOARD_EVIDENCE_ROOT="$COPY/evidence" \
    bash "$SCRIPTS/screenshot.sh"
  bun "$SCRIPTS/evidence-promote.ts" "$COPY/evidence"
fi
