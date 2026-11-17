---
title: Inspector
description: The right panel's tabs and frame sections, Slides and Export, selection colors, and the number field every control shares
---

# Inspector

## Overview

Owns the right panel's shell and its frame-level controls, being the tabs, the frame sections, Slides, Export, selection colors, and the number field every section steps and scrubs with. An element's own sections, and what a hand edit writes into a frame, are in `canon/context/board/inspector/element.md`.

## Layout

### `src/client/board/inspector/`

Owns the right panel, under a header of the avatar and the zoom level, and its controls. Every write below goes out as one undo step, and the controls that act on the live frame write nothing to it.

| Control          | Behavior                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Tabs             | `tabs.tsx` splits Design, Slides, and Export, and `tab-store.ts` keeps the pick for the page's life alone   |
| Frame size       | `Frame ⌄` names the matched preset, `Custom`, or `Mixed`, and a pick sets W and H in one write              |
| Frame fill       | One frame alone writes its `body`'s `background-color` as an element edit, refused where no `body` stands   |
| Height           | Fixed, Fit, or Scroll through `POST /api/frame/height`, a refusal putting the stored mode back              |
| Show device      | The device each width picks through `POST /api/frame/device`, No device under 320                           |
| Preview          | A preset or scrubbed width that writes nothing, a preset pressed while every shown width fits its range     |
| Linked widths    | Also shows at chips, written whole through `POST /api/frame/widths`, refusing `stale-layout` on a drift     |
| Slides           | This slide through `POST /api/frame/transition`, and Page's three picks through `POST /api/page/transition` |
| Export           | Scale, theme, Name, and one line per file, rendering every theme before any file downloads                  |
| Filmstrip        | 2 to 12 moments that fit the screenshot limit, disabled for a frame that repeats forever                    |
| Motion           | Play, the time, and a scrub track that move the live page in this tab alone                                 |
| Phone link       | Open on a phone starts the link through `POST /api/preview` and ends it by token on close                   |
| Selection colors | Raw rows first, Replace through `POST /api/frames/recolor`, and `Use <token>` on an exact opaque match      |
| Select           | Every element `uses` names, stating or inheriting the color, never `body`, within one frame alone           |

These hold across the panel's controls.

- An element selected inside a frame shows that frame as one row under the tab strip, and the Frame tool lists its presets and devices there as radio rows
- `label-tip.tsx` keeps a label's sentence in a hidden node the control names in `aria-describedby`, shown on hover and keyboard focus
- Stroke's `+` writes `border: 1px solid var(--border)`, else the first color token, else `#808080` in a project naming none
- Every number is `number-field.tsx` on base-ui's `NumberField`, stepping by one or ten with Shift and scrubbing from a prefix zone at least 24px wide
- A step or a scrub previews first and writes once on keyup or release, Esc puts the stored value back, and a `Mixed` step moves each frame from its own value

## Gotchas

- base-ui commits a keyboard step on every press, so the number field steps on its own keys and takes base-ui's commit only for a scrub release
- base-ui reformats a typed number only on blur, so Enter blurs the field and focuses it again, else a refused value stays shown
