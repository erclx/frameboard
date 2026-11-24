---
title: How it works
description: The board folder, tokens, and themes, and what serve creates in a folder with no board
---

# How it works

How a board folder, its tokens, and its themes fit together, for anyone setting up a board for an agent.

In a folder with no board above it, `serve` creates `.frameboard/` there with one empty project and opens it at `http://127.0.0.1:4173` in a tab that can edit, where a first page asks for a project name, a screen size, and a look.

## Edit access

A tab you open on the board's address yourself only reads, so run `frameboard open` for another that edits. Its link works once, for two minutes or the `--ttl <minutes>` you give it, up to 60.

Start with `serve --edit-button` to give a tab that only reads an Edit button, which asks once and then edits with no terminal. It is off by default, since any program on your machine can then do what a tab that edits does:

- Write to the board
- Send notes to a listening session, and start one under `FRAMEBOARD_DISPATCH`
- Generate images on the provider keys in `serve`'s environment, which can cost money
- Open the phone link, which puts a project's frames on the local network

What a program was granted outlives the flag. Delete `.run/board-key.json` in the board folder and restart `serve` to take it back, and every tab that edits reads until its next link.

## Board folder

A board folder holds projects, a project holds pages, and a page holds frames.

- Each frame is one `.html` file beside a `layout.json` that records where it sits and the page's sections, which group frames by where they sit
- A project's `project.json` lists its pages in order, and may name the `group` home files it under and mark it `archived`, so a folder never moves a project on disk

## Tokens and themes

Frames share one look through a `tokens.css` in the board folder, which a project's own `tokens.css` overrides. The board's Theme tab tags each token Board or Project and edits a value in place into the sheet its tag names, as one undo step. A Board edit changes every project that does not override the token.

- `serve --tokens <path>` takes a sheet another tool manages instead, and the Theme tab leaves one outside the board folder read-only
- `project tokens <project> --accent <preset> --font <face>` writes a starter sheet where no sheet reaches the project, and refuses where one does
- The server puts the sheets, five faces, and the project's installed fonts ahead of each frame's own styles as it serves the frame, leaving the file as written
- The five are Geist, Geist Mono, Inter, Source Serif 4, and Caveat, and `font find` or the Theme tab's Find a font installs others, which the inspector's family picker then lists
- One toggle switches the board and every frame between light and dark

## Design kits

A kit gives chosen frames a whole look at once, being its tokens, a stylesheet of drawn parts, a note for the agent, and sample frames. Frameboard ships Clean, Sketch, and Wireframe, and a project holds several kits beside its own `tokens.css`. The Theme tab adds and removes them.

- `frameboard kit add <project> <kit>` copies a kit into the project's `assets/kits/<kit>/`, and `--from <folder>` copies a kit folder on disk
- `frameboard frame kit <frame-ref> <kit>` sets the kit one frame draws with, and `none` in place of the kit takes it off. A frame naming no kit keeps the project's own look.
- The server adds a kit's tokens and stylesheet after the token sheets, to the frames naming that kit alone
- `frameboard kit remove <project> <kit>` deletes the kit's folder and takes it off every frame naming it
- Save as kit on a project's menu, or `frameboard kit save`, keeps its look in the board's `.kits/` folder for the other projects
