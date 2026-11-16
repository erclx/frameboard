---
title: Presenting
description: Setting slide transitions and in-slide steps from the CLI, and adding a project transition
---

# Presenting

The commands that set how a page plays as slides.

`page transition <page-ref> fade` sets what the board draws between a page's slides while presenting, one of `none`, `fade`, `slide`, `push`, `zoom`, `flip`, and `dissolve`, or one of the project's own. `frame transition <frame-ref> zoom` sets one slide's own, and `page` in place of a name returns it to its page's.

- `--ms` sets the length from 100 to 5000, and `--direction left`, `right`, `up`, or `down` applies to `slide` and `push` alone
- Both write `layout.json` and never a frame's file
- An element marked `data-step="2"` appears on the second press while presenting, with `data-step-effect` of `appear`, `fade`, `fly`, `wipe`, or `zoom`, and `frameboard edit --attr` writes each
- `data-step-start` of `with` shows a step alongside the one before it and `after` right behind it, and everywhere but present mode every step shows

A project adds a transition of its own as `assets/transitions/<name>.css`, named in lowercase kebab case, and `page transition <page-ref> <name>` sets it with `--ms` and no direction.

- The file holds `@keyframes enter`, optionally `@keyframes leave`, and nothing else
- The board plays those two keyframes and never loads the file itself
- A file holding anything else is refused whole and reported as `transition-file`
