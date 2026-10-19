---
title: Themes and tokens
description: Light and dark across the chrome and every frame, the token stylesheets, and the fonts served into frames
---

# Themes and tokens

## Overview

Owns how a frame gets its look from outside itself, being the token stylesheets injected into it, the theme it is shown in, and the fonts served to it. The board chrome's own look belongs to `canon/DESIGN.md`.

## Layout

### `src/server/look/`

Owns the head spliced into a served frame and the Theme tab's token table.

- The frame route splices one `<style data-frameboard>` first in `head`, importing the faces, then the board sheet, then the project sheet, so a frame's own stylesheet still wins
- The splice lands after a stated `head` start tag, else a stated `html` start tag, else the doctype, else byte 0 past a BOM, in the response alone, and the file on disk never changes
- A self-removing script beside the style shows the root in the `?theme=` query's theme through `setFrameTheme`, being `data-theme`, `color-scheme`, and the `.dark` or `.light` class, so the one element a live frame keeps is the style
- The token table reads each sheet with postcss into one row per custom property, light and dark, grouped as Color, Radius, Font, and Other

### `src/server/routes/`

Owns the URLs a frame imports from.

- `/frameboard/faces/<family>/` serves Geist, Geist Mono, and Caveat, copied from `@fontsource-variable` into `dist/faces/` at build with each license, and renamed from the package's `Geist Variable` to the plain family a frame names
- `/frameboard/tokens.css` serves the board sheet, being the `--tokens` sheet when `serve` was given one, else the board's `tokens.css`, and `/frames/<project>/tokens.css` serves the project's, so its relative `url(assets/...)` resolves
- `GET /api/projects/<project>/tokens` answers the token table, naming a sheet that fails to parse rather than answering an empty table

### `src/client/theme/`

Owns the board-wide theme.

- The chrome follows the system theme until the developer picks one through the toolbar, the home header, or the avatar menu's System, Light, and Dark, and the choice persists under `frameboard.theme`
- An inline script in `index.html` sets `.dark` before the first paint, so a dark board never paints light first
- `flipFrame(ref)` flips one frame to the opposite theme until reload, and nothing draws a control for it until the frame menu lands
- A theme change runs the same `setFrameTheme` on each frame's root and sets `color-scheme` on its iframe, and never changes the iframe's `src`, so no frame reloads and no animation restarts

## Gotchas

- `serve --tokens <path>` resolves against the working folder and lands in the address file as `tokens`, so the hook and `check` read the same sheet while that server runs, and a second `serve` reports the running server's sheet beside `reused: true`
- A change to the board sheet, the `--tokens` sheet, or a project's sheet reloads and rechecks every frame it reaches, and a `--tokens` sheet outside the board gets a watch of its own feeding the same batches
- With no token sheet at all, frames render unstyled and the Theme tab says where tokens would go
- Never paste a token sheet into a frame, since the injected copy follows the project and a pasted one stops following it
- Canon's own frames name Noto Sans Mono and Excalifont, which no package ships, so they fall back until a project adds the face to its `assets/`
