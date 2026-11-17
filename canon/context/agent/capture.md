---
title: Capture
description: Screenshots of frames and pages in either theme
---

# Capture

## Overview

Owns what an agent sees of a frame without a screen, being PNGs of one frame or a whole page, in either theme or both. Capture runs in a real browser.

## Layout

### `src/server/capture/`

Owns the capture browser, the frame host, the render, the font check, the image, video, and animation waits, the image writer, `fit`, and `inspect`, with the flags and record shapes in `frameboard docs`. The CLI renders through its own loopback host over the frame routes the server mounts, so `capture`, `fit`, and `inspect` need no running server.

| Surface                       | What it renders                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `capture <frame>`             | One image per theme under `.run/captures/`, `@<n>x` past `--scale 1`, refusing past 16384 px a side  |
| `capture --page --composite`  | Every visible frame of the page placed at its layout position on the theme's `Canvas`                |
| Linked `widths`               | One more image per width as `<frame>@<width>.<theme>.png`, a composite growing to `drawnExtent`      |
| `capture --scroll <px>`       | A `scroll` frame and its widths that far down, the record's `scrollY` naming the clamped offset      |
| `capture --at`, `--filmstrip` | The frame at each moment, or one row of n moments, refusing `--page`, `--scroll`, and each other     |
| `inspect`                     | Each element with a layout box under the `edit` index, `editable: false` where the browser built one |
| `GET /api/frames/png`         | The warm renderer at `scale` 1 to 3, with `device=1`, `filmstrip=<n>`, or `element` and `hash`       |
| Thumbnails                    | One theme at scale 0.5 only when a home view asks, a failed render waiting for a new stamp           |

The rules below are what the surfaces share.

- A frame opens at layout size from `frameThemeUrl` under an emulated `prefers-color-scheme`, on a host mounting the routes through `servedFrames`, and every image renders before any is written
- `createWarmBrowser` keeps one browser for the PNG route, the thumbnails, and the browser checker on separate queues, and the route takes no token since it shows only what the frame route serves
- The warm renderer hides drawn controls through one style marked `data-frameboard`, so an element index still counts the file, while `capture`, `fit`, and `inspect` show them
- `src/shared/motion.ts` reads `__hf`, then every `__timelines` entry, then `document.getAnimations()`, and `seek.ts` runs it in the page by source text, so it stays self-contained
- An element shot answers 409 `stale-address` when the hash moved and 422 `invalid-address` for a missing or empty box, and refuses `filmstrip` or `device` beside it as `usage`

## Gotchas

- Capture refuses `font-missing` when a first family is neither a loaded web face nor installed per `CSS.getPlatformFontsForNode`, and a stack opening with a generic asks for no face
- Capture uses the pinned headless shell alone, since an installed Chrome rasterizes text differently, and without it refuses `browser-not-found`, downloading nothing
- `openFrame` spends one 10 s budget on the load, faces, images, and videos, refusing `image-missing` and listing an unloaded video in `videos`, since a video never refuses
- A seeked shot opens with `motion: 'hold'` and shoots with `animations: 'allow'`, since `disabled` fast-forwards a finite animation and every moment would show its end
- Eight readers count elements and share no code, from `readTextElements` to the client pick and two browser checks, and `LOOK_MARKER` moves all eight
