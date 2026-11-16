---
title: Commands
description: The board commands an agent runs to edit, inspect, capture, size, and share frames
---

# Commands

The commands a coding agent runs against the board, with every flag one `frameboard docs` away.

## Editing and inspecting

The `project`, `page`, and `frame` commands manage the board on disk, and `list` shows it. `show` marks several frames, or a page, for the toast to step through and points the open board at the first, or offers Go while you are mid-action or it sits in another project.

- `edit` changes one style, attribute, or text on one element without touching another byte, and `--drop-attr` removes an attribute, such as a boolean `muted`, that `--attr` can only set
- `remove` takes one element and everything inside it out of a frame, given the `--index` and `--hash` that `inspect` reports, and refuses with exit 7 once the file has changed
- `frame add` with no size makes a frame that hugs its content, which a running server measures once it is placed and after each write, and `frame fit` sets a height to its content and keeps it hugging
- `inspect` lists each rendered element with the index `edit` takes, its box, and its computed color and type
- `frameboard docs` prints every command, flag, record shape, and exit code

## Capturing

`capture` writes images of what the board renders.

- `capture` writes PNGs of a frame or page in either theme at 1x to 3x with `--scale`, naming a scaled file `<frame>.<theme>@<n>x.png`, and `--scroll <px>` shoots a scroll frame that far down
- `capture` holds each video on its poster, or on its first frame without one, so two captures match
- A video with no picture is listed under its image's `videos` as `error` or `pending` and never refuses the capture

### Motion

A moving frame captures at chosen moments.

- `capture --at 0,500,1000` holds a frame's motion at each moment in ms and writes `<frame>.at-<ms>.<theme>.png` apiece
- `--filmstrip <n>` writes one image of n moments spaced from start to end
- Both seek `window.__hf` when the page sets it, then `window.__timelines`, then its CSS animations and transitions
- Both refuse `motion-missing` for a scene a script steps on a timer

## Sharing a project

`preview <frame>` prints a link and a code that open the frame's project on a phone on the same Wi-Fi, read only, and `preview --stop` ends it

## Sizes, widths, and devices

A page meant to scroll, such as one with a sticky section, takes `--scroll` on `frame add` or `frame resize`, which holds it at a screen height rather than its full length. A frame already fixed taller than a screen keeps its height, so pass `--height` with the resize.

A responsive page is one frame file shown at several widths, so every fix to the file lands at all of them.

- `--widths 834,390` on `frame add` or `frame resize` draws the frame again at each width, in a row beside it
- Each width hugs its content when the frame does and holds its device height otherwise
- `capture` names each width's image `<frame>@<width>.<theme>.png`, and a browser finding at a width prints as `<path>@<width>`

`frame device <frame-ref> phone`, or `--device phone` on `frame add`, has the board draw a generic phone around the frame, and `tablet` a tablet. The frame file and its size stay as they are, and `none` clears it.

## Design references

`references sync <folder>` fills a folder of design references from the frames its `frames.json` maps, and `--check` exits 14 when the folder has drifted. It needs `oxfmt` installed in that project or beside Frameboard, an optional peer, and prints the install command without it.
