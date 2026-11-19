---
title: Video and audio
description: When a frame plays a clip or a sound, where the file lives, the four attributes the Video section keeps, and capturing a frame that plays
---

# Video and audio

Read this when a frame plays a clip or a sound, such as a product demo or a background loop. Take the content rules and the capture options from `frameboard docs --json`, since they describe the installed version.

## Keep the file in the project

A frame loads nothing over the network, so place the clip or the sound in the project's `assets/` and write the element's `src` as `../assets/<file>`. Never link a web address.

## Set the four attributes the section keeps

The inspector's Video section switches `controls`, `autoplay`, `loop`, and `muted` on the element, so write those and start nothing from a script.

- Write `controls` for a clip the developer plays by hand, since nothing else on the frame starts it
- Write `autoplay` with `muted` for a clip that starts on its own, since a browser holds back sound that no press asked for
- Write `loop` only for a clip meant to repeat, such as a background
- Draw a sound as `<audio controls>`, since it has no picture and the controls are all the developer sees of it

## Capture a frame that plays

A plain capture shows one moment, so check a clip that moves at a few.

- Capture at several moments with `--at` or `--filmstrip`, and look at each image
- Say in the hand-back which moments you checked, since the clip's own picture changes between them
