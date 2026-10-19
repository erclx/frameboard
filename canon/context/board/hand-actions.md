---
title: Hand actions
description: Selection, undo and redo, hide and lock, arranging and snapping, copying a frame as an image, right-click menus, and the keys behind each
---

# Hand actions

## Overview

Owns what the developer does to frames by hand outside the inspector, being selection, undo and redo, hide and lock, arranging, copying, the right-click menus, and the key or drag behind each.

## Layout

### `src/client/board/`

Owns selection, the keys, and the menus on the canvas.

- A click selects the frame, and Cmd-click or a double-click selects the element under the cursor. Enter goes one level down, Esc one level up, and Tab steps through siblings.
- Enter at a frame selects the first child of its `body`, and Esc at a child of `body` selects the frame, so the next Esc clears the selection. Tab wraps within the parent, and Esc closes an open note card before it moves the selection.
- An element selection holds the hash the frame rendered, and a reload showing other bytes drops it to the frame, since an agent's write may have shifted every index
- Shift-click or a marquee drag selects several frames, and move, nudge, align, duplicate, copy, cut, hide, lock, and delete act on all of them
- Arrow keys nudge a frame, Cmd with an arrow resizes it, and Cmd+C, Cmd+X, and Cmd+V copy, cut, and paste frames into any project's current page
- Alt+A, D, W, S align, Alt+H and Alt+V center, and Ctrl+Alt+H and Ctrl+Alt+V distribute, each writing the page's layout alone
- Cmd+Shift+H hides, Cmd+Shift+L locks, and Cmd+Shift+C copies a frame as a PNG in the theme on screen, rendered by the browser `capture` uses

### `src/client/board/geometry/`

Owns turning pointer and keys into frame boxes, apart from the canvas's pan and zoom.

- `gestures.ts` binds `d3-drag` to the hit layer beside the viewport's `d3-zoom`, and `draw.ts` writes the overlay's DOM from the drag handler
- `snap.ts`, `arrange.ts`, `resize.ts`, and `hit.ts` are pure, and `actions.ts` registers the selection, nudge, and arrange keys
- `write.ts` holds a released box as pending until the server's next board carries it, and sends every hand move or resize through `POST /api/frames/boxes`

### `src/server/`

Owns the edit history undo reads, in `src/server/history/`.

- Undo and redo cover hand edits, moves, resizes, reorders, renames, adds, duplicates, and deletes, held as small before-and-after records
- A board verb handed a `Journal` from `src/server/board/journal.ts` reports each change it made, and `History.record` keeps them as one step, at most 100 steps deep
- A change is one layout entry, one page order, one rename, or one path with its content hash, so an agent's write elsewhere in the same file neither blocks an undo nor is reverted by it
- Every change of a step is checked under its records' locks before any is written, and an undo whose target an agent has since changed is refused with `undo-overtaken`, dropped, and named in a toast
- A delete moves the path into `.run/trash/<step>/`, so its undo is a rename back, and the history and the trash both empty when the server starts and stops
- Only the board's own writes record. The CLI verbs pass no journal, and neither do a note write or an asset drop, so an agent's change never enters the developer's history

## Gotchas

- Selecting writes nothing, so element addresses stay put, the way Figma and Paper both work
- Hide and lock are flags in the page's layout and never write into the frame, so neither binds the agent, whose writes the claim and the file hash govern
- A hidden frame leaves the canvas and composite captures but stays in the layers panel, and a locked one still selects from there
- Elements cannot be hidden, because that would write `display` into the frame, which is layout
- A dragged or resized frame snaps to other frames' edges and centers, and holding Ctrl turns snapping off
- A hand box write sends the boxes the gesture started from, and the server refuses the whole write with `stale-layout` when an agent moved a frame since, or `frame-locked` for a locked one
