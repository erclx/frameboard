---
title: Hand actions
description: Selection, undo and redo, hide and lock, arranging and snapping, copying a frame as an image, right-click menus, and the keys behind each
---

# Hand actions

## Overview

Owns what the developer does to frames by hand outside the inspector, being selection, undo and redo, hide and lock, arranging, copying, the right-click menus, and the key or drag behind each.

## Layout

### `src/client/board/element/`

Owns picking, walking, and outlining an element, and with the board folder's `selection.ts` the selection keys and menus on the canvas. Selecting writes nothing, so element addresses stay put, the way Figma and Paper both work.

- A click selects the frame, Cmd-click or a double-click the element under the cursor, and a double-click on a selected text element edits it in place. Enter, Esc, and Tab walk down, up, and across.
- Shift-click or a marquee drag selects several frames, and move, nudge, align, duplicate, copy, cut, hide, lock, and delete act on all of them
- Arrow keys nudge a frame, Cmd with an arrow resizes it, and Cmd+C, Cmd+X, and Cmd+V copy, cut, and paste frames into any project's current page
- Alt+A, D, W, S align, Alt+H and Alt+V center, and Ctrl+Alt+H and Ctrl+Alt+V distribute, each writing the page's layout alone
- Cmd+Shift+H hides, Cmd+Shift+L locks, and Cmd+Shift+C copies a frame as a PNG in the theme on screen, rendered by the browser `capture` uses

Enter at a frame selects the first child of its `body`, and Esc at a child of `body` selects the frame, so the next Esc clears the selection. Tab wraps within the parent, and Enter and Tab walk only while focus sits on the canvas. Esc closes an open note card before it moves the selection, and returns an armed tool to Move first.

An element selection holds the hash the frame rendered, and a reload showing other bytes drops it to the frame, since an agent's write may have shifted every index. Bytes the board's own hand edit or undo left the frame at keep it, as does a reload landing while that write is in flight, since the reload of the bytes it answered is still to come.

- An undo or redo keeps the element only while the tree at the answered hash matches the picked tree in each index, parent, and tag, and in every name but the element's own
- A placement, a delete, or a move shifts indices, so a kept index would name another element or none, which the styles read refuses

### `src/client/board/menus/`

Owns the right-click menus on a frame, the selected element, empty canvas, a page row, and a layers frame or element row, which change together. Each item runs a registered action, greys while it is disabled, and shows that action's key, or the key of the one it stands in for.

The Element menu ends with Delete, which deletes the selected element with what it holds, as Delete and Backspace do. It posts to `POST /api/frames/remove` and waits under the claim card on a held frame.

- A right-click on a frame not yet selected selects it alone first, and one on the frame around the selected element selects the frame, so an item acts on the selection the way its key does
- Paste here shows Paste's key, sends the right-clicked point with the paste to place the group's top left there, and New frame here and both Add a note rows act at that point too
- A page row's menu moves the canvas to that page first, since the `page.*` actions act on the page shown, New page below runs `page.new`, and Move up and Move down grey at the ends
- Flip to light or Flip to dark ends every selected frame in the theme opposite the right-clicked one, lasting until reload and writing nothing
- The menu key and Shift+F10 open a row's menu with focus inside, and a Ctrl-press the gestures keep for snapping opens none

### `src/client/board/structure/`

Owns the frame structure actions, being rename, duplicate, delete, hide, lock, copy, cut, and paste, and the Frame tool, which change together. Copy, cut, and Copy as PNG toast once they land, since nothing on the canvas shows them, and a refused write raises one error toast from its caller.

The Frame tool, New frame here, and the guide send the picked size's width and height, and a Frame tool drag sends the box it drew, so a hand-placed frame keeps its size and hugs neither axis. An agent's `frame add --size` still hugs its height.

- Each acts in Edit while the tab may write, on the frames selected on the canvas's page, and none acts while an element is selected, so Backspace never deletes a frame the developer sees as an element
- Delete and cut stay disabled while a selected frame is locked, and the server refuses both with `frame-locked` if sent anyway. F2 renames one selected frame in the inspector.
- The server holds the clipboard, being each copied frame's bytes and layout entry in memory, so a paste never reads the source and a restart empties it. A cut is a copy and a delete in one undo step.
- A paste lands on the page on the canvas, keeping each frame's box on another page and sitting beside its source on its own, and takes the next free name rather than writing over a frame by that name
- Paste stays disabled until a copy or cut, and again once the socket drops, since the server may have restarted

### `src/client/board/geometry/`

Owns turning pointer and keys into frame boxes, apart from the canvas's pan and zoom.

- `gestures.ts` binds `d3-drag` to the hit layer beside the viewport's `d3-zoom`, and `draw.ts` writes the overlay's DOM from the drag handler
- `snap.ts`, `arrange.ts`, `resize.ts`, and `hit.ts` are pure, and `actions.ts` registers the selection, nudge, and arrange keys
- `write.ts` holds a released box as pending until the server's next board carries it, and sends every hand move or resize through `POST /api/frames/boxes`
- A dragged or resized frame snaps to other frames' edges and centers, and holding Ctrl turns snapping off
- A box edit on a held frame stays pending until the claim drops, then goes with the first `expected` it started from, even after a newer edit replaced it

A press on the canvas while an inspector field has focus blurs the field, which applies its edit. A click that only leaves the field selects and clears nothing, and a drag from the same press still moves frames.

A move released with Alt held puts the frames back and sends one duplicate carrying the drop's offset, so the copies land there in one undo step. A locked frame neither moves nor copies.

### `src/client/board/preview/`

Owns the width a frame is previewed at, held in this tab's memory alone, so a reload drops it and nothing reaches the server, the history, or the hug step. The palette carries a preview at each preset width and End preview, with no key.

- The iframe keeps its `src` and reflows at the new width, so its animation, media queries, and element selection read the live page
- A frame hugging its height takes its content's height at the previewed width, read as the server's fit step reads it, and a page sized off the viewport keeps its stored height
- A frame the board stops showing, deleted, hidden, or moved to another page, drops its preview

A frame draws at its pending box over its stored one at the previewed width, and a press, a hover, an element pick, a note, and a right-click all hit it there. The selection chip still names the stored size, prefixed `Stored` while a chosen frame is previewed, and the label keeps the stored box's width as room above a narrower preview.

`withPending` in `geometry/write.ts` hands every gesture and action the stored and pending boxes alone, since each writes what it reads, and a box write ends the preview of each frame it names as it starts.

### `src/server/history/`

Owns the edit history undo reads. Undo and redo cover hand edits, moves, resizes, reorders, renames, adds, duplicates, and deletes, held as small before-and-after records.

- A board verb handed a `Journal` from `src/server/board/journal.ts` reports each change it made, and `History.record` keeps them as one step, at most 100 steps deep
- A change is one layout entry, page order, rename, path with its hash, or hand-edited or placed element, so an agent's write elsewhere in the file neither blocks an undo nor is reverted by it
- Every change of a step is checked under its records' locks before any is written, and an undo whose target an agent changed later is refused with `undo-overtaken`, dropped, and named in a toast
- A delete moves the path into `.run/trash/<step>/`, so its undo is a rename back, and the history and the trash both empty when the server starts and stops
- A page or project rename, its undo, and its redo each broadcast `renamed` ahead of the batch, so every tab keeps its canvas and frames live and moves its route to the new name

On `renamed` the socket moves the selection, the flipped frames, and the unseen marks ahead of the live store, since the renamed board prunes a selection it no longer holds. A frame rename sends no `renamed`, so it still drops all three.

Only the board's own writes record. The CLI verbs pass no journal, and neither do a note write or an asset drop, so an agent's change never enters the developer's history.

### `src/server/history/changes.ts`

Owns the change kinds a step holds and what each restores, which is only what the developer set, so a write by an agent or by the server around it survives.

- A hand edit's undo restores its element while the agent left it alone, found by index or else by a unique byte match, and answers the hash it left so the element can stay selected
- That element span is byte-exact only while every frame writer splices inside the target's start tag or between its tags, which `src/server/edit/property.test.ts` checks, so a new writer keeps to that
- A placed element's undo takes out the one element its bytes match, and its redo puts it back under its parent, ahead of the sibling it preceded, both found by start tag
- A deleted element is that change run backwards, its whitespace possibly landing on its other side, while a moved one holds both gaps with the bytes beside each, so its undo is byte for byte
- A layout entry's undo compares and restores the size on an axis both it and the stored entry hug as whatever is stored, since the server measured that size and the developer never set it

## Gotchas

- Hide and lock are flags in the page's layout and never write into the frame, so neither binds the agent, whose writes the claim and the file hash govern
- A hidden frame leaves the canvas and composite captures but stays in the layers panel, and a locked one still selects from there
- Elements cannot be hidden, because that would write `display` into the frame, which is layout
- A drag on a selected element or its outline carries the element, so its frame moves by the label strip or after Esc, and takes no corner resize while its handles hide
- A hand box write sends the boxes the gesture started from, and the server refuses the whole write with `stale-layout` when an agent moved a frame since, or `frame-locked` for a locked one
