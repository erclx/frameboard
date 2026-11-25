---
title: Design kits
description: How a session reads the kit a frame names, sets or clears one on chosen frames, and authors a new kit folder, so kit frames and plain frames share one project
---

# Design kits

Read this before drawing a frame whose `list --json` record carries `kit`, when the project holds `assets/kits/`, and when the developer asks for a look such as a sketch or a wireframe. Take every file name, verb, and refusal from the `kits` block of `frameboard docs --json`, since it describes the installed version.

## Know which frames take a kit

A kit is board content, not a rule. Each project keeps the kits it added under `assets/kits/<kit>/`, and a frame draws with one only where its `layout.json` entry names it. The plain frame beside it loads the project's sheets alone.

- Read `kit` on the frame's record and `kits` on its project's record in `frameboard list --json`
- A frame naming a kit the project no longer holds loads no kit sheet, so set it to a kit the project holds or clear it
- The frame file never names its kit, so rewriting the file keeps the choice

## Read the kit before drawing

The board imports the kit's tokens and then its stylesheet into the frame, after the project sheet.

1. Read `assets/kits/<kit>/kit.md`, which names the classes to reach for and what to keep to in this look.
2. Read the sample frames under `assets/kits/<kit>/kit/`, which draw each part the way the kit means it.
3. Draw with those classes, such as `kit-card`, `kit-note`, `kit-button`, and `kit-line`, and take every color from the kit's tokens through `var()`.

Leave the kit's own styles out of the frame. A frame that copies `kit.css` stops following the kit. A kit may draw a box's fill on a layer of its own, as Sketch does, where a background set on the box hides under that fill, so follow what `kit.md` says to set instead.

## Add a kit and set it on frames

Adding a kit changes no frame, so each frame that takes the look is set on its own.

- Run `frameboard kit list --json` for the kits this board offers, the shipped ones first
- Run `frameboard kit add <project> <kit> --json` to copy one into the project, or `--from <folder>` for a kit folder on disk. It leaves the project's token sheets alone.
- Add `--replace` to take a newer copy of a kit the project holds. Every frame keeps its kit, and an edit made inside the old copy is lost.
- Run `frameboard frame kit <page>/<frame> <kit> --json` on each frame that takes the look, and pass `none` in place of the kit to take it off
- Run `frameboard kit remove <project> <kit> --json` only when the developer asks, since it clears the kit from every frame naming it

Set a kit on the frames the developer named and no others.

## Author a new kit when asked

A note asking for a new kit wants a folder, written like any other board content. Write it at `assets/kits/<name>/` in the note's project. The name takes letters, digits, dots, dashes, and underscores, and never `none`, which `frame kit` reads as clearing.

1. Write `kit.json` with `version` set to 1, a `title`, and a `description`.
2. Write `tokens.css` defining the tokens the project's sheet names, in a light block and a dark block, so a kit frame's colors follow the kit in both themes.
3. Write `kit.css` holding the component classes, each named `kit-<part>` and reading its colors through `var()`.
4. Write `kit.md` saying what to reach for and what to keep to, since the next session reads it before drawing.
5. Set the kit on the frame the note is pinned to with `frame kit`, capture that frame in both themes, and look at each image.

Add sample frames under `kit/` beside a `layout.json` when the kit has more parts than one frame shows.

When the developer wants a project's look kept for other projects, run `frameboard kit save <project> <kit> --json`, which saves the project's tokens, kit files, and kit page as a kit the board offers.

## Draw in a project that took its kit earlier

A project holding `assets/kit/kit.json` took one kit for every frame, before a frame could name its own. Every frame there still loads `assets/kit/kit.css`, so read `assets/kit/kit.md` and the project's `kit` page first. An `assets/kit/` folder holding no `kit.json` loads into no frame.

## Keep a kit's frames passing the checks

The checks read a frame's kit sheets with the token sheets, so a frame leaning on the kit's body font or its colors passes. Capture a kit frame in both themes before handing it back, since a hand drawn outline reads differently on a dark surface.
