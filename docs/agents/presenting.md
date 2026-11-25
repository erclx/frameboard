---
title: Presenting
description: Setting slide transitions, in-slide steps, and speaker notes from the CLI, and adding a project transition
---

# Presenting

The commands that set how a page plays as slides.

`page transition <page-ref> fade` sets what the board draws between a page's slides while presenting, one of `none`, `fade`, `slide`, `push`, `zoom`, `flip`, and `dissolve`, or one of the project's own. `frame transition <frame-ref> zoom` sets one slide's own, and `page` in place of a name returns it to its page's.

- `--ms` sets the length from 100 to 5000, and `--direction left`, `right`, `up`, or `down` applies to `slide` and `push` alone
- Both write `layout.json` and never a frame's file

A step is an element a press reveals, marked by attributes in the frame's file that `frameboard edit --attr` writes.

- An element marked `data-step="2"` shows after step 1 while presenting, with `data-step-effect` of `appear`, `fade`, `fly`, `wipe`, or `zoom`
- `data-step-start` of `with` shows a step alongside the one before it and `after` right behind it, and everywhere but present mode every step shows
- `data-step-duration` sets an entrance's length from 100 to 5000 ms and `data-step-delay` its wait from 0 to 10000 ms, each a whole number
- `data-step-play` on a `video` or `model-viewer` step starts its clip as the step appears to the audience. The clip rests while the step is hidden, and nowhere else plays it.

`frame speaker-notes <frame-ref> "<text>"` sets what the presenter means to say over a slide, kept in `layout.json` and never in the frame's file. Run it with no text to print the note, or with `--clear` to remove it. A note is plain text up to 10,000 characters with its line breaks kept, and a longer one is refused rather than cut.

A project adds a transition of its own as `assets/transitions/<name>.css`, named in lowercase kebab case, and `page transition <page-ref> <name>` sets it with `--ms` and no direction.

- The file holds `@keyframes enter`, optionally `@keyframes leave`, and nothing else
- The board plays those two keyframes and never loads the file itself
- A file holding anything else is refused whole and reported as `transition-file`
