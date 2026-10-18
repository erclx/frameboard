---
title: Capture
description: Screenshots of frames and pages in either theme
---

# Capture

## Overview

Owns what an agent sees of a frame without a screen, being PNGs of one frame or a whole page, in either theme or both. Capture runs in a real browser.

## Layout

### `src/server/`

Owns the capture browser and the image writer.

- By default each frame of a page gets its own PNG
- `--composite` gives one image of the page with every frame at its layout position, so an agent compares drafts side by side
- A frame hidden on the board is left out of the composite
- `--theme light`, `dark`, or `both` captures the theme asked for, so an agent can check the theme the developer is not looking at

## Gotchas

- Capture refuses a frame naming a font it cannot find, and names the family, rather than rendering the browser's default
- Capture, `inspect`, copy frame as PNG, and the server's layout checks use Playwright's headless shell when present, else the installed Chrome or Edge
- With neither browser present they refuse with the install command, and nothing downloads unasked
