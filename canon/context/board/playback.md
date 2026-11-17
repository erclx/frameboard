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

Owns Play's own state and surfaces, being the frame entered, the shield, the drawn controls that run in the entered frame alone, and what the banner says about a page's reach. A layers row in Play reveals its frame and enters it.

| Piece          | Role                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `entered.ts`   | Holds the one entered frame, cleared on leaving Play, a page switch, or the frame losing its live page   |
| `shield.tsx`   | Sits under the frames' layer, a click entering the frame `frameAt` finds and one on empty canvas leaving |
| `controls.ts`  | Listens for `input` on the entered document, setting a moved control's property inline on its target     |
| `keep-bar.tsx` | Draws inside the frame's bottom right once a control moves, and Keep values writes through `keepEdits`   |

The traps below sit under those pieces.

- d3-zoom swallows the click ending a press that moved past 3 px, so a pan starting over a frame never enters it while a jittered click still does
- Esc runs `play.leaveFrame` ahead of `mode.exitPlay`, bound into the entered frame's window, where the board's keys never arrive
- `controls.ts` binds again on every load of the entered iframe, since a frame can be entered before its page draws and a reload is a new document
- Leaving the frame, a page switch, or leaving Play puts each moved control back to the file's values, so Edit never shows a value the file does not hold
- Keep values is one `writeElements` call, so one undo puts the file back, and a view-only tab tunes live with a bar offering Reset alone

### `src/client/board/present/`

Owns present mode, which shows a page's frames one at a time over the whole window on black through the Fullscreen API, each scaled to fit and never past twice its size. `present.start` runs on Shift+P, the Present button, or the palette, and present is a view that records no undo step.

| Piece                | Role                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `order.ts`           | Reads rows top to bottom, each left to right, a frame joining a row while its top clears its middle |
| `store.ts`           | Holds the page, frame, and step by ref, rereading the order so an agent's change joins it           |
| `bar.tsx`            | Back, the count, the name in a fixed slot, next, and leave, hidden after two seconds still          |
| `overlay.tsx`        | Takes keys in the capture phase on both windows and makes the board behind it inert                 |
| `transition.tsx`     | Keeps the leaving slide mounted under the arriving one, each a `data-present-layer`                 |
| `travel.ts`          | Resolves a frame's transition over its page's, going back taking back the one a slide arrived with  |
| `own-transitions.ts` | Fetches a project's own keyframes when presenting starts and when its names change                  |
| `steps.ts`           | Reads `data-step`, closing gaps and joining with-previous steps, and hides the unrevealed           |

The rules below are what the pieces leave unsaid.

- It asks for full screen inside the starting press, since the browser grants it only then, and a refusal presents in the window
- Tab on the board and the Layers panel keep Layers order, so the two orders differ on one page
- Leaving returns focus to what opened presenting, or to the Present button once that is gone, with the frame shown selected
- Reduced motion makes every transition a cut, a step taken before own keyframes arrive cuts, and a transition with no `leave` keeps its leaving slide still
- Only present mode hides a step, so Edit, Play, a capture, and an export show every one
