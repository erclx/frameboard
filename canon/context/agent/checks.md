---
title: Checks
description: The content rules Frameboard enforces, the three paths that run them, and a project's own rules
---

# Checks

## Overview

Owns the content rules and where they run. A frame that breaks one is reported without anyone remembering to check, both to the agent straight after its write and on the frame's label on the board.

## Layout

- `src/server/` owns the rules, the runner the server's watcher calls, and the browser-backed rules
- `plugins/frameboard/` owns the hook that runs `check` after an agent writes a frame

### Built-in structure rules

- Page and frame naming, and no folder whose name opens with a dot
- A `head` needs a `body`, and a table needs its `tbody`
- A frame links nothing outside its page except its project's `assets/`, where a stylesheet or file shared between pages lives
- A link into a sibling page's folder is a finding

### Built-in rendering rules

- No clipped content and no scrollbar inside a frame's box
- No assumed viewport, network, or default font
- Both themes defined wherever a frame sets its own colors

### Project rules

- A project may hold a check config adding rules of three kinds, being a minimum font size, no uppercase text, and the fonts allowed
- Without one, the built-in rules alone apply

## Decisions

### Three paths, one rule set

- The `check` verb, the server on every file change it watches, and the plugin hook after every agent write all run the same rules
- The hook hands findings back to the agent in the same turn

### A project rule kind is added only when a real frame needs it

- The three kinds cover the house styles in hand
- A config language that grows ahead of need becomes the design tool Frameboard is not

## Gotchas

- The hook runs on every write, so it runs only the rules that need no browser, and the server runs the rest
- The browserless-checks track settles which rules need no browser
