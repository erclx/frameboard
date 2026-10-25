---
title: Commands
description: The action registry, the command palette and shortcuts sheet, and undo and redo
---

# Commands

## Overview

Owns how every button, menu item, and key reaches the board, being the action registry, the Cmd+K palette and `?` shortcuts sheet that list it, and the undo and redo actions. What an action does belongs to the entry owning its surface.

## Layout

### `src/client/actions/`

Owns the action registry every toolbar button, menu item, and key runs through, and the palette and shortcuts sheet read.

- An action is `{ id, label, group, keys?, run, enabled?, checked?, command? }`, a row registers its own and removes them on unmount, and a row needing a field adds it as optional
- `command` is the label, icon, and optional right-hand `hint` the palette shows, and the palette lists only enabled actions carrying it, so a key nobody runs by name stays out
- A control whose action no row has registered yet renders disabled with its name and key, so it lights once that row registers
- `bindKeys` binds the registry into the board window at start and into a frame's window in Play, Esc alone there
- A key shared by several actions runs the first registered whose `enabled` is true, so each row's `enabled` has to be honest about its mode for Esc to mean one thing at a time

`character-keys.ts` holds the Single-key shortcuts switch WCAG 2.1.4 asks for, on by default and kept in `localStorage`. While it is off, `press` skips a key typing a character before `preventDefault`, so the press reaches the browser untouched, and every chip reads its key through `liveKey`, which skips that key.

### `src/client/palette/`

Owns the two overlays that list the registry, being Cmd+K's command palette and the `?` shortcuts sheet, mounted once over both routes.

- Cmd+K jumps to any project, page, or frame and runs board actions such as new page, theme toggle, and zoom, while inspector edits stay in the inspector
- On a board the palette lists every project's frames and pages, the open project's first, each hinted with where it sits, then actions and projects. Home lists projects and app actions alone.
- A frame row sets the selection on its page, navigates, and runs `view.zoomToSelection` once the page's canvas attaches
- A hidden frame's row is marked and shows the frame first, jumping once the board holds it shown, since `pruneSelection` would drop it sooner. A read-only tab greys it.
- `palette.open`, `help.shortcuts`, and `help.characterKeys` register at the app level in `main.tsx`, and `overlay.ts` holds which overlay is open

The sheet reads each key from the registry and greys a row whose action no row has registered yet, while gesture rows carry their own text. Its header carries the Single-key shortcuts switch, an off key stays listed but faint, and an Agents group lists `]` and `[`.

- On a board the Tools group ends with All projects, `nav.home` on Alt+ArrowUp
- On home it reads `/` through wouter's `useRoute` and shows Projects and General in place of the board's sections, with H J K L faint while the switch is off
- It sits outside the routes, so a test rendering it needs a `Router` on the path it means

### `src/client/history/`

Owns `edit.undo` on Cmd+Z and `edit.redo` on Cmd+Shift+Z, plus Ctrl+Y off a Mac, registered for the whole app since the home view undoes too, lit from the server's `history` counts and following the page an undo brings back.

## Gotchas

- `bindKeys` skips a press inside a field or an open dialog, which keeps Esc from the palette and the sheet off `selection.clear` and `mode.exitPlay`
- A toast is a dialog to base-ui but takes board keys, undo among them, by its `data-slot="toast"` marker, while Enter there stays with the toast, which runs Show, or the button holding focus
