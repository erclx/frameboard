#!/usr/bin/env bash
# Backs `bun run screenshot`. Serves the capture from a throwaway copy of the
# `basic` board, since a run in the committed fixture rewrites its notes.json
# when a case edits the hero, and leaves a change log in .run/ that the next
# run paints as unseen agent changes. Evidence lands in a temporary root and
# reaches e2e/evidence/ through evidence-promote.ts, unless the caller named a
# root in FRAMEBOARD_EVIDENCE_ROOT. scripts/screenshot.sh is a file a tooling
# sync overwrites, so all of this sits here.
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
