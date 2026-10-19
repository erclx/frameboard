---
title: Capture
description: Screenshots of frames and pages in either theme
---

# Capture

## Overview

Owns what an agent sees of a frame without a screen, being PNGs of one frame or a whole page, in either theme or both. Capture runs in a real browser.

## Layout

### `src/server/capture/`

Owns the capture browser, the frame host, the render, the font check, the image writer, and `fit`, with the flags and record shapes in `frameboard docs`.

- `capture` takes one frame or, with `--page`, every visible frame of a page, since a two-part ref reads as either, and `--composite` places them at their layout positions on the theme's `Canvas`
- The CLI renders through its own loopback host over the frame routes the server mounts, so `capture` and `fit` need no running server
- A frame opens at its layout size from `frameThemeUrl`, so the frame route's injected script sets its root's theme, with `prefers-color-scheme` emulated, off a host mounting the server's look and frame routes through `servedFrames`, and every image renders before any is written
- Images land under the board's `.run/captures/` by default, as `<project>/<page>/<frame>.<theme>.png` and `<project>/<page>.<theme>.png` for a composite
- The server keeps one browser warm behind `GET /api/frames/png`, launched on the first request, rendering one frame at a time at scale 2

## Gotchas

- Capture refuses `font-missing` when a text element's first family neither loaded as a web face nor is installed, while a stack opening with a generic asks for nothing
- An installed family is read through DevTools `CSS.getPlatformFontsForNode`, so a CSS name the platform aliases to another face reads as missing
- Capture uses the pinned headless shell alone, since an installed Chrome or Edge rasterizes text differently, and without it refuses `browser-not-found` with the install command, downloading nothing
- A composite past 16384 px a side refuses `capture-too-large`, since Chromium's screenshot surface stops there
- The PNG route takes no token, since it shows only what the frame route serves, and its queue holds a looping caller to one tab
