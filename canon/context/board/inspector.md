---
title: Inspector
description: The right panel's controls for a selected frame, several frames, or an element, the bar a new control clears, and what a hand edit writes
---

# Inspector

## Overview

Owns the controls the developer edits a selected frame or element with, the bar a new control has to clear, and what a hand edit writes into a frame.

## Layout

### `src/client/board/inspector/`

Owns the right panel, under a header of the avatar and the zoom level, and its controls. A control joins it only when the developer's edit beats asking the agent and leaves layout alone.

- **Frame and several frames:** name, position, and size with Fit height inside H, and for several the shared position and size with an Arrange button per align and distribute key.
- **Frame fill:** one frame alone adds the element Fill row, writing its `body`'s `background-color` as an element edit. A file stating no `body` refuses it.
- **Preview:** a row under the size fields shows every selected frame at the phone, tablet, or desktop width or a scrubbed one, with End preview. It writes nothing, and W keeps reading the stored width.
- **Appearance and typography:** captioned opacity and corner radius, then size, weight, line height, letter spacing, and alignment, plus its text when it holds text only.
- **Type spacing:** line height and letter spacing write px. A `normal` line height reads Auto and steps from 1.2 times the size. Layers renames an element, so no name field shows here.
- **Text:** Enter or a blur applies it and Esc cancels, with the keys hinted while the field has focus. A newline becomes a space, since a `<br>` would end the text-only state that shows the field.
- **Kept text:** text an agent's write refused stays as a draft by frame and index while the frame's element count held, and its toast offers Copy text either way.
- **Fill:** color through the board's picker, opened on Custom from the swatch and on Tokens from the chip, and fill opacity. On an element holding text alone it is the text color, as in Figma.
- **Stroke and shadow:** the border color through the same row, and one of the project's shadow tokens or none, writing `box-shadow: none`, in a menu at its row's width
- **Remove:** a minus on the fill and stroke rows drops the element's own paint, and over a rule's writes `transparent` or `border-style: none`. A rule's text color has none.
- **What remove drops:** `color` on a text-only element, `background-color`, the whole `background` only where the shorthand states the fill, or `border` with its longhands
- **Selection colors:** the colors the frame, the frames, or the element's subtree use, with token names, and a flag on raw values, read-only

The Frame section stays above an element's sections and hides its name row while an element is selected. One frame with findings lists them under Checks below it, the list its label's badge opens. Stroke's `+` writes `border: 1px solid var(--border)`, else the first color token.

- Under the Frame tool it lists the three presets as radio rows in place of the selection, and the chosen one is what the next canvas click places
- One selected frame's name renames in place on a click, through the same rename the layers row runs

Every number is `number-field.tsx`, on base-ui's `NumberField`. ArrowUp and ArrowDown step it, by ten with Shift, and a drag on its prefix zone or caption scrubs it. A weight steps by 100, and a step on a `Mixed` frame value moves each frame by the step from its own.

- The prefix sits in a full-height zone at least 24px wide, and a fill or stroke opacity with no room for one scrubs from a drag on the number while a click still types
- A step or a scrub previews first, a frame at its pending box and an element through an inline style on its live node, and writes once on the arrow's keyup or the scrub's release
- Esc during either puts the stored value back and writes nothing, and a refused write puts back the preview too
- The picker under `element/color-picker/` previews a custom color and writes it once as it closes or on Enter in its hex field
- Esc in the picker writes nothing, and a token swatch writes at once and closes it

A hand edit's write goes through `src/server/routes/edit.ts` into the edit writer, both in folders other entries own.

- A hand edit writes the element's inline style, one attribute, or its text and nothing else, through `POST /api/frames/edit`, which records one undo step
- A token pick writes `var(--token)`, so it keeps following the theme, and a raw value is marked raw
- Fill opacity below 100 percent writes `color-mix(in srgb, var(--token) N%, transparent)` over a token and an 8-digit hex over a raw hex, so the element's text and children keep their own opacity
- Colors and shadows read from the static cascade the checks use, given a property set, so a token is named exactly and a raw value that matches a token is still flagged

## Gotchas

- Element position, width, height, padding, flex, gap, border width, and font family have no control. A placement tool sets a new element's place once, at the click.
- Each of those is a layout call a prompt makes better, or a number that fights the layout when set by hand
- Each hand edit reloads its frame, and the element stays selected through the hash the write answers, since a reload can land before that answer or lag a later one
- A field committing on blur drops a browser undo reaching it unfocused, through `stray-history.ts`, since a press falling through the board, such as on a toast, undoes the last field edited

The number field works around two base-ui behaviors.

- base-ui commits a keyboard step on every press, so the field steps on its own keys and takes base-ui's commit only for a scrub release
- base-ui reformats a typed number only on blur, so Enter blurs the field and focuses it again, else a refused value stays shown
