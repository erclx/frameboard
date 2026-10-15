---
title: Board shell
description: Home view, panels, toolbar, canvas, notes, Edit and Play, agent change marks, find, the command palette, and claimed frames
---

# Board shell

## Overview

Owns the browser app around the frames, being the home view of projects, the board for one project with its panels, toolbar, and canvas, notes, the command palette, and how an agent's changes and claims show. The inspector and the hand actions are its siblings in this folder. Its look, colors, and type belong to `canon/DESIGN.md`.

## Layout

- `src/client/` owns the app
- `src/server/` owns the live updates the app listens to

### Home view

- Every project as a card with a thumbnail of its frames, its name, and when it was last edited, or as a list with name, edited, and created columns
- A new project button
- Opening a card opens its board. A home button in the board returns here, and that is the one way between projects

### Left panel

The left panel holds Design, Theme, and Assets tabs. Design holds the pages list and the layers tree, split by a draggable divider that is remembered. The pages list scrolls on its own and its header carries a search that filters it in place, and the layers header carries a collapse-all button. Its layers tree also hides and locks a frame, per "Hide and lock act on frames, not elements" in `canon/context/board/hand-actions.md`.

Assets shows the project's `assets/` folder as thumbnails with type and size, takes dropped files, and copies the path a frame links. Theme shows the project's tokens, read-only, with each light and dark value, and says where tokens go when there are none.

### Toolbar and canvas

The toolbar floats at the bottom center of the canvas and holds Move, Hand, Frame, Undo, Redo, Zoom to fit, the theme toggle, and the Edit and Play toggle. The Frame tool drags out a new empty frame, or adds one from a size preset, being phone at 390, tablet at 768, or desktop at 1440. The canvas sits in the middle, with each frame's name above it, and pans and zooms.

### Inspector header and panel sizing

The inspector sits on the right. Its header shows the zoom level and opens the zoom menu, beside an avatar with the initials of git's `user.name`, the name notes are signed with. The avatar opens a menu of keyboard shortcuts, theme, and docs.

Both side panels resize by dragging their edge, from 200 to 400px with 240 by default. A double-click on the edge resets it, and the widths are remembered. Hide UI, through Cmd+\ or a button, hides both panels, leaving the project name with the show-panels button top left, the toolbar, and the avatar with the zoom level top right.

### Notes and the two modes

A Note tool pins a note on a frame or element. Notes show as markers on the canvas, and a done note clears. Send hands a note to a listening agent session, whose replies show in the note's thread, and the board shows which sessions are listening.

In Edit, clicks select, per "Selection goes into a frame on purpose" in `canon/context/board/hand-actions.md`. In Play, a frame behaves like a page, the panels stay, nothing selects, notes and claim outlines hide, and a banner says how to get back.

## Decisions

### An agent's changes stay marked until seen

A frame an agent changed carries a purple dot on its label and layers row until the developer selects it or it sits on screen a moment, never cleared by a timer. Page rows and the project card count the unseen frames under them. The update toast offers Show and Next, with `]` stepping through the changes.

Follow on an agent's avatar pans the board to whatever it edits, and stops on a click or a hand pan. The board never moves the view on its own. Seen state lives in the browser, never in the board folder.

### A narrow screen opens with the UI hidden

The narrow-screen layout stays deferred. Below about 1024px the board opens as Hide UI leaves it, so the canvas still pans and zooms and nothing is blocked. Opening one frame on a phone over the local network waits for a later release.

### Find searches what the frames hold

Cmd+F swaps the left panel for a search over frame names, element names, and the text inside frames, across the project's pages. Results group by page, filter by frames, elements, or text, and a click selects and zooms to the hit. Cmd+K stays the route to actions, pages, and other projects.

### The command palette runs board actions, not edits

Cmd+K jumps to any project, page, or frame, and runs new page, new frame, theme toggle, Edit and Play, zoom to fit, and zoom to selection. Inspector edits stay in the inspector.

## Gotchas

### Frames on the canvas

- A pasted frame copies its whole file and its size into the target page, so no element index shifts. A name the page already holds takes a numbered suffix.
- Pan, zoom, and drag preview move a CSS transform, not app state, and write the file once on release.
- Each frame is an iframe. Frames far offscreen unmount on a large board.
- A frame whose file changes on disk reloads alone, keeping pan and zoom. New frames appear without a refresh.

### Claimed frames

- A claimed frame shows a tag on its label naming the agent and its session, such as Claude · visual-style, with what it is doing and for how long, and a dashed outline with a gentle pulse that respects reduced motion
- Its layers row carries a purple dot. A hand move or edit on a claimed frame says who holds it and that the change waits. When the agent writes, the elements it changed glow for a moment and a toast names the frame and the count.
- The inspector header shows each listening agent session as purple initials beside the developer's. Any agent takes the same purple, and the badge shows its initial rather than its maker's logo.
