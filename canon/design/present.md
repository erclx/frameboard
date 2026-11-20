---
title: Present
description: A page presented full screen one frame at a time, its step bar and slide overview, and the presenter view
---

# Present

## Sections

### `present`

A page presented full screen one frame at a time, the bar that steps and leaves, and the slide overview.

- Code: `src/client/board/present/`
- States: the hover bar with Presenter view and Full screen, Rotate after the count and in the Play banner for a phone slide, a stepped slide with its dots, the overview grid with the keys' ring and the current slide's Now badge

### `present/presenter`

The presenter view, a second window the presenter reads while the audience sees the slide.

- Code: `src/client/board/present/presenter/`
- States: the slide now at its step, the next slide, the notes, the timer, and the clock
