---
title: Hand actions
description: Selection, hide and lock, arranging and snapping, copying a frame as an image, right-click menus, and the keys behind each
---

# Hand actions

## Overview

Owns what the developer does to frames by hand outside the inspector, being selection, hide and lock, arranging, copying, the right-click menus, and the key or drag behind each. The history undo and redo read is in `canon/context/board/commands.md`.

## Layout

### `src/client/board/element/`

Owns picking, walking, and outlining elements, with the board's `selection.ts`: a click selects the frame, Cmd-click or a double-click the element, Shift-click or a marquee several, and Enter, Esc, and Tab walk the tree. Selecting writes nothing, so addresses stay put, and it draws the media bar, binding links, and overflow ghosts.

- A selection holds the hash the frame rendered, and a reload showing other bytes drops it to the frame unless the board's own edit or undo left those bytes or is still in flight
- An undo or redo keeps the element only while the tree at the answered hash matches the picked one in each index, parent, tag, and every name but its own
- A move key reads the tree inside the frame's turn rather than at the press, and an element edit holds the turn until Layers reads the bytes it answered
- `held.ts` keeps a released outline at the drop until the frame measures the element at the answered hash, since `ResizeObserver` never fires on a move
- `focusOnBoard()` gates the walks and exempts a note pin, a note card, a media bar, and any `data-label-control`, so Tab there moves focus natively

### `src/client/board/menus/`

Owns the right-click menus on a frame, the selected element, empty canvas, a page or layers row, and an Assets tile, each item running a registered action, greying while disabled, and showing its key. The Element menu ends with Delete through `POST /api/frames/remove`, after four restack items moving it in document order, never writing `z-index`.

- A right-click on a frame not yet selected selects it alone first, and one on the frame around the selected element selects the frame, so an item acts the way its key does
- Paste here sends the right-clicked point to place the group's top left there, and New frame here and both Add a note rows act at that point too
- A page row's menu moves the canvas to that page first, since the `page.*` actions act on the page shown, and Move up and Move down grey at the ends
- Flip to light or Flip to dark ends every selected frame in the theme opposite the right-clicked one, lasting until reload and writing nothing
- The menu key and Shift+F10 open a row's menu with focus inside, and a Ctrl-press the gestures keep for snapping opens none

### `src/client/board/structure/`

Owns the frame structure actions, being rename, duplicate, delete, hide, lock, copy, cut, and paste, and the Frame tool. Copy, cut, and Copy as PNG toast once they land, and a hand-placed frame keeps the size picked or drawn and hugs neither axis, while an agent's `frame add --size` still hugs its height.

- Each acts in Edit while the tab may write, on the frames selected on the canvas's page, and none acts while an element is selected, so Backspace never deletes a frame
- Delete and cut stay disabled while a selected frame is locked, and the server refuses both with `frame-locked` if sent anyway
- The server holds the clipboard in memory, so a paste never reads the source and a restart empties it, and Paste stays disabled until a copy and once the socket drops
- A cut is a copy and a delete in one undo step
- A paste lands on the page on the canvas, keeping each frame's box or sitting beside its source, and takes the next free name rather than writing over one

### `src/client/board/geometry/`

Owns turning pointer and keys into frame boxes apart from pan and zoom, with `gestures.ts` binding `d3-drag`, `draw.ts` drawing the overlay, pure `snap.ts`, `resize.ts`, and `hit.ts`, and `write.ts` sending every box through `POST /api/frames/boxes`. A press while an inspector field has focus blurs and applies it.

- A frame snaps to other frames' edges and centers unless Ctrl is held, and a box edit on a held frame waits for the claim, then goes with the first `expected` it started from
- The chip takes no pointer, so its controls carry `data-label-control` for the gestures to click on release, and a drag's readout goes into `[data-move-chip]`
- A move released with Alt held puts the frames back and sends one duplicate at the drop's offset as one undo step, and a locked frame neither moves nor copies
- A section's corner drag resizes the box alone, a crossed frame joining or leaving it by its center, and a refused section write puts the box back
- Esc during any drag puts everything back and writes nothing, and a cancelled resize redraws from its start boxes, since `drawRest` clears only a move's transform

### `src/client/board/preview/`

Owns the width a frame is previewed at, held in this tab's memory alone, so a reload drops it and nothing reaches the server, the history, or the hug step. The palette carries a preview at each preset and End preview, keeping a width already in the preset's range.

- The iframe keeps its `src` and reflows at the new width, so its animation, media queries, and element selection read the live page
- A frame hugging its height takes its content's height at the previewed width, while a page sized off the viewport keeps its stored height
- A frame the board stops showing, deleted, hidden, or moved to another page, drops its preview
- A frame draws at its pending box, where every press, hover, pick, note, and right-click hits it, and its label keeps the stored width
- `withPending` in `geometry/write.ts` hands every gesture the stored and pending boxes alone, and a box write ends the preview of each frame it names

## Gotchas

- Hide and lock are flags in the page's layout and never write into the frame, so neither binds the agent, whose writes the claim and the file hash govern
- A hidden frame leaves the canvas and composite captures but stays in the layers panel, and a locked one still selects from there
- Elements cannot be hidden, since it would write `display` into the frame, which no hand edit writes yet
- A drag carries a selected element, a corner mark resizes it, and a double-clicked model turns until Esc. Its frame moves from the label strip, since its bare `body` marquees.
- A hand box write sends the boxes the gesture started from, and the server refuses the whole write with `stale-layout` when an agent moved a frame since, or `frame-locked` for a locked one
