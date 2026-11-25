---
title: Sizes and devices
description: How an agent sets a frame's size, its extra widths, and the device or foldable the board draws it in
---

# Sizes and devices

The `frame add`, `frame resize`, and `frame device` flags that size a frame, show it at several widths, and draw it inside a device.

## Sizes

`frame add` with no size takes one from the frame's name or its content, unless `editing --new` reserved a box for it. A frame whose file went missing keeps the position and device its `layout.json` entry holds, and hugs its content from that entry's box.

- A name ending in the width of a preset or device, such as `overview-390`, fixes that width and turns the device on
- Any other name hugs its content on both axes, which a running server measures once the frame is placed and after each write
- Pass `--width 390` for that width with no device, since a size flag wins over the name

A page meant to scroll, such as one with a sticky section, takes `--scroll` on `frame add` or `frame resize`, which holds it at a screen height rather than its full length. A frame already fixed taller than a screen keeps its height, so pass `--height` with the resize.

## Widths

A responsive page is one frame file shown at several widths, so every fix to the file lands at all of them.

- `--widths 834,390` on `frame add` or `frame resize` draws the frame again at each width, in a row beside it, each inside the device its width names while the frame's device is on
- Each width hugs its content when the frame does and holds its device height otherwise
- `capture` names each width's image `<frame>@<width>.<theme>.png`, and a browser finding at a width prints as `<path>@<width>`

## Devices

`frame device <frame-ref> on`, or `--device on` on `frame add`, has the board draw the frame inside the device its width names, being a phone from 320 to 479 wide, a tablet from 480 to 1023, and a laptop from 1024 up. The frame file and its size stay as they are, and `off` hides it.

- A phone draws a status bar over the top 54 px of the box and lays the page out under it, so a 390 by 844 frame holds a 390 by 790 page
- `capture` draws the bar too, and a hugging height counts it, and `capture --page <page> --composite` draws the body of every device shown
- `--island wide` gives the phone its wide island, and `--island compact` takes it back
- `--turn left` or `--turn right` lays a phone, tablet, or foldable out landscape with no status bar, and `--turn upright` stands it back up. `list --json` reports `turn` while it is turned
- A turned phone or foldable insets its page 54 px from each side edge, so a phone's 844 by 390 box holds a 736 by 390 page clear of the island

The older `phone` and `tablet` read as `on`, and `none` as `off`.

## Foldables

A frame can also name a foldable over the device its width picks, through three flags on the same verb.

- `--foldable` names it and shows it, in the pose nearest the frame's width
- `--pose <closed|half|open>` folds it, setting the box to 466 by 678 closed and 890 by 626 half or open, sides swapped while turned, and writes `layout.json` alone
- `--no-foldable` hands the pick back to the width, and `--pose` on a frame naming no foldable is refused as `usage`
- `list --json` reports `device` as `foldable` and adds `pose`
- A fold or a turn that widens the body shifts each frame to its right on its rows by the growth, so re-run `list --json` before placing a frame beside them
