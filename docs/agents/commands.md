---
title: Commands
description: The board commands an agent runs to edit, inspect, capture, size, and share frames, and to find or generate images
---

# Commands

The commands a coding agent runs against the board, with every flag one `frameboard docs` away.

## Editing and inspecting

The `project`, `page`, and `frame` commands manage the board on disk, and `list` shows it. `show` marks several frames, or a page, for the toast to step through and points the open board at the first, or offers Go while you are mid-action or presenting, or it sits in another project.

- `edit` changes one style, attribute, or text on one element without touching another byte, and `--drop-attr` removes an attribute, such as a boolean `muted`, that `--attr` can only set
- `remove` takes one element and everything inside it out of a frame, given the `--index` and `--hash` that `inspect` reports, and refuses with exit 7 once the file has changed
- `frame add` with no size hugs the frame's content unless its name ends in a width, and `frame fit` sets a height to its content and keeps it hugging
- `inspect` lists each rendered element with the index `edit` takes, its box, and its computed color and type
- `frameboard docs` prints every command, flag, record shape, and exit code

`project title <name> <title>` gives a project a name a person reads, in any characters, and moves its folder to a safe name made from it. Name the folder `list --json` reports as `name` in the next command.

## Capturing

`capture` writes images of what the board renders. `--all-pages` shoots a whole project in one call, and `--prune` removes every other image of the same theme and kind, frame or composite, under that project's folder in `--out`. Every other file stays, a refused frame changes nothing, and an `--out` in the board is refused.

- `capture` writes PNGs of a frame, page, or project in either theme at 1x to 3x with `--scale`, naming a scaled file `<frame>.<theme>@<n>x.png`, and `--scroll <px>` shoots a scroll frame that far down
- `capture` holds each video on its poster, or on its first frame without one, so two captures match
- `capture` waits for each 3D model to draw, holds its clip at the start, and seeks it with `--at`
- A video or a model with no picture is listed under its image's `videos` or `models` as `error` or `pending` and never refuses the capture

### Motion

A moving frame captures at chosen moments.

- `capture --at 0,500,1000` holds a frame's motion at each moment in ms and writes `<frame>.at-<ms>.<theme>.png` apiece
- `--filmstrip <n>` writes one image of n moments spaced from start to end
- Both seek `window.__hf` when the page sets it, then `window.__timelines`, then its CSS animations and transitions
- Both refuse `motion-missing` for a scene a script steps on a timer

## Sharing a project

`preview <frame>` prints a link and a code that open the frame's project on a phone on the same Wi-Fi, read only, and `preview --stop` ends it

## Sizes, widths, and devices

`frame add` with no size takes one from the frame's name or its content, unless `editing --new` reserved a box for it. A frame whose file went missing keeps the position and device its `layout.json` entry holds, and hugs its content from that entry's box.

- A name ending in the width of a preset or device, such as `overview-390`, fixes that width and turns the device on
- Any other name hugs its content on both axes, which a running server measures once the frame is placed and after each write
- Pass `--width 390` for that width with no device, since a size flag wins over the name

A page meant to scroll, such as one with a sticky section, takes `--scroll` on `frame add` or `frame resize`, which holds it at a screen height rather than its full length. A frame already fixed taller than a screen keeps its height, so pass `--height` with the resize.

A responsive page is one frame file shown at several widths, so every fix to the file lands at all of them.

- `--widths 834,390` on `frame add` or `frame resize` draws the frame again at each width, in a row beside it
- Each width hugs its content when the frame does and holds its device height otherwise
- `capture` names each width's image `<frame>@<width>.<theme>.png`, and a browser finding at a width prints as `<path>@<width>`

### Devices

`frame device <frame-ref> on`, or `--device on` on `frame add`, has the board draw the frame inside the device its width names, being a phone from 320 to 479 wide, a tablet from 480 to 1023, and a laptop from 1024 up. The frame file and its size stay as they are, and `off` hides it.

- A phone draws a status bar over the top 54 px of the box and lays the page out under it, so a 390 by 844 frame holds a 390 by 790 page
- `capture` draws the bar too, and a hugging height counts it
- `--island wide` gives the phone its wide island, and `--island compact` takes it back
- `--turn left` or `--turn right` lays a phone, tablet, or foldable out landscape with no status bar, and `--turn upright` stands it back up. `list --json` reports `turn` while it is turned
- A turned phone or foldable insets its page 54 px from each side edge, so a phone's 844 by 390 box holds a 736 by 390 page clear of the island

The older `phone` and `tablet` read as `on`, and `none` as `off`.

### Foldables

A frame can also name a foldable over the device its width picks, through three flags on the same verb.

- `--foldable` names it and shows it, in the pose nearest the frame's width
- `--pose <closed|half|open>` folds it, setting the box to 466 by 678 closed and 890 by 626 half or open, sides swapped while turned, and writes `layout.json` alone
- `--no-foldable` hands the pick back to the width, and `--pose` on a frame naming no foldable is refused as `usage`
- `list --json` reports `device` as `foldable` and adds `pose`
- A fold or a turn that widens the body shifts each frame to its right on its rows by the growth, so re-run `list --json` before placing a frame beside them

## Images

The `image` commands put a picture into a project's `assets/` with a `<file>.license.json` beside it, which records where it came from.

- `image find "<query>"` searches Openverse for public domain images with no key and writes nothing, and `--credited` adds images that ask only for credit
- `--save <id>` saves one result, and `--name <stem>` names the file, which otherwise takes the query

Generating makes an image nobody licensed, on the developer's own server or key.

- `image generate "<prompt>"` runs on the first ready provider and spends on its key at once, so `--dry-run` answers the provider and price first
- A ComfyUI server at `FRAMEBOARD_COMFYUI_URL` goes first and charges nothing, running FLUX.2 klein 4B or the workflow `--workflow <file>` names
- `image free` unloads that server's model once a batch of runs ends
- `image doctor` reports the GPU, the ComfyUI server's version and the files each bundled workflow lacks, and which keys are set, printing setup steps and installing nothing

## Models

`model find "<query>"` searches Poly Haven's public domain 3D models with no key and writes nothing, listing them with Poly Haven named as their source.

- `--save <number-or-id>` saves one as a single `.glb` with its license file beside it, and `--name <stem>` names the file
- `--size <size>` picks the texture size, `1k` by default, and a size the model lacks is refused with the sizes it has

`model generate <picture>` makes a textured `.glb` from one picture on the ComfyUI server at `FRAMEBOARD_COMFYUI_URL`, charging nothing.

- It runs Pixal3D at web size, about 17 MB, or the workflow `--workflow <file>` names, and takes about a minute with no progress line
- The license file names the picture and carries a project asset's own license forward, and `--dry-run` answers without calling the server
- The server keeps the model loaded between runs, so `image free` unloads it once a batch ends

## Fonts

`font find [query]` searches Fontsource with no key and writes nothing, by family name or by a category `--category <category>` names. It lists only families under OFL-1.1, Apache-2.0, or UFL-1.0.

- `--save <number-or-id>` installs one into `assets/fonts/<id>/`, its files as served beside the source's `LICENSE.txt` and a license record, and refuses a family the project holds
- A variable family keeps every weight, and a static one keeps 400 and 700, or the weights `--weights 300,700` names
- A frame then names the family, as `font-family: 'Playfair Display'`, with no link of its own, on the board, in a capture, and on the phone link
- `font list` answers each installed font with its license and the frames drawing text in it
- `font remove <id>` deletes the folder and names the frames left falling back, which `capture` refuses as `font-missing`

## Design references

`references sync <folder>` fills a folder of design references from the frames its `frames.json` maps, and `--check` exits 14 when the folder has drifted. It needs `oxfmt` installed in that project or beside Frameboard, an optional peer, and prints the install command without it. For images alone with no map, use `capture --all-pages`.

A sync leaves a held PNG alone while its frame's HTML, assets, and size stay the same, since a fresh render of the same HTML can differ in its fonts. It reads no token sheet or kit, so pass `--rerender` after editing one to redraw every PNG.
