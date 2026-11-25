---
title: Themes and tokens
description: Light and dark across the chrome and every frame, the token stylesheets, and the fonts served into frames
---

# Themes and tokens

## Overview

Owns how a frame gets its look from outside itself, being the token stylesheets injected into it, the theme it is shown in, and the fonts served to it. The board chrome's own look belongs to `canon/DESIGN.md`.

## Layout

### `src/server/look/`

Owns the head spliced into a served frame, the Theme tab's token table, and the static color and flow reads the inspector shows, served through the face, sheet, and token routes in `src/server/routes/`, which `canon/context/board/server.md` owns. `starter.ts` writes a project `tokens.css`, refusing `tokens-exist` where a sheet reaches it.

- One `<style data-frameboard>` goes first in `head`, importing the faces, the project's font sheet, the board sheet, the project sheet, then the frame's kit sheets, so its own stylesheet still wins
- It lands after a stated `head` start tag, else `html`, else the doctype, else byte 0 past a BOM, in the response alone, and the file on disk never changes
- The style carries the served bytes' hash as `data-hash`, so a live frame names the exact file an address was read from
- A self-removing script applies the `?theme=` query through `setFrameTheme`, setting `data-theme`, `color-scheme`, and `.dark` or `.light`, so a live frame keeps only the style
- The rows of a `--tokens` sheet outside the board folder stay read-only, and an edit's `hash` is the named sheet's, or null for a project with no sheet of its own

### `src/server/fonts/`

Owns the fonts a project installed, read from each `assets/fonts/<id>/font.license.json`, which tells an installed family from a folder filled by hand. The save that writes one is in `canon/context/agent/sourcing.md`.

- The frame route answers `/frames/<project>/fonts.css` from those records on each request, its file addresses relative so they hold behind the phone link's prefix
- `font-missing` reads what the browser loaded and never a record, so an installed family whose file fails to load still refuses
- A record is checked in full before it reaches the sheet, since a cloned board may carry one written by hand, and a folder whose record fails reads as not installed
- `remove.ts` takes the folder out and never touches a frame, and `usage.ts` names the frames whose text resolves to the family first, the one `font-missing` judges

### `src/server/kits/`

Owns design kits, each a folder of plain files being `kit.json`, a `tokens.css` with a dark block, a `kit.css` of `kit-` classes, a `kit.md` an agent reads, and a `kit` page of sample frames. Clean, Sketch, and Wireframe sit in `shipped/`, copied to `dist/kits/` at build.

- `install.ts` copies a kit's folder into the project's `assets/kits/<kit>/`, touching no sheet or page, refusing `name-taken` over a held kit or, for the CLI's `--replace`, swapping in a staged copy
- `remove.ts` takes that folder out and clears the kit from every frame naming it under every page's lock, and `project.ts` lists a project's kits with the frames naming each
- `save.ts` writes a project's look into the board's `.kits/`, a dot folder so home never lists it, taking whichever sheet reaches the project and an `assets/kit/` only where it holds `kit.json`
- `list.ts` answers the shipped kits in picker order, then the board's own, each with its preview frame's laid-out size
- Sketch's rough outline is an SVG filter given as a data URL on a `::before` layer, since the kit sheet reaches a frame holding no SVG of its own, and only that layer takes it so text stays crisp

### `src/server/look/token-edit.ts`

Writes one hand edit from the Theme tab into the project's `tokens.css`, creating it when the project has none, or into the board's sheet, which every project without an override follows. The route never writes a `--tokens` sheet outside the board folder, since it belongs to whatever handed it over.

- It splices declarations inside the existing rules through postcss, keeping every other byte, and reads the sheet back, refusing `invalid-edit` for a value that would leave it unreadable
- A one-theme edit pins the other theme's old value under its rule when the new declaration would reach it, since a project `:root` ties a board dark rule and wins by coming later
- The table never compares specificity, so a board `:root[data-theme=dark]` beats a project `[data-theme='dark']` in a frame while the tab shows the project's value
- A light declaration lands ahead of every dark one of the token, and a reset takes out every project declaration and empty rule, refusing a token the board does not set
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
