---
title: Placing elements
description: The Text, Shape, and Image tools, where a new element lands in a frame, and the drop of an asset tile
---

# Placing elements

## Overview

Owns dropping a new element into a frame, being the placement tools, the cues that show where it lands, and a file placed from the project's assets. Moving and resizing an element once placed is in `canon/context/board/hand-actions.md`, and the Position row that moves it in or out of the flow in `canon/context/board/inspector/element.md`.

## Layout

### `src/client/board/place/`

Owns the Text, Shape, and Image tools, keys T, R, O, L, and Cmd+Shift+K, which drop one element into a frame, and the drop of a carried element or Assets tile. `write.ts` posts the kind, never markup, behind any edit queued on the frame, selects the new element, returns to Move, and sends nothing to a frame another session holds.

| Input                                                | Result                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A click, a drag under 3 screen pixels, Text, Divider | One element at the gap `gap.ts` reads under the pointer                                 |
| A Rectangle, Ellipse, Image, or Frame drag past 3 px | A `shape-draft.tsx` preview, then the element at the gap the drag started in            |
| A Frame drag of at least 40 by 40 screen pixels      | A frame on that box                                                                     |
| An asset tile or picker choice over a frame          | `<img>`, `<video controls autoplay muted loop playsinline>`, or `<audio controls>`      |
| An asset tile over no frame's box                    | A frame the file's size named for its stem, one `POST /api/frame/add` and one undo step |
| A carried element released                           | `moveElement` moves it to the gap under the release, within its own frame               |

The rules below decide where a placement lands and what it writes.

- A point over a leaf, an inline element, an element holding text, an empty box, or anything in an SVG takes its parent and the gap beside it, so a click on a placed shape lands beside it
- `placesFree` in `tool.ts` lands an element free at the drawn point unless its container is flex or grid or its static parent would move an element anchored above it, and a Divider joins the flow
- `drop-line.tsx` marks the gap with a 2px selection-blue line, never over bare canvas, a loading frame, or a carried element's own spot, where a tile shows `drop-ghost.tsx`'s frame instead
- A placed Text opens with its word selected, and a line break is a newline in its one text node, never a `<br>`, sent with `white-space: pre-line` in the same write
- An asset's size comes from `asset-size.ts`, capped at the container width, else 240 by 135, and `asset-drop.ts` swallows a system file dropped on the hit layer so it never opens in place of the board
