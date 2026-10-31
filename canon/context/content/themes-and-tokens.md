---
title: Themes and tokens
description: Light and dark across the chrome and every frame, the token stylesheets, and the fonts served into frames
---

# Themes and tokens

## Overview

Owns how a frame gets its look from outside itself, being the token stylesheets injected into it, the theme it is shown in, and the fonts served to it. The board chrome's own look belongs to `canon/DESIGN.md`.

## Layout

### `src/server/look/`

Owns the head spliced into a served frame, the Theme tab's token table, and the static reads of an element's colors and flow that the inspector shows.

- The frame route splices one `<style data-frameboard>` first in `head`, importing the faces, then the board sheet, then the project sheet, so a frame's own stylesheet still wins
- The splice lands after a stated `head` start tag, else a stated `html` start tag, else the doctype, else byte 0 past a BOM, in the response alone, and the file on disk never changes
- The style carries the served bytes' hash as `data-hash`, so a live frame names the exact file an address was read from, beside the `data-rendered-at` stamp the note pin reads
- A self-removing script beside the style applies the `?theme=` query's theme through `setFrameTheme`, setting `data-theme`, `color-scheme`, and `.dark` or `.light`, so a live frame keeps only the style
- The token table reads each sheet with postcss into one row per custom property, light and dark, grouped as Color, Radius, Font, and Other
  - Each sheet carries its content hash, and each row says whether the project overrides a board value

`starter.ts` creates a project `tokens.css` from the presets in `src/shared/starter-tokens.ts`, being five accents with dark pairs and every face marked `startsLook`, so never Caveat. It refuses `tokens-exist` where a board, `--tokens`, or project sheet already reaches the project, so it never writes under a look somebody chose.

The routes a frame imports from sit in `src/server/routes/`, which `canon/context/board/server.md` owns.

- `/frameboard/faces/<family>/` serves each `FACES` face with its license and the woff2 files its sheet references, from `dist/faces/` at build or `node_modules/.cache/frameboard/faces` from source
- The build renames each face from the package's variable name, such as `Geist Variable`, to the plain family a frame names
- `/frameboard/tokens.css` serves the board sheet, being the `--tokens` sheet when `serve` was given one, else the board's `tokens.css`
- `/frames/<project>/tokens.css` serves the project's sheet, so its relative `url(assets/...)` resolves
- `GET /api/projects/<project>/tokens` answers the token table, naming a sheet that fails to parse rather than answering an empty table
  - `POST /api/tokens/edit` takes the project sheet's hash as the Theme tab read it, or null for none, and records one undo step per landed edit

### `src/server/look/token-edit.ts`

Writes one hand edit from the Theme tab into the project's `tokens.css`, creating it when the project has none, and never writes the board or `--tokens` sheet.

- It splices declarations inside the existing rules through postcss, so every byte outside the token's declarations stays as it was
  - It reads the written sheet back, refusing `invalid-edit` for a value such as an unclosed quote or bracket that would leave it unreadable
- A one-theme edit pins the other theme's old value under its rule when the new declaration would reach it, since a project `:root` ties a board dark rule and wins by coming later
  - The table never compares specificity, so a board `:root[data-theme=dark]` beats a project `[data-theme='dark']` in a frame while the tab shows the project's value
- A light or `:root` declaration lands ahead of every dark declaration of the token, in a new rule when need be, so dark still wins in dark
- A reset takes out every project declaration of the token and any rule it leaves empty, and refuses a token the board does not set
- The write goes through a temporary file and a rename after reading the sheet again, refusing a sheet whose hash moved, and takes no lock

### `src/client/theme/`

Owns the board-wide theme.

- The chrome follows the system theme until the developer picks one through the toolbar, the home header, or the avatar menu's System, Light, and Dark, and the choice persists under `frameboard.theme`
- An inline script in `index.html` sets `.dark` before the first paint, so a dark board never paints light first
- `flipFrame(ref)` flips one frame to the opposite theme until reload, and nothing draws a control for it until the frame menu lands
- A theme change runs the same `setFrameTheme` on each frame's root and sets `color-scheme` on its iframe, and never changes the iframe's `src`, so no frame reloads and no animation restarts

## Gotchas

- `serve --tokens <path>` resolves against the working folder and is saved in the address file as `tokens`, so the hook and `check` read that server's sheet, and a `reused: true` answer names it
- A change to the board, `--tokens`, or project sheet reloads and rechecks every frame it reaches, and a `--tokens` sheet outside the board gets its own watch feeding the same batches
- With no token sheet at all, frames render unstyled and the Theme tab says where tokens would go
- Never paste a token sheet into a frame, since the injected copy follows the project and a pasted one stops following it
- Canon's own frames name Noto Sans Mono and Excalifont, which no package ships, so they fall back until a project adds the face to its `assets/`
