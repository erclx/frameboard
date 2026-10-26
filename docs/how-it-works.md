# How it works

How a board folder, its tokens, and its themes fit together, for anyone setting up a board for an agent.

In a folder with no board above it, `serve` creates `.frameboard/` there with one empty project and opens it at `http://127.0.0.1:4173` in a tab that can edit, where a first page asks for a project name, a screen size, and a look. A tab you open on that address yourself only reads, so run `frameboard open` for another that edits.

## Board folder

A board folder holds projects, a project holds pages, and a page holds frames.

- Each frame is one `.html` file beside a `layout.json` that records where it sits

## Tokens and themes

Frames share one look through a `tokens.css` in the board folder, which a project's own `tokens.css` overrides.

- `serve --tokens <path>` takes a sheet another tool manages instead
- `project tokens <project> --accent <preset> --font <face>` writes a starter sheet where no sheet reaches the project, and refuses where one does
- The server puts the sheets and three faces, Geist, Geist Mono, and Caveat, ahead of each frame's own styles as it serves the frame
- The file on disk stays as written
- One toggle switches the board and every frame between light and dark
