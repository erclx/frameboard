---
title: Drawn controls
description: How a session draws sliders beside an element so the developer tunes it in Play and keeps the values, with the frame left as plain HTML and CSS
---

# Drawn controls

Read this when the developer asks for sliders or other controls that tune an element, such as a photo's brightness or a card's blur. Take every attribute, rule, and refusal from the `controls` block of `frameboard docs --json`, since it describes the installed version.

## Bind a control to a custom property

A control drives a custom property, and the target's own CSS decides what the property changes. The board sets the property live in Play and writes it into the file when the developer keeps it.

1. Give the target a selector that will survive your next rewrite, such as an `id`, and read each property through `var()` with the file's value as the fallback, as in `filter: brightness(var(--brightness, 100%))`.
2. Draw each control as an ordinary `<input type="range">` or `<input type="number">` inside its `<label>`, with `min`, `max`, `step`, and a `value` matching that fallback.
3. Mark it with `data-binds="#photo --brightness"` and `data-unit="%"`, the unit being what the property needs after the bare number. Leave `data-unit` off a property that takes a plain number.
4. Group the controls in one container beside the target, holding the labeled controls alone, so the column hides with them outside the canvas.

Write no script for a control. The board binds it in Play and nothing in the file runs it.

## Know where controls show

- The canvas draws each binding in Edit as a dashed link and a tag, and Play runs it
- An export, a thumbnail, a presented slide, and the phone link hide every control, so the design ships as the target alone
- `frameboard capture` shows the controls, so the images you check show them too

## Keep every binding pointed at its target

`check` reports `binding-target` when a control's selector matches no element or its property does not open with `--`. A rewrite that renames the target's `id` breaks every control bound to it, so carry the selector across, or point each `data-binds` at the new name in the same write.
