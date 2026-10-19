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

Owns the board screen and its canvas, with `mode.ts` holding Edit, Play, the tool, and Hide UI, and `view.ts` the canvas view controller the zoom controls call. Selection on the canvas is described in `canon/context/board/hand-actions.md`.

- The Frame tool drags out an empty frame or adds one at a phone 390, tablet 768, or desktop 1440 preset
- A Note tool pins a note on a frame or element, Send hands it to a listening session, and replies show in the note's thread
- In Play a frame behaves like a page, nothing selects, and notes and claim outlines hide
- Frames beyond one viewport of the view swap their iframe for a placeholder once a gesture rests 150 ms

### `src/client/board/notes/`

Owns the Note tool, its markers, the composer, and the thread, which change together.

- The Note tool, key N, is enabled only while the tab may write, and its click opens the composer and goes no further, since selection and marquee gestures bind only under the Move tool
- A pick hit-tests inside the iframe, counting through `board/frame-dom.ts` past the injected elements, and sends the `modifiedAt` the iframe loaded, so a stale pick is refused
- An amber numbered marker sits on its element's top right corner, or its frame's once the element is lost, and hides in Play and once done
- The composer saves or sends, the thread replies, hands the thread on, or closes it, both reading the notes and listeners the live store holds, which a dropped socket clears until the next hello

### `src/client/board/left-panel/`

Owns the left panel, being its header with the way home and Hide UI, then the Design, Theme, and Assets tabs.

- Design holds a pages list with a search and a layers tree that hides and locks frames, split by a divider that remembers its height, and Theme holds the project's tokens read-only
- A page is added after the current one, renamed on a double-click or F2 through `src/client/components/rename-field.tsx`, deleted with Delete, and dragged to a new place through `reorder.ts`, and `page-actions.ts` registers the `page.*` actions
- Assets, in `src/client/board/assets/`, lists the project's `assets/` files as tiles with a thumbnail, the name, and a `<type> · <size>` line, and a tile click copies `../assets/<name>` with each segment encoded
- A drop on the tab, or the header's `+` picker, posts the files through `writeBoard`, and a tab with no write access shows why and adds nothing while a tile still copies
- Refusals show as an inline line under the drop hint rather than a toast, and a drop reloads every frame through the existing `assets/` watch

### `src/client/board/chrome/`

Owns what floats over the canvas, being the toolbar, the Play banner, the Hide UI pills, the zoom control, and the avatar menu.

- The toolbar floats bottom center on the canvas column with Move, Hand, Frame, Note, Undo, Redo, Zoom to fit, the theme toggle, and the Edit and Play toggle

### `src/client/board/inspector/`

Owns the right panel, under a header of the avatar and the zoom level.

### `src/client/history/`

Owns `edit.undo` on Cmd+Z and `edit.redo` on Cmd+Shift+Z, registered for the whole app since the home view undoes too, lit from the server's `history` counts and following the page an undo brings back.

### `src/client/live/`

Owns the socket and the store every screen reads, and how an agent's changes show.

- `structure.ts` holds the typed calls to the structure and history routes over `writeBoard`

- A frame an agent changed carries a purple dot on its label and layers row until selected or on screen a moment, never cleared by a timer
- Page rows and the project card count the unseen frames, the update toast offers Show and Next, and `]` steps through the changes
- Follow on an agent's avatar pans to what it edits and stops on a click or hand pan, and the board never moves the view otherwise
- A frame breaking a content rule carries a warning triangle in `--note` and its count in the text color, since the amber is too light for 11px text, cleared on the batch that fixes the file
- Seen state lives in the browser, never in the board folder
- `canWrite` is false until the server's `access` message and whenever the socket drops, and `writeBoard` sends the cookie and marks the tab read-only on a 401

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
- `fs.watch` on macOS drops writes in its first tens of milliseconds, so the watch counts nothing for its first 100 ms and resolves only once warm

### `src/server/access/`

Owns who may write, apart from the route modules.

- `key.ts` loads the board key from `.run/board-key.json`, `tickets.ts` mints single-use tickets valid for two minutes, and `guard.ts` holds `isWriter` and `requireWriter`
- A writer is the address file's token as a bearer, or the board's cookie carrying the key sent with the board's own `Origin`, and the live socket's upgrade asks the same rule
- A route that changes the board folder or drives an agent mounts `requireWriter`, and a GET that only reads takes no guard

### `src/server/routes/`

Owns the HTTP route modules `app.ts` mounts, one per surface.

- `/frames/<project>/<page>/<file>` serves a page folder and `/frames/<project>/assets/<path>` the assets, so a frame's relative links resolve with no rewriting
- Frames load same-origin and unsandboxed, since element selection and the inspector work inside a frame's DOM, and the board key keeps other pages from writing
- `assets.ts` answers `GET /api/projects/:project/assets` with the listing and `POST` with a `multipart/form-data` drop in the field `files`, behind `requireWriter` and a 64 MiB body limit that answers 413
- `access.ts` redeems a ticket for the cookie and mints a ticket for a bearer, and `api.ts` mounts every write route behind `requireWriter`
- `structure.ts` answers `POST /api/<noun>/<verb>`, each body mirroring the CLI verb's flags and recording one step, and `history.ts` answers `POST /api/undo` and `/api/redo`, both sharing `envelope.ts` for their refusals

### Other folders

The favicon files sit beside the app.

- `src/client/public/` owns the files served at the site root, being the favicon set rendered from `icon.svg`

## Gotchas

- A frame's script keeps its reach through `parent.document` and same-origin `fetch`, which the board accepts as the developer's own agents' work
- A cookie write needs the board's own `Origin`, since cookies and SameSite ignore the port and another `127.0.0.1` port would otherwise write
- The frame route answers 404 for board records, dot-named paths, and paths leaving the project by realpath, and routes refuse a foreign `Host` and the socket a foreign `Origin`, against DNS rebinding
- Pan and zoom write the layer's CSS transform from the `d3-zoom` handler, so a gesture renders nothing, and a plain wheel pans while a pinch, a wheel carrying `ctrlKey`, zooms
- Edit covers the frames with a hit layer so a press reaches the selection gestures rather than a frame's page, and a primary drag pans only under the Hand tool. Play lifts the layer, so a click moves focus into a frame's window, where the board binds Esc since its own keys never arrive
- A key shared by several actions runs the first registered whose `enabled` is true, so each row's `enabled` has to be honest about its mode for Esc to mean one thing at a time
- `cn` reads the custom `text-body` step as a color and keeps a kit part's `text-sm` beside it, so a kit part takes Tailwind's `text-xs` for the chrome's 12px
