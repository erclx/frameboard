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

- A click selects the frame, and Cmd-click or a double-click the element under the cursor. Enter, Esc, and Tab walk down, up, and across.
  - One double-click on a text element also opens it for typing in place, and a Cmd-click only selects it
- Shift-click or a marquee drag selects several frames, and move, nudge, align, duplicate, copy, cut, hide, lock, and delete act on all of them
- Arrow keys nudge a frame, Cmd with an arrow resizes it, and Cmd+C, Cmd+X, and Cmd+V copy, cut, and paste frames into any project's current page
- Alt+A, D, W, S align, Alt+H and Alt+V center, and Ctrl+Alt+H and Ctrl+Alt+V distribute, each writing the page's layout alone
- Cmd+Shift+H hides, Cmd+Shift+L locks, and Cmd+Shift+C copies a frame as a PNG in the theme on screen, rendered by the browser `capture` uses

Several elements in one frame select together, all at one hash, with `element` holding the last picked.

- With an element selected, Shift-click on the canvas or in Layers adds an element or takes it out, and Cmd+A selects its siblings. An element in another frame starts over there.
- A drag from a selected frame's bare `body` marquees the elements it touches, outermost first, and a drag from an element it holds still moves the frame
- Several draw one box with corner handles and a size chip through `group.ts`, each member outlined thin. Delete takes all as one step, and restack and the menu's other items act on the last picked.
- A drag, an arrow key, the align keys, and a corner drag act on every Free member as one write, and Shift+A wraps siblings in one flow `div` through `POST /api/frames/wrap`
- One selected `<video>` or `<audio>` in Edit draws `media-bar.tsx` in the notes layer, above the hit layer. `media.ts` drives the live node, so a listen writes nothing.
  - A video's bar sits inside its bottom edge, 4 screen pixels in on three sides, and an audio's sits under it at its width
  - While a video's bar is up, one injected style hides the strip the browser draws for `controls` on every video in that page, since the strip grows with zoom
  - As the bar narrows the time goes first, then the track, then the speaker, and the scrub track's focus ring draws on its thumb alone through `seek-track` in `styles.css`

Enter at a frame selects the first child of its `body`, and Esc at a child of `body` selects the frame, so the next Esc clears the selection. Tab wraps within the parent, and Enter and Tab walk only while focus sits on the canvas. Esc closes an open note card before it moves the selection, and returns an armed tool to Move first.

- With one frame and no element selected, Tab and Shift+Tab step to the next and previous frame in Layers order, through `board-actions.ts`
- `focusOnBoard()` in `element/actions.ts` gates both walks and exempts a note pin, a note card, a media bar, and any `data-label-control`, so Tab on a label or chip button moves focus natively
- A step wraps at both ends, skips hidden frames, and centers the frame it lands on at the current zoom

An element selection holds the hash the frame rendered, and a reload showing other bytes drops it to the frame, since an agent's write may have shifted every index. Bytes the board's own hand edit or undo left the frame at keep it, as does a reload landing while that write is in flight, since the reload of the bytes it answered is still to come.

- An undo or redo keeps the element only while the tree at the answered hash matches the picked tree in each index, parent, and tag, and in every name but the element's own
- A placement, a delete, or a move shifts indices, so a kept index would name another element or none, which the styles read refuses
- Alt+Shift+ArrowUp and ArrowDown move the selected element among its siblings, because Alt+ArrowUp alone is `nav.home` and the registry gives a shared key to whichever action registered first
- A move key reads the tree inside the frame's turn rather than at the press, so a press queued behind a move in flight goes from the index and hash that move answered
- An element edit holds the frame's turn until the Layers tree reads the bytes it answered, so a row dragged from the older tree queues behind the edit

A drag on a Free element previews `left` and `top`, carries its pins, and writes both once on release, through `resize.ts` beside an element's corner drag. Esc writes nothing.

- The released outline stays at the drop through `held.ts` until the reloaded frame measures the element, since `ResizeObserver` never fires on a move, and a refused write lets it go
- An element past its frame's edge draws a dashed ghost there while its frame is selected, read by `overflow.ts`, and a press on the ghost selects and drags it
- A scroll frame draws no ghost, since its rail already shows there is more

### `src/client/board/menus/`

Owns the right-click menus on a frame, the selected element, empty canvas, a page row, and a layers frame or element row, which change together. Each item runs a registered action, greys while it is disabled, and shows that action's key, or the key of the one it stands in for.

The Element menu ends with Delete, which posts to `POST /api/frames/remove` and waits under the claim card on a held frame. Above it, Bring to front, Bring forward, Send backward, and Send to back restack the element in document order, never writing `z-index`.

- A right-click on a frame not yet selected selects it alone first, and one on the frame around the selected element selects the frame, so an item acts on the selection the way its key does
- Paste here shows Paste's key, sends the right-clicked point with the paste to place the group's top left there, and New frame here and both Add a note rows act at that point too
- A page row's menu moves the canvas to that page first, since the `page.*` actions act on the page shown, New page below runs `page.new`, and Move up and Move down grey at the ends
- Flip to light or Flip to dark ends every selected frame in the theme opposite the right-clicked one, lasting until reload and writing nothing
- The menu key and Shift+F10 open a row's menu with focus inside, and a Ctrl-press the gestures keep for snapping opens none

### `src/client/board/structure/`

Owns the frame structure actions, being rename, duplicate, delete, hide, lock, copy, cut, and paste, and the Frame tool, which change together. Copy, cut, and Copy as PNG toast once they land, since nothing on the canvas shows them, and a refused write raises one error toast from its caller. Copy as PNG keeps each frame in its own theme.

The Frame tool, New frame here, and the guide send the picked size's width and height, and a Frame tool drag sends the box it drew, so a hand-placed frame keeps its size and hugs neither axis. An agent's `frame add --size` still hugs its height.

- Each acts in Edit while the tab may write, on the frames selected on the canvas's page, and none acts while an element is selected, so Backspace never deletes a frame the developer sees as an element
- Delete and cut stay disabled while a selected frame is locked, and the server refuses both with `frame-locked` if sent anyway. F2 renames one selected frame in the inspector.
- The server holds the clipboard, being each copied frame's bytes and layout entry in memory, so a paste never reads the source and a restart empties it. A cut is a copy and a delete in one undo step.
- A paste lands on the page on the canvas, keeping each frame's box on another page and sitting beside its source on its own, and takes the next free name rather than writing over a frame by that name
- Paste stays disabled until a copy or cut, and again once the socket drops, since the server may have restarted

### `src/client/board/geometry/`

Owns turning pointer and keys into frame boxes, apart from the canvas's pan and zoom. The corner marks take no pointer, so `gestures.ts` reads their resize cursor off the pointer's position through the read a press takes, and a mark the press would not resize shows none.

- `gestures.ts` binds `d3-drag` to the hit layer beside the viewport's `d3-zoom`, and `draw.ts` writes the overlay's DOM from the drag handler
- `snap.ts`, `resize.ts`, and `hit.ts` are pure, as is `src/shared/arrange.ts`, which frames and elements both align through, and `actions.ts` registers the selection, nudge, and arrange keys
- `write.ts` holds a released box as pending until the server's next board carries it, and sends every hand move or resize through `POST /api/frames/boxes`
- A dragged or resized frame snaps to other frames' edges and centers unless Ctrl is held, and its note pins follow the snapped box, a resize placing each by `board/pin-corner.ts`
- A box edit on a held frame stays pending until the claim drops, then goes with the first `expected` it started from, even after a newer edit replaced it

One selected frame's chip in `overlay.tsx` names the frame and its place in Layers order, read through `board/frame-order.ts`, beside previous, next, and Zoom to selection controls. Several frames read `N frames`.

- The chip takes no pointer, so its controls carry `data-label-control` and the gestures click them on release
- A move or a resize writes its live readout into `[data-move-chip]`, since rewriting the resting chip would drop its controls

A press on the canvas while an inspector field has focus blurs the field, which applies its edit. A click that only leaves the field selects and clears nothing, and a drag from the same press still moves frames.

A move released with Alt held puts the frames back and sends one duplicate carrying the drop's offset, so the copies land there in one undo step. A locked frame neither moves nor copies.

- A section's name is its handle, taking a press over a frame's label strip but never over a frame's body
- Dragging the name moves the box, its frames, and their pins in one write, and a section holding a locked frame does not move
- A corner drag on a selected section resizes the box alone, and a frame its new edge crosses joins or leaves it by its center
- A refused section write puts the box back where the board holds it, since no newer board redraws it

Esc during a frame move or resize, a section move or corner resize, an element carry, or a marquee puts everything back at the press and writes nothing, an Alt copy included, and the next Esc reaches the registry.

A section move restores boxes and not a frame's width preview, since the drag start already ended it. Esc during a drag on several selected elements puts every member back at its press. A cancelled resize redraws the overlay from its start boxes, since `drawRest` clears only a move's transform and no write lands for React to redraw from.

### `src/client/board/preview/`

Owns the width a frame is previewed at, held in this tab's memory alone, so a reload drops it and nothing reaches the server, the history, or the hug step. The palette carries a preview at each preset and End preview, with no key, keeping a width already in the preset's range and taking its default otherwise.

- The iframe keeps its `src` and reflows at the new width, so its animation, media queries, and element selection read the live page
- A frame hugging its height takes its content's height at the previewed width, read at that width's preset height as server fit reads it, and a page sized off the viewport keeps its stored height
- A frame the board stops showing, deleted, hidden, or moved to another page, drops its preview

A frame draws at its pending box over its stored one at the previewed width, and a press, a hover, an element pick, a note, and a right-click all hit it there. The label keeps the stored box's width as room above a narrower preview.

`withPending` in `geometry/write.ts` hands every gesture and action the stored and pending boxes alone, since each writes what it reads, and a box write ends the preview of each frame it names as it starts.

### `src/server/history/`

Owns the edit history undo reads. Undo and redo cover hand edits, moves, resizes, reorders, renames, adds, duplicates, and deletes, held as small before-and-after records.

- A board verb handed a `Journal` from `src/server/board/journal.ts` reports each change it made, and `History.record` keeps them as one step, at most 100 steps deep
- A change is one layout or section entry, page order, rename, hashed path, hand-edited or placed element, or token, so an agent's write elsewhere in the file neither blocks nor is reverted by an undo
- Every change of a step is checked under its records' locks before any is written, and an undo whose target an agent changed later is refused with `undo-overtaken`, dropped, and named in a toast
- A delete moves the path into `.run/trash/<step>/`, so its undo is a rename back, and the history and the trash both empty when the server starts and stops
- A page or project rename, its undo, and its redo each broadcast `renamed` ahead of the batch, so every tab keeps its canvas and frames live and moves its route to the new name

On `renamed` the socket moves the selection, the flipped frames, and the unseen marks ahead of the live store, since the renamed board prunes a selection it no longer holds. A frame rename broadcasts it too, and its frame takes all three along but no alias, so it remounts from its new file.

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
- Elements cannot be hidden, since it would write `display` into the frame, which no hand edit writes yet
- A drag on a selected element or its outline carries it, and one on a corner mark resizes it. Its frame moves from the label strip or an element it holds, since its bare `body` marquees.
- A hand box write sends the boxes the gesture started from, and the server refuses the whole write with `stale-layout` when an agent moved a frame since, or `frame-locked` for a locked one
