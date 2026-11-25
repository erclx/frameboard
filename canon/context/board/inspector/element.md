---
title: Inspector element sections
description: An element's sections in the inspector, being layout, size, position, type, rotation, paint, and text, and what a hand edit writes into a frame
---

# Inspector element sections

## Overview

Owns the sections the inspector shows for a selected element and the bar each new control clears, from Layout and Position through type, rotation, and paint, plus what a hand edit writes into a frame.

The color picker the paint rows open is in `canon/context/board/inspector/color-picker.md`, and the panel around them, its tabs, and the number field in `canon/context/board/inspector/panel.md`.

## Layout

### `src/client/board/inspector/element/`

Owns an element's sections, from Layout, Size, and Position, or a model's Transform and Camera, to type, rotation, paint, Video, and a Present row to the Slides tab, each read from the live node and the static cascade and writing its `style`, an attribute, or its text. A write goes through `src/server/routes/edit.ts` as one undo step.

- A token pick writes `var(--token)`, so it follows the theme, and over an inline `background` or `border` holding its part a paint longhand rewrites that part
- Fill opacity below 100 percent writes `color-mix(in srgb, var(--token) N%, transparent)` over a token and an 8-digit hex over a raw hex, so children keep their own opacity
- Colors and shadows read from the static cascade the checks use, and only a token sheet's name reads as a token, a frame's own reading as its chain's first
- Family lists no face from a project's `assets/` folder, since nothing reads the `@font-face` rules there
- Absolute writes `position: relative` on a static parent other than `body` in the same undo step, refusing `reanchors-descendant` when that parent anchors another element above

## Gotchas

- A hand edit reloads its frame unless it was `previewed`, as a drop, a corner resize, Keep values, a Video file switch, or a model's staging is, and the selection follows the hash the write answers
- A field committing on blur drops a browser undo reaching it unfocused, through `stray-history.ts`, since a press falling through the board undoes the last field edited
- A place reads the parent's position from the static cascade, which misses a sheet a load cannot read, so a miss writes `relative` anyway and one undo restores it
- An element its `rotate` turns or its transform tilts in 3D takes no corner resize and draws no marks, and a rotation or tilt preview lags the outline until the write reloads the frame
- Hug under a block parent writes `width: fit-content`, and Fill as `flex: 1 1 0` can shrink a child below its content width under `overflow: hidden`
