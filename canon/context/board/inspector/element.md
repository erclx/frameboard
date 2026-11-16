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

Owns an element's sections, read from the live node and the static cascade, and the writes each one sends.

- **Step:** `element/step.tsx` opens one element's Slides with Appears on step, Effect, and Start, writing `data-step`, `data-step-effect`, and `data-step-start` as one edit
- **Several elements:** `element/several.tsx` shows `Mixed` where values differ and `1 of 3` on a section only some hold, whose edit writes those alone, as one write and one undo step.
- **Arrange for elements:** several Absolute elements add the frames' Arrange row, which stands disabled with its reason while one sits in the flow
- **Video:** a `<video>` or `<audio>` opens the element sections with play, the time, sound, and a scrub track that act on the live page alone
  - Controls, Autoplay, Loop, and Muted in the file follow, each a switch that sets one attribute or drops it
  - An audio shows no Controls switch, since one without `controls` draws nothing
- **Layout:** sits first among an element's other sections, reading Block, Vertical, Horizontal, Wrap, or Grid off the computed `display`
- **Flow pick:** writes only the declarations whose computed value differs. Grid writes `display` alone and never a track.
- **Use auto layout:** the Layout header's icon button runs the wrap action behind Shift+A on one element or several siblings, and stays focusable while disabled so its tooltip gives the reason
- **Wrap order:** a wrap keeps its members in document order, never screen order, so an element placed left of an earlier one lands after it in a row
- **Wrap gap:** the gap is the space between neighbors less both margins, which flex keeps apart, and margins that collapsed in a block parent leave it at 0
- **Add flow:** a block's `+` writes `display: flex` and `flex-direction: column`, and its children keep their margins
- **Rule caption:** names the selector of a flow rule several elements share, with its count from the static cascade. An unread sheet names no rule.
- **Gap:** writes `gap` in px. Auto gap writes `justify-content: space-between`, and off drops the element's own value or writes `flex-start`.
- **Alignment:** the 3×3 grid writes `justify-content` and `align-items` as one edit, its rows and columns swapping for a column
- **Padding:** horizontal and vertical fields write their two longhands as one edit, and a per-side toggle opens a field per side
- **Size:** W and H write px as Fixed, each with a Fixed, Hug, or Fill menu read from the static cascade
- **Fill:** offered only under a flex parent, writing `flex: 1 1 0` along its axis and `align-self: stretch` across it
- **Appearance and typography:** captioned opacity and corner radius, then family, weight, size, spacing, and alignment with justify, plus its text when it holds text only. Layers renames an element.
- **Type details:** a settings button ending the alignment row opens decoration, case, one-line truncate, and wrap style. Truncate writes its three declarations as one edit.
- **Rotation:** a degrees field writes `rotate`, clockwise and normalized to (-180, 180], beside Rotate 90°, Flip horizontal, and Flip vertical
- **Flip:** writes `scale` as an x and y pair, so a rule's uniform scale survives it
- **What rotation leaves:** neither writes `transform`. A value equal to what a rule gives under the element's own declaration drops it. The field reads `rotate` alone.
- **Rotation off:** for a 3D value, and where the computed `transform` translates, since `rotate` composes ahead of it and swings the element away. A tooltip says why.
- **Position:** an In flow and Absolute toggle above Appearance. Absolute places the element where it renders through `POST /api/frames/place`, and its X and Y then write `left` and `top`.
- **Placing:** the place writes `position: absolute` with pixel offsets, and `position: relative` on a static parent other than `body` in the same undo step
- **Placed size:** the place writes the rendered size on an axis no rule sizes, and none on an element holding text alone, which hugs its words from where they start unless a length sizes it
- **Back in flow:** drops `left` and `top`, and `position` or writes `static` over a rule's. It drops each size this tab's placement wrote that the element still holds, and a reload forgets them.
- **Family and weight:** menus. Family lists the font tokens holding a stack, then the served faces, each in its own face. Weight names only the weights the element's face ships.
- **Reading the family:** the computed stack never names a token, so Family takes the token from the static cascade's `fontFamily`, else the face the stack starts with, and reads any other as written
- **Unlisted faces:** Family lists no face from a project's `assets/` folder, since nothing reads the `@font-face` rules there
- **Icon names:** an align button or a number field with an icon prefix names itself in a tooltip on hover and keyboard focus
- **Type spacing:** line height and letter spacing write px. A `normal` line height reads Auto and steps from 1.2 times the size.
- **Text:** Enter or a blur applies it and Esc cancels, with the keys hinted while the field has focus. The field adds no line.
- **Text breaks:** a pasted newline becomes a space, unless the element's style shows breaks as lines, as a text given lines on the canvas does.
- **Kept text:** text an agent's write refused stays as a draft by frame and index while the frame's element count held, and its toast offers Copy text either way.
- **Fill:** color through the board's picker, opened on Custom from the swatch and on Tokens from the chip, and fill opacity. On an element holding text alone it is the text color, as in Figma.
- **Stroke:** the border color through the same row, and a `W` field after it writing `border-width` from 1px, `Mixed` over uneven sides
- **Shadow:** one of the project's shadow tokens or none, writing `box-shadow: none`, in a menu at its row's width
- **Remove:** a minus on the fill and stroke rows drops the element's own paint, and over a rule's writes `transparent` or `border-style: none`. A rule's text color has none.
- **What remove drops:** `color` on a text-only element, `background-color`, the whole `background` only where the shorthand states the fill, or `border` with its longhands

A hand edit's write goes through `src/server/routes/edit.ts` into the edit writer, both in folders other entries own.

- A hand edit writes the element's inline style, one attribute, or its text, or drops one attribute, through `POST /api/frames/edit`, which records one undo step
- A token pick writes `var(--token)`, so it keeps following the theme, and a raw value carries no mark. Over an inline `background` or `border` holding its part, a paint longhand rewrites that part.
- Fill opacity below 100 percent writes `color-mix(in srgb, var(--token) N%, transparent)` over a token and an 8-digit hex over a raw hex, so the element's text and children keep their own opacity
- Colors and shadows read from the static cascade the checks use, given a property set, so a token is named exactly and a raw value equal to a token is not named as one
- Only a token sheet's name reads as a token. A frame's own name reads as the first token its chain reaches, else its light value, as the cascade sees no `data-theme`.

## Gotchas

- Element vertical text alignment has no control. A placement tool sets a new element's place once.
- A Rectangle or Ellipse drag sets a new shape's size. A drag on the selected element moves it to another gap, or an Absolute one's offsets.
- Each hand edit reloads its frame, and the element stays selected through the hash the write answers, since a reload can land before that answer or lag a later one
- A field committing on blur drops a browser undo reaching it unfocused, through `stray-history.ts`, since a press falling through the board, such as on a toast, undoes the last field edited

A corner drag writes one `styles` edit, and Esc writes nothing.

- Text takes width alone, so its height keeps hugging, and a shape, an image, or a video takes width and height
- A container takes each side the drag moved, set Fixed as the Size row sets it, so a Fill child drops its flex
- A write takes a `content-box` element's padding and border off the drawn size, so the outline lands where the drag ends
- Shift holds a shape's drawn ratio and media's decoded one. Inline text, an inline container, a rotated element, or a divider takes no corner drag and draws no marks.
- The chip reads `Hug` for text with no height on its own `style`, so a height a rule states also reads as `Hug`

A place reads the parent's position from the static cascade.

- A static parent holding another absolute element anchored above it refuses `reanchors-descendant`
- The cascade misses a sheet a load cannot read, so a miss writes `relative` anyway, and one undo restores it

The Layout section leaves some sizing to the browser.

- Min and max sizes and clipping have no control, and a grid's tracks are never written
- Hug under a block parent writes `width: fit-content`, since a block child's auto width spans its parent and reads as no mode
- Fill as `flex: 1 1 0` can shrink a child below its content width under `overflow: hidden`, measured on 18 of 10,132 flex children across the design board

Rotation leaves two gaps in what the canvas draws.

- An element whose `rotate` turns it takes no corner resize and draws no marks, since its outline is the turned bounding box
- A rotation preview fires no resize or load, so the selection outline lags a scrub until the write reloads the frame
