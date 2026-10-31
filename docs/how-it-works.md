---
title: How it works
description: The board folder, tokens, and themes, and what serve creates in a folder with no board
---

# How it works

How a board folder, its tokens, and its themes fit together, for anyone setting up a board for an agent.

In a folder with no board above it, `serve` creates `.frameboard/` there with one empty project and opens it at `http://127.0.0.1:4173` in a tab that can edit, where a first page asks for a project name, a screen size, and a look. A tab you open on that address yourself only reads, so run `frameboard open` for another that edits.

## Board folder

A board folder holds projects, a project holds pages, and a page holds frames.

- Each frame is one `.html` file beside a `layout.json` that records where it sits and the page's sections, which group frames by where they sit

## Tokens and themes

Frames share one look through a `tokens.css` in the board folder, which a project's own `tokens.css` overrides. The board's Theme tab tags each token Board or Project and edits a value in place into the sheet its tag names, as one undo step. A Board edit changes every project that does not override the token.

- `serve --tokens <path>` takes a sheet another tool manages instead, and the Theme tab leaves one outside the board folder read-only
- `project tokens <project> --accent <preset> --font <face>` writes a starter sheet where no sheet reaches the project, and refuses where one does
- The server puts the sheets and five faces, Geist, Geist Mono, Inter, Source Serif 4, and Caveat, ahead of each frame's own styles as it serves the frame
- The file on disk stays as written
- One toggle switches the board and every frame between light and dark
