---
title: On the board
description: Selecting, notes, and every hand edit, including undo
---

# On the board

What you can do by hand on the board, from picking an element to undoing an edit.

## Selecting

On the board, Cmd-click or double-click selects an element inside a frame.

- Enter, Esc, and Tab walk the tree, and the layers panel lists each frame's elements
- `selection` prints what you picked, with the element's index and hash ready for `edit`

## Notes

Pin a note on a frame or one element with the Note tool, and Send hands it to a Claude Code session listening on the board.

- The agent answers in the note's thread through `notes reply` and closes it with `notes done`
- Paste or drop a PNG, JPEG, GIF, or WebP image into a note or a reply, and the agent gets its path to open
- The notes stay in each page's `notes.json`, and their images in its `.notes/` folder
- With nobody listening, Send can start a session through a command you export before `serve`, such as `FRAMEBOARD_DISPATCH='claude --bg "$FRAMEBOARD_NOTE"'`, which gets the note in its environment
- The command runs in the folder `serve` started in, and `claude --bg` starts only once Claude Code trusts that folder

## Hand edits

In the board you move and resize frames, Alt-drag one to drop a copy, and hold Space to pan with any tool. You add, rename, reorder, delete, and search pages. Sections group the frames sitting in them. Shift+S draws one, Cmd+Alt+G wraps the selection in one, and dragging a section's name moves it with its frames.

The Frame tool places a phone, tablet, desktop, or slide size picked from its list with a click, or draws a frame at any size with a drag. A selected frame's `Frame` heading opens the same list to resize it. The inspector's Preview row redraws a frame at another width to watch it reflow, and writes nothing.

- On the home view, New project adds a project, a card's right-click menu opens, renames, duplicates, pins, or deletes one, and Sort orders them by last edited, created, or name, in either direction
- The inspector edits a frame's fill and an element's opacity, radius, rotation, flip, type, case, truncation, line height, letter spacing, fill, stroke, shadow, and text
- Every inspector number steps on arrows and scrubs from its label
- The layers panel selects, renames, restacks, hides, and locks frames, renames and reorders elements, and Cmd+D, Cmd+C, Cmd+X, and Cmd+V duplicate, copy, cut, and paste them across pages and projects
- Cmd+F finds a frame, an element, or a line of copy on any page of the project and jumps to it
- Right-click a frame, element, empty canvas, page, or layers row for its actions, such as Copy as PNG, Fit height, or Flip to light, which shows that frame alone in the other theme until reload
- The inspector's Export section saves one selected frame as a PNG at 1x, 2x, or 3x, in light, dark, or both, named like `hero.light@2x.png`, where Copy as PNG puts it on the clipboard at 2x in the theme on screen

The Text and Shape tools drop a paragraph, rectangle, ellipse, or divider into a frame's layout where you click, sizing a rectangle or ellipse to a drag. Drag a selected upright shape's corner to resize it or any element to move it, Delete to take it out, or double-click text to retype it. Alt+Shift+ArrowUp and ArrowDown step it among its siblings. The color picker holds a hex field, opacity, and token swatches, and flags a color no token names.

Images and videos come from the project's `assets/` folder and land in the layout the same way.

- Image or video in the Shape menu, or Cmd+Shift+K, picks a file and places it where you click, at its own size capped at the column's width
- Dragging an image or video tile from the Assets tab onto a frame places it where you let go

Undo any of it with Cmd+Z. An undo of something an agent has changed since is refused and named on the board, so it never reverts the agent's work. Releases before 1.0 ship the board in stages, and the rest of editing by hand arrives in later 0.x releases.
