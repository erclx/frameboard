---
title: Board shell
description: The board screen and canvas, Edit and Play, the panels, find, and the toolbar
---

# Board shell

## Overview

Owns the browser app around the frames, being the board screen and canvas, its panels, find, and the toolbar. Its look belongs to `canon/DESIGN.md`. The home view is in `canon/context/board/home.md`, commands in `canon/context/board/commands.md`, agent work in `canon/context/board/agent-work.md`, and the server in `canon/context/board/server.md`.

## Layout

### `src/client/board/`

Owns the board screen and its canvas, with `mode.ts` holding Edit, Play, the tool, and Hide UI, and `view.ts` the canvas view controller the zoom controls call. Selection on the canvas is described in `canon/context/board/hand-actions.md`.

- The Frame tool, key F, places the size picked from its list at the click, named for it, or draws a frame named `frame` at a dragged box, then selects it and returns to Move, opening no name field
- A frame placed partly out of view moves the view to center it at the current zoom
- An empty page nobody has panned or zoomed fits its first frames when they arrive partly out of view, on a return as well, and a press on the guide card counts as no move
- In Play a frame behaves like a page, nothing selects, and notes and claim outlines hide
- Frames beyond one viewport of the view swap their iframe for a placeholder once a gesture rests 150 ms

A frame's label carries a sun on hover while the frame follows the board's theme, and a Dark or Light chip while it is flipped alone. A click on either flips it. Under a width preview the label adds a plain chip naming that width.

- A double-click in the label strip opens a rename field over the label through F2's gates, so a read-only tab opens nothing, while F2 itself still opens the inspector's name
- `LabelRename` draws that field in the notes layer, since the hit layer covers the frames' layer and would take a click meant to place the caret
- It skips a point over a `[data-label-control]`, which clicks on release, and anywhere else a double-click picks inside the frame

`label-room.ts` measures the board gap above each frame, and the zoom handler marks the frame crowded when that gap is shorter than its label. A crowded label hides until hover, selection, or open findings, and a findings dot stays on its top left.

### `src/client/board/sections/`

Owns a page's sections on the canvas, apart from `left-panel/section.tsx`, which is the panel's section heading and shares only the word.

- `box.tsx` draws each section under every frame, a faint plate with its name inside the top left at the labels' constant screen size
- The name is the box's one handle, and the rest of the plate is bare canvas to a press, so a marquee across a section stays free
- `actions.ts` registers Wrap in section on `$mod+Alt+KeyG`, rename on F2, delete on Delete, the arrow nudges, and the Section tool
- A wrap pads the selected frames' bounds by 40, with 200 on top so the name clears the frames' labels down to about 25% zoom. Delete keeps every frame.
- The Section tool, Shift+S, draws a section at a dragged box or at 800 by 600 on a click, then selects it and returns to Move

### `src/client/board/place/`

Owns the Text, Shape, and Image tools, keys T, R, O, L, and Cmd+Shift+K, which drop one new element into a frame's layout at the click and move nothing else, and the drop of a selected element a Move drag carries or an Assets tile.

- `gap.ts` reads the container and the sibling gap under the pointer from the live DOM, along x in a flex row or a grid and along y otherwise, as the insert route's file indices
- A point over a leaf, an inline element, an element holding text, an empty box, or anything in an SVG takes its parent and the gap beside it, so a click on a placed shape lands beside it
- `drop-line.tsx` draws a 2px selection-blue line at that gap while a tool is on, an element is carried, or a tile is dragged, never over bare canvas, a loading frame, or a carried element's own spot
- `write.ts` posts the kind, never markup, behind any element edit queued on the frame, then selects the new element and returns to Move, and sends nothing to a frame another session holds
- A placed Text opens in place with its word selected, so typing replaces it, through `src/client/board/element/text-in-place.ts`

The Image tool and a tile drag place a file from the project's `assets/`.

- `asset-picker.tsx`, opened from the Shape menu's Image or video row, lists the project's images, GIFs, SVGs, and videos and arms the Image tool with the one chosen
- An asset posts its path under `assets/` and a size from `asset-size.ts`, the file's own capped at the container's width, else 240 by 135, and the server picks `<img>` or `<video>`
- An image, GIF, SVG, or video tile in the Assets tab drags while the tab may write, carrying the data `src/client/board/assets/drag.ts` shapes
- `asset-drop.ts` makes the hit layer a drop target for a tile and swallows a system file dropped there, so it never opens in place of the board

A Rectangle, Ellipse, Image, or Frame drag past 3 screen pixels draws a box through `shape-draft.tsx`. Shapes and files land at the gap the drag started in, and a frame on a box of at least 40 by 40 screen pixels. Shorter drags, Dividers, and Text stay clicks.

`moveElement` in `write.ts` sends a carried element to the gap under the release, within its own frame.

### `src/client/board/left-panel/`

Owns the left panel, being `project-header.tsx` with the way home, the project name, and Hide UI, then the Design, Theme, and Assets tabs, with `page-actions.ts` registering the `page.*` actions. A click on the project name renames it, and its chevron opens Rename, Duplicate, Switch project, and All projects.

- Design holds a searchable pages list and a layers tree under a per-project divider fit to 4 to 8 rows, grown on a page add, and reset on a double-click. Theme holds the project's tokens read-only.
- A page is added after the current one, renamed on a double-click or F2 through `src/client/components/rename-field.tsx`, deleted with Delete, and dragged into place through `reorder.ts`
- Assets, in `src/client/board/assets/`, lists the project's `assets/` files as tiles with a thumbnail, name, and `<type> · <size>` line, and a tile click copies `../assets/<name>`, each segment encoded
- A drop on the tab, or the header's `+` picker, posts the files through `writeBoard`, and a tab with no write access shows why and adds nothing while a tile still copies
- Refusals show as an inline line under the drop hint rather than a toast, and a drop reloads every frame through the existing `assets/` watch

The layers tree lists the top of the stack first. A row click selects its frame and Shift-click adds it, a double-click or F2 renames it, a drag restacks it, and its eye and lock show on hover and stay while on. A hidden frame's row dims and does not select.

Each section's row in `section-rows.tsx` holds its frames' rows indented under it, and the frames in no section follow. A row restacks within its own group and never into or out of a section, landing at the page-wide index beside the frame it drops by, so the canvas draws it over or under that frame.

- Choosing a frame not wholly in view centers its drawn box at the current zoom through `canvasView.reveal`, fitting one larger than the view
- The reveal reports as a hand move, so it stops Follow, and only a frame lying wholly in view leaves the view

An element row draws `T` for text, an image glyph for media, a corner bracket over a box for a placed element, a dash for an `hr`, a circle for an empty box rounded by half, and otherwise its layout. `GET /api/frames/elements` reads the layout, the rounding, and `position` from the static cascade, so a culled frame keeps its glyphs.

An element row renames on a double-click or F2 too, writing `data-name`, which is the only place an element is renamed. Its F2 stops at the row, so the board's own F2 opens no second field.

- An element row drags to another place among its siblings and never into another parent, which stays a canvas drag
- Each parent's rows share one `reorder.ts` list keyed by frame and parent, and the drop sends `moveElementTo`'s index move

### `src/client/board/guide/`

Owns the first-run guide, the card a new board's empty page shows in place of its note. It asks for a project name, a first frame size, a starting look, and who draws the first frame. The agent choice writes no frame and names the folder to open Claude Code in, being the parent of `.frameboard/`.

- `untouched.ts` holds while the board is the start project alone with its one empty start page and the tab writes, so nothing on disk records the guide
- `state.ts` keeps the guide's step in the tab, so it outlives the canvas a rename remounts under the new route, and Skip or Finish ends it until reload
- A tab `main.tsx` booted on `/` lands on the start page while the board is untouched, once per tab, so a later way home shows home. Home renders nothing until access is known.
- Each answer goes through a write the board already makes, being the project rename, `POST /api/project/tokens`, and the Frame tool's add, so Undo takes each back
- Finish writes the sheet and then the frame, and fits the view to it. The look step writes nothing, since the sheet is create-only, and drops out where the token table names any sheet.

### `src/client/board/find/`

Owns find, being the panel Cmd+F puts in place of the left panel's tabs under the same header, its query, and the pick, which change together.

- `GET /api/find` searches the frame files through `src/server/edit/find.ts`, so a culled frame is found, matching frame names, element names, and each element's own text
- A hidden frame is left out, and an element named by its own text hits as text alone, so it is listed once
- Hits group by page, the page on the canvas when they arrived first, and a pick runs `board/jump.ts`, shared with the palette, selecting by the index and hash the search read
- The field owns Esc, since the registry skips keys typed in a field, and Cmd+F turns Hide UI off
- A hit draws the glyph its Layers row draws, read from the frame's cached tree at the hash the search read, and a frame hit draws the Frame `#`

### `src/client/board/chrome/`

Owns what floats over the canvas, being the toolbar, the Play banner, the Hide UI pills, the zoom control, and the avatar menu.

- The toolbar floats bottom center on the canvas column with Move, Hand, Frame, Text, Shape, Note, Undo, Redo, Zoom to fit, the theme toggle, and the Edit and Play toggle
- The Frame button turns on Frame or Section, whichever was chosen last, and its caret opens both, keys F and Shift+S
- The Shape button places the last shape chosen and shows its icon, and its caret opens Rectangle, Ellipse, and Divider, keys R, O, and L
- The Hide UI pill renders the header's own `ProjectTitle` between the way home and Show UI, so the two project menus never drift
- A primary drag on the canvas pans under the Hand tool, or under any tool while Space is held outside a field, a button, a menu, or a dialog

### `src/client/`

Owns the app shell and the controls around the canvas.

- The inspector header shows the zoom level and zoom menu, beside an avatar with the initials of git's `user.name`, which signs notes
- Both side panels resize by dragging from 200 to 400px, default 240, remember their width, and reset on a double-click
- Hide UI, through Cmd+\ or a button, hides both panels and keeps the way home, the project name with its menu, the toolbar, the avatar, and the zoom level

### `src/client/access/`

Owns what a tab shows about its write access, mirroring `src/server/access/`.

- The View only pill takes the Reconnecting pill's slot once the server answers that the tab reads, and Play hides it on the board, where its banner holds that spot
- The inspector opens on one View only line in the same state, read through `view-only.ts`, so neither shows before the first answer
- `expired-link.ts` reads the redeem route's `link=expired` flag, strips it once access is answered, and raises a toast that stays until dismissed in a tab that cannot write

### Other folders

The favicon files sit beside the app.

- `src/client/public/` owns the files served at the site root, being the favicon set rendered from `icon.svg`

## Gotchas

- A frame's script keeps its reach through `parent.document` and same-origin `fetch`, which the board accepts as the developer's own agents' work
- Pan and zoom write the layer's CSS transform from the `d3-zoom` handler, so a gesture renders nothing, and a plain wheel pans while a wheel carrying `ctrlKey` zooms
- `wheel.ts` reads an axis in line mode or of 50 pixels or more as a mouse notch, which zooms one 1.2 step or pans over 120 ms, so a unit test polls the view after a notch-sized pan
- Edit covers the frames with a hit layer so a press reaches the selection gestures, and Play lifts it, so a click focuses a frame's window, where the board binds Esc since its own keys never arrive
- `cn` drops a `text-body`, `text-label`, or `text-caption` step before a color. Inside `cn` use `text-xs` for 12px, `text-[11px]` for 11px, and `text-(length:--text-caption)` for 10px
