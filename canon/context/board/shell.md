---
title: Board shell
description: Home view, panels, toolbar, canvas, notes, Edit and Play, agent change marks, find, the command palette, and claimed frames
---

# Board shell

## Overview

Owns the browser app around the frames, being the home view, the board's panels, toolbar, and canvas, notes, the command palette, and how an agent's changes and claims show. Its look, colors, and type belong to `canon/DESIGN.md`.

## Layout

### `src/client/home/`

Owns the home view, where every project shows as a card with a thumbnail of its frames or as a list row.

- A card shows the project's name and when it was last edited, and a list row adds the day `project.json` says it was made, empty for an older project
- The header carries the grid and list switch, New project, and the theme toggle, and an empty board shows the terminal command beside New project
- Opening a card opens its board, and the board's home button is the one way back and between projects

### `src/client/actions/`

Owns the action registry every toolbar button, menu item, and key runs through, and the palette and shortcuts sheet read.

- An action is `{ id, label, group, keys?, run, enabled?, checked? }`, a row registers its own and removes them on unmount, and a row needing a field adds it as optional
- A control whose action no row has registered yet renders disabled with its name and key, so it lights once that row registers
- `bindKeys` binds the registry into the board window at start and into a frame's window in Play, Esc alone there

### `src/client/board/`

Owns the board screen. `mode.ts` holds Edit, Play, the tool, and Hide UI, and `view.ts` the canvas view controller the zoom controls call. Selection on the canvas is described in `canon/context/board/hand-actions.md`.

| Folder        | Holds                                                                                  |
| ------------- | -------------------------------------------------------------------------------------- |
| `left-panel/` | The header and the Design and Theme tabs                                               |
| `chrome/`     | The toolbar, the Play banner, the Hide UI pills, the zoom control, and the avatar menu |
| `inspector/`  | The right panel, under a header of the avatar and the zoom level                       |

- Design holds a pages list with a search and a layers tree that hides and locks frames, then Assets with dropped files, and Theme holds the project's tokens read-only
- The toolbar floats bottom center on the canvas column with Move, Hand, Frame, Note, Undo, Redo, Zoom to fit, the theme toggle, and the Edit and Play toggle
- The Frame tool drags out an empty frame or adds one at a phone 390, tablet 768, or desktop 1440 preset
- A Note tool pins a note on a frame or element, Send hands it to a listening session, and replies show in the note's thread
- In Play a frame behaves like a page, nothing selects, and notes and claim outlines hide

### `src/client/live/`

Owns the socket and the store every screen reads, and how an agent's changes show.

- A frame an agent changed carries a purple dot on its label and layers row until selected or on screen a moment, never cleared by a timer
- Page rows and the project card count the unseen frames, the update toast offers Show and Next, and `]` steps through the changes
- Follow on an agent's avatar pans to what it edits and stops on a click or hand pan, and the board never moves the view otherwise
- A frame breaking a content rule carries a warning triangle and its count beside its name, and the mark clears on the batch that fixes the file
- Seen state lives in the browser, never in the board folder

### `src/client/`

Owns the app shell and the controls around the canvas.

- The inspector header shows the zoom level and zoom menu, beside an avatar with the initials of git's `user.name`, which signs notes
- Both side panels resize by dragging from 200 to 400px, default 240, remember their width, and reset on a double-click
- Hide UI, through Cmd+\ or a button, hides both panels and keeps the project name, toolbar, avatar, and zoom level
- Cmd+F swaps the left panel for a search over frame names, element names, and frame text, grouped by page
- Cmd+K jumps to any project, page, or frame and runs board actions such as new page, theme toggle, and zoom, while inspector edits stay in the inspector

### `src/server/live/`

Owns the board folder's watcher, the socket hub, and the decision to open a tab.

- A frame's own `.html`, or a temp file it is saved through such as `hero.html.swap`, reloads that frame, and any other page-folder file reloads the page
- A file under `assets/` reloads every frame in the project, and `layout.json` and `notes.json` reload nothing
- Writes gather into batches closing 50 ms after the last event or 250 ms after the first, so one agent turn costs one rescan
- The server checks every frame at start and rechecks each batch's frames

### `src/server/routes/`

Owns the HTTP route modules `app.ts` mounts, one per surface.

- `/frames/<project>/<page>/<file>` serves a page folder and `/frames/<project>/assets/<path>` the assets, so a frame's relative links resolve with no rewriting
- Frames load same-origin and unsandboxed, since element selection and the inspector work inside a frame's DOM, and the token on the write routes keeps a frame's script from driving the board

### Other folders

The favicon files sit beside the app.

- `src/client/public/` owns the files served at the site root, being the favicon set rendered from `icon.svg`

## Gotchas

### Server and watch

The routes and the watcher each guard against a platform's behavior.

- The frame route answers 404 for board records, dot-named paths, and paths leaving the project by realpath, and routes refuse a foreign `Host` and the socket a foreign `Origin`, against DNS rebinding
- `fs.watch` on macOS drops writes in its first tens of milliseconds, so the watch counts nothing for its first 100 ms and resolves only once warm

### Canvas

The canvas keeps gestures out of React and out of the frames.

- Pan and zoom write the layer's CSS transform from the `d3-zoom` handler, so a gesture renders nothing, and a plain wheel pans while a pinch, a wheel carrying `ctrlKey`, zooms
- In Edit a transparent hit layer covers every frame so a drag pans while animation plays, and Play lifts it so a click reaches the frame
- A click in Play moves focus into the frame's window, where the board's keys never arrive, so Esc is bound into that window too
- Frames beyond one viewport of the view swap their iframe for a placeholder once a gesture rests 150 ms

### Chrome

The chrome's keys and colors each carry one rule a later row has to keep.

- A key shared by several actions runs the first registered whose `enabled` is true, so each row's `enabled` has to be honest about its mode for Esc to mean one thing at a time
- `cn` reads the custom `text-body` step as a color and keeps a kit part's `text-sm` beside it, so a kit part takes Tailwind's `text-xs` for the chrome's 12px
- The finding triangle takes `--note` and the count the text color, because `--destructive` means Delete alone and the note amber is too light for 11px text on the light canvas
