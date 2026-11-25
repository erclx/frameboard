---
title: Left panel
description: The left panel's header, its Design, Theme, and Assets tabs, the page and layers lists, find, and the first-run guide
---

# Left panel

## Overview

Owns the board's left side, being the project header, the page list, the layers tree, the Theme and Assets tabs with the dialogs they open, and the first-run guide a new board shows. It also owns find, which takes the panel's place under Cmd+F. Each tab's lists or body scroll under the project name and the tabs.

## Layout

### `src/client/board/left-panel/`

Owns the left panel, being `project-header.tsx` with the way home, the name, and Hide UI, then Design's searchable pages list over a layers tree, Theme in `theme/`, Assets, and `page-actions.ts` for the `page.*` actions. The name renames on a click, a rename keeping the open tab, and its chevron opens the project menu.

- `board/frame-order.ts` holds the section grouping the rows draw, apart from the canvas order the selection chip's count and the Tab step read
- A row restacks within its own group, never into or out of a section, landing at the page-wide index beside the frame it drops by
- A canvas click waits out `REVEAL_DELAY_MS` before it centers a frame, since a travel would move the point a double-click picks at
- The reveal reports as a hand move, so it stops Follow, and a row click fits a frame larger than the view where a canvas click never does
- An element row's F2 stops at the row, so the board's own F2 opens no second field, and its drag moves it among its siblings alone

### `src/client/board/left-panel/theme/`

Owns the Theme tab's four cards over `Edit theme…`, and the dialog they open, which lists six sections as vertical tabs and shows one. `tab.tsx` reads the fonts and the tokens once for both, and is keyed by project.

- `dialog-store.ts` holds the dialog's section and opener, and Ask the agent clears the opener so the note's composer keeps the focus
- `token-writer.ts` queues the token edits and holds each sheet's landed hash in the tab, since a section unmounts as another shows
- A field's Esc stops at the field, and `NumberField` and a confirmed removal hand the focus to the dialog around them

### `src/client/board/assets/`

Owns the Assets tab, whose `Find…` and `Generate…` buttons sit in `tab.tsx` over Files. Files in `files.tsx` lists the project's `assets/` files as tiles grouped by folder in `groups.ts`, under a name search and kind chips, and each kit and installed font folds into one line pointing at the Theme tab.

- Root files come first, a folder's group collapses from its heading, a chip with no files hides, and a tile reads `Unused` for a file no frame links
- A tile click copies `../assets/<path>`, each segment encoded, and the tile's size stays in its accessible name
- A drop or the header's `+` picker posts through `writeBoard`, refusals show inline under the drop hint, and a read-only tab says why and adds nothing
- A tile's menu opens from a right-click or a writing tab's ⋯, which returns focus if nothing it opened took it, and offers `placeAtCenter` and Show frames using it, or Copy path alone when read-only
- Rename edits the stem in `RenameField`, Replace file… bumps the tile's `?v=` so its thumbnail reloads, and Delete asks first only for a file some frame links

### `src/client/board/assets/sourcing-dialog.tsx`

Owns the one dialog both buttons open, on the shell in `src/client/board/chrome/wide-dialog.tsx` that the Theme dialog shares, while `open-dialog.ts` holds whether it is open, on which view, and the two palette commands.

- `preview.tsx` shows the picked result with Save and Insert, landing in the one selected frame while part of it is in view, else the canvas, as `src/client/board/place/write.ts` lands it
- An insert holds the dialog open until it lands, a refusal shows beside its buttons, and a project switch closes the dialog at once, so a refusal after that toasts

### `src/client/board/assets/find/`

Owns Find, searching Openverse's images or Poly Haven's CC0 models, picked in the kind menu, and a model saves as one 1k GLB. A newer search aborts the older. `saveStore` in `../sourcing.ts` keys each save by project, kind, and source id, so Save and Insert of one result land one file.

- `search-store.ts` holds each project's query, kind, license choice, last search, and pick, so Find returns as it was left and a reload starts it empty
- `picture.tsx` loads a thumbnail straight from its source, over http or https alone, then an SVG's original, then names the file type and source, since a photo's original can be many megabytes

### `src/client/board/assets/generate/`

Owns Generate, which shows the provider and its price from `GET sourcing/provider` before anything runs, so one press is the consent. The button holds while a run is out, and `run-store.ts` keeps each project's prompt, run, and pictures, so a run that spent outlives the dialog.

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

- An element row's eye and lock write onto the element through `src/client/board/element/flags.ts`, where a frame row's, drawn by the same `row-flags.tsx`, write `layout.json`
- Each asset write from the tile menu is one undo step. Rename and delete carry the license file, and replace takes it out, since the license named the bytes it replaced.
- A rename rewrites the loads in each linking frame's own file through `src/server/board/asset-links.ts`, and refuses `asset-held` while a session holds one of those frames.
- An element whose load a rename moved takes the new file name as its `data-name` only while that name is still the old file's, so a name set by hand stays.
- A link in a linked sheet or a script string is not a load the rename sees, so it breaks for the link check to report.
