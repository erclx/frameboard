---
title: Playback
description: A frame's motion held in the board, Play mode, and presenting a page as slides
---

# Playback

## Overview

Owns how the board runs what a frame draws over time, being the motion hold, Play mode, and present mode with its transitions and steps. The canvas around it is in `canon/context/board/shell.md`, and the inspector sections that set a hold, a transition, or a step in `canon/context/board/inspector/panel.md`.

## Layout

### `src/client/board/motion/`

Owns the hold, a frame's timeline driven by the board in this tab alone, set from the inspector's Motion section and shown as a Held chip on the label, whose click ends it. A free-running frame whose finite timeline has finished reads Play at its end time, through one timer in `useMotionEnded`.

- `store.ts` keeps each held or playing frame's moment by ref, and nothing in it reaches the server, the history, or another tab
- `seek.ts` calls the seek functions in `src/shared/motion.ts` on the iframe's own window, so the hold lands on the frame's clock and never the board's
- A drag keeps only the latest moment while a seek runs, and a finite timeline stops held at its end while one that repeats forever loops over one iteration
- A hold ends on entering Play and when the frame leaves the canvas on a page switch, and an agent's write reloading the frame lands it on the same moment
- Ending a hold plays CSS animations on from where they stand, and reloads a `__hf` or `__timelines` page, since neither contract names a play

### `src/client/board/play/`

Owns Play's state and surfaces, being the frame `entered.ts` holds, the `shield.tsx` under the frames' layer, and the drawn controls `controls.ts` runs in the entered frame alone, with `keep-bar.tsx` offering Keep values once one moves. A layers row in Play reveals its frame and enters it.

- d3-zoom swallows the click ending a press that moved past 3 px, so a pan starting over a frame never enters it while a jittered click still does
- Esc runs `play.leaveFrame` ahead of `mode.exitPlay`, bound into the entered frame's window, where the board's keys never arrive
- `controls.ts` binds again on every load of the entered iframe, since a frame can be entered before its page draws and a reload is a new document
- Leaving the frame, a page switch, or leaving Play puts each moved control back to the file's values, so Edit never shows a value the file does not hold
- Keep values is one `writeElements` call, so one undo puts the file back, and a view-only tab tunes live with a bar offering Reset alone

### `src/client/board/present/`

Owns present mode, a page's frames one at a time over the window on black through the Fullscreen API, each fit to at most twice its size and recording no undo step. `order.ts` reads rows, `store.ts` holds the page, frame, and step, `overlay.tsx` takes the keys, `overview.tsx` is the slide grid, and transitions and steps are the board's own drawing.

- It asks for full screen inside the starting press, since the browser grants it only then, and a refusal presents in the window
- Tab on the board and the Layers panel keep Layers order, so the two orders differ on one page
- Leaving returns focus to what opened presenting, or to the Present button once that is gone, with the frame shown selected
- Reduced motion makes every transition a cut, a step taken before own keyframes arrive cuts, and a transition with no `leave` keeps its leaving slide still
- Only present mode hides a step, so Edit, Play, a capture, and an export show every one

### `src/client/board/speaker-notes/`

Owns the strip under one selected slide where the presenter writes its speaker note, shown while the Slides tab is open or the slide holds one, and never in Play or present mode. The note lives on the frame's `layout.json` entry as `speakerNotes`, never in its file, apart from the pinned notes in `src/client/board/notes/`.

- `strip.tsx` mounts in the canvas's notes layer beside the label's rename field, since the hit layer covers the frames' layer and would take the press
- A typed note writes once, on blur or Ctrl or Cmd with Enter, as one undo step, refused `stale-layout` and kept in the field when an agent changed the note meanwhile
- A note past 10,000 characters is refused with the count shown rather than cut, and a held frame or a reader tab shows the note and takes no typing
- The strip hides while a move or resize drag carries its frame, read from the selection's move chip, and below 200 px of on-screen width
- `room.ts` publishes the strip's screen height, which `geometry/overlay.tsx` adds to the size chip's offset so the chip sits below the strip
