---
title: Themes and tokens
description: Light and dark across the chrome and every frame, the token stylesheets, and the fonts served into frames
---

# Themes and tokens

## Overview

Owns how a frame gets its look from outside itself, being the token stylesheets injected into it, the theme it is shown in, and the fonts served to it. The board chrome's own look belongs to `canon/DESIGN.md`.

## Layout

### `src/server/`

Owns token resolution, injection, and font serving.

- A board folder's `tokens.css` is the default and a project's own overrides it, with `--tokens <path>` pointing at a sheet another tool manages
- Both are injected first in every frame's `head`, so a frame's own stylesheet still wins
- A text face, a mono face, and a hand-drawn face are served into every frame, so a frame renders the same on the board and in a capture, and a project adds faces in its `assets/`

### `src/client/`

Owns the theme toggle and the per-frame override.

- The chrome follows the system theme until the developer toggles it, and the choice persists
- Frames follow the chrome, and a switch on a frame's label flips that frame alone until reload
- The board sets `data-theme` and `color-scheme` on each frame's root, and `check` reports a frame defining only one theme

## Gotchas

- With no token sheet at all, frames render unstyled and the Theme tab says where tokens would go
- Never paste a token sheet into a frame, since the injected copy follows the project and a pasted one stops following it
