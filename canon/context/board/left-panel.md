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

| Area          | Behavior                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Pages list    | Searchable, over a per-project divider that opens fit to 4 to 8 rows, a double-click fitting every page       |
| Page edits    | Add after the current page, rename on a double-click or F2, delete with Delete, and drag through `reorder.ts` |
| Theme         | `theme/` tags each token Board or Project, per `canon/context/content/themes-and-tokens.md`                   |
| Layer rows    | Top of the stack first, click selects, Shift-click adds, F2 renames, a drag restacks, eye and lock on hover   |
| Section rows  | `section-rows.tsx` indents each section's frames under it, and the frames in no section follow                |
| Element rows  | A glyph per kind read from `GET /api/frames/elements` off the static cascade, so a culled frame keeps them    |
| Element names | A double-click or F2 writes `data-name`, the only place an element is renamed                                 |

These hold across the rows and the reveal.

- `board/frame-order.ts` holds the section grouping, so the selection chip's count and the Tab step read the order the rows draw
- A row restacks within its own group, never into or out of a section, landing at the page-wide index beside the frame it drops by
- A canvas click waits out `REVEAL_DELAY_MS` before it centers a frame, since a travel would move the point a double-click picks at
- The reveal reports as a hand move, so it stops Follow, and a row click fits a frame larger than the view where a canvas click never does
- An element row's F2 stops at the row, so the board's own F2 opens no second field, and its drag moves it among its siblings alone

### `src/client/board/assets/`

Owns the Assets tab, which lists the project's `assets/` files as tiles grouped by folder in `groups.ts`, under a name search and kind chips.

- Root files come first, each folder's group collapses from its heading, and a chip with no files hides
- A tile's `<type> · <frames>` line reads `Unused` for a file no frame links, and its size stays in its accessible name
- A tile click copies `../assets/<path>`, each segment encoded
- A drop on the tab, or the header's `+` picker, posts the files through `writeBoard`, and a tab with no write access says why and adds nothing
- Refusals show as an inline line under the drop hint rather than a toast, and a drop reloads every frame through the existing `assets/` watch

### `src/client/board/guide/`

Owns the first-run guide, the card a new board's empty page shows, asking for a project name, a first frame size, a kit, and who draws the first frame. The agent choice writes no frame and names the folder to open Claude Code in, being the parent of `.frameboard/`.

- `untouched.ts` holds while the board is the start project alone with its one empty start page and the tab writes, so nothing on disk records the guide
- `state.ts` keeps the step in the tab, so it outlives the canvas a rename remounts, and Skip or Finish ends it until reload
- A tab `main.tsx` booted on `/` lands on the start page once per tab while the board is untouched, and home renders nothing until access is known
- Each answer goes through a write the board already makes, so Undo takes each back, and Finish installs the kit, writes the frame, and fits the view to it
- The kit step writes nothing, since an install refuses over any sheet, drops out where the token table names one, and shows its cards once `GET /api/kits` answers
