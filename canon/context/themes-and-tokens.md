---
title: Themes and tokens
description: Light and dark across the chrome and every frame, the token stylesheets, and the fonts served into frames
---

# Themes and tokens

## Overview

Owns how a frame gets its look from outside itself, being the token stylesheets injected into it, the theme it is shown in, and the fonts served to it. The board chrome's own look belongs to `canon/DESIGN.md`.

## Layout

- `src/server/` owns token resolution, injection, and font serving
- `src/client/` owns the theme toggle and the per-frame override

## Decisions

### One theme toggle, with a per-frame override

The chrome follows the system theme until the developer toggles it, and the choice persists. Frames follow the chrome. A switch on a frame's label flips that frame alone until reload. Two independent toggles would leave the board in a mixed state.

### Every frame carries both themes

The board sets `data-theme` and `color-scheme` on each frame's root. A token sheet defines dark and light values, a frame setting its own colors does too, and `check` reports a frame defining one.

### Tokens cascade board, then project, then frame

The board folder's `tokens.css` is the default. A project's own `tokens.css` overrides it for that project. `--tokens <path>` points at a stylesheet elsewhere, which is how another tool hands over a design system it manages. Both are injected first in every frame's `head`, so a frame's own stylesheet still wins.

### Frameboard bundles three faces

A text face, a mono face, and a hand-drawn face are served into every frame, so a frame renders the same on the board and in a capture with no setup. A project adds its own faces in its `assets/` folder.

## Gotchas

- With no token sheet at all, frames render unstyled and the Theme tab says where tokens would go.
- Never paste a token sheet into a frame. The injected copy follows the project, and a pasted one stops following it.
