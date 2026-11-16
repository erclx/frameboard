---
title: Inspector
description: The right panel's tabs and frame sections, Slides and Export, selection colors, and the number field every control shares
---

# Inspector

## Overview

Owns the right panel's shell and its frame-level controls, being the tabs, the frame sections, Slides, Export, selection colors, and the number field every section steps and scrubs with. An element's own sections, and what a hand edit writes into a frame, are in `canon/context/board/inspector/element.md`.

## Layout

### `src/client/board/inspector/`

Owns the right panel, under a header of the avatar and the zoom level, and its controls.

- **Tabs:** `tabs.tsx` splits the panel into Design, Slides, and Export with the left panel's trigger classes, and `panel.tsx` routes each section. The Frame tool and Play draw no strip.
- **Held tab:** `tab-store.ts` keeps the picked tab across selections for the page's life and saves nothing, so a reload opens Design. Export reads one line where no single frame or element is selected.
- **Label tips:** `label-tip.tsx` puts a mark beside a label that shows its sentence on hover and keyboard focus, and keeps the sentence in a hidden node the control names in `aria-describedby`
- **Frame size:** the `Frame ⌄` heading opens the Frame tool's sizes and names the matched row, `Custom`, or `Mixed` on its right. A pick sets W and H in one write.
- **Frame and several frames:** name, position, and size, and for several the shared position and size with an Arrange button per align and distribute key.
- **Height:** a Fixed, Fit, and Scroll radio row under the size fields, read off `scroll` and `hugHeight`, checking none and reading `Mixed` where frames differ.
- **Height write:** a pick writes every frame through `POST /api/frame/height` as one undo step, and a refusal puts the stored mode back. The menu's and palette's Fit height run that route too.
- **Device:** a None, Phone, and Tablet radio row under Height, drawn through the same `ChoiceRow`, writing every frame through `POST /api/frame/device` as one undo step
- **This slide:** a Slides menu reading Same as page, a built-in, or a project's own from `transition-names.ts`, writing every frame through `POST /api/frame/transition` as one undo step
- **Page:** `page-section.tsx` ends Slides with Slide transition, Direction, and Duration, each pick writing `POST /api/page/transition` and keeping the other two
- **Frame fill:** one frame alone adds the element Fill row, writing its `body`'s `background-color` as an element edit. A file stating no `body` refuses it.
- **Preview:** a row under the size fields shows every selected frame at a preset or scrubbed width, with End preview. It writes nothing, and W keeps reading the stored width.
- **Preset range:** phone, tablet, and desktop each read a width range, so a toggle presses while every shown width fits and a click keeps a fitting width rather than the default.
- **Linked widths:** one frame adds Also shows at under Preview, a chip per width with a remove button and a plus offering the Phone, Tablet, and Desktop sizes it neither holds nor lists
- **Widths write:** each change writes the whole list through `POST /api/frame/widths` as one undo step, refusing `stale-layout` when the stored list differs from the drawn one
- **Phone link:** one frame's Export tab ends with Open on a phone, a card that starts the link through `POST /api/preview` and shows it as a code and text, ending it by token on close
- **Motion:** a frame whose live page runs a timeline adds play, the time in seconds, and a scrub track under Fill on Design, moving the page in this tab and writing nothing
- **Filmstrip:** its own Export section, offering 2 to 12 moments whose strip fits the screenshot limit at the Export scale, and disabled for a frame that repeats forever
- **Export:** the Export tab for one frame alone or one element carries scale and theme menus, a Name field, a button, and one line per file. Every theme renders before any file downloads.
- **Export name:** the field starts as the frame's name, or `<frame>-<element>` in kebab case from the Layers row, and an emptied field falls back to it. Slashes become dashes and leading dots drop.
- **Element export:** asks the PNG route for `element` and `hash`, the selection's address, and shows no Include device switch
- **Include device:** a frame holding a device adds a switch, off until picked, that asks the PNG route for the frame inside its body
- **Selection colors:** last, the colors the selection uses, raw first, five rows until `Show all`, which a new selection closes. A row copies its hex or its token's `var()`.
- **Replace:** a raw row's swatch lists the color tokens nearest first, and a pick posts `POST /api/frames/recolor`, swapping that value inline across the selection as one undo step.
- **Use a token:** an opaque raw value whose red, green, and blue equal an opaque token's in the shown theme offers `Use <token>` after its percent, naming the first in sheet order.
- **Select:** over a row's percent, short of any `Use <token>`, it shows on hover and keyboard focus, selecting every element the read's `uses` names, under `<n> elements · using <color>`.
- **Where Select is absent:** a selection spanning several frames offers none.
- **What `uses` names:** an element inheriting the color as well as one stating it, and never `body`, which selects as the frame, or one drawing no box, such as `br` or `script`.

An element selected inside a frame shows the frame as one row under the tab strip, its name selecting the frame, in place of the Frame section. A frame's findings show only in its label's badge popover. Stroke's `+` writes `border: 1px solid var(--border)`, else the first color token, else `#808080` in a project naming no color token.

- Under the Frame tool it lists the presets and devices as radio rows under Phone, Tablet, Desktop, Slide, Social, and Video in place of the selection, and the chosen row is what the next click places
- One selected frame's name renames in place on a click, through the same rename the layers row runs

Every number is `number-field.tsx`, on base-ui's `NumberField`. ArrowUp and ArrowDown step it, by ten with Shift, and a drag on its prefix zone or caption scrubs it. A step on a `Mixed` frame value moves each frame by the step from its own.

- The prefix sits in a full-height zone at least 24px wide, and a fill or stroke opacity with no room for one scrubs from a drag on the number while a click still types
- A step or a scrub previews first, a frame at its pending box and an element through an inline style on its live node, and writes once on the arrow's keyup or the scrub's release
- Esc during either puts the stored value back and writes nothing, and a refused write puts back the preview too

## Gotchas

The number field works around two base-ui behaviors.

- base-ui commits a keyboard step on every press, so the field steps on its own keys and takes base-ui's commit only for a scrub release
- base-ui reformats a typed number only on blur, so Enter blurs the field and focuses it again, else a refused value stays shown
