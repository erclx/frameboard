---
title: Hand actions
description: Selection, undo and redo, hide and lock, arranging and snapping, copying a frame as an image, right-click menus, and the keys behind each
---

# Hand actions

## Overview

Owns what the developer does to frames by hand outside the inspector, being selection, undo and redo, hide and lock, arranging, copying, the right-click menus, and the key or drag behind each.

## Layout

- `src/client/` owns selection, the keys, and the menus
- `src/server/` owns the edit history undo reads

## Decisions

### Undo covers the developer's own changes

Undo and redo cover hand edits, moves, resizes, reorders, renames, adds, duplicates, and deletes, held by the server as small before-and-after records. An undo whose target an agent has since changed is refused and dropped, and the board says so.

### Selection goes into a frame on purpose

A click selects the frame. Cmd-click or a double-click on the canvas selects the element under the cursor. Enter selects one level down, Esc one level up and clears the selection from a frame, and Tab and Shift+Tab step through siblings. Figma and Paper both work this way, and selecting writes nothing, so element addresses stay put.

### Hide and lock act on frames, not elements

Cmd+Shift+H hides a selected frame on the board and Cmd+Shift+L locks it. A hidden frame stays in the layers panel and leaves the canvas and a composite capture. A locked frame cannot be dragged, resized, nudged, or deleted by hand until it is unlocked, and still selects from the layers panel.

Both are flags in the page's layout, so neither writes into a frame. Hiding an element would write `display` into the frame, which is layout. Neither binds the agent, whose writes the claim and the file hash already govern.

### Arranging frames on the board

Alt+A, Alt+D, Alt+W, and Alt+S align selected frames left, right, top, and bottom, Alt+H and Alt+V center them, and Ctrl+Alt+H and Ctrl+Alt+V distribute them. A dragged or resized frame snaps to other frames' edges and centers, and holding Ctrl while dragging turns snapping off. Each writes the page's layout alone.

### Copy a frame as an image

Cmd+Shift+C copies a selected frame to the clipboard as a PNG in the theme on screen, rendered by the same browser `capture` uses.

### Right-click opens the actions for what was clicked

A page row, a frame on the canvas or in the layers panel, an element, the empty canvas, and a project card each open a menu titled with what was clicked. Each lists only actions that already have a key or a button, shows the key, and puts Delete last. An element's menu holds no style or layout action, since those stay with the agent.

### Every hand action has a key or a drag

Arrow keys nudge a selected frame, Shift for bigger steps, and pan the canvas when nothing is selected. Cmd with an arrow resizes a selected frame, and corner handles resize by drag. Shift+1 zooms to fit and Shift+2 zooms to the selection. Double-click on a label or in a panel renames.

Cmd+D duplicates. Cmd+C, Cmd+X, and Cmd+V copy, cut, and paste selected frames into the current page of any project. Shift-click or a marquee drag selects several frames, and move, nudge, align, duplicate, copy, cut, hide, lock, and delete act on all of them. Delete deletes, and undo restores.
