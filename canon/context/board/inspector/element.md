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

Owns an element's sections, read from the live node and the static cascade, and the writes each one sends. A hand edit's write goes through `src/server/routes/edit.ts` into the edit writer, both in folders other entries own, as one `POST /api/frames/edit` and one undo step.

| Section     | What it reads and writes                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Layout      | Block, Vertical, Horizontal, Wrap, or Grid off computed `display`, writing only differing declarations, no track |
| Gap         | `gap` in px, Auto as `justify-content: space-between`, off dropping its own value or writing `flex-start`        |
| Alignment   | A 3×3 grid writing `justify-content` and `align-items` as one edit, padding as longhand pairs or per side        |
| Auto layout | Shift+A wraps in document order, the gap being neighbor space less both margins, 0 where margins collapsed       |
| Size        | W and H in px as Fixed, with Hug and Fill, Fill under a flex parent alone as `flex: 1 1 0` and `align-self`      |
| Position    | Absolute through `POST /api/frames/place`, then X and Y as `left` and `top`, In flow dropping what it wrote      |
| Rotation    | `rotate` normalized to (-180, 180] and flips as a `scale` pair, never `transform`, off for 3D or a translate     |
| Typography  | Family from the cascade's `fontFamily` token, else the stack's first face, weights the face ships, px spacing    |
| Text        | Enter or blur applies and Esc cancels, a pasted newline becoming a space unless the style shows breaks           |
| Paint       | Fill, stroke with a `W` field, and a shadow token, a minus dropping its own paint or writing `transparent`       |
| Step        | `step.tsx` writes `data-step`, `data-step-effect`, and `data-step-start` as one edit                             |
| Several     | `several.tsx` shows `Mixed` and `1 of 3`, and its edit writes only the elements holding the section              |
| Video       | Play, time, sound, and scrub on the live page, and switches setting one attribute, audio showing no Controls     |

These rules hold across every section's write.

- A token pick writes `var(--token)`, so it follows the theme, and over an inline `background` or `border` holding its part a paint longhand rewrites that part
- Fill opacity below 100 percent writes `color-mix(in srgb, var(--token) N%, transparent)` over a token and an 8-digit hex over a raw hex, so children keep their own opacity
- Colors and shadows read from the static cascade the checks use, so a token is named exactly and a raw value equal to a token is not named as one
- Only a token sheet's name reads as a token, and a frame's own name reads as the first token its chain reaches, as the cascade sees no `data-theme`
- Absolute writes `position: relative` on a static parent other than `body` in the same undo step, refusing `reanchors-descendant` when that parent anchors another element above

## Gotchas

- Each hand edit reloads its frame, and the element stays selected through the hash the write answers, since a reload can land before that answer or lag a later one
- A field committing on blur drops a browser undo reaching it unfocused, through `stray-history.ts`, since a press falling through the board undoes the last field edited
- A place reads the parent's position from the static cascade, which misses a sheet a load cannot read, so a miss writes `relative` anyway and one undo restores it
- An element whose `rotate` turns it takes no corner resize and draws no marks, and a rotation preview lags the outline until the write reloads the frame
- Hug under a block parent writes `width: fit-content`, and Fill as `flex: 1 1 0` can shrink a child below its content width under `overflow: hidden`
