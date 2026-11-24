---
title: Capture
description: Screenshots of frames, pages, and projects in either theme
---

# Capture

## Overview

Owns what an agent sees of a frame without a screen, being PNGs of one frame, a whole page, or a whole project, in either theme or both. Capture runs in a real browser.

`capture --all-pages` refreshes a project's archive as images alone, where `references sync` fills a `frames.json` folder with HTML too. `--prune` then removes every other image in the captured themes under `<out>/<project>/`. It keeps the other theme, files no capture names, `assets/`, and anything behind a link, and refuses a folder of the board.

## Layout

### `src/server/capture/`

Owns the capture browser, the frame host, `fit`, and `inspect`, with flags and records in `frameboard docs`. `capture` writes images under `.run/captures/` per theme, width, scroll offset, or moment, and the PNG route and thumbnails share one warm browser, all over a loopback host, so no verb needs a running server.

- A frame opens at layout size from `frameThemeUrl` under an emulated `prefers-color-scheme`, on a host mounting the routes through `servedFrames`, and a call renders every image before writing any
- `createWarmBrowser` keeps one browser for the PNG route, the thumbnails, and the browser checker on separate queues, and the route takes no token since it shows only what the frame route serves
- The warm renderer hides drawn controls through one style marked `data-frameboard`, so an element index still counts the file, while `capture`, `fit`, and `inspect` show them
- `src/shared/motion.ts` reads `__hf`, then every `__timelines` entry, then `document.getAnimations()`, and `seek.ts` runs it in the page by source text, so it stays self-contained
- An element shot answers 409 `stale-address` when the hash moved and 422 `invalid-address` for a missing or empty box, and refuses `filmstrip` or `device` beside it as `usage`

## Gotchas

- Capture refuses `font-missing` when a first family is neither a loaded web face nor installed per `CSS.getPlatformFontsForNode`, and a stack opening with a generic asks for no face
- Capture uses the pinned headless shell alone, since an installed Chrome rasterizes text differently, and without it refuses `browser-not-found`, downloading nothing
- `openFrame` spends one 10 s budget on the load, faces, images, videos, and models, refusing `image-missing` and listing an unloaded video in `videos` and a model in `models`, since neither refuses
- A seeked shot holds the clock and shoots with `animations: 'allow'`, since `disabled` fast-forwards, and no capture emulates reduced motion, so a frame shows its motion
- Eight readers count elements and share no code, from `readTextElements` to the client pick and two browser checks, and `LOOK_MARKER` moves all eight
