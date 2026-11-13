---
title: Capture
description: Screenshots of frames and pages in either theme
---

# Capture

## Overview

Owns what an agent sees of a frame without a screen, being PNGs of one frame or a whole page, in either theme or both. Capture runs in a real browser.

## Layout

### `src/server/capture/`

Owns the capture browser, the frame host, the render, the font check, the image and animation waits, the image writer, `fit`, and `inspect`, with the flags and record shapes in `frameboard docs`. The CLI renders through its own loopback host over the frame routes the server mounts, so `capture`, `fit`, and `inspect` need no running server.

- `capture` takes a frame or, with `--page`, every visible frame of a page, since a two-part ref reads as either, and `--composite` places them at their layout positions on the theme's `Canvas`
- A frame opens at layout size from `frameThemeUrl` under an emulated `prefers-color-scheme`, on a host mounting the look and frame routes through `servedFrames`, so the injected script sets the theme
- Every image renders before any is written, under `.run/captures/` as `<project>/<page>/<frame>.<theme>.png`, or `<project>/<page>.<theme>.png` for a composite, `@<n>x` added past `--scale 1`
- `inspect` loads a frame through the same host and `openFrame`, one theme per call, and lists each element with a layout box under the `edit` index, reading the file's hash before and after the load
- `inspect` reports `editable: false` where the browser builds an element the file does not state, such as a `tr` with no `tbody`, since `edit` refuses every index there

Two layout keys add images past the frame's own.

- A frame listing `widths` captures once more per width at that width's height, as `<frame>@<width>.<theme>.png`, and a composite grows its bounds to each frame's `drawnExtent`
- `references sync` maps `<project>/<page>/<frame>@<width>` to one width and captures only the width each value names, matching images by ref and width
- `capture --scroll <px>` shoots a `scroll` frame and each linked width that far down as `<frame>.scroll-<px>.<theme>.png`, refusing `--page` and a frame without the key as `usage`
- Its record's `scrollY` names the offset the browser clamped to

Two flags hold a frame's motion still at moments its timeline names.

- `src/shared/motion.ts` reads `__hf`, then every `__timelines` entry, then `document.getAnimations()`, and `seek.ts` runs it in the page by source text, so it stays self-contained
- `capture --at <ms,...>` writes `<frame>.at-<ms>.<theme>.png` per moment, and `--filmstrip <n>` one `<frame>.filmstrip-<n>.<theme>.png` row from 0 to the end
- Both refuse `--page`, `--scroll`, and each other as `usage`
- The PNG route's `filmstrip=<n>` of 2 or more renders on its own queue, answering `motion-missing` and `motion-unbounded` at 422
- The record's `at` and `moments` name the clamped moments, and its `motion` names the source and the duration, null when every animation repeats forever

The PNG route's `device=1` draws a frame holding a device inside its body on a second page, its corners past the body transparent, and leaves a frame holding none bare. Beside `filmstrip=<n>` it refuses as `usage`, since a filmstrip draws no device.

The server side shares one browser and renders only on demand.

- `createWarmBrowser` keeps one warm browser, shared on separate queues by `GET /api/frames/png` at its `scale` of 1 to 3 or 2 without one, the thumbnail store at scale 0.5, and the browser checker
- The PNG route takes no token, since it shows only what the frame route serves, and its queue holds a looping caller to one tab
- `thumbnails.ts` renders a frame in one theme only when a home view asks, a batch marks only its reloaded frames stale, and a failed render waits for the frame's stamp to change
- The checker opens frames with `fonts: 'wait'`, measuring the fallback, where every capture verb keeps the refusing default
- A font stack opening with a generic, or with the browser default an unstyled frame computes to, asks for no face. The default is probed in the page, so an explicit "Times New Roman" is skipped too

## Gotchas

### Capture

These catch a capture out.

- Capture refuses `font-missing` when a text element's first family is neither a loaded web face nor installed per DevTools `CSS.getPlatformFontsForNode`, so a name the platform aliases reads as missing
- Capture uses the pinned headless shell alone, since an installed Chrome or Edge rasterizes text differently, and without it refuses `browser-not-found` with the install command, downloading nothing
- A frame or composite past 16384 device pixels a side at its scale refuses `capture-too-large`, the route's 422, since Chromium's screenshot surface stops there

### Waits

`openFrame` spends one 10 s load budget on the load, the faces, and the images, then settles animations on what is left.

- Capture refuses `image-missing` for an `<img>` that errored or was still loading when the budget ran out, naming its `src` and element index
- Each image waits on its `decode()`, since one marked `decoding="async"` can be loaded and still paint as an empty box. A lazy image turns eager in the page, never the file
- Under `require`, running animations with a finite end are awaited and never refused. An infinite one is skipped, and a scene stepped by a script timer stays out of reach
- Capture never emulates reduced motion, so a frame meant to capture alike every run shows a still

A seeked shot skips that settle.

- It opens with `motion: 'hold'`, stopping the animation clock before load, so an unfilled entrance that ends during the load stays listed
- It shoots with `animations: 'allow'`, since `disabled` fast-forwards a finite animation and every moment would show its end
- A frame with no timeline to seek refuses `motion-missing`, and a filmstrip of one whose animations all repeat forever refuses `motion-unbounded`

### Inspect

These catch an element address out.

- Inspect prints nothing and refuses `invalid-address` for an index with no layout box, `address-mismatch` when the live tag order leaves the file's, and `stale-address` when the file changed mid-load
- Six readers count elements and cannot share code, being `readTextElements`, `waitForImages`, inspect's, the client pick, and the two browser checks, so `LOOK_MARKER` moves all six
