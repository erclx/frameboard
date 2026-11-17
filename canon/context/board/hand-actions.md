---
title: Hand actions
description: Selection, hide and lock, arranging and snapping, copying a frame as an image, right-click menus, and the keys behind each
---

# Hand actions

## Overview

Owns what the developer does to frames by hand outside the inspector, being selection, hide and lock, arranging, copying, the right-click menus, and the key or drag behind each. The history undo and redo read is in `canon/context/board/commands.md`.

## Layout

### `src/client/board/element/`

Owns picking, walking, and outlining an element, and with the board folder's `selection.ts` the selection keys and menus on the canvas. Selecting writes nothing, so element addresses stay put, and several elements in one frame select together at one hash, `element` holding the last picked.

| Input                      | Result                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| A click                    | The frame, or inside a selected element's frame another element, the bare `body` reselecting the frame |
| Cmd-click or double-click  | The element under the cursor, a double-click on text also opening it for typing in place               |
| Shift-click or a marquee   | Several frames, or with an element selected several elements, `group.ts` drawing one box around them   |
| Enter, Esc, and Tab        | Walk down to `body`'s first child, up to the frame, and across within the parent, on the canvas alone  |
| Tab with one frame         | The next frame in Layers order through `board-actions.ts`, wrapping, skipping hidden, centering it     |
| Alt+Shift+ArrowUp or Down  | Moves the element among its siblings, since Alt+ArrowUp alone is `nav.home`                            |
| Shift+A                    | Wraps siblings in one flow `div` named `Container` through `POST /api/frames/wrap`                     |
| An Absolute element's drag | Previews `left` and `top` and writes both on release through `resize.ts`, Esc writing nothing          |
| A selected video or audio  | `media-bar.tsx` drives the live node through `media.ts`, writing nothing, over the browser's own strip |
| A frame's drawn controls   | `binding-links.tsx` tags each with its selector and property, red where it matches nothing             |
| An element past the edge   | `overflow.ts` draws a dashed ghost a press selects and drags, and a scroll frame draws none            |

The rules below keep a selection on the element it names.

- A selection holds the hash the frame rendered, and a reload showing other bytes drops it to the frame unless the board's own edit or undo left those bytes or is still in flight
- An undo or redo keeps the element only while the tree at the answered hash matches the picked one in each index, parent, tag, and every name but its own
- A move key reads the tree inside the frame's turn rather than at the press, and an element edit holds the turn until Layers reads the bytes it answered
- `held.ts` keeps a released outline at the drop until the frame measures the element at the answered hash, since `ResizeObserver` never fires on a move
- `focusOnBoard()` gates the walks and exempts a note pin, a note card, a media bar, and any `data-label-control`, so Tab there moves focus natively

### `src/client/board/menus/`

Owns the right-click menus on a frame, the selected element, empty canvas, a page row, and a layers row, each item running a registered action, greying while disabled, and showing its key. The Element menu ends with Delete through `POST /api/frames/remove`, after four restack items that move the element in document order and never write `z-index`.

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

Owns turning pointer and keys into frame boxes, apart from the canvas's pan and zoom. A press on the canvas while an inspector field has focus blurs and applies it, selecting nothing, while a drag from that press still moves frames.

| Piece                            | Role                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `gestures.ts`                    | Binds `d3-drag` to the hit layer beside `d3-zoom`, reading the corner marks' cursor by position |
| `draw.ts`                        | Writes the overlay's DOM from the drag handler                                                  |
| `snap.ts`, `resize.ts`, `hit.ts` | Pure, as is `src/shared/arrange.ts`, which frames and elements both align through               |
| `write.ts`                       | Sends every hand move or resize through `POST /api/frames/boxes`, pending until the next board  |
| `overlay.tsx`                    | The selection chip, naming the frame and its Layers place, or `N frames`                        |
| A section's name                 | Its handle, moving the box, its frames, and their pins in one write                             |

The traps below sit under those pieces.

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
- A drag on a selected element or its outline carries it, and one on a corner mark resizes it. Its frame moves from the label strip or an element it holds, since its bare `body` marquees.
- A hand box write sends the boxes the gesture started from, and the server refuses the whole write with `stale-layout` when an agent moved a frame since, or `frame-locked` for a locked one
