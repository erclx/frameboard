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

- The Frame tool, key F, places a frame at the click at the chosen phone, tablet, or desktop preset, named for the preset, then selects it, opens its inspector name, and returns to Move
- A frame placed partly out of view moves the view to center it at the current zoom
- In Play a frame behaves like a page, nothing selects, and notes and claim outlines hide
- Frames beyond one viewport of the view swap their iframe for a placeholder once a gesture rests 150 ms

A frame's label carries a sun on hover while the frame follows the board's theme, and a Dark or Light chip while it is flipped alone. A click on either flips it. Under a width preview the label adds a plain chip naming that width.

`label-room.ts` measures the board gap above each frame, and the zoom handler marks the frame crowded when that gap is shorter than its label. A crowded label hides until hover, selection, or open findings, and a findings dot stays on its top left.

### `src/client/board/left-panel/`

Owns the left panel, being `project-header.tsx` with the way home, the project name, and Hide UI, then the Design, Theme, and Assets tabs, with `page-actions.ts` registering the `page.*` actions. A click on the project name renames it, and its chevron opens Rename, Duplicate, Switch project, and All projects.

- Design holds a pages list with a search and a layers tree under a per-project divider that resets on a double-click, and Theme holds the project's tokens read-only
- A page is added after the current one, renamed on a double-click or F2 through `src/client/components/rename-field.tsx`, deleted with Delete, and dragged into place through `reorder.ts`
- Assets, in `src/client/board/assets/`, lists the project's `assets/` files as tiles with a thumbnail, name, and `<type> · <size>` line, and a tile click copies `../assets/<name>`, each segment encoded
- A drop on the tab, or the header's `+` picker, posts the files through `writeBoard`, and a tab with no write access shows why and adds nothing while a tile still copies
- Refusals show as an inline line under the drop hint rather than a toast, and a drop reloads every frame through the existing `assets/` watch

The layers tree lists the top of the stack first. A row click selects its frame and Shift-click adds it, a double-click or F2 renames it, a drag restacks it, and its eye and lock show on hover and stay while on. A hidden frame's row dims and does not select.

An element row renames on a double-click or F2 too, writing `data-name` as the inspector's Name does. Its F2 stops at the row, so the board's own F2 opens no second field.

### `src/client/board/guide/`

Owns the first-run guide, the card a new board's empty page shows in place of its note. It asks for a project name, a first frame size, a starting look, and who draws the first frame.

- `untouched.ts` holds while the board is the start project alone with its one empty start page and the tab writes, so nothing on disk records the guide
- `state.ts` keeps the guide's step in the tab, so it outlives the canvas a rename remounts under the new route, and Skip or Finish ends it until reload
- Each answer goes through a write the board already makes, being the project rename, `POST /api/project/tokens`, and the Frame tool's add, so Undo takes each back
- The look step drops out where the token table names any sheet, and the agent choice writes nothing and hands the developer a prompt

### `src/client/board/find/`

Owns find, being the panel Cmd+F puts in place of the left panel's tabs under the same header, its query, and the pick, which change together.

- `GET /api/find` searches the frame files through `src/server/edit/find.ts`, so a culled frame is found, matching frame names, element names, and each element's own text
- A hidden frame is left out, and an element named by its own text hits as text alone, so it is listed once
- Hits group by page, the page on the canvas when they arrived first, and a pick runs `board/jump.ts`, shared with the palette, selecting by the index and hash the search read
- The field owns Esc, since the registry skips keys typed in a field, and Cmd+F turns Hide UI off

### `src/client/board/chrome/`

Owns what floats over the canvas, being the toolbar, the Play banner, the Hide UI pills, the zoom control, and the avatar menu.

- The toolbar floats bottom center on the canvas column with Move, Hand, Frame, Note, Undo, Redo, Zoom to fit, the theme toggle, and the Edit and Play toggle
- A primary drag on the canvas pans under the Hand tool, or under any tool while Space is held outside a field, a button, a menu, or a dialog

### `src/client/`

Owns the app shell and the controls around the canvas.

- The inspector header shows the zoom level and zoom menu, beside an avatar with the initials of git's `user.name`, which signs notes
- Both side panels resize by dragging from 200 to 400px, default 240, remember their width, and reset on a double-click
- Hide UI, through Cmd+\ or a button, hides both panels and keeps the project name, toolbar, avatar, and zoom level

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
- A zooming wheel in line mode or of 50 pixels or more is a mouse notch and steps one 1.2 zoom, while a pinch's small deltas follow a curve, so the pinch stays smooth
- Edit covers the frames with a hit layer so a press reaches the selection gestures, and Play lifts it, so a click focuses a frame's window, where the board binds Esc since its own keys never arrive
- `cn` reads the custom `text-body` and `text-label` steps as colors, keeping a kit part's `text-sm` beside one but dropping one before a color. Use `text-xs` for 12px, `text-[11px]` for 11px
