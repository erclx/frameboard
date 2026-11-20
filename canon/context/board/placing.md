---
title: Placing elements
description: The Text, Shape, and Image tools, where a new element lands in a frame, and the drop of an asset tile
---

# Placing elements

## Overview

Owns dropping a new element into a frame, being the placement tools, the cues that show where it lands, and a file placed from the project's assets. Moving and resizing an element once placed is in `canon/context/board/hand-actions.md`, and the Position row that moves it in or out of the flow in `canon/context/board/inspector/element.md`.

## Layout

### `src/client/board/place/`

Owns the Text, Shape, and Image tools, keys T, R, O, L, and Cmd+Shift+K, which drop one element at the gap `gap.ts` reads, and the drop of a carried element or Assets tile, which over bare canvas makes a frame of its own. `write.ts` posts the kind, never markup, in the frame's turn, then selects the new element and returns to Move.

- A point over a leaf, an inline element, an element holding text, an empty box, or anything in an SVG takes its parent and the gap beside it, so a click on a placed shape lands beside it
- `placesFree` in `tool.ts` lands an element free at the drawn point unless its container is flex or grid or its static parent would move an element anchored above it, and a Divider joins the flow
- `drop-line.tsx` marks the gap with a 2px blue line, never over bare canvas, a loading frame, or a carried element's own spot, and gives way to `drop-ghost.tsx` where a tile or a free click lands
- A placed Text opens as an empty `p`, read as text-only, under a bare caret, deleted left blank once the edit ends or the page leaves. A break is a newline, never a `<br>`, with `white-space: pre-line`
- `asset-size.ts` caps a file at its container and, placed free, at the frame past the point, and `asset-drop.ts` swallows a system file dropped on the hit layer so it never opens in place of the board
