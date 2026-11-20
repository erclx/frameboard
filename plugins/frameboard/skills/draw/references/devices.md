---
title: Devices
description: When a frame shows a device body, how its width picks a phone, tablet, or laptop, how a phone, tablet, or foldable turns, and how the foldable and its pose set the frame's box
---

# Devices

Read this when the developer wants a screen shown in a phone, a tablet, a laptop, or the foldable. Take the sizes, the body measures, and the refusals from the `showDevice`, `turn`, `foldable`, and `pose` entries of `frameboard docs --json`, since they describe the installed version.

## Show a device only when the body is the point

A device body frames a screen for a viewer who is not the developer, such as a launch page or a deck slide. Leave it off while the screen is still being worked out, since the body takes board space and shows nothing the page lacks.

- The board draws the body around the frame, so the frame file holds no bezel, no status bar, and no mock chrome of its own
- Turning it on or off never changes the frame file or its box, so it is safe to flip at the end
- When the developer wants a frame on their own phone, run `frameboard preview <page>/<frame> --json` with `serve` up, and hand over the link and code it returns for a read only view on the same network

## Let the width pick the device

The frame's width names the device, so choose the size name for the screen first and the body follows.

- A phone, tablet, or laptop is the width's band, and a width below the phone band shows none
- Resize an upright frame to change the device, and never write a second file to show another one. A turned frame keeps the device its upright width picked.
- Place a responsive page once with extra widths, and know that a linked width draws no body

## Name the foldable instead of resizing to it

The foldable is the one device a width does not pick. A frame names it, and its pose sets the box.

- Name it and fold it with `frameboard frame device`, taking the pose names from `docs`
- A pose sets the box's width and height to that screen and turns hugging off, so never resize a foldable by hand to reach a pose
- One file shows every pose, so change the pose rather than copying the frame, and write the page to reflow at each width
- Read the pose back from `list --json`, which reports it on a frame that names the foldable even while the body is hidden

## Turn a device rather than drawing it sideways

`frameboard frame device --turn left` lays the page out landscape at the device's upright height, and `--turn upright` puts it back at the size it held. The frame file never changes, so one file shows both ways.

- Write the page to hold up at the turned width, since a turned phone is about twice as wide as it is tall and its status bar is gone
- Never resize a phone to a landscape width by hand, since that width picks a tablet and draws no turned body
- Lay a turned foldable's inner screen out at 890 by 626 sideways, 626 wide and 890 tall, and its cover screen at 678 by 466, since a fold keeps the turn
- Read the turn back from `list --json`, which reports `turn` while the frame is turned and leaves it out upright
- Take the refusals from the `turn` entry of `docs`, which names the devices and frames that do not turn

## Leave the page's top alone

While an upright phone shows, the board starts the page under a status bar it draws itself, and a turned one draws none. Never pad the top for it, and never state the page's height from the box, since the page's height follows the device and `docs` holds the measure.

## Check it

Capture the frame with its device on and read both themes, since a phone's status bar takes the page's fill and text color.
