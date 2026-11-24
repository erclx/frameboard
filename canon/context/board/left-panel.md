---
title: Left panel
description: The left panel's header, its Design, Theme, and Assets tabs, the page and layers lists, find, and the first-run guide
---

# Left panel

## Overview

Owns the board's left side, being the project header, the page list, the layers tree, the Theme and Assets tabs, and the first-run guide a new board shows. It also owns find, which takes the panel's place under Cmd+F.

## Layout

### `src/client/board/left-panel/`

Owns the left panel, being `project-header.tsx` with the way home, the name, and Hide UI, then Design's searchable pages list over a layers tree, Theme in `theme/`, and Assets, with `page-actions.ts` registering the `page.*` actions. The project name renames on a click, and its chevron opens the project menu.

- `board/frame-order.ts` holds the section grouping, so the selection chip's count and the Tab step read the order the rows draw
- A row restacks within its own group, never into or out of a section, landing at the page-wide index beside the frame it drops by
- A canvas click waits out `REVEAL_DELAY_MS` before it centers a frame, since a travel would move the point a double-click picks at
- The reveal reports as a hand move, so it stops Follow, and a row click fits a frame larger than the view where a canvas click never does
- `row-flags.tsx` draws the eye and lock a frame row and an element row share. A frame's live in `layout.json`, and an element's are written on it in its file through `element/flags.ts`
- An element row dims for a hide on it or on one holding it, and a hidden or locked element still selects from its row
- An element row's F2 stops at the row, so the board's own F2 opens no second field, and its drag moves it among its siblings alone

### `src/client/board/assets/`

Owns the Assets tab, whose Files, Find, and Generate row sits in `tab.tsx`. Files in `files.tsx` lists the project's `assets/` files as tiles grouped by folder in `groups.ts`, under a name search and kind chips, and a kit's files under `kits/` show as one line pointing at the Theme tab.

- Root files come first, a folder's group collapses from its heading, a chip with no files hides, and a tile reads `Unused` for a file no frame links
- A tile click copies `../assets/<path>`, each segment encoded, and the tile's size stays in its accessible name
- A drop or the header's `+` picker posts through `writeBoard`, refusals show inline under the drop hint, and a read-only tab says why and adds nothing
- A tile's menu opens from a right-click or a writing tab's ⋯, offering Place on canvas through `placeAtCenter` and Show frames using it, and Copy path alone when read-only
- Rename edits the stem in `RenameField`, Replace file… bumps the tile's `?v=` so its thumbnail reloads, and Delete asks first only for a file some frame links

### `src/client/board/assets/find/`

Owns Find, searching Openverse's images or Poly Haven's CC0 models, picked in the field's filter menu, and a model saves as one 1k GLB. A newer search aborts the older. `saveStore` in `../sourcing.ts` keys each save by project, kind, and source id, so a Save click and a drag of one result land one file.

- `search-store.ts` holds each project's query, kind, license choice, and last search, so Find returns as it was left and a reload starts it empty

- A result's thumbnail loads straight from the source in the board's chrome, over http or https alone, and falls back to its grey block
- Save keeps its Saved mark once the file lands, so the grid never jumps, and a read-only tab lists results with Save off and says why
- A result's drag carries a `DraggedResult` and saves only on a drop over the canvas, through `placeResult` in `src/client/board/place/write.ts`, then lands as a tile's drop does

### `src/client/board/assets/generate/`

Owns Generate, which shows the provider and its price from `GET sourcing/provider` before anything runs, so one press is the consent. The button holds while a run is out.

### `src/client/board/find/`

Owns find, being the panel Cmd+F puts in place of the left panel's tabs under the same header, its query, and the pick, which change together.

- `GET /api/find` searches the frame files through `src/server/edit/find.ts`, so a culled frame is found, matching frame names, element names, and each element's own text
- A hidden frame is left out, and an element named by its own text hits as text alone, so it is listed once
- Hits group by page, the page on the canvas when they arrived first, and a pick runs `board/jump.ts`, shared with the palette, selecting by the index and hash the search read
- The field owns Esc, since the registry skips keys typed in a field, and Cmd+F turns Hide UI off
- A hit draws the glyph its Layers row draws, read from the frame's cached tree at the hash the search read, and a frame hit draws the Frame `#`

### `src/client/board/guide/`

Owns the first-run guide, the card a new board's empty page shows, asking for a project name, a first frame size, and who draws the first frame. The agent choice writes no frame and names the folder to open Claude Code in, being the parent of `.frameboard/`.

- `untouched.ts` holds while the board is the start project alone with its one empty start page and the tab writes, so nothing on disk records the guide
- `state.ts` keeps the step in the tab, so it outlives the canvas a rename remounts, and Skip or Finish ends it until reload
- A tab `main.tsx` booted on `/` lands on the start page once per tab while the board is untouched, and home renders nothing until access is known
- Each answer goes through a write the board already makes, so Undo takes each back, and Finish writes the frame and fits the view to it

## Gotchas

- Each asset write from the tile menu is one undo step. Rename and delete carry the license file, and replace takes it out, since the license named the bytes it replaced.
- A rename rewrites the loads in each linking frame's own file through `src/server/board/asset-links.ts`, and refuses `asset-held` while a session holds one of those frames.
- An element whose load a rename moved takes the new file name as its `data-name` only while that name is still the old file's, so a name set by hand stays.
- A link in a linked sheet or a script string is not a load the rename sees, so it breaks for the link check to report.
