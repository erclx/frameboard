---
title: Content model
description: Board folders, projects, pages, frames, layout files, assets, and how an element is addressed
---

# Content model

## Overview

Owns what sits on disk and how Frameboard reads it, being the board folder, the projects, pages, and frames inside it, each page's layout file, each project's assets, and the address of one element inside a frame. Everything else in the tool reads and writes through this model.

## Layout

### `src/shared/`

Owns the types and schemas for the layout file and every record the CLI and server exchange, with the schemas under `src/shared/records/`. `bindings.ts` holds the drawn controls contract, `data-binds="<selector> <--property>"` with `data-unit`, which the client, the capture, the phone link, and the check all read.

- Every record carries `"version": 1` and reads through a loose schema, so a newer Frameboard's keys survive a write by an older one
- Projects, pages, and frames share one name rule in `src/shared/names.ts`, two names colliding when they match case-insensitively, and `assets` is reserved as a page name
- `project.json` gains a `createdAt` once, from `project add` or the first `serve` of an empty folder, and an older project reads as made at no time, never at a file's birth time
- `project.json` may hold `group`, `archived: true`, and a `title` in any characters, a value of another type reading as absent so a hand edit never fails the scan
- Refs, URLs, pins, claims, and CLI arguments keep naming the folder, which `ProjectRecord.name` carries beside `title`

### `src/server/board/`

Owns reading, watching, and writing the board folder: `.frameboard/` where a first `serve` ran, a folder holding `board.json`, or any `--root`. A project is a folder, a page a folder in it, and a frame one `.html` file, each page's `layout.json` holding boxes, sections, a transition, and each frame's own keys up to its speaker note.

- Each page's `notes.json` sits beside its frames, since writing a note into a frame would shift every element address after it
- Frame order is stacking order, so a reorder in the layers panel changes what draws on top and leaves positions alone
- `fileProjects` in `projects.ts` writes `group` and `archived` under each file's lock and puts the modified times back, so a filing never moves a project's Edited time
- `retitleProject` moves the folder to `titledFolder`, and its journal records the title before the move, so the undo moves the folder back before it restores the file
- `placeNext`, `duplicateFrame`, `paste.ts`, and `editing.ts` read `drawnExtent`, and all but the `editing.ts` reservation add the new frame's own body through `xPast`, so none lands under a device

### `src/server/edit/`

Owns the edit writer, which parses a frame with parse5 and writes only inside the edited attribute value or text span, and `insert.ts`, which adds a placed element's tag at a sibling gap or stands one in a new file, refusing a moved hash. Neither serializes the tree, which rewrites formatting, nor uses Bun's `HTMLRewriter`, which Node lacks.

- Every reader addresses an element by its `querySelectorAll('*')` index plus the SHA-256 hex of the file's raw bytes, skipping in a live frame the `data-frameboard` elements spliced into `head`
- An element's name is its `data-name`, else a text-only element's text cut to 40 characters, else an `img`'s `alt`, else its tag, and `elementTree` returns each name and parent under `body`
- A board edit on a hash the file has left lands where its element's bytes and all before them held, or read once before and after, else is refused as stale, as the CLI's `edit` always is
- Each writer reparses its output and refuses `verify-failed` unless the tree differs only at its targets, which `recolor.ts` alone makes several, the placed element, or a wrap's `div` and members
- A note anchors by element address, and a board write records its index under each new hash in the anchor's `known`, so only an outside write or a removal drops it to the frame

### `src/server/notes/`

Owns the notes record, its anchors, and delivery to a listening session, apart from `board/` since the three change together.

- `<page>/notes.json` is `{ version: 1, notes }`, each note naming its `frame`, `anchor`, `text`, `from`, `author`, `session`, `to`, `state`, and `thread`, plus `images` in `.notes/`
- An id is `n_` and 8 hex characters, unique across the board, so a verb finds a note by scanning every page's file. `number` is one past the page's highest on a root and `null` on a reply.
- A reply is a note in the same file, `thread` naming its root, so the agent's answer needs no second store
- `state` is `open`, `queued`, `delivered`, or `done` on a root, a reply carries `open`, and a developer reply naming a session re-queues the root to it
- Every writer, being the board routes, delivery, and the `notes` verbs, goes through `updateRecord`'s lock, and a file that does not parse is refused as `notes-invalid`, never overwritten

### Other folders

Project files sit beside the pages.

- `assets/` in a project owns images, GIFs, video, SVG, fonts, and stylesheets that any frame may link, and is the one path outside a page a frame may use
- A drop into `assets/` accepts images, GIF, SVG, video, audio, fonts, stylesheets, and scripts, and refuses HTML and the rest by name
- A dropped name is cut to the board's name rule, and one already taken in any letter case takes the first free `-2`, `-3`, so a drop never overwrites a file an agent wrote
- Lock files, temp files, and dot folders hold generated files, and the watcher and scanner skip them, the watcher reading `.run/claims.json` alone

`assets/transitions/<name>.css` is a project's own slide transition, named by its stem.

- The stem is lowercase kebab case and never a built-in name, `none`, or `page`
- The board reads its `enter` and `leave` keyframes through `src/server/board/transitions.ts` and never loads the file
- `list --json` names the valid ones on the project as `transitions`, sorted by name

### `.run/`

Holds what a running board writes about itself, and ignores itself through its own `.gitignore`.

- The address file `serve` writes holds the URL, pid, and token at mode 0600, beside the claims `editing` writes
- `.run/thumbnails/` holds the captures home's cards and the slide overview draw, by frame and theme, emptied at each start, since a frame edited while no server ran would show a stale one
- `.run/changes/` holds the change log and the versions it names by hash, read at start and read as empty when missing or unparsable
- `.run/checks.json` holds each frame's check results and measure by key, a cache read as empty when missing, unparsable, or of another version, so deleting it costs one full recheck
- `.run/board-key.json` holds the board key at mode 0600 and survives restarts, so a tab's cookie does too. Deleting it and restarting `serve` revokes every board's cookie

## Gotchas

- Every writer of `layout.json` takes a lock file beside it, merges, and replaces atomically, since two writers replacing the whole file each lose the other's edit
- A layout that does not parse is a defect to report, never an empty file to overwrite, since overwriting erases every box it held
- A frame that states a `head` must state a `body`, and every table its `tbody`, because the browser builds a missing one and shifts every address after it
- A stylesheet several pages use goes in `assets/`, never in one page folder, since that folder is renamed, moved, and deleted with its page
- The edit writer swaps a leading BOM for a space and refuses bytes that fail a UTF-8 round trip, since either would shift the parse or rewrite bytes far from the target
