---
title: Inspector
description: Controls for a selected frame, several frames, or an element, the bar a new control clears, and what a hand edit writes
---

# Inspector

## Overview

Owns the controls the developer edits a selected frame or element with, the bar a new control has to clear, and what a hand edit writes into a frame.

## Layout

- `src/client/` owns the inspector panel
- `src/server/` owns the write a hand edit makes into a frame

### Inspector

- **Frame:** name, position, and size, alone when a whole frame is selected
- **Several frames:** the shared position and size, and Arrange buttons for each align and distribute key, each naming its key on hover
- **Element:** name, opacity, and radius
- **Typography:** size, weight, and alignment
- **Fill:** color, through the browser's own color input with the project's tokens offered first, and fill opacity. On a text element Fill is the text color, and on any other element its background, as in Figma
- **Text:** the element's text, when it holds text only
- **Stroke:** the border's color, through the same token-first color row as Fill, on an element that has a border
- **Shadow:** one of the project's shadow tokens, or none
- **Selection colors:** the colors the frame uses, with token names, and a flag on raw values

### Adding one more control

- A control joins the inspector only when the developer's edit beats asking the agent, and only when it leaves layout alone

## Decisions

### Layout stays with the agent

- Element position, width, height, padding, flex, gap, border width, font family, line height, and letter spacing have no control
- Each is a layout call a prompt makes better, or a number that fights the layout when set by hand

### Hand edits write the element's inline style or text and nothing else

- A token pick writes `var(--token)`, so it keeps following the theme
- A raw value is marked raw
