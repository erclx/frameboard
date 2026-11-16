---
title: Playback
description: A frame's motion held in the board, Play mode, and presenting a page as slides
---

# Playback

## Overview

Owns how the board runs what a frame draws over time, being the motion hold, Play mode, and present mode with its transitions and steps. The canvas around it is in `canon/context/board/shell.md`, and the inspector sections that set a hold, a transition, or a step in `canon/context/board/inspector/panel.md`.

## Layout

### `src/client/board/motion/`

Owns the hold, a frame's timeline driven by the board in this tab alone. The inspector's Motion section sets it, and the label shows a Held chip naming the moment, whose click ends it.

- `store.ts` keeps each held or playing frame's moment by ref, and nothing in it reaches the server, the history, or another tab
- `seek.ts` calls the seek functions in `src/shared/motion.ts` on the iframe's own window, so the hold lands on the frame's clock and never the board's
- A drag keeps only the latest moment while a seek runs, and play seeks every animation frame. A finite timeline stops held at its end, and one that repeats forever loops over one iteration.
- A hold ends on entering Play and when the frame leaves the canvas on a page switch, and an agent's write reloading the frame lands it on the same moment
- Ending a hold plays CSS animations on from where they stand, and reloads a `__hf` or `__timelines` page, since neither contract names a play

A free-running frame whose finite timeline has finished reads Play at its end time, through one timer in `useMotionEnded` rather than a read every frame.

### `src/client/board/play/`

Owns Play's own state and surfaces, being the frame entered, the shield, and what the banner can say about a page's reach.

- `entered.ts` holds the one entered frame by ref, cleared on leaving Play, on a page switch, and when the frame stops drawing a live page
- `shield.tsx` sits under the frames' layer, so the wheel and a drag over any other frame reach `d3-zoom`. A click enters the frame `frameAt` finds and a click on empty canvas leaves.
- d3-zoom swallows the click ending a press that moved past 3 px, so a pan starting over a frame never enters it while a jittered click still does
- Esc runs `play.leaveFrame` ahead of `mode.exitPlay`, bound into the entered frame's window, where the board's keys never arrive
- A layers row in Play reveals its frame and enters it

### `src/client/board/present/`

Owns present mode, which shows a page's frames one at a time over the whole window on black, through the browser's Fullscreen API. Each frame scales to fit, never past twice its size. It is a view and never a write, so it records no undo step.

- `present.start`, on Shift+P, the Present button, or the palette, opens on the first selected frame in reading order, or the next shown one when that is hidden
- It asks for full screen inside that press, since the browser grants it only then, and a refusal presents in the window
- `order.ts` reads rows top to bottom, each left to right. A frame joins the open row while its top sits above the middle of that row's first frame.
- Tab on the board and the Layers panel keep Layers order, so the two orders differ on one page
- `store.ts` holds the page and frame by ref and rereads the order from the live page, so an agent's added or hidden frame joins or leaves it and the frame on screen stays

The overlay and its bar carry the stepping, the keys, and the way back.

- `bar.tsx` draws back, the count, the name in a fixed 150px slot, next, and leave, shown on a pointer move and hidden after two seconds still
- The arrows and Space step, stopping on the last frame, and Esc, the bar's leave, or leaving full screen returns to the board with that frame selected
- Leaving returns focus to what opened presenting, or to the Present button once that is gone
- `overlay.tsx` takes keys in the capture phase on the board's window and the frame's own, and makes the board behind it inert, so focus and keys never reach the board

A transition between slides and the steps inside one are the board's own drawing, and neither writes a frame's file.

- `transition.tsx` keeps the leaving slide mounted under the arriving one for the transition's length, each a `data-present-layer`, and the leaving layer takes no pointer
- `travel.ts` resolves a frame's own transition over its page's. Going back, the leaving slide takes back the one it arrived with, and reduced motion makes every one a cut.

A project's own transition plays keyframes the server read out of its file, never the file.

- `own-transitions.ts` fetches them when presenting starts and when the project record's names change, and a step taken before they arrive cuts
- `ownKeyframesName` names each pair with its project, and a transition holding no `leave` keeps its leaving slide still

Steps sit inside one slide.

- `steps.ts` reads `data-step` off the presented document, closes gaps in the numbers, joins a with-previous or after-previous step to the one before, and hides the unrevealed through one injected style
- `store.ts` holds the step shown, so a press reveals the next and moves a slide only once none is left. A slide arrived at going back opens on every step.
- `bar.tsx` draws one dot per step, filled up to the step shown. Only present mode hides a step, so Edit, Play, a capture, and an export show every one.
