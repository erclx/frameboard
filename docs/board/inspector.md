---
title: Inspector
description: The Design tab, layout, position, every number field, the color picker, and selection colors
---

# Inspector

The right panel's Design tab edits what is selected, and each edit writes ordinary CSS into the frame.

## Design tab

- The inspector's Design tab edits a frame's fill and kit, None taking the kit off, and an element's opacity, radius, rotation, flip, 3D tilt, type, case, truncation, line height, letter spacing, fill, stroke, shadow, and text
- Its Layout section sets a container's flow, gap, alignment, and padding, and a child's size as Fixed, Hug, or Fill, on that element alone even where a shared rule sets the flow
- Use auto layout in the Layout header, or Shift+A, wraps the selected elements in one flow container named Container, a row or a column by how they sit, when they share one parent
- Position's Absolute takes an element out of the flow where it rendered, its X and Y or a drag move it inside its parent, and its right-click menu brings it to the front or back
- Every inspector number steps on arrows and scrubs from its label

## Colors

The color picker holds a hex field, opacity, and token swatches. A raw color equal to a token in the shown theme offers `Use <token>` on its row, and Stroke's `+` writes a grey `#808080` where the project names no color token.

Selection colors lists every color the selection uses, and a raw color's swatch, or its `Use <token>`, swaps it for a token on each element setting it inline, as one undo step. Select on a hovered or focused row selects the elements within the selection using that color.
