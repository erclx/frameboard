---
title: Content model
description: Board folders, projects, pages, frames, layout files, assets, and how an element is addressed
---

# Content model

## Overview

Owns what sits on disk and how Frameboard reads it, being the board folder, the projects, pages, and frames inside it, each page's layout file, each project's assets, and the address of one element inside a frame. Everything else in the tool reads and writes through this model.

## Layout

- `src/shared/` owns the types and schemas for the layout file and every record the CLI and server exchange
- `src/server/` owns reading, watching, and writing the board folder

### The shape on disk

- A board folder is whatever one server shows, sitting in a repository as `.frameboard/`, standalone such as `~/frameboard/`, or at any path through `--root`
- A project is a folder in the board folder, a page is a folder in a project, and a frame is one `.html` file in a page
- Each page holds one `layout.json` beside its frames, keyed by frame name, with each frame's x, y, width, and height, its stacking order, and whether it is hidden or locked
- Each page holds a `notes.json` beside its layout, holding the developer's pinned notes for the agent
- Each project holds an `assets/` folder for images, GIFs, video, SVG, fonts, and shared stylesheets that any of its frames may use

## Decisions

### A project is not a repository

- One repository's board folder holds several projects, such as a web app design and a brainstorm
- The home view and every verb take a project by name inside one board folder

### Layout sits beside the frames, never inside them

- Moving or resizing a frame writes `layout.json` alone, so a move never rewrites markup and never collides with an agent rewriting the file

### Frame order is stacking order

- Reordering frames in the layers panel changes which draws on top, the way Figma and Paper do it, and leaves board positions alone
- Pages reorder in the pages list

### An element is addressed by document order plus the file's hash

- A pick names the element's index in document order and the hash of the file it was read from
- An edit against a hash the file no longer has is refused as stale, so a hand edit never lands on an element an agent has since moved

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
- A layout that does not parse is a defect to report, never an empty file to overwrite, since overwriting erases every box it held
- A frame that states a `head` must state a `body`, and every table must state its `tbody`, because the browser builds a missing one and shifts every address after it
- A folder whose name opens with a dot is reserved for files Frameboard generates.
