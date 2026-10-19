---
description: Serves and drives a UI review preview from a throwaway copy of the fixture board, so review drives never change tracked files
---

# Review preview standards

## Serving

- Serve a UI pull request's preview from a fresh copy of the fixture board at `.canon/tmp/review-board/pr-<number>/`, never from `test/fixtures/boards/`, since the board writes to disk.
- Hand the reviewer and the operator the same preview address, so both see the board that was reviewed.
- Recopy the board when the head moves, and keep its board server running until the UI review closes.

## Driving

- Drive only the address the worker handed over, and never edit a file under `test/fixtures/`.
- Pause and tell the worker when a drive changed a tracked file, rather than restoring it yourself.
