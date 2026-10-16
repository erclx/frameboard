---
title: Board shell
description: Home view, panels, toolbar, canvas, notes, Edit and Play, agent change marks, find, the command palette, and claimed frames
---

# Board shell

## Overview

Owns the browser app around the frames, being the home view, the board's panels, toolbar, and canvas, notes, the command palette, and how an agent's changes and claims show. Its look, colors, and type belong to `canon/DESIGN.md`.

## Layout

- `src/client/` owns the app, with `live/` holding the socket and the store every screen reads, `home/` the home view, and `board/` the board screen and its canvas
- `src/client/public/` owns the files served at the site root, being the favicon set rendered from `icon.svg`
- `src/server/live/` owns the live updates the app listens to, being the board folder's watcher, the socket hub, and the decision to open a tab
- `src/server/routes/` owns the HTTP route modules `app.ts` mounts, one per surface, so a later surface adds a module rather than growing `app.ts`

### Home view

- Every project shows as a card with a thumbnail of its frames, its name, and when it was last edited, or as a list with name, edited, and created columns
- A new project button sits beside them
- Opening a card opens its board, and the board's home button is the one way back and between projects

### Left panel

- **Design:** the pages list and the layers tree, split by a draggable divider that is remembered
- **Pages list:** scrolls on its own, and its header carries a search that filters it in place
- **Layers tree:** its header carries a collapse-all button, and it hides and locks frames, per `canon/context/board/hand-actions.md`
- **Assets:** the project's `assets/` folder as thumbnails with type and size, taking dropped files and copying the path a frame links
- **Theme:** the project's tokens, read-only, with each light and dark value, saying where tokens go when there are none

### Toolbar and canvas

- The toolbar floats at the bottom center of the canvas with Move, Hand, Frame, Undo, Redo, Zoom to fit, the theme toggle, and the Edit and Play toggle
- The Frame tool drags out an empty frame, or adds one from a size preset, being phone at 390, tablet at 768, or desktop at 1440
- The canvas sits in the middle, pans and zooms, and shows each frame's name above it

### Inspector header and panel sizing

- The inspector header shows the zoom level and opens the zoom menu, beside an avatar with the initials of git's `user.name`, the name notes are signed with
- The avatar opens a menu of keyboard shortcuts, theme, and docs
- Both side panels resize by dragging their edge, from 200 to 400px with 240 by default, and a double-click on the edge resets it
- Panel widths are remembered
- Hide UI, through Cmd+\ or a button, hides both panels, leaving the project name and show-panels button top left, the toolbar, and the avatar and zoom level top right

### Notes and the two modes

- A Note tool pins a note on a frame or element, shown as a marker on the canvas, and a done note clears
- Send hands a note to a listening agent session, whose replies show in the note's thread, and the board shows which sessions are listening
- In Edit, clicks select, per `canon/context/board/hand-actions.md`
- In Play, a frame behaves like a page, the panels stay, nothing selects, notes and claim outlines hide, and a banner says how to get back

## Decisions

### Frames load through a route of their own

- `/frames/<project>/<page>/<file>` serves a page folder and `/frames/<project>/assets/<path>` the project's assets, so a frame's links to `styles.css` or `../assets/` resolve with no rewriting.
- The frame route answers 404 for board records, dot-named paths, and any path whose realpath leaves its project, because it reads the developer's files and should say nothing of what exists.
- Every route refuses a `Host` other than `127.0.0.1` or `localhost` on the bound port, and the socket also refuses a foreign `Origin`, so another site cannot read the board through DNS rebinding.
- Frames load same-origin and unsandboxed, since element selection and the inspector work inside a frame's DOM, and the token on the write routes keeps a frame's script from driving the board.

### The canvas keeps gestures out of React

- Pan and zoom write the layer's CSS transform from the `d3-zoom` handler, so a gesture renders nothing, and fifty live frames held a p95 frame interval near 17.6 ms on the operator's Mac.
- A plain wheel pans and a pinch, which arrives as a wheel carrying `ctrlKey`, zooms, as design tools do, rather than every wheel zooming as `d3-zoom` does by default.
- A transparent hit layer covers every frame until the Edit and Play toggle lands, so a drag or a wheel over a frame pans the canvas while its animation and video keep playing.
- Once a gesture rests for 150 ms, frames outside the viewport grown by one viewport on each side swap their iframe for a placeholder, so a large page holds only the pages near the view.
- Each page's view is kept for the session and a first visit zooms to fit, so switching pages and back returns to the same view.

### A change reloads only what it can affect

- A frame's own `.html`, or a temp file it is saved through such as `hero.html.swap`, reloads that frame, and any other page-folder file reloads the whole page, since any frame may link it.
- A file under `assets/` reloads every frame in the project, since any page may link an asset.
- `layout.json` and `notes.json` reload nothing, so a move never restarts a frame's animation or video.
- Writes gather into batches closing 50 ms after the last event or 250 ms after the first, so a burst of writes from one agent turn costs one rescan and one snapshot.

### An agent's changes stay marked until seen

- A frame an agent changed carries a purple dot on its label and layers row until the developer selects it or it sits on screen a moment, never cleared by a timer
- Page rows and the project card count the unseen frames under them
- The update toast offers Show and Next, with `]` stepping through the changes
- Follow on an agent's avatar pans to whatever it edits and stops on a click or a hand pan, and otherwise the board never moves the view on its own
- Seen state lives in the browser, never in the board folder

### A narrow screen opens with the UI hidden

- The narrow-screen layout stays deferred
- Below about 1024px the board opens as Hide UI leaves it, so the canvas still pans and zooms and nothing is blocked
- Opening one frame on a phone over the local network waits for a later release

### Find searches what the frames hold

- Cmd+F swaps the left panel for a search over frame names, element names, and the text inside frames, across the project's pages
- Results group by page and filter by frames, elements, or text, and a click selects and zooms to the hit
- Cmd+K stays the route to actions, pages, and other projects

### The command palette runs board actions, not edits

- Cmd+K jumps to any project, page, or frame, and runs new page, new frame, theme toggle, Edit and Play, zoom to fit, and zoom to selection
- Inspector edits stay in the inspector

## Gotchas

### Frames on the canvas

- A pasted frame copies its whole file and size into the target page, so no element index shifts, and a name the page already holds takes a numbered suffix
- Pan, zoom, and drag preview move a CSS transform, not app state, and write the file once on release
- Each frame is an iframe, and frames far offscreen unmount on a large board
- A frame whose file changes on disk reloads alone, keeping pan and zoom, and new frames appear without a refresh

### Watching the board folder on macOS

- `fs.watch` on macOS drops writes in its first tens of milliseconds and reports changes made just before it began, so the watch counts nothing for its first 100 ms and resolves only once warm.

### Claimed frames

- A claimed frame's label carries a tag naming the agent and its session, such as Claude · visual-style, with what it is doing and for how long
- It shows a dashed outline with a gentle pulse that respects reduced motion, and its layers row carries a purple dot
- A hand move or edit on it says who holds it and that the change waits
- When the agent writes, the elements it changed glow for a moment and a toast names the frame and the count
- Each listening agent session shows as purple initials in the inspector header, the same purple for any agent, with its initial rather than its maker's logo
