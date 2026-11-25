---
title: Slides and decks
description: How a session drawing a deck chooses between a step and a transition, adds a transition of the project's own, and captures a stepped slide
---

# Slides and decks

Read this when the task is about presenting a page, such as a deck, a slide's entrance, or an element a press reveals. Take every attribute, value, range, and refusal from the `present` block of `frameboard docs --json`, since it describes the installed version.

## Choose a step or a transition

A transition and a step answer different questions, so pick by what moves.

- A transition is how a whole slide arrives and leaves. The board draws it from the page's or the frame's layout entry and never writes it into the frame file.
- A step is one element inside a slide that waits for a press. It lives in the frame file as attributes on that element, set with `frameboard edit --attr`.
- Reach for a step when a slide builds up point by point, and for a transition when the deck moves between ideas
- Set a transition on the page so every slide shares it, and on one frame only when that slide arrives differently

## Time a step and start its clip

A step plays at the block's default length with no wait, so write a time only where the default reads wrong.

- Give a step its own `data-step-duration` when its entrance carries the point, such as a wipe across a chart, and leave a list's points at the default
- Give one a `data-step-delay` when the audience needs a beat before it, and prefer `data-step-start="after"` over a delay guessed at the length of the step before
- Put `data-step-play` on a video or a model a press reveals, and leave `autoplay` off it, since an autoplaying clip starts at load, before anyone sees it
- Expect the developer to tune these by hand in the Slides tab, where a drag renumbers every step from 1, so read the numbers back before editing one

## Add a slide transition of the project's own

- Write `assets/transitions/<name>.css` holding `@keyframes enter` and optionally `@keyframes leave`, as the `present` block of `frameboard docs` allows
- Set it by name with `frameboard page transition <page> <name>`, or on one slide with `frameboard frame transition <page>/<frame> <name>`
- Run `frameboard check` after the write, since a file breaking the block's rules is refused whole and reported as `transition-file`, and every slide naming it cuts

## Write speaker notes beside the slide

A deck's words for the presenter belong in speaker notes, so keep them out of the slide's own text.

- Set a note with `frameboard frame speaker-notes <page>/<frame> <text>`, which refuses text past the limit in the `present` block of `frameboard docs --json` rather than cutting it
- The note lives on the frame's layout entry and never enters the frame file, so a rewrite of the slide keeps it and a duplicate carries it
- The presenter view's own window shows the note beside the slide, and the slide the audience sees never does, so a note is not a caption
- Write a note for a slide whose point is spoken, and leave the rest bare
- Read a slide's note before rewriting the slide, since the developer may have typed one in the strip under it
- Expect that strip under every slide of the page or none, set by the Notes button in the Slides tab, with a hidden note marked on the slide's label

## Capture a stepped slide

A capture shows every step at once, so a plain capture is the slide at its last press. Check the earlier moments by reading the step numbers back in document order, and ask the developer to press through the slide in present mode when a build's order matters.
