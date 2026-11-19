---
title: Frame views
description: How one frame draws on the canvas past its own box, being its linked widths, its device body, and its scroll rail
---

# Frame views

## Overview

Owns what the canvas draws around one frame beyond the frame itself, being the views at each linked width, the device body with its bar, and the rail of a scroll frame. The canvas, its modes, and the chrome around it sit in `canon/context/board/shell.md`.

## Layout

### `src/client/board/widths/`

Owns `linked-box.tsx`, the views of a frame at each width its entry lists, drawn after the frame in a row past its drawn box, so a drag carries them along.

- A linked box is a view and never a frame. `frameAt` and `framesIn` answer the frame for a point or marquee on one, and `pickAt` reads the frame's own box alone, so no element picks inside it
- It loads the frame's URL at the frame's reload version and theme, flips with it, and in Play takes the pointer while its frame is entered, binding Esc into its window
- Its label names its width and counts the findings tagged with that width, and `mountedRefs` tests `drawnExtent` so a frame and its row mount together
- Its row moves out by a laptop base's reach past the lid, so a linked box taller than the frame never meets the base

### `src/client/board/device/`

Owns `bezel.tsx`, the body around a `device`, `page-colors.ts`, the fill its bar and strips paint, `poses.tsx`, the bar under a selected device, and `turn.ts`, Rotate. All read `src/shared/frame-device.ts`. A board point maps into a device's page through `pageBox`, but the frame and present overlay offset their iframe by `topInset` and `sideInset`.

- The body is a `box-shadow` spread that misses a square corner, so the page rounds to `pageCorners`, square where a status bar or side strip meets it, and other boxes to `screenCorners`
- A laptop's lid is that spread, its chin and base boxes from `laptopParts`, and the body scales with the canvas, its edge one screen pixel at any zoom, taking no pointer events
- The label, the open-alone link, and the rail stand past the border, a laptop's lid, and the In frame tag below the body, a laptop's base, and a linked width draws no device
- Every geometry helper takes the `turn`, so a turned phone or foldable insets a `sideInset` strip on each side edge, and a turned foldable runs its fold across in `foldBand`
- Present and Play show a page-tall phone one screen tall through `shownBox`, centered by `bezelBox` and fit by `bezelReach`

### `src/client/board/scroll/`

Owns `rail.tsx`, the rail a scroll frame draws in Edit 8px past its right edge, or past its device body, at a constant 6px, and `page.ts`, which reads and scrolls the page behind it.

- The rail draws inside the frame's box and each linked box, and only while the page is taller than its box and readable, so a page on another origin draws none
- A frame's rail shows on hover or selection, and a linked box's while its frame is selected, since the pointer marks the frame alone
- The scroll offset lives on the iframe's window and is never written to the layout or to undo

## Gotchas

- A fold, a turn, or naming the foldable that widens a body pushes each frame to its right on its rows by the growth, in one write and undo step, and a shrink or a bare show pushes nothing
