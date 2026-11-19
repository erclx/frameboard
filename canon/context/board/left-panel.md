---
title: Left panel
description: The left panel's header, its Design, Theme, and Assets tabs, the page and layers lists, and the first-run guide
---

# Left panel

## Overview

Owns the board's left side, being the project header, the page list, the layers tree, the Theme and Assets tabs, and the first-run guide a new board shows. Find, which takes the panel's place under Cmd+F, is in `canon/context/board/shell.md`.

## Layout

### `src/client/board/left-panel/`

Owns the left panel, being `project-header.tsx` with the way home, the name, and Hide UI, then Design's searchable pages list over a layers tree, Theme in `theme/`, and Assets, with `page-actions.ts` registering the `page.*` actions. The project name renames on a click, and its chevron opens the project menu.

- `board/frame-order.ts` holds the section grouping, so the selection chip's count and the Tab step read the order the rows draw
- A row restacks within its own group, never into or out of a section, landing at the page-wide index beside the frame it drops by
- A canvas click waits out `REVEAL_DELAY_MS` before it centers a frame, since a travel would move the point a double-click picks at
- The reveal reports as a hand move, so it stops Follow, and a row click fits a frame larger than the view where a canvas click never does
- An element row's F2 stops at the row, so the board's own F2 opens no second field, and its drag moves it among its siblings alone

### `src/client/board/assets/`

Owns the Assets tab, whose Files, Find, and Generate row sits in `tab.tsx`. Files in `files.tsx` lists the project's `assets/` files as tiles grouped by folder in `groups.ts`, under a name search and kind chips. A kit's files under `kits/` stay out of the list and the counts, and one line sends the reader to the Theme tab instead.

- Root files come first, each folder's group collapses from its heading, and a chip with no files hides
- A tile's `<type> · <frames>` line reads `Unused` for a file no frame links, and its size stays in its accessible name
- A tile click copies `../assets/<path>`, each segment encoded
- A drop on the tab, or the header's `+` picker, posts the files through `writeBoard`, and a tab with no write access says why and adds nothing
- Refusals show as an inline line under the drop hint rather than a toast, and a drop reloads only the frames linking a dropped file, through the `assets/` watch

A tile opens its menu, in `src/client/board/menus/asset.tsx`, from a right-click or from the ⋯ button a writing tab shows on a hovered or focused tile. A view-only tab offers Copy path alone and draws no ⋯. `files.tsx` holds which tile renames and the Delete confirm, and each write's refusal toasts.

- Place on canvas lands the file in a new frame at the view's center through `placeAtCenter`, the landing a drop on bare canvas makes
- Show frames using it lists the linking frames from `GET .../assets/<path>` in a popover, and a click jumps to one
- Rename edits the stem alone in the board's `RenameField`, keeping the extension, and the server refuses a changed extension
- Replace file… writes a picked file of the same kind under the same path, and bumps the tile's `?v=` so its thumbnail loads the new bytes
- Delete asks first only for a file some frame links, naming the frames, since Undo brings the file back

Each write is one undo step. Rename and delete carry the license file, and replace takes it out, since the license named the old bytes. Rename rewrites each linking frame's own loads through `src/server/board/asset-links.ts` and refuses `asset-held` while a session holds one.

### `src/client/board/assets/find/`

Owns Find, an Openverse search run on Enter, with a filter menu at the end of the search field whose credited licenses item searches again. A newer search aborts the older, so an older answer never replaces it. `saveStore` in `../sourcing.ts` keys each save by project and Openverse id, so a Save click and a drag of one result land one file.

- A result's thumbnail loads straight from the source in the board's chrome, over http or https alone, and falls back to its grey block
- Save keeps its Saved mark once the file lands, so the grid never jumps, and a read-only tab lists results with Save off and says why
- A result's drag carries a `DraggedResult` and saves only on a drop over the canvas, through `placeResult` in `src/client/board/place/write.ts`, then lands as a tile's drop does

### `src/client/board/assets/generate/`

Owns Generate, which shows the provider and its price from `GET sourcing/provider` before anything runs, so one press is the consent. The button holds while a run is out.

### `src/client/board/guide/`

Owns the first-run guide, the card a new board's empty page shows, asking for a project name, a first frame size, and who draws the first frame. The agent choice writes no frame and names the folder to open Claude Code in, being the parent of `.frameboard/`.

- `untouched.ts` holds while the board is the start project alone with its one empty start page and the tab writes, so nothing on disk records the guide
- `state.ts` keeps the step in the tab, so it outlives the canvas a rename remounts, and Skip or Finish ends it until reload
- A tab `main.tsx` booted on `/` lands on the start page once per tab while the board is untouched, and home renders nothing until access is known
- Each answer goes through a write the board already makes, so Undo takes each back, and Finish writes the frame and fits the view to it
