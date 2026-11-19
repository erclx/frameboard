---
title: Frame bridge
description: The script inside each frame that answers the board over postMessage, and the board's end of that channel
---

# Frame bridge

## Overview

Owns how the board reads and edits a frame without touching its document, being the script the frame route injects into every frame and the channel the board posts through. The contract both sides parse lives in `src/shared/frame-bridge/`, and the frame route that injects the script is in `canon/context/board/server.md`.

## Layout

### `src/frame-bridge/`

Holds the script that runs in each frame's own realm, built to `dist/frame-bridge.js` and served by the look routes under `/frameboard/bridge/` at the running release. It answers each board request with one reply under the same id, and a subscribing op pushes under that id until either side closes it.

- The script removes its own `<script>` as it starts, so the live element indices the board reads match the file
- It answers `window.parent` at a loopback origin on any port or its own, replying to each request's origin and posting `shown` to any, and a frame with no parent never listens
- `main.ts` checks each request against its op's schema and hands it to one area, such as `measure.ts`, `steps.ts`, or `keys.ts`, whose `focus-keys` lets the pointer mark hear Tab leave a frame
- It announces its hash in a `shown` message once its body parses, on a restamp, and as its page goes, naming the page by an id, since a page going posts with no window
- Text in place owns `contenteditable` and the keys, opens only the run at the point beside a child, and keeps the old text until the board says whether the write landed

### `src/client/board/bridge/`

Owns the board's end, which posts a request to one iframe's window and resolves its reply by id. A message counts only from the window and origin its request went to, under an id still open, and a frame that never answers resolves null after 5 seconds, long enough for a loaded machine or a heavy frame to answer.

- The board focuses the iframe before an edit opens, since a frame on another origin cannot take focus itself, and hands focus back when the edit is refused
- The channel parses every reply and push against its op's schema and answers null for one in another shape, since a frame's own script can post in the bridge's shape
- `shown.ts` holds each iframe's announced hash. `followFrame` reopens a subscription on each page, restamp, and swap, and `followPage` keeps one per page for the theme, scrollbar, rail, and keys.
- What a press reads, being the selection's measures, the ghosts, the pin corners, a scroll frame's view, and Play's reach, is held on the board from the frame's word, so it trails the page
- The preview height hides its iframe for its two readings, at 1 px and at the reference height, since two requests cannot share the one task the collapsed page never painted in

### `src/shared/frame-bridge/`

Holds the contract both sides import, since the frame bundle may import nothing from the board. `messages.ts` carries the envelope, the op names, and a zod schema per op, and the files beside it carry the shapes the ops reply with.

- `elements.ts` holds the element addressing helpers, `frameElements`, `elementIndex`, `elementAt`, and `renderedHash`, which the frame and the board's later readers both call
- `live-element.ts`, `gap.ts`, `media.ts`, `model.ts`, `motion.ts`, and `controls.ts` each pair a reply's shape with its schema, and the pure parsers such as `flowOf` sit beside the shapes they read

## Gotchas

- A source run builds the bridge in memory once per process, so a change under `src/frame-bridge/` needs `bun run dev` restarted to reach a frame
- A kit preview loads no bridge, since its policy runs the theme script alone by hash
- A test frame through `srcdoc` loads the bridge as a module from `/src/frame-bridge/main.ts`, its tag skipped by index, and settles on its first reply, since `shown` lands after `load`
- A preview's put-back map lives in the frame keyed by index with no hash, so a put-back after a restamp still reaches the node it previewed
- A restamp is posted before the board holds its hash, so every request the held hash wakes reaches the frame after its stamp moved
