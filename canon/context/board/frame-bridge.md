---
title: Frame bridge
description: The script inside each frame that answers the board over postMessage, and the board's end of that channel
---

# Frame bridge

## Overview

Owns how the board reads and edits a frame without touching its document, being the script the frame route injects into every frame and the channel the board posts through. The envelope both sides parse lives in `src/shared/`, and the frame route that injects the script is in `canon/context/board/server.md`.

## Layout

### `src/frame-bridge/`

Holds the script that runs in each frame's own realm, built to `dist/frame-bridge.js` and served by the look routes under `/frameboard/bridge/` at the running release. It answers each board request with one reply under the same id, and a subscribing op pushes under that id until either side closes it.

- The script removes its own `<script>` as it starts, so the live element indices the board reads match the file
- It answers only `window.parent` at the frame's own origin, and a frame with no parent, as capture and the phone link show one, never listens
- Text in place runs here, owning `contenteditable`, the caret, Enter, paste, Esc, and blur, then pushes the committed text for the board to write
- Text beside a child element opens only the run at the double-clicked point, each child shut to the caret, each cancelable input spliced into it, and every other node put back at close
- A committed edit keeps its old text until the board says whether the write landed, and a refusal shows the old text again

### `src/client/board/bridge/`

Owns the board's end, which posts a request to one iframe's window and resolves its reply by id. A message counts only from the window and origin its request went to, under an id still open, and a frame that never answers resolves null after a second.

- The board focuses the iframe before an edit opens, since a frame on another origin cannot take focus itself, and hands focus back when the edit is refused
- Every reply and push is the frame's word, so a caller checks its shape with the guards in the shared envelope before acting on it

## Gotchas

- A source run builds the bridge in memory once per process, so a change under `src/frame-bridge/` needs `bun run dev` restarted to reach a frame
- A kit preview loads no bridge, since its policy runs the theme script alone by hash
- A test frame shown through `srcdoc` loads the bridge as a module from `/src/frame-bridge/main.ts`, which leaves its tag in place and is skipped by index
