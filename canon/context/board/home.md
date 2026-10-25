---
title: Home view
description: The home view's project cards and rows, and the project actions it shares with the board
---

# Home view

## Overview

Owns where the developer picks a project, being the home view and the project actions it shares with the board's header. The board screen around a project is in `canon/context/board/shell.md`, and the palette that also runs these actions in `canon/context/board/commands.md`.

## Layout

### `src/client/home/`

Owns the home view, where every project shows as a card with a thumbnail of its frames or as a list row. Opening a card opens its board, and the board's home button is the one way back and between projects.

- A card shows the project's name and when it was last edited, and a list row adds the day `project.json` says it was made, empty for an older project
- A card's well fits the visible frames of the first page holding one as a group, each capture drawn over its white box until one lands. A list row's mark draws the boxes alone
- `src/shared/card-frames.ts` makes that pick for the thumbnail route, the ask, and the skeleton alike, so a card never draws a box whose capture was never stamped
- `thumbnails.ts` asks for the shown theme's stamps on mount, a theme flip, a reconnect, and a frame new, resized, or reloaded. Each landing reaches the live store over the socket

The header and each card's menu run the `project.*` actions.

- The header carries the grid and list switch, New project, and the theme toggle, and an empty board shows the terminal command beside New project
- The Sort menu on the right of the Projects title runs `home.sortEdited`, `home.sortCreated`, and `home.sortName`, which the palette lists too
- Under them it names the two directions after the key, such as Newest first and Oldest first, and picking the other one runs `home.sortReverse`
- New project adds the next free `untitled` and opens its name in the rename field, and an `invalid-name` refusal stays inline under the field while any other raises the toast
- A board registers New project too and goes home before the add, since leaving the board clears the rename field the add opens

A card or row takes the menu and the keys the same way.

- A right click, the menu key, or Shift+F10 on a card or row opens `project-menu.tsx`, and F2 and Delete rename and delete a focused card

**Focus keys**

- One card sits in the tab sequence. The arrows move across the grid, Up and Down to the nearest card in the laid-out row, and down the list, with Home and End for the ends
- H, J, K, and L stand for the arrows while single-key shortcuts are on. `roveFocus` reads the switch itself, the one character key outside the registry's gate
- With nothing focused, `home.focusCards` lands the first arrow or hjkl on the tab stop card, and `home.focusFirst` and `home.focusLast` land Home and End
- All three stand down once a card, a toggle, or a field holds focus, so a press moves focus once
- The `?` sheet on home swaps the board's sections for Projects, listing these keys, and General, with the palette, the sheet, undo, and redo

`sort.ts` and `pins.ts` hold the viewer's own order, kept in the browser beside the grid and list choice.

- `sort.ts` orders the projects by last edited, created, or name, last edited newest first by default, and `home.tsx` orders them once so the cards, the arrow keys, and the tab stop follow what is shown
- Choosing a key starts it in its natural direction, the dates newest first and the name from A. Either way an undated project sits last and a tie falls to the name from A.
- A pinned project sits above the rest in the grid and the list, each group in the chosen order, and carries a filled pin after its name
- The rest start on a new grid row under a hairline, and the list parts the groups with a band, since every list row already ends on a hairline

The browser keeps both, and neither reaches the board.

- `localStorage` holds `frameboard.home.layout`, `frameboard.home.sort` and its `frameboard.home.sortDirection`, and the pins in `frameboard.home.pins`, falling back to defaults when storage refuses
- No pin reaches the board folder, so a second browser or an agent sees none, and a pin naming no project is ignored where it is read
- Neither waits on `canWrite`, so both work in a read-only tab

### `src/client/projects/`

Owns the `project.*` actions, shared by the home view, where they act on the focused card, and the board, where they act on the open project and add `nav.home`. Rename, Duplicate, Pin, and Delete reach the palette only while there is a project to act on, naming it as the row's hint.

- `nav.home` goes home on Alt+ArrowUp, Windows Explorer's up a level, since Cmd+ArrowUp resizes a frame
- `project.pin` toggles the pin through `src/client/home/pins.ts`, and the card menu reads Unpin on a pinned project
- A rename carries a pin to the new name, through `renameProject` or the new board guide's own `movePin` call, a delete drops it, and a duplicate starts unpinned
