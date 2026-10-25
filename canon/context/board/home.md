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
- New project adds the next free `untitled` and opens its name in the rename field, and an `invalid-name` refusal stays inline under the field while any other raises the toast
- A right click, the menu key, or Shift+F10 on a card or row opens `project-menu.tsx`, and F2 and Delete rename and delete a focused card
- One card sits in the tab sequence, and the arrow keys move focus across the grid by its measured columns and down the list, with Home and End for the ends

### `src/client/projects/`

Owns the `project.*` actions, shared by the home view, where they act on the focused card, and the board, where they act on the open project and add `nav.home`. Rename, Duplicate, and Delete reach the palette only while there is a project to act on, naming it as the row's hint.
