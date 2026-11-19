---
title: Commands
description: The action registry, the command palette and shortcuts sheet, and undo and redo with the server history they read
---

# Commands

## Overview

Owns how every button, menu item, and key reaches the board, being the action registry, the Cmd+K palette and `?` shortcuts sheet that list it, and the undo and redo actions. What an action does belongs to the entry owning its surface.

## Layout

### `src/client/actions/`

Owns the action registry every toolbar button, menu item, and key runs through, and the palette and shortcuts sheet read. The type checker refuses an action carrying neither `command` nor `palette: false`, and the opt-out is kept to nudges, pans, Esc aliases, focus walks, and context-menu actions run at their point.

- An action is `{ id, label, group, keys?, run, enabled?, checked?, repeat? }` plus `command`, which carries the label, icon, `hint`, `keywords`, and `searchOnly` the palette reads
- A control whose action no row has registered yet renders disabled with its name and key, so it lights once that row registers and its row removes it on unmount
- `bindKeys` binds the registry into the board window at start. In Play a frame takes Esc alone through the bridge, and `runKey` runs the action the press names.
- A key shared by several actions runs the first registered whose `enabled` is true, so each row's `enabled` has to be honest about its mode for Esc to mean one thing at a time
- `character-keys.ts` holds the Single-key shortcuts switch, on by default in `localStorage`, and while off `press` lets a character key reach the browser and `liveKey` skips it on every chip

### `src/client/palette/`

Owns Cmd+K's command palette and the `?` shortcuts sheet, mounted once over both routes. With nothing typed the palette opens on Recent, then the actions fitting the selection, then pages, and a query searches frames and pages, then every action, then projects.

- `recent.ts` keeps the last 5 action ids run from the palette in `localStorage`, and a refused write keeps none, so a blocked store shows no Recent group
- A frame row sets the selection on its page, navigates, and runs `view.zoomToSelection` once the page's canvas attaches
- A hidden frame's row shows the frame first and jumps once the board holds it shown, since `pruneSelection` would drop it sooner, and a read-only tab greys it
- `palette.open`, `help.shortcuts`, and `help.characterKeys` register at the app level in `main.tsx`, and `overlay.ts` holds which overlay is open
- The sheet reads each key from the registry and greys an unregistered row, and it sits outside the routes, so a test rendering it needs a `Router` on the path it means

### `src/client/history/`

Owns `edit.undo` on Cmd+Z and `edit.redo` on Cmd+Shift+Z, plus Ctrl+Y off a Mac, registered for the whole app since the home view undoes too, lit from the server's `history` counts and following the page an undo brings back.

### `src/server/history/`

Owns the edit history undo reads, covering hand edits, moves, resizes, reorders, renames, adds, duplicates, and deletes as small before-and-after records. Only the board's own writes record, so the CLI verbs, a note write, and an asset drop pass no journal and an agent's change never enters the developer's history.

- A board verb handed a `Journal` from `src/server/board/journal.ts` reports each change it made, and `History.record` keeps them as one step, at most 100 steps deep
- A change is one layout or section entry, page order, rename, hashed or swapped path, hand-edited or placed element, or token, so an agent's write elsewhere neither blocks nor is reverted by an undo
- Every change of a step is checked under its records' locks before any is written, and an undo whose target an agent changed later is refused with `undo-overtaken`, dropped, and named in a toast
- A delete moves the path into `.run/trash/<step>/`, so its undo is a rename back, and the history and the trash both empty when the server starts and stops
- A rename and its undo broadcast `renamed` ahead of the batch, and the socket moves the selection, flips, and unseen marks first, since the renamed board prunes a selection it lacks

### `src/server/history/changes.ts`

Owns the change kinds a step holds and what each restores, which is only what the developer set, so a write by an agent or by the server around it survives. A frame an asset rename rewrote is the one change held whole, so any agent write to it overtakes the step.

- A hand edit's undo restores its element while the agent left it alone, found by index or else by a unique byte match, and answers the hash it left so the element can stay selected
- That element span is byte-exact only while every frame writer splices inside the target's start tag or between its tags, which `src/server/edit/property.test.ts` checks, so a new writer keeps to that
- A placed element's undo takes out the one element its bytes match, and its redo puts it back under its parent, ahead of the sibling it preceded, both found by start tag
- A deleted element is that change run backwards, its whitespace possibly landing on its other side, while a moved one holds both gaps with the bytes beside each, so its undo is byte for byte
- A layout entry's undo compares and restores the size on an axis both it and the stored entry hug as whatever is stored, since the server measured that size and the developer never set it

## Gotchas

- `bindKeys` skips a press inside a field or an open dialog in the board's window, which keeps Esc from the palette and the sheet off `selection.clear` and `mode.exitPlay`
- A frame skips only a composing press or one the page prevented, so Esc leaves an entered frame from a focused field, and binds a character key only while the switch is on
- A toast is a dialog to base-ui but takes board keys, undo among them, by its `data-slot="toast"` marker, while Enter there stays with the toast, which runs Show, or the button holding focus
- A held key runs its action once and prevents the auto-repeats, unless the action sets `repeat`, as the nudges, resizes, pans, zoom steps, undo, and redo do
- While a step is out, undo and redo drop a key's auto-repeat but hold the last discrete press, a click too, until the step answers
