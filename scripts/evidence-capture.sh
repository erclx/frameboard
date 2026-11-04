#!/usr/bin/env bash
# Backs `bun run screenshot`. Serves the capture from a throwaway copy of the
# `basic` board, since a run in the committed fixture rewrites its notes.json
# when a case edits the hero, and leaves a change log in .run/ that the next
# run paints as unseen agent changes. scripts/screenshot.sh is a file a tooling
# sync overwrites, so the copy is made here.
set -euo pipefail

BOARD=test/fixtures/boards/basic
COPY="$(mktemp -d)"
trap 'rm -rf "$COPY"' EXIT

mkdir -p "$COPY/$(dirname "$BOARD")"
cp -R "$BOARD" "$COPY/$BOARD"
rm -rf "${COPY:?}/$BOARD/.run"
# Home sorts by last edited, and a copy's times differ by a race. Equal times
# fall to the name.
find "$COPY/$BOARD" -exec touch -t 202601010000 {} +

CANON_PREVIEW_ROOT="$COPY" bash "$(dirname "${BASH_SOURCE[0]}")/screenshot.sh"
