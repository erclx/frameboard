---
title: Placing elements
description: The Text, Shape, and Image tools, where a new element lands in a frame, and the drop of an asset tile
---

# Placing elements

## Overview

Owns dropping a new element into a frame, being the placement tools, the cues that show where it lands, and a file placed from the project's assets. Moving and resizing an element once placed is in `canon/context/board/hand-actions.md`, and the Position row that moves it in or out of the flow in `canon/context/board/inspector-element.md`.

## Layout

### `src/client/board/place/`

Owns the Text, Shape, and Image tools, keys T, R, O, L, and Cmd+Shift+K, which drop one new element into a frame at the click and move nothing else, and the drop of a selected element a Move drag carries or an Assets tile, which over bare canvas makes a frame of its own.

- `gap.ts` reads the container and the sibling gap under the pointer from the live DOM, along x in a flex row or a grid and along y otherwise, as the insert route's file indices
- A point over a leaf, an inline element, an element holding text, an empty box, or anything in an SVG takes its parent and the gap beside it, so a click on a placed shape lands beside it

Two cues show where a placement lands before it does.

- `drop-line.tsx` draws a 2px selection-blue line at that gap while a tool is on, an element is carried, or a tile is dragged, never over bare canvas, a loading frame, or a carried element's own spot
- `drop-ghost.tsx` draws the frame a dragged tile would make over bare canvas, a dashed box the file's size holding `New frame` and that size under the frame's name, once the size is read
- `write.ts` posts the kind, never markup, behind any element edit queued on the frame, then selects the new element and returns to Move, and sends nothing to a frame another session holds
- A placed Text opens in place with its word selected, so typing replaces it, through `src/client/board/element/text-in-place.ts`
  - Enter and Shift+Enter add a line, and Esc or a click outside writes the text
  - A break is a newline in the element's one text node, never a `<br>`, and goes out with `white-space: pre-line` in the same write on an element that collapses newlines

`placesFree` in `tool.ts` decides whether a new element lands free at the drawn point, sending `at`, or joins the flow at the gap. It lands free unless the container is flex or grid, or its static parent would move an element anchored above it, and a Divider always joins the flow. The inspector's Position row moves it either way after.

The Image tool and a tile drag place a file from the project's `assets/`.

- `asset-picker.tsx`, opened from the Shape menu's Image, video, or audio row, lists the project's images, GIFs, SVGs, videos, and audio and arms the Image tool with the one chosen
- An asset posts its path under `assets/` and a size from `asset-size.ts`, its own capped at the container's width, else 240 by 135
  - The server picks `<img>`, `<video controls autoplay muted loop playsinline>`, or `<audio controls>`
- An image, GIF, SVG, video, or audio tile in the Assets tab drags while the tab may write, carrying the data `src/client/board/assets/drag.ts` shapes
- A video tile preloads metadata alone, shows its first frame and length, plays muted only while hovered or focused, and names a codec it cannot decode
- `asset-drop.ts` makes the hit layer a drop target for a tile and swallows a system file dropped there, so it never opens in place of the board

A tile released over no frame's box makes a frame of its own, and a hidden or locked frame counts as a frame.

- `placeFileFrame` in `write.ts` adds a frame the file's size centered on the point, named for the file's stem and selected
- `POST /api/frame/add` carries the file as `asset`, so the frame and its media are one write and one undo step, and an audio's frame is 300 wide and hugs the player's height
- The new file's `body` is a column with no margin, so no line box adds a gap under the media

A Rectangle, Ellipse, Image, or Frame drag past 3 screen pixels draws a preview through `shape-draft.tsx`.

- A Rectangle or Ellipse draws as the shape, with its corners and size, and draws nothing over bare canvas
- Its fill is the token `src/shared/shape-paint.ts` names, read in the frame's own document and theme
- The others draw a tinted box

Shapes and files land at the gap the drag started in, and a frame on a box of at least 40 by 40 screen pixels. Shorter drags, Dividers, and Text stay clicks.

`moveElement` in `write.ts` sends a carried element to the gap under the release, within its own frame.
