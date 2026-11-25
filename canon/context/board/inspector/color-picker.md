---
title: Color picker
description: The picker the paint rows and the Theme dialog open, its Custom and Tokens tabs, and when a color it holds is written
---

# Color picker

## Overview

Owns the popover a paint row opens to pick a color, being its Custom and Tokens tabs and the color math behind them. The Fill and Stroke rows that open it are in `canon/context/board/inspector/element.md`, and the Theme dialog that reuses it for a token's value in `canon/context/board/left-panel.md`.

## Layout

### `src/client/board/inspector/element/color-picker/`

Owns the picker's body, which reports every change to the row that opened it and leaves the write to that row. `panel.tsx` draws Custom and Tokens, `area.tsx` the saturation square, and `space.ts` converts between hex, RGB, HSL, and HSV.

- Custom holds the square, hue and opacity bars, a hex field switchable to RGB or HSL, the opacity percent, and the project's tokens as swatches
- Tokens lists the same tokens by name, ringing the one the paint names now. The Theme dialog opens Custom alone, since a token's value is never another token.
- The row previews each change and writes once on Enter or as the picker closes, which a press outside does as it goes down, since a drag fires no click
- Esc writes nothing, and a token swatch writes at once and closes the picker
- `resolveColor` in `space.ts` reads a value through the browser, so a keyword, `rgb()`, or `color-mix()` opens at the color it shows

## Gotchas

- The eyedropper shows only where the browser ships `EyeDropper`, which Chromium does and the DOM typings do not yet carry
