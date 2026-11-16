---
title: Left panel
description: The left panel's header, its Design, Theme, and Assets tabs, the page and layers lists, and the first-run guide
---

# Left panel

## Overview

Owns the board's left side, being the project header, the page list, the layers tree, the Theme and Assets tabs, and the first-run guide a new board shows. Find, which takes the panel's place under Cmd+F, is in `canon/context/board/shell.md`.

## Layout

### `src/client/board/left-panel/`

Owns the left panel, being `project-header.tsx` with the way home, the project name, and Hide UI, then the Design, Theme, and Assets tabs, with `page-actions.ts` registering the `page.*` actions. A click on the project name renames it, and its chevron opens Rename, Duplicate, Switch project, Rules turned off from `rules-off.tsx`, and All projects.

- Design holds a searchable pages list and a layers tree under a per-project divider that opens fit to 4 to 8 rows
  - A double-click on the divider fits every page, stopping before Layers keeps fewer than three rows
  - A page add grows the list to the 4 to 8 fit, or to every page when it already showed them all
  - Theme, in `theme/`, tags each token Board or Project and edits it in place into the sheet its tag names, per `canon/context/content/themes-and-tokens.md`
- A page is added after the current one, renamed on a double-click or F2 through `src/client/components/rename-field.tsx`, deleted with Delete, and dragged into place through `reorder.ts`

The Assets tab, in `src/client/board/assets/`, lists the project's `assets/` files as tiles grouped by folder in `groups.ts`, under a name search and kind chips.

- Root files come first, each folder's group collapses from its heading, and a chip with no files hides
- A tile's `<type> · <frames>` line reads `Unused` for a file no frame links, and its size stays in its accessible name
- A tile click copies `../assets/<path>`, each segment encoded
- A drop on the tab, or the header's `+` picker, posts the files through `writeBoard`, and a tab with no write access shows why and adds nothing while a tile still copies
- Refusals show as an inline line under the drop hint rather than a toast, and a drop reloads every frame through the existing `assets/` watch

The layers tree lists the top of the stack first. A row click selects its frame and Shift-click adds it, a double-click or F2 renames it, a drag restacks it, and its eye and lock show on hover and stay while on. A hidden frame's row dims and does not select. Only a selected row is tinted, never its frame's other rows or the frame holding it.

Each section's row in `section-rows.tsx` holds its frames' rows indented under it, and the frames in no section follow. A row restacks within its own group and never into or out of a section, landing at the page-wide index beside the frame it drops by, so the canvas draws it over or under that frame.

- `board/frame-order.ts` holds that grouping, so the selection chip's count and the Tab step read the order the rows draw
- Choosing a frame not wholly in view, from its row or by a plain canvas click, centers its drawn box at the current zoom through `canvasView.reveal`
- A row click fits a frame larger than the view. A canvas click never fits one, and reveals only a frame it newly selected.
- A canvas click waits out `REVEAL_DELAY_MS` first, since a travel would move the point a double-click picks at. A Shift-click, a marquee, or a drag leaves the view put.
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
