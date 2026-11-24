---
title: Home view
description: The home view's project cards and rows, and the project actions it shares with the board
---

# Home view

## Overview

Owns where the developer picks a project, being the home view and the project actions it shares with the board's header. The board screen around a project is in `canon/context/board/shell.md`, and the palette that also runs these actions in `canon/context/board/commands.md`.

## Layout

### `src/client/home/`

Owns the home view, every project a card with a thumbnail or a list row, under a header with the layout switch, New project, the theme toggle, and Sort. A title renames through `POST /api/project/title`, the filter and Archived section narrow the list, and `sort.ts` and `pins.ts` keep the viewer's own order.

- `thumbnails.ts` asks for the shown theme's stamps on mount, a theme flip, a reconnect, and a changed frame, and a card's box pulses grey until its capture loads, held still without one
- An `invalid-name` refusal stays inline under the rename field, and a board's New project goes home first, since leaving the board clears the state the add opens
- `roveFocus` reads the single-key switch itself, the one character key outside the registry's gate, and the focus actions stand down once a card, toggle, or field holds focus
- `home.tsx` orders once, so the cards, the arrows, and the tab stop follow what is shown, an undated project sits last, and a tie falls to the name from A
- No pin reaches the board folder, so a second browser or an agent sees none, and sorting and pinning both work in a read-only tab

### `src/client/home/folders/`

Owns folders, filing projects one level deep by the `group` key in `project.json`, so a folder is board state an agent reads in `list --json`. A folder card draws a tab into the row gap, and `menu.tsx` offers Open, Rename, Ungroup, and Pin through the `folder.*` actions, and a list row's menu adds New project.

- `entries.ts` stands a folder where its first member would, sorting through that member and rising with the pinned when pinned itself or holding a pinned member
- Two groups differing only in case or trailing space read as one folder, and a rename refuses a name another folder holds in any case, since writing it would merge the two
- A grid folder card opens `panel.tsx` and a list row opens in place, and Move to folder, New folder, or a card dragged onto another through `drop.ts` files a project
- `title-click.ts` holds a click on a folder's name 300ms, so a double click renames in place without opening the folder first
- A drop hint sits in a card's well clear of its name, and below `sm` a row hides it from sight while its status text stays for assistive tech

### `src/client/projects/`

Owns the `project.*` actions, shared by the home view, where they act on the focused card, and the board, where they act on the open project and add `nav.home`. Rename, Duplicate, Pin, and Delete reach the palette only with a project to act on, named through `projectLabel` in `actions.ts`. A title's folder name folds marked letters in `folderName`.

- `nav.home` goes home on Alt+ArrowUp, Windows Explorer's up a level, since Cmd+ArrowUp resizes a frame
- `project.pin` toggles the pin through `src/client/home/pins.ts`, and the card menu reads Unpin on a pinned project
- A rename carries a pin to the folder the title moved it to, through `renameProject` or the new board guide's own `movePin` call, a delete drops it, and a duplicate starts unpinned
- A delete acts at once and raises a toast naming the project and what it held, whose Undo runs `edit.undo` and puts back the pin the delete dropped
- That toast closes on the next history message after the delete's own, since the capped journal's counts cannot tell a later step apart and Undo would take that step back instead
