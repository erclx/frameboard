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
- Shift-click or a marquee drag selects several frames, and move, nudge, align, duplicate, copy, cut, hide, lock, and delete act on all of them
- Arrow keys nudge a frame, Cmd with an arrow resizes it, and Cmd+C, Cmd+X, and Cmd+V copy, cut, and paste frames into any project's current page
- Alt+A, D, W, S align, Alt+H and Alt+V center, and Ctrl+Alt+H and Ctrl+Alt+V distribute, each writing the page's layout alone
- Cmd+Shift+H hides, Cmd+Shift+L locks, and Cmd+Shift+C copies a frame as a PNG in the theme on screen, rendered by the browser `capture` uses

### `src/server/`

Owns the edit history undo reads.

- Undo and redo cover hand edits, moves, resizes, reorders, renames, adds, duplicates, and deletes, held as small before-and-after records
- An undo whose target an agent has since changed is refused and dropped, and the board says so

## Gotchas

- Selecting writes nothing, so element addresses stay put, the way Figma and Paper both work
- Hide and lock are flags in the page's layout and never write into the frame, so neither binds the agent, whose writes the claim and the file hash govern
- A hidden frame leaves the canvas and composite captures but stays in the layers panel, and a locked one still selects from there
- Elements cannot be hidden, because that would write `display` into the frame, which is layout
- A dragged or resized frame snaps to other frames' edges and centers, and holding Ctrl turns snapping off
