---
title: Content model
description: Board folders, projects, pages, frames, layout files, assets, and how an element is addressed
---

# Content model

## Overview

Owns what sits on disk and how Frameboard reads it, being the board folder, the projects, pages, and frames inside it, each page's layout file, each project's assets, and the address of one element inside a frame. Everything else in the tool reads and writes through this model.

## Layout

- `src/shared/` owns the types and schemas for the layout file and every record the CLI and server exchange, with the schemas under `src/shared/records/`
- `src/server/` owns reading, watching, and writing the board folder, with the folder model under `src/server/board/`

### The shape on disk

- A board folder is whatever one server shows, sitting in a repository as `.frameboard/`, standalone such as `~/frameboard/`, or at any path through `--root`
- A project is a folder in the board folder, a page is a folder in a project, and a frame is one `.html` file in a page
- Each page holds one `layout.json` beside its frames, keyed by frame name, with each frame's x, y, width, and height, its stacking order, and whether it is hidden or locked
- Each page holds a `notes.json` beside its layout, holding the developer's pinned notes for the agent
- Each project holds an `assets/` folder for images, GIFs, video, SVG, fonts, and shared stylesheets that any of its frames may use

### Records beside the content

- A board folder holds `board.json`, so a verb finds a standalone board by walking up from the working folder, stopping at the repository top, rather than needing `--root`.
- A project may hold `project.json` listing its pages in display order, so pages reorder without renaming folders, and pages it does not list follow by name.
- `project.json` may hold `checks`, whose `allowedFonts` and `noUppercase` turn on the project's own check rules, so a house style travels with the project and absent means the built-in rules alone.
- `serve` writes `.run/address.json` holding the server's URL, pid, and token at mode 0600, and `.run/` ignores itself through its own `.gitignore`, so the token never reaches a commit.
- Every record carries `"version": 1` and reads through a loose schema, so a newer Frameboard's keys survive a write by an older one.

### Names

- Projects, pages, and frames share one name rule in `src/shared/names.ts`, so the verbs and the naming check agree on which names are valid.
- Two names collide when they match case-insensitively, because the default macOS volume is case-insensitive and two such files cannot sit side by side there.
- `assets` is reserved as a page name, since that folder holds the project's shared files.

## Decisions

### A project is not a repository

- One repository's board folder holds several projects, such as a web app design and a brainstorm
- The home view and every verb take a project by name inside one board folder

### Layout sits beside the frames, never inside them

- Moving or resizing a frame writes `layout.json` alone, so a move never rewrites markup and never collides with an agent rewriting the file

### A frame with no layout entry still shows

- A frame file with no entry reads as unplaced, at desktop size and 80 px past every frame placed before it, so a file an agent wrote without `frame add` still appears on the board.
- `frame add` persists that same box through `placeNext` in `src/server/board/scan.ts`, so the board and the CLI never place one frame in two places.

### Frame order is stacking order

- Reordering frames in the layers panel changes which draws on top, the way Figma and Paper do it, and leaves board positions alone
- Pages reorder in the pages list

### An element is addressed by document order plus the file's hash

- A pick names the element's index in document order and the hash of the file it was read from
- An edit against a hash the file no longer has is refused as stale, so a hand edit never lands on an element an agent has since moved
- The hash is SHA-256 hex over the file's raw bytes and the index follows the browser's `querySelectorAll('*')` order, because `edit`, the inspector, `selection`, notes, and `inspect` all read the same address and would drift apart on any other rule

### An edit splices bytes at parse5's offsets and never serializes

- `src/server/edit/` parses a frame with parse5 and writes new bytes only inside the edited attribute value or text span, so spacing, line breaks, and every other attribute keep the file's own bytes
- Serializing the tree and Bun's `HTMLRewriter` were dropped, because the first rewrites the file's formatting and the second is missing on Node and rewrites the whole start tag
- The writer parses its own output again and refuses `verify-failed` unless the tree differs only at the target, so an input the guards never met is refused rather than written corrupted

### Notes sit beside the frames, never inside them

- A note anchors to a frame, or to an element by its address
- Writing it into the frame would insert an element and shift every address after it
- An element anchor whose file hash has since changed falls back to the frame, so a note outlives the agent's rewrite

### Assets are the one path outside a page a frame may link

- A frame is otherwise self-contained in its page folder
- The project's `assets/` folder is the exception the check allows, and the only place a file shared between pages lives
- A stylesheet several pages use goes in `assets/`, never in one page folder the others link into, since that folder is renamed, moved, and deleted with its page

## Gotchas

- Every writer of `layout.json` takes a lock file beside it, merges its change, and replaces the file atomically, since two writers replacing the whole file each lose the other's edit
- Lock files `<record>.lock` and temp files `<record>.<pid>.<random>.tmp` sit beside the record they guard, so a reader or a watcher skips both, along with `.run/`
- A layout that does not parse is a defect to report, never an empty file to overwrite, since overwriting erases every box it held
- A frame that states a `head` must state a `body`, and every table must state its `tbody`, because the browser builds a missing one and shifts every address after it
- A folder whose name opens with a dot is reserved for files Frameboard generates.

### Edit writer

- The edit writer swaps a leading BOM for a space before parsing, because parse5 reads it as text and implies the wrappers, where a browser drops it
- An edit refuses a file whose bytes do not survive a UTF-8 round trip, because decoding rewrites a stray `0xFF` as `EF BF BD` far from the edited element
- An edit writes through a dot-named temporary file and rereads the hash before the rename, so a watcher skips the file and a write landing meanwhile is refused
