---
title: Design kits
description: How a session reads the kit a project draws with, or sets one up, so every frame in that project keeps one look without the developer restating it
---

# Design kits

Read this before the first frame in a project that holds `assets/kit/`, and when the developer asks for a look such as a sketch or a wireframe. Take every file name, verb, and refusal from the `kits` block of `frameboard docs --json`, since it describes the installed version.

## Read the kit before drawing

A kit is board content, not a rule. Its files sit in the project, and the board imports its stylesheet into every frame there after the token sheets.

1. Read `assets/kit/kit.md`, which names the classes to reach for and what to keep to in this look.
2. Read the frames on the project's `kit` page, which draw each part the way the kit means it.
3. Draw with those classes, such as `kit-card`, `kit-note`, `kit-button`, and `kit-line`, and take every color from the kit's tokens through `var()`.

Leave the kit's own styles out of the frame. A frame that copies `kit.css` stops following the kit, and one that sets a filter or a background on a kit box draws over the kit's outline.

## Set one up when asked

- Run `frameboard kit list --json` for the kits this board can install, the shipped ones first
- Run `frameboard kit add <project> <kit> --json` to install one, or `--from <folder>` for a kit folder on disk
- `kit add` refuses `tokens-exist` where a sheet already gives the project its look. Ask the developer before passing `--replace`, which installs over it.
- Run `frameboard kit save <project> <name> --json` when the developer wants a project's look offered to the board's other projects

## Keep a kit's frames passing the checks

The checks read the kit's stylesheet with the token sheets, so a frame leaning on the kit's body font or its colors passes. Capture a kit frame in both themes before handing it back, since a hand drawn outline reads differently on a dark surface.
