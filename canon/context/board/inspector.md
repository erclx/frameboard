---
title: Inspector
description: Controls for a selected frame, several frames, or an element, the bar a new control clears, and what a hand edit writes
---

# Inspector

## Overview

Owns the controls the developer edits a selected frame or element with, the bar a new control has to clear, and what a hand edit writes into a frame.

## Layout

### `src/client/`

Owns the inspector panel. A control joins it only when the developer's edit beats asking the agent and leaves layout alone.

- **Frame and several frames:** name, position, and size, and for several the shared position and size with an Arrange button per align and distribute key
- **Element:** name, opacity, radius, and typography size, weight, and alignment, plus the element's text when it holds text only
- **Fill:** color through the browser's color input with the project's tokens offered first, and fill opacity. On a text element it is the text color, as in Figma.
- **Stroke and shadow:** the border color through the same token-first row, and one of the project's shadow tokens or none
- **Selection colors:** the colors the frame uses, with token names, and a flag on raw values

### `src/server/`

Owns the write a hand edit makes into a frame.

- A hand edit writes the element's inline style or text and nothing else
- A token pick writes `var(--token)`, so it keeps following the theme, and a raw value is marked raw

## Gotchas

- Element position, width, height, padding, flex, gap, border width, font family, line height, and letter spacing have no control
- Each of those is a layout call a prompt makes better, or a number that fights the layout when set by hand
