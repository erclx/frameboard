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

- Undo and redo cover hand edits, moves, resizes, reorders, renames, adds, duplicates, and deletes
- The server holds them as small before-and-after records
- An undo whose target an agent has since changed is refused and dropped, and the board says so

### Selection goes into a frame on purpose

- A click selects the frame, and Cmd-click or a double-click on the canvas selects the element under the cursor
- Enter selects one level down, Esc one level up, clearing the selection from a frame, and Tab and Shift+Tab step through siblings
- Selecting writes nothing, so element addresses stay put, the way Figma and Paper both work

### Hide and lock act on frames, not elements

- Cmd+Shift+H hides a selected frame and Cmd+Shift+L locks it
- A hidden frame leaves the canvas and composite captures but stays in the layers panel
- A locked frame cannot be dragged, resized, nudged, or deleted by hand until unlocked, and still selects from the layers panel
- Both are flags in the page's layout, so neither writes into the frame nor binds the agent, whose writes the claim and the file hash already govern
- Elements cannot be hidden, because that would write `display` into the frame, which is layout

### Arranging frames on the board

- Alt+A, Alt+D, Alt+W, and Alt+S align selected frames left, right, top, and bottom
- Alt+H and Alt+V center them, and Ctrl+Alt+H and Ctrl+Alt+V distribute them
- A dragged or resized frame snaps to other frames' edges and centers, and holding Ctrl while dragging turns snapping off
- Each writes the page's layout alone

### Copy a frame as an image

- Cmd+Shift+C copies a selected frame to the clipboard as a PNG in the theme on screen, rendered by the same browser `capture` uses

### Right-click opens the actions for what was clicked

- A page row, a frame on the canvas or in the layers panel, an element, the empty canvas, and a project card each open a menu titled with what was clicked
- Each menu lists only actions that already have a key or a button, shows the key, and puts Delete last
- An element's menu holds no style or layout action, since those stay with the agent

### Every hand action has a key or a drag

- **Move:** arrow keys nudge a selected frame, Shift for bigger steps, and pan the canvas when nothing is selected
- **Resize:** Cmd with an arrow resizes a selected frame, and corner handles resize by drag
- **Zoom:** Shift+1 zooms to fit and Shift+2 zooms to the selection
- **Rename and duplicate:** double-click on a label or in a panel renames, and Cmd+D duplicates
- **Clipboard:** Cmd+C, Cmd+X, and Cmd+V copy, cut, and paste selected frames into the current page of any project
- **Several frames:** Shift-click or a marquee drag selects several, and move, nudge, align, duplicate, copy, cut, hide, lock, and delete act on all of them
- **Delete:** Delete deletes, and undo restores
