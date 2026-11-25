---
title: Inspector
description: The right panel's tabs and frame sections, Slides and Export, selection colors, and the number field every control shares
---

# Inspector

## Overview

Owns the right panel's shell and its frame-level controls, being the tabs, the frame sections, Slides, Export, selection colors, and the number field every section steps and scrubs with. An element's own sections, and what a hand edit writes into a frame, are in `canon/context/board/inspector/element.md`.

## Layout

### `src/client/board/inspector/`

Owns the right panel under the avatar and zoom header, its Design, Slides, and Export tabs, and the frame controls for size, fill, height, device, clipping, preview, linked widths, transitions, export, motion, the phone link, and selection colors. Each write is one undo step, and a control acting on the live frame writes nothing to it.

- An element selected inside a frame shows that frame as one row under the tab strip, and the Frame tool lists its presets and devices there as radio rows
- `label-tip.tsx` keeps a label's sentence in a hidden node the control names in `aria-describedby`, shown on hover and keyboard focus
- Stroke's `+` writes `border: 1px solid var(--border)`, else the first color token, else `#808080` in a project naming none
- Every number is `number-field.tsx` on base-ui's `NumberField`, stepping by one or ten with Shift and scrubbing from a prefix zone at least 24px wide
- A step or a scrub previews first and writes once on keyup or release, Esc puts the stored value back, and a `Mixed` step moves each frame from its own value

## Gotchas

- base-ui commits a keyboard step on every press, so the number field steps on its own keys and takes base-ui's commit only for a scrub release
- base-ui reformats a typed number only on blur, so Enter blurs the field and focuses it again, else a refused value stays shown
- A tab's body scrolls itself under the header, the tabs, and the crumb, and is `relative`, else a tip's hidden node inside it stretches the panel
